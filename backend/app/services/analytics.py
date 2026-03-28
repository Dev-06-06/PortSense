import logging

import yfinance as yf

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


def get_sector(ticker: str) -> str:
    normalized_ticker = ticker.strip().upper()

    sector = SECTOR_MAP.get(normalized_ticker)
    if sector:
        return sector

    try:
        stock = yf.Ticker(normalized_ticker)
        fetched_sector = stock.info.get("sector") if isinstance(stock.info, dict) else None
        if fetched_sector:
            return str(fetched_sector)
    except Exception as exc:
        logger.exception("Failed to fetch sector for %s: %s", normalized_ticker, exc)

    return "Other"


def get_sector_breakdown(holdings: list) -> list[dict]:
    total_portfolio_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)

    sector_groups = {}
    for holding in holdings:
        ticker = str(holding.get("ticker", "")).strip().upper()
        current_value = float(holding.get("currentValue", 0.0))
        sector = get_sector(ticker)

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


def get_stock_beta(ticker: str) -> float:
    normalized_ticker = ticker.strip().upper()

    if not normalized_ticker:
        return 1.0

    try:
        stock = yf.Ticker(normalized_ticker)
        stock_info = stock.info if isinstance(stock.info, dict) else {}
        beta = stock_info.get("beta")
        if beta is None:
            return 1.0
        return float(beta)
    except Exception as exc:
        logger.exception("Failed to fetch beta for %s: %s", normalized_ticker, exc)
        return 1.0


def get_portfolio_beta(holdings: list) -> dict:
    total_value = sum(float(holding.get("currentValue", 0.0)) for holding in holdings)

    per_stock = []
    portfolio_beta = 0.0

    for holding in holdings:
        ticker = str(holding.get("ticker", "")).strip().upper()
        current_value = float(holding.get("currentValue", 0.0))
        weight = (current_value / total_value) if total_value > 0 else 0.0
        weight_pct = round(weight * 100.0, 1)
        beta = get_stock_beta(ticker)

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
