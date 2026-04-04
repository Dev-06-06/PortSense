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
    holdings_text = _format_holdings(portfolio_data.get("holdings", []))
    sector_breakdown = portfolio_data.get("sector_breakdown", [])
    if not sector_breakdown and isinstance(portfolio_data.get("sector_concentration"), list):
        sector_breakdown = portfolio_data.get("sector_concentration", [])

    if sector_breakdown:
        sector_lines = "\n".join(
            f"  - {s['sector']}: {(s.get('weight') * 100):.1f}%"
            for s in sector_breakdown
            if isinstance(s, dict) and s.get("sector") is not None and s.get("weight") is not None
        )
        if not sector_lines:
            sector_lines = "  - N/A"
    else:
        sector_lines = "  - N/A"

    portfolio_beta = portfolio_data.get("portfolio_beta", "N/A")
    beta_label = portfolio_data.get("beta_label", "N/A")
    user_cagr = portfolio_data.get("user_cagr", "N/A")
    nifty_cagr = portfolio_data.get("nifty_cagr", "N/A")
    correlation_pairs = _format_correlation_pairs(portfolio_data.get("correlation_pairs", []))
    diversification_data = portfolio_data.get("diversification_data", {})
    sector_score = diversification_data.get("sectorScore", "N/A")
    size_score = diversification_data.get("sizeScore", "N/A")
    correlation_score = diversification_data.get("correlationScore", "N/A")
    diversification_verdict = diversification_data.get("verdict", "N/A")

    return f"""
You are a portfolio advisor giving specific rebalancing advice to an Indian retail investor.

PORTFOLIO SNAPSHOT:
{holdings_text}

RISK ANALYSIS:
- Sector concentration:
{sector_lines}
- Portfolio Beta: {portfolio_beta} ({beta_label})
- Portfolio CAGR: {user_cagr}% vs Nifty 50: {nifty_cagr}%
- Diversification breakdown: Sector Score: {sector_score}/10 | Size Score: {size_score}/10 | Correlation Score: {correlation_score}/10 → Verdict: {diversification_verdict}
- Top 3 correlated pairs:
{correlation_pairs}

OUTPUT FORMAT (follow exactly):

**Strengths:** (2 sentences, cite specific stocks and metrics)
**Concentration Risks:** (2 sentences, name overweight sectors and correlated pairs)
**Rebalancing Actions:** (exactly 4 bullet points, each must mention a ticker and a ₹ action)
**Outlook:** (1 sentence comparing portfolio CAGR to Nifty 50)

You are advising a retail investor on NSE/BSE. All amounts in INR. Do not mention US stocks or markets.
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
