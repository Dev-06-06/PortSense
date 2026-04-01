import asyncio
import logging
import threading
from datetime import date, timedelta
from datetime import datetime, timezone
from itertools import combinations

import numpy as np
import pandas as pd
import yfinance as yf
from cachetools import TTLCache, cached as cachetools_cached
from motor.motor_asyncio import AsyncIOMotorClient

from app.config.db import get_database_from_client, get_mongo_client
from app.services.gemini import get_gemini_response

logger = logging.getLogger(__name__)

SECTOR_MAP = {
    "RELIANCE.NS": "Energy",
    "INFY.NS": "IT",
    "TCS.NS": "IT",
    "WIPRO.NS": "IT",
    "HDFCBANK.NS": "Banking",
    "ICICIBANK.NS": "Banking",
    "SBIN.NS": "Banking",
    "AXISBANK.NS": "Banking",
    "TATASTEEL.NS": "Materials",
    "JSWSTEEL.NS": "Materials",
    "ADANIPOWER.NS": "Energy",
    "ADANIENT.NS": "Conglomerate",
    "SUNPHARMA.NS": "Pharma",
    "DRREDDY.NS": "Pharma",
    "CIPLA.NS": "Pharma",
    "HINDUNILVR.NS": "FMCG",
    "ITC.NS": "FMCG",
    "BAJFINANCE.NS": "NBFC",
    "MARUTI.NS": "Auto",
    "TATAMOTORS.NS": "Auto",
    "ONGC.NS": "Energy",
    "NTPC.NS": "Energy",
    "POWERGRID.NS": "Energy",
    "HCLTECH.NS": "IT",
    "TECHM.NS": "IT",
    "LT.NS": "Infrastructure",
}
async def get_sector(ticker: str, db_client=None) -> str:
    if ticker in SECTOR_MAP:
        return SECTOR_MAP[ticker]

    if db_client:
        cached = await get_database_from_client(db_client).sector_cache.find_one({"ticker": ticker})
        if cached:
            return cached["sector"]

    try:
        info = yf.Ticker(ticker).info
        sector = info.get("sector") or info.get("industryDisp")
        if sector and isinstance(sector, str) and len(sector) > 1:
            if db_client:
                await get_database_from_client(db_client).sector_cache.update_one(
                    {"ticker": ticker},
                    {"$setOnInsert": {"ticker": ticker, "sector": sector, "source": "yfinance", "cachedAt": datetime.now(timezone.utc)}},
                    upsert=True
                )
            return sector
    except Exception:
        pass

    try:
        prompt = (
            f"What sector does {ticker.replace('.NS','').replace('.BO','')} "
            f"belong to in the Indian stock market? "
            f"Reply with ONLY the sector name. "
            f"Examples: IT, Banking, Energy, Pharma, FMCG, Auto, "
            f"Materials, NBFC, Infrastructure, Conglomerate"
        )
        raw = await asyncio.to_thread(get_gemini_response, prompt)
        sector = raw.strip().splitlines()[0]
        if sector and len(sector) < 30:
            if db_client:
                await get_database_from_client(db_client).sector_cache.update_one(
                    {"ticker": ticker},
                    {"$setOnInsert": {"ticker": ticker, "sector": sector, "source": "gemini", "cachedAt": datetime.now(timezone.utc)}},
                    upsert=True
                )
            return sector
    except Exception:
        pass

    return "Other"


async def get_sector_breakdown(
    holdings: list,
    mongo_client: AsyncIOMotorClient | None = None,
    db_client: AsyncIOMotorClient | None = None,
) -> list[dict]:
    active_db_client = db_client or mongo_client
    total_portfolio_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)

    sector_groups = {}
    for holding in holdings:
        ticker = str(holding.get("ticker", "")).strip().upper()
        current_value = float(holding.get("currentValue", 0.0))
        sector = await get_sector(ticker, db_client=active_db_client)

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
        percentage = (
            (sector_data["totalValue"] / total_portfolio_value) * 100.0
            if total_portfolio_value > 0
            else 0.0
        )
        breakdown.append(
            {
                "sector": sector_data["sector"],
                "totalValue": sector_data["totalValue"],
                "percentage": percentage,
                "tickers": sorted(list(sector_data["tickers"])),
                "isOverweight": percentage > 30.0,
            }
        )

    breakdown.sort(key=lambda item: item["totalValue"], reverse=True)
    return breakdown


_beta_cache: TTLCache = TTLCache(maxsize=100, ttl=600)
_beta_cache_lock = threading.Lock()


@cachetools_cached(cache=_beta_cache, lock=_beta_cache_lock)
def get_stock_beta(ticker: str) -> float:
    normalized_ticker = ticker.strip().upper()

    if not normalized_ticker:
        return 1.0

    # Removed yfinance JSON cache clearing for compatibility with newer yfinance versions.

    try:
        stock = yf.Ticker(normalized_ticker)
        stock_info = stock.info if isinstance(stock.info, dict) else {}
        beta = stock_info.get("beta")
        if beta is not None:
            return float(beta)
    except Exception as exc:
        error_text = str(exc).lower()
        is_401_error = (
            "401" in error_text
            or "unauthorized" in error_text
            or "forbidden" in error_text
            or "crumb" in error_text
        )
        if not is_401_error:
            logger.exception("Failed to fetch beta for %s: %s", normalized_ticker, exc)
            return 1.0

    try:
        # Retry with a fresh ticker and use fast_info as a resilient fallback source.
        stock = yf.Ticker(normalized_ticker)
        return float(stock.fast_info.get("beta", 1.0) or 1.0)
    except Exception as exc:
        logger.exception("Failed to fetch beta from fast_info for %s: %s", normalized_ticker, exc)
        return 1.0


