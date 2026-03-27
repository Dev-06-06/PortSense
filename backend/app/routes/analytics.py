import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.services.analytics import get_sector_breakdown
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


@router.get("/sectors")
async def get_sector_analytics(current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

    holdings_with_values = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
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

    return get_sector_breakdown(holdings_with_values)
