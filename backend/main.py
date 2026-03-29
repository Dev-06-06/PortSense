from contextlib import asynccontextmanager
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware

from app.config.db import close_mongo_connection, connect_to_mongo, ensure_indexes
from app.routes.analytics import router as analytics_router
from app.routes.auth import router as auth_router
from app.routes.genai import router as genai_router
from app.routes.holdings import router as holdings_router
from app.routes.sentiment import router as sentiment_router
from app.routes.stock_intel import router as stock_intel_router


logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_client = await connect_to_mongo()
    await ensure_indexes(mongo_client)
    yield
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]

app.add_middleware(GZipMiddleware, minimum_size=500)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(holdings_router, prefix="/api/holdings", tags=["holdings"])
app.include_router(analytics_router, prefix="/api/analytics", tags=["analytics"])
app.include_router(sentiment_router, prefix="/api/sentiment", tags=["sentiment"])
app.include_router(genai_router, prefix="/api/genai", tags=["genai"])
app.include_router(stock_intel_router, prefix="/api/stock-intel", tags=["stock-intel"])


@app.get("/")
async def read_root():
    return {"status": "PortSense API running"}