async def get_portfolio_beta(holdings: list) -> dict:
    total_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)

    tickers = [str(holding.get("ticker", "")).strip().upper() for holding in holdings]
    betas = await asyncio.gather(
        *[asyncio.to_thread(get_stock_beta, ticker) for ticker in tickers]
    )

    per_stock = []
    portfolio_beta = 0.0

    for holding, beta in zip(holdings, betas):
        ticker = str(holding.get("ticker", "")).strip().upper()
        current_value = float(holding.get("currentValue", 0.0))
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
    sector_breakdown = await get_sector_breakdown(holdings, db_client=db_client)
    diversification = get_diversification_score(holdings, sector_breakdown)
    
    # Extract tickers for correlation analysis
    tickers = [
        str(holding.get("ticker", "")).strip().upper()
        for holding in holdings
        if str(holding.get("ticker", "")).strip()
    ]
    correlation_result = await asyncio.to_thread(get_correlation_matrix, tickers)
    
    # Calculate correlation score from pair correlations
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
    
    # Recalculate final score with correlation
    sector_score = float(diversification.get("sectorScore", 0.0))
    size_score = float(diversification.get("sizeScore", 0.0))
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


def get_diversification_score(holdings: list, sector_breakdown: list) -> dict:
    overweight_sector_count = 0
    max_sector_percentage = 0.0
    for sector in sector_breakdown:
        percentage = float(sector.get("percentage", 0.0))
        max_sector_percentage = max(max_sector_percentage, percentage)
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

    if overweight_sector_count >= 2 or max_sector_percentage >= 40.0:
        correlation_score = 4.0
    elif overweight_sector_count == 1:
        correlation_score = 5.0
    else:
        correlation_score = 7.0

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


def get_correlation_matrix(tickers: list) -> dict:
    normalized_tickers = [str(ticker).strip().upper() for ticker in tickers if str(ticker).strip()]
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


def get_benchmark_comparison(holdings: list) -> dict:
    try:
        if not holdings:
            return {}

        dated_holdings = []
        for holding in holdings:
            ticker = str(holding.get("ticker", "")).strip().upper()
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

        portfolio_data = yf.download(
            tickers,
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
        nifty_data = yf.download(
            "^NSEI",
            start=start_date.isoformat(),
            end=end_date.isoformat(),
            interval="1d",
            auto_adjust=True,
            progress=False,
        )

        if portfolio_data is None or portfolio_data.empty or nifty_data is None or nifty_data.empty:
            return {}

        if isinstance(nifty_data.columns, pd.MultiIndex):
            try:
                nifty_close = nifty_data["Close"]["^NSEI"]
            except KeyError:
                return {}
        else:
            nifty_close = nifty_data.get("Close")

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

        quantities = {ticker: 0.0 for ticker in tickers}
        for item in dated_holdings:
            quantities[item["ticker"]] += float(item["quantity"])

        portfolio_values = sum(
            portfolio_close[ticker].fillna(0.0) * quantities.get(ticker, 0.0)
            for ticker in tickers
        )
        portfolio_values = portfolio_values.dropna()
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

        years = (today - start_date).days / 365.0
        if years <= 0:
            return {}

        user_cagr = (final_portfolio / initial_portfolio) ** (1 / years) - 1
        nifty_cagr = (final_nifty / initial_nifty) ** (1 / years) - 1

        portfolio_returns = portfolio_values.pct_change().dropna()
        nifty_returns = nifty_close.pct_change().dropna()
        returns_index = portfolio_returns.index.intersection(nifty_returns.index)
        if len(returns_index) < 2:
            return {}

        portfolio_returns = portfolio_returns.loc[returns_index]
        nifty_returns = nifty_returns.loc[returns_index]

        covariance = float(np.cov(portfolio_returns.values, nifty_returns.values)[0][1])
        nifty_variance = float(np.var(nifty_returns.values))
        portfolio_beta = covariance / nifty_variance if nifty_variance != 0 else 0.0

        outperforming = user_cagr > nifty_cagr
        if user_cagr > nifty_cagr and portfolio_beta <= 1.0:
            verdict = "You beat the index with lower risk — great job"
        elif user_cagr > nifty_cagr and portfolio_beta > 1.0:
            verdict = "You beat the index but took higher risk to do it"
        elif user_cagr < nifty_cagr and portfolio_beta <= 1.0:
            verdict = "You underperformed the index with lower risk — consider index funds"
        else:
            verdict = "You took more risk for less return than the index"

        return {
            "userCAGR": round(user_cagr * 100, 2),
            "niftyCAGR": round(nifty_cagr * 100, 2),
            "portfolioBeta": portfolio_beta,
            "startDate": start_date.isoformat(),
            "verdict": verdict,
            "outperforming": outperforming,
        }
    except Exception as exc:
        logger.exception("Failed to compute benchmark comparison: %s", exc)
        return {}
