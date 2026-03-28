import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.services.sentiment import get_portfolio_sentiment


router = APIRouter()


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


@router.get("/")
async def get_sentiment(current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

    tickers = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    return get_portfolio_sentiment(tickers)
