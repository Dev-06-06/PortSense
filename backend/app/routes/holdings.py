import asyncio
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pymongo.errors import DuplicateKeyError
import yfinance as yf

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.models.holding import HoldingCreate
from app.services.cache import invalidate_user
from app.services.concurrency import gather_in_threads_bounded
from app.services.market import get_stock_info
from app.services.mf import search_mf_schemes


router = APIRouter(tags=["holdings"])


@router.get("/mf-search")
async def search_mutual_funds(
    q: str,
    current_user: dict = Depends(get_current_user),
):
    """Search mutual fund schemes by name via MFAPI."""
    if not q or len(q.strip()) < 2:
        return []
    results = await search_mf_schemes(q.strip())
    return results


@router.get("/mf-nav/{scheme_code}")
async def get_mf_nav_detail(
    scheme_code: str,
    current_user: dict = Depends(get_current_user),
):
    from app.services.mf import get_mf_nav
    import httpx

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"https://api.mfapi.in/mf/{scheme_code}")
            resp.raise_for_status()
            data = resp.json()

        nav_data = data.get("data", [])
        scheme_name = data.get("meta", {}).get("scheme_name", scheme_code)
        fund_house = data.get("meta", {}).get("fund_house", "")
        scheme_category = data.get("meta", {}).get("scheme_category", "")
        scheme_type = data.get("meta", {}).get("scheme_type", "")

        # Compute returns from NAV history
        returns = {}
        periods = {"1W": 7, "1M": 30, "3M": 90, "1Y": 365}
        if nav_data:
            current_nav = float(nav_data[0]["nav"])
            for label, days in periods.items():
                if len(nav_data) > days:
                    past_nav = float(nav_data[days]["nav"])
                    if past_nav > 0:
                        returns[label] = round(
                            ((current_nav - past_nav) / past_nav) * 100, 2
                        )

        return {
            "schemeName": scheme_name,
            "fundHouse": fund_house,
            "schemeCategory": scheme_category,
            "schemeType": scheme_type,
            "currentNav": float(nav_data[0]["nav"]) if nav_data else 0,
            "navHistory": nav_data[:30],  # Last 30 days
            "returns": returns,
        }

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch MF data: {str(exc)}"
        )


def _normalize_ticker(ticker: str) -> str:
    normalized = ticker.strip().upper()
    if not normalized.endswith(".NS"):
        normalized = f"{normalized}.NS"
    return normalized


def _ticker_exists(ticker: str) -> bool:
    try:
        stock = yf.Ticker(ticker)
        history = stock.history(period="5d")
        return not history.empty
    except Exception:
        return False


def _serialize_holding(holding: dict) -> dict:
    buy_date = holding.get("buyDate")
    if isinstance(buy_date, datetime):
        buy_date_value = buy_date.date().isoformat()
    elif hasattr(buy_date, "isoformat"):
        buy_date_value = buy_date.isoformat()
    else:
        buy_date_value = str(buy_date) if buy_date is not None else None

    created_at = holding.get("createdAt")
    if isinstance(created_at, datetime):
        created_at_value = created_at
    else:
        created_at_value = datetime.now(timezone.utc)

    return {
        "id": str(holding.get("_id")),
        "userId": str(holding.get("userId")),
        "ticker": holding.get("ticker", ""),
        "buyDate": buy_date_value,
        "buyPrice": float(holding.get("buyPrice", 0)),
        "quantity": int(holding.get("quantity", 0)),
        "assetType": holding.get("assetType", "stock"),
        "fdRate": holding.get("fdRate"),
        "fdMaturityDate": holding.get("fdMaturityDate"),
        "schemeName": holding.get("schemeName"),
        "createdAt": created_at_value,
    }


