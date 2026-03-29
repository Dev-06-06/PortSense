import asyncio
import json
from collections import Counter
from datetime import date, datetime
from typing import Any

import yfinance as yf
from fastapi import APIRouter, Depends

from app.middleware.auth import get_current_user
from app.services.gemini import get_gemini_response
from app.services.sentiment import fetch_news_headlines, run_finbert
from app.services.technical import get_technical_indicators


router = APIRouter()


def _to_float(value: Any, digits: int | None = None) -> float | None:
    if value is None:
        return None

    try:
        number = float(value)
    except (TypeError, ValueError):
        return None

    if digits is not None:
        return round(number, digits)
    return number


def _safe_div(numerator: float | None, denominator: float | None) -> float | None:
    if numerator is None or denominator in (None, 0):
        return None
    return numerator / denominator


def _format_date(value: Any) -> str | None:
    if value is None:
        return None

    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()

    try:
        # Covers pandas.Timestamp and similar date-like values.
        return value.to_pydatetime().date().isoformat()
    except Exception:
        pass

    try:
        text = str(value).strip()
        return text if text else None
    except Exception:
        return None


def _extract_calendar_value(calendar: Any, keys: list[str]) -> Any:
    if calendar is None:
        return None

    lowered_keys = {key.lower() for key in keys}

    if isinstance(calendar, dict):
        for key, value in calendar.items():
            if str(key).strip().lower() in lowered_keys:
                return value

    try:
        index = getattr(calendar, "index", None)
        if index is not None:
            for idx in index:
                idx_text = str(idx).strip().lower()
                if idx_text in lowered_keys:
                    row = calendar.loc[idx]
                    if hasattr(row, "iloc"):
                        return row.iloc[0]
                    return row
    except Exception:
        pass

    try:
        columns = getattr(calendar, "columns", None)
        if columns is not None:
            for column in columns:
                if str(column).strip().lower() in lowered_keys:
                    series = calendar[column]
                    if hasattr(series, "iloc"):
                        return series.iloc[0]
                    return series
    except Exception:
        pass

    return None


