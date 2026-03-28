import os

from fastapi import APIRouter, Depends, HTTPException, status

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.services.analytics import (
    get_benchmark_comparison,
    get_correlation_matrix,
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


async def _get_user_tickers(user_id):
    holdings_collection = _get_holdings_collection()

    tickers = []
    async for holding in holdings_collection.find({"userId": user_id}):
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    return tickers


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
    diversification = get_diversification_score(holdings_with_values, sector_breakdown)

    tickers = [
        str(holding.get("ticker", "")).strip().upper()
        for holding in holdings_with_values
        if str(holding.get("ticker", "")).strip()
    ]
    correlation_result = get_correlation_matrix(tickers)

    pair_correlations = []
    matrix = correlation_result.get("matrix", [])
    for row_index, row in enumerate(matrix):
        for col_index in range(row_index + 1, len(row)):
            pair_correlations.append(float(row[col_index]))

    average_abs_correlation = (
        sum(abs(correlation) for correlation in pair_correlations) / len(pair_correlations)
        if pair_correlations
        else 0.0
    )
    correlation_score = round(10 - (average_abs_correlation * 10), 1)

    sector_score = float(diversification.get("sectorScore", 0.0))
    size_score = float(diversification.get("sizeScore", 0.0))
    diversification_score = round((sector_score + size_score + correlation_score) / 3.0, 1)

    if diversification_score >= 7.0:
        verdict = "Well Diversified"
    elif diversification_score >= 4.0:
        verdict = "Moderate"
    else:
        verdict = "Concentrated"

    diversification["correlationScore"] = correlation_score
    diversification["score"] = diversification_score
    diversification["verdict"] = verdict

    return diversification


@router.get("/correlation")
async def get_correlation_analytics(current_user: dict = Depends(get_current_user)):
    tickers = await _get_user_tickers(current_user.get("_id"))
    return get_correlation_matrix(tickers)


@router.get("/benchmark")
async def get_benchmark_analytics(current_user: dict = Depends(get_current_user)):
    holdings_collection = _get_holdings_collection()

    holdings = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        holdings.append(holding)

    return get_benchmark_comparison(holdings)
