import asyncio
import traceback

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection

from app.config.db import get_mongo_client
from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.analytics import (
    compute_diversification,
    get_benchmark_comparison,
    get_correlation_matrix,
    get_portfolio_beta,
    get_sector,
)
from app.services.concurrency import gather_in_threads_bounded
from app.services.market import get_stock_info


router = APIRouter()


async def _get_holdings_with_current_values(
    user_id,
    holdings_collection: AsyncIOMotorCollection,
):

    holdings = []
    async for holding in holdings_collection.find({"userId": user_id}):
        holdings.append(holding)

    tickers = [holding.get("ticker", "") for holding in holdings]
    stock_infos = await gather_in_threads_bounded(tickers, get_stock_info, limit=5)

    holdings_with_values = []
    for holding, stock_info in zip(holdings, stock_infos):
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


async def _get_user_tickers(user_id, holdings_collection: AsyncIOMotorCollection):

    tickers = []
    async for holding in holdings_collection.find({"userId": user_id}):
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    return tickers


@router.get("/sectors")
async def sectors_breakdown(
    current_user=Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings = await holdings_collection.find(
            {"userId": current_user["_id"]}
        ).to_list(None)

        if not holdings:
            return {"sectors": []}

        sector_weights = {}
        total_value = 0

        mongo_client = get_mongo_client()
        if mongo_client is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

        for h in holdings:
            ticker = h.get("ticker", "")
            value = h.get("quantity", 0) * h.get("buyPrice", 0)
            sector = await get_sector(ticker, db_client=mongo_client)
            sector_weights[sector] = sector_weights.get(sector, 0) + value
            total_value += value

        if total_value == 0:
            return {"sectors": []}

        return {
            "sectors": [
                {
                    "sector": s,
                    "value": round(v, 2),
                    "weight": round(v / total_value * 100, 1),
                    "isOverweight": (v / total_value * 100) > 30,
                }
                for s, v in sector_weights.items()
            ]
        }

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta")
async def get_beta_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings_with_values = await _get_holdings_with_current_values(
            current_user.get("_id"),
            holdings_collection,
        )
        return await get_portfolio_beta(holdings_with_values)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diversification")
async def get_diversification(
    current_user=Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings = await holdings_collection.find(
            {"userId": current_user["_id"]}
        ).to_list(None)

        if not holdings:
            return {
                "score": 0,
                "sectorScore": 0,
                "stockCountScore": 0,
                "correlationScore": 0,
                "message": "No holdings"
            }

        if len(holdings) < 2:
            return {
                "score": 0,
                "sectorScore": 0,
                "stockCountScore": 0,
                "correlationScore": 0,
                "message": "Add at least 2 stocks to calculate diversification"
            }

        mongo_client = get_mongo_client()
        if mongo_client is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

        result = await compute_diversification(holdings, db_client=mongo_client)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/correlation")
async def get_correlation_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        tickers = await _get_user_tickers(current_user.get("_id"), holdings_collection)
        return await asyncio.to_thread(get_correlation_matrix, tickers)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/benchmark")
async def get_benchmark_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings = []
        async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
            holdings.append(holding)

        return await asyncio.to_thread(get_benchmark_comparison, holdings)
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
