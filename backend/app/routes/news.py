import time
import urllib.parse
import xml.etree.ElementTree as ET

import httpx
from fastapi import APIRouter, Depends, Query

from app.middleware.auth import get_current_user


router = APIRouter(tags=["news"])

CATEGORY_QUERIES = {
    "market": "Nifty Sensex NSE BSE India stock market",
    "banking": "HDFC ICICI SBI Axis bank India NSE",
    "it": "Infosys TCS Wipro HCL IT sector NSE",
    "pharma": "Sun Pharma Dr Reddy Cipla Divis pharma NSE",
    "auto": "Maruti Tata Motors auto sector NSE India",
    "energy": "ONGC NTPC Adani Power Coal India energy NSE",
    "all": "NSE BSE India stock market today",
}

_news_cache = {}
_CACHE_TTL_SECONDS = 15 * 60


@router.get("/feed")
async def get_news_feed(
    category: str = Query(
        default="all",
        pattern="^(all|market|banking|it|pharma|auto|energy)$",
    ),
    _current_user: dict = Depends(get_current_user),
):
    now = time.time()
    cached = _news_cache.get(category)
    if cached and (now - cached[0]) < _CACHE_TTL_SECONDS:
        return cached[1]

    query = CATEGORY_QUERIES[category]
    rss_url = (
        "https://news.google.com/rss/search"
        f"?q={urllib.parse.quote(query)}&hl=en-IN&gl=IN&ceid=IN:en&tbs=qdr:d"
    )

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(rss_url)
            response.raise_for_status()

        root = ET.fromstring(response.text)
        items = root.findall("./channel/item")

        articles = []
        for item in items[:20]:
            source_el = item.find("source")
            articles.append(
                {
                    "title": (item.findtext("title") or "").strip(),
                    "link": (item.findtext("link") or "").strip(),
                    "pubDate": (item.findtext("pubDate") or "").strip(),
                    "source": (source_el.text or "").strip() if source_el is not None else "",
                }
            )

        if not articles:
            return {
                "category": category,
                "articles": [],
                "count": 0,
                "error": "News feed unavailable",
            }

        payload = {
            "category": category,
            "articles": articles,
            "count": len(articles),
        }
        _news_cache[category] = (now, payload)
        return payload
    except Exception:
        return {
            "category": category,
            "articles": [],
            "count": 0,
            "error": "News feed unavailable",
        }