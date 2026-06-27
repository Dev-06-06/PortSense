import os
import itertools
import re
from pathlib import Path
from dotenv import load_dotenv
from google import genai
from google.genai import types
import logging

from app.rag import embeddings, rag_service

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


def _generate_gemini_response(prompt: str, fallback_message: str) -> str:
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

    return fallback_message


def get_gemini_response(prompt: str) -> str:
    return _generate_gemini_response(
        prompt,
        "Unable to generate rebalancing advice. Please try again.",
    )


def _format_user_doc_chunks(chunks: list[dict]) -> str:
    if not chunks:
        return ""

    sections: list[str] = []
    for index, chunk in enumerate(chunks, start=1):
        sections.extend(
            [
                f"[Chunk {index}]",
                f"Source: {chunk.get('source', 'N/A')}",
                f"Ticker: {chunk.get('ticker', 'N/A')}",
                f"Company: {chunk.get('company', 'N/A')}",
                f"Document Type: {chunk.get('document_type', 'N/A')}",
                f"Document Name: {chunk.get('doc_name', 'N/A')}",
                f"Chunk Index: {chunk.get('chunk_index', 'N/A')}",
                "Content:",
                str(chunk.get("text", "") or "").strip(),
                "",
            ]
        )

    return "\n".join(sections).strip()


def build_user_doc_answer_prompt(question: str, chunks: list[dict]) -> str:
    retrieved_context = _format_user_doc_chunks(chunks)
    return (
        "You are an investment research assistant.\n"
        "Answer ONLY using the retrieved document context.\n"
        "Do not use outside knowledge or speculate.\n"
        "If the uploaded documents do not contain enough information, clearly say so.\n\n"
        f"Retrieved Context:\n{retrieved_context or 'No retrieved context available.'}\n\n"
        f"Question:\n{question.strip()}"
    )


def get_user_doc_answer(question: str, chunks: list[dict]) -> str:
    prompt = build_user_doc_answer_prompt(question, chunks)
    return _generate_gemini_response(
        prompt,
        "Unable to generate an answer right now. Please try again.",
    )


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


def _normalize_portfolio_ticker(ticker: str) -> str:
    normalized = str(ticker or "").strip().upper()
    if not normalized:
        return ""
    return normalized.replace(".NS", "").replace(".BO", "")


def _extract_portfolio_tickers(holdings: list[dict]) -> list[str]:
    tickers: list[str] = []
    seen: set[str] = set()

    for holding in holdings:
        ticker = _normalize_portfolio_ticker(holding.get("ticker", ""))
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        tickers.append(ticker)

    return tickers


def _dedupe_retrieved_chunks(chunks: list[dict]) -> list[dict]:
    deduped: list[dict] = []
    seen_text: set[str] = set()

    for chunk in chunks:
        text = str(chunk.get("text", "") or "").strip()
        if not text or text in seen_text:
            continue
        seen_text.add(text)
        deduped.append(chunk)

    return deduped[:5]


def _format_retrieved_context(chunks: list[dict]) -> str:
    if not chunks:
        return ""

    sections: list[str] = ["==================================================", "", "RETRIEVED KNOWLEDGE", ""]

    for chunk in chunks:
        published_at = chunk.get("published_at")
        doc_name = str(chunk.get("doc_name", "") or "").strip()
        if hasattr(published_at, "isoformat"):
            published_text = published_at.isoformat()
        else:
            published_text = str(published_at).strip()

        sentiment = chunk.get("sentiment")
        sections.extend(
            [
                "---",
                f"Source: {chunk.get('source', 'N/A')}",
                f"Company: {chunk.get('company', 'N/A')}",
                f"Ticker: {chunk.get('ticker', 'N/A')}",
                f"Document Type: {chunk.get('document_type', 'N/A')}",
                f"Date: {published_text if published_text else doc_name}",
                f"Sentiment: {sentiment if sentiment is not None else 'N/A'}",
                "Content:",
                str(chunk.get("text", "") or "").strip(),
                "",
            ]
        )

    sections.extend(["---", "=================================================="])
    return "\n".join(sections)


