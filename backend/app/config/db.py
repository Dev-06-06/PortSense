import logging
import os

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING


load_dotenv()

logger = logging.getLogger(__name__)

_mongo_client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> AsyncIOMotorClient:
    global _mongo_client

    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MongoDB connection failed")
        raise ValueError("MONGO_URI is not set")

    try:
        _mongo_client = AsyncIOMotorClient(mongo_uri)
        await _mongo_client.admin.command("ping")
        logger.info("MongoDB connected ✓")
        return _mongo_client
    except Exception:
        logger.exception("MongoDB connection failed")
        raise


def close_mongo_connection() -> None:
    global _mongo_client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None


def get_mongo_client() -> AsyncIOMotorClient | None:
    return _mongo_client


async def ensure_indexes(client: AsyncIOMotorClient) -> None:
    db_name = os.getenv("MONGO_DB_NAME")

    if db_name:
        db = client[db_name]
    else:
        try:
            db = client.get_default_database()
        except Exception as exc:
            raise ValueError(
                "Database name is not configured. Include a database in MONGO_URI "
                "or set MONGO_DB_NAME."
            ) from exc

    users_collection = db["users"]
    holdings_collection = db["holdings"]

    await users_collection.create_index(
        [("email", ASCENDING)],
        unique=True,
        background=True,
    )

    await holdings_collection.create_index(
        [("userId", ASCENDING)],
        background=True,
    )

    await holdings_collection.create_index(
        [("userId", ASCENDING), ("ticker", ASCENDING)],
        unique=True,
        background=True,
    )

    logger.info("Indexes ensured ✓")
