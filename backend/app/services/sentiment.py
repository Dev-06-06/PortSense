import asyncio
import html
import logging
import os
import re
import threading
from collections import Counter

import feedparser
from cachetools import TTLCache, cached as cachetools_cached
import requests
import yfinance as yf
from dotenv import load_dotenv
import time as _time

load_dotenv()

logger = logging.getLogger(__name__)

HF_API_KEY = os.getenv("HF_API_KEY")
_finbert_debug_logged = False


class HFColdModelError(RuntimeError):
    pass


COMPANY_SEARCH_NAMES = {
    "RELIANCE.NS": "Reliance Industries stock NSE",
    "INFY.NS": "Infosys stock NSE",
    "TCS.NS": "TCS Tata Consultancy stock NSE",
    "HDFCBANK.NS": "HDFC Bank stock NSE",
    "ICICIBANK.NS": "ICICI Bank stock NSE",
    "SBIN.NS": "State Bank India SBI stock NSE",
    "AXISBANK.NS": "Axis Bank stock NSE",
    "TATASTEEL.NS": "Tata Steel stock NSE",
    "JSWSTEEL.NS": "JSW Steel stock NSE",
    "ADANIPOWER.NS": "Adani Power stock NSE",
    "ADANIENT.NS": "Adani Enterprises stock NSE",
    "SUNPHARMA.NS": "Sun Pharma stock NSE",
    "DRREDDY.NS": "Dr Reddys stock NSE",
    "CIPLA.NS": "Cipla stock NSE",
    "WIPRO.NS": "Wipro stock NSE",
    "HCLTECH.NS": "HCL Technologies stock NSE",
    "TECHM.NS": "Tech Mahindra stock NSE",
    "BAJFINANCE.NS": "Bajaj Finance stock NSE",
    "BAJAJFINSV.NS": "Bajaj Finserv stock NSE",
    "MARUTI.NS": "Maruti Suzuki stock NSE",
    "TATAMOTORS.NS": "Tata Motors stock NSE",
    "ONGC.NS": "ONGC oil stock NSE",
    "NTPC.NS": "NTPC power stock NSE",
    "POWERGRID.NS": "Power Grid stock NSE",
    "LT.NS": "Larsen Toubro L&T stock NSE",
    "HINDUNILVR.NS": "Hindustan Unilever stock NSE",
    "ITC.NS": "ITC stock NSE",
    "TITAN.NS": "Titan stock NSE",
    "ASIANPAINT.NS": "Asian Paints stock NSE",
    "BHARTIARTL.NS": "Bharti Airtel stock NSE",
    "ZOMATO.NS": "Zomato stock NSE",
    "COALINDIA.NS": "Coal India stock NSE",
    "ULTRACEMCO.NS": "UltraTech Cement stock NSE",
    "NESTLEIND.NS": "Nestle India stock NSE",
    "DIVISLAB.NS": "Divis Laboratories stock NSE",
}


def _truncate(text: str, max_chars: int) -> str:
    text = str(text or "").strip()
    if len(text) <= max_chars:
        return text
    truncated = text[:max_chars].rsplit(" ", 1)[0]
    return truncated or text[:max_chars]


def _fetch_yfinance_news(ticker: str) -> list[dict]:
    """Primary source. Returns {title, summary} list — last 7 days only."""
    try:
        stock = yf.Ticker(ticker)
        raw = stock.news or []
        cutoff = _time.time() - (7 * 24 * 3600)
        results = []
        for item in raw[:15]:
            publish_time = item.get("providerPublishTime") or 0
            if publish_time and publish_time < cutoff:
                continue
            content = (
                item.get("content", {})
                if isinstance(item.get("content"), dict)
                else {}
            )
            title = (
                item.get("title") or content.get("title") or ""
            ).strip()
            summary = (
                item.get("summary")
                or content.get("summary")
                or content.get("description")
                or ""
            ).strip()
            if title:
                results.append({"title": title, "summary": summary})
        return results
    except Exception as exc:
        logger.warning("yfinance news failed for %s: %s", ticker, exc)
        return []


