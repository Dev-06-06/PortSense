import asyncio
import itertools
import email.utils as _email_utils
import html
import logging
import os
import re
import threading
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import urllib.parse

import feedparser
from cachetools import TTLCache, cached as cachetools_cached
import httpx
import yfinance as yf
from dotenv import load_dotenv as _load_dotenv
from pathlib import Path as _Path
import time as _time

_hf_executor = ThreadPoolExecutor(max_workers=10)

_load_dotenv(dotenv_path=_Path(__file__).resolve().parents[2] / ".env")

logger = logging.getLogger(__name__)

_HF_KEY_1 = os.getenv("HF_API_KEY_1") or os.getenv("HF_API_KEY")
_HF_KEY_2 = os.getenv("HF_API_KEY_2")
_HF_KEYS = [k for k in [_HF_KEY_1, _HF_KEY_2] if k]
_hf_key_cycle = itertools.cycle(_HF_KEYS) if _HF_KEYS else None
_hf_key_lock = threading.Lock()


def _next_hf_key() -> str | None:
    if not _hf_key_cycle:
        return None
    with _hf_key_lock:
        return next(_hf_key_cycle)


GNEWS_STUDENT_KEY = os.getenv("GNEWS_STUDENT_KEY", "")
GNEWS_PERSONAL_KEY = os.getenv("GNEWS_PERSONAL_KEY", "")
_finbert_debug_logged = False
_gnews_semaphore = asyncio.Semaphore(3)


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


SENTIMENT_QUERIES = {
    "RELIANCE.NS": (
        "Reliance Industries OR RIL share price OR earnings OR "
        "results OR Jio OR Ambani OR NSE OR refinery"
    ),
    "INFY.NS": (
        "Infosys OR INFY share price OR earnings OR results OR "
        "guidance OR deal wins OR IT sector OR NSE OR buyback"
    ),
    "TCS.NS": (
        '"Tata Consultancy" OR TCS share price OR earnings OR '
        "results OR revenue OR IT sector OR NSE OR dividend OR AI"
    ),
    "HDFCBANK.NS": (
        '"HDFC Bank" share price OR earnings OR results OR NPA OR '
        "credit growth OR deposits OR NSE OR RBI OR merger"
    ),
    "ICICIBANK.NS": (
        '"ICICI Bank" share price OR earnings OR results OR NPA OR '
        "credit growth OR loans OR NSE OR RBI OR profit"
    ),
    "SBIN.NS": (
        '"State Bank" OR SBI share price OR earnings OR results OR '
        "NPA OR profit OR deposits OR NSE OR government bank"
    ),
    "AXISBANK.NS": (
        '"Axis Bank" share price OR earnings OR results OR NPA OR '
        "credit OR loans OR NSE OR profit"
    ),
    "KOTAKBANK.NS": (
        '"Kotak Bank" OR "Kotak Mahindra" share price OR earnings OR '
        "results OR NPA OR profit OR NSE OR CEO"
    ),
    "WIPRO.NS": (
        "Wipro share price OR earnings OR results OR guidance OR "
        "deal wins OR IT sector OR NSE OR revenue OR AI"
    ),
    "HCLTECH.NS": (
        '"HCL Tech" OR HCLTech share price OR earnings OR results OR '
        "deal wins OR IT sector OR NSE OR revenue OR guidance"
    ),
    "TECHM.NS": (
        '"Tech Mahindra" share price OR earnings OR results OR '
        "deal wins OR IT sector OR NSE OR revenue"
    ),
    "TATASTEEL.NS": (
        '"Tata Steel" share price OR earnings OR results OR steel OR '
        "production OR NSE OR profit OR capacity"
    ),
    "JSWSTEEL.NS": (
        '"JSW Steel" share price OR earnings OR results OR steel OR '
        "production OR NSE OR profit OR acquisition"
    ),
    "SUNPHARMA.NS": (
        '"Sun Pharma" OR "Sun Pharmaceutical" share price OR earnings OR '
        "results OR FDA OR drug OR approval OR NSE OR profit"
    ),
    "DRREDDY.NS": (
        '"Dr Reddy" share price OR earnings OR results OR FDA OR '
        "drug OR approval OR NSE OR profit OR generic"
    ),
    "CIPLA.NS": (
        "Cipla share price OR earnings OR results OR FDA OR "
        "drug OR approval OR NSE OR profit"
    ),
    "HINDUNILVR.NS": (
        '"Hindustan Unilever" OR HUL share price OR earnings OR '
        "results OR FMCG OR volume OR NSE OR profit"
    ),
    "ITC.NS": (
        "ITC share price OR earnings OR results OR cigarette OR "
        "FMCG OR NSE OR profit OR dividend OR demerger"
    ),
    "BAJFINANCE.NS": (
        '"Bajaj Finance" share price OR earnings OR results OR NPA OR '
        "AUM OR loans OR NBFC OR NSE OR profit"
    ),
    "BAJAJFINSV.NS": (
        '"Bajaj Finserv" share price OR earnings OR results OR '
        "insurance OR finance OR NSE OR profit OR AUM"
    ),
    "MARUTI.NS": (
        "Maruti OR \"Maruti Suzuki\" share price OR earnings OR "
        "results OR auto sales OR EV OR NSE OR profit"
    ),
    "TATAMOTORS.NS": (
        '"Tata Motors" OR JLR share price OR earnings OR results OR '
        "auto sales OR EV OR NSE OR profit OR Jaguar"
    ),
    "ONGC.NS": (
        "ONGC OR \"Oil Natural Gas\" share price OR earnings OR "
        "results OR oil OR gas OR NSE OR profit OR crude"
    ),
    "NTPC.NS": (
        "NTPC share price OR earnings OR results OR power OR "
        "capacity OR renewable OR NSE OR profit"
    ),
    "LT.NS": (
        '"Larsen Toubro" OR "L and T" share price OR earnings OR '
        "results OR order wins OR infrastructure OR NSE OR profit"
    ),
    "HAL.NS": (
        "HAL OR \"Hindustan Aeronautics\" share price OR earnings OR "
        "results OR defence OR order OR NSE OR profit OR aircraft"
    ),
    "BEL.NS": (
        "BEL OR \"Bharat Electronics\" share price OR earnings OR "
        "results OR defence OR order OR NSE OR profit"
    ),
    "IRCTC.NS": (
        "IRCTC share price OR earnings OR results OR railway OR "
        "tourism OR NSE OR profit OR bookings"
    ),
}


