import os
import time
import urllib.parse
import xml.etree.ElementTree as ET
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, Query

from app.middleware.auth import get_current_user

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

router = APIRouter(tags=["news"])

GNEWS_STUDENT_KEY = os.getenv("GNEWS_STUDENT_KEY", "")
GNEWS_PERSONAL_KEY = os.getenv("GNEWS_PERSONAL_KEY", "")

CATEGORY_QUERIES = {
    "all": (
        "NSE OR BSE OR Nifty OR Sensex OR \"stock market\" OR "
        "\"share price\" OR \"Indian market\" OR \"Dalal Street\""
    ),
    "market": (
        "Nifty OR Sensex OR NSE OR BSE OR \"stock market\" OR "
        "\"market rally\" OR \"market crash\" OR \"bull run\" OR "
        "\"bear market\" OR FII OR DII OR \"foreign investors\" OR "
        "\"market outlook\" OR \"Dalal Street\" OR \"market cap\""
    ),
    "banking": (
        "\"HDFC Bank\" OR \"ICICI Bank\" OR SBI OR \"State Bank\" OR "
        "\"Axis Bank\" OR \"Kotak Bank\" OR RBI OR \"Reserve Bank\" OR "
        "\"interest rate\" OR \"repo rate\" OR \"bank nifty\" OR "
        "\"banking sector\" OR NPA OR \"credit growth\" OR NBFC"
    ),
    "it": (
        "Infosys OR TCS OR Wipro OR \"HCL Tech\" OR \"Tech Mahindra\" OR "
        "\"IT sector\" OR \"IT stocks\" OR \"Nifty IT\" OR "
        "\"artificial intelligence\" OR \"AI disruption\" OR "
        "\"software exports\" OR \"IT earnings\" OR \"deal wins\""
    ),
    "pharma": (
        "\"Sun Pharma\" OR \"Dr Reddy\" OR Cipla OR Divis OR Lupin OR "
        "\"pharma sector\" OR \"Nifty Pharma\" OR FDA OR USFDA OR "
        "\"drug approval\" OR \"pharma stocks\" OR \"healthcare India\""
    ),
    "auto": (
        "Maruti OR \"Tata Motors\" OR Mahindra OR \"Hero MotoCorp\" OR "
        "\"Bajaj Auto\" OR \"auto sector\" OR \"EV India\" OR "
        "\"electric vehicle\" OR \"auto sales\" OR \"Nifty Auto\" OR "
        "\"passenger vehicle\" OR \"two wheeler\""
    ),
    "energy": (
        "ONGC OR Reliance OR NTPC OR \"Power Grid\" OR \"Coal India\" OR "
        "\"Adani Power\" OR \"energy sector\" OR \"oil prices\" OR "
        "\"crude oil\" OR \"natural gas\" OR \"renewable energy\" OR "
        "\"solar energy\" OR \"Nifty Energy\""
    ),
    "finance": (
        "\"Bajaj Finance\" OR \"Bajaj Finserv\" OR HDFC OR "
        "\"Muthoot Finance\" OR \"Shriram Finance\" OR \"gold loan\" OR "
        "\"microfinance\" OR SIP OR NAV OR AMFI OR "
        "\"asset management\" OR \"wealth management\" OR AUM OR "
        "\"portfolio returns\" OR \"equity fund\" OR \"debt fund\""
    ),
    "mf": (
        "\"mutual fund\" OR SIP OR NAV OR AMFI OR \"fund house\" OR "
        "\"equity fund\" OR \"debt fund\" OR \"hybrid fund\" OR "
        "\"index fund\" OR ELSS OR \"liquid fund\" OR "
        "\"fund manager\" OR AUM OR NFO OR \"new fund offer\" OR "
        "\"SIP returns\" OR \"mutual fund returns\""
    ),
    "ipo": (
        "IPO OR \"initial public offering\" OR \"IPO listing\" OR "
        "GMP OR \"grey market premium\" OR \"IPO allotment\" OR "
        "\"IPO subscription\" OR \"anchor investors\" OR \"issue price\" OR "
        "\"SME IPO\" OR \"mainboard IPO\" OR \"NSE listing\" OR "
        "\"BSE listing\" OR oversubscribed OR \"unlisted shares\" OR "
        "\"IPO review\" OR \"IPO date\" OR \"IPO opens\""
    ),
    "economy": (
        "\"India GDP\" OR inflation OR CPI OR \"repo rate\" OR "
        "\"RBI policy\" OR \"monetary policy\" OR \"fiscal deficit\" OR "
        "\"trade deficit\" OR \"current account\" OR \"India economy\" OR "
        "\"economic growth\" OR IIP OR WPI OR "
        "\"consumer price\" OR \"wholesale inflation\" OR "
        "\"India growth rate\" OR \"economic data\""
    ),
    "sebi": (
        "SEBI OR \"Securities Exchange Board\" OR \"market regulator\" OR "
        "\"insider trading\" OR \"market manipulation\" OR "
        "\"SEBI order\" OR \"SEBI circular\" OR \"listing norms\" OR "
        "delisting OR \"market surveillance\" OR \"F&O ban\" OR "
        "\"derivatives regulation\" OR \"stock broker\" OR "
        "\"SEBI notice\" OR \"SEBI penalty\""
    ),
    "policy": (
        "\"Union Budget\" OR \"finance ministry\" OR \"finance minister\" OR "
        "\"Nirmala Sitharaman\" OR FII OR FDI OR \"foreign investment\" OR "
        "\"import duty\" OR \"export policy\" OR \"Make in India\" OR "
        "\"PLI scheme\" OR disinvestment OR PSU OR "
        "\"government spending\" OR \"economic reform\" OR "
        "\"tax policy\" OR \"GST\" OR \"corporate tax\""
    ),
    "rupee": (
        "\"Indian rupee\" OR \"USD INR\" OR \"rupee dollar\" OR "
        "\"forex reserves\" OR \"currency depreciation\" OR "
        "\"RBI intervention\" OR \"dollar index\" OR DXY OR "
        "\"rupee fall\" OR \"rupee rise\" OR \"exchange rate\" OR "
        "\"capital flows\" OR \"current account deficit\" OR "
        "\"rupee strengthens\" OR \"rupee weakens\""
    ),
}

