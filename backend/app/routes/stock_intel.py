import asyncio
import json
import logging
import re
import threading
from collections import Counter
from datetime import date, datetime
from typing import Any

from cachetools import TTLCache
import yfinance as yf
from fastapi import APIRouter, Depends
from motor.motor_asyncio import AsyncIOMotorCollection

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.gemini import get_gemini_response
from app.services.market import get_stock_info
from app.services.sentiment import (
    fetch_news_articles,
    _prepare_finbert_inputs,
    _truncate,
    run_finbert_scored,
)
from app.services.technical import get_technical_indicators


router = APIRouter()
logger = logging.getLogger(__name__)


_stock_intel_news_cache: TTLCache = TTLCache(maxsize=50, ttl=600)
_stock_intel_sentiment_cache: TTLCache = TTLCache(maxsize=50, ttl=900)
_stock_intel_gemini_cache: TTLCache = TTLCache(maxsize=50, ttl=600)
_stock_intel_news_lock = threading.Lock()


NEWS_REASONING_FALLBACK = (
    "Recent news coverage is mixed and does not show a strong directional sentiment."
)
RIPPLE_EFFECT_FALLBACK = (
    "Current developments do not yet show a clear second-order spillover across the market. "
    "Watch sector peers, key suppliers/customers, and benchmark indices for confirmation."
)


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


def _rsi_zone(rsi_value: Any) -> str:
    rsi = _to_float(rsi_value)
    if rsi is None:
        return "Neutral zone"
    if rsi > 70:
        return "Overbought (>70) — watch for reversal"
    if rsi < 30:
        return "Oversold (<30) — watch for bounce"
    return "Neutral zone"


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


def _default_fast_data(ticker: str) -> dict:
    return {
        "company_name": ticker,
        "sector": "Unknown",
        "industry": "Unknown",
        "price": None,
        "change_pct": None,
        "change_rs": None,
        "volume": None,
        "average_volume": None,
        "volume_ratio": None,
        "unusual_volume": False,
        "week52_high": None,
        "week52_low": None,
        "market_cap": None,
        "pe_ratio": 0.0,
        "debt_equity": "N/A",
        "revenue_growth": "N/A",
        "profit_margins": "N/A",
        "recommendation": "N/A",
        "next_dividend_date": None,
        "next_dividend_amount": None,
        "next_earnings": None,
    }


def _collect_fast_data(ticker: str) -> dict:
    try:
        ticker_obj = yf.Ticker(ticker)
        _raw_info = ticker_obj.info
        info = _raw_info if isinstance(_raw_info, dict) else {}
        ticker_info = info

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

        raw = ticker_info.get("debtToEquity")
        if raw is not None:
            debt_equity = round(raw / 100, 2)
        else:
            debt_equity = "N/A"

        revenue_growth = ticker_info.get("revenueGrowth")
        if revenue_growth is not None:
            revenue_growth = f"{round(float(revenue_growth) * 100, 1)}%"
        else:
            revenue_growth = "N/A"

        profit_margins = ticker_info.get("profitMargins")
        if profit_margins is not None:
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
            "company_name": str(info.get("longName") or info.get("shortName") or ticker).strip(),
            "sector": str(info.get("sector") or "Unknown").strip(),
            "industry": str(info.get("industry") or "Unknown").strip(),
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
    except Exception as exc:
        logger.warning("stock-intel fast data fetch failed for %s: %s", ticker, exc)
        return _default_fast_data(ticker)