TIER_1_TICKERS = {
    "TCS.NS", "INFY.NS", "HDFCBANK.NS", "ICICIBANK.NS",
    "RELIANCE.NS", "HCLTECH.NS", "WIPRO.NS", "BAJFINANCE.NS",
    "SBIN.NS", "BHARTIARTL.NS", "TATAMOTORS.NS", "MARUTI.NS",
}

TIER_2_TICKERS = {
    "SUNPHARMA.NS", "DRREDDY.NS", "CIPLA.NS", "ONGC.NS",
    "TATASTEEL.NS", "JSWSTEEL.NS", "HINDUNILVR.NS", "ITC.NS",
    "AXISBANK.NS", "KOTAKBANK.NS", "LT.NS", "NTPC.NS",
    "TECHM.NS", "BAJAJFINSV.NS",
}

TIER_3_TICKERS = {
    "HAL.NS", "BEL.NS", "IRCTC.NS", "DIVISLAB.NS",
    "POWERGRID.NS", "COALINDIA.NS", "HINDALCO.NS",
    "ADANIENT.NS", "ADANIPOWER.NS", "NESTLEIND.NS",
    "TITAN.NS", "ASIANPAINT.NS", "ZOMATO.NS", "ULTRACEMCO.NS",
}


async def _fetch_gnews_for_ticker(ticker: str) -> list[dict]:
    async with _gnews_semaphore:
        normalized = str(ticker).strip().upper()
        company_raw = COMPANY_SEARCH_NAMES.get(
            normalized,
            normalized.replace(".NS", "").replace(".BO", "")
        )
        company_name = company_raw.split(" stock", 1)[0].strip()
        query = SENTIMENT_QUERIES.get(
            normalized,
            f"{company_name} share price OR earnings OR results OR NSE"
        )

        for api_key in [GNEWS_STUDENT_KEY, GNEWS_PERSONAL_KEY]:
            if not api_key:
                continue
            try:
                from datetime import datetime, timedelta

                from_date = (datetime.utcnow() - timedelta(days=2)).strftime(
                    "%Y-%m-%dT%H:%M:%SZ"
                )
                url = (
                    "https://gnews.io/api/v4/search"
                    f"?q={urllib.parse.quote(query)}"
                    "&lang=en&country=in&max=10"
                    f"&from={from_date}"
                    f"&sortby=publishedAt"
                    f"&apikey={api_key}"
                )
                async with httpx.AsyncClient(timeout=10.0) as client:
                    resp = await client.get(url)
                    if resp.status_code in (401, 403):
                        continue
                    if resp.status_code == 429:
                        await asyncio.sleep(2)
                        continue
                    resp.raise_for_status()
                    data = resp.json()

                articles = []
                for item in data.get("articles", []):
                    pub = str(item.get("publishedAt", "") or "")
                    pub_date = ""
                    if pub:
                        try:
                            from datetime import datetime as _dt

                            parsed = _dt.fromisoformat(pub.replace("Z", "+00:00"))
                            pub_date = parsed.strftime("%d %b %Y")
                        except Exception:
                            pub_date = pub[:10]

                    articles.append({
                        "title": str(item.get("title", "")).strip(),
                        "summary": str(item.get("description", "")).strip(),
                        "pubDate": pub_date,
                        "sourceName": str(
                            item.get("source", {}).get("name", "")
                        ).strip(),
                        "articleUrl": str(item.get("url", "")).strip(),
                    })
                if articles:
                    return articles
            except Exception:
                continue
        return []