def _collect_fast_data(ticker: str) -> dict:
    ticker_obj = yf.Ticker(ticker)
    ticker_info = ticker_obj.info
    info = ticker_obj.info if isinstance(ticker_obj.info, dict) else {}

    history = ticker_obj.history(period="5d", interval="1d", auto_adjust=False)

    current_price = _to_float(info.get("currentPrice"))
    if current_price is None:
        current_price = _to_float(info.get("regularMarketPrice"))

    if current_price is None and not history.empty:
        current_price = _to_float(history["Close"].iloc[-1])

    previous_close = _to_float(info.get("regularMarketPreviousClose"))
    if previous_close is None and len(history.index) >= 2:
        previous_close = _to_float(history["Close"].iloc[-2])

    change_rs = None
    change_pct = None
    if current_price is not None and previous_close not in (None, 0):
        change_rs = round(current_price - previous_close, 2)
        change_pct = round(((current_price - previous_close) / previous_close) * 100.0, 2)

    volume = _to_float(info.get("volume"))
    if volume is None:
        volume = _to_float(info.get("regularMarketVolume"))

    average_volume = _to_float(info.get("averageVolume"))
    if average_volume is None:
        average_volume = _to_float(info.get("averageVolume10days"))

    volume_ratio = _safe_div(volume, average_volume)
    if volume_ratio is not None:
        volume_ratio = round(volume_ratio, 2)

    calendar = ticker_obj.calendar

    next_dividend_date = _format_date(
        _extract_calendar_value(
            calendar,
            ["Dividend Date", "Ex-Dividend Date", "Next Dividend Date"],
        )
    )
    next_dividend_amount = _to_float(
        _extract_calendar_value(calendar, ["Dividend", "Dividend Value", "Dividend Amount"]),
        digits=2,
    )
    if next_dividend_amount is None:
        next_dividend_amount = _to_float(info.get("dividendRate"), digits=2)

    earnings_date = _extract_calendar_value(
        calendar,
        [
            "Earnings Date",
            "Next Earnings Date",
        ],
    )
    if isinstance(earnings_date, list):
        earnings_date = earnings_date[0] if earnings_date else None
    if hasattr(earnings_date, "isoformat"):
        earnings_date = earnings_date.isoformat()
    elif isinstance(earnings_date, list) and len(earnings_date) > 0:
        item = earnings_date[0]
        earnings_date = item.isoformat() if hasattr(item, "isoformat") else str(item)
    else:
        earnings_date = None
    next_earnings = earnings_date

    pe_ratio = round(ticker_info.get("trailingPE") or 0, 2)

    debt_equity = ticker_info.get("debtToEquity")
    if debt_equity is not None:
        debt_equity = round(float(debt_equity) / 100, 2)
    else:
        debt_equity = "N/A"

    # Fallback chain for revenue_growth: handles both US and Indian stock key variations
    # yfinance limitation for Indian banks
    revenue_growth = (
        ticker_info.get("revenueGrowth") or
        ticker_info.get("quarterlyRevenueGrowth") or
        ticker_info.get("revenueQuarterlyGrowth") or
        None
    )
    if revenue_growth:
        revenue_growth = f"{round(float(revenue_growth) * 100, 1)}%"
    else:
        revenue_growth = "N/A"

    # Fallback chain for profit_margins: handles both US and Indian stock key variations
    # yfinance limitation for Indian banks
    profit_margins = (
        ticker_info.get("profitMargins") or
        ticker_info.get("netProfitMargin") or
        None
    )
    if profit_margins:
        profit_margins = f"{round(float(profit_margins) * 100, 1)}%"
    else:
        profit_margins = "N/A"

    # Fallback chain for analyst_rating: handles both US and Indian stock key variations
    analyst_rating = (
        ticker_info.get("recommendationKey") or
        ticker_info.get("averageAnalystRating") or
        None
    )
    if analyst_rating:
        analyst_rating = analyst_rating.replace("-", " ").title()
    else:
        analyst_rating = "N/A"
    
    recommendation = analyst_rating

    return {
        "price": current_price,
        "change_pct": change_pct,
        "change_rs": change_rs,
        "volume": volume,
        "average_volume": average_volume,
        "volume_ratio": volume_ratio,
        "unusual_volume": bool(volume_ratio and volume_ratio > 2.0),
        "week52_high": _to_float(info.get("fiftyTwoWeekHigh")),
        "week52_low": _to_float(info.get("fiftyTwoWeekLow")),
        "market_cap": _to_float(info.get("marketCap")),
        "pe_ratio": pe_ratio,
        "debt_equity": debt_equity,
        "revenue_growth": revenue_growth,
        "profit_margins": profit_margins,
        "recommendation": recommendation,
        "next_dividend_date": next_dividend_date,
        "next_dividend_amount": next_dividend_amount,
        "next_earnings": next_earnings,
    }


def _build_sentiment(scored_headlines: list[dict]) -> tuple[str, float, list[str]]:
    if not scored_headlines:
        return "Neutral", 0.0, []

    labels = [str(item.get("label", "neutral")).lower() for item in scored_headlines]
    counts = Counter(labels)
    majority_label, _ = counts.most_common(1)[0]

    majority_scores = [
        _to_float(item.get("score"))
        for item in scored_headlines
        if str(item.get("label", "")).lower() == majority_label
    ]
    valid_scores = [score for score in majority_scores if score is not None]

    confidence = round(sum(valid_scores) / len(valid_scores), 2) if valid_scores else 0.0

    if majority_label == "positive":
        badge = "Bullish"
    elif majority_label == "negative":
        badge = "Bearish"
    else:
        badge = "Neutral"

    top_headlines = [
        str(item.get("headline", "")).strip()
        for item in scored_headlines
        if str(item.get("headline", "")).strip()
    ][:3]

    return badge, confidence, top_headlines


def _build_prompt(
    ticker: str,
    fast_data: dict,
    technicals: dict,
    sentiment_badge: str,
    top_headlines: list[str],
) -> str:
    joined_headlines = "; ".join(top_headlines) if top_headlines else "No major headlines"

    return f"""
You are a financial analyst briefing an Indian retail investor on {ticker}.

Current Data:
- Price: ₹{fast_data.get("price", "N/A")} ({fast_data.get("change_pct", "N/A")}% today)
- Volume: {fast_data.get("volume_ratio", "N/A")}x normal volume
- RSI: {technicals.get("rsi", "N/A")} ({technicals.get("rsi_signal", "N/A")})
- Pattern: {technicals.get("pattern", "N/A")}
- Recent headlines: {joined_headlines}
- Sentiment: {sentiment_badge}
- P/E: {fast_data.get("pe_ratio", "N/A")}
- Debt/Equity: {fast_data.get("debt_equity", "N/A")}

Respond ONLY in this exact JSON format with no markdown:
{{
  "news_reasoning": "2 sentences explaining why stock moved today based on headlines",
  "ripple_effect": "2-3 sentences on how current macro events flow to this stock and affect other stocks in Indian markets",
  "contradiction": "1 sentence if sentiment and price direction contradict each other, empty string if they agree",
  "fundamental_verdict": "1 sentence on fundamental health - stable/stretched/under pressure",
  "volume_reasoning": "1 sentence explaining unusual volume if present, empty string if normal"
}}
""".strip()


