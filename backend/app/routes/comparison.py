import asyncio
import bisect
import threading
from collections import defaultdict
from datetime import date, datetime, timedelta

from cachetools import TTLCache
from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorCollection
import pandas as pd
import yfinance as yf

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.market import get_stock_info


router = APIRouter(tags=["comparison"])

_comparison_cache = TTLCache(maxsize=50, ttl=3600)
_cache_lock = threading.Lock()

ASSET_COLORS = {
    "portfolio": "#f97316",
    "nifty50": "#3b82f6",
    "gold": "#f59e0b",
    "silver": "#94a3b8",
    "fd": "#10b981",
    "indexFund": "#8b5cf6",
}


def _cache_get(cache_key: str):
    with _cache_lock:
        return _comparison_cache.get(cache_key)


def _cache_set(cache_key: str, payload: dict):
    with _cache_lock:
        _comparison_cache[cache_key] = payload


def _to_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value[:10]).date()
        except ValueError:
            return None
    return None


def _month_starts(start_date: date, end_date: date) -> list[date]:
    cursor = date(start_date.year, start_date.month, 1)
    points: list[date] = []
    while cursor <= end_date:
        points.append(cursor)
        if cursor.month == 12:
            cursor = date(cursor.year + 1, 1, 1)
        else:
            cursor = date(cursor.year, cursor.month + 1, 1)
    return points


def _prepare_series(price_map: dict[date, float]) -> tuple[list[date], list[float]]:
    dates = sorted(price_map.keys())
    values = [float(price_map[d]) for d in dates]
    return dates, values


def _price_on_or_after(series: tuple[list[date], list[float]], target: date) -> float | None:
    dates, values = series
    idx = bisect.bisect_left(dates, target)
    if idx >= len(dates):
        return None
    return values[idx]


def _price_on_or_before(series: tuple[list[date], list[float]], target: date) -> float | None:
    dates, values = series
    idx = bisect.bisect_right(dates, target) - 1
    if idx < 0:
        return None
    return values[idx]


async def _fetch_price_history(symbol: str, start_date: date, end_date: date) -> dict[date, float]:
    try:
        start = start_date.strftime("%Y-%m-%d")
        end = (end_date + timedelta(days=2)).strftime("%Y-%m-%d")

        def _download():
            return yf.download(
                symbol,
                start=start,
                end=end,
                interval="1d",
                auto_adjust=False,
                progress=False,
                threads=False,
            )

        history = await asyncio.to_thread(_download)
        if history is None or history.empty:
            return {}

        close = history.get("Close")
        if close is None:
            return {}

        if isinstance(close, pd.DataFrame):
            close = close.iloc[:, 0]

        close = close.dropna()
        prices: dict[date, float] = {}
        for idx, value in close.items():
            d = idx.date() if hasattr(idx, "date") else idx
            v = float(value)
            if v > 0:
                prices[d] = v

        return prices
    except Exception:
        return {}


def _build_event_units(
    events: list[dict],
    series: tuple[list[date], list[float]],
) -> list[tuple[date, float]]:
    units: list[tuple[date, float]] = []
    for event in events:
        invest_date = event["date"]
        amount = float(event["amount"])
        price_on_date = _price_on_or_after(series, invest_date)
        if price_on_date is None or price_on_date <= 0:
            continue
        units.append((invest_date, amount / price_on_date))
    return units


def _value_from_units_on_date(
    unit_events: list[tuple[date, float]],
    series: tuple[list[date], list[float]],
    valuation_date: date,
) -> float:
    price = _price_on_or_after(series, valuation_date)
    if price is None or price <= 0:
        price = _price_on_or_before(series, valuation_date)
    if price is None or price <= 0:
        return 0.0

    total_units = 0.0
    for invest_date, units in unit_events:
        if invest_date <= valuation_date:
            total_units += units
    return total_units * price