def _fetch_gnews_for_ticker_sync(ticker: str) -> list[dict]:
    normalized = str(ticker).strip().upper()
    company_raw = COMPANY_SEARCH_NAMES.get(
        normalized,
        normalized.replace(".NS", "").replace(".BO", ""),
    )
    company_name = company_raw.split(" stock", 1)[0].strip()
    query = SENTIMENT_QUERIES.get(
        normalized,
        f"{company_name} share price OR earnings OR results OR NSE",
    )

    for api_key in [GNEWS_STUDENT_KEY, GNEWS_PERSONAL_KEY]:
        if not api_key:
            continue
        try:
            from datetime import datetime, timedelta

            if normalized in TIER_1_TICKERS:
                days_back = 7
            elif normalized in TIER_2_TICKERS:
                days_back = 7
            elif normalized in TIER_3_TICKERS:
                days_back = 7
            else:
                days_back = 7  # default for unlisted tickers

            from_date = (datetime.utcnow() - timedelta(days=days_back)).strftime(
                "%Y-%m-%dT%H:%M:%SZ"
            )
            url = (
                "https://gnews.io/api/v4/search"
                f"?q={urllib.parse.quote(query)}"
                "&lang=en&country=in&max=10"
                f"&from={from_date}"
                f"&sortby=publishedAt"
                f"&apikey={api_key}"
            )
            with httpx.Client(timeout=10.0) as client:
                resp = client.get(url)
                if resp.status_code in (401, 403):
                    continue
                if resp.status_code == 429:
                    _time.sleep(1)
                    continue
                resp.raise_for_status()
                data = resp.json()

            articles = []
            for item in data.get("articles", []):
                pub = str(item.get("publishedAt", "") or "")
                pub_date = ""
                if pub:
                    try:
                        from datetime import datetime as _dt

                        parsed = _dt.fromisoformat(pub.replace("Z", "+00:00"))
                        pub_date = parsed.strftime("%d %b %Y")
                    except Exception:
                        pub_date = pub[:10]

                articles.append(
                    {
                        "title": str(item.get("title", "")).strip(),
                        "summary": str(item.get("description", "")).strip(),
                        "pubDate": pub_date,
                        "sourceName": str(
                            item.get("source", {}).get("name", "")
                        ).strip(),
                        "articleUrl": str(item.get("url", "")).strip(),
                    }
                )

            if articles:
                return articles
        except Exception:
            continue

    # Return empty when both keys fail or produce zero items.
    return []


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
                import datetime as _dt

                pub_ts = item.get("providerPublishTime") or 0
                if pub_ts:
                    try:
                        pub_date = _dt.datetime.utcfromtimestamp(pub_ts).strftime("%d %b %Y")
                    except Exception:
                        pub_date = ""
                else:
                    pub_date = ""

                results.append({"title": title, "summary": summary, "pubDate": pub_date})
        return results
    except Exception as exc:
        logger.warning("yfinance news failed for %s: %s", ticker, exc)
        return []