def _fetch_google_news_rss(ticker: str) -> list[dict]:
    """Fallback source. Returns {title, summary} list."""
    normalized = str(ticker).upper()
    query = COMPANY_SEARCH_NAMES.get(
        normalized,
        normalized.replace(".NS", "").replace(".BO", "") + " stock India NSE",
    )
    url = (
        "https://news.google.com/rss/search"
        f"?q={query.replace(' ', '+')}"
        "&hl=en-IN&gl=IN&ceid=IN:en"
        "&tbs=qdr:w"
    )
    try:
        feed = feedparser.parse(url)
        results = []
        for entry in feed.entries[:10]:
            title = str(entry.get("title", "")).strip()
            title = title.encode("utf-8", errors="replace").decode("utf-8")
            # Remove replacement characters
            title = title.replace("\ufffd", "'")
            title = html.unescape(title)
            if "\xa0\xa0" in title:
                title = title.split("\xa0\xa0")[0].strip()
            title = re.sub(r"\s*-\s*[^-]+$", "", title).strip()
            summary = re.sub(
                r"<[^>]+>", "", str(entry.get("summary", ""))
            ).strip()
            summary = html.unescape(summary)
            if "\xa0\xa0" in summary:
                summary = summary.split("\xa0\xa0")[0].strip()
            if title:
                results.append({"title": title, "summary": summary})
        return results
    except Exception as exc:
        logger.warning("Google News RSS failed for %s: %s", ticker, exc)
        return []


def fetch_news_articles(ticker: str) -> list[dict]:
    """
    Returns up to 8 articles as {title, summary}.
    Primary: Google News RSS (more relevant for Indian stocks).
    Supplement with yfinance if RSS returns fewer than 4 results.
    """
    articles = _fetch_google_news_rss(ticker)

    if len(articles) < 4:
        existing = {a["title"][:40].lower() for a in articles}
        for item in _fetch_yfinance_news(ticker):
            if item["title"][:40].lower() not in existing:
                articles.append(item)
                existing.add(item["title"][:40].lower())
            if len(articles) >= 8:
                break

    return articles[:8]


def _prepare_finbert_inputs(articles: list[dict]) -> list[str]:
    """
    FinBERT input: titles only, max 500 chars.
    Never pass summaries or price context to FinBERT.
    """
    return [
        _truncate(a.get("title", ""), 500)
        for a in articles
        if a.get("title")
    ]


async def run_finbert_scored(headlines: list[str]) -> list[dict]:
    if not headlines:
        return []

    if not HF_API_KEY:
        logger.error("Missing HF_API_KEY environment variable")
        return []

    results: list[dict] = []
    for headline in headlines:
        logger.debug(f"[FINBERT] scored headline key: '{headline}'")
        try:
            response = await asyncio.to_thread(
                requests.post,
                "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
                headers={"Authorization": f"Bearer {HF_API_KEY}"},
                json={"inputs": headline},
                timeout=10,
            )

            if response.status_code == 503:
                raise HFColdModelError("HuggingFace model is loading")

            response.raise_for_status()
            payload = response.json()
            logger.debug(f"[FINBERT] payload for '{str(headline)[:40]}': {payload}")

            if isinstance(payload, list) and len(payload) > 0:
                label_scores = payload[0] if isinstance(payload[0], list) else payload
                if isinstance(label_scores, list) and label_scores:
                    best = max(label_scores, key=lambda x: x.get("score", 0))
                    results.append(
                        {
                            "headline": headline,
                            "label": str(best.get("label", "neutral")).lower(),
                            "score": round(float(best.get("score", 0.0)), 4),
                        }
                    )
                    continue

            results.append(
                {
                    "headline": headline,
                    "label": "neutral",
                    "score": 0.0,
                }
            )
        except Exception as exc:
            logger.error(
                "[FINBERT] failed for headline: %s: %s",
                type(exc).__name__,
                exc,
            )
            results.append(
                {
                    "headline": headline,
                    "label": "neutral",
                    "score": 0.0,
                }
            )

    global _finbert_debug_logged
    if not _finbert_debug_logged:
        logger.debug(f"[FINBERT] {len(results)} headlines scored: {results}")
        _finbert_debug_logged = True

    return results


def _run_finbert_scored_sync(headlines: list[str], retries: int = 2, delay_seconds: float = 3.0) -> list[dict]:
    if not headlines:
        return []

    attempts = max(1, int(retries) + 1)
    for attempt in range(attempts):
        try:
            return asyncio.run(run_finbert_scored(headlines))
        except (HFColdModelError, requests.Timeout):
            if attempt >= attempts - 1:
                return []
            logger.info("FinBERT is temporarily unavailable, retrying...")
            _time.sleep(delay_seconds)
        except Exception as exc:
            logger.warning("Failed to run FinBERT sentiment: %s", exc)
            return []

    return []


