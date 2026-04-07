import asyncio
import logging
import re
from datetime import date, timedelta
from datetime import datetime
from itertools import combinations

import numpy as np
import pandas as pd
import yfinance as yf
from scipy.optimize import brentq
from cachetools import TTLCache
from motor.motor_asyncio import AsyncIOMotorClient
from app.config.db import get_database_from_client
from app.services.gemini import get_gemini_response

logger = logging.getLogger(__name__)


_NSE_BSE_TICKER_RE = re.compile(r"^[A-Z0-9\-_.]+\.(NS|BO)$")


def _is_yfinance_equity_ticker(ticker: str) -> bool:
    normalized = str(ticker or "").strip().upper()
    if not normalized:
        return False
    if normalized.startswith("^"):
        return True
    return bool(_NSE_BSE_TICKER_RE.fullmatch(normalized))


CANONICAL_SECTORS = {
    "information technology": "IT",
    "software": "IT",
    "technology": "IT",
    "bank": "Banking",
    "financial services": "NBFC",
    "oil": "Energy",
    "power": "Energy",
    "utilities": "Energy",
    "pharmaceutical": "Pharma",
    "healthcare": "Pharma",
    "consumer staples": "FMCG",
    "consumer": "FMCG",
    "steel": "Materials",
    "metals": "Materials",
    "automobile": "Auto",
    "automotive": "Auto",
    "construction": "Infrastructure",
    "diversified": "Conglomerate",
}


def _normalize_sector(raw: str) -> str:
    key = raw.strip().lower()
    for pattern, canonical in CANONICAL_SECTORS.items():
        if pattern in key:
            return canonical
    return raw.strip().title()


def calculate_xirr(cash_flows: list[tuple[datetime, float]]) -> float:
    """
    Calculate XIRR (money-weighted internal rate of return).

    Args:
        cash_flows: list of (date, amount) tuples where:
                   - negative = outflow (cash spent)
                   - positive = inflow (cash received)

    Returns:
        Annualized rate as a decimal (e.g., 0.12 for 12%), or 0.0 if calculation fails
    """
    if len(cash_flows) < 2:
        return 0.0

    dates = [cf[0] for cf in cash_flows]
    amounts = [cf[1] for cf in cash_flows]

    # Use the earliest date as the time reference (t=0)
    t0 = dates[0]
    years = [(d - t0).days / 365.0 for d in dates]

    def npv(rate: float) -> float:
        """Net present value at a given discount rate."""
        return sum(a / (1 + rate) ** t for a, t in zip(amounts, years))

    try:
        # Find the rate where NPV = 0 using Brent's method
        # Try the range [-0.999, 100.0] which covers most real-world returns
        return float(brentq(npv, -0.999, 100.0, maxiter=1000))
    except (ValueError, RuntimeError):
        # If brentq fails (no sign change or other error), return 0.0
        return 0.0


