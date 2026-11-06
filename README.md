# PortSense 📊

> AI-powered portfolio analytics platform for Indian retail investors — now with RAG-grounded intelligence

<div align="center">

**[Live Demo](https://port-sense-tau.vercel.app/)** &nbsp;·&nbsp; **[Backend API Docs](https://portsense.onrender.com/docs)** &nbsp;·&nbsp; **[GitHub](https://github.com/Dev-06-06/PortSense)**

![PortSense Dashboard](https://github.com/user-attachments/assets/4dff3281-c2be-4f46-83db-8c22766da8a6)

</div>

> 🎯 **Demo Login** — Email: `demo@portsense.in` · Password: `Demo@1234`  
> Holdings reset on each demo login — feel free to add, edit, or delete anything.

---

## What is PortSense?

Most Indian retail investors track their portfolio in Excel or rely on broker apps that show P&L and nothing else. PortSense goes further — it runs your holdings through a **FinBERT NLP pipeline** for real-time sentiment analysis using fresh GNews articles, computes **portfolio beta and diversification scores**, benchmarks your returns against Nifty 50 using XIRR, and uses **Gemini 2.5 Flash** to generate specific, rupee-amount rebalancing advice.

What separates PortSense from a standard analytics dashboard is its **RAG (Retrieval-Augmented Generation) pipeline** — Gemini's rebalancing advice is grounded in real retrieved context: earnings reports, research documents, and recent news articles fetched from a vector store, not just LLM priors. Users can also upload their own research documents and ask questions over them in a private, isolated knowledge base.

It supports **NSE stocks**, **mutual funds** (via MFAPI), and **fixed deposits** — three asset classes in one unified analytics platform.

---

## Screenshots

<table>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/c6528a2b-d7fa-4582-ab94-7d5a92b078b4" alt="Correlation Heatmap"/>
      <br/><sub><b>Correlation Heatmap</b></sub>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/0bceb477-4c0a-4e42-8f65-2124ad1cbc54" alt="What If Comparison"/>
      <br/><sub><b>What If? Comparison</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/85d4e837-39d0-4e10-a590-4cb2aca86615" alt="FinBERT Sentiment"/>
      <br/><sub><b>FinBERT Sentiment Analysis</b></sub>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/9894c8a4-f8bd-4dcd-8ab0-be64781c0587" alt="Tax & Real Returns"/>
      <br/><sub><b>Tax & Real Returns</b></sub>
    </td>
  </tr>
  <tr>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/68afd490-7874-4532-a90b-b1cd89baddab" alt="AI Knowledge Center"/>
      <br/><sub><b>AI Knowledge Center</b></sub>
    </td>
    <td align="center">
      <img src="https://github.com/user-attachments/assets/0c672d26-ad9f-4d29-82e2-de279dbe6e8a" alt="RAG-Grounded Q&A"/>
      <br/><sub><b>RAG-Grounded Q&A</b></sub>
    </td>
  </tr>
</table>

---

## Features

### Core Portfolio
- JWT authentication with demo mode (auto-reset on every login)
- Holdings CRUD — Stocks (NSE), Mutual Funds, Fixed Deposits
- Live P&L dashboard — per-holding breakdown, today's change, portfolio summary
- NSE ticker typeahead search, MFAPI mutual fund search with active fund filtering
- Watchlist for stocks and mutual funds with live prices and sentiment badges

### Analytics
- **Sector Breakdown** — pie chart with overweight concentration warnings. MF and FD shown as separate categories, never grouped under "Others"
- **Beta Analysis** — portfolio beta vs per-stock beta breakdown table
- **Diversification Score** — composite 0–10 score across sector, size, and correlation sub-scores
- **Benchmark Comparison** — XIRR-based line chart vs Nifty 50 across full holding period. Includes MF and FD in portfolio valuation
- **Stress Test** — 6 preset market crash scenarios + custom shock input with horizontal bar visualization
- **Risk Decomposition** — systematic vs idiosyncratic vs sector concentration risk split
- **Correlation Heatmap** — pairwise matrix with color-coded cells. Top pairs explicitly show both strongly positive and negative correlations

### AI & RAG Features
- **FinBERT Sentiment** — ProsusAI/finbert scores headlines per stock using real-time GNews articles (2–7 day freshness window, tier-based per stock coverage). Aggregates to portfolio signal (Bullish/Bearish/Mixed). Collapse/expand per stock showing scored headlines with source name, date, and clickable article URL. Stocks with no recent news show "No recent articles — Sentiment defaulted to Neutral" rather than stale or misleading scores
- **Gemini Rebalancing Advisor (RAG-grounded)** — before generating advice, retrieves the top 5 semantically relevant chunks from the vector store (earnings reports, research docs, recent news) scoped to tickers in the user's portfolio. Retrieved context is injected under a `RETRIEVED KNOWLEDGE` block in the prompt. Gemini reasons over live beta, diversification, sector weights, benchmark CAGR, correlation pairs, *and* the retrieved grounding context to return structured advice with specific rupee amounts per action across stocks, MFs, and FDs
- **AI Knowledge Center** — dedicated section in the bottom nav with two capabilities:
  - *Ask AI over your documents* — upload a PDF or text file (earnings call, research article, annual report) and ask natural language questions. The backend embeds the question, retrieves the top matching chunks from your private document store, and sends them to Gemini with a strict "Answer ONLY from retrieved context" instruction. Response includes source attribution (doc name, ticker, chunk index, relevance score)
  - *Admin Knowledge Base* — admin-uploaded documents (annual reports, quarterly results, earnings call transcripts, presentations) are publicly accessible to all users during retrieval, enriching the rebalancing advisor for everyone
- **Multi-tenant RAG isolation** — user-uploaded documents are scoped strictly by `user_id` at retrieval time. A metadata filter in the `$vectorSearch` stage ensures User A's documents are never surfaced in User B's results, even though all documents share one collection
- **GNews auto-embedding** — after FinBERT sentiment runs on fetched articles, each article is batch-embedded in a background task and upserted into the vector store (deduplicated by URL hash). These articles feed into the rebalancing advisor's retrieved context with a 1-year TTL applied at query time via a `published_at` filter
- **Gemini Correlation Explainer** — explains why two stocks move together or apart using fundamental business reasoning
- **Stock Intel Drawer** — tabbed drawer (Snapshot / Technicals / Sentiment / Fundamentals / AI Analysis) with progressive reveal and TTL caching
- **MF Info Drawer** — 30-day NAV sparkline, historical returns (1W / 1M / 3M / 1Y)

### Other Pages
- **What If? Comparison** — compares your portfolio against Gold, Silver, Nifty 50, FD, and Nifty Index Fund using identical cash flows and buy dates. MF NAV and FD compound interest included in portfolio valuation
- **Tax & Real Returns** — LTCG/STCG classification with ₹1.25L exemption, FD slab rate, MF debt vs equity treatment, inflation-adjusted real returns per holding
- **Market News Feed** — 13 category filters (Market, Banking, IT, Pharma, Auto, Energy, Finance, Mutual Funds, IPO, Economy, SEBI, Govt Policy, Rupee) powered by GNews API with article thumbnails, descriptions, and source attribution. Falls back to Google RSS if GNews is unavailable
- **Account Page** — Portfolio Health Score (0–100 derived from beta stability, diversification, sector balance), Holding Since stats, username and password change

---

## RAG Pipeline

PortSense uses a production RAG pipeline built on MongoDB Atlas Vector Search and Gemini Embedding. All three document types — admin knowledge base, user private documents, and GNews articles — share a single collection with metadata-based isolation.

### Architecture

```
INGESTION
─────────────────────────────────────────────────────────────
Admin PDF/TXT upload  ──► extract text (pdfplumber)
                          ──► chunk (500 words, 50-word overlap)
                          ──► batch embed (gemini-embedding-001, 768-dim)
                          ──► store in Atlas  { source: "admin_doc" }

User PDF/TXT upload   ──► same pipeline
                          ──► store in Atlas  { source: "user_doc", user_id: "..." }

GNews article fetch   ──► FinBERT sentiment (existing pipeline, unchanged)
                          ──► background task fires after response returned
                          ──► batch embed article text
                          ──► upsert in Atlas { source: "gnews", url_hash: md5(url) }

RETRIEVAL  (on every Gemini call)
─────────────────────────────────────────────────────────────
Portfolio tickers  ──► build query string
                   ──► embed_query (task_type: RETRIEVAL_QUERY)
                   ──► $vectorSearch with pre-filter:
                         source == "admin_doc"
                         OR (source == "gnews" AND published_at >= now - 365d)
                         OR (source == "user_doc" AND user_id == requesting_user)
                         AND ticker IN portfolio_tickers
                   ──► top 8 chunks, sorted by cosine score
                   ──► deduplicate + trim to 5 unique chunks
                   ──► inject as RETRIEVED KNOWLEDGE block into Gemini prompt
```

### Vector Store Configuration

| Parameter | Value |
|---|---|
| Database | `portsense_rag` |
| Collection | `rag_documents` |
| Index name | `rag_vector_index` |
| Embedding model | `gemini-embedding-001` |
| Dimensions | 768 |
| Similarity | Cosine |
| numCandidates | 100 |
| Default limit | 8 |
| Filter fields indexed | `source`, `user_id`, `published_at`, `ticker` |

### Document Schemas

**Admin / User Doc Chunk**
```json
{
  "text": "Revenue grew 12% YoY...",
  "embedding": [0.021, -0.043, ...],
  "doc_id": "uuid4",
  "doc_name": "Infosys_Q4_2026.pdf",
  "document_type": "quarterly_report",
  "ticker": "INFY",
  "company": "Infosys",
  "source": "admin_doc",
  "user_id": null,
  "chunk_index": 3,
  "total_chunks": 24,
  "created_at": "2026-06-27T10:00:00Z",
  "uploaded_by": "admin"
}
```

**GNews Article**
```json
{
  "text": "Infosys Q4 revenue...",
  "embedding": [0.011, -0.067, ...],
  "ticker": "INFY",
  "company": "Infosys",
  "title": "Infosys beats Q4 estimates...",
  "url": "https://...",
  "url_hash": "md5_of_url",
  "publisher": "Economic Times",
  "published_at": "2026-06-20T10:30:00Z",
  "created_at": "2026-06-26T14:22:00Z",
  "sentiment": "Positive",
  "sentiment_score": 0.91,
  "source": "gnews"
}
```

### Isolation Model

All documents live in one collection. Retrieval isolation is enforced entirely through metadata pre-filters in the `$vectorSearch` stage — no separate namespaces or collections needed. The filter logic:

- `admin_doc` → accessible to all users, always included
- `gnews` → accessible to all users, filtered to last 365 days via `published_at`
- `user_doc` → accessible only when `user_id` in the filter matches the requesting user's ID

Deduplication for GNews articles is enforced via a unique Atlas index on `url_hash` combined with `upsert=True` on `url_hash` — the same article fetched by multiple users is stored exactly once.

---

## Tech Stack

| Layer | Technology | Reason |
|---|---|---|
| Frontend | React + Vite | Fast HMR, lightweight bundle |
| Charts | Recharts | Composable, works well with React state |
| Backend | FastAPI + Python | Async-native, automatic OpenAPI docs |
| Database | MongoDB Atlas + Motor | Flexible schema for mixed asset types |
| Vector Store | MongoDB Atlas Vector Search | Native to existing cluster, no extra infra |
| Embeddings | gemini-embedding-001 (768-dim) | Free tier, MRL support, finance-domain quality |
| Auth | JWT (python-jose) | Stateless, works cleanly with demo mode |
| Stock Data | yfinance | Free, covers all NSE/BSE tickers |
| MF Data | MFAPI.in | Free Indian MF NAV API, no auth required |
| Sentiment | FinBERT via HuggingFace Inference API | Finance-domain BERT, outperforms general models on financial text |
| AI | Gemini 2.5 Flash (3-key rotation) | Low latency, generous free tier |
| News | GNews API (student access) + Google RSS fallback | Real-time Indian financial news with verified timestamps and source attribution |
| PDF Parsing | pdfplumber | Reliable text extraction, paragraph boundary preservation |
| Deployment | Render (backend) + Vercel (frontend) | Free tier, auto-deploy on push |

---

## Architecture Decisions

**Why RAG over pure prompt engineering for rebalancing advice?**  
Without RAG, Gemini's rebalancing advice is grounded only in the portfolio data passed in the prompt and its training priors. With RAG, it reasons over retrieved earnings report excerpts and recent news articles scoped to the user's actual holdings — the advice cites real, current data rather than generalised LLM knowledge. The difference is observable: advice for a portfolio holding INFY will reference actual Q4 figures if an earnings report has been uploaded, not a generic "IT sector is volatile" statement.

**Why a single collection instead of separate collections per source type?**  
One collection with a `source` + `user_id` metadata filter is simpler to operate than three collections, avoids fan-out queries, and lets Atlas resolve the filter inside a single `$vectorSearch` stage. Multi-tenant isolation is fully enforced in the pre-filter — no collection-level separation is needed.

**Why 768 dimensions instead of 3072 (default)?**  
`gemini-embedding-001` supports Matryoshka Representation Learning — dimensions can be truncated from 3072 to 768 with negligible quality loss at this data scale. 768-dim vectors are 4× smaller in storage and faster to index and query. For thousands of documents the difference in retrieval quality is unmeasurable.

**Why batch embedding?**  
A 10-page PDF produces ~20–30 chunks. Sequential embedding API calls would take 6–8 seconds. Batching all chunks into one API call reduces this to ~1–2 seconds. The same applies to GNews articles — all articles from a single fetch are batched into one embedding call.

**Why BackgroundTasks for GNews embedding?**  
The user should never wait for embedding latency on a news fetch. FastAPI's `BackgroundTasks` fires the embedding pipeline after the response is already returned to the client. The articles appear in the vector store for future Gemini calls without adding any perceived latency to the news feed.

**Why FinBERT over VADER or TextBlob?**  
General sentiment models treat "the stock fell 5% as expected after results" as negative. FinBERT was trained on financial communications and correctly classifies these as neutral. It scores per-headline and aggregates via majority vote with confidence scoring.

**Why GNews API over Google RSS for sentiment?**  
Google News RSS has no guaranteed freshness — despite the `&tbs=qdr:w` parameter, articles from 3 months ago routinely appear for active NSE stocks. FinBERT scoring stale headlines produces sentiment badges that reflect last month's market mood, not today's. GNews student API provides verified `publishedAt` timestamps and Indian-sourced articles (NDTV Profit, Economic Times, Moneycontrol). A tiered freshness window is applied — 2 days for heavily covered large-caps (TCS, INFY, HDFCBANK), 5 days for mid-caps, 7 days for defence and railway stocks — balancing recency against coverage depth.

**Why show "No recent articles" instead of hiding the card?**  
Hiding a stock card when no fresh news exists implies the stock doesn't need attention. Showing the card with an explicit "No recent articles — Sentiment defaulted to Neutral" message is more honest and helps the investor understand the confidence level of the signal.

**Why avoid stock price prediction?**  
Price prediction requires clean labeled data, significant compute, and still underperforms random walk on short horizons. PortSense focuses on explainability — beta, diversification, correlation — metrics an investor can actually act on. This design choice was deliberate.

**Why three Gemini API keys in rotation?**  
The free tier enforces per-minute rate limits. Three keys in `itertools.cycle` distributes load, making cold-start failures on the rebalancing advisor rare without any paid tier.

**Why sequential FinBERT calls instead of batch?**  
HuggingFace's free inference API binds to the event loop on batch calls, causing thread-safety issues with FastAPI's async executor. Sequential calls via `ThreadPoolExecutor` with `asyncio.to_thread` sidesteps this entirely with no performance loss on the free tier.

**Why a single batch yfinance call for beta?**  
Concurrent `yf.download` calls share underlying urllib3 connection pools and produce race conditions under asyncio. A single call with multiple tickers is thread-safe and faster.

**Asset type separation throughout**  
Every analytics route filters by `assetType` before passing tickers to yfinance. MF scheme codes and FD bank names never reach yfinance — they route to MFAPI and a compound interest formula respectively. This required fixes across 8 route files.

**3-tier sector detection**  
MongoDB cache → yfinance `.info` → Gemini fallback. 33 tickers pre-seeded. MF and FD are short-circuited to "Mutual Fund" and "Fixed Deposit" labels before any API call, preventing them from appearing as "Others" in the sector breakdown.

**Analytics and sentiment prefetching**  
After the Dashboard loads, analytics endpoints are prefetched silently after 3 seconds, and sentiment after 6 seconds. This ensures near-instant load times when the user navigates to those pages, trading one extra GNews quota call per session for a significantly better experience.

---

## Demo Portfolio Design

The demo portfolio is deliberately constructed to showcase every analytics feature:

| Group | Holdings | Purpose |
|---|---|---|
| IT cluster | TCS, INFY, HCLTECH | Strong positive correlation (0.93–0.97), triggers sector concentration warning |
| Defence | HAL, BEL | Low correlation with IT, government capex driven |
| FMCG | HINDUNILVR, ITC | Negative correlation with IT and metals (−0.4 to −0.5) |
| Energy | ONGC, RELIANCE | Strong negative correlation with IT (−0.78 to −0.83) |
| Banking | HDFCBANK, ICICIBANK | Moderate positive, high beta |
| Metal | TATASTEEL, JSWSTEEL | Cyclical, negative correlation with pharma |
| Railway/Infra | IRCTC, LT | PSU capex cycle, low correlation with private IT |
| Pharma | SUNPHARMA, DRREDDY | Defensive, negative correlation with cyclicals |
| Holding periods | Mix of pre-2024, Aug 2025, Jan 2026 buys | Demonstrates LTCG, STCG, and near-LTCG tax classification |
| Assets | 2 equity MFs, 1 debt MF, 2 FDs | Multi-asset type coverage across all features |

---

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Atlas account (free tier) with Vector Search enabled
- HuggingFace API key (free)
- Gemini API keys × 3 (free tier)
- GNews API key (free tier at [gnews.io](https://gnews.io))

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Fill in: MONGO_URI, HF_API_KEY, GEMINI_API_KEY_1/2/3,
#          JWT_SECRET, GNEWS_STUDENT_KEY, GNEWS_PERSONAL_KEY,
#          ADMIN_EMAIL, RAG_DB, RAG_COLLECTION

# Seed demo data
python seed.py

# Run
uvicorn app.main:app --reload
```

### Atlas Vector Search Index

In your Atlas cluster, create a vector search index on `portsense_rag.rag_documents` with this definition:

```json
{
  "name": "rag_vector_index",
  "type": "vectorSearch",
  "definition": {
    "fields": [
      {
        "type": "vector",
        "path": "embedding",
        "numDimensions": 768,
        "similarity": "cosine"
      },
      { "type": "filter", "path": "source" },
      { "type": "filter", "path": "user_id" },
      { "type": "filter", "path": "ticker" },
      { "type": "filter", "path": "published_at" }
    ]
  }
}
```

Also create a unique index on `url_hash` for GNews deduplication.

### Frontend

```bash
cd frontend
npm install
echo "VITE_API_BASE_URL=http://localhost:8000" > .env
echo "VITE_ADMIN_EMAIL=your@email.com" >> .env
npm run dev
```

API docs at `http://localhost:8000/docs`

---

## Project Structure

```
PortSense/
├── backend/
│   ├── app/
│   │   ├── rag/
│   │   │   ├── embeddings.py        # Gemini embed_texts (batch) + embed_query
│   │   │   ├── chunker.py           # 500-word chunks, 50-word overlap
│   │   │   ├── news_embedder.py     # GNews batch embed + Atlas upsert
│   │   │   └── rag_service.py       # store_doc_chunks, store_news_article, retrieve_context
│   │   ├── routers/
│   │   │   ├── admin_rag.py         # POST /admin/upload-doc
│   │   │   ├── user_rag.py          # POST /user/upload-doc, POST /user/ask-ai
│   │   │   ├── auth.py
│   │   │   ├── holdings.py
│   │   │   ├── analytics.py
│   │   │   ├── genai.py
│   │   │   ├── sentiment.py
│   │   │   ├── market.py
│   │   │   ├── watchlist.py
│   │   │   ├── news.py
│   │   │   ├── comparison.py
│   │   │   └── tax_returns.py
│   │   ├── services/
│   │   │   ├── document_upload.py   # PDF/TXT extraction, orchestrates chunk→embed→store
│   │   │   ├── gemini.py            # RAG prompt building + Gemini calls
│   │   │   ├── analytics.py
│   │   │   ├── sentiment.py
│   │   │   ├── market.py
│   │   │   ├── mf.py
│   │   │   ├── risk_decomposition.py
│   │   │   ├── technical.py
│   │   │   ├── cache.py
│   │   │   └── concurrency.py
│   │   ├── models/
│   │   │   └── holding.py
│   │   └── config/
│   │       └── db.py
│   └── seed.py
└── frontend/
    └── src/
        ├── pages/
        │   ├── Dashboard.jsx
        │   ├── Analytics.jsx
        │   ├── Tax.jsx
        │   ├── Comparison.jsx
        │   ├── SentimentPage.jsx
        │   ├── KnowledgeBase.jsx    # AI Knowledge Center (upload + Ask AI)
        │   ├── Account.jsx
        │   ├── NewsPage.jsx
        │   └── Landing.jsx
        ├── components/
        │   ├── StockIntelDrawer.jsx
        │   ├── TopNav.jsx
        │   ├── BottomNav.jsx
        │   └── DemoBanner.jsx
        ├── hooks/
        │   └── useSwipe.js
        └── context/
            └── AuthContext.jsx
```

---

## Roadmap

- [ ] Bond support as a first-class asset type (coupon-based, not compound)
- [ ] Historical MF NAV per month in What If? timeline (currently uses current NAV as proxy)
- [ ] Portfolio export to PDF
- [ ] Price alerts via email for watchlist items
- [ ] Multi-currency support for NRI investors
- [ ] SSE streaming for sentiment progressive card reveal (currently blocked by ad-blocker heuristics on fetch endpoints)
- [ ] Scheduled background worker to continuously embed incoming GNews articles into the vector store
- [ ] Source citation in rebalancing advice (surface which retrieved chunk influenced which recommendation)
- [ ] Admin document management UI (list uploaded docs, delete by doc_id)

---

## Disclaimer

Tax estimates are indicative only. Sentiment analysis and rebalancing advice are AI-generated and do not constitute financial advice. RAG-retrieved context is sourced from admin-uploaded documents and GNews articles — always verify information against official filings before making investment decisions. News articles are sourced via GNews API — PortSense does not own or modify any article content. Always attribute the original publisher when sharing. Consult a SEBI-registered investment advisor before making investment decisions.

---

<div align="center">

Built with FastAPI · React · FinBERT · Gemini 2.5 Flash · MongoDB Atlas Vector Search  
Deployed on Render + Vercel · Data from NSE via yfinance + MFAPI

**[Try the live demo →](https://port-sense-tau.vercel.app/)**

</div>
