from __future__ import annotations

import traceback
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.concurrency import gather_in_threads_bounded
from app.services.market import get_stock_info


LTCG_EXEMPTION = 125000.0
LTCG_TAX_RATE = 0.125
STCG_TAX_RATE = 0.20
INDIA_CPI_ANNUAL = 5.5

router = APIRouter(tags=["tax"])


def _to_buy_date(value) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


@router.get("/summary")
async def get_tax_summary(
    current_user: dict = Depends(get_current_user),
    holdings_collection: AsyncIOMotorCollection = Depends(get_holdings_collection),
):
    try:
        holdings = []
        async for holding in holdings_collection.find({"userId": current_user.get("_id")}):
            holdings.append(holding)

        if not holdings:
            return {
                "summary": {
                    "totalAbsoluteGain": 0.0,
                    "totalEstimatedTax": 0.0,
                    "totalLTCGGain": 0.0,
                    "totalSTCGGain": 0.0,
                    "ltcgExemptionUsed": 0.0,
                    "netAfterTax": 0.0,
                    "inflationRate": INDIA_CPI_ANNUAL,
                },
                "holdings": [],
                "disclaimer": "Tax estimates are indicative only. Consult a tax advisor.",
            }

        tickers = [str(holding.get("ticker", "")).strip().upper() for holding in holdings]
        stock_infos = await gather_in_threads_bounded(tickers, get_stock_info, limit=5)

        today = datetime.now(timezone.utc).date()
        per_holding = []

        for holding, stock_info in zip(holdings, stock_infos):
            ticker = str(holding.get("ticker", "")).strip().upper()
            buy_price = float(holding.get("buyPrice", 0.0) or 0.0)
            quantity = int(float(holding.get("quantity", 0) or 0))
            current_price = float((stock_info or {}).get("currentPrice") or buy_price or 0.0)

            buy_date = _to_buy_date(holding.get("buyDate"))
            if buy_date is None:
                holding_days = 0
                buy_date_str = ""
            else:
                holding_days = max(0, (today - buy_date).days)
                buy_date_str = buy_date.isoformat()

            is_ltcg = holding_days >= 365
            holding_type = "LTCG" if is_ltcg else "STCG"
            absolute_gain = (current_price - buy_price) * quantity

            if buy_price > 0:
                nominal_return_pct = ((current_price - buy_price) / buy_price) * 100.0
            else:
                nominal_return_pct = 0.0

            years_held = holding_days / 365.0
            inflation_factor = (1.0 + INDIA_CPI_ANNUAL / 100.0) ** years_held
            real_return_pct = ((1.0 + nominal_return_pct / 100.0) / inflation_factor - 1.0) * 100.0

            per_holding.append(
                {
                    "ticker": ticker,
                    "buyDate": buy_date_str,
                    "holdingDays": holding_days,
                    "holdingType": holding_type,
                    "absoluteGain": round(float(absolute_gain), 2),
                    "nominalReturnPct": round(float(nominal_return_pct), 2),
                    "realReturnPct": round(float(real_return_pct), 2),
                    "estimatedTax": 0.0,
                    "taxRate": LTCG_TAX_RATE if is_ltcg else STCG_TAX_RATE,
                    "daysToLTCG": 0 if is_ltcg else max(0, 365 - holding_days),
                }
            )

        exemption_remaining = LTCG_EXEMPTION
        total_ltcg_positive_gain = 0.0
        total_stcg_positive_gain = 0.0

        for item in per_holding:
            gain = float(item["absoluteGain"])

            if item["holdingType"] == "LTCG":
                positive_gain = max(0.0, gain)
                total_ltcg_positive_gain += positive_gain

                exemption_used_here = min(exemption_remaining, positive_gain)
                exemption_remaining -= exemption_used_here
                taxable_gain = max(0.0, positive_gain - exemption_used_here)
                item["estimatedTax"] = round(taxable_gain * LTCG_TAX_RATE, 2)
            else:
                positive_gain = max(0.0, gain)
                total_stcg_positive_gain += positive_gain
                item["estimatedTax"] = round(positive_gain * STCG_TAX_RATE, 2)

        total_absolute_gain = round(sum(float(item["absoluteGain"]) for item in per_holding), 2)
        total_estimated_tax = round(sum(float(item["estimatedTax"]) for item in per_holding), 2)
        ltcg_exemption_used = round(LTCG_EXEMPTION - exemption_remaining, 2)

        return {
            "summary": {
                "totalAbsoluteGain": total_absolute_gain,
                "totalEstimatedTax": total_estimated_tax,
                "totalLTCGGain": round(total_ltcg_positive_gain, 2),
                "totalSTCGGain": round(total_stcg_positive_gain, 2),
                "ltcgExemptionUsed": ltcg_exemption_used,
                "netAfterTax": round(total_absolute_gain - total_estimated_tax, 2),
                "inflationRate": INDIA_CPI_ANNUAL,
            },
            "holdings": per_holding,
            "disclaimer": "Tax estimates are indicative only. Consult a tax advisor.",
        }

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))