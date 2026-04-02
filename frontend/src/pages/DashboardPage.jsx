import { useEffect, useState } from "react";
import api from "../services/api";
import StockIntelDrawer from "../components/StockIntelDrawer";

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "1.25rem",
};

const containerStyle = {
  width: "100%",
  maxWidth: "72rem",
  margin: "0 auto",
  display: "grid",
  gap: "1rem",
};

const cardStyle = {
  borderRadius: "1rem",
  border: "1px solid rgba(255, 255, 255, 0.08)",
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  backdropFilter: "blur(8px)",
};

const numberStyle = {
  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
  letterSpacing: "0.02em",
};

const buttonBaseStyle = {
  border: "none",
  borderRadius: "0.75rem",
  padding: "0.7rem 1rem",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
};

const inputStyle = {
  width: "100%",
  border: "1px solid rgba(255, 255, 255, 0.18)",
  backgroundColor: "#0f172a",
  color: "#e5e7eb",
  borderRadius: "0.75rem",
  padding: "0.7rem 0.8rem",
  boxSizing: "border-box",
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatNumber = (value) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const EMPTY_SUMMARY = {
  totalInvested: 0,
  totalCurrentValue: 0,
  totalPnl: 0,
  totalPnlPercent: 0,
};

const NSE_TICKERS = [
  { symbol: "RELIANCE", full: "Reliance Industries" },
  { symbol: "INFY", full: "Infosys" },
  { symbol: "TCS", full: "TCS" },
  { symbol: "HDFCBANK", full: "HDFC Bank" },
  { symbol: "ICICIBANK", full: "ICICI Bank" },
  { symbol: "SBIN", full: "State Bank of India" },
  { symbol: "AXISBANK", full: "Axis Bank" },
  { symbol: "KOTAKBANK", full: "Kotak Mahindra Bank" },
  { symbol: "WIPRO", full: "Wipro" },
  { symbol: "HCLTECH", full: "HCL Technologies" },
  { symbol: "TECHM", full: "Tech Mahindra" },
  { symbol: "TATASTEEL", full: "Tata Steel" },
  { symbol: "JSWSTEEL", full: "JSW Steel" },
  { symbol: "HINDALCO", full: "Hindalco" },
  { symbol: "ADANIPOWER", full: "Adani Power" },
  { symbol: "ADANIENT", full: "Adani Enterprises" },
  { symbol: "ADANIPORTS", full: "Adani Ports" },
  { symbol: "SUNPHARMA", full: "Sun Pharma" },
  { symbol: "DRREDDY", full: "Dr Reddys" },
  { symbol: "CIPLA", full: "Cipla" },
  { symbol: "DIVISLAB", full: "Divis Laboratories" },
  { symbol: "HINDUNILVR", full: "Hindustan Unilever" },
  { symbol: "ITC", full: "ITC" },
  { symbol: "NESTLEIND", full: "Nestle India" },
  { symbol: "BAJFINANCE", full: "Bajaj Finance" },
  { symbol: "BAJAJFINSV", full: "Bajaj Finserv" },
  { symbol: "MARUTI", full: "Maruti Suzuki" },
  { symbol: "TATAMOTORS", full: "Tata Motors" },
  { symbol: "M&M", full: "Mahindra & Mahindra" },
  { symbol: "HEROMOTOCO", full: "Hero MotoCorp" },
  { symbol: "BAJAJ-AUTO", full: "Bajaj Auto" },
  { symbol: "ONGC", full: "ONGC" },
  { symbol: "NTPC", full: "NTPC" },
  { symbol: "POWERGRID", full: "Power Grid" },
  { symbol: "COALINDIA", full: "Coal India" },
  { symbol: "LT", full: "Larsen & Toubro" },
  { symbol: "ULTRACEMCO", full: "UltraTech Cement" },
  { symbol: "GRASIM", full: "Grasim Industries" },
  { symbol: "TITAN", full: "Titan Company" },
  { symbol: "ASIANPAINT", full: "Asian Paints" },
  { symbol: "HDFCLIFE", full: "HDFC Life Insurance" },
  { symbol: "SBILIFE", full: "SBI Life Insurance" },
  { symbol: "BHARTIARTL", full: "Bharti Airtel" },
  { symbol: "JIO", full: "Jio Financial Services" },
  { symbol: "VEDL", full: "Vedanta" },
  { symbol: "BEL", full: "Bharat Electronics" },
  { symbol: "BHEL", full: "Bharat Heavy Electricals" },
  { symbol: "HAL", full: "Hindustan Aeronautics" },
  { symbol: "IRCTC", full: "IRCTC" },
  { symbol: "ZOMATO", full: "Zomato" },
  { symbol: "NYKAA", full: "Nykaa" },
  { symbol: "PAYTM", full: "Paytm" },
  { symbol: "DMART", full: "DMart (Avenue Supermarts)" },
  { symbol: "TATACONSUM", full: "Tata Consumer Products" },
  { symbol: "PIDILITIND", full: "Pidilite Industries" },
  { symbol: "SIEMENS", full: "Siemens India" },
  { symbol: "ABB", full: "ABB India" },
  { symbol: "BANKBARODA", full: "Bank of Baroda" },
  { symbol: "PNB", full: "Punjab National Bank" },
  { symbol: "CANBK", full: "Canara Bank" },
  { symbol: "INDUSINDBK", full: "IndusInd Bank" },
  { symbol: "IDFC", full: "IDFC First Bank" },
];

const DashboardPage = () => {
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    buyPrice: "",
    qty: "",
    buyDate: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [tickerQuery, setTickerQuery] = useState("");
  const [showTickerDrop, setShowTickerDrop] = useState(false);
  const [formData, setFormData] = useState({
    ticker: "",
    buyDate: "",
    buyPrice: "",
    quantity: "",
  });
  const [livePriceFetching, setLivePriceFetching] = useState(false);
  const [livePrice, setLivePrice] = useState(null);

  const tickerSuggestions =
    tickerQuery.length < 1
      ? []
      : NSE_TICKERS.filter(
          (t) =>
            t.symbol.startsWith(tickerQuery.toUpperCase()) ||
            t.full.toLowerCase().includes(tickerQuery.toLowerCase()),
        ).slice(0, 6);

  const fetchPortfolioData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setSilentRefreshing(true);
    setError("");

    try {
      const response = await api.get("/api/holdings/dashboard");
      const data = response.data;
      setHoldings(Array.isArray(data.holdings) ? data.holdings : []);
      setSummary({ ...EMPTY_SUMMARY, ...(data.summary || {}) });
    } catch {
      if (!silent) {
        setError("Unable to load holdings. Please try again.");
        setSummary(EMPTY_SUMMARY);
      }
    } finally {
      if (!silent) setLoading(false);
      else setSilentRefreshing(false);
    }
  };

  useEffect(() => {
    document.title = "Dashboard | PortSense";
  }, []);

  useEffect(() => {
    fetchPortfolioData();
  }, []);

  useEffect(() => {
    const intervalId = setInterval(() => {
      fetchPortfolioData(true);
    }, 60000);
    return () => clearInterval(intervalId);
  }, []);

  const onChangeForm = (event) => {
    const { name, value } = event.target;
    if (name === "ticker") {
      setLivePrice(null);
    }
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const onSubmitHolding = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      await api.post("/api/holdings", {
        ticker: formData.ticker.trim(),
        buyDate: formData.buyDate,
        buyPrice: Number(formData.buyPrice),
        quantity: Number(formData.quantity),
      });

      setFormData({
        ticker: "",
        buyDate: "",
        buyPrice: "",
        quantity: "",
      });
      setTickerQuery("");
      setLivePrice(null);
      setShowAddForm(false);
      await fetchPortfolioData();
    } catch (requestError) {
      const message =
        requestError?.response?.data?.detail ||
        "Unable to add holding. Check your values and try again.";
      setError(message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (holdingId) => {
    setError("");

    try {
      await api.delete(`/api/holdings/${holdingId}`);
      await fetchPortfolioData();
    } catch {
      setError("Unable to delete holding. Please try again.");
    }
  };

  const fetchLivePrice = async (ticker) => {
    if (!ticker) {
      setLivePrice(null);
      return;
    }

    setLivePriceFetching(true);
    setLivePrice(null);

    try {
      const res = await api.get(`/api/market/price/${ticker}`);
      setLivePrice(res.data?.currentPrice || null);
    } catch {
      setLivePrice(null);
    } finally {
      setLivePriceFetching(false);
    }
  };

  const totalDayChange = holdings.reduce((sum, h) => sum + (Number(h.dayChange) || 0), 0);
  const isDayPositive = totalDayChange >= 0;

  return (
    <div style={shellStyle}>
      <style>{`
        .loader-spin {
          animation: spin 0.9s linear infinite;
        }

        .summary-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.75rem;
        }

        .add-holding-form {
          grid-template-columns: 1fr;
          width: 100%;
        }

        .mobile-hide-col {
          display: none;
        }

        .holdings-table {
          min-width: 560px;
        }

        .holding-row {
          cursor: pointer;
          transition: background-color 0.16s ease;
        }

        .holding-row:hover {
          background: rgba(255, 255, 255, 0.04);
        }

        .animate-pulse {
          animation: dashboard-pulse 1.4s ease-in-out infinite;
        }

        @keyframes dashboard-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        @media (min-width: 768px) {
          .summary-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (min-width: 900px) {
          .summary-grid {
            grid-template-columns: repeat(4, minmax(0, 1fr));
          }

          .add-holding-form {
            grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
          }

          .mobile-hide-col {
            display: table-cell;
          }

          .holdings-table {
            min-width: 840px;
          }
        }
      `}</style>

      <div style={containerStyle}>
        <div style={{ ...cardStyle, padding: "1rem" }}>
          <div className="summary-grid">
            <div>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
                Total Invested
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.25rem 0 0",
                  fontSize: "1.6rem",
                  color: "#f8fafc",
                }}
              >
                {formatCurrency(summary.totalInvested)}
              </p>
              {summary.totalInvested > 0 && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.85rem",
                    color: Number(summary.totalPnlPercent) >= 0 ? '#22c55e' : '#ef4444',
                  }}
                >
                  {Number(summary.totalPnlPercent) >= 0 ? '+' : ''}{Number(summary.totalPnlPercent || 0).toFixed(2)}%
                </p>
              )}
            </div>

            <div>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
                Current Value
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.25rem 0 0",
                  fontSize: "1.6rem",
                  color: "#f8fafc",
                }}
              >
                {formatCurrency(summary.totalCurrentValue)}
              </p>
              {summary.totalInvested > 0 && (
                <p
                  style={{
                    margin: "0.25rem 0 0",
                    fontSize: "0.85rem",
                    color: Number(summary.totalPnlPercent) >= 0 ? '#22c55e' : '#ef4444',
                  }}
                >
                  {Number(summary.totalPnlPercent) >= 0 ? '+' : ''}{Number(summary.totalPnlPercent || 0).toFixed(2)}% overall
                </p>
              )}
            </div>

            <div>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
                Total P&L
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.25rem 0 0",
                  fontSize: "1.6rem",
                  color: summary.totalPnl >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {formatCurrency(summary.totalPnl)}
              </p>
              <p
                style={{
                  margin: "0.25rem 0 0",
                  fontSize: "0.85rem",
                  color: Number(summary.totalPnlPercent) >= 0 ? '#22c55e' : '#ef4444',
                }}
              >
                {Number(summary.totalPnlPercent) >= 0 ? '+' : ''}{Number(summary.totalPnlPercent || 0).toFixed(2)}%
              </p>
            </div>

            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  minHeight: "1.3rem",
                }}
              >
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.85rem" }}>
                  Today's P&L
                </p>
                {silentRefreshing && (
                  <span style={{ color: "#94a3b8", fontSize: "0.7rem" }}>updating...</span>
                )}
              </div>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.25rem 0 0",
                  fontSize: "1.6rem",
                  color: isDayPositive ? "#22c55e" : "#ef4444",
                }}
              >
                {isDayPositive ? "+" : ""}{formatCurrency(totalDayChange)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "1rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.8rem",
              gap: "0.7rem",
              flexWrap: "wrap",
            }}
          >
            <h2 style={{ margin: 0, fontSize: "1.1rem", color: "#f8fafc" }}>
              My Holdings
            </h2>
            <button
              type="button"
              onClick={() => {
                setShowAddForm((prev) => !prev);
                setLivePrice(null);
              }}
              style={{
                ...buttonBaseStyle,
                backgroundColor: "#f97316",
              }}
            >
              + Add Holding
            </button>
          </div>

          {showAddForm && (
            <form
              onSubmit={onSubmitHolding}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.7rem",
                marginBottom: "1rem",
              }}
            >
              <div style={{ position: "relative" }}>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  TICKER
                </p>
                <input
                  name="ticker"
                  type="text"
                  placeholder="Search e.g. INFY, Infosys..."
                  value={tickerQuery}
                  autoComplete="off"
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setTickerQuery(e.target.value);
                    setFormData((p) => ({ ...p, ticker: val }));
                    setShowTickerDrop(true);
                  }}
                  onBlur={() => setTimeout(() => setShowTickerDrop(false), 150)}
                  onFocus={() => {
                    if (tickerQuery.length > 0) setShowTickerDrop(true);
                  }}
                  required
                  style={{
                    ...inputStyle,
                    fontSize: "1rem",
                    minHeight: "2.75rem",
                  }}
                />

                {showTickerDrop && tickerSuggestions.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 4px)",
                      left: 0,
                      right: 0,
                      backgroundColor: "#0f172a",
                      border: "1px solid rgba(255,255,255,0.15)",
                      borderRadius: "0.75rem",
                      overflow: "hidden",
                      zIndex: 100,
                      boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                    }}
                  >
                    {tickerSuggestions.map((t) => (
                      <div
                        key={t.symbol}
                        onMouseDown={() => {
                          const fullTicker = `${t.symbol}.NS`;
                          setFormData((p) => ({
                            ...p,
                            ticker: fullTicker,
                          }));
                          setTickerQuery(t.symbol);
                          setShowTickerDrop(false);
                          fetchLivePrice(fullTicker);
                        }}
                        style={{
                          padding: "0.7rem 1rem",
                          cursor: "pointer",
                          borderBottom: "1px solid rgba(255,255,255,0.06)",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                        }}
                        onMouseEnter={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "rgba(249,115,22,0.1)")
                        }
                        onMouseLeave={(e) =>
                          (e.currentTarget.style.backgroundColor =
                            "transparent")
                        }
                      >
                        <span
                          style={{
                            color: "#f97316",
                            fontWeight: 700,
                            fontSize: "0.9rem",
                          }}
                        >
                          {t.symbol}
                        </span>
                        <span style={{ color: "#94a3b8", fontSize: "0.8rem" }}>
                          {t.full}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  BUY DATE
                </p>
                <input
                  name="buyDate"
                  type="date"
                  value={formData.buyDate}
                  onChange={onChangeForm}
                  required
                  style={inputStyle}
                />
              </div>

              {(livePriceFetching || livePrice !== null) && (
                <div
                  style={{
                    padding: "0.75rem 0.9rem",
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(249, 115, 22, 0.2)",
                    backgroundColor: "rgba(249, 115, 22, 0.08)",
                  }}
                >
                  <p
                    style={{
                      margin: 0,
                      color: "#f8fafc",
                      fontSize: "0.8rem",
                      fontWeight: 700,
                    }}
                  >
                    Current market price:
                  </p>
                  <p
                    style={{
                      margin: "0.25rem 0 0",
                      color: "#fdba74",
                      fontSize: "1rem",
                      fontWeight: 700,
                    }}
                  >
                    {livePriceFetching ? "Fetching..." : formatCurrency(livePrice)}
                  </p>
                </div>
              )}

              <div>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  BUY PRICE (₹)
                </p>
                <input
                  name="buyPrice"
                  type="text"
                  inputMode="decimal"
                  placeholder="e.g. 1380.50"
                  value={formData.buyPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setFormData((p) => ({ ...p, buyPrice: val }));
                    }
                  }}
                  required
                  style={{
                    ...inputStyle,
                    fontSize: "1rem",
                    minHeight: "2.75rem",
                  }}
                />
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  QUANTITY
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    border: "1px solid rgba(255,255,255,0.18)",
                    borderRadius: "0.75rem",
                    overflow: "hidden",
                    backgroundColor: "#0f172a",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        quantity: String(Math.max(1, Number(p.quantity) - 1)),
                      }))
                    }
                    style={{
                      width: "3rem",
                      height: "2.75rem",
                      backgroundColor: "transparent",
                      border: "none",
                      borderRight: "1px solid rgba(255,255,255,0.18)",
                      color: "#f97316",
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    −
                  </button>
                  <input
                    name="quantity"
                    type="text"
                    inputMode="numeric"
                    placeholder="0"
                    value={formData.quantity}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val)) {
                        setFormData((p) => ({ ...p, quantity: val }));
                      }
                    }}
                    required
                    style={{
                      flex: 1,
                      backgroundColor: "transparent",
                      border: "none",
                      padding: "0.7rem 0.5rem",
                      color: "#e5e7eb",
                      fontSize: "1rem",
                      textAlign: "center",
                      minWidth: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((p) => ({
                        ...p,
                        quantity: String(Number(p.quantity || 0) + 1),
                      }))
                    }
                    style={{
                      width: "3rem",
                      height: "2.75rem",
                      backgroundColor: "transparent",
                      border: "none",
                      borderLeft: "1px solid rgba(255,255,255,0.18)",
                      color: "#f97316",
                      fontSize: "1.4rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "#f97316",
                }}
              >
                {submitting ? "Submitting..." : "Submit"}
              </button>
            </form>
          )}

          {error && <p style={{ color: "#ef4444", marginTop: 0 }}>{error}</p>}

          {loading ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {[1, 2, 3].map((index) => (
                <div
                  key={`skeleton-${index}`}
                  className="animate-pulse"
                  style={{
                    borderRadius: "0.9rem",
                    border: "1px solid rgba(148, 163, 184, 0.25)",
                    backgroundColor: "rgba(51, 65, 85, 0.35)",
                    padding: "0.9rem",
                    display: "grid",
                    gap: "0.55rem",
                  }}
                >
                  <div
                    style={{
                      height: "0.9rem",
                      width: "32%",
                      borderRadius: "0.5rem",
                      backgroundColor: "#475569",
                    }}
                  />
                  <div
                    style={{
                      height: "0.9rem",
                      width: "56%",
                      borderRadius: "0.5rem",
                      backgroundColor: "#64748b",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : holdings.length === 0 ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                padding: "2rem 1rem",
              }}
            >
              <div
                style={{
                  width: "100%",
                  maxWidth: "30rem",
                  borderRadius: "1rem",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  backgroundColor: "rgba(2, 6, 23, 0.55)",
                  padding: "1.3rem 1rem",
                  display: "grid",
                  justifyItems: "center",
                  gap: "0.65rem",
                  textAlign: "center",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    color: "#ffffff",
                    fontWeight: 700,
                    fontSize: "1.05rem",
                  }}
                >
                  No holdings yet
                </p>
                <p style={{ margin: 0, color: "#94a3b8" }}>
                  Add your first stock to get started
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddForm(true)}
                  style={{
                    ...buttonBaseStyle,
                    backgroundColor: "#f97316",
                    marginTop: "0.2rem",
                  }}
                >
                  + Add Holding
                </button>
              </div>
            </div>
          ) : (
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table
                className="holdings-table"
                style={{ width: "100%", borderCollapse: "collapse" }}
              >
                <thead>
                  <tr>
                    {[
                      "Ticker",
                      "Qty",
                      "Buy Price",
                      "Current Price",
                      "Invested",
                      "Current Value",
                      "P&L",
                      "P&L%",
                      "",
                    ].map((title) => (
                      <th
                        key={title || "action"}
                        className={
                          title === "Invested" || title === "Current Value"
                            ? "mobile-hide-col"
                            : ""
                        }
                        style={{
                          textAlign: title === "" ? "center" : "left",
                          color: "#94a3b8",
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          padding: "0.75rem 0.6rem",
                          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {title}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((holding) => {
                    const invested =
                      Number(holding.invested) ||
                      (Number(holding.buyPrice) || 0) *
                        (Number(holding.quantity) || 0);
                    const currentValue =
                      Number(holding.currentValue) ||
                      (Number(holding.currentPrice) || 0) *
                        (Number(holding.quantity) || 0);
                    const pnl = Number(holding.pnl) || currentValue - invested;
                    const pnlPercent =
                      Number(holding.pnlPercent) ||
                      (invested ? (pnl / invested) * 100 : 0);
                    const isPositivePnl = pnl >= 0;

                    return (
                      <tr
                        key={holding.id || holding._id}
                        className="holding-row"
                        title="Click for Stock Intel"
                        onClick={() => {
                          setSelectedTicker(holding.ticker);
                          setDrawerOpen(true);
                        }}
                      >
                        <td
                          style={{
                            padding: "0.8rem 0.6rem",
                            color: "#f8fafc",
                            fontWeight: 700,
                          }}
                        >
                          {holding.ticker.replace(/\.NS$/i, "")}
                        </td>
                        <td
                          style={{ ...numberStyle, padding: "0.8rem 0.6rem" }}
                        >
                          {formatNumber(holding.quantity)}
                        </td>
                        <td
                          style={{ ...numberStyle, padding: "0.8rem 0.6rem" }}
                        >
                          {formatCurrency(holding.buyPrice)}
                        </td>
                        <td
                          style={{ ...numberStyle, padding: "0.8rem 0.6rem" }}
                        >
                          {formatCurrency(holding.currentPrice)}
                        </td>
                        <td
                          className="mobile-hide-col"
                          style={{ ...numberStyle, padding: "0.8rem 0.6rem" }}
                        >
                          {formatCurrency(invested)}
                        </td>
                        <td
                          className="mobile-hide-col"
                          style={{ ...numberStyle, padding: "0.8rem 0.6rem" }}
                        >
                          {formatCurrency(currentValue)}
                        </td>
                        <td
                          style={{
                            ...numberStyle,
                            padding: "0.8rem 0.6rem",
                            color: isPositivePnl ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {formatCurrency(pnl)}
                        </td>
                        <td
                          style={{
                            ...numberStyle,
                            padding: "0.8rem 0.6rem",
                            color: isPositivePnl ? "#22c55e" : "#ef4444",
                          }}
                        >
                          {`${pnlPercent.toFixed(2)}%`}
                        </td>
                        <td
                          style={{
                            padding: "0.8rem 0.6rem",
                            textAlign: "center",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              gap: "0.5rem",
                              justifyContent: "center",
                            }}
                          >
                            <button
                              type="button"
                              aria-label={`Edit ${holding.ticker}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setEditTarget(holding);
                                setEditForm({
                                  buyPrice: holding.buyPrice,
                                  qty: holding.qty ?? holding.quantity,
                                  buyDate: holding.buyDate,
                                });
                              }}
                              style={{
                                ...buttonBaseStyle,
                                backgroundColor: "#1f2937",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                width: "2.25rem",
                                height: "2.25rem",
                                padding: 0,
                                lineHeight: 1,
                              }}
                            >
                              ✏
                            </button>
                            <button
                              type="button"
                              aria-label={`Delete ${holding.ticker}`}
                              onClick={(event) => {
                                event.stopPropagation();
                                setDeleteTarget(holding);
                              }}
                              style={{
                                ...buttonBaseStyle,
                                backgroundColor: "#1f2937",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                width: "2.25rem",
                                height: "2.25rem",
                                padding: 0,
                                lineHeight: 1,
                              }}
                            >
                              🗑
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "1rem",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "20rem",
              textAlign: "center",
            }}
          >
            <p
              style={{
                margin: "0 0 0.25rem",
                color: "#ffffff",
                fontWeight: 700,
                fontSize: "1.1rem",
              }}
            >
              Remove holding?
            </p>
            <p
              style={{
                margin: "0 0 1.25rem",
                color: "#94a3b8",
                fontSize: "0.9rem",
                lineHeight: 1.5,
              }}
            >
              This will permanently remove{" "}
              <span style={{ color: "#fb923c", fontWeight: 700 }}>
                {deleteTarget.ticker}
              </span>{" "}
              from your portfolio.
            </p>
            <div style={{ display: "flex", gap: "0.7rem", justifyContent: "center" }}>
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "transparent",
                  border: "1px solid rgba(255,255,255,0.15)",
                  color: "#cbd5e1",
                  padding: "0.55rem 1rem",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  handleDelete(deleteTarget.id);
                  setDeleteTarget(null);
                }}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "rgba(239,68,68,0.2)",
                  border: "1px solid rgba(239,68,68,0.35)",
                  color: "#fca5a5",
                  padding: "0.55rem 1rem",
                }}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {editTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 50,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "rgba(0,0,0,0.65)",
            backdropFilter: "blur(4px)",
          }}
        >
          <div
            style={{
              backgroundColor: "#0f172a",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "1rem",
              padding: "1.5rem",
              width: "100%",
              maxWidth: "20rem",
            }}
          >
            <p
              style={{
                margin: "0 0 1rem",
                color: "#ffffff",
                fontWeight: 600,
                fontSize: "1.05rem",
              }}
            >
              Edit {editTarget.ticker.replace(/\.NS$/i, "")}
            </p>

            <div
              style={{ display: "grid", gap: "0.85rem", marginBottom: "1rem" }}
            >
              {/* Buy Price */}
              <div style={{ display: "grid", gap: "0" }}>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  BUY PRICE (₹)
                </p>
                <input
                  type="text"
                  inputMode="decimal"
                  placeholder="Buy Price (₹)"
                  value={editForm.buyPrice}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (/^\d*\.?\d*$/.test(val)) {
                      setEditForm((p) => ({ ...p, buyPrice: val }));
                    }
                  }}
                  style={{
                    backgroundColor: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    padding: "0.7rem 0.85rem",
                    color: "#ffffff",
                    fontSize: "1rem",
                    width: "100%",
                    boxSizing: "border-box",
                  }}
                />
              </div>

              {/* Quantity Stepper */}
              <div style={{ display: "grid", gap: "0" }}>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  QUANTITY
                </p>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((p) => ({
                        ...p,
                        qty: String(Math.max(1, Number(p.qty) - 1)),
                      }))
                    }
                    style={{
                      width: "3rem",
                      height: "2.75rem",
                      backgroundColor: "#1e293b",
                      border: "none",
                      borderRight: "1px solid rgba(255,255,255,0.1)",
                      color: "#f97316",
                      fontSize: "1.3rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    −
                  </button>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={editForm.qty}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (/^\d*$/.test(val)) {
                        setEditForm((p) => ({ ...p, qty: val }));
                      }
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: "#1e293b",
                      border: "none",
                      padding: "0.7rem 0.5rem",
                      color: "#ffffff",
                      fontSize: "1rem",
                      textAlign: "center",
                      minWidth: 0,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((p) => ({
                        ...p,
                        qty: String(Number(p.qty) + 1),
                      }))
                    }
                    style={{
                      width: "3rem",
                      height: "2.75rem",
                      backgroundColor: "#1e293b",
                      border: "none",
                      borderLeft: "1px solid rgba(255,255,255,0.1)",
                      color: "#f97316",
                      fontSize: "1.3rem",
                      fontWeight: 700,
                      cursor: "pointer",
                      flexShrink: 0,
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {/* Buy Date */}
              <div style={{ display: "grid", gap: "0" }}>
                <p
                  style={{
                    margin: "0 0 0.3rem",
                    color: "#94a3b8",
                    fontSize: "0.75rem",
                    fontWeight: 600,
                  }}
                >
                  BUY DATE
                </p>
                <input
                  type="date"
                  value={editForm.buyDate}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, buyDate: e.target.value }))
                  }
                  style={{
                    backgroundColor: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "0.75rem",
                    padding: "0.7rem 0.85rem",
                    color: "#ffffff",
                    fontSize: "1rem",
                    width: "100%",
                    boxSizing: "border-box",
                    minHeight: "2.75rem",
                  }}
                />
              </div>
            </div>

            {editError && (
              <p
                style={{
                  margin: "0 0 0.75rem",
                  color: "#f87171",
                  fontSize: "0.82rem",
                }}
              >
                {editError}
              </p>
            )}

            <div style={{ display: "flex", gap: "0.65rem" }}>
              <button
                type="button"
                onClick={() => {
                  setEditTarget(null);
                  setEditError("");
                }}
                style={{
                  flex: 1,
                  padding: "0.6rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(255,255,255,0.1)",
                  backgroundColor: "transparent",
                  color: "#94a3b8",
                  cursor: "pointer",
                  fontWeight: 600,
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={editSaving}
                onClick={async () => {
                  const buyPrice = Number(editForm.buyPrice);
                  const quantity = Number(editForm.qty);

                  if (!buyPrice || buyPrice <= 0) {
                    setEditError("Enter a valid buy price.");
                    return;
                  }
                  if (
                    !quantity ||
                    quantity <= 0 ||
                    !Number.isInteger(quantity)
                  ) {
                    setEditError("Enter a valid whole number quantity.");
                    return;
                  }
                  if (!editForm.buyDate) {
                    setEditError("Select a buy date.");
                    return;
                  }

                  setEditSaving(true);
                  setEditError("");

                  try {
                    await api.put(
                      `/api/holdings/${editTarget.id || editTarget._id}`,
                      {
                        ticker: editTarget.ticker,
                        buyPrice: buyPrice,
                        quantity: quantity,
                        buyDate: editForm.buyDate,
                      },
                    );
                    setEditTarget(null);
                    fetchPortfolioData();
                  } catch (err) {
                    const msg =
                      err?.response?.data?.detail ||
                      "Unable to update. Try again.";
                    setEditError(msg);
                  } finally {
                    setEditSaving(false);
                  }
                }}
                style={{
                  flex: 1,
                  padding: "0.6rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(249,115,22,0.35)",
                  backgroundColor: editSaving
                    ? "rgba(249,115,22,0.1)"
                    : "rgba(249,115,22,0.2)",
                  color: "#f97316",
                  cursor: editSaving ? "not-allowed" : "pointer",
                  fontWeight: 700,
                  opacity: editSaving ? 0.7 : 1,
                }}
              >
                {editSaving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      <StockIntelDrawer
        ticker={selectedTicker}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
};

export default DashboardPage;