def _fetch_google_news_rss(ticker: str) -> list[dict]:
    """Fallback source. Returns {title, summary} list."""
    normalized = str(ticker).upper()
    query = COMPANY_SEARCH_NAMES.get(
        normalized,
        normalized.replace(".NS", "").replace(".BO", "") + " NSE share price earnings results",
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

            raw_pub = entry.get("published", "") or entry.get("updated", "") or ""
            pub_date = ""
            pub_timestamp = 0
            if raw_pub:
                try:
                    parsed_dt = _email_utils.parsedate_to_datetime(raw_pub)
                    pub_timestamp = parsed_dt.timestamp()
                    pub_date = parsed_dt.strftime("%d %b %Y")
                except Exception:
                    pub_date = ""
                    pub_timestamp = 0

            # Skip articles older than 30 days
            if pub_timestamp > 0 and pub_timestamp < (_time.time() - 30 * 24 * 3600):
                continue

            if title:
                results.append({"title": title, "summary": summary, "pubDate": pub_date})
        return results
    except Exception as exc:
        logger.warning("Google News RSS failed for %s: %s", ticker, exc)
        return []


def fetch_news_articles(ticker: str) -> list[dict]:
    # Strict 2-day GNews only - no RSS fallback for sentiment
    # Stale news produces misleading FinBERT scores
    articles = _fetch_gnews_for_ticker_sync(ticker)
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


def _filter_and_deduplicate_headlines(headlines: list[str], company_name: str) -> list[str]:
    financial_keywords = {"results", "earnings", "profit", "revenue"}
    generic_market_phrases = ("sensex", "nifty", "market rally")
    company_words = {
        w
        for w in re.findall(r"[a-z0-9]+", str(company_name).lower())
        if len(w) > 2
    }

    def _tokenize(text: str) -> set[str]:
        return set(re.findall(r"[a-z0-9]+", text.lower()))

    kept_headlines: list[str] = []
    kept_word_sets: list[set[str]] = []

    for raw_headline in headlines:
        headline = str(raw_headline or "").strip()
        if not headline:
            continue

        all_tokens = re.findall(r"[a-z0-9]+", headline.lower())
        if len(all_tokens) < 8:
            continue

        words = _tokenize(headline)
        has_ipo = "ipo" in words
        has_financial_context = any(k in words for k in financial_keywords)
        if has_ipo and not has_financial_context:
            continue

        lower_headline = headline.lower()
        has_generic_market_phrase = any(
            phrase in lower_headline for phrase in generic_market_phrases
        )
        mentions_company = bool(company_words.intersection(words))
        if has_generic_market_phrase and not mentions_company:
            continue

        is_duplicate = False
        for existing_words in kept_word_sets:
            union = words | existing_words
            if not union:
                continue
            similarity = len(words & existing_words) / len(union)
            if similarity > 0.8:
                is_duplicate = True
                break

        if is_duplicate:
            continue

        kept_headlines.append(headline)
        kept_word_sets.append(words)

        if len(kept_headlines) >= 10:
            break

    return kept_headlines


async def run_finbert_scored(headlines: list[str]) -> list[dict]:
    if not headlines:
        return []

    if not _HF_KEYS:
        logger.error("Missing HF_API_KEY / HF_API_KEY_1 environment variable")
        return []

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            gathered = await asyncio.gather(
                *[_score_single_headline(client, headline, _next_hf_key()) for headline in headlines],
                return_exceptions=True,
            )
    except asyncio.CancelledError:
        return []

    results: list[dict] = []
    for result in gathered:
        if isinstance(result, Exception):
            results.append(
                {
                    "headline": "unknown",
                    "label": "neutral",
                    "score": 0.0,
                }
            )
            continue
        results.append(result)

    global _finbert_debug_logged
    if not _finbert_debug_logged:
        logger.debug(f"[FINBERT] {len(results)} headlines scored: {results}")
        _finbert_debug_logged = True

    return results


async def _score_single_headline(
    session: httpx.AsyncClient,
    headline: str,
    hf_api_key: str,
) -> dict:
    default_result = {
        "headline": headline,
        "label": "neutral",
        "score": 0.0,
    }

    for attempt in range(3):
        current_key = hf_api_key if attempt == 0 else _next_hf_key()
        if not current_key:
            return default_result
        logger.debug(f"[FINBERT] scored headline key: '{headline}'")
        try:
            response = await session.post(
                "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
                headers={"Authorization": f"Bearer {current_key}"},
                json={"inputs": headline},
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
                    return {
                        "headline": headline,
                        "label": str(best.get("label", "neutral")).lower(),
                        "score": round(float(best.get("score", 0.0)), 4),
                    }

            return default_result
        except HFColdModelError as exc:
            if attempt < 2:
                logger.info("FinBERT is temporarily unavailable, retrying...")
                await asyncio.sleep(3)
                continue
            logger.error(
                "[FINBERT] failed for headline: %s: %s",
                type(exc).__name__,
                exc,
            )
            return default_result
        except Exception as exc:
            logger.error(
                "[FINBERT] failed for headline: %s: %s",
                type(exc).__name__,
                exc,
            )
            return default_result

    return default_result


def _run_finbert_scored_sync(headlines: list[str]) -> list[dict]:
    if not headlines:
        return []
    if not _HF_KEYS:
        logger.error("Missing HF_API_KEY / HF_API_KEY_1 environment variable")
        return []

    import requests as _requests

    def _score_one(headline: str) -> dict:
        default = {"headline": headline, "label": "neutral", "score": 0.0}
        for attempt in range(3):
            try:
                resp = _requests.post(
                    "https://router.huggingface.co/hf-inference/models/ProsusAI/finbert",
                    headers={"Authorization": f"Bearer {_next_hf_key()}"},
                    json={"inputs": headline},
                    timeout=30,
                )
                if resp.status_code == 503:
                    if attempt < 2:
                        _time.sleep(3)
                        continue
                    return default
                resp.raise_for_status()
                payload = resp.json()
                if isinstance(payload, list) and payload:
                    label_scores = payload[0] if isinstance(payload[0], list) else payload
                    if isinstance(label_scores, list) and label_scores:
                        best = max(label_scores, key=lambda x: x.get("score", 0))
                        return {
                            "headline": headline,
                            "label": str(best.get("label", "neutral")).lower(),
                            "score": round(float(best.get("score", 0.0)), 4),
                        }
                return default
            except Exception as exc:
                logger.error("[FINBERT] failed for headline: %s: %s", type(exc).__name__, exc)
                return default
        return default

    futures = [_hf_executor.submit(_score_one, h) for h in headlines]
    return [f.result() for f in futures]


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
        badge = "Bullish"
        winning_count = positive
    elif negative > positive and negative > neutral:
        badge = "Bearish"
        winning_count = negative
    else:
        badge = "Neutral"
        winning_count = neutral
    
    confidence = round(winning_count / total, 2)
    
    return badge, confidence, scored_headlines


_sentiment_cache: TTLCache = TTLCache(maxsize=100, ttl=900)
_sentiment_cache_lock = threading.Lock()


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

    valid_articles = [a for a in articles if a.get("title")]
    prepared_headlines = _prepare_finbert_inputs(valid_articles)
    inferred_company_name = COMPANY_SEARCH_NAMES.get(
        ticker,
        ticker.replace(".NS", "").replace(".BO", ""),
    ).split(" stock", 1)[0].strip()
    finbert_inputs = _filter_and_deduplicate_headlines(
        prepared_headlines,
        inferred_company_name,
    )
    scored = _run_finbert_scored_sync(finbert_inputs) if finbert_inputs else []
    score_map = {
        str(item.get("headline", "")): item
        for item in scored
        if item.get("headline")
    }

    headlines_out = []
    for article in articles:
        prepared_title = _truncate(article.get("title", ""), 500)
        sentiment = score_map.get(prepared_title)
        headline_entry = {
            "headline": article["title"],
            "label": sentiment["label"] if sentiment else "neutral",
            "score": sentiment["score"] if sentiment else 0.0,
        }
        headline_entry["pubDate"] = str(article.get("pubDate", "") or "")
        headline_entry["sourceName"] = str(article.get("sourceName", "") or "")
        headline_entry["articleUrl"] = str(article.get("articleUrl", "") or "")
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
    await asyncio.sleep(0.3)
    return await asyncio.to_thread(get_stock_sentiment, ticker)


async def get_portfolio_sentiment(tickers: list) -> dict:
    try:
        stock_results = await asyncio.gather(
            *[_get_sentiment_bounded(str(ticker)) for ticker in tickers],
            return_exceptions=True,
        )
    except asyncio.CancelledError:
        return {
            "portfolioSignal": "Mixed",
            "stocks": [],
        }

    stock_results = list(stock_results)
    normalized_results: list[dict] = []
    for ticker, result in zip(tickers, stock_results):
        if isinstance(result, Exception):
            normalized_results.append(
                {
                    "ticker": str(ticker).strip().upper(),
                    "badge": "Neutral",
                    "confidence": 0,
                    "reason": "error",
                    "headlines": [],
                }
            )
            continue
        normalized_results.append(result)

    stock_results = normalized_results
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