def _build_sentiment(scored_headlines: list[dict]) -> tuple[str, float, list[str]]:
    if not scored_headlines:
        return "Neutral", 0.0, []

    label_counts = Counter(
        str(item.get("label", "neutral")).strip().lower()
        for item in scored_headlines
    )

    positive = label_counts.get("positive", 0)
    negative = label_counts.get("negative", 0)
    neutral = label_counts.get("neutral", 0)
    total = len(scored_headlines)

    if positive > negative and positive > neutral:
        badge = "Positive"
    elif negative > positive and negative > neutral:
        badge = "Negative"
    else:
        badge = "Neutral"

    winning_count = max(positive, negative, neutral)
    confidence = round(winning_count / total, 2) if total > 0 else 0.0

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
    news_context_str: str,
    top_headlines: list[str],
    portfolio_context: dict | None,
) -> str:
    company_name = fast_data.get("company_name") or ticker
    sector = fast_data.get("sector") or "Unknown"
    industry = fast_data.get("industry") or "Unknown"
    price = fast_data.get("price", "N/A")
    change_pct = fast_data.get("change_pct", "N/A")
    change_rs = fast_data.get("change_rs", "N/A")
    rsi_value = _to_float(technicals.get("rsi"), digits=1)
    rsi_signal = technicals.get("rsi_signal", "N/A")
    macd_signal = technicals.get("macd_signal", "N/A")
    w52_high = fast_data.get("week52_high", "N/A")
    w52_low = fast_data.get("week52_low", "N/A")

    try:
        pct_from_high = round((float(price) / float(w52_high) - 1) * 100, 1)
        w52_context = f"{pct_from_high}% from 52W high"
    except Exception:
        w52_context = "N/A"

    headline_lines = []
    for index in range(3):
        if index < len(top_headlines):
            headline_lines.append(f"{index + 1}. {top_headlines[index]}")
        else:
            headline_lines.append(f"{index + 1}. No additional headline available")
    top_headlines_block = "\n".join(headline_lines)

    portfolio_line = ""
    if portfolio_context is not None:
        holding_pct = float(portfolio_context.get("holding_pct", 0.0) or 0.0)
        pnl_pct = float(portfolio_context.get("pnl_pct", 0.0) or 0.0)
        days_held = int(portfolio_context.get("days_held", 0) or 0)
        portfolio_line = (
            f"\nPortfolio Context:\n"
            f"- This stock is {holding_pct:.1f}% of the user's portfolio\n"
            f"- Current P&L on this holding: {pnl_pct:+.1f}%\n"
            f"- Days held: {days_held} "
            f"({'LTCG eligible' if days_held >= 365 else 'STCG applies'})\n"
        )

    return f"""
You are a financial analyst briefing an Indian retail investor on {ticker}.

Company: {company_name}
Sector: {sector}
Industry: {industry}

Price Context:
- Price: ₹{price} ({change_pct}% today)
- 52W Range: ₹{w52_low} – ₹{w52_high} ({w52_context})
- Volume: {fast_data.get("volume_ratio", "N/A")}x average {"⚠ UNUSUAL" if fast_data.get("unusual_volume") else ""}

Technical Signals:
    - RSI: {rsi_value if rsi_value is not None else 'N/A'} ({technicals.get("rsi_signal", "N/A")})
- MACD: {technicals.get("macd_signal", "N/A")}
- Moving Averages: {technicals.get("ma_signal", "N/A")}
- Pattern: {technicals.get("pattern", "N/A")}
    - RSI Zone: {_rsi_zone(technicals.get('rsi'))}

News & Sentiment (FinBERT: {sentiment_badge}):
{news_context_str}

Top 3 News Headlines:
{top_headlines_block}

Mandatory Context For Reasoning:
- Price change: {change_rs} ({change_pct}%)
- RSI signal: {rsi_signal}
- MACD signal: {macd_signal}
- Analyst rating: {fast_data.get("recommendation", "N/A")}
- Diversification impact: this stock is {portfolio_line if portfolio_line else "not in user portfolio"}
- Top headlines and summaries are listed above (use headlines even if summary is unavailable)

Second-Order Effects Task (for ripple_effect):
- Explain possible second-order market effects of the current news + technical setup.
- Specifically consider: sector peer impact, supplier/customer impact, and broader index movement.
- Write a short paragraph in exactly 2 or 3 concise sentences.

Fundamentals:
- P/E: {fast_data.get("pe_ratio", "N/A")}
- Debt/Equity: {fast_data.get("debt_equity", "N/A")}
- Revenue Growth: {fast_data.get("revenue_growth", "N/A")}
- Profit Margin: {fast_data.get("profit_margins", "N/A")}
- Analyst Rating: {fast_data.get("recommendation", "N/A")}
- 52W Position: {'Near 52W High (top 10%)' if (w52_high and price and price > 0.9 * w52_high) else 'Near 52W Low (bottom 10%)' if (w52_low and price and price < 1.1 * w52_low) else 'Mid-range'}
{portfolio_line}

Base action_signal on confluence: if 2+ of (RSI signal, MACD signal, FinBERT sentiment, analyst rating) agree → signal that direction. If conflicting → HOLD.

Respond ONLY in this exact JSON format with no markdown:
{{
  "news_reasoning": "2 sentences explaining why this stock moved today based on the news and price action",
    "ripple_effect": "2-3 concise sentences on second-order effects covering sector peers, supply chain links, and index movement",
  "contradiction": "1 sentence if FinBERT sentiment contradicts price direction, empty string if they agree",
  "fundamental_verdict": "1 sentence on fundamental health based on P/E, margins, debt, analyst view",
  "volume_reasoning": "1 sentence explaining unusual volume if present, empty string if normal volume",
  "action_signal": "exactly one of: BUY / HOLD / SELL — based on technical + fundamental + sentiment confluence. Must be a single word."
}}
""".strip()


