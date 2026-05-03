import asyncio

from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorCollection
from pydantic import BaseModel

from app.config.db import get_mongo_client
from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.analytics import (
    get_benchmark_comparison,
    compute_correlation_score,
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

    

    # Only pass stock tickers to yfinance
    stock_raw = [
        h for h in raw_holdings
        if str(h.get("assetType", "stock")).strip().lower() == "stock"
    ]
    non_stock_raw = [
        h for h in raw_holdings
        if str(h.get("assetType", "stock")).strip().lower() != "stock"
    ]

    

    stock_tickers = [str(h.get("ticker", "")).strip().upper() for h in stock_raw]
    stock_infos = (
        await gather_in_threads_bounded(stock_tickers, get_stock_info, limit=5)
        if stock_tickers else []
    )

    enriched_holdings = []

    # Enrich stocks with live price
    for holding, stock_info in zip(stock_raw, stock_infos):
        ticker = str(holding.get("ticker", "")).strip().upper()
        quantity = float(holding.get("quantity", 0))
        avg_price = float(holding.get("buyPrice", 0.0))
        current_price = float(stock_info.get("currentPrice", 0.0))
        current_value = current_price * quantity
        enriched_holdings.append({
            "ticker": ticker,
            "quantity": quantity,
            "avgPrice": avg_price,
            "buyDate": holding.get("buyDate"),
            "currentPrice": current_price,
            "currentValue": current_value,
            "assetType": "stock",
        })

    

    # Enrich non-stocks with basic data (no yfinance)
    from app.services.mf import get_mf_nav, _compute_fd_value
    for holding in non_stock_raw:
        asset_type = str(holding.get("assetType", "")).strip().lower()
        ticker = str(holding.get("ticker", "")).strip()
        quantity = float(holding.get("quantity", 0))
        buy_price = float(holding.get("buyPrice", 0.0))

        if asset_type == "mutual_fund":
            nav_data = await get_mf_nav(ticker)
            current_price = float(nav_data.get("currentNav", buy_price) or buy_price)
            current_value = current_price * quantity
            enriched_holdings.append({
                "ticker": nav_data.get("schemeName") or ticker,
                "quantity": quantity,
                "avgPrice": buy_price,
                "buyDate": holding.get("buyDate"),
                "currentPrice": current_price,
                "currentValue": current_value,
                "assetType": "mutual_fund",
                "schemeName": nav_data.get("schemeName") or holding.get("schemeName", ticker),
            })
            
        elif asset_type == "fd":
            buy_date = holding.get("buyDate")
            buy_date_str = (
                buy_date.isoformat() if hasattr(buy_date, "isoformat") else str(buy_date)
            )
            fd_rate = float(holding.get("fdRate", 7.0))
            current_value = _compute_fd_value(buy_price, fd_rate, buy_date_str)
            enriched_holdings.append({
                "ticker": ticker,
                "quantity": quantity,
                "avgPrice": buy_price,
                "buyDate": holding.get("buyDate"),
                "currentPrice": current_value,
                "currentValue": current_value,
                "assetType": "fd",
                "fdRate": fd_rate,
            })
            
        else:
            # FIX: Handle unexpected assetType - treat as fallback asset type
            # This prevents holdings with unexpected assetType from being silently skipped
            
            buy_date = holding.get("buyDate")
            buy_date_str = (
                buy_date.isoformat() if hasattr(buy_date, "isoformat") else str(buy_date)
            )
            # Default to FD if assetType is neither "mutual_fund" nor "fd"
            fd_rate = float(holding.get("fdRate", 7.0))
            current_value = _compute_fd_value(buy_price, fd_rate, buy_date_str)
            enriched_holdings.append({
                "ticker": ticker,
                "quantity": quantity,
                "avgPrice": buy_price,
                "buyDate": holding.get("buyDate"),
                "currentPrice": current_value,
                "currentValue": current_value,
                "assetType": "fd",  # Force to fd as fallback
                "fdRate": fd_rate,
            })

    

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
        and str(holding.get("assetType", "stock")).strip().lower() == "stock"
    ]

    sector_breakdown, portfolio_beta_data, correlation_data, benchmark_data = await asyncio.gather(
        get_sector_breakdown(enriched_holdings, mongo_client=mongo_client),
        get_portfolio_beta(enriched_holdings),
        asyncio.to_thread(get_correlation_matrix, tickers),
        get_benchmark_comparison(raw_holdings),
    )
    diversification_subscores = get_diversification_score(enriched_holdings, sector_breakdown)
    sector_score = float(diversification_subscores.get("sectorScore", 0.0))
    size_score = float(diversification_subscores.get("sizeScore", 0.0))
    correlation_score = await asyncio.to_thread(compute_correlation_score, enriched_holdings)
    diversification_score = round((sector_score + size_score + correlation_score) / 3.0, 1)

    if diversification_score >= 7.0:
        verdict = "Well Diversified"
    elif diversification_score >= 4.0:
        verdict = "Moderate"
    else:
        verdict = "Concentrated"

    diversification_data = {
        "score": diversification_score,
        "sectorScore": sector_score,
        "sizeScore": size_score,
        "correlationScore": correlation_score,
        "verdict": verdict,
    }

    

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

    

    advice = await asyncio.to_thread(get_rebalancing_advice, portfolio_data)
    return {"advice": advice}


@router.post("/explain-correlation")
async def explain_correlation(
    payload: CorrelationExplanationRequest,
    current_user: dict = Depends(get_current_user),
):
    _ = current_user

    explanation = await asyncio.to_thread(
        get_correlation_explanation,
        payload.ticker1,
        payload.ticker2,
        payload.correlation,
        payload.strength,
    )
    return {"explanation": explanation}