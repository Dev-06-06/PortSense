import logging
import os
import time
from collections import Counter
from typing import Any

import requests
from dotenv import load_dotenv

logger = logging.getLogger(__name__)

load_dotenv()

NEWS_API_KEY = os.getenv("NEWS_API_KEY")
HF_API_KEY = os.getenv("HF_API_KEY")

COMPANY_NAMES = {
    "RELIANCE.NS": "Reliance Industries",
    "INFY.NS": "Infosys",
    "TCS.NS": "TCS Tata Consultancy",
    "HDFCBANK.NS": "HDFC Bank",
    "TATASTEEL.NS": "Tata Steel",
    "ADANIPOWER.NS": "Adani Power",
    "SUNPHARMA.NS": "Sun Pharma",
    "WIPRO.NS": "Wipro",
    "ICICIBANK.NS": "ICICI Bank",
    "SBIN.NS": "State Bank of India",
    "BAJFINANCE.NS": "Bajaj Finance",
    "MARUTI.NS": "Maruti Suzuki",
    "TATAMOTORS.NS": "Tata Motors",
    "ONGC.NS": "ONGC Oil",
    "NTPC.NS": "NTPC Power",
    "LT.NS": "Larsen Toubro",
}


def fetch_news_headlines(ticker: str) -> list:
    normalized_ticker = str(ticker).strip().upper()
    company_name = COMPANY_NAMES.get(normalized_ticker, normalized_ticker.replace(".NS", ""))

    if not NEWS_API_KEY:
        logger.error("Missing NEWS_API_KEY environment variable")
        return []

    try:
        logger.info("NewsAPI search company: %s", company_name)

        response = requests.get(
            "https://newsapi.org/v2/everything",
            params={
                "q": company_name,
                "pageSize": 5,
                "language": "en",
                "sortBy": "publishedAt",
            },
            headers={"X-Api-Key": NEWS_API_KEY},
            timeout=10,
        )
        response.raise_for_status()
        payload = response.json()

        articles = payload.get("articles", []) if isinstance(payload, dict) else []
        headlines = [
            article.get("title", "").strip()
            for article in articles
            if isinstance(article, dict) and article.get("title")
        ]
        return headlines
    except Exception as exc:
        logger.exception("Failed to fetch news for %s: %s", normalized_ticker, exc)
        return []


def run_finbert(headlines: list) -> list:
    if not headlines:
        return []

    if not HF_API_KEY:
        logger.error("Missing HF_API_KEY environment variable")
        return []

    try:
        response = requests.post(
            "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
            headers={"Authorization": f"Bearer {HF_API_KEY}"},
            json={"inputs": headlines},
            timeout=10,
        )

        if response.status_code == 503:
            logger.info("HuggingFace model loading, retrying...")
            time.sleep(10)
            response = requests.post(
                "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
                headers={"Authorization": f"Bearer {HF_API_KEY}"},
                json={"inputs": headlines},
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
    headlines = fetch_news_headlines(normalized_ticker)

    if not headlines:
        return {
            "ticker": normalized_ticker,
            "badge": "Neutral",
            "confidence": 0,
            "headlines": [],
        }

    scored_headlines = run_finbert(headlines)
    if not scored_headlines:
        return {
            "ticker": normalized_ticker,
            "badge": "Neutral",
            "confidence": 0,
            "headlines": [],
        }

    labels = [str(item.get("label", "neutral")).lower() for item in scored_headlines]
    label_counts = Counter(labels)

    majority_label, _ = label_counts.most_common(1)[0]
    majority_scores = [
        float(item.get("score", 0.0))
        for item in scored_headlines
        if str(item.get("label", "")).lower() == majority_label
    ]

    confidence = round(sum(majority_scores) / len(majority_scores), 2) if majority_scores else 0

    return {
        "ticker": normalized_ticker,
        "badge": _to_badge(majority_label),
        "confidence": confidence,
        "headlines": scored_headlines,
    }


def get_portfolio_sentiment(tickers: list) -> dict:
    stock_results = []

    for ticker in tickers:
        stock_results.append(get_stock_sentiment(str(ticker)))

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
