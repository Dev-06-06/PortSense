import asyncio
import json
from collections import Counter

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from motor.motor_asyncio import AsyncIOMotorCollection

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.sentiment import get_portfolio_sentiment
from app.services.sentiment import get_stock_sentiment


router = APIRouter()


@router.get("/")
async def get_sentiment(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):

    tickers = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        asset_type = str(holding.get("assetType", "stock")).strip().lower()
        if asset_type in ("mutual_fund", "fd"):
            continue
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    return await get_portfolio_sentiment(tickers)


@router.get("/feed")
async def stream_sentiment(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    tickers = []
    async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
        asset_type = str(holding.get("assetType", "stock")).strip().lower()
        if asset_type in ("mutual_fund", "fd"):
            continue
        ticker = str(holding.get("ticker", "")).strip().upper()
        if ticker:
            tickers.append(ticker)

    async def event_generator():
        # Send an initial ping so Render doesn't buffer the response
        yield ": ping\n\n"

        tasks = {
            asyncio.ensure_future(asyncio.to_thread(get_stock_sentiment, ticker)): ticker
            for ticker in tickers
        }

        pending = set(tasks.keys())
        all_results = []

        while pending:
            done, pending = await asyncio.wait(
                pending, return_when=asyncio.FIRST_COMPLETED
            )
            for task in done:
                try:
                    result = task.result()
                except Exception:
                    result = {
                        "ticker": tasks[task],
                        "badge": "Neutral",
                        "confidence": 0,
                        "reason": "error",
                        "headlines": [],
                    }
                all_results.append(result)
                payload = json.dumps({"type": "stock", "data": result})
                yield f"data: {payload}\n\n"

        badge_counts = Counter(str(r.get("badge", "Neutral")) for r in all_results)
        bullish = badge_counts.get("Bullish", 0)
        bearish = badge_counts.get("Bearish", 0)
        if bullish > bearish:
            signal = "Overall Bullish"
        elif bearish > bullish:
            signal = "Overall Bearish"
        else:
            signal = "Mixed"

        done_payload = json.dumps({"type": "done", "portfolioSignal": signal})
        yield f"data: {done_payload}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Content-Type": "text/event-stream",
            "Connection": "keep-alive",
        },
    )
