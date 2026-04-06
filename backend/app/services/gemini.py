import os
import itertools
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
import logging

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

GEMINI_KEYS = [
    os.getenv("GEMINI_API_KEY_1"),
    os.getenv("GEMINI_API_KEY_2"),
    os.getenv("GEMINI_API_KEY_3"),
]
GEMINI_KEYS = [k for k in GEMINI_KEYS if k]
key_cycle = itertools.cycle(GEMINI_KEYS)
_clients = {k: genai.Client(api_key=k) for k in GEMINI_KEYS}

logger = logging.getLogger(__name__)

if not GEMINI_KEYS:
    logger.warning("No Gemini API keys are set")


def get_gemini_response(prompt: str) -> str:
    for _ in range(len(GEMINI_KEYS)):
        key = next(key_cycle)
        try:
            client = _clients[key]
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=prompt
            )
            return response.text
        except Exception as e:
            logging.warning(f"Gemini key failed: {type(e).__name__}: {e}")
            continue

    return "Unable to generate rebalancing advice. Please try again."


def _format_holdings(holdings: list[dict]) -> str:
    if not holdings:
        return "No holdings provided"

    lines: list[str] = []
    for holding in holdings:
        ticker = str(holding.get("ticker", "Unknown")).strip() or "Unknown"

        buy_price = holding.get("buyPrice")
        current_price = holding.get("currentPrice")
        pnl_percent = holding.get("pnlPercent")
        weight = holding.get("weight")

        try:
            buy_price_text = f"{float(buy_price):.2f}"
        except (TypeError, ValueError):
            buy_price_text = "N/A"

        try:
            current_price_text = f"{float(current_price):.2f}"
        except (TypeError, ValueError):
            current_price_text = "N/A"

        try:
            pnl_percent_text = f"{float(pnl_percent):.1f}"
        except (TypeError, ValueError):
            pnl_percent_text = "0.0"

        try:
            weight_text = f"{float(weight):.1f}"
        except (TypeError, ValueError):
            weight_text = "0.0"

        lines.append(
            f"- {ticker}: ₹{buy_price_text} avg buy | ₹{current_price_text} current | {pnl_percent_text}% P&L | {weight_text}% of portfolio"
        )

    return "\n".join(lines)


def _format_correlation_pairs(correlation_pairs: object) -> str:
    if not correlation_pairs:
        return "None"

    if isinstance(correlation_pairs, str):
        return correlation_pairs

    if isinstance(correlation_pairs, list):
        parsed_pairs: list[tuple[float, str, str]] = []
        for item in correlation_pairs:
            if isinstance(item, dict):
                t1 = str(item.get("ticker1", "")).strip().upper()
                t2 = str(item.get("ticker2", "")).strip().upper()
                corr = item.get("correlation")

                if t1 and t2 and corr is not None:
                    try:
                        corr_value = float(corr)
                    except (TypeError, ValueError):
                        continue
                    parsed_pairs.append((corr_value, t1, t2))

        if not parsed_pairs:
            return "None"

        top_pairs = sorted(parsed_pairs, key=lambda x: abs(x[0]), reverse=True)[:3]
        return "\n".join(f"  - {t1}↔{t2}: {corr:.2f}" for corr, t1, t2 in top_pairs)

    return str(correlation_pairs)


