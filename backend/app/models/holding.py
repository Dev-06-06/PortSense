from __future__ import annotations
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel


class HoldingCreate(BaseModel):
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: float  # float to support MF units like 12.345
    assetType: Literal["stock", "mutual_fund", "fd"] = "stock"
    fdRate: Optional[float] = None        # FD annual interest rate %
    fdMaturityDate: Optional[date] = None # FD maturity date
    schemeName: Optional[str] = None      # MF scheme name for display


class HoldingResponse(BaseModel):
    id: str
    userId: str
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: float
    assetType: str
    fdRate: Optional[float] = None
    fdMaturityDate: Optional[date] = None
    schemeName: Optional[str] = None
    createdAt: datetime
