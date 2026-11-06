import httpx
import logging
from datetime import datetime
from cachetools import TTLCache

logger = logging.getLogger(__name__)

_mf_cache: TTLCache = TTLCache(maxsize=200, ttl=3600)  # 1 hour cache

MFAPI_BASE = "https://api.mfapi.in/mf"


def _compute_fd_value(principal: float, annual_rate_pct: float, buy_date_str: str) -> float:
    """
    Compound interest: A = P(1 + r/n)^(nt)
    Using quarterly compounding (n=4) as standard for Indian FDs.
    """
    try:
        from datetime import date

        if hasattr(buy_date_str, "date"):
            buy_date_str = buy_date_str.date().isoformat()
        else:
            buy_date_str = str(buy_date_str or "")[:10]

        buy_date = datetime.strptime(buy_date_str[:10], "%Y-%m-%d").date()
        today = date.today()
        days = (today - buy_date).days
        if days <= 0:
            return principal
        years = days / 365.0
        rate = annual_rate_pct / 100.0
        # Quarterly compounding
        value = principal * ((1 + rate / 4) ** (4 * years))
        return round(value, 2)
    except Exception as exc:
        logger.warning("FD value computation failed: %s", exc)
        return principal


async def get_mf_nav(scheme_code: str) -> dict:
    """
    Fetch current NAV for a mutual fund scheme from MFAPI.
    Returns {"currentNav": float, "previousNav": float, "schemeName": str}
    """
    cache_key = f"mf_nav_{scheme_code}"
    if cache_key in _mf_cache:
        return _mf_cache[cache_key]

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{MFAPI_BASE}/{scheme_code}")
            resp.raise_for_status()
            data = resp.json()

        nav_data = data.get("data", [])
        scheme_name = data.get("meta", {}).get("scheme_name", scheme_code)

        if not nav_data:
            return {"currentNav": 0.0, "previousNav": 0.0, "schemeName": scheme_name}

        current_nav = float(nav_data[0].get("nav", 0))
        previous_nav = (
            float(nav_data[1].get("nav", current_nav)) if len(nav_data) > 1 else current_nav
        )

        result = {
            "currentNav": current_nav,
            "previousNav": previous_nav,
            "schemeName": scheme_name,
        }
        _mf_cache[cache_key] = result
        return result

    except Exception as exc:
        logger.warning("MFAPI fetch failed for %s: %s", scheme_code, exc)
        return {"currentNav": 0.0, "previousNav": 0.0, "schemeName": scheme_code}


async def search_mf_schemes(query: str) -> list[dict]:
    """
    Search mutual fund schemes by name.
    Returns list of {"schemeCode": str, "schemeName": str}
    """
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{MFAPI_BASE}/search?q={query}")
            resp.raise_for_status()
            results = resp.json()

        return [
            {
                "schemeCode": str(r.get("schemeCode", "")),
                "schemeName": r.get("schemeName", ""),
            }
            for r in results[:10]
        ]
    except Exception as exc:
        logger.warning("MF search failed for %s: %s", query, exc)
        return []