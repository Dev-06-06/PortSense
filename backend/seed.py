from __future__ import annotations

import asyncio
import os
from datetime import datetime
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
DEMO_NAME = "Demo User"

DEMO_HOLDINGS = [
    {"ticker": "RELIANCE.NS", "buyDate": "2023-01-15", "buyPrice": 2450, "quantity": 10},
    {"ticker": "INFY.NS", "buyDate": "2023-03-20", "buyPrice": 1380, "quantity": 15},
    {"ticker": "HDFCBANK.NS", "buyDate": "2023-02-10", "buyPrice": 1560, "quantity": 8},
    {"ticker": "TATASTEEL.NS", "buyDate": "2022-11-05", "buyPrice": 98, "quantity": 100},
    {"ticker": "SUNPHARMA.NS", "buyDate": "2023-06-01", "buyPrice": 980, "quantity": 12},
    {"ticker": "ADANIPOWER.NS", "buyDate": "2023-04-15", "buyPrice": 205, "quantity": 50},
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
                    "name": DEMO_NAME,
                    "email": DEMO_EMAIL,
                    "password": hashed_password,
                    "createdAt": now,
                }
            )
            user_id = insert_result.inserted_id
        else:
            user_id = demo_user["_id"]
            await users_collection.update_one(
                {"_id": user_id},
                {"$set": {"password": hashed_password}},
            )

        await holdings_collection.delete_many({"userId": user_id})

        now = datetime.utcnow()
        documents = [
            {
                "userId": user_id,
                "ticker": item["ticker"],
                "buyDate": datetime.strptime(item["buyDate"], "%Y-%m-%d"),
                "buyPrice": item["buyPrice"],
                "quantity": item["quantity"],
                "createdAt": now,
            }
            for item in DEMO_HOLDINGS
        ]

        await holdings_collection.insert_many(documents)
        print("Seed complete ✓")
    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(main())
