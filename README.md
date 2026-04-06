# PortSense 📊

> AI-powered portfolio analytics platform for Indian retail investors

**[Live Demo](https://bit.ly/portsense)** · 

> 🎯 Demo credentials — Email: `demo@portsense.in` · Password: `Demo@1234`  
> Holdings reset on each demo login so feel free to add, edit, or delete.

---

## What is PortSense?

Most Indian retail investors track their portfolio in Excel or rely on broker apps that show P&L and nothing else. PortSense goes further — it runs your holdings through a FinBERT NLP pipeline for sentiment analysis, computes portfolio beta and diversification scores, benchmarks your returns against Nifty 50, and uses Gemini AI to generate specific rebalancing advice with rupee amounts.

It supports stocks (NSE), mutual funds (via MFAPI), and fixed deposits — all in one place.

---

## Features

### Core Portfolio
- JWT authentication with demo mode (auto-reset on login)
- Holdings CRUD — Stocks, Mutual Funds, Fixed Deposits
- Live P&L dashboard with today's change, per-holding breakdown, and portfolio summary
- NSE ticker typeahead search, MFAPI fund search with active fund filtering
- Watchlist for stocks and mutual funds with live prices and sentiment badges

### Analytics
- **Sector Breakdown** — pie chart with concentration warnings for overweight sectors
- **Beta Analysis** — portfolio beta vs per-stock beta breakdown
- **Diversification Score** — composite score (sector, size, correlation sub-scores)
- **Benchmark Comparison** — XIRR-based line chart vs Nifty 50
- **Stress Test** — 6 market crash scenarios + custom shock input with horizontal bar visualization
- **Risk Decomposition** — systematic vs idiosyncratic vs sector concentration risk
- **Correlation Heatmap** — pairwise matrix with color-coded cells, positive and negative pair detection

### AI Features
- **FinBERT Sentiment** — ProsusAI/finbert scores headlines per stock, aggregates to portfolio signal. Streams results progressively as each stock completes scoring
- **Gemini Rebalancing Advisor** — grounded in live portfolio data: beta, diversification, sector weights, benchmark CAGR, correlation pairs. Returns structured advice with specific rupee amounts
- **Gemini Correlation Explainer** — explains why two stocks move together or apart using fundamental business reasoning
- **Stock Intel Drawer** — tabbed drawer (Snapshot / Technicals / Sentiment / Fundamentals / AI Analysis) with progressive reveal and TTL caching
- **MF Info Drawer** — 30-day NAV sparkline, historical returns (1W/1M/3M/1Y)

### Other Pages
- **What If? Comparison** — compares your portfolio against Gold, Silver, Nifty 50, FD, and Nifty Index Fund using the same cash flows and buy dates
- **Tax & Real Returns** — LTCG/STCG classification with ₹1.25L exemption, FD slab rate, MF fund names, inflation-adjusted real returns
- **Market News Feed** — category-filtered financial news with inline date display
- **Account Page** — Portfolio Health Score (0–100 derived from beta, diversification, sector balance), Holding Since stats, password change

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Frontend | React + Vite | Fast HMR, lightweight bundle |
| Charts | Recharts | Composable, works well with React state |
| Backend | FastAPI + Python | Async-native, auto OpenAPI docs |
| Database | MongoDB Atlas + Motor | Flexible schema for mixed asset types |
| Auth | JWT (python-jose) | Stateless, works with demo mode pattern |
| Stock Data | yfinance | Free, covers all NSE tickers |
| MF Data | MFAPI.in | Free Indian MF NAV API, no auth needed |
| Sentiment | FinBERT (HuggingFace) | Finance-domain BERT, superior to general models |
| AI | Gemini 2.5 Flash (3-key rotation) | Low latency, generous free tier |
| News | Google News RSS + yfinance news | Dual-source with 30-day freshness filter |
| Deployment | Render (backend) + Vercel (frontend) | Free tier, auto-deploy on push |

---

## Architecture Decisions

**Why FinBERT over a general sentiment model?**  
General models like VADER or TextBlob treat "the stock fell 5%" as negative even when it's expected. FinBERT was trained on financial communications and correctly scores these as neutral. It runs per-headline and aggregates via majority vote with confidence scoring.

**Why avoid stock price prediction?**  
Price prediction models require clean labeled data, significant compute, and still underperform random walk on short horizons. PortSense focuses on explainability — beta, diversification, correlation — metrics an investor can actually act on.

**Why three Gemini API keys?**  
The free tier has per-minute rate limits. Three keys in `itertools.cycle` rotation distributes requests across keys, making cold-start failures on the rebalancing advisor rare.

**Why sequential FinBERT calls instead of batch?**  
HuggingFace's free inference API binds to the event loop on batch calls, causing thread-safety issues with FastAPI's async executor. Sequential calls via `ThreadPoolExecutor` with `asyncio.to_thread` sidesteps this entirely.

**Why a single batch yfinance call for beta?**  
Concurrent `yf.download` calls share underlying urllib3 connection pools and produce race conditions. A single call with multiple tickers is thread-safe and faster.

**3-tier sector detection**  
MongoDB cache → yfinance `.info` → Gemini fallback. 33 tickers pre-seeded. Sector data is slow-changing so MongoDB cache has a long TTL.

**Asset type separation**  
All analytics routes filter by `assetType` before passing tickers to yfinance. MF scheme codes and FD bank names never reach yfinance — they go to MFAPI and a compound interest formula respectively.

---

## Local Setup

### Prerequisites
- Python 3.11+
- Node.js 18+
- MongoDB Atlas account (free tier works)
- HuggingFace API key (free)
- Gemini API keys × 3 (free tier)

### Backend
```bash
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Fill in: MONGO_URI, HF_API_KEY, GEMINI_API_KEY_1/2/3, JWT_SECRET

# Seed demo data
python seed.py

# Run
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install

# Create .env
echo "VITE_API_BASE_URL=http://localhost:8000" > .env

# Run
npm run dev
```

API docs available at `http://localhost:8000/docs`

---

## Demo Portfolio Design

The demo portfolio is deliberately constructed to showcase all analytics features:

- **IT cluster** (TCS, INFY, HCLTECH) — strong positive correlation (0.93–0.97), triggers sector concentration warning
- **Defence** (HAL, BEL) — low correlation with IT, government capex driven
- **FMCG** (HINDUNILVR, ITC) — negative correlation with IT and metals
- **Energy** (ONGC, RELIANCE) — negative correlation with IT (-0.78 to -0.83)
- **Mixed holding periods** — LTCG (pre-2024) and STCG (Aug 2025, Jan 2026) holdings to demonstrate tax page classification
- **Mixed assets** — 2 equity MFs, 1 debt MF, 2 FDs alongside stocks

---

## Project Structure
PortSense/
├── backend/
│   ├── app/
│   │   ├── routes/        # auth, holdings, analytics, genai, sentiment,
│   │   │                  # market, watchlist, news, comparison, tax_returns
│   │   ├── services/      # analytics, cache, concurrency, gemini,
│   │   │                  # market, mf, risk_decomposition, sentiment, technical
│   │   ├── models/        # holding.py (assetType, fdRate, schemeName)
│   │   └── config/        # db.py (partial unique index for FD)
│   └── seed.py
└── frontend/
└── src/
├── pages/         # Dashboard, Analytics, Tax, Comparison,
│                  # Sentiment, Account, News, Landing
├── components/    # StockIntelDrawer, BottomNav, DemoBanner
├── hooks/         # useSwipe.js
└── context/       # AuthContext
---

## Disclaimer

Tax estimates are indicative only. Sentiment and rebalancing advice are AI-generated and not financial advice. Consult a SEBI-registered advisor before making investment decisions.

---

<p align="center">Built with FastAPI, React, FinBERT, and Gemini · Deployed on Render + Vercel</p>