def _to_badge(label: str) -> str:
    normalized = str(label).strip().lower()
    if normalized == "positive":
        return "Bullish"
    if normalized == "negative":
        return "Bearish"
    return "Neutral"


def _aggregate_headline_sentiment(scored_headlines: list[dict]) -> tuple[str, float, list[dict]]:
    from collections import Counter
    
    if not scored_headlines:
        return "Neutral", 0.0, []
    
    label_counts = Counter(h["label"] for h in scored_headlines)
    
    positive = label_counts.get("positive", 0)
    negative = label_counts.get("negative", 0)
    neutral  = label_counts.get("neutral", 0)
    total    = len(scored_headlines)
    
    if positive > negative and positive > neutral:
        badge = "Positive"
        winning_count = positive
    elif negative > positive and negative > neutral:
        badge = "Negative"
        winning_count = negative
    else:
        badge = "Neutral"
        winning_count = neutral
    
    confidence = round(winning_count / total, 2)
    
    return badge, confidence, scored_headlines


_sentiment_cache: TTLCache = TTLCache(maxsize=100, ttl=900)
_sentiment_cache_lock = threading.Lock()
_hf_semaphore = asyncio.Semaphore(3)


def get_stock_sentiment(ticker: str) -> dict:
    normalized_ticker = str(ticker).strip().upper()
    try:
        return _get_stock_sentiment_cached(normalized_ticker)
    except HFColdModelError:
        logger.info("HuggingFace model loading, retrying...")
        _time.sleep(3)
        return _get_stock_sentiment_cached(normalized_ticker)


@cachetools_cached(cache=_sentiment_cache, lock=_sentiment_cache_lock)
def _get_stock_sentiment_cached(ticker: str) -> dict:
    articles = fetch_news_articles(ticker)

    if not articles:
        return {
            "ticker": ticker,
            "badge": "Neutral",
            "confidence": 0,
            "reason": "no_articles",
            "headlines": [],
        }

    valid = [(i, a) for i, a in enumerate(articles) if a.get("title")]
    finbert_inputs = _prepare_finbert_inputs([a for _, a in valid])
    scored = _run_finbert_scored_sync(finbert_inputs) if finbert_inputs else []
    score_map = {
        orig_idx: scored[j]
        for j, (orig_idx, _) in enumerate(valid)
        if j < len(scored)
    }

    headlines_out = []
    for i, article in enumerate(articles):
        sentiment = score_map.get(i)
        headline_entry = {
            "headline": article["title"],
            "label": sentiment["label"] if sentiment else "neutral",
            "score": sentiment["score"] if sentiment else 0.0,
        }
        summary_text = str(article.get("summary", "") or "").strip()
        if summary_text:
            headline_entry["summary"] = _truncate(summary_text, 200)
        headlines_out.append(headline_entry)

    if not scored:
        return {
            "ticker": ticker,
            "badge": "Neutral",
            "confidence": 0,
            "reason": "api_error",
            "headlines": headlines_out,
        }

    badge, confidence, _ = _aggregate_headline_sentiment(scored)

    if badge == "Neutral":
        return {
            "ticker": ticker,
            "badge": "Neutral",
            "confidence": confidence,
            "reason": "neutral",
            "headlines": headlines_out,
        }

    return {
        "ticker": ticker,
        "badge": badge,
        "confidence": confidence,
        "reason": "scored",
        "headlines": headlines_out,
    }


async def _get_sentiment_bounded(ticker: str) -> dict:
    async with _hf_semaphore:
        return await asyncio.to_thread(get_stock_sentiment, ticker)


async def get_portfolio_sentiment(tickers: list) -> dict:
    stock_results = await asyncio.gather(
        *[_get_sentiment_bounded(str(ticker)) for ticker in tickers]
    )
    stock_results = list(stock_results)
    badge_counts = Counter(str(item.get("badge", "Neutral")) for item in stock_results)
    bullish = badge_counts.get("Bullish", 0)
    bearish = badge_counts.get("Bearish", 0)

    if bullish > bearish:
        portfolio_signal = "Overall Bullish"
    elif bearish > bullish:
        portfolio_signal = "Overall Bearish"
    else:
        portfolio_signal = "Mixed"

    return {
        "portfolioSignal": portfolio_signal,
        "stocks": stock_results,
    }
