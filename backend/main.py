from contextlib import asynccontextmanager
import asyncio
from datetime import datetime, timezone
import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send

from app.config.db import close_mongo_connection, connect_to_mongo, ensure_indexes
from app.routes.analytics import router as analytics_router
from app.routes.auth import router as auth_router
from app.routes.comparison import router as comparison_router
from app.routes.genai import router as genai_router
from app.routes.holdings import router as holdings_router
from app.routes.market import router as market_router
from app.routes.news import router as news_router
from app.routes.sentiment import router as sentiment_router
from app.routes.stock_intel import router as stock_intel_router
from app.routes.tax_returns import router as tax_router
from app.routes.watchlist import router as watchlist_router


logging.basicConfig(level=logging.INFO)
logging.getLogger("app.services.analytics").setLevel(logging.DEBUG)
logger = logging.getLogger(__name__)


class SelectiveGZipMiddleware(GZipMiddleware):
    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            path = scope.get("path", "")
            if path.endswith("/stream"):
                await self.app(scope, receive, send)
                return
        await super().__call__(scope, receive, send)


async def warmup_yfinance_pool():
    try:
        await asyncio.to_thread(lambda: yf.Ticker("^NSEI").fast_info.last_price)
    except Exception:
        logger.warning("yfinance warmup failed during startup", exc_info=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        mongo_client = await connect_to_mongo()
        await ensure_indexes(mongo_client)
    except Exception:
        logger.warning("Starting without MongoDB; database-backed routes will return 500 until the connection is restored.", exc_info=True)
    asyncio.create_task(warmup_yfinance_pool())
    yield
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

origins = [origin.strip() for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",") if origin.strip()]

app.add_middleware(SelectiveGZipMiddleware, minimum_size=1000)

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
app.include_router(comparison_router, prefix="/api/comparison")
app.include_router(sentiment_router, prefix="/api/sentiment", tags=["sentiment"])
app.include_router(genai_router, prefix="/api/genai", tags=["genai"])
app.include_router(stock_intel_router, prefix="/api/stock-intel", tags=["stock-intel"])
app.include_router(watchlist_router, prefix="/api/watchlist", tags=["watchlist"])
app.include_router(market_router, prefix="/api/market")
app.include_router(news_router, prefix="/api/news")
app.include_router(tax_router, prefix="/api/tax")


@app.get("/ping")
async def ping():
    return {"ok": True, "timestamp": datetime.now(timezone.utc).isoformat()}


@app.get("/")
async def read_root():
    return {"status": "PortSense API running"}
