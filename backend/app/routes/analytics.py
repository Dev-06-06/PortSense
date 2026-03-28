import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.services.analytics import (
    get_diversification_score,
    get_portfolio_beta,
    get_sector_breakdown,
)
from app.services.market import get_stock_info


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


async def _get_holdings_with_current_values(user_id):
    holdings_collection = _get_holdings_collection()

    holdings_with_values = []
    async for holding in holdings_collection.find({"userId": user_id}):
        stock_info = get_stock_info(holding.get("ticker", ""))
        current_price = float(stock_info.get("currentPrice", 0.0))
        quantity = int(holding.get("quantity", 0))

        current_value = current_price * quantity
        holdings_with_values.append(
            {
                "ticker": holding.get("ticker", ""),
                "currentValue": current_value,
            }
        )

    return holdings_with_values


@router.get("/sectors")
async def get_sector_analytics(current_user: dict = Depends(get_current_user)):
    holdings_with_values = await _get_holdings_with_current_values(current_user.get("_id"))

    return get_sector_breakdown(holdings_with_values)


@router.get("/beta")
async def get_beta_analytics(current_user: dict = Depends(get_current_user)):
    holdings_with_values = await _get_holdings_with_current_values(current_user.get("_id"))
    return get_portfolio_beta(holdings_with_values)


@router.get("/diversification")
async def get_diversification_analytics(current_user: dict = Depends(get_current_user)):
    holdings_with_values = await _get_holdings_with_current_values(current_user.get("_id"))
    sector_breakdown = get_sector_breakdown(holdings_with_values)
    return get_diversification_score(holdings_with_values, sector_breakdown)