def _ensure_two_to_three_sentences(text: str, fallback: str) -> str:
    cleaned = str(text or "").strip()
    if not cleaned:
        return fallback

    parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", cleaned) if part.strip()]
    if len(parts) < 2:
        return fallback

    return " ".join(parts[:3])


def _parse_gemini_json(raw_text: str) -> dict:
    fallback = {
        "news_reasoning": NEWS_REASONING_FALLBACK,
        "ripple_effect": RIPPLE_EFFECT_FALLBACK,
        "contradiction": "",
        "fundamental_verdict": "",
        "volume_reasoning": "",
        "action_signal": "HOLD",
    }

    try:
        cleaned = (raw_text or "").strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.replace("```json", "").replace("```", "").strip()
        parsed = json.loads(cleaned)
        if not isinstance(parsed, dict):
            return fallback

        news_reasoning = str(parsed.get("news_reasoning", "") or "").strip()
        ripple_effect = str(parsed.get("ripple_effect", "") or "").strip()
        ripple_effect = _ensure_two_to_three_sentences(ripple_effect, RIPPLE_EFFECT_FALLBACK)

        return {
            "news_reasoning": news_reasoning or NEWS_REASONING_FALLBACK,
            "ripple_effect": ripple_effect,
            "contradiction": str(parsed.get("contradiction", "") or ""),
            "fundamental_verdict": str(parsed.get("fundamental_verdict", "") or ""),
            "volume_reasoning": str(parsed.get("volume_reasoning", "") or ""),
            "action_signal": str(parsed.get("action_signal", "HOLD") or "HOLD"),
        }
    except Exception:
        return fallback