def _fd_value(events: list[dict], valuation_date: date, fd_rate: float) -> float:
    total = 0.0
    for event in events:
        invest_date = event["date"]
        if invest_date > valuation_date:
            continue
        days_held = (valuation_date - invest_date).days
        amount = float(event["amount"])
        total += amount * ((1 + fd_rate / 100.0) ** (days_held / 365.0))
    return total


def _summary_row(asset: str, current_value: float, invested: float, color: str) -> dict:
    absolute_return = current_value - invested
    return_pct = (absolute_return / invested * 100.0) if invested > 0 else 0.0
    return {
        "asset": asset,
        "totalInvested": round(invested, 2),
        "currentValue": round(current_value, 2),
        "absoluteReturn": round(absolute_return, 2),
        "returnPct": round(return_pct, 2),
        "color": color,
    }


@router.get("/alternatives")
async def get_alternative_comparison(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
    fd_rate: float = Query(default=7.0, ge=1.0, le=15.0),
):
    user_id = str(current_user.get("_id"))
    cache_key = f"{str(user_id)}:{fd_rate}"
    cached = _cache_get(cache_key)
    if cached is not None:
        return cached

    try:
        holdings = await holdings_collection.find({"userId": current_user["_id"]}).to_list(None)
        if not holdings:
            empty = {
                "summary": [],
                "timeline": [],
                "totalInvested": 0.0,
                "earliestDate": None,
            }
            _cache_set(cache_key, empty)
            return empty

        events_by_date: dict[date, float] = defaultdict(float)
        cleaned_holdings: list[dict] = []

        for holding in holdings:
            buy_date = _to_date(holding.get("buyDate"))
            if buy_date is None:
                continue

            quantity = float(holding.get("quantity", 0) or 0)
            buy_price = float(holding.get("buyPrice", 0) or 0)
            if quantity <= 0 or buy_price <= 0:
                continue

            amount = buy_price * quantity
            events_by_date[buy_date] += amount
            cleaned_holdings.append(
                {
                    "ticker": str(holding.get("ticker", "")).strip().upper(),
                    "buyDate": buy_date,
                    "buyPrice": buy_price,
                    "quantity": quantity,
                }
            )

        if not events_by_date:
            empty = {
                "summary": [],
                "timeline": [],
                "totalInvested": 0.0,
                "earliestDate": None,
            }
            _cache_set(cache_key, empty)
            return empty

        events = [
            {"date": d, "amount": amt}
            for d, amt in sorted(events_by_date.items(), key=lambda item: item[0])
        ]

        total_invested = float(sum(e["amount"] for e in events))
        earliest_date = events[0]["date"]
        today = date.today()

        stock_info_tasks = [
            asyncio.to_thread(get_stock_info, h["ticker"])
            for h in cleaned_holdings
        ]
        stock_infos = await asyncio.gather(*stock_info_tasks, return_exceptions=True)

        portfolio_current = 0.0
        for holding, info in zip(cleaned_holdings, stock_infos):
            quantity = float(holding["quantity"])
            buy_price = float(holding["buyPrice"])
            current_price = buy_price
            if isinstance(info, dict):
                fetched = float(info.get("currentPrice", 0) or 0)
                if fetched > 0:
                    current_price = fetched
            portfolio_current += current_price * quantity

        alt_symbols = {
            "nifty50": "^NSEI",
            "gold": "GC=F",
            "silver": "SI=F",
            "indexFund": "0P0000XVGB.BO",
        }

        alt_history_tasks = [
            _fetch_price_history(symbol, earliest_date, today)
            for symbol in alt_symbols.values()
        ]
        alt_history_results = await asyncio.gather(*alt_history_tasks, return_exceptions=True)

        alt_histories: dict[str, dict[date, float]] = {}
        for (asset_key, _), history in zip(alt_symbols.items(), alt_history_results):
            if isinstance(history, Exception):
                continue
            if isinstance(history, dict) and history:
                alt_histories[asset_key] = history

        if "indexFund" not in alt_histories and "nifty50" in alt_histories:
            alt_histories["indexFund"] = {
                d: p * 0.98 for d, p in alt_histories["nifty50"].items()
            }

        alt_series = {
            key: _prepare_series(price_map)
            for key, price_map in alt_histories.items()
            if price_map
        }

        alt_current_values: dict[str, float] = {}
        alt_unit_events: dict[str, list[tuple[date, float]]] = {}

        for key, series in alt_series.items():
            unit_events = _build_event_units(events, series)
            if not unit_events:
                continue
            alt_unit_events[key] = unit_events
            alt_current_values[key] = _value_from_units_on_date(unit_events, series, today)

        unique_tickers = sorted({h["ticker"] for h in cleaned_holdings if h["ticker"]})
        ticker_history_tasks = [
            _fetch_price_history(ticker, earliest_date, today)
            for ticker in unique_tickers
        ]
        ticker_history_results = await asyncio.gather(*ticker_history_tasks, return_exceptions=True)

        ticker_series: dict[str, tuple[list[date], list[float]]] = {}
        for ticker, history in zip(unique_tickers, ticker_history_results):
            if isinstance(history, Exception):
                continue
            if isinstance(history, dict) and history:
                ticker_series[ticker] = _prepare_series(history)

        months = _month_starts(earliest_date, today)
        timeline: list[dict] = []

        for month in months:
            point = {
                "month": month.strftime("%b %Y"),
                "invested": round(
                    sum(float(e["amount"]) for e in events if e["date"] <= month),
                    2,
                ),
            }

            portfolio_value = 0.0
            for holding in cleaned_holdings:
                if holding["buyDate"] > month:
                    continue
                ticker = holding["ticker"]
                quantity = float(holding["quantity"])
                price = float(holding["buyPrice"])
                series = ticker_series.get(ticker)
                if series is not None:
                    market_price = _price_on_or_after(series, month)
                    if market_price is None or market_price <= 0:
                        market_price = _price_on_or_before(series, month)
                    if market_price is not None and market_price > 0:
                        price = market_price
                portfolio_value += quantity * price

            point["portfolio"] = round(portfolio_value, 2)

            for key, series in alt_series.items():
                if key not in alt_unit_events:
                    continue
                point[key] = round(
                    _value_from_units_on_date(alt_unit_events[key], series, month),
                    2,
                )

            point["fd"] = round(_fd_value(events, month, fd_rate), 2)
            timeline.append(point)

        summary = [
            _summary_row("Your Portfolio", portfolio_current, total_invested, ASSET_COLORS["portfolio"]),
        ]

        if "nifty50" in alt_current_values:
            summary.append(
                _summary_row("Nifty 50", alt_current_values["nifty50"], total_invested, ASSET_COLORS["nifty50"])
            )
        if "gold" in alt_current_values:
            summary.append(
                _summary_row("Gold", alt_current_values["gold"], total_invested, ASSET_COLORS["gold"])
            )
        if "silver" in alt_current_values:
            summary.append(
                _summary_row("Silver", alt_current_values["silver"], total_invested, ASSET_COLORS["silver"])
            )

        fd_current = _fd_value(events, today, fd_rate)
        summary.append(
            _summary_row(f"FD @ {fd_rate}%", fd_current, total_invested, ASSET_COLORS["fd"])
        )

        if "indexFund" in alt_current_values:
            summary.append(
                _summary_row(
                    "Nifty Index Fund",
                    alt_current_values["indexFund"],
                    total_invested,
                    ASSET_COLORS["indexFund"],
                )
            )

        response = {
            "summary": summary,
            "timeline": timeline,
            "totalInvested": round(total_invested, 2),
            "earliestDate": earliest_date.isoformat(),
        }

        _cache_set(cache_key, response)
        return response
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compute comparison: {exc}") from exc
