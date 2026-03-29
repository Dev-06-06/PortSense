import logging
from typing import Any

from cachetools import TTLCache, cached
import yfinance as yf

logger = logging.getLogger(__name__)

price_cache = TTLCache(maxsize=200, ttl=300)


def _safe_get_fast_info_value(fast_info: Any, attr_name: str, key_name: str) -> Any:
    value = getattr(fast_info, attr_name, None)
    if value is not None:
        return value

    if hasattr(fast_info, "get"):
        return fast_info.get(key_name)

    return None


def get_current_price(ticker: str) -> float:
    try:
        stock = yf.Ticker(ticker)
        price = stock.fast_info.last_price
        return float(price) if price is not None else 0.0
    except Exception as exc:
        logger.exception("Failed to fetch current price for %s: %s", ticker, exc)
        return 0.0


@cached(cache=price_cache)
def get_stock_info(ticker: str) -> dict:
    try:
        logger.info("Cache miss - fetching %s from yfinance", ticker)
        stock = yf.Ticker(ticker)
        fast_info = stock.fast_info

        try:
            currentPrice = fast_info.last_price or 0.0
        except Exception:
            currentPrice = 0.0

        try:
            previousClose = fast_info.previous_close or currentPrice
            if previousClose == currentPrice:
                logger.debug(
                    "Using previousClose fallback for %s because fast_info.previous_close was unavailable",
                    ticker,
                )
        except Exception:
            previousClose = currentPrice
            logger.debug(
                "Using previousClose fallback for %s because fast_info.previous_close fetch failed",
                ticker,
            )

        return {
            "currentPrice": float(currentPrice) if currentPrice is not None else 0.0,
            "previousClose": float(previousClose) if previousClose is not None else float(currentPrice) if currentPrice is not None else 0.0,
        }
    except Exception as exc:
        logger.exception("Failed to fetch stock info for %s: %s", ticker, exc)
        return {
            "currentPrice": 0.0,
            "previousClose": 0.0,
        }


def cache_info() -> dict:
    return {
        "size": len(price_cache),
        "maxsize": price_cache.maxsize,
        "ttl": price_cache.ttl,
    }