def _parse_gemini_json(raw_text: str) -> dict:
    fallback = {
        "news_reasoning": "",
        "ripple_effect": "",
        "contradiction": "",
        "fundamental_verdict": "",
        "volume_reasoning": "",
    }

    try:
        cleaned = (raw_text or "").strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            return fallback

        return {
            "news_reasoning": str(parsed.get("news_reasoning", "") or ""),
            "ripple_effect": str(parsed.get("ripple_effect", "") or ""),
            "contradiction": str(parsed.get("contradiction", "") or ""),
            "fundamental_verdict": str(parsed.get("fundamental_verdict", "") or ""),
            "volume_reasoning": str(parsed.get("volume_reasoning", "") or ""),
        }
    except Exception:
        return fallback


@router.get("/{ticker}")
async def get_stock_intel(ticker: str, current_user: dict = Depends(get_current_user)):
    _ = current_user
    normalized_ticker = str(ticker).strip().upper()

    fast_data_task = asyncio.to_thread(_collect_fast_data, normalized_ticker)
    technicals_task = asyncio.to_thread(get_technical_indicators, normalized_ticker)
    headlines_task = asyncio.to_thread(fetch_news_headlines, normalized_ticker)

    fast_data, technicals, headlines = await asyncio.gather(
        fast_data_task,
        technicals_task,
        headlines_task,
    )

    scored_headlines = await asyncio.to_thread(run_finbert, headlines)
    sentiment_badge, sentiment_confidence, top_headlines = _build_sentiment(scored_headlines)

    prompt = _build_prompt(
        normalized_ticker,
        fast_data=fast_data,
        technicals=technicals,
        sentiment_badge=sentiment_badge,
        top_headlines=top_headlines,
    )
    gemini_raw = await asyncio.to_thread(get_gemini_response, prompt)
    gemini_data = _parse_gemini_json(gemini_raw)

    return {
        "price_snapshot": {
            "price": fast_data.get("price"),
            "change_pct": fast_data.get("change_pct"),
            "change_rs": fast_data.get("change_rs"),
            "week52_high": fast_data.get("week52_high"),
            "week52_low": fast_data.get("week52_low"),
            "market_cap": fast_data.get("market_cap"),
        },
        "volume": {
            "today": fast_data.get("volume"),
            "average": fast_data.get("average_volume"),
            "ratio": fast_data.get("volume_ratio"),
            "unusual": fast_data.get("unusual_volume"),
            "reasoning": gemini_data.get("volume_reasoning", ""),
        },
        "technicals": {
            "rsi": technicals.get("rsi"),
            "rsi_signal": technicals.get("rsi_signal"),
            "macd_signal": technicals.get("macd_signal"),
            "ma_signal": technicals.get("ma_signal"),
            "pattern": technicals.get("pattern"),
            "pattern_explanation": technicals.get("pattern_explanation"),
        },
        "sentiment": {
            "badge": sentiment_badge,
            "confidence": sentiment_confidence,
            "headlines": top_headlines,
        },
        "events": {
            "next_dividend_date": fast_data.get("next_dividend_date"),
            "next_dividend_amount": fast_data.get("next_dividend_amount"),
            "next_earnings": fast_data.get("next_earnings"),
        },
        "fundamentals": {
            "pe_ratio": fast_data.get("pe_ratio"),
            "debt_equity": fast_data.get("debt_equity"),
            "revenue_growth": fast_data.get("revenue_growth"),
            "profit_margins": fast_data.get("profit_margins"),
            "recommendation": fast_data.get("recommendation"),
            "verdict": gemini_data.get("fundamental_verdict", ""),
        },
        "gemini": {
            "news_reasoning": gemini_data.get("news_reasoning", ""),
            "ripple_effect": gemini_data.get("ripple_effect", ""),
            "contradiction": gemini_data.get("contradiction", ""),
            "fundamental_verdict": gemini_data.get("fundamental_verdict", ""),
        },
        "institutional_flow": {
            "available": False,
            "message": "FII/DII data requires NSE data feed integration",
        },
    }