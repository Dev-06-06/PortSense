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


router = APIRouter(tags=["holdings"])


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
        "createdAt": created_at_value,
    }


async def _build_enriched_holdings(
    current_user: dict,
    holdings_collection: AsyncIOMotorCollection,
) -> list[dict]:
    db_holdings = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        db_holdings.append(holding)

    tickers = [holding.get("ticker", "") for holding in db_holdings]
    stock_infos = await gather_in_threads_bounded(tickers, get_stock_info, limit=5)

    holdings = []
    for holding, stock_info in zip(db_holdings, stock_infos):
        current_price = float(stock_info.get("currentPrice", 0.0))
        previous_close = float(stock_info.get("previousClose", 0.0))
        quantity = int(holding.get("quantity", 0))
        buy_price = float(holding.get("buyPrice", 0.0))

        current_value = current_price * quantity
        invested = buy_price * quantity
        pnl = current_value - invested
        pnl_percent = (pnl / invested * 100.0) if invested else 0.0
        day_change = (current_price - previous_close) * quantity

        serialized = _serialize_holding(holding)
        serialized.update(
            {
                "currentPrice": current_price,
                "currentValue": current_value,
                "invested": invested,
                "pnl": pnl,
                "pnlPercent": pnl_percent,
                "dayChange": day_change,
            }
        )
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

    ticker = _normalize_ticker(payload.ticker)
    if not await asyncio.to_thread(_ticker_exists, ticker):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticker",
        )

    new_holding = {
        "userId": current_user.get("_id"),
        "ticker": ticker,
        "buyDate": datetime.combine(payload.buyDate, datetime.min.time()),
        "buyPrice": payload.buyPrice,
        "quantity": payload.quantity,
        "createdAt": datetime.now(timezone.utc),
    }

    try:
        insert_result = await holdings_collection.insert_one(new_holding)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Holding already exists for this ticker",
        ) from exc

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
                "quantity": data.quantity,
                "buyDate": datetime.combine(data.buyDate, datetime.min.time()),
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
