from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel


class HoldingCreate(BaseModel):
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: int


class HoldingResponse(BaseModel):
    id: str
    userId: str
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: int
    createdAt: datetime