@router.get("/{ticker}")
async def get_stock_intel(
    ticker: str,
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    normalized_ticker = str(ticker).strip().upper()

    with _stock_intel_news_lock:
        articles = _stock_intel_news_cache.get(normalized_ticker)

    if articles is None:
        articles = await asyncio.to_thread(fetch_news_articles, normalized_ticker)
        with _stock_intel_news_lock:
            _stock_intel_news_cache[normalized_ticker] = articles

    fast_data_task = asyncio.to_thread(_collect_fast_data, normalized_ticker)
    technicals_task = asyncio.to_thread(get_technical_indicators, normalized_ticker)

    fast_data, technicals = await asyncio.gather(
        fast_data_task,
        technicals_task,
        return_exceptions=True,
    )

    if isinstance(fast_data, Exception):
        logger.warning("stock-intel fast data task failed for %s: %s", normalized_ticker, fast_data)
        fast_data = _default_fast_data(normalized_ticker)

    if isinstance(technicals, Exception):
        logger.warning("stock-intel technical task failed for %s: %s", normalized_ticker, technicals)
        technicals = get_technical_indicators(normalized_ticker)

    user_holdings = await holdings_collection.find(
        {"userId": current_user.get("_id")}
    ).to_list(length=None)

    portfolio_context = None
    if user_holdings:
        unique_tickers = list({
            str(h.get("ticker", "")).strip().upper()
            for h in user_holdings
            if str(h.get("assetType", "stock")).strip().lower() == "stock"
        })

        stock_infos = await asyncio.gather(
            *[asyncio.to_thread(get_stock_info, holding_ticker) for holding_ticker in unique_tickers]
        ) if unique_tickers else []

        price_by_ticker = {}
        for holding_ticker, stock_info in zip(unique_tickers, stock_infos):
            current_price = _to_float(stock_info.get("currentPrice")) or 0.0
            price_by_ticker[holding_ticker] = current_price

        total_portfolio_value = 0.0
        matched_holding = None
        matched_current_price = 0.0

        for holding in user_holdings:
            holding_ticker = str(holding.get("ticker", "")).strip().upper()
            quantity = _to_float(holding.get("quantity")) or 0.0
            current_price = price_by_ticker.get(holding_ticker, 0.0)

            total_portfolio_value += current_price * quantity

            if matched_holding is None and holding_ticker == normalized_ticker:
                matched_holding = holding
                matched_current_price = current_price

        if matched_holding is not None and total_portfolio_value > 0:
            quantity = _to_float(matched_holding.get("quantity")) or 0.0
            buy_price = _to_float(matched_holding.get("buyPrice"))
            holding_value = matched_current_price * quantity
            holding_pct = (holding_value / total_portfolio_value) * 100.0

            pnl_pct = 0.0
            if buy_price not in (None, 0):
                pnl_pct = ((matched_current_price - buy_price) / buy_price) * 100.0

            buy_date_value = matched_holding.get("buyDate")
            buy_date = None
            if isinstance(buy_date_value, datetime):
                buy_date = buy_date_value.date()
            elif isinstance(buy_date_value, date):
                buy_date = buy_date_value
            elif hasattr(buy_date_value, "to_pydatetime"):
                try:
                    buy_date = buy_date_value.to_pydatetime().date()
                except Exception:
                    buy_date = None
            elif isinstance(buy_date_value, str):
                try:
                    buy_date = datetime.fromisoformat(buy_date_value.replace("Z", "+00:00")).date()
                except Exception:
                    buy_date = None

            days_held = (date.today() - buy_date).days if buy_date else 0

            portfolio_context = {
                "holding_pct": holding_pct,
                "pnl_pct": pnl_pct,
                "days_held": days_held,
            }

    # Build enriched news context for Gemini with top 3 headlines and summaries (if available).
    news_context_lines = []
    top_articles = articles[:3]
    for index, art in enumerate(top_articles, start=1):
        title = _truncate(art.get("title", ""), 120).strip() or "No headline provided"
        summary = _truncate(art.get("summary", ""), 220).strip()
        if summary:
            news_context_lines.append(f"{index}. Headline: {title} | Summary: {summary}")
        else:
            news_context_lines.append(f"{index}. Headline: {title} | Summary: Not available")

    if len(top_articles) < 3:
        for index in range(len(top_articles) + 1, 4):
            news_context_lines.append(
                f"{index}. Headline: No additional headline available | Summary: Not available"
            )
    news_context_str = (
        "\n".join(news_context_lines)
        if news_context_lines
        else "No major headlines"
    )

    placeholder_top_headlines = [
        _truncate(art.get("title", ""), 120).strip()
        for art in top_articles
        if _truncate(art.get("title", ""), 120).strip()
    ]

    prompt = _build_prompt(
        normalized_ticker,
        fast_data=fast_data,
        technicals=technicals,
        sentiment_badge="Analyzing...",
        news_context_str=news_context_str,
        top_headlines=placeholder_top_headlines,
        portfolio_context=portfolio_context,
    )

    finbert_inputs = _prepare_finbert_inputs(articles)
    cache_key_sentiment = normalized_ticker
    if cache_key_sentiment in _stock_intel_sentiment_cache:
        scored_headlines = _stock_intel_sentiment_cache[cache_key_sentiment]
    else:
        scored_headlines = await run_finbert_scored(finbert_inputs) if finbert_inputs else []
        _stock_intel_sentiment_cache[cache_key_sentiment] = scored_headlines

    cache_key_gemini = f"{normalized_ticker}:{date.today().isoformat()}"
    if cache_key_gemini in _stock_intel_gemini_cache:
        gemini_raw = _stock_intel_gemini_cache[cache_key_gemini]
    else:
        gemini_raw = await asyncio.to_thread(get_gemini_response, prompt)
        _stock_intel_gemini_cache[cache_key_gemini] = gemini_raw

    # Build a lookup by headline text instead of positional index
    score_lookup = {
        item["headline"]: item
        for item in scored_headlines
    }

    sentiment_input = []
    for art in articles:
        title = art.get("title", "").strip()
        sc = score_lookup.get(title, {})
        sentiment_input.append({
            "headline": title,
            "label": sc.get("label", "neutral"),
            "score": sc.get("score", 0.0),
        })

    logger.debug(f"[SENTIMENT] score_lookup keys: {list(score_lookup.keys())}")
    logger.debug(f"[SENTIMENT] sentiment_input labels: {[s['label'] for s in sentiment_input]}")
    logger.debug(f"[SENTIMENT] sentiment_input count: {len(sentiment_input)}")
    sentiment_badge, sentiment_confidence, top_headlines = _build_sentiment(
        sentiment_input
    )
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
            "headlines": [
                {
                    "headline": item["headline"],
                    "summary": next(
                        (a.get("summary", "") for a in articles
                         if a["title"] == item["headline"]),
                        "",
                    ),
                    "label": item.get("label", "neutral"),
                }
                for item in sentiment_input
            ],
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