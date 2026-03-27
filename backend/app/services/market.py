import logging
from typing import Any

import yfinance as yf

logger = logging.getLogger(__name__)


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


def get_stock_info(ticker: str) -> dict:
    try:
        stock = yf.Ticker(ticker)
        fast_info = stock.fast_info

        current_price = _safe_get_fast_info_value(fast_info, "last_price", "last_price")
        previous_close = _safe_get_fast_info_value(fast_info, "previous_close", "previous_close")

        return {
            "currentPrice": float(current_price) if current_price is not None else 0.0,
            "previousClose": float(previous_close) if previous_close is not None else 0.0,
        }
    except Exception as exc:
        logger.exception("Failed to fetch stock info for %s: %s", ticker, exc)
        return {}
