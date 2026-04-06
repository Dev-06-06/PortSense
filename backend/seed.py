from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext

from app.config.db import get_database_from_client

ENV_PATH = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=ENV_PATH)

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

DEMO_EMAIL = "demo@portsense.in"
DEMO_PASSWORD = "Demo@1234"
DEMO_USERNAME = "Demo Investor"

# Design rationale:
# LTCG: bought before Apr 2024 (>1 year from Apr 2025)
# STCG batch 1: bought Aug 12, 2025 (~8 months ago)
# STCG batch 2: bought Jan 26, 2026 (~2 months ago)
# Sectors: IT, Banking, Energy, Pharma, FMCG, Auto, Metal
# Beta mix: Low (HINDUNILVR ~0.5), Moderate (INFY ~0.9), High (TATASTEEL ~1.5, BAJFINANCE ~1.6)
# Correlation: IT stocks positive pair (TCS-INFY), IT-FMCG negative pair
# Benchmark: Overweight IT drags vs Nifty, Pharma provides buffer

DEMO_HOLDINGS = [
    # ── IT Sector (overweight intentionally for sector warning) ──────────────
    # LTCG — bought Jun 2022
    {
        "ticker": "TCS.NS",
        "buyDate": "2022-06-10",
        "buyPrice": 3200,
        "quantity": 5,
        "assetType": "stock",
    },
    # LTCG — bought Jan 2023
    {
        "ticker": "INFY.NS",
        "buyDate": "2023-01-15",
        "buyPrice": 1380,
        "quantity": 10,
        "assetType": "stock",
    },
    # STCG batch 2 — bought Jan 26, 2026
    {
        "ticker": "HCLTECH.NS",
        "buyDate": "2026-01-26",
        "buyPrice": 1620,
        "quantity": 6,
        "assetType": "stock",
    },

    # ── Banking Sector ────────────────────────────────────────────────────────
    # LTCG — bought Nov 2022
    {
        "ticker": "HDFCBANK.NS",
        "buyDate": "2022-11-10",
        "buyPrice": 1560,
        "quantity": 8,
        "assetType": "stock",
    },
    # STCG batch 1 — bought Aug 12, 2025
    {
        "ticker": "ICICIBANK.NS",
        "buyDate": "2025-08-12",
        "buyPrice": 1240,
        "quantity": 10,
        "assetType": "stock",
    },

    # ── Energy Sector ─────────────────────────────────────────────────────────
    # LTCG — bought Sep 2022
    {
        "ticker": "RELIANCE.NS",
        "buyDate": "2022-09-20",
        "buyPrice": 2450,
        "quantity": 6,
        "assetType": "stock",
    },
    # STCG batch 1 — bought Aug 12, 2025 (high beta ~1.4)
    {
        "ticker": "ONGC.NS",
        "buyDate": "2025-08-12",
        "buyPrice": 285,
        "quantity": 50,
        "assetType": "stock",
    },

    # ── Pharma Sector ─────────────────────────────────────────────────────────
    # LTCG — bought Feb 2023 (low correlation with IT)
    {
        "ticker": "SUNPHARMA.NS",
        "buyDate": "2023-02-14",
        "buyPrice": 980,
        "quantity": 10,
        "assetType": "stock",
    },
    # STCG batch 2 — bought Jan 26, 2026
    {
        "ticker": "DRREDDY.NS",
        "buyDate": "2026-01-26",
        "buyPrice": 1180,
        "quantity": 8,
        "assetType": "stock",
    },

    # ── FMCG Sector (low beta ~0.5, negative corr with IT) ───────────────────
    # LTCG — bought Mar 2023
    {
        "ticker": "HINDUNILVR.NS",
        "buyDate": "2023-03-10",
        "buyPrice": 2450,
        "quantity": 4,
        "assetType": "stock",
    },

    # ── Auto + High Beta ──────────────────────────────────────────────────────
    # STCG batch 1 — bought Aug 12, 2025 (beta ~1.6)
    {
        "ticker": "BAJFINANCE.NS",
        "buyDate": "2025-08-12",
        "buyPrice": 7200,
        "quantity": 2,
        "assetType": "stock",
    },

    # ── Metal Sector (high beta ~1.5, cyclical) ───────────────────────────────
    # LTCG — bought Dec 2022
    {
        "ticker": "TATASTEEL.NS",
        "buyDate": "2022-12-05",
        "buyPrice": 98,
        "quantity": 100,
        "assetType": "stock",
    },
    # STCG batch 2 — bought Jan 26, 2026
    {
        "ticker": "JSWSTEEL.NS",
        "buyDate": "2026-01-26",
        "buyPrice": 940,
        "quantity": 12,
        "assetType": "stock",
    },

    # ── Mutual Funds ──────────────────────────────────────────────────────────
    # Equity MF — LTCG (bought Apr 2023)
    {
        "ticker": "119598",
        "buyDate": "2023-04-01",
        "buyPrice": 52.30,
        "quantity": 500,
        "assetType": "mutual_fund",
        "schemeName": "Axis Bluechip Fund - Direct Plan - Growth",
    },
    # ELSS MF — LTCG (bought Jun 2023)
    {
        "ticker": "120503",
        "buyDate": "2023-06-15",
        "buyPrice": 89.10,
        "quantity": 200,
        "assetType": "mutual_fund",
        "schemeName": "Axis ELSS Tax Saver Fund - Direct Plan - Growth",
    },
    # Debt MF — STCG batch 1 (bought Aug 12, 2025)
    {
        "ticker": "101114",
        "buyDate": "2025-08-12",
        "buyPrice": 45.20,
        "quantity": 300,
        "assetType": "mutual_fund",
        "schemeName": "HDFC Short Term Debt Fund - Direct Plan - Growth",
        "mfCategory": "debt",
    },

    # ── Fixed Deposits ────────────────────────────────────────────────────────
    # SBI FD — LTCG equivalent (bought Sep 2023)
    {
        "ticker": "SBI FD",
        "buyDate": "2023-09-01",
        "buyPrice": 100000,
        "quantity": 1,
        "assetType": "fd",
        "fdRate": 7.1,
    },
    # HDFC FD — STCG equivalent (bought Aug 12, 2025)
    {
        "ticker": "HDFC FD",
        "buyDate": "2025-08-12",
        "buyPrice": 50000,
        "quantity": 1,
        "assetType": "fd",
        "fdRate": 7.4,
    },
]


