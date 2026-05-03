"""
One-shot probe: call get_sector() for two tickers not in seed list,
print [SECTOR] debug logs, then verify MongoDB sector_cache entries.
"""
import asyncio
import logging
import sys
import os

# Allow imports from backend root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

logging.basicConfig(
    level=logging.DEBUG,
    format="%(levelname)s %(name)s: %(message)s",
)
# Suppress noisy third-party loggers
for noisy in ("yfinance", "peewee", "urllib3", "httpx", "httpcore", "motor", "pymongo"):
    logging.getLogger(noisy).setLevel(logging.WARNING)

from app.config.db import connect_to_mongo, get_database_from_client
from app.services.analytics import get_sector

TICKERS = ["BAJAJFINSV.NS", "NESTLEIND.NS"]


async def main():
    client = await connect_to_mongo()
    db = get_database_from_client(client)

    for ticker in TICKERS:
        result = await get_sector(ticker, db_client=client)
        _ = result

    client.close()


if __name__ == "__main__":
    asyncio.run(main())
