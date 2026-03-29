from fastapi import HTTPException, status
from motor.motor_asyncio import AsyncIOMotorCollection

from app.config.db import get_database, get_mongo_client


def get_database_dependency():
    if get_mongo_client() is None:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Database connection not available",
        )

    try:
        return get_database()
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=str(exc),
        ) from exc


def get_holdings_collection() -> AsyncIOMotorCollection:
    return get_database_dependency()["holdings"]


def get_users_collection() -> AsyncIOMotorCollection:
    return get_database_dependency()["users"]