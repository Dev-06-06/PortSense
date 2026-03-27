from datetime import datetime
import os

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError
import yfinance as yf

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.models.holding import HoldingCreate
from app.services.market import get_stock_info


router = APIRouter(tags=["holdings"])


def _get_holdings_collection():
    client = get_mongo_client()
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection not available",
        )

    db_name = os.getenv("MONGO_DB_NAME")
    if db_name:
        db = client[db_name]
    else:
        try:
            db = client.get_default_database()
        except Exception as exc:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Database name is not configured",
            ) from exc

    return db["holdings"]


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
        created_at_value = datetime.utcnow()

    return {
        "id": str(holding.get("_id")),
        "userId": str(holding.get("userId")),
        "ticker": holding.get("ticker", ""),
        "buyDate": buy_date_value,
        "buyPrice": float(holding.get("buyPrice", 0)),
        "quantity": int(holding.get("quantity", 0)),
        "createdAt": created_at_value,
    }


@router.get("/")
async def get_holdings(current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

    holdings = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        stock_info = get_stock_info(holding.get("ticker", ""))

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


@router.post("/")
async def create_holding(payload: HoldingCreate, current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

    ticker = _normalize_ticker(payload.ticker)
    if not _ticker_exists(ticker):
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
        "createdAt": datetime.utcnow(),
    }

    try:
        insert_result = await holdings_collection.insert_one(new_holding)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Holding already exists for this ticker",
        ) from exc

    inserted_holding = await holdings_collection.find_one({"_id": insert_result.inserted_id})
    return _serialize_holding(inserted_holding)


@router.put("/{holding_id}")
async def update_holding(
    holding_id: str,
    payload: HoldingCreate,
    current_user: dict = Depends(get_current_user),
):
    holdings_collection = _get_holdings_collection()

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

    ticker = _normalize_ticker(payload.ticker)
    if not _ticker_exists(ticker):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid ticker",
        )

    update_data = {
        "ticker": ticker,
        "buyDate": datetime.combine(payload.buyDate, datetime.min.time()),
        "buyPrice": payload.buyPrice,
        "quantity": payload.quantity,
    }

    try:
        await holdings_collection.update_one({"_id": object_id}, {"$set": update_data})
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Holding already exists for this ticker",
        ) from exc

    updated_holding = await holdings_collection.find_one({"_id": object_id})
    return _serialize_holding(updated_holding)


@router.delete("/{holding_id}")
async def delete_holding(holding_id: str, current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

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
    return {"message": "Holding deleted"}
