from __future__ import annotations

import asyncio
import traceback
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException
from motor.motor_asyncio import AsyncIOMotorCollection

from app.deps import get_holdings_collection
from app.middleware.auth import get_current_user
from app.services.concurrency import gather_in_threads_bounded
from app.services.market import get_stock_info
from app.services.mf import _compute_fd_value, get_mf_nav


LTCG_EXEMPTION = 125000.0
LTCG_TAX_RATE = 0.125
STCG_TAX_RATE = 0.20
INDIA_CPI_ANNUAL = 5.5

router = APIRouter(tags=["tax"])


def _to_buy_date(value) -> date | None:
    try:
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return datetime.strptime(str(value)[:10], "%Y-%m-%d").date()
    except (TypeError, ValueError):
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
                    "taxableAfterExemption": 0.0,
                    "netAfterTax": 0.0,
                    "inflationRate": INDIA_CPI_ANNUAL,
                },
                "holdings": [],
                "disclaimer": "Tax estimates are indicative only. Consult a tax advisor.",
            }

        stock_positions: list[int] = []
        stock_tickers: list[str] = []
        mf_positions: list[int] = []
        mf_codes: list[str] = []

        for idx, holding in enumerate(holdings):
            asset_type = str(holding.get("assetType", "stock")).strip().lower()
            if asset_type == "stock":
                stock_positions.append(idx)
                stock_tickers.append(str(holding.get("ticker", "")).strip().upper())
            elif asset_type == "mutual_fund":
                mf_positions.append(idx)
                mf_codes.append(str(holding.get("ticker", "")).strip())

        stock_infos = (
            await gather_in_threads_bounded(stock_tickers, get_stock_info, limit=5)
            if stock_tickers
            else []
        )
        mf_infos = (
            await asyncio.gather(*[get_mf_nav(code) for code in mf_codes])
            if mf_codes
            else []
        )

        stock_info_by_index = {
            pos: info for pos, info in zip(stock_positions, stock_infos)
        }
        mf_info_by_index = {
            pos: info for pos, info in zip(mf_positions, mf_infos)
        }

        today = date.today()
        holding_data = []
        total_ltcg_gain = 0.0
        total_stcg_gain = 0.0

        for idx, holding in enumerate(holdings):
            ticker = str(holding.get("ticker", "")).strip().upper()
            asset_type = str(holding.get("assetType", "stock")).strip().lower()
            display_name = ticker
            if asset_type == "mutual_fund" and holding.get("schemeName"):
                display_name = str(holding.get("schemeName"))

            buy_price = float(holding.get("buyPrice", 0.0) or 0.0)
            quantity = float(holding.get("quantity", 0) or 0)

            stock_info = stock_info_by_index.get(idx, {})
            mf_info = mf_info_by_index.get(idx, {})

            if asset_type == "mutual_fund":
                current_price = float((mf_info or {}).get("currentNav") or buy_price or 0.0)
                absolute_gain = (current_price - buy_price) * quantity
            elif asset_type == "fd":
                fd_rate = float(holding.get("fdRate", 0.0) or 0.0)
                current_value = _compute_fd_value(
                    principal=buy_price,
                    annual_rate_pct=fd_rate,
                    buy_date_str=str(holding.get("buyDate") or ""),
                )
                current_price = current_value
                absolute_gain = current_value - buy_price
            else:
                current_price = float((stock_info or {}).get("currentPrice") or buy_price or 0.0)
                absolute_gain = (current_price - buy_price) * quantity

            buy_date = _to_buy_date(holding.get("buyDate"))
            if buy_date is None:
                holding_days = 0
                buy_date_str = ""
            else:
                holding_days = max(0, (today - buy_date).days)
                buy_date_str = buy_date.isoformat()

            is_ltcg = holding_days >= 365
            mf_category = str(holding.get("mfCategory", "equity")).strip().lower()
            if asset_type == "mutual_fund" and mf_category == "debt":
                is_ltcg = False  # Debt MFs: all gains taxed as STCG post Apr 2023

            if asset_type == "fd":
                holding_type = "FD Interest"
            elif asset_type == "mutual_fund":
                if mf_category == "debt":
                    holding_type = "MF Debt (STCG)"
                else:
                    holding_type = "MF LTCG" if is_ltcg else "MF STCG"
            else:
                holding_type = "LTCG" if is_ltcg else "STCG"

            if is_ltcg and absolute_gain > 0:
                total_ltcg_gain += absolute_gain
            elif not is_ltcg and absolute_gain > 0:
                total_stcg_gain += absolute_gain

            if buy_price > 0:
                if asset_type == "fd":
                    nominal_return_pct = (absolute_gain / buy_price) * 100.0
                else:
                    nominal_return_pct = ((current_price - buy_price) / buy_price) * 100.0
            else:
                nominal_return_pct = 0.0

            years_held = holding_days / 365.0
            inflation_factor = (1.0 + INDIA_CPI_ANNUAL / 100.0) ** years_held
            real_return_pct = ((1.0 + nominal_return_pct / 100.0) / inflation_factor - 1.0) * 100.0

            holding_data.append(
                {
                    "ticker": ticker,
                    "displayName": display_name,
                    "assetType": asset_type,
                    "buyDate": buy_date_str,
                    "holdingDays": holding_days,
                    "holdingType": holding_type,
                    "absoluteGain": round(float(absolute_gain), 2),
                    "nominalReturnPct": round(float(nominal_return_pct), 2),
                    "realReturnPct": round(float(real_return_pct), 2),
                    "daysToLTCG": 0 if is_ltcg else max(0, 365 - holding_days),
                    "rawGain": float(absolute_gain),
                    "isLTCG": is_ltcg,
                }
            )

        taxable_ltcg_total = max(0.0, total_ltcg_gain - LTCG_EXEMPTION)
        ltcg_exemption_used = min(LTCG_EXEMPTION, total_ltcg_gain)

        holdings_out = []
        for item in holding_data:
            asset_type = item.get("assetType", "stock")
            raw_gain = float(item.get("rawGain", 0.0) or 0.0)
            is_ltcg = bool(item.get("isLTCG", False))

            if asset_type == "fd":
                estimated_tax = None
                tax_rate = None
                taxable_note = "Taxed at income slab rate"
            elif is_ltcg and raw_gain > 0:
                proportion = (raw_gain / total_ltcg_gain) if total_ltcg_gain > 0 else 0.0
                this_taxable = taxable_ltcg_total * proportion
                estimated_tax = round(this_taxable * LTCG_TAX_RATE, 2)
                tax_rate = LTCG_TAX_RATE
                taxable_note = None
            elif (not is_ltcg) and raw_gain > 0:
                estimated_tax = round(raw_gain * STCG_TAX_RATE, 2)
                tax_rate = STCG_TAX_RATE
                taxable_note = None
            else:
                estimated_tax = 0.0
                tax_rate = 0.0
                taxable_note = None

            out_item = {
                "ticker": item["ticker"],
                "displayName": item["displayName"],
                "assetType": item["assetType"],
                "buyDate": item["buyDate"],
                "holdingDays": item["holdingDays"],
                "holdingType": item["holdingType"],
                "absoluteGain": item["absoluteGain"],
                "nominalReturnPct": item["nominalReturnPct"],
                "realReturnPct": item["realReturnPct"],
                "estimatedTax": estimated_tax,
                "taxRate": tax_rate,
                "daysToLTCG": item["daysToLTCG"],
                "taxNote": taxable_note,
            }
            holdings_out.append(out_item)

        total_estimated_tax = round(
            sum(
                float(item["estimatedTax"])
                for item in holdings_out
                if item.get("estimatedTax") is not None
            ),
            2,
        )
        net_after_tax = total_ltcg_gain + total_stcg_gain - total_estimated_tax

        return {
            "summary": {
                "totalAbsoluteGain": round(total_ltcg_gain + total_stcg_gain, 2),
                "totalEstimatedTax": total_estimated_tax,
                "totalLTCGGain": round(total_ltcg_gain, 2),
                "totalSTCGGain": round(total_stcg_gain, 2),
                "ltcgExemptionUsed": round(ltcg_exemption_used, 2),
                "taxableAfterExemption": round(taxable_ltcg_total, 2),
                "netAfterTax": round(net_after_tax, 2),
                "inflationRate": INDIA_CPI_ANNUAL,
            },
            "holdings": holdings_out,
            "disclaimer": "Tax estimates are indicative only. Consult a tax advisor.",
        }

    except Exception as exc:
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(exc))