_news_cache: dict = {}
_CACHE_TTL_SECONDS = 15 * 60


async def _fetch_gnews(query: str, api_key: str) -> list[dict]:
    if not api_key:
        return []
    try:
        from datetime import datetime, timedelta

        from_date = (datetime.utcnow() - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
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
            if resp.status_code in (401, 403, 429):
                return []
            resp.raise_for_status()
            data = resp.json()

        articles = []
        for item in data.get("articles", []):
            articles.append({
                "title": str(item.get("title", "")).strip(),
                "description": str(item.get("description", "")).strip(),
                "url": str(item.get("url", "")).strip(),
                "image": str(item.get("image", "")).strip(),
                "pubDate": str(item.get("publishedAt", "")).strip(),
                "source": str(item.get("source", {}).get("name", "")).strip(),
                "sourceUrl": str(item.get("source", {}).get("url", "")).strip(),
            })
        return articles
    except Exception:
        return []


async def _fetch_rss_fallback(query: str) -> list[dict]:
    try:
        rss_url = (
            "https://news.google.com/rss/search"
            f"?q={urllib.parse.quote(query)}"
            "&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:d"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(rss_url)
            response.raise_for_status()

        root = ET.fromstring(response.text)
        items = root.findall("./channel/item")
        articles = []
        for item in items[:15]:
            source_el = item.find("source")
            articles.append({
                "title": (item.findtext("title") or "").strip(),
                "description": "",
                "url": (item.findtext("link") or "").strip(),
                "image": "",
                "pubDate": (item.findtext("pubDate") or "").strip(),
                "source": (source_el.text or "").strip() if source_el is not None else "",
                "sourceUrl": "",
            })
        return articles
    except Exception:
        return []


@router.get("/feed")
async def get_news_feed(
    category: str = Query(
        default="all",
        pattern="^(all|market|banking|it|pharma|auto|energy|finance|mf|ipo|economy|sebi|policy|rupee)$",
    ),
    _current_user: dict = Depends(get_current_user),
):
    now = time.time()
    cached = _news_cache.get(category)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    query = CATEGORY_QUERIES[category]

    # Try student key first
    articles = await _fetch_gnews(query, GNEWS_STUDENT_KEY)

    # Fallback to personal key
    if not articles:
        articles = await _fetch_gnews(query, GNEWS_PERSONAL_KEY)

    # Fallback to RSS
    if not articles:
        articles = await _fetch_rss_fallback(query)

    payload = {
        "category": category,
        "articles": articles,
        "count": len(articles),
    }

    if articles:
        _news_cache[category] = (now, payload)

    return payload