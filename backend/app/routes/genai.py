import os

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.config.db import get_mongo_client
from app.middleware.auth import get_current_user
from app.services.analytics import (
    get_benchmark_comparison,
    get_correlation_matrix,
    get_diversification_score,
    get_portfolio_beta,
    get_sector_breakdown,
)
from app.services.gemini import get_correlation_explanation, get_rebalancing_advice
from app.services.market import get_stock_info


router = APIRouter()


class CorrelationExplanationRequest(BaseModel):
    ticker1: str
    ticker2: str
    correlation: float
    strength: str


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


async def _get_user_holdings(user_id):
    holdings_collection = _get_holdings_collection()

    holdings = []
    async for holding in holdings_collection.find({"userId": user_id}):
        ticker = str(holding.get("ticker", "")).strip().upper()
        quantity = int(holding.get("quantity", 0))
        avg_price = float(holding.get("buyPrice", 0.0))

        stock_info = get_stock_info(ticker)
        current_price = float(stock_info.get("currentPrice", 0.0))
        current_value = current_price * quantity

        holdings.append(
            {
                "ticker": ticker,
                "quantity": quantity,
                "avgPrice": avg_price,
                "currentPrice": current_price,
                "currentValue": current_value,
            }
        )

    return holdings


@router.post("/rebalance")
async def rebalance_portfolio(current_user: dict = Depends(get_current_user)):
    holdings = await _get_user_holdings(current_user.get("_id"))
    mongo_client = get_mongo_client()

    sector_breakdown = await get_sector_breakdown(holdings, mongo_client=mongo_client)
    portfolio_beta_data = get_portfolio_beta(holdings)
    diversification_data = get_diversification_score(holdings, sector_breakdown)

    tickers = [
        str(holding.get("ticker", "")).strip().upper()
        for holding in holdings
        if str(holding.get("ticker", "")).strip()
    ]
    correlation_data = get_correlation_matrix(tickers)

    holdings_collection = _get_holdings_collection()
    raw_holdings = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        raw_holdings.append(holding)
    benchmark_data = get_benchmark_comparison(raw_holdings)

    portfolio_data = {
        "holdings": holdings,
        "sector_breakdown": sector_breakdown,
        "portfolio_beta_data": portfolio_beta_data,
        "diversification_data": diversification_data,
        "correlation_matrix": correlation_data,
        "benchmark_comparison": benchmark_data,
        "sector_concentration": sector_breakdown,
        "portfolio_beta": portfolio_beta_data.get("portfolioBeta", "N/A"),
        "beta_label": portfolio_beta_data.get("label", "N/A"),
        "diversification_score": diversification_data.get("score", "N/A"),
        "user_cagr": benchmark_data.get("userCAGR", "N/A"),
        "nifty_cagr": benchmark_data.get("niftyCAGR", "N/A"),
        "correlation_pairs": correlation_data.get("pairs", []),
    }

    advice = get_rebalancing_advice(portfolio_data)
    return {"advice": advice}


@router.post("/explain-correlation")
async def explain_correlation(
    payload: CorrelationExplanationRequest,
    current_user: dict = Depends(get_current_user),
):
    _ = current_user

    explanation = get_correlation_explanation(
        payload.ticker1,
        payload.ticker2,
        payload.correlation,
        payload.strength,
    )
    return {"explanation": explanation}