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

DEMO_HOLDINGS = [
    # IT Sector
    {"ticker": "TCS.NS", "buyDate": "2022-06-10", "buyPrice": 3200, "quantity": 5},
    {"ticker": "INFY.NS", "buyDate": "2023-01-15", "buyPrice": 1380, "quantity": 10},
    {"ticker": "HCLTECH.NS", "buyDate": "2023-08-20", "buyPrice": 1150, "quantity": 8},
    # Banking
    {"ticker": "HDFCBANK.NS", "buyDate": "2022-11-10", "buyPrice": 1560, "quantity": 8},
    {"ticker": "ICICIBANK.NS", "buyDate": "2023-03-05", "buyPrice": 870, "quantity": 12},
    # Energy
    {"ticker": "RELIANCE.NS", "buyDate": "2022-09-20", "buyPrice": 2450, "quantity": 6},
    {"ticker": "ONGC.NS", "buyDate": "2023-05-10", "buyPrice": 162, "quantity": 60},
    # Pharma
    {"ticker": "SUNPHARMA.NS", "buyDate": "2023-02-14", "buyPrice": 980, "quantity": 10},
    # Auto + Steel (higher volatility)
    {"ticker": "BAJFINANCE.NS", "buyDate": "2023-07-01", "buyPrice": 6800, "quantity": 2},
    {"ticker": "TATASTEEL.NS", "buyDate": "2022-12-05", "buyPrice": 98, "quantity": 100},
    # Mutual Funds
    {
        "ticker": "119598",
        "buyDate": "2023-04-01",
        "buyPrice": 52.30,
        "quantity": 500,
        "assetType": "mutual_fund",
        "schemeName": "Axis Bluechip Fund - Direct Plan - Growth",
    },
    {
        "ticker": "120503",
        "buyDate": "2023-06-15",
        "buyPrice": 89.10,
        "quantity": 200,
        "assetType": "mutual_fund",
        "schemeName": "Axis ELSS Tax Saver Fund - Direct Plan - Growth",
    },
    # Fixed Deposit
    {
        "ticker": "SBI FD",
        "buyDate": "2023-09-01",
        "buyPrice": 50000,
        "quantity": 1,
        "assetType": "fd",
        "fdRate": 7.1,
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
                "buyDate": datetime.strptime(item["buyDate"], "%Y-%m-%d").replace(tzinfo=timezone.utc),
                "buyPrice": item["buyPrice"],
                "quantity": item["quantity"],
                "assetType": item.get("assetType", "stock"),
                "createdAt": now,
            }
            if item.get("schemeName"):
                doc["schemeName"] = item["schemeName"]
            if item.get("fdRate"):
                doc["fdRate"] = item["fdRate"]
            if item.get("fdMaturityDate"):
                doc["fdMaturityDate"] = item["fdMaturityDate"]
            documents.append(doc)

        await holdings_collection.insert_many(documents)
        print("Seed complete ✓")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