def build_rebalancing_prompt(portfolio_data: dict) -> str:
    holdings = portfolio_data.get("holdings", [])

    stock_holdings = [
        h for h in holdings
        if str(h.get("assetType", "stock")).lower() == "stock"
    ]
    mf_holdings = [
        h for h in holdings
        if str(h.get("assetType", "stock")).lower() == "mutual_fund"
    ]
    fd_holdings = [
        h for h in holdings
        if str(h.get("assetType", "stock")).lower() == "fd"
    ]

    total_value = sum(float(h.get("currentValue", 0) or 0) for h in holdings)

    # Stock holdings table
    stock_lines = []
    for h in stock_holdings:
        ticker = str(h.get("ticker", "")).replace(".NS", "").replace(".BO", "")
        avg = float(h.get("avgPrice", 0) or 0)
        cur = float(h.get("currentPrice", 0) or 0)
        val = float(h.get("currentValue", 0) or 0)
        weight = round((val / total_value * 100), 1) if total_value > 0 else 0
        pnl_pct = round(((cur - avg) / avg * 100), 1) if avg > 0 else 0
        stock_lines.append(
            f"  {ticker}: ₹{val:,.0f} ({weight}% wt) | avg ₹{avg:.0f} → cur ₹{cur:.0f} | P&L {pnl_pct:+.1f}%"
        )
    stocks_text = "\n".join(stock_lines) if stock_lines else "  None"

    # MF summary
    mf_lines = []
    for h in mf_holdings:
        name = str(h.get("schemeName") or h.get("ticker") or "MF")[:40]
        val = float(h.get("currentValue", 0) or 0)
        weight = round((val / total_value * 100), 1) if total_value > 0 else 0
        mf_lines.append(f"  {name}: ₹{val:,.0f} ({weight}% wt)")
    mf_text = "\n".join(mf_lines) if mf_lines else "  None"

    # FD summary
    fd_lines = []
    for h in fd_holdings:
        name = str(h.get("ticker") or "FD")
        val = float(h.get("currentValue", 0) or 0)
        rate = float(h.get("fdRate", 0) or 0)
        weight = round((val / total_value * 100), 1) if total_value > 0 else 0
        fd_lines.append(f"  {name} @ {rate}% p.a.: ₹{val:,.0f} ({weight}% wt)")
    fd_text = "\n".join(fd_lines) if fd_lines else "  None"

    # Sector breakdown
    sector_breakdown = portfolio_data.get("sector_breakdown", {})
    sectors = []
    if isinstance(sector_breakdown, dict):
        sectors = sector_breakdown.get("sectors", [])
    elif isinstance(sector_breakdown, list):
        sectors = sector_breakdown
    sector_lines = []
    for s in sectors:
        name = s.get("name") or s.get("sector") or "Unknown"
        weight = float(s.get("weight") or s.get("percentage") or 0)
        pct = round(weight * 100, 1) if weight <= 1 else round(weight, 1)
        flag = " ⚠ OVERWEIGHT" if s.get("isOverweight") else ""
        sector_lines.append(f"  {name}: {pct}%{flag}")
    sector_text = "\n".join(sector_lines) if sector_lines else "  N/A"

    # Risk metrics
    portfolio_beta = portfolio_data.get("portfolio_beta", "N/A")
    beta_label = portfolio_data.get("beta_label", "N/A")
    user_cagr = portfolio_data.get("user_cagr", "N/A")
    nifty_cagr = portfolio_data.get("nifty_cagr", "N/A")

    div_data = portfolio_data.get("diversification_data", {})
    div_score = div_data.get("score", "N/A")
    div_verdict = div_data.get("verdict", "N/A")
    sector_score = div_data.get("sectorScore", "N/A")
    size_score = div_data.get("sizeScore", "N/A")
    corr_score = div_data.get("correlationScore", "N/A")

    # Correlation pairs
    correlation_pairs = _format_correlation_pairs(
        portfolio_data.get("correlation_pairs", [])
    )

    return f"""You are a senior Indian equity portfolio analyst advising a retail investor.
Analyse this portfolio with full context and give specific, data-driven advice.

═══ PORTFOLIO VALUE: ₹{total_value:,.0f} ═══

STOCKS ({len(stock_holdings)} holdings):
{stocks_text}

MUTUAL FUNDS ({len(mf_holdings)} holdings):
{mf_text}

FIXED DEPOSITS ({len(fd_holdings)} holdings):
{fd_text}

SECTOR ALLOCATION:
{sector_text}

RISK METRICS:
- Portfolio Beta: {portfolio_beta} ({beta_label})
- Diversification: {div_score}/10 ({div_verdict})
  · Sector: {sector_score}/10 | Size: {size_score}/10 | Correlation: {corr_score}/10
- Your CAGR: {user_cagr}% vs Nifty 50: {nifty_cagr}%

TOP CORRELATED PAIRS:
{correlation_pairs}

INSTRUCTIONS:
Respond in exactly this format. Do not add any other sections.

**Strengths:**
[2 sentences. Reference specific tickers, weights, and P&L numbers from above.]

**Concentration Risks:**
[2 sentences. Name overweight sectors and high-beta holdings with their exact weights.]

**Rebalancing Actions:**
- [Specific action with ticker and ₹ amount e.g. "Trim HCLTECH by ₹12,000"]
- [Specific action with ticker and ₹ amount]
- [Specific action with ticker and ₹ amount]
- [Specific action — may suggest adding MF/FD allocation if equity risk is high]

**Outlook:**
[1 sentence comparing your CAGR to Nifty 50 with a forward-looking note.]

Rules:
- Every rebalancing action must mention a ticker or asset name and a rupee amount
- All amounts in INR
- Only reference NSE/BSE stocks
- Max 280 words total
"""


def build_correlation_prompt(ticker1: str, ticker2: str, correlation: float, strength: str) -> str:
    movement = "together" if correlation >= 0 else "opposite"

    return f"""
You are a financial analyst explaining stock correlations to an Indian retail investor.

Stock A: {ticker1}
Stock B: {ticker2}
Correlation: {correlation} ({strength})

Explain in exactly 2-3 sentences WHY these two stocks move {movement}.
Focus on fundamental business reasons — supply chains, shared customers,
sector policies, interest rate sensitivity, macroeconomic factors.
Be specific to these companies. Do not be generic.
"""


def get_rebalancing_advice(portfolio_data: dict) -> str:
    try:
        prompt = build_rebalancing_prompt(portfolio_data)
        return get_gemini_response(prompt)
    except Exception as exc:
        logger.exception("Failed to generate rebalancing advice: %s", exc)
        return "Unable to generate advice at this time."


def get_correlation_explanation(
    ticker1: str,
    ticker2: str,
    correlation: float,
    strength: str,
) -> str:
    try:
        prompt = build_correlation_prompt(ticker1, ticker2, correlation, strength)
        return get_gemini_response(prompt)
    except Exception as exc:
        logger.exception("Failed to generate correlation explanation: %s", exc)
        return "Unable to generate explanation at this time."
