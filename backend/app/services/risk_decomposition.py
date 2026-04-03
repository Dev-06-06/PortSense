import logging

import numpy as np
import pandas as pd
import yfinance as yf

logger = logging.getLogger(__name__)


def compute_risk_decomposition(holdings: list[dict]) -> dict:
    """
    Decomposes portfolio total risk (annualised volatility) into:
      - Systematic risk  : driven by Nifty market movements (beta)
      - Sector risk      : extra variance from sector concentration
      - Idiosyncratic    : stock-specific, diversifiable risk

    holdings: list of {ticker, currentValue}
    Returns a dict with decomposition percentages and per-stock breakdown.
    """
    if not holdings:
        return _empty_result("No holdings provided")

    total_value = sum(float(h.get("currentValue", 0)) for h in holdings)
    if total_value <= 0:
        return _empty_result("Portfolio value is zero")

    tickers = [str(h.get("ticker", "")).strip().upper() for h in holdings]
    weights = [float(h.get("currentValue", 0)) / total_value for h in holdings]

    all_tickers = tickers + ["^NSEI"]
    try:
        raw = yf.download(
            all_tickers,
            period="6mo",
            interval="1d",
            auto_adjust=True,
            progress=False,
        )
    except Exception as exc:
        logger.exception("yfinance download failed for risk decomposition: %s", exc)
        return _empty_result("Unable to fetch price data")

    if raw is None or raw.empty:
        return _empty_result("No price data returned")

    close = raw["Close"] if isinstance(raw.columns, pd.MultiIndex) else raw
    returns = close.pct_change().dropna()

    if "^NSEI" not in returns.columns:
        return _empty_result("Nifty benchmark data unavailable")

    nifty_returns = returns["^NSEI"]
    market_var = float(nifty_returns.var())
    if market_var <= 0:
        return _empty_result("Insufficient Nifty data")

    per_stock = []
    portfolio_systematic_var = 0.0
    portfolio_idio_var = 0.0
    portfolio_total_var = 0.0

    for ticker, weight in zip(tickers, weights):
        if ticker not in returns.columns:
            per_stock.append(_stock_fallback(ticker, weight))
            continue

        stock_ret = returns[ticker].dropna()
        common_idx = stock_ret.index.intersection(nifty_returns.index)
        if len(common_idx) < 20:
            per_stock.append(_stock_fallback(ticker, weight))
            continue

        s_ret = stock_ret.loc[common_idx].values
        m_ret = nifty_returns.loc[common_idx].values

        cov = float(np.cov(s_ret, m_ret)[0][1])
        beta = cov / market_var
        stock_total_var = float(np.var(s_ret))
        systematic_var = (beta ** 2) * market_var
        idio_var = max(0.0, stock_total_var - systematic_var)
        r_squared = systematic_var / stock_total_var if stock_total_var > 0 else 0.0

        annualised_vol = float(np.std(s_ret) * np.sqrt(252) * 100)

        per_stock.append({
            "ticker": ticker,
            "weight_pct": round(weight * 100, 1),
            "beta": round(beta, 2),
            "r_squared": round(r_squared, 2),
            "annualised_vol_pct": round(annualised_vol, 1),
            "systematic_pct": round((systematic_var / stock_total_var * 100) if stock_total_var > 0 else 0, 1),
            "idiosyncratic_pct": round((idio_var / stock_total_var * 100) if stock_total_var > 0 else 0, 1),
        })

        portfolio_systematic_var += (weight ** 2) * systematic_var
        portfolio_idio_var += (weight ** 2) * idio_var
        portfolio_total_var += (weight ** 2) * stock_total_var

    if portfolio_total_var <= 0:
        return _empty_result("Could not compute portfolio variance")

    systematic_share = min(100.0, portfolio_systematic_var / portfolio_total_var * 100)
    idio_share = min(100.0, portfolio_idio_var / portfolio_total_var * 100)

    total_value_for_sector = sum(float(h.get("currentValue", 0)) for h in holdings)
    sector_weights: dict[str, float] = {}
    for h in holdings:
        sector_key = str(h.get("ticker", ""))
        val = float(h.get("currentValue", 0))
        sector_weights[sector_key] = sector_weights.get(sector_key, 0) + val / total_value_for_sector if total_value_for_sector > 0 else 0

    hhi = sum(w ** 2 for w in sector_weights.values())
    min_hhi = 1 / len(sector_weights) if sector_weights else 1
    sector_concentration_raw = max(0.0, (hhi - min_hhi) / (1 - min_hhi)) * 100 if (1 - min_hhi) > 0 else 0.0
    sector_share = round(min(sector_concentration_raw, max(0.0, 100.0 - systematic_share - idio_share)), 1)

    total = systematic_share + idio_share + sector_share
    if total > 100:
        scale = 100.0 / total
        systematic_share *= scale
        idio_share *= scale
        sector_share *= scale

    portfolio_vol = float(np.sqrt(portfolio_total_var) * np.sqrt(252) * 100)

    if systematic_share > 60:
        verdict = "Your portfolio moves closely with the market. Reducing high-beta stocks or adding defensive (low-beta) holdings can reduce this."
    elif idio_share > 40:
        verdict = "High stock-specific risk. Adding more stocks across different sectors will reduce this through diversification."
    else:
        verdict = "Reasonably balanced between market and stock-specific risk."

    return {
        "portfolio_vol_pct": round(portfolio_vol, 1),
        "systematic_pct": round(systematic_share, 1),
        "sector_concentration_pct": round(sector_share, 1),
        "idiosyncratic_pct": round(idio_share, 1),
        "verdict": verdict,
        "per_stock": sorted(per_stock, key=lambda x: x.get("weight_pct", 0), reverse=True),
    }


def _stock_fallback(ticker: str, weight: float) -> dict:
    return {
        "ticker": ticker,
        "weight_pct": round(weight * 100, 1),
        "beta": 1.0,
        "r_squared": None,
        "annualised_vol_pct": None,
        "systematic_pct": None,
        "idiosyncratic_pct": None,
    }


def _empty_result(reason: str) -> dict:
    return {
        "portfolio_vol_pct": None,
        "systematic_pct": None,
        "sector_concentration_pct": None,
        "idiosyncratic_pct": None,
        "verdict": reason,
        "per_stock": [],
    }
