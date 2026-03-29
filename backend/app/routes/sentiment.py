from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorCollection

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.sentiment import get_portfolio_sentiment


router = APIRouter()


@router.get("/")
async def get_sentiment(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):

    tickers = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    return await get_portfolio_sentiment(tickers)
