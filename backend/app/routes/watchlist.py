import asyncio
from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel
from pymongo.errors import DuplicateKeyError
import yfinance as yf

from app.deps import get_watchlist_collection
from app.middleware.auth import get_current_user
from app.services.market import get_stock_info
from app.services.sentiment import _get_stock_sentiment_cached


class WatchlistAdd(BaseModel):
    ticker: str


router = APIRouter(tags=["watchlist"])


def _normalize_ticker(ticker: str) -> str:
    normalized = ticker.strip().upper()
    if normalized.isdigit():
        return normalized
    if not normalized.endswith((".NS", ".BO")):
        normalized = f"{normalized}.NS"
    return normalized


def _serialize_added_at(value: object) -> str:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            value = value.replace(tzinfo=timezone.utc)
        return value.isoformat()
    return datetime.now(timezone.utc).isoformat()


def _build_watchlist_entry(document: dict, stock_info: dict, sentiment: dict) -> dict:
    current_price = stock_info.get("currentPrice")
    previous_close = stock_info.get("previousClose")

    change_rs = None
    change_pct = None
    if current_price is not None and previous_close not in (None, 0):
        change_rs = round(float(current_price) - float(previous_close), 2)
        change_pct = round(
            ((float(current_price) - float(previous_close)) / float(previous_close)) * 100.0,
            2,
        )

    return {
        "ticker": str(document.get("ticker", "")).strip().upper(),
        "addedAt": _serialize_added_at(document.get("addedAt")),
        "currentPrice": float(current_price) if current_price is not None else None,
        "changePct": change_pct,
        "changeRs": change_rs,
        "sentimentBadge": str(sentiment.get("badge", "Neutral")) or "Neutral",
    }


async def _validate_ticker(ticker: str) -> bool:
    if ticker.isdigit():
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(f"https://api.mfapi.in/mf/{ticker}")
                return resp.status_code == 200
        except Exception:
            return False

    def _check() -> bool:
        try:
            t = yf.Ticker(ticker)
            # Use recent history presence as a safer validity signal than fast_info fields.
            hist = t.history(period="5d")
            return hist is not None and not hist.empty
        except Exception:
            return False

    return await asyncio.to_thread(_check)


@router.get("/")
async def get_watchlist(
    current_user: dict = Depends(get_current_user),
    watchlist_collection: AsyncIOMotorCollection = Depends(get_watchlist_collection),
):
    watchlist_docs: list[dict] = []
    async for document in watchlist_collection.find({"userId": current_user["_id"]}):
        watchlist_docs.append(document)

    if not watchlist_docs:
        return []

    tickers = [str(document.get("ticker", "")).strip().upper() for document in watchlist_docs]
    ticker_tasks = [
        asyncio.gather(
            asyncio.to_thread(get_stock_info, ticker),
            asyncio.to_thread(_get_stock_sentiment_cached, ticker),
        )
        for ticker in tickers
    ]
    ticker_results = await asyncio.gather(*ticker_tasks)

    return [
        _build_watchlist_entry(document, stock_info, sentiment)
        for document, (stock_info, sentiment) in zip(watchlist_docs, ticker_results)
    ]


@router.post("/")
async def add_watchlist_item(
    payload: WatchlistAdd,
    current_user: dict = Depends(get_current_user),
    watchlist_collection: AsyncIOMotorCollection = Depends(get_watchlist_collection),
):
    ticker = _normalize_ticker(payload.ticker)

    is_valid = await _validate_ticker(ticker)
    if not is_valid:
        raise HTTPException(
            status_code=404,
            detail=f"Ticker '{ticker}' not found on NSE. Check the symbol and try again.",
        )

    existing = await watchlist_collection.find_one(
        {"userId": current_user["_id"], "ticker": ticker}
    )
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already in watchlist",
        )

    document = {
        "userId": current_user["_id"],
        "ticker": ticker,
        "addedAt": datetime.now(timezone.utc),
    }

    try:
        await watchlist_collection.insert_one(document)
    except DuplicateKeyError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Already in watchlist",
        ) from exc

    return {"message": "Added to watchlist", "ticker": ticker}


@router.delete("/{ticker}")
async def remove_watchlist_item(
    ticker: str,
    current_user: dict = Depends(get_current_user),
    watchlist_collection: AsyncIOMotorCollection = Depends(get_watchlist_collection),
):
    normalized_ticker = ticker.strip().upper()
    await watchlist_collection.delete_one(
        {"userId": current_user["_id"], "ticker": normalized_ticker}
    )
    return {"message": "Removed from watchlist"}