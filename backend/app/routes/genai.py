import asyncio

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel

from app.config.db import get_mongo_client
from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.analytics import (
    get_benchmark_comparison,
    get_correlation_matrix,
    get_diversification_score,
    get_portfolio_beta,
    get_sector_breakdown,
)
from app.services.concurrency import gather_in_threads_bounded
from app.services.gemini import get_correlation_explanation, get_rebalancing_advice
from app.services.market import get_stock_info


router = APIRouter()


class CorrelationExplanationRequest(BaseModel):
    ticker1: str
    ticker2: str
    correlation: float
    strength: str


async def _get_user_holdings(user_id, holdings_collection: AsyncIOMotorCollection):

    raw_holdings = []
    async for holding in holdings_collection.find({"userId": user_id}):
        raw_holdings.append(holding)

    tickers = [str(holding.get("ticker", "")).strip().upper() for holding in raw_holdings]
    stock_infos = await gather_in_threads_bounded(tickers, get_stock_info, limit=5)

    enriched_holdings = []
    for holding, stock_info in zip(raw_holdings, stock_infos):
        ticker = str(holding.get("ticker", "")).strip().upper()
        quantity = int(holding.get("quantity", 0))
        avg_price = float(holding.get("buyPrice", 0.0))
        buy_date = holding.get("buyDate")

        current_price = float(stock_info.get("currentPrice", 0.0))
        current_value = current_price * quantity

        enriched_holdings.append(
            {
                "ticker": ticker,
                "quantity": quantity,
                "avgPrice": avg_price,
                "buyDate": buy_date,
                "currentPrice": current_price,
                "currentValue": current_value,
            }
        )

    return enriched_holdings, raw_holdings


@router.post("/rebalance")
async def rebalance_portfolio(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    enriched_holdings, raw_holdings = await _get_user_holdings(
        current_user.get("_id"), holdings_collection
    )
    mongo_client = get_mongo_client()

    tickers = [
        str(holding.get("ticker", "")).strip().upper()
        for holding in enriched_holdings
        if str(holding.get("ticker", "")).strip()
    ]

    sector_breakdown, portfolio_beta_data, correlation_data, benchmark_data = await asyncio.gather(
        get_sector_breakdown(enriched_holdings, mongo_client=mongo_client),
        get_portfolio_beta(enriched_holdings),
        asyncio.to_thread(get_correlation_matrix, tickers),
        asyncio.to_thread(get_benchmark_comparison, raw_holdings),
    )
    diversification_data = get_diversification_score(enriched_holdings, sector_breakdown)

    portfolio_data = {
        "holdings": enriched_holdings,
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