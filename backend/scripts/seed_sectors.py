import os
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv
from pymongo import MongoClient


KNOWN_SECTORS = {
    "HDFCBANK.NS": "Banking",
    "ICICIBANK.NS": "Banking",
    "SBIN.NS": "Banking",
    "AXISBANK.NS": "Banking",
    "KOTAKBANK.NS": "Banking",
    "INFY.NS": "IT",
    "TCS.NS": "IT",
    "WIPRO.NS": "IT",
    "HCLTECH.NS": "IT",
    "TECHM.NS": "IT",
    "RELIANCE.NS": "Energy",
    "ADANIPOWER.NS": "Energy",
    "ONGC.NS": "Energy",
    "NTPC.NS": "Energy",
    "POWERGRID.NS": "Energy",
    "SUNPHARMA.NS": "Pharma",
    "DRREDDY.NS": "Pharma",
    "CIPLA.NS": "Pharma",
    "HINDUNILVR.NS": "FMCG",
    "ITC.NS": "FMCG",
    "TATASTEEL.NS": "Materials",
    "JSWSTEEL.NS": "Materials",
    "MARUTI.NS": "Auto",
    "TATAMOTORS.NS": "Auto",
    "BAJFINANCE.NS": "NBFC",
    "ADANIENT.NS": "Conglomerate",
    "LT.NS": "Infrastructure",
    "BHEL.NS": "Infrastructure",
    "BAJAJFINSV.NS": "NBFC",
    "NESTLEIND.NS": "FMCG",
    "ASIANPAINT.NS": "FMCG",
    "TITAN.NS": "Consumer Discretionary",
    "ULTRACEMCO.NS": "Materials",
}


def get_database(client: MongoClient):
    db_name = os.getenv("MONGO_DB_NAME")
    if db_name:
        return client[db_name]

    db = client.get_default_database()
    if db is None:
        raise ValueError(
            "Database name is not configured. Include a database in MONGO_URI or set MONGO_DB_NAME."
        )
    return db


def seed_sectors() -> None:
    env_path = Path(__file__).resolve().parents[1] / ".env"
    load_dotenv(dotenv_path=env_path)

    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise ValueError("MONGO_URI is not set")

    client = MongoClient(mongo_uri)
    try:
        db = get_database(client)
        now = datetime.utcnow()

        for ticker, sector in KNOWN_SECTORS.items():
            db.sector_cache.update_one(
                {"ticker": ticker},
                {
                    "$set": {
                        "ticker": ticker,
                        "sector": sector,
                        "source": "seed",
                        "updatedAt": now,
                    }
                },
                upsert=True,
            )

        print(f"Seeded {len(KNOWN_SECTORS)} sectors into sector_cache")
    finally:
        client.close()


if __name__ == "__main__":
    seed_sectors()
