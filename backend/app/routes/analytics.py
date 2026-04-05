import asyncio
import re
import traceback

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection
import pandas as pd
import yfinance as yf

from app.config.db import get_mongo_client
from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.cache import get_cached, set_cached
from app.services.analytics import (
    compute_diversification,
    get_benchmark_comparison,
    get_correlation_matrix,
    get_portfolio_beta,
    get_stock_beta,
    get_sector,
)
from app.services.concurrency import gather_in_threads_bounded
from app.services.market import get_stock_info
from app.services.risk_decomposition import compute_risk_decomposition
from app.services.stress_test import run_stress_test


router = APIRouter()


_NSE_BSE_TICKER_RE = re.compile(r"^[A-Z0-9\-_.]+\.(NS|BO)$")


def _is_market_ticker(ticker: str) -> bool:
    normalized = str(ticker or "").strip().upper()
    if not normalized:
        return False
    if normalized.startswith("^"):
        return True
    return bool(_NSE_BSE_TICKER_RE.fullmatch(normalized))


async def _get_holdings_with_current_values(
    user_id,
    holdings_collection: AsyncIOMotorCollection,
):

    holdings = []
    async for holding in holdings_collection.find({"userId": user_id}):
        holdings.append(holding)

    tickers = [str(holding.get("ticker", "")).strip().upper() for holding in holdings]
    market_tickers = [ticker for ticker in tickers if _is_market_ticker(ticker)]
    stock_infos = await gather_in_threads_bounded(market_tickers, get_stock_info, limit=5)
    stock_info_by_ticker = {
        ticker: info
        for ticker, info in zip(market_tickers, stock_infos)
        if isinstance(info, dict)
    }

    holdings_with_values = []
    for holding in holdings:
        buy_price = float(holding.get("buyPrice", 0) or 0)
        ticker = str(holding.get("ticker", "")).strip().upper()
        stock_info = stock_info_by_ticker.get(ticker, {})
        current_price = float((stock_info or {}).get("currentPrice") or buy_price)

        raw_quantity = holding.get("quantity", 0)
        try:
            quantity = int(float(raw_quantity))
        except (TypeError, ValueError):
            quantity = 0

        if quantity > 0 and current_price <= 0 and buy_price > 0:
            current_price = buy_price

        current_value = current_price * quantity
        if quantity > 0 and current_value <= 0 and buy_price > 0:
            current_value = buy_price * quantity
        holdings_with_values.append(
            {
                "ticker": holding.get("ticker", ""),
                "currentValue": current_value,
                "assetType": holding.get("assetType", "stock"),
            }
        )

    return holdings_with_values


async def _get_user_tickers(user_id, holdings_collection: AsyncIOMotorCollection):

    tickers = []
    async for holding in holdings_collection.find({"userId": user_id}):
        if holding.get("assetType", "stock") != "stock":
            continue
        ticker = str(holding.get("ticker", "")).strip().upper()
        if _is_market_ticker(ticker):
            tickers.append(ticker)

    return tickers


@router.get("/sectors")
async def sectors_breakdown(
    current_user=Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cached = get_cached(user_id, "sectors")
    if cached is not None:
        return cached

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

        tickers = [str(h.get("ticker", "")).strip().upper() for h in holdings]
        sectors = await asyncio.gather(
            *[get_sector(ticker, db_client=mongo_client) for ticker in tickers]
        )

        for h, sector in zip(holdings, sectors):
            ticker = h.get("ticker", "")
            value = h.get("quantity", 0) * h.get("buyPrice", 0)
            sector_weights[sector] = sector_weights.get(sector, 0) + value
            total_value += value

        if total_value == 0:
            result = {"sectors": []}
            set_cached(user_id, "sectors", result)
            return result

        result = {
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
        set_cached(user_id, "sectors", result)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/beta")
async def get_beta_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cached = get_cached(user_id, "beta")
    if cached is not None:
        return cached

    try:
        holdings_with_values = await _get_holdings_with_current_values(
            current_user.get("_id"),
            holdings_collection,
        )
        result = await get_portfolio_beta(holdings_with_values)
        set_cached(user_id, "beta", result)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/diversification")
async def get_diversification(
    current_user=Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cached = get_cached(user_id, "diversification")
    if cached is not None:
        return cached

    try:
        holdings = await holdings_collection.find(
            {"userId": current_user["_id"]}
        ).to_list(None)

        if not holdings:
            result = {
                "score": 0,
                "sectorScore": 0,
                "stockCountScore": 0,
                "correlationScore": 0,
                "message": "No holdings"
            }
            set_cached(user_id, "diversification", result)
            return result

        if len(holdings) < 2:
            result = {
                "score": 0,
                "sectorScore": 0,
                "stockCountScore": 0,
                "correlationScore": 0,
                "message": "Add at least 2 stocks to calculate diversification"
            }
            set_cached(user_id, "diversification", result)
            return result

        mongo_client = get_mongo_client()
        if mongo_client is None:
            raise HTTPException(status_code=500, detail="Database unavailable")

        result = await compute_diversification(holdings, db_client=mongo_client)
        set_cached(user_id, "diversification", result)
        return result

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/correlation")
async def get_correlation_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cached = get_cached(user_id, "correlation")
    if cached is not None:
        return cached

    try:
        tickers = await _get_user_tickers(current_user.get("_id"), holdings_collection)
        result = await asyncio.to_thread(get_correlation_matrix, tickers)
        set_cached(user_id, "correlation", result)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/benchmark")
async def get_benchmark_analytics(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cache_key = f"benchmark_v2_{user_id}"
    cached = get_cached(user_id, cache_key)
    if cached is not None:
        return cached

    try:
        holdings = []
        async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
            holdings.append(holding)

        result = await get_benchmark_comparison(holdings)
        set_cached(user_id, cache_key, result)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stress-test")
async def get_stress_test(
    custom_shock: float | None = None,
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings_with_values = await _get_holdings_with_current_values(
            current_user.get("_id"),
            holdings_collection,
        )

        if not holdings_with_values:
            return {"scenarios": []}

        tickers = [
            str(h.get("ticker", "")).strip().upper()
            for h in holdings_with_values
            if _is_market_ticker(str(h.get("ticker", "")).strip().upper())
        ]

        if not tickers:
            return {"scenarios": []}

        all_tickers = tickers + ["^NSEI"]
        raw = await asyncio.to_thread(
            yf.download,
            all_tickers,
            period="6mo",
            progress=False,
            auto_adjust=True,
        )

        # yfinance may return MultiIndex columns when multiple tickers are requested.
        close_data = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw

        beta_list = await gather_in_threads_bounded(
            tickers,
            lambda ticker: get_stock_beta(ticker, close_data),
            limit=5,
        )
        # Replace None/failed betas with default 1.0
        beta_list = [
            b if isinstance(b, (int, float)) and b > 0 else 1.0
            for b in beta_list
        ]
        betas = dict(zip(tickers, beta_list))

        mongo_client = get_mongo_client()
        results = await run_stress_test(
            holdings_with_values,
            betas,
            db_client=mongo_client,
            custom_shock=custom_shock,
        )
        return {"scenarios": results}

    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/risk-decomposition")
async def get_risk_decomposition(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    user_id = str(current_user.get("_id"))
    cached = get_cached(user_id, "risk-decomposition")
    if cached is not None:
        return cached

    try:
        holdings_with_values = await _get_holdings_with_current_values(
            current_user.get("_id"),
            holdings_collection,
        )
        result = await asyncio.to_thread(compute_risk_decomposition, holdings_with_values)
        set_cached(user_id, "risk-decomposition", result)
        return result
    except Exception as e:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