def _build_retrieved_context(portfolio_data: dict) -> str:
    holdings = portfolio_data.get("holdings", [])
    user_id = portfolio_data.get("user_id")
    tickers = _extract_portfolio_tickers(holdings)

    if not tickers or not user_id:
        return ""

    query_string = (
        "Portfolio analysis and investment advice for holdings: "
        f"{', '.join(tickers)}. Consider annual reports, company fundamentals and recent news."
    )

    try:
        # Query embedding for portfolio-specific RAG retrieval.
        query_embedding = embeddings.embed_query(query_string)

        # Vector retrieval for the current user's holdings and matching tickers.
        retrieved_chunks = rag_service.retrieve_context(
            query_embedding=query_embedding,
            user_id=str(user_id),
            tickers=tickers,
            limit=8,
        )

        if not retrieved_chunks:
            return ""

        deduped_chunks = _dedupe_retrieved_chunks(retrieved_chunks)
        return _format_retrieved_context(deduped_chunks)
    except Exception:
        logger.exception("Failed to build RAG context for rebalancing advice")
        return ""


def build_rebalancing_prompt(portfolio_data: dict, retrieved_context: str = "") -> str:
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
        # If the incoming weight is a tiny fraction (e.g. 0.0039 -> 0.39%),
        # multiply by 100. Otherwise assume the value is already a percentage.
        if weight < 0.01:
            pct = round(weight * 100, 1)
        else:
            pct = round(weight, 1)
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

    prompt_prefix = "You are a senior Indian equity portfolio analyst explaining a retail investor's portfolio to them. Your goal is to help them understand their portfolio — not to give trading instructions."

    prompt_body = f"""

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
This is an EXPLANATION, not a trading recommendation.
Do not add any section not listed below.
Respond in exactly this format. Do not add any other sections.

**Strengths:**
[2 sentences. Reference specific tickers, weights, and P&L numbers from above.]

**Concentration Risks:**
[2 sentences. Name overweight sectors and high-beta holdings with their exact weights.
Explain WHY this concentration is a risk — what scenario would hurt this portfolio.]

**Portfolio Considerations:**
- [One observation about a holding or sector where the current risk-return balance has shifted from the original investment thesis. Explain the mechanism — what has changed fundamentally or technically. Example: "HDFCBANK's post-merger integration has compressed NIMs over 4 quarters; the risk profile has shifted from a growth story to a recovery play, which changes its role in a diversified portfolio."]
- [One observation about the Fixed Deposit / Mutual Fund allocation relative to current interest rate environment and inflation. Explain the real return implication.]
- [One observation about a sector pair that has high correlation or concentration — explain what macro scenario would stress this.]
- [One forward-looking observation about the portfolio's positioning relative to current market cycle — capex cycle, rate cycle, global IT spending cycle, commodity cycle — whichever is most relevant to THIS portfolio's actual holdings.]

**Outlook:**
[1 sentence comparing your CAGR to Nifty 50 with a forward-looking note grounded 
in the current portfolio composition.]

Rules:
- Output ONLY these four sections: Strengths, Concentration Risks, Portfolio Considerations, Outlook. Nothing else. No other headers.
- Never use Buy, Sell, Trim, Add, Reduce, Increase
- Never use: Buy, Sell, Trim, Add, Reduce, Increase, Consider, Should
- Each point must reference a specific ticker or sector from above
- Focus on explaining WHAT IS HAPPENING and WHY — not what to do
- Never write "No details provided" or leave a bullet empty
- If uncertain, write the most relevant macro observation for this portfolio
- Max 350 words total
"""

    if not retrieved_context:
        return f"{prompt_prefix}{prompt_body}"

    return f"{prompt_prefix}\n\n{retrieved_context}\n{prompt_body}"


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
        # Prompt augmentation with retrieved context happens here.
        retrieved_context = _build_retrieved_context(portfolio_data)
        prompt = build_rebalancing_prompt(portfolio_data, retrieved_context=retrieved_context)
        raw = get_gemini_response(prompt)

        # Split into lines and rebuild, dropping Rebalancing Steps section
        lines = raw.split('\n')
        output_lines = []
        skip = False

        for line in lines:
            stripped = line.strip().lower()
            # Detect start of unwanted section (any variation)
            if 'rebalancing steps' in stripped or 'rebalancing action' in stripped:
                skip = True
                continue
            # Detect start of a new known section — stop skipping
            if skip and any(
                keyword in stripped for keyword in [
                    'strengths', 'concentration risk', 'portfolio consideration',
                    'outlook', 'what you did'
                ]
            ):
                skip = False
            if not skip:
                output_lines.append(line)

        cleaned = '\n'.join(output_lines)

        # Remove orphaned "No details provided"
        cleaned = re.sub(
            r'\nNo details provided\.?\n?', '', 
            cleaned, flags=re.IGNORECASE
        ).strip()

        return cleaned
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
