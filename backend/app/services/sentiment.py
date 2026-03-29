import logging
import os
import re
import time
from collections import Counter

import feedparser
import requests
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

logger = logging.getLogger(__name__)

HF_API_KEY = os.getenv("HF_API_KEY")
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
    return text[:max_chars] if len(text) > max_chars else text


def _fetch_yfinance_news(ticker: str) -> list[dict]:
    """Primary source. Returns {title, summary} list."""
    try:
        stock = yf.Ticker(ticker)
        raw = stock.news or []
        results = []
        for item in raw[:7]:
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
    )
    try:
        feed = feedparser.parse(url)
        results = []
        for entry in feed.entries[:7]:
            title = str(entry.get("title", "")).strip()
            title = re.sub(r"\s*-\s*[^-]+$", "", title).strip()
            summary = re.sub(
                r"<[^>]+>", "", str(entry.get("summary", ""))
            ).strip()
            if title:
                results.append({"title": title, "summary": summary})
        return results
    except Exception as exc:
        logger.warning("Google News RSS failed for %s: %s", ticker, exc)
        return []


def fetch_news_articles(ticker: str) -> list[dict]:
    """
    Returns up to 5 articles as {title, summary}.
    Primary: yfinance. Supplement with Google RSS if < 3 results.
    """
    articles = _fetch_yfinance_news(ticker)

    if len(articles) < 3:
        existing = {a["title"][:40].lower() for a in articles}
        for rss in _fetch_google_news_rss(ticker):
            if rss["title"][:40].lower() not in existing:
                articles.append(rss)
                existing.add(rss["title"][:40].lower())
            if len(articles) >= 5:
                break

    return articles[:5]


def _prepare_finbert_inputs(articles: list[dict]) -> list[str]:
    """
    FinBERT input: titles only, max 80 chars.
    Never pass summaries or price context to FinBERT.
    """
    return [
        _truncate(a.get("title", ""), 80)
        for a in articles
        if a.get("title")
    ]


def run_finbert(headlines: list, price_context: dict | None = None) -> list:
    if not headlines:
        return []

    if not HF_API_KEY:
        logger.error("Missing HF_API_KEY environment variable")
        return []

    context = price_context or {}
    enriched_inputs = []
    for headline in headlines:
        if not context:
            enriched_inputs.append(headline)
            continue

        prefix_parts = []

        change_pct = context.get("change_pct")
        price = context.get("price")
        if change_pct is not None and price is not None:
            try:
                prefix_parts.append(f"Stock: {float(change_pct):+.2f}% today at ₹{price}.")
            except (TypeError, ValueError):
                prefix_parts.append(f"Stock: {change_pct}% today at ₹{price}.")
        elif change_pct is not None:
            try:
                prefix_parts.append(f"Stock: {float(change_pct):+.2f}% today.")
            except (TypeError, ValueError):
                prefix_parts.append(f"Stock: {change_pct}% today.")
        elif price is not None:
            prefix_parts.append(f"Stock: at ₹{price}.")

        rsi = context.get("rsi")
        rsi_signal = context.get("rsi_signal")
        if rsi is not None and rsi_signal is not None:
            prefix_parts.append(f"RSI {rsi} ({rsi_signal}).")
        elif rsi is not None:
            prefix_parts.append(f"RSI {rsi}.")
        elif rsi_signal is not None:
            prefix_parts.append(f"RSI signal: {rsi_signal}.")

        macd_signal = context.get("macd_signal")
        if macd_signal is not None:
            prefix_parts.append(f"MACD: {macd_signal}.")

        analyst_rating = context.get("analyst_rating")
        if analyst_rating is not None:
            prefix_parts.append(f"Analyst: {analyst_rating}.")

        if prefix_parts:
            enriched_inputs.append(f"{' '.join(prefix_parts)} News: {headline}")
        else:
            enriched_inputs.append(headline)

    try:
        response = requests.post(
            "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
            headers={"Authorization": f"Bearer {HF_API_KEY}"},
            json={"inputs": enriched_inputs},
            timeout=10,
        )

        if response.status_code == 503:
            logger.info("HuggingFace model loading, retrying...")
            time.sleep(10)
            response = requests.post(
                "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
                headers={"Authorization": f"Bearer {HF_API_KEY}"},
                json={"inputs": enriched_inputs},
                timeout=10,
            )

        response.raise_for_status()
        payload = response.json()

        if not isinstance(payload, list):
            logger.error("Unexpected FinBERT response shape: %s", payload)
            return []

        results = []
        for headline, item_scores in zip(headlines, payload):
            if not isinstance(item_scores, list) or not item_scores:
                continue

            valid_scores = [
                score_item
                for score_item in item_scores
                if isinstance(score_item, dict)
                and score_item.get("label") is not None
                and score_item.get("score") is not None
            ]
            if not valid_scores:
                continue

            top = max(valid_scores, key=lambda x: float(x.get("score", 0.0)))
            label = str(top.get("label", "neutral")).lower()
            score = float(top.get("score", 0.0))

            results.append(
                {
                    "headline": headline,
                    "label": label,
                    "score": score,
                }
            )

        return results
    except Exception as exc:
        logger.exception("Failed to run FinBERT sentiment: %s", exc)
        return []


def _to_badge(label: str) -> str:
    normalized = str(label).strip().lower()
    if normalized == "positive":
        return "Bullish"
    if normalized == "negative":
        return "Bearish"
    return "Neutral"


def get_stock_sentiment(ticker: str) -> dict:
    normalized_ticker = str(ticker).strip().upper()
    articles = fetch_news_articles(normalized_ticker)

    if not articles:
        return {
            "ticker": normalized_ticker,
            "badge": "Neutral",
            "confidence": 0,
            "headlines": [],
        }

    finbert_inputs = _prepare_finbert_inputs(articles)
    scored = run_finbert(finbert_inputs) if finbert_inputs else []

    headlines_out = []
    for i, article in enumerate(articles):
        sentiment = scored[i] if i < len(scored) else None
        headlines_out.append({
            "headline": article["title"],
            "summary": _truncate(article.get("summary", ""), 200),
            "label": sentiment["label"] if sentiment else "neutral",
            "score": sentiment["score"] if sentiment else 0.0,
        })

    if not scored:
        return {
            "ticker": normalized_ticker,
            "badge": "Neutral",
            "confidence": 0,
            "headlines": headlines_out,
        }

    labels = [str(s.get("label", "neutral")).lower() for s in scored]
    label_counts = Counter(labels)
    majority_label, _ = label_counts.most_common(1)[0]
    majority_scores = [
        float(s.get("score", 0.0))
        for s in scored
        if str(s.get("label", "")).lower() == majority_label
    ]
    confidence = (
        round(sum(majority_scores) / len(majority_scores), 2)
        if majority_scores
        else 0
    )

    return {
        "ticker": normalized_ticker,
        "badge": _to_badge(majority_label),
        "confidence": confidence,
        "headlines": headlines_out,
    }


async def get_portfolio_sentiment(tickers: list) -> dict:
    import asyncio

    loop = asyncio.get_event_loop()
    stock_results = await asyncio.gather(
        *[
            loop.run_in_executor(None, get_stock_sentiment, str(ticker))
            for ticker in tickers
        ]
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