async def _build_enriched_holdings(
    current_user: dict,
    holdings_collection: AsyncIOMotorCollection,
) -> list[dict]:
    from app.services.mf import get_mf_nav, _compute_fd_value

    db_holdings = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        db_holdings.append(holding)

    if not db_holdings:
        return []

    # Separate by asset type.
    # Older records may be missing the assetType field entirely, so we infer it:
    #   - purely-numeric ticker (e.g. "120503") → mutual_fund
    #   - fdRate field present                  → fd
    #   - schemeName field present              → mutual_fund
    #   - everything else                       → stock
    def _infer_type(h: dict) -> str:
        explicit = h.get("assetType")
        if explicit:
            return explicit
        ticker = str(h.get("ticker", ""))
        if ticker.isdigit():
            return "mutual_fund"
        if h.get("fdRate") is not None:
            return "fd"
        if h.get("schemeName"):
            return "mutual_fund"
        return "stock"

    stock_holdings = [h for h in db_holdings if _infer_type(h) == "stock"]
    mf_holdings = [h for h in db_holdings if _infer_type(h) == "mutual_fund"]
    fd_holdings = [h for h in db_holdings if _infer_type(h) == "fd"]

    # Fetch stock prices in parallel (existing pattern)
    stock_tickers = [h.get("ticker", "") for h in stock_holdings]
    stock_infos = await gather_in_threads_bounded(stock_tickers, get_stock_info, limit=5) if stock_tickers else []

    # Fetch MF NAVs in parallel
    mf_navs = await asyncio.gather(
        *[get_mf_nav(str(h.get("ticker", ""))) for h in mf_holdings]
    ) if mf_holdings else []

    holdings = []

    # Process stocks
    for holding, stock_info in zip(stock_holdings, stock_infos):
        current_price = float(stock_info.get("currentPrice", 0.0))
        previous_close = float(stock_info.get("previousClose", 0.0))
        quantity = float(holding.get("quantity", 0))
        buy_price = float(holding.get("buyPrice", 0.0))

        current_value = current_price * quantity
        invested = buy_price * quantity
        pnl = current_value - invested
        pnl_percent = (pnl / invested * 100.0) if invested else 0.0
        day_change = (current_price - previous_close) * quantity

        serialized = _serialize_holding(holding)
        serialized.update({
            "currentPrice": current_price,
            "currentValue": current_value,
            "invested": invested,
            "pnl": pnl,
            "pnlPercent": pnl_percent,
            "dayChange": day_change,
            "assetType": "stock",
        })
        holdings.append(serialized)

    # Process mutual funds
    for holding, nav_data in zip(mf_holdings, mf_navs):
        current_nav = float(nav_data.get("currentNav", 0.0))
        previous_nav = float(nav_data.get("previousNav", current_nav))
        quantity = float(holding.get("quantity", 0))
        buy_nav = float(holding.get("buyPrice", 0.0))

        current_value = current_nav * quantity
        invested = buy_nav * quantity
        pnl = current_value - invested
        pnl_percent = (pnl / invested * 100.0) if invested else 0.0
        day_change = (current_nav - previous_nav) * quantity

        serialized = _serialize_holding(holding)
        serialized.update({
            "currentPrice": current_nav,
            "currentValue": current_value,
            "invested": invested,
            "pnl": pnl,
            "pnlPercent": pnl_percent,
            "dayChange": day_change,
            "assetType": "mutual_fund",
            "schemeName": nav_data.get("schemeName") or holding.get("schemeName", ""),
        })
        holdings.append(serialized)

    # Process FDs
    for holding in fd_holdings:
        buy_price = float(holding.get("buyPrice", 0.0))  # principal
        fd_rate = float(holding.get("fdRate", 7.0))
        buy_date = holding.get("buyDate")
        buy_date_str = buy_date.isoformat() if hasattr(buy_date, "isoformat") else str(buy_date)

        current_value = _compute_fd_value(buy_price, fd_rate, buy_date_str)
        invested = buy_price
        pnl = current_value - invested
        pnl_percent = (pnl / invested * 100.0) if invested else 0.0

        serialized = _serialize_holding(holding)
        serialized.update({
            "currentPrice": current_value,  # FD has no unit price - use total value
            "currentValue": current_value,
            "invested": invested,
            "pnl": pnl,
            "pnlPercent": pnl_percent,
            "dayChange": 0.0,  # FDs don't have day change
            "assetType": "fd",
            "fdRate": fd_rate,
        })
        holdings.append(serialized)

    return holdings


@router.get("/summary")
async def get_holdings_summary(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    holdings = await _build_enriched_holdings(current_user, holdings_collection)

    total_invested = sum(float(holding.get("invested", 0.0)) for holding in holdings)
    total_current_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)
    total_pnl = total_current_value - total_invested
    total_pnl_percent = (total_pnl / total_invested * 100.0) if total_invested > 0 else 0.0

    top_gainer = None
    top_loser = None
    if holdings:
        gainer = max(holdings, key=lambda item: float(item.get("pnlPercent", 0.0)))
        loser = min(holdings, key=lambda item: float(item.get("pnlPercent", 0.0)))
        top_gainer = {
            "ticker": gainer.get("ticker", ""),
            "pnlPercent": float(gainer.get("pnlPercent", 0.0)),
        }
        top_loser = {
            "ticker": loser.get("ticker", ""),
            "pnlPercent": float(loser.get("pnlPercent", 0.0)),
        }

    return {
        "totalInvested": total_invested,
        "totalCurrentValue": total_current_value,
        "totalPnl": total_pnl,
        "totalPnlPercent": total_pnl_percent,
        "topGainer": top_gainer,
        "topLoser": top_loser,
        "holdingCount": len(holdings),
    }


