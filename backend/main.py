from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.db import close_mongo_connection, connect_to_mongo, ensure_indexes
from app.routes.auth import router as auth_router
from app.routes.holdings import router as holdings_router


logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_client = await connect_to_mongo()
    await ensure_indexes(mongo_client)
    yield
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["auth"])
app.include_router(holdings_router, prefix="/api/holdings", tags=["holdings"])


@app.get("/")
async def read_root():
    return {"status": "PortSense API running"}