async def get_sector(ticker: str, asset_type: str = "stock", db_client=None) -> str:
    # Short-circuit for non-stock assets.
    normalized = str(ticker or "").strip()
    asset = str(asset_type or "stock").strip().lower()

    if asset == "fd":
        return "Fixed Deposit"
    if asset == "mutual_fund":
        return "Mutual Fund"

    ticker = normalized.upper()
    db = get_database_from_client(db_client) if db_client else None

    if db is not None:
        cached = await db.sector_cache.find_one({"ticker": ticker})
        logger.debug(f"[SECTOR] {ticker} → DB hit: {cached}")
        if cached and cached.get("sector"):
            return cached["sector"]

    try:
        info = await asyncio.to_thread(lambda: yf.Ticker(ticker).info)
        raw = (info.get("sector") or info.get("industryDisp") or "") if info else ""
        logger.debug(f"[SECTOR] {ticker} → yfinance returned: {raw}")
        if raw:
            sector = _normalize_sector(str(raw))
            if db is not None:
                await db.sector_cache.update_one(
                    {"ticker": ticker},
                    {
                        "$set": {
                            "ticker": ticker,
                            "sector": sector,
                            "source": "yfinance",
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                    upsert=True,
                )
            logger.debug(f"[SECTOR] {ticker} → final: {sector}")
            return sector
    except Exception as e:
        logger.warning(f"[SECTOR] yfinance failed for {ticker}: {e}")

    valid = {
        "IT",
        "Banking",
        "Energy",
        "Pharma",
        "FMCG",
        "Auto",
        "Materials",
        "NBFC",
        "Infrastructure",
        "Conglomerate",
    }
    try:
        prompt = (
            f"What sector does {ticker.replace('.NS', '').replace('.BO', '')} "
            f"belong to in the Indian stock market? "
            f"Reply with ONLY one of these exact words: "
            f"IT, Banking, Energy, Pharma, FMCG, Auto, "
            f"Materials, NBFC, Infrastructure, Conglomerate"
        )
        raw = await asyncio.to_thread(get_gemini_response, prompt)
        logger.debug(f"[SECTOR] {ticker} → Gemini returned: {raw}")
        sector = _normalize_sector(raw.strip())
        if sector in valid:
            if db is not None:
                await db.sector_cache.update_one(
                    {"ticker": ticker},
                    {
                        "$set": {
                            "ticker": ticker,
                            "sector": sector,
                            "source": "gemini",
                            "updatedAt": datetime.utcnow(),
                        }
                    },
                    upsert=True,
                )
            logger.debug(f"[SECTOR] {ticker} → final: {sector}")
            return sector
    except Exception as e:
        logger.warning(f"[SECTOR] Gemini failed for {ticker}: {e}")

    logger.debug(f"[SECTOR] {ticker} → final: Other")
    return "Other"


async def get_sector_breakdown(
    holdings: list,
    mongo_client: AsyncIOMotorClient | None = None,
    db_client: AsyncIOMotorClient | None = None,
) -> list[dict]:
    active_db_client = db_client or mongo_client
    total_portfolio_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)

    sectors = []
    for holding in holdings:
        ticker = str(holding.get("ticker", "")).strip().upper()
        sectors.append(
            await get_sector(
                ticker,
                str(holding.get("assetType", "stock")).strip().lower(),
                db_client=active_db_client,
            )
        )

    sector_groups = {}
    for holding, sector in zip(holdings, sectors):
        ticker = str(holding.get("ticker", "")).strip().upper()
        current_value = float(holding.get("currentValue", 0.0))

        if sector not in sector_groups:
            sector_groups[sector] = {
                "sector": sector,
                "totalValue": 0.0,
                "tickers": set(),
            }

        sector_groups[sector]["totalValue"] += current_value
        if ticker:
            sector_groups[sector]["tickers"].add(ticker)

    breakdown = []
    for sector_data in sector_groups.values():
        sector_name = sector_data["sector"]
        percentage = (
            (sector_data["totalValue"] / total_portfolio_value) * 100.0
            if total_portfolio_value > 0
            else 0.0
        )
        is_overweight = percentage > 30.0
        if sector_name in ("Fixed Deposit", "Mutual Fund"):
            is_overweight = False

        breakdown.append(
            {
                "sector": sector_name,
                "totalValue": sector_data["totalValue"],
                "percentage": percentage,
                "tickers": sorted(list(sector_data["tickers"])),
                "isOverweight": is_overweight,
            }
        )

    breakdown.sort(key=lambda item: item["totalValue"], reverse=True)
    return breakdown


_beta_cache: TTLCache = TTLCache(maxsize=100, ttl=1800)


def get_stock_beta(ticker: str, close_data: pd.DataFrame) -> float:
    """
    Compute beta via OLS regression of 6-month daily returns against Nifty 50.
    This is reliable for Indian stocks where yfinance .info["beta"] is often None.
    """
    normalized = ticker.strip().upper()
    if not normalized:
        return 1.0

    try:
        if normalized not in close_data.columns or "^NSEI" not in close_data.columns:
            return 1.0

        combined = close_data[[normalized, "^NSEI"]].dropna()

        if len(combined) < 20:
            return 1.0

        returns = combined.pct_change().dropna()
        stock_ret = returns[normalized].values
        nifty_ret = returns["^NSEI"].values
        nifty_var = float(np.var(nifty_ret))
        if nifty_var == 0:
            return 1.0

        cov = float(np.cov(stock_ret, nifty_ret)[0][1])
        beta = round(cov / nifty_var, 2)
        beta = max(-3.0, min(5.0, beta))

        _beta_cache[normalized] = beta

        logger.debug(f"[BETA] SUCCESS {normalized}: beta={beta}")
        return beta

    except Exception as e:
        logger.error(f"[BETA] EXCEPTION {normalized}: {type(e).__name__}: {e}")
        return 1.0


def invalidate_beta_cache(ticker: str = None):
    if ticker:
        _beta_cache.pop(ticker.strip().upper(), None)
    else:
        _beta_cache.clear()


async def get_portfolio_beta(holdings: list) -> dict:
    valid_holdings = [
        {
            "ticker": str(holding.get("ticker", "")).strip().upper(),
            "currentValue": float(holding.get("currentValue", 0.0)),
            "assetType": str(holding.get("assetType", "stock")).strip().lower(),
        }
        for holding in holdings
        if _is_yfinance_equity_ticker(str(holding.get("ticker", "")).strip().upper())
    ]

    # Only compute beta for stocks.
    stock_only_holdings = [
        holding for holding in valid_holdings if holding.get("assetType", "stock") == "stock"
    ]

    total_value = sum(float(holding.get("currentValue", 0.0)) for holding in stock_only_holdings)

    close_data = None
    if stock_only_holdings:
        all_tickers = [holding["ticker"] for holding in stock_only_holdings] + ["^NSEI"]

        raw = await asyncio.to_thread(
            yf.download,
            all_tickers,
            period="6mo",
            progress=False,
            auto_adjust=True,
        )

        # Flatten MultiIndex
        if isinstance(raw.columns, pd.MultiIndex):
            close_data = raw["Close"]
        else:
            close_data = raw

    beta_results = []
    for holding in stock_only_holdings:
        ticker = holding["ticker"]

        if ticker in _beta_cache:
            beta = _beta_cache[ticker]
        else:
            beta = get_stock_beta(ticker, close_data) if close_data is not None else 1.0
        beta_results.append(beta)

    per_stock = []
    portfolio_beta = 0.0

    for holding, beta in zip(stock_only_holdings, beta_results):
        ticker = holding["ticker"]
        current_value = holding["currentValue"]
        weight = (current_value / total_value) if total_value > 0 else 0.0
        weight_pct = round(weight * 100.0, 1)

        portfolio_beta += weight * beta
        per_stock.append(
            {
                "ticker": ticker,
                "beta": beta,
                "weight": weight_pct,
            }
        )

    if portfolio_beta < 0.8:
        label = "Low Risk"
    elif portfolio_beta <= 1.2:
        label = "Moderate"
    else:
        label = "High Risk"

    logger.info("Portfolio beta perStock rows: %s", per_stock)

    return {
        "portfolioBeta": portfolio_beta,
        "label": label,
        "perStock": per_stock,
    }


async def compute_diversification(holdings: list, db_client=None) -> dict:
    """
    Compute diversification metrics for portfolio holdings.
    
    Args:
        holdings: List of portfolio holdings
        db_client: AsyncIOMotorClient for database operations (optional)
    
    Returns:
        Dictionary containing diversification scores and analysis
    """
    holdings_for_diversification = []
    for holding in holdings:
        ticker = str(holding.get("ticker", "")).strip().upper()
        if not ticker:
            continue

        current_value = float(holding.get("currentValue", 0.0) or 0.0)
        if current_value <= 0:
            quantity = float(holding.get("quantity", 0.0) or 0.0)
            buy_price = float(holding.get("buyPrice", 0.0) or 0.0)
            current_value = quantity * buy_price

        holdings_for_diversification.append(
            {
                "ticker": ticker,
                "currentValue": current_value,
                "assetType": str(holding.get("assetType", "stock")).strip().lower(),
            }
        )

    sector_breakdown = await get_sector_breakdown(
        holdings_for_diversification,
        db_client=db_client,
    )
    diversification = get_diversification_score(holdings, sector_breakdown)
    sector_score = float(diversification.get("sectorScore", 0.0))
    size_score = float(diversification.get("sizeScore", 0.0))
    correlation_score = await asyncio.to_thread(compute_correlation_score, holdings)

    # Recalculate final score with correlation
    diversification_score = round((sector_score + size_score + correlation_score) / 3.0, 1)
    
    if diversification_score >= 7.0:
        verdict = "Well Diversified"
    elif diversification_score >= 4.0:
        verdict = "Moderate"
    else:
        verdict = "Concentrated"
    
    return {
        "score": diversification_score,
        "sectorScore": sector_score,
        "sizeScore": size_score,
        "correlationScore": correlation_score,
        "verdict": verdict,
    }


def compute_correlation_score(holdings: list, close_data: pd.DataFrame = None) -> float:
    stock_holdings = [
        holding
        for holding in holdings
        if str(holding.get("assetType", "stock")).strip().lower() == "stock"
    ]
    normalized_tickers = [
        str(holding.get("ticker", "")).strip().upper()
        for holding in stock_holdings
        if _is_yfinance_equity_ticker(str(holding.get("ticker", "")).strip().upper())
    ]
    unique_tickers = list(dict.fromkeys(normalized_tickers))

    # Neutral score when there is no meaningful pairwise correlation to compute.
    if len(unique_tickers) < 2:
        return 5.0

    try:
        active_close_data = close_data
        if active_close_data is None:
            raw = yf.download(
                unique_tickers,
                period="6mo",
                interval="1d",
                progress=False,
                auto_adjust=True,
            )
            if raw is None or raw.empty:
                return 5.0

            if isinstance(raw.columns, pd.MultiIndex):
                if "Close" not in raw.columns.get_level_values(0):
                    return 5.0
                active_close_data = raw["Close"]
            else:
                active_close_data = raw

        if active_close_data is None or active_close_data.empty:
            return 5.0

        close_by_ticker = {}
        if isinstance(active_close_data.columns, pd.MultiIndex):
            if "Close" in active_close_data.columns.get_level_values(0):
                close_level = active_close_data["Close"]
                for ticker in unique_tickers:
                    if ticker in close_level.columns:
                        close_by_ticker[ticker] = close_level[ticker]
            elif "Close" in active_close_data.columns.get_level_values(1):
                for ticker in unique_tickers:
                    key = (ticker, "Close")
                    if key in active_close_data.columns:
                        close_by_ticker[ticker] = active_close_data[key]
        else:
            if "Close" in active_close_data.columns and len(unique_tickers) == 1:
                close_by_ticker[unique_tickers[0]] = active_close_data["Close"]
            else:
                for ticker in unique_tickers:
                    if ticker in active_close_data.columns:
                        close_by_ticker[ticker] = active_close_data[ticker]

        ordered_tickers = [ticker for ticker in unique_tickers if ticker in close_by_ticker]
        if len(ordered_tickers) < 2:
            return 5.0

        close_df = pd.DataFrame({ticker: close_by_ticker[ticker] for ticker in ordered_tickers})
        returns_df = close_df.pct_change().dropna(how="all")
        if returns_df.empty:
            return 5.0

        pair_abs_correlations = []
        for ticker1, ticker2 in combinations(ordered_tickers, 2):
            pair_returns = returns_df[[ticker1, ticker2]].dropna()
            if len(pair_returns) < 2:
                continue

            correlation_value = pair_returns[ticker1].corr(pair_returns[ticker2])
            if pd.isna(correlation_value):
                continue

            pair_abs_correlations.append(abs(float(correlation_value)))

        if not pair_abs_correlations:
            return 5.0

        average_abs_correlation = sum(pair_abs_correlations) / len(pair_abs_correlations)
        correlation_score = round(10 - (average_abs_correlation * 10), 1)
        return float(max(0.0, min(10.0, correlation_score)))
    except Exception as exc:
        logger.exception("Failed to compute correlation score for holdings: %s", exc)
        return 5.0


def get_diversification_score(holdings: list, sector_breakdown: list) -> dict:
    overweight_sector_count = 0
    for sector in sector_breakdown:
        percentage = float(sector.get("percentage", 0.0))
        if percentage > 25.0:
            overweight_sector_count += 1

    sector_score = max(0.0, 10.0 - (overweight_sector_count * 2.0))

    unique_sectors = {
        str(item.get("sector", "")).strip()
        for item in sector_breakdown
        if str(item.get("sector", "")).strip()
    }

    sector_count = len(unique_sectors)
    if sector_count <= 2:
        size_score = 2.0
    elif sector_count <= 4:
        size_score = 5.0
    elif sector_count <= 6:
        size_score = 7.0
    else:
        size_score = 10.0

    return {
        "sectorScore": sector_score,
        "sizeScore": size_score,
    }


def get_correlation_matrix(holdings_or_tickers: list) -> dict:
    if holdings_or_tickers and isinstance(holdings_or_tickers[0], dict):
        stock_only_holdings = [
            h
            for h in holdings_or_tickers
            if str(h.get("assetType", "stock")).strip().lower() == "stock"
        ]
        normalized_tickers = [
            str(h.get("ticker", "")).strip().upper()
            for h in stock_only_holdings
            if _is_yfinance_equity_ticker(str(h.get("ticker", "")).strip().upper())
        ]
    else:
        normalized_tickers = [
            str(ticker).strip().upper()
            for ticker in holdings_or_tickers
            if _is_yfinance_equity_ticker(str(ticker).strip().upper())
        ]

    unique_tickers = list(dict.fromkeys(normalized_tickers))

    empty_result = {
        "tickers": unique_tickers,
        "matrix": [],
        "pairs": [],
    }

    if len(unique_tickers) < 2:
        return empty_result

    def get_strength(correlation: float) -> str:
        if correlation > 0.7:
            return "Strong Positive"
        if correlation >= 0.3:
            return "Moderate Positive"
        if correlation >= -0.3:
            return "Weak"
        if correlation >= -0.7:
            return "Moderate Negative"
        return "Strong Negative"

    try:
        price_data = yf.download(unique_tickers, period="6mo", interval="1d", auto_adjust=True)
        if price_data is None or price_data.empty:
            return empty_result

        close_by_ticker = {}
        if isinstance(price_data.columns, pd.MultiIndex):
            if "Close" not in price_data.columns.get_level_values(0):
                return empty_result
            close_level = price_data["Close"]
            for ticker in unique_tickers:
                if ticker in close_level.columns:
                    close_by_ticker[ticker] = close_level[ticker]
        else:
            # Single-ticker shape can be OHLC columns with "Close".
            if "Close" in price_data.columns and len(unique_tickers) == 1:
                close_by_ticker[unique_tickers[0]] = price_data["Close"]
            else:
                for ticker in unique_tickers:
                    if ticker in price_data.columns:
                        close_by_ticker[ticker] = price_data[ticker]

        ordered_tickers = [ticker for ticker in unique_tickers if ticker in close_by_ticker]
        if len(ordered_tickers) < 2:
            return {
                "tickers": ordered_tickers,
                "matrix": [],
                "pairs": [],
            }

        close_data = pd.DataFrame({ticker: close_by_ticker[ticker] for ticker in ordered_tickers})
        close_data = close_data[ordered_tickers]

        corr_df = close_data.corr(method="pearson")
        corr_df = corr_df.loc[ordered_tickers, ordered_tickers]

        matrix = []
        for row_ticker in ordered_tickers:
            row_values = []
            for col_ticker in ordered_tickers:
                value = corr_df.at[row_ticker, col_ticker]
                if value != value:  # NaN check
                    value = 0.0
                row_values.append(round(float(value), 2))
            matrix.append(row_values)

        pairs = []
        for ticker1, ticker2 in combinations(ordered_tickers, 2):
            correlation_value = corr_df.at[ticker1, ticker2]
            if correlation_value != correlation_value:  # NaN check
                correlation_value = 0.0
            correlation_value = round(float(correlation_value), 2)
            pairs.append(
                {
                    "ticker1": ticker1,
                    "ticker2": ticker2,
                    "correlation": correlation_value,
                    "strength": get_strength(correlation_value),
                }
            )

        pairs.sort(key=lambda item: abs(item["correlation"]), reverse=True)

        return {
            "tickers": ordered_tickers,
            "matrix": matrix,
            "pairs": pairs,
        }
    except Exception as exc:
        logger.exception("Failed to build correlation matrix for tickers %s: %s", unique_tickers, exc)
        return empty_result


async def get_benchmark_comparison(holdings: list) -> dict:
    try:
        if not holdings:
            return {}

        dated_holdings = []
        for holding in holdings:
            ticker = str(holding.get("ticker", "")).strip().upper()
            asset_type = str(holding.get("assetType", "stock")).strip().lower()
            if asset_type in ("mutual_fund", "fd"):
                continue
            if not _is_yfinance_equity_ticker(ticker):
                continue

            quantity = float(holding.get("quantity", 0.0))
            buy_date_raw = holding.get("buyDate")

            if not ticker or quantity <= 0 or buy_date_raw is None:
                continue

            try:
                if isinstance(buy_date_raw, datetime):
                    buy_date_value = buy_date_raw.date()
                elif isinstance(buy_date_raw, date):
                    buy_date_value = buy_date_raw
                else:
                    # Handle ISO timestamps ending with Z and other string date formats.
                    buy_date_str = str(buy_date_raw).strip()
                    buy_date_str = buy_date_str.replace("Z", "")
                    try:
                        buy_date_value = datetime.fromisoformat(buy_date_str).date()
                    except ValueError:
                        parsed_fallback = None
                        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%Y/%m/%d", "%d/%m/%Y"):
                            try:
                                parsed_fallback = datetime.strptime(buy_date_str, fmt).date()
                                break
                            except ValueError:
                                continue

                        if parsed_fallback is None:
                            # fallback: skip only if completely invalid
                            continue
                        buy_date_value = parsed_fallback
            except Exception:
                # fallback: skip only if completely invalid
                continue

            dated_holdings.append(
                {
                    "ticker": ticker,
                    "quantity": quantity,
                    "buyDate": buy_date_value,
                }
            )

        logger.debug("Valid dated holdings: %s", len(dated_holdings))

        if not dated_holdings:
            return {}

        start_date = min(item["buyDate"] for item in dated_holdings)
        today = date.today()
        if start_date >= today:
            return {}

        end_date = today + timedelta(days=1)
        tickers = list(dict.fromkeys(item["ticker"] for item in dated_holdings))

        all_tickers = tickers + ["^NSEI"]
        all_data = yf.download(
            all_tickers,
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            interval="1d",
            auto_adjust=True,
            progress=False,
        )

        if all_data is None or all_data.empty:
            return {}

        portfolio_data = all_data
        nifty_data = all_data

        if isinstance(all_data.columns, pd.MultiIndex):
            if "^NSEI" in all_data.columns.get_level_values(-1):
                portfolio_data = all_data.loc[:, pd.IndexSlice[:, tickers]]
                nifty_data = all_data.loc[:, pd.IndexSlice[:, ["^NSEI"]]]
            elif "^NSEI" in all_data.columns.get_level_values(0):
                portfolio_data = all_data.loc[:, pd.IndexSlice[tickers, :]]
                nifty_data = all_data.loc[:, pd.IndexSlice[["^NSEI"], :]]
        else:
            if all(ticker in all_data.columns for ticker in all_tickers):
                portfolio_data = all_data[tickers]
                nifty_data = all_data[["^NSEI"]]

        if portfolio_data is None or portfolio_data.empty or nifty_data is None or nifty_data.empty:
            return {}

        if isinstance(nifty_data.columns, pd.MultiIndex):
            try:
                nifty_close = nifty_data["Close"]["^NSEI"]
            except KeyError:
                return {}
        else:
            if "Close" in nifty_data.columns:
                nifty_close = nifty_data.get("Close")
            elif "^NSEI" in nifty_data.columns:
                nifty_close = nifty_data["^NSEI"]
            else:
                nifty_close = None

        if nifty_close is None:
            return {}

        portfolio_close_by_ticker = {}
        if isinstance(portfolio_data.columns, pd.MultiIndex):
            if "Close" not in portfolio_data.columns.get_level_values(0):
                return {}
            close_level = portfolio_data["Close"]
            for ticker in tickers:
                if ticker in close_level.columns:
                    portfolio_close_by_ticker[ticker] = close_level[ticker]
        else:
            if "Close" in portfolio_data.columns and len(tickers) == 1:
                portfolio_close_by_ticker[tickers[0]] = portfolio_data["Close"]
            else:
                for ticker in tickers:
                    if ticker in portfolio_data.columns:
                        portfolio_close_by_ticker[ticker] = portfolio_data[ticker]

        if not portfolio_close_by_ticker:
            return {}

        portfolio_close = pd.DataFrame(
            {ticker: portfolio_close_by_ticker[ticker] for ticker in tickers if ticker in portfolio_close_by_ticker}
        )

        portfolio_close = portfolio_close.reindex(columns=tickers)
        portfolio_close = portfolio_close.ffill().dropna(how="all")
        nifty_close = nifty_close.ffill().dropna()

        if portfolio_close.empty or nifty_close.empty:
            return {}

        # Build portfolio value time series with staggered entry per buy date.
        # Each stock only contributes value from the day it was actually purchased.
        portfolio_value_series = pd.Series(0.0, index=portfolio_close.index)

        for item in dated_holdings:
            ticker = item["ticker"]
            qty = float(item["quantity"])
            buy_date = item["buyDate"]

            if ticker not in portfolio_close.columns:
                continue

            buy_ts = pd.Timestamp(buy_date)
            stock_prices = portfolio_close[ticker].reindex(portfolio_close.index).ffill()
            entry_mask = portfolio_close.index >= buy_ts
            portfolio_value_series.loc[entry_mask] += stock_prices.loc[entry_mask] * qty

        # Drop dates before any stock was purchased.
        portfolio_value_series = portfolio_value_series[portfolio_value_series > 0]
        portfolio_values = portfolio_value_series
        if portfolio_values.empty:
            return {}

        common_index = portfolio_values.index.intersection(nifty_close.index)
        if len(common_index) < 2:
            return {}

        portfolio_values = portfolio_values.loc[common_index]
        nifty_close = nifty_close.loc[common_index]

        initial_portfolio = float(portfolio_values.iloc[0])
        final_portfolio = float(portfolio_values.iloc[-1])
        initial_nifty = float(nifty_close.iloc[0])
        final_nifty = float(nifty_close.iloc[-1])
        if initial_portfolio <= 0 or initial_nifty <= 0:
            return {}

        days_held = (today - start_date).days
        years = days_held / 365.0
        if years <= 0:
            return {}

        is_short_period = days_held < 90

        # Pass 1: filter to holdings that are actually present in downloaded close data.
        available_holdings = [
            item for item in dated_holdings if item["ticker"] in portfolio_close.columns
        ]
        if not available_holdings:
            return {}

        # Calculate user XIRR (money-weighted internal rate of return)
        # Build cash flows: outflows for each buy, inflow for current value
        xirr_flows = []
        for item in available_holdings:
            ticker = item["ticker"]
            qty = float(item["quantity"])
            buy_date = item["buyDate"]

            buy_ts = pd.Timestamp(buy_date)
            stock_series = portfolio_close[ticker]
            
            # Get the closing price on or after the buy date (using ffill)
            if buy_ts in stock_series.index:
                buy_price = float(stock_series.loc[buy_ts])
            else:
                # Find the first date >= buy_ts
                mask = stock_series.index >= buy_ts
                if mask.any():
                    buy_price = float(stock_series[mask].iloc[0])
                else:
                    buy_price = float(stock_series.iloc[-1])  # Fallback to last available
            
            # Outflow: negative cash flow for purchase
            xirr_flows.append((buy_date, -qty * buy_price))

        # Inflow: current portfolio value (as of today)
        xirr_flows.append((today, final_portfolio))
        xirr_flows.sort(key=lambda x: x[0])

        user_xirr = calculate_xirr(xirr_flows)

        # Nifty CAGR: anchored to the earliest buy date (standard retail benchmark)
        if is_short_period:
            nifty_cagr = (final_nifty / initial_nifty) - 1
        else:
            nifty_cagr = (final_nifty / initial_nifty) ** (1 / years) - 1


        # Pass 2: sum invested amount using only available holdings.
        total_invested = 0.0
        for item in available_holdings:
            qty = float(item["quantity"])
            ticker = item["ticker"]

            stock_series = portfolio_close[ticker]
            buy_ts = pd.Timestamp(item["buyDate"])
            if buy_ts in stock_series.index:
                buy_price = float(stock_series.loc[buy_ts])
            else:
                mask = stock_series.index >= buy_ts
                if mask.any():
                    buy_price = float(stock_series[mask].iloc[0])
                else:
                    buy_price = float(stock_series.iloc[-1])

            total_invested += qty * buy_price

        if total_invested <= 0:
            return {}

        portfolio_beta_data = await get_portfolio_beta(holdings)
        portfolio_beta = float(portfolio_beta_data.get("portfolioBeta", 0.0))

        # Updated verdict logic with >= for proper edge case handling
        if user_xirr >= nifty_cagr and portfolio_beta <= 1.0:
            verdict = "You beat the index with lower risk — great job"
        elif user_xirr >= nifty_cagr and portfolio_beta > 1.0:
            verdict = "You beat the index but took higher risk to do it"
        elif user_xirr < nifty_cagr and portfolio_beta <= 1.0:
            verdict = "You underperformed the index with lower risk — consider index funds"
        else:
            verdict = "You took more risk for less return than the index"

        outperforming = user_xirr >= nifty_cagr

        # Build normalized time series (base = 100 on first date)
        portfolio_series = (portfolio_values / portfolio_values.iloc[0]) * 100
        nifty_series = (nifty_close / nifty_close.iloc[0]) * 100

        # Sample to max 60 points for performance and display
        step = max(1, len(common_index) // 60)
        sampled_index = common_index[::step]

        time_series = [
            {
                "date": d.strftime("%Y-%m-%d"),
                "portfolio": round(float(portfolio_series.loc[d]), 2),
                "nifty": round(float(nifty_series.loc[d]), 2),
            }
            for d in sampled_index
        ]

        return {
            "userCAGR": round(user_xirr * 100, 2),
            "niftyCAGR": round(nifty_cagr * 100, 2),
            "portfolioBeta": portfolio_beta_data.get("portfolioBeta", round(portfolio_beta, 2)),
            "startDate": start_date.isoformat(),
            "daysHeld": days_held,
            "isShortPeriod": is_short_period,
            "returnLabel": "Total Return" if is_short_period else "MWRR",
            "verdict": verdict,
            "outperforming": outperforming,
            "timeSeries": time_series,
        }
    except Exception as exc:
        logger.exception("Failed to compute benchmark comparison: %s", exc)
        return {}
