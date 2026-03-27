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
