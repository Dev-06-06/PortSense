import logging
import os
from pathlib import Path
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING
from pymongo.errors import OperationFailure

# Always load backend/.env even when the app is started from the repository root.
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

logger = logging.getLogger(__name__)

_mongo_client: AsyncIOMotorClient | None = None
client: AsyncIOMotorClient | None = None


async def connect_to_mongo() -> AsyncIOMotorClient:
    global _mongo_client, client

    mongo_uri = os.getenv("MONGO_URI")
    if not mongo_uri:
        logger.error("MongoDB connection failed")
        raise ValueError("MONGO_URI is not set")

    try:
        _mongo_client = AsyncIOMotorClient(
            mongo_uri,
            serverSelectionTimeoutMS=int(os.getenv("MONGO_SERVER_SELECTION_TIMEOUT_MS", "5000")),
            connectTimeoutMS=int(os.getenv("MONGO_CONNECT_TIMEOUT_MS", "5000")),
            socketTimeoutMS=int(os.getenv("MONGO_SOCKET_TIMEOUT_MS", "5000")),
        )
        client = _mongo_client
        await _mongo_client.admin.command("ping")
        logger.info("MongoDB connected ✓")
        return _mongo_client
    except Exception:
        if _mongo_client is not None:
            _mongo_client.close()
        _mongo_client = None
        client = None
        logger.exception("MongoDB connection failed")
        raise


def close_mongo_connection() -> None:
    global _mongo_client, client
    if _mongo_client is not None:
        _mongo_client.close()
        _mongo_client = None
        client = None


def get_mongo_client() -> AsyncIOMotorClient | None:
    return _mongo_client


def get_database_from_client(client: AsyncIOMotorClient):
    db_name = os.getenv("MONGO_DB_NAME")

    if db_name:
        return client[db_name]

    try:
        return client.get_default_database()
    except Exception as exc:
        raise ValueError(
            "Database name is not configured. Include a database in MONGO_URI "
            "or set MONGO_DB_NAME."
        ) from exc


def get_database():
    active_client = get_mongo_client()
    if active_client is None:
        raise ValueError("Database connection not available")
    return get_database_from_client(active_client)


async def _ensure_holdings_user_ticker_partial_unique_index(holdings_collection) -> None:
    """Ensure the holdings unique index uses the required partial filter.

    Older deployments may already have a non-partial index with the same
    auto-generated name (userId_1_ticker_1). In that case, replace it.
    """

    desired_name = "userId_1_ticker_1"
    desired_partial = {"assetType": {"$in": ["stock", "mutual_fund"]}}

    existing_indexes = await holdings_collection.index_information()
    existing = existing_indexes.get(desired_name)

    if existing is not None and existing.get("partialFilterExpression") != desired_partial:
        await holdings_collection.drop_index(desired_name)
        logger.info("Dropped legacy holdings index '%s' to apply partial unique constraint", desired_name)

    try:
        await holdings_collection.create_index(
            [("userId", ASCENDING), ("ticker", ASCENDING)],
            name=desired_name,
            unique=True,
            partialFilterExpression=desired_partial,
            background=True,
        )
    except OperationFailure as exc:
        # Handle race conditions during concurrent startups where another instance
        # creates the same index first.
        if getattr(exc, "code", None) != 86:
            raise


async def ensure_indexes(client: AsyncIOMotorClient) -> None:
    db = get_database_from_client(client)

    users_collection = db["users"]
    holdings_collection = db["holdings"]
    watchlist_collection = db["watchlist"]
    sector_cache_collection = db["sector_cache"]

    await users_collection.create_index(
        [("email", ASCENDING)],
        unique=True,
        background=True,
    )

    await holdings_collection.create_index(
        [("userId", ASCENDING)],
        background=True,
    )

    await _ensure_holdings_user_ticker_partial_unique_index(holdings_collection)

    await holdings_collection.create_index(
        [("userId", ASCENDING), ("assetType", ASCENDING)],
        background=True,
    )

    await watchlist_collection.create_index(
        [("userId", ASCENDING), ("ticker", ASCENDING)],
        unique=True,
        background=True,
    )

    await sector_cache_collection.create_index(
        [("ticker", ASCENDING)],
        unique=True,
        background=True,
    )

    await sector_cache_collection.create_index(
        "updatedAt",
        expireAfterSeconds=2592000,
    )

    logger.info("Indexes ensured ✓")