@router.get("/dashboard")
async def get_dashboard(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    holdings = await _build_enriched_holdings(current_user, holdings_collection)

    total_invested = sum(float(h.get("invested", 0.0)) for h in holdings)
    total_current_value = sum(float(h.get("currentValue", 0.0)) for h in holdings)
    total_pnl = total_current_value - total_invested
    total_pnl_percent = (total_pnl / total_invested * 100.0) if total_invested > 0 else 0.0

    top_gainer = None
    top_loser = None
    if holdings:
        gainer = max(holdings, key=lambda h: float(h.get("pnlPercent", 0.0)))
        loser = min(holdings, key=lambda h: float(h.get("pnlPercent", 0.0)))
        top_gainer = {"ticker": gainer.get("ticker"), "pnlPercent": float(gainer.get("pnlPercent", 0.0))}
        top_loser = {"ticker": loser.get("ticker"), "pnlPercent": float(loser.get("pnlPercent", 0.0))}

    return {
        "holdings": holdings,
        "summary": {
            "totalInvested": total_invested,
            "totalCurrentValue": total_current_value,
            "totalPnl": total_pnl,
            "totalPnlPercent": total_pnl_percent,
            "topGainer": top_gainer,
            "topLoser": top_loser,
            "holdingCount": len(holdings),
        },
    }


@router.get("/")
async def get_holdings(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    return await _build_enriched_holdings(current_user, holdings_collection)


@router.post("/")
async def create_holding(
    payload: HoldingCreate,
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    asset_type = payload.assetType or "stock"

    if asset_type == "stock":
        ticker = _normalize_ticker(payload.ticker)
        if not await asyncio.to_thread(_ticker_exists, ticker):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid NSE ticker",
            )
    elif asset_type == "mutual_fund":
        ticker = str(payload.ticker).strip()
        # Validate scheme code exists on MFAPI
        from app.services.mf import get_mf_nav
        nav = await get_mf_nav(ticker)
        if nav.get("currentNav", 0) == 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid MF scheme code. Check MFAPI for valid codes.",
            )
    elif asset_type == "fd":
        ticker = str(payload.ticker).strip().upper()
        if not ticker:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="FD name/bank cannot be empty",
            )
        if not payload.fdRate or payload.fdRate <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="FD rate must be greater than 0",
            )
    else:
        ticker = payload.ticker.strip()

    new_holding = {
        "userId": current_user.get("_id"),
        "ticker": ticker,
        "buyDate": datetime.combine(payload.buyDate, datetime.min.time()),
        "buyPrice": payload.buyPrice,
        "quantity": float(payload.quantity),
        "assetType": asset_type,
        "createdAt": datetime.now(timezone.utc),
    }

    if asset_type == "mutual_fund" and payload.schemeName:
        new_holding["schemeName"] = payload.schemeName
    if asset_type == "fd":
        new_holding["fdRate"] = payload.fdRate
        if payload.fdMaturityDate:
            new_holding["fdMaturityDate"] = datetime.combine(
                payload.fdMaturityDate, datetime.min.time()
            )

    try:
        insert_result = await holdings_collection.insert_one(new_holding)
    except DuplicateKeyError:
        # For FDs, allow duplicates (same bank, different FDs)
        # Remove unique constraint workaround: insert with no duplicate check for FD
        if asset_type == "fd":
            insert_result = await holdings_collection.insert_one(new_holding)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Holding already exists for this ticker",
            )

    inserted_holding = await holdings_collection.find_one({"_id": insert_result.inserted_id})
    invalidate_user(str(current_user.get("_id")))
    return _serialize_holding(inserted_holding)


@router.put("/{holding_id}")
async def update_holding(
    holding_id: str,
    data: HoldingCreate,
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        object_id = ObjectId(holding_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid holding id",
        ) from exc

    result = await holdings_collection.update_one(
        {
            "_id": object_id,
            "userId": current_user.get("_id"),
        },
        {
            "$set": {
                "buyPrice": data.buyPrice,
                "quantity": float(data.quantity),
                "buyDate": datetime.combine(data.buyDate, datetime.min.time()),
                **({"fdRate": data.fdRate} if data.fdRate else {}),
            }
        },
    )

    if result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Holding not found",
        )

    invalidate_user(str(current_user.get("_id")))
    return {"message": "Updated"}


@router.delete("/{holding_id}")
async def delete_holding(
    holding_id: str,
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):

    try:
        object_id = ObjectId(holding_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid holding id",
        ) from exc

    existing_holding = await holdings_collection.find_one({"_id": object_id})
    if existing_holding is None or existing_holding.get("userId") != current_user.get("_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have access to this holding",
        )

    await holdings_collection.delete_one({"_id": object_id})
    invalidate_user(str(current_user.get("_id")))
    return {"message": "Holding deleted"}
