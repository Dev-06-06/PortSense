import asyncio
import logging
from typing import Any

from app.services.analytics import get_sector

logger = logging.getLogger(__name__)

SCENARIOS = [
    {
        "id": "correction",
        "name": "Nifty Correction",
        "description": "Routine market pullback",
        "market_shock": -0.10,
        "sector_shocks": {},
    },
    {
        "id": "bear_market",
        "name": "Bear Market",
        "description": "Significant sustained downturn",
        "market_shock": -0.20,
        "sector_shocks": {},
    },
    {
        "id": "crash",
        "name": "Market Crash",
        "description": "COVID / 2008-style collapse",
        "market_shock": -0.40,
        "sector_shocks": {},
    },
    {
        "id": "banking_crisis",
        "name": "Banking Sector Crisis",
        "description": "NPA spike, liquidity crunch",
        "market_shock": -0.08,
        "sector_shocks": {"Banking": -0.35, "NBFC": -0.30, "Fintech": -0.25},
    },
    {
        "id": "it_correction",
        "name": "IT Sector Correction",
        "description": "US slowdown, deal cancellations",
        "market_shock": -0.05,
        "sector_shocks": {"IT": -0.20, "Technology": -0.20},
    },
    {
        "id": "rate_hike",
        "name": "RBI Rate Hike Shock",
        "description": "Surprise 50bps hike",
        "market_shock": -0.06,
        "sector_shocks": {
            "Banking": 0.04,
            "NBFC": -0.18,
            "IT": -0.12,
            "Real Estate": -0.15,
            "Auto": -0.08,
        },
    },
]


def _get_stock_shock(sector: str, beta: float, scenario: dict) -> float:
    """
    Returns the expected return for a stock under a given scenario.
    If the stock's sector has a specific shock, apply that directly.
    Otherwise use: beta * market_shock (with a contagion floor of market_shock * 0.4).
    """
    sector_shocks = scenario.get("sector_shocks", {})
    market_shock = scenario.get("market_shock", 0.0)

    for key, shock in sector_shocks.items():
        if key.lower() in sector.lower() or sector.lower() in key.lower():
            return shock

    beta_adjusted = beta * market_shock
    contagion = market_shock * 0.4
    return min(beta_adjusted, contagion) if market_shock < 0 else max(beta_adjusted, contagion)


async def run_stress_test(
    holdings: list[dict],
    betas: dict[str, float],
    db_client: Any = None,
    custom_shock: float | None = None,
) -> list[dict]:
    """
    holdings: list of {ticker, currentValue, quantity, ...}
    betas: dict of ticker -> beta float
    custom_shock: optional market shock fraction (e.g. -0.15 for -15%)
    Returns list of scenario result dicts.
    """
    if not holdings:
        return []

    total_value = sum(float(h.get("currentValue", 0)) for h in holdings)
    if total_value <= 0:
        return []

    sector_tasks = [
        get_sector(str(h.get("ticker", "")), db_client=db_client)
        for h in holdings
    ]
    sectors = await asyncio.gather(*sector_tasks)

    scenarios_to_run = list(SCENARIOS)
    if custom_shock is not None:
        scenarios_to_run.append({
            "id": "custom",
            "name": f"Custom Scenario ({custom_shock*100:+.1f}%)",
            "description": "User-defined market shock",
            "market_shock": custom_shock,
            "sector_shocks": {},
        })

    results = []
    for scenario in scenarios_to_run:
        per_stock = []
        total_loss = 0.0

        for holding, sector in zip(holdings, sectors):
            ticker = str(holding.get("ticker", ""))
            current_value = float(holding.get("currentValue", 0))
            beta = betas.get(ticker, 1.0)

            shock = _get_stock_shock(sector, beta, scenario)
            loss = current_value * shock

            per_stock.append({
                "ticker": ticker,
                "sector": sector,
                "beta": round(beta, 2),
                "shock_pct": round(shock * 100, 1),
                "current_value": round(current_value, 2),
                "estimated_loss": round(loss, 2),
            })
            total_loss += loss

        results.append({
            "id": scenario["id"],
            "name": scenario["name"],
            "description": scenario["description"],
            "market_shock_pct": round(scenario["market_shock"] * 100, 1),
            "total_portfolio_loss": round(total_loss, 2),
            "total_portfolio_loss_pct": round((total_loss / total_value) * 100, 1),
            "per_stock": sorted(per_stock, key=lambda x: x["estimated_loss"]),
        })

    return results