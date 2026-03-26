from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config.db import close_mongo_connection, connect_to_mongo, ensure_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    mongo_client = await connect_to_mongo()
    await ensure_indexes(mongo_client)
    yield
    close_mongo_connection()


app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
async def read_root():
    return {"status": "PortSense API running"}
