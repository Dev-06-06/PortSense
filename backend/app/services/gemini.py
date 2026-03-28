import os
from pathlib import Path
from dotenv import load_dotenv
import google.generativeai as genai
import logging

ENV_PATH = Path(__file__).resolve().parents[2] / ".env"
load_dotenv(dotenv_path=ENV_PATH)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
genai.configure(api_key=GEMINI_API_KEY)

logger = logging.getLogger(__name__)

if not GEMINI_API_KEY:
    logger.warning("GEMINI_API_KEY is not set")


def _format_holdings(holdings: list[dict]) -> str:
    if not holdings:
        return "No holdings provided"

    lines: list[str] = []
    for holding in holdings:
        ticker = str(holding.get("ticker", "Unknown")).strip() or "Unknown"

        quantity = holding.get("quantity")
        avg_price = holding.get("avgPrice")
        current_value = holding.get("currentValue")

        parts = [ticker]
        if quantity is not None:
            parts.append(f"qty {quantity}")
        if avg_price is not None:
            parts.append(f"avg ₹{avg_price}")
        if current_value is not None:
            parts.append(f"value ₹{current_value}")

        lines.append(f"- {', '.join(parts)}")

    return "\n".join(lines)


def _format_correlation_pairs(correlation_pairs: object) -> str:
    if not correlation_pairs:
        return "None"

    if isinstance(correlation_pairs, str):
        return correlation_pairs

    if isinstance(correlation_pairs, list):
        pairs_text: list[str] = []
        for item in correlation_pairs:
            if isinstance(item, dict):
                t1 = str(item.get("ticker1", "")).strip().upper()
                t2 = str(item.get("ticker2", "")).strip().upper()
                corr = item.get("correlation")

                if t1 and t2 and corr is not None:
                    pairs_text.append(f"{t1}-{t2} ({corr})")
                else:
                    pairs_text.append(str(item))
            else:
                pairs_text.append(str(item))

        return ", ".join(pairs_text) if pairs_text else "None"

    return str(correlation_pairs)


def build_rebalancing_prompt(portfolio_data: dict) -> str:
    holdings_text = _format_holdings(portfolio_data.get("holdings", []))
    sector_concentration = portfolio_data.get("sector_concentration", "N/A")
    portfolio_beta = portfolio_data.get("portfolio_beta", "N/A")
    beta_label = portfolio_data.get("beta_label", "N/A")
    diversification_score = portfolio_data.get("diversification_score", "N/A")
    user_cagr = portfolio_data.get("user_cagr", "N/A")
    nifty_cagr = portfolio_data.get("nifty_cagr", "N/A")
    correlation_pairs = _format_correlation_pairs(portfolio_data.get("correlation_pairs", []))

    return f"""
You are a portfolio advisor giving specific rebalancing advice to an Indian retail investor.

Current Portfolio:
{holdings_text}

Risk Analysis:
- Sector concentration: {sector_concentration}
- Portfolio Beta: {portfolio_beta} ({beta_label})
- Diversification Score: {diversification_score}/10
- Portfolio CAGR: {user_cagr}% vs Nifty 50: {nifty_cagr}%
- High correlation pairs: {correlation_pairs}

Respond in exactly 3 sections:

**What You Did Well:** (2-3 sentences, be specific)
**Key Risks:** (2-3 sentences, name the actual stocks)
**Rebalancing Steps:** (3-4 specific steps with approximate ₹ amounts, mention STCG/LTCG if holding period is near 1 year boundary)

Be direct and specific. Use actual stock names and rupee amounts.
Do not give generic advice.
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
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = build_rebalancing_prompt(portfolio_data)
        response = model.generate_content(prompt)
        return response.text
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
        model = genai.GenerativeModel("gemini-2.5-flash")
        prompt = build_correlation_prompt(ticker1, ticker2, correlation, strength)
        response = model.generate_content(prompt)
        return response.text
    except Exception as exc:
        logger.exception("Failed to generate correlation explanation: %s", exc)
        return "Unable to generate explanation at this time."
