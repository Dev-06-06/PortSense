import asyncio

from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.services.market import get_stock_info

router = APIRouter(tags=["market"])


@router.get("/price/{ticker}")
async def get_ticker_price(
    ticker: str,
    current_user: dict = Depends(get_current_user),
):
    normalized = ticker.strip().upper()
    if not normalized.endswith(".NS"):
        normalized = f"{normalized}.NS"
    info = await asyncio.to_thread(get_stock_info, normalized)
    return {
        "ticker": normalized,
        "currentPrice": info.get("currentPrice", 0.0),
        "previousClose": info.get("previousClose", 0.0),
    }
