from __future__ import annotations
from datetime import date, datetime
from typing import Literal, Optional
from pydantic import BaseModel, field_validator


class HoldingCreate(BaseModel):
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: float  # float to support MF units like 12.345
    assetType: Literal["stock", "mutual_fund", "fd"] = "stock"
    mfCategory: Optional[str] = "equity"  # "equity" | "debt" | "hybrid"
    fdRate: Optional[float] = None        # FD annual interest rate %
    fdMaturityDate: Optional[date] = None # FD maturity date
    schemeName: Optional[str] = None      # MF scheme name for display

    @field_validator("mfCategory", mode="before")
    @classmethod
    def _normalize_mf_category(cls, value):
        if value is None:
            return "equity"
        normalized = str(value).strip().lower()
        return normalized or "equity"


class HoldingResponse(BaseModel):
    id: str
    userId: str
    ticker: str
    buyDate: date
    buyPrice: float
    quantity: float
    assetType: str
    mfCategory: Optional[str] = "equity"
    fdRate: Optional[float] = None
    fdMaturityDate: Optional[date] = None
    schemeName: Optional[str] = None
    createdAt: datetime

    @field_validator("mfCategory", mode="before")
    @classmethod
    def _normalize_mf_category(cls, value):
        if value is None:
            return "equity"
        normalized = str(value).strip().lower()
        return normalized or "equity"