async def main() -> None:
    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        raise ValueError("MONGO_URI is not set")

    client = AsyncIOMotorClient(mongo_uri)

    try:
        await client.admin.command("ping")
        db = get_database_from_client(client)
        users_collection = db["users"]
        holdings_collection = db["holdings"]

        demo_user = await users_collection.find_one({"email": DEMO_EMAIL})
        hashed_password = pwd_context.hash(DEMO_PASSWORD)

        if demo_user is None:
            now = datetime.utcnow()
            insert_result = await users_collection.insert_one(
                {
                    "username": DEMO_USERNAME,
                    "email": DEMO_EMAIL,
                    "password": hashed_password,
                    "is_demo": True,
                    "createdAt": now,
                }
            )
            user_id = insert_result.inserted_id
        else:
            user_id = demo_user["_id"]
            await users_collection.update_one(
                {"_id": user_id},
                {"$set": {"password": hashed_password, "is_demo": True}},
            )

        await holdings_collection.delete_many({"userId": user_id})

        now = datetime.utcnow()
        documents = []
        for item in DEMO_HOLDINGS:
            doc = {
                "userId": user_id,
                "ticker": item["ticker"],
                "buyDate": datetime.strptime(
                    item["buyDate"], "%Y-%m-%d"
                ).replace(tzinfo=timezone.utc),
                "buyPrice": item["buyPrice"],
                "quantity": item["quantity"],
                "assetType": item.get("assetType", "stock"),
                "createdAt": now,
            }
            if item.get("schemeName"):
                doc["schemeName"] = item["schemeName"]
            if item.get("fdRate"):
                doc["fdRate"] = item["fdRate"]
            if item.get("mfCategory"):
                doc["mfCategory"] = item["mfCategory"]
            if item.get("fdMaturityDate"):
                doc["fdMaturityDate"] = item["fdMaturityDate"]
            documents.append(doc)

        await holdings_collection.insert_many(documents)
        print(f"Seed complete ✓ — {len(documents)} holdings inserted for demo user")

    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())