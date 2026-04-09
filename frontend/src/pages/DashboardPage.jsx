import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import StockIntelDrawer from "../components/StockIntelDrawer";
import TopNav from "../components/TopNav";
import DemoBanner from "../components/DemoBanner";
import useSwipe from "../hooks/useSwipe";
import { useAuth } from "../context/AuthContext";

// ─── Styles ──────────────────────────────────────────────────────────────────

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#f8fafc",
  fontFamily: "'DM Sans', sans-serif",
  padding: "2rem 1rem 2rem 1rem",
};

const containerStyle = {
  width: "100%",
  margin: "0 auto",
  display: "grid",
  gap: "1rem",
};

const cardStyle = {
  borderRadius: "1rem",
  border: "1px solid rgba(255,255,255,0.08)",
  backgroundColor: "rgba(15,23,42,0.6)",
  backdropFilter: "blur(8px)",
};

const numberStyle = {
  fontFamily: "'Barlow Condensed','DM Sans',sans-serif",
  letterSpacing: "0.02em",
};

const buttonBaseStyle = {
  border: "none",
  cursor: "pointer",
  borderRadius: "20px",
  padding: "6px 18px",
  fontSize: "13px",
  fontWeight: 600,
  transition: "opacity 0.15s",
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
};

const inputStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: "0.75rem",
  color: "#f8fafc",
  padding: "0.55rem 0.85rem",
  fontSize: "13px",
  outline: "none",
  width: "100%",
  boxSizing: "border-box",
};

// ─── Formatters ───────────────────────────────────────────────────────────────

const formatCurrency = (v) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(v ?? 0);

const formatNumber = (v) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 4 }).format(v ?? 0);

// ─── Constants ────────────────────────────────────────────────────────────────

const EMPTY_SUMMARY = {
  totalInvested: 0,
  totalCurrentValue: 0,
  totalPnl: 0,
  totalPnlPercent: 0,
};

const HOLDINGS_TABS = ["Stocks", "Mutual Funds", "FD"];
const WATCHLIST_TABS = ["Stocks", "Mutual Funds"];

const NSE_TICKERS = [
  { symbol: "RELIANCE", full: "Reliance Industries" },
  { symbol: "INFY", full: "Infosys" },
  { symbol: "TCS", full: "Tata Consultancy Services" },
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
  { symbol: "HINDALCO", full: "Hindalco Industries" },
  { symbol: "ADANIPOWER", full: "Adani Power" },
  { symbol: "ADANIENT", full: "Adani Enterprises" },
  { symbol: "ADANIPORTS", full: "Adani Ports" },
  { symbol: "SUNPHARMA", full: "Sun Pharmaceutical" },
  { symbol: "DRREDDY", full: "Dr. Reddy's Laboratories" },
  { symbol: "CIPLA", full: "Cipla" },
  { symbol: "DIVISLAB", full: "Divi's Laboratories" },
  { symbol: "HINDUNILVR", full: "Hindustan Unilever" },
  { symbol: "ITC", full: "ITC" },
  { symbol: "NESTLEIND", full: "Nestle India" },
  { symbol: "BAJFINANCE", full: "Bajaj Finance" },
  { symbol: "BAJAJFINSV", full: "Bajaj Finserv" },
  { symbol: "MARUTI", full: "Maruti Suzuki" },
  { symbol: "M&M", full: "Mahindra & Mahindra" },
  { symbol: "HEROMOTOCO", full: "Hero MotoCorp" },
  { symbol: "BAJAJ-AUTO", full: "Bajaj Auto" },
  { symbol: "ONGC", full: "Oil and Natural Gas Corporation" },
  { symbol: "NTPC", full: "NTPC" },
  { symbol: "POWERGRID", full: "Power Grid Corporation" },
  { symbol: "COALINDIA", full: "Coal India" },
  { symbol: "LT", full: "Larsen & Toubro" },
  { symbol: "ULTRACEMCO", full: "UltraTech Cement" },
  { symbol: "GRASIM", full: "Grasim Industries" },
  { symbol: "TITAN", full: "Titan Company" },
  { symbol: "ASIANPAINT", full: "Asian Paints" },
  { symbol: "HDFCLIFE", full: "HDFC Life Insurance" },
  { symbol: "SBILIFE", full: "SBI Life Insurance" },
  { symbol: "BHARTIARTL", full: "Bharti Airtel" },
  { symbol: "ZOMATO", full: "Zomato" },
  { symbol: "NYKAA", full: "FSN E-Commerce (Nykaa)" },
  { symbol: "PAYTM", full: "One97 Communications (Paytm)" },
  { symbol: "DMART", full: "Avenue Supermarts (DMart)" },
  { symbol: "TATACONSUM", full: "Tata Consumer Products" },
  { symbol: "HAL", full: "Hindustan Aeronautics" },
  { symbol: "BEL", full: "Bharat Electronics" },
  { symbol: "IRCTC", full: "Indian Railway Catering & Tourism" },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, logout, username } = useAuth();
  const displayName = username || "Investor";

  // Holdings
  const [holdings, setHoldings] = useState([]);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Add stock form
  const [showAddForm, setShowAddForm] = useState(false);
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

  // Edit / Delete
  const [editTarget, setEditTarget] = useState(null);
  const [editForm, setEditForm] = useState({
    buyPrice: "",
    qty: "",
    buyDate: "",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [deleteTarget, setDeleteTarget] = useState(null);

  // Drawers
  const [selectedTicker, setSelectedTicker] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mfDrawerOpen, setMfDrawerOpen] = useState(false);
  const [mfDrawerData, setMfDrawerData] = useState(null);
  const [mfDrawerLoading, setMfDrawerLoading] = useState(false);

  // Dashboard tabs
  const [dashTab, setDashTab] = useState("Holdings");
  const [holdingsSubTab, setHoldingsSubTab] = useState("Stocks");
  const [watchlistSubTab, setWatchlistSubTab] = useState("Stocks");
  const holdingsSwipeRef = useRef(null);
  const watchlistSwipeRef = useRef(null);

  // MF form
  const [showMfForm, setShowMfForm] = useState(false);
  const [mfQuery, setMfQuery] = useState("");
  const [mfResults, setMfResults] = useState([]);
  const [mfSearching, setMfSearching] = useState(false);
  const [selectedMf, setSelectedMf] = useState(null);
  const [liveMfNav, setLiveMfNav] = useState(null);
  const [liveMfNavFetching, setLiveMfNavFetching] = useState(false);
  const [mfBuyNav, setMfBuyNav] = useState("");
  const [mfUnits, setMfUnits] = useState("");
  const [mfBuyDate, setMfBuyDate] = useState("");
  const [mfSubmitting, setMfSubmitting] = useState(false);
  const [mfError, setMfError] = useState("");

  // FD form
  const [showFdForm, setShowFdForm] = useState(false);
  const [fdBank, setFdBank] = useState("");
  const [fdPrincipal, setFdPrincipal] = useState("");
  const [fdRate, setFdRate] = useState("");
  const [fdStartDate, setFdStartDate] = useState("");
  const [fdMaturityDate, setFdMaturityDate] = useState("");
  const [fdSubmitting, setFdSubmitting] = useState(false);
  const [fdError, setFdError] = useState("");

  // Watchlist
  const [watchlist, setWatchlist] = useState([]);
  const [watchlistLoading, setWatchlistLoading] = useState(true);
  const [watchlistError, setWatchlistError] = useState("");
  const [showWatchlistInput, setShowWatchlistInput] = useState(false);
  const [watchInputTicker, setWatchInputTicker] = useState("");
  const [showWatchTickerDrop, setShowWatchTickerDrop] = useState(false);
  const [watchInputError, setWatchInputError] = useState("");
  const [watchInputLoading, setWatchInputLoading] = useState(false);
  const [watchMfQuery, setWatchMfQuery] = useState("");
  const [watchMfResults, setWatchMfResults] = useState([]);
  const [watchMfSearching, setWatchMfSearching] = useState(false);
  const [watchMfSelected, setWatchMfSelected] = useState(null);
  const [watchMfAdding, setWatchMfAdding] = useState(false);
  const [watchMfError, setWatchMfError] = useState("");
  const [mfNameCache, setMfNameCache] = useState({});

  // News
  const [newsArticles, setNewsArticles] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsError, setNewsError] = useState("");
  const [newsCategory, setNewsCategory] = useState("all");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  // ── Computed ────────────────────────────────────────────────────────────────

  const tickerSuggestions =
    tickerQuery.length >= 1
      ? NSE_TICKERS.filter(
          (t) =>
            t.symbol.toLowerCase().includes(tickerQuery.toLowerCase()) ||
            t.full.toLowerCase().includes(tickerQuery.toLowerCase()),
        ).slice(0, 6)
      : [];

  const watchTickerSuggestions =
    watchInputTicker.length >= 1
      ? NSE_TICKERS.filter(
          (t) =>
            t.symbol.toLowerCase().includes(watchInputTicker.toLowerCase()) ||
            t.full.toLowerCase().includes(watchInputTicker.toLowerCase()),
        ).slice(0, 6)
      : [];

  const stockHoldings = holdings.filter((h) => {
    const t = h.assetType;
    if (t === "mutual_fund" || t === "fd") return false;
    if (
      !t &&
      h.ticker &&
      !h.ticker.endsWith(".NS") &&
      !h.ticker.endsWith(".BO")
    )
      return false;
    return true;
  });
  const mfHoldings = holdings.filter((h) => h.assetType === "mutual_fund");
  const fdHoldings = holdings.filter((h) => h.assetType === "fd");
  const totalDayChange = holdings.reduce((s, h) => s + (h.dayChange || 0), 0);
  const isDayPositive = totalDayChange >= 0;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const fetchPortfolioData = async (silent = false) => {
    if (silent) setSilentRefreshing(true);
    else setLoading(true);
    try {
      const res = await api.get("/api/holdings/dashboard");
      setHoldings(res.data.holdings || []);
      setSummary(res.data.summary || EMPTY_SUMMARY);
      setError("");
    } catch {
      if (!silent) setError("Failed to load portfolio.");
    } finally {
      if (silent) setSilentRefreshing(false);
      else setLoading(false);
    }
  };

  const fetchWatchlist = async () => {
    setWatchlistLoading(true);
    try {
      const res = await api.get("/api/watchlist/");
      setWatchlist(res.data || []);
      setWatchlistError("");
    } catch {
      setWatchlistError("Failed to load watchlist.");
    } finally {
      setWatchlistLoading(false);
    }
  };

  const searchWatchMf = async (query) => {
    if (query.length < 2) {
      setWatchMfResults([]);
      return;
    }
    setWatchMfSearching(true);
    try {
      const res = await api.get(
        `/api/holdings/mf-search?q=${encodeURIComponent(query)}`,
      );
      setWatchMfResults(Array.isArray(res.data) ? res.data : []);
    } catch {
      setWatchMfResults([]);
    } finally {
      setWatchMfSearching(false);
    }
  };

  const fetchNews = async (category = "all") => {
    setNewsLoading(true);
    setNewsError("");
    try {
      const res = await api.get(`/api/news/feed?category=${category}`);
      setNewsArticles(res.data.articles || res.data || []);
    } catch {
      setNewsError("Failed to load news.");
    } finally {
      setNewsLoading(false);
    }
  };

  const searchMf = async (query) => {
    if (query.length < 2) {
      setMfResults([]);
      return;
    }
    setMfSearching(true);
    try {
      const res = await api.get(
        `/api/holdings/mf-search?q=${encodeURIComponent(query)}`,
      );
      setMfResults(res.data || []);
    } catch {
      setMfResults([]);
    } finally {
      setMfSearching(false);
    }
  };

  const onChangeForm = (e) => {
    setFormData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const onSubmitHolding = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post("/api/holdings", {
        ticker: formData.ticker.toUpperCase(),
        buyDate: formData.buyDate,
        buyPrice: Number(formData.buyPrice),
        quantity: Number(formData.quantity),
        assetType: "stock",
      });
      setFormData({ ticker: "", buyDate: "", buyPrice: "", quantity: "" });
      setTickerQuery("");
      setLivePrice(null);
      setShowAddForm(false);
      fetchPortfolioData();
    } catch {
      setError("Failed to add holding.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (holdingId) => {
    try {
      await api.delete(`/api/holdings/${holdingId}`);
      setDeleteTarget(null);
      fetchPortfolioData();
    } catch {
      setError("Failed to delete holding.");
    }
  };

  const fetchLivePrice = async (ticker) => {
    if (!ticker) return;
    setLivePriceFetching(true);
    try {
      const res = await api.get(`/api/market/price/${ticker}.NS`);
      setLivePrice(res.data?.price ?? null);
      setFormData((prev) => ({
        ...prev,
        buyPrice: String(res.data?.price ?? ""),
      }));
    } catch {
      setLivePrice(null);
    } finally {
      setLivePriceFetching(false);
    }
  };

  const fetchLiveMfNav = async (schemeCode) => {
    if (!schemeCode) {
      setLiveMfNav(null);
      return;
    }
    setLiveMfNavFetching(true);
    setLiveMfNav(null);
    try {
      const res = await api.get(`/api/holdings/mf-nav/${schemeCode}`);
      setLiveMfNav(res.data?.currentNav || null);
    } catch {
      setLiveMfNav(null);
    } finally {
      setLiveMfNavFetching(false);
    }
  };

  const handleWatchlistAdd = async () => {
    if (!watchInputTicker.trim()) return;
    setWatchInputLoading(true);
    setWatchInputError("");
    try {
      const ticker = watchInputTicker.trim().toUpperCase();
      const symbol = ticker.endsWith(".NS") ? ticker : `${ticker}.NS`;
      await api.post("/api/watchlist/", { ticker: symbol });
      setWatchInputTicker("");
      setShowWatchlistInput(false);
      fetchWatchlist();
    } catch {
      setWatchInputError("Failed to add to watchlist.");
    } finally {
      setWatchInputLoading(false);
    }
  };

  const handleAddMfWatchlist = async () => {
    if (!watchMfSelected) return;
    setWatchMfAdding(true);
    setWatchMfError("");
    try {
      await api.post("/api/watchlist/", { ticker: watchMfSelected.schemeCode });
      setWatchMfSelected(null);
      setWatchMfQuery("");
      setWatchMfResults([]);
      await fetchWatchlist();
    } catch (err) {
      setWatchMfError(err?.response?.data?.detail || "Failed to add fund");
    } finally {
      setWatchMfAdding(false);
    }
  };

  const handleWatchlistRemove = async (ticker) => {
    try {
      await api.delete(`/api/watchlist/${ticker}`);
      fetchWatchlist();
    } catch {
      setWatchlistError("Failed to remove from watchlist.");
    }
  };

  const onSubmitMf = async () => {
    if (!selectedMf || !mfBuyNav || !mfUnits || !mfBuyDate) {
      setMfError("Please fill in all fields.");
      return;
    }
    setMfSubmitting(true);
    setMfError("");
    try {
      await api.post("/api/holdings", {
        ticker: selectedMf.schemeCode,
        buyDate: mfBuyDate,
        buyPrice: Number(mfBuyNav),
        quantity: Number(mfUnits),
        assetType: "mutual_fund",
        schemeName: selectedMf.schemeName,
      });
      setShowMfForm(false);
      setMfQuery("");
      setMfResults([]);
      setSelectedMf(null);
      setMfBuyNav("");
      setMfUnits("");
      setMfBuyDate("");
      fetchPortfolioData();
    } catch {
      setMfError("Failed to add mutual fund.");
    } finally {
      setMfSubmitting(false);
    }
  };

  const onSubmitFd = async () => {
    if (!fdBank || !fdPrincipal || !fdRate || !fdStartDate) {
      setFdError("Please fill in all required fields.");
      return;
    }
    setFdSubmitting(true);
    setFdError("");
    try {
      await api.post("/api/holdings", {
        ticker: fdBank.trim(),
        buyDate: fdStartDate,
        buyPrice: Number(fdPrincipal),
        quantity: 1,
        assetType: "fd",
        fdRate: Number(fdRate),
        ...(fdMaturityDate ? { fdMaturityDate } : {}),
      });
      setShowFdForm(false);
      setFdBank("");
      setFdPrincipal("");
      setFdRate("");
      setFdStartDate("");
      setFdMaturityDate("");
      fetchPortfolioData();
    } catch {
      setFdError("Failed to add FD.");
    } finally {
      setFdSubmitting(false);
    }
  };

  const openMfDrawer = async (holding) => {
    setMfDrawerOpen(true);
    setMfDrawerData(null);
    setMfDrawerLoading(true);
    try {
      const res = await api.get(`/api/holdings/mf-nav/${holding.ticker}`);
      setMfDrawerData({ ...res.data, holding });
    } catch {
      setMfDrawerData({ error: true, holding });
    } finally {
      setMfDrawerLoading(false);
    }
  };

  const handleEditSave = async () => {
    if (!editTarget) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.put(`/api/holdings/${editTarget.id}`, {
        buyPrice: Number(editForm.buyPrice),
        quantity: Number(editForm.qty),
        buyDate: editForm.buyDate,
      });
      setEditTarget(null);
      fetchPortfolioData();
    } catch {
      setEditError("Failed to save changes.");
    } finally {
      setEditSaving(false);
    }
  };

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    document.title = "Dashboard | PortSense";
  }, []);

  useEffect(() => {
    fetchPortfolioData();
  }, []);

  useEffect(() => {
    if (loading) return;

    // Prefetch analytics data silently after dashboard loads
    // Uses a 3-second delay so it doesn't compete with dashboard
    const analyticsTimer = setTimeout(() => {
      // Prefetch sectors
      api.get("/api/analytics/sectors").catch(() => {});
      // Prefetch beta
      api.get("/api/analytics/beta").catch(() => {});
      // Prefetch diversification
      api.get("/api/analytics/diversification").catch(() => {});
      // Prefetch benchmark
      api.get("/api/analytics/benchmark").catch(() => {});
      // Prefetch risk decomposition
      api.get("/api/analytics/risk-decomposition").catch(() => {});
    }, 3000);

    const sentimentTimer = setTimeout(() => {
      api.get("/api/sentiment/").catch(() => {});
    }, 6000);

    return () => {
      clearTimeout(analyticsTimer);
      clearTimeout(sentimentTimer);
    };
  }, [loading]);

  useEffect(() => {
    fetchWatchlist();
  }, []);

  useEffect(() => {
    const mfItems = watchlist.filter(
      (item) => !item.ticker.endsWith(".NS") && !item.ticker.endsWith(".BO"),
    );
    mfItems.forEach(async (item) => {
      if (mfNameCache[item.ticker]) return;
      try {
        const res = await api.get(`/api/holdings/mf-nav/${item.ticker}`);
        setMfNameCache((prev) => ({
          ...prev,
          [item.ticker]: res.data.schemeName || item.ticker,
        }));
      } catch {
        setMfNameCache((prev) => ({ ...prev, [item.ticker]: item.ticker }));
      }
    });
  }, [watchlist]);

  useEffect(() => {
    if (dashTab === "News" && newsArticles.length === 0) {
      fetchNews(newsCategory);
    }
  }, [dashTab]);

  useEffect(() => {
    const id = setInterval(() => fetchPortfolioData(true), 60000);
    return () => clearInterval(id);
  }, []);

  // ── Render helpers ───────────────────────────────────────────────────────────

  const skeletonRow = (key) => (
    <tr key={key} className="holding-row">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <td key={i} style={{ padding: "0.75rem 0.6rem" }}>
          <div
            className="animate-pulse"
            style={{
              height: 14,
              borderRadius: 4,
              backgroundColor: "rgba(255,255,255,0.07)",
              width: i === 1 ? 60 : 50,
            }}
          />
        </td>
      ))}
    </tr>
  );

  const pnlColor = (v) => (v >= 0 ? "#22c55e" : "#ef4444");

  const handleHoldingsSwipeLeft = () => {
    setHoldingsSubTab((prev) => {
      const currentIndex = HOLDINGS_TABS.indexOf(prev);
      if (currentIndex === -1 || currentIndex >= HOLDINGS_TABS.length - 1) {
        return prev;
      }
      return HOLDINGS_TABS[currentIndex + 1];
    });
  };

  const handleHoldingsSwipeRight = () => {
    setHoldingsSubTab((prev) => {
      const currentIndex = HOLDINGS_TABS.indexOf(prev);
      if (currentIndex <= 0) {
        return prev;
      }
      return HOLDINGS_TABS[currentIndex - 1];
    });
  };

  const handleWatchlistSwipeLeft = () => {
    if (watchlistSubTab === "Stocks") {
      setWatchlistSubTab("Mutual Funds");
    }
  };

  const handleWatchlistSwipeRight = () => {
    if (watchlistSubTab === "Mutual Funds") {
      setWatchlistSubTab("Stocks");
    }
  };

  useSwipe(holdingsSwipeRef, handleHoldingsSwipeLeft, handleHoldingsSwipeRight);
  useSwipe(
    watchlistSwipeRef,
    handleWatchlistSwipeLeft,
    handleWatchlistSwipeRight,
  );

  // Tab pill
  const tabPill = (label, active, onClick, accent = "#f97316") => (
    <button
      key={label}
      onClick={onClick}
      style={{
        ...buttonBaseStyle,
        backgroundColor: active ? accent : "#1e293b",
        color: active ? "#fff" : "#94a3b8",
        border: active ? "none" : "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {label}
    </button>
  );

  // Context action button
  const contextBtn = () => {
    if (dashTab === "Holdings") {
      if (holdingsSubTab === "Stocks")
        return (
          <button
            style={{
              ...buttonBaseStyle,
              backgroundColor: "#f97316",
              color: "#fff",
              borderRadius: "20px",
              padding: "6px 18px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={() => setShowAddForm((v) => !v)}
          >
            + Add Stock
          </button>
        );
      if (holdingsSubTab === "Mutual Funds")
        return (
          <button
            style={{
              ...buttonBaseStyle,
              backgroundColor: "#8b5cf6",
              color: "#fff",
              borderRadius: "20px",
              padding: "6px 18px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={() => setShowMfForm((v) => !v)}
          >
            + Add MF
          </button>
        );
      if (holdingsSubTab === "FD")
        return (
          <button
            style={{
              ...buttonBaseStyle,
              backgroundColor: "#10b981",
              color: "#fff",
              borderRadius: "20px",
              padding: "6px 18px",
              fontSize: "13px",
              fontWeight: 600,
              border: "none",
              cursor: "pointer",
              fontFamily: "inherit",
            }}
            onClick={() => setShowFdForm((v) => !v)}
          >
            + Add FD
          </button>
        );
    }
    if (dashTab === "Watchlist")
      return (
        <>
          {watchlistSubTab === "Stocks" && (
            <button
              style={{
                ...buttonBaseStyle,
                backgroundColor: "#1e293b",
                color: "#f97316",
                border: "1px solid rgba(249,115,22,0.3)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "#f97316";
                e.currentTarget.style.color = "#ffffff";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "#1e293b";
                e.currentTarget.style.color = "#f97316";
              }}
              onClick={() => setShowWatchlistInput((v) => !v)}
            >
              + Add
            </button>
          )}
          {watchlistSubTab === "Mutual Funds" && (
            <button
              type="button"
              onClick={() => {
                document.querySelector('input[placeholder*="Mirae"]')?.focus();
              }}
              style={{
                background: "#1e293b",
                color: "#a78bfa",
                borderRadius: "20px",
                padding: "6px 18px",
                fontSize: "13px",
                fontWeight: 600,
                border: "1px solid rgba(139,92,246,0.3)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                fontFamily: "inherit",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "#8b5cf6";
                e.currentTarget.style.color = "white";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "#1e293b";
                e.currentTarget.style.color = "#a78bfa";
              }}
            >
              + Add MF
            </button>
          )}
        </>
      );
    if (dashTab === "News")
      return (
        <button
          style={{
            ...buttonBaseStyle,
            backgroundColor: "transparent",
            color: "#94a3b8",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "#f8fafc";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "#94a3b8";
          }}
          onClick={() => {
            setNewsArticles([]);
            fetchNews(newsCategory);
          }}
        >
          ↻ Refresh
        </button>
      );
    return null;
  };

  // ── JSX ──────────────────────────────────────────────────────────────────────

  return (
    <div style={shellStyle}>
      <TopNav />
      <DemoBanner />
      <style>{`
        .summary-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 0.75rem;
        }
        @media (max-width: 640px) {
          .summary-grid { grid-template-columns: repeat(2, 1fr); }
          .mobile-hide-col { display: none !important; }
          .pnl-arrow { display: none; }
          .pnl-sign { display: inline; }
        }
        @media (max-width: 430px) {
          .holdings-table {
            min-width: 500px !important;
            font-size: 12px !important;
          }
          .holdings-table th,
          .holdings-table td {
            padding: 0.5rem 0.35rem !important;
          }
        }
        @media (max-width: 390px) {
          .holdings-table thead { display: none; }
          .holding-row {
            display: block !important;
            padding: 0.75rem;
            border-bottom: 1px solid rgba(255,255,255,0.06);
          }
          .holding-row td {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.25rem 0;
            border: none;
            white-space: normal;
          }
          .holding-row td:first-child {
            font-size: 1rem;
            font-weight: 800;
            padding-bottom: 0.4rem;
            border-bottom: 1px solid rgba(255,255,255,0.04);
            margin-bottom: 0.25rem;
          }
          .holding-row td:last-child {
            justify-content: flex-end;
            padding-top: 0.4rem;
          }
          .mobile-hide-col { display: none !important; }
        }
        @media (min-width: 641px) {
          .pnl-sign { display: none; }
        }
        .holdings-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 15px;
        }
        .holdings-table th {
          text-align: left;
          padding: 0.75rem 0.75rem;
          color: #64748b;
          font-weight: 600;
          border-bottom: 1px solid rgba(255,255,255,0.07);
          white-space: nowrap;
        }
        .holding-row td {
          padding: 1rem 0.75rem;
          border-bottom: 1px solid rgba(255,255,255,0.04);
          white-space: nowrap;
        }
        @media (max-width: 390px) {
          .holding-row td[data-label]::before {
            content: attr(data-label);
            color: #64748b;
            font-size: 0.72rem;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
        }
        .holding-row:hover { background: rgba(255,255,255,0.03); }
        .animate-pulse {
          animation: pulse 1.5s ease-in-out infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        .loader-spin {
          display: inline-block;
          width: 14px;
          height: 14px;
          border: 2px solid rgba(249,115,22,0.3);
          border-top-color: #f97316;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .drawer-slide { animation: slideIn 0.25s ease-out forwards; }
        .pill-btn:hover { opacity: 0.85; }
      `}</style>

      <div style={containerStyle}>
        {/* ── SUMMARY CARD ── */}
        <div style={{ width: "100%", overflow: "hidden" }}>
          <div style={{ ...cardStyle, padding: "1rem" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: "1rem",
                marginBottom: "1rem",
              }}
            >
              <div
                style={{
                  fontSize: 18,
                  fontWeight: 700,
                  color: "#f8fafc",
                  fontFamily: "Barlow Condensed",
                }}
              >
                {displayName}'s Portfolio
              </div>
              <button
                type="button"
                onClick={() => {
                  logout();
                  navigate("/", { replace: true });
                }}
                style={{
                  backgroundColor: "rgba(239,68,68,0.1)",
                  border: "1px solid rgba(239,68,68,0.3)",
                  color: "#f87171",
                  borderRadius: "20px",
                  padding: "5px 14px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Sign Out
              </button>
            </div>
            <div className="summary-grid">
              {/* Total Invested */}
              <div style={{ padding: "0.5rem 0.25rem" }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Total Invested
                </div>
                <div
                  style={{
                    ...numberStyle,
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {loading ? (
                    <span
                      className="animate-pulse"
                      style={{
                        display: "inline-block",
                        width: 90,
                        height: 20,
                        backgroundColor: "rgba(255,255,255,0.07)",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    formatCurrency(summary.totalInvested)
                  )}
                </div>
              </div>
              {/* Current Value */}
              <div style={{ padding: "0.5rem 0.25rem" }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Current Value
                </div>
                <div
                  style={{
                    ...numberStyle,
                    fontSize: 20,
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {loading ? (
                    <span
                      className="animate-pulse"
                      style={{
                        display: "inline-block",
                        width: 90,
                        height: 20,
                        backgroundColor: "rgba(255,255,255,0.07)",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    formatCurrency(summary.totalCurrentValue)
                  )}
                </div>
              </div>
              {/* Total P&L */}
              <div style={{ padding: "0.5rem 0.25rem" }}>
                <div
                  style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}
                >
                  Total P&amp;L
                </div>
                <div
                  style={{
                    ...numberStyle,
                    fontSize: 18,
                    fontWeight: 700,
                    color: loading ? "#94a3b8" : pnlColor(summary.totalPnl),
                  }}
                >
                  {loading ? (
                    <span
                      className="animate-pulse"
                      style={{
                        display: "inline-block",
                        width: 80,
                        height: 20,
                        backgroundColor: "rgba(255,255,255,0.07)",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    <>
                      {formatCurrency(summary.totalPnl)}{" "}
                      <span style={{ fontSize: 12 }}>
                        ({(summary.totalPnlPercent ?? 0).toFixed(2)}%)
                      </span>
                    </>
                  )}
                </div>
              </div>
              {/* Today's P&L */}
              <div style={{ padding: "0.5rem 0.25rem" }}>
                <div
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    marginBottom: 4,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                  }}
                >
                  Today&apos;s P&amp;L
                  {silentRefreshing && (
                    <span style={{ fontSize: 10, color: "#64748b" }}>
                      updating…
                    </span>
                  )}
                </div>
                <div
                  style={{
                    ...numberStyle,
                    fontSize: 18,
                    fontWeight: 700,
                    color: loading ? "#94a3b8" : pnlColor(totalDayChange),
                  }}
                >
                  {loading ? (
                    <span
                      className="animate-pulse"
                      style={{
                        display: "inline-block",
                        width: 80,
                        height: 20,
                        backgroundColor: "rgba(255,255,255,0.07)",
                        borderRadius: 4,
                      }}
                    />
                  ) : (
                    <>
                      <span className="pnl-arrow">
                        {isDayPositive ? "▲" : "▼"}
                      </span>{" "}
                      <span className="pnl-sign">
                        {isDayPositive ? "+" : "−"}
                      </span>{" "}
                      {formatCurrency(Math.abs(totalDayChange))}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── MAIN TABBED CARD ── */}
        <div style={{ ...cardStyle, padding: "1rem" }}>
          {/* Top tab bar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexWrap: "wrap",
              gap: "0.5rem",
              marginBottom: "1rem",
              paddingBottom: "10px",
              borderBottom: "1px solid #1e293b",
            }}
          >
            <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
              {["Holdings", "Watchlist", "News"].map((tab) =>
                tabPill(tab, dashTab === tab, () => setDashTab(tab)),
              )}
            </div>
            <div>{contextBtn()}</div>
          </div>

          {/* ── HOLDINGS TAB ── */}
          {dashTab === "Holdings" && (
            <>
              {/* Sub-tab bar */}
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {[
                  {
                    label: "Stocks",
                    count: stockHoldings.length,
                    accent: "#f97316",
                  },
                  {
                    label: "Mutual Funds",
                    count: mfHoldings.length,
                    accent: "#8b5cf6",
                  },
                  { label: "FD", count: fdHoldings.length, accent: "#10b981" },
                ].map(({ label, count, accent }) => (
                  <button
                    key={label}
                    onClick={() => setHoldingsSubTab(label)}
                    style={{
                      ...buttonBaseStyle,
                      backgroundColor:
                        holdingsSubTab === label ? accent : "#1e293b",
                      color: holdingsSubTab === label ? "#fff" : "#94a3b8",
                      border:
                        holdingsSubTab === label
                          ? "none"
                          : "1px solid rgba(255,255,255,0.08)",
                    }}
                  >
                    {label}
                    <span
                      style={{
                        backgroundColor:
                          holdingsSubTab === label
                            ? "rgba(0,0,0,0.25)"
                            : "rgba(255,255,255,0.08)",
                        borderRadius: 10,
                        padding: "1px 7px",
                        fontSize: 11,
                        marginLeft: 2,
                      }}
                    >
                      {count}
                    </span>
                  </button>
                ))}
              </div>

              <div ref={holdingsSwipeRef} style={{ touchAction: "pan-y" }}>
                {/* ── STOCKS ── */}
                {holdingsSubTab === "Stocks" && (
                  <>
                    {/* Add stock form */}
                    {showAddForm && (
                      <form
                        onSubmit={onSubmitHolding}
                        style={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.1)",
                          borderRadius: "0.75rem",
                          padding: "1rem",
                          marginBottom: "1rem",
                          display: "grid",
                          gridTemplateColumns:
                            "repeat(auto-fit, minmax(140px, 1fr))",
                          gap: "0.75rem",
                        }}
                      >
                        {/* Ticker */}
                        <div style={{ position: "relative" }}>
                          <label
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Ticker
                          </label>
                          <input
                            style={inputStyle}
                            placeholder="e.g. RELIANCE"
                            value={tickerQuery}
                            onChange={(e) => {
                              setTickerQuery(e.target.value);
                              setFormData((p) => ({
                                ...p,
                                ticker: e.target.value.toUpperCase(),
                              }));
                              setShowTickerDrop(true);
                              setLivePrice(null);
                            }}
                            onFocus={() => setShowTickerDrop(true)}
                            onBlur={() =>
                              setTimeout(() => setShowTickerDrop(false), 150)
                            }
                            autoComplete="off"
                          />
                          {showTickerDrop && tickerSuggestions.length > 0 && (
                            <div
                              style={{
                                position: "absolute",
                                top: "100%",
                                left: 0,
                                right: 0,
                                zIndex: 50,
                                backgroundColor: "#1e293b",
                                border: "1px solid rgba(255,255,255,0.1)",
                                borderRadius: "0.5rem",
                                marginTop: 2,
                                overflow: "hidden",
                              }}
                            >
                              {tickerSuggestions.map((t) => (
                                <div
                                  key={t.symbol}
                                  onMouseDown={() => {
                                    setTickerQuery(t.symbol);
                                    setFormData((p) => ({
                                      ...p,
                                      ticker: t.symbol,
                                    }));
                                    setShowTickerDrop(false);
                                    fetchLivePrice(t.symbol);
                                  }}
                                  style={{
                                    padding: "0.5rem 0.75rem",
                                    cursor: "pointer",
                                    fontSize: 13,
                                    borderBottom:
                                      "1px solid rgba(255,255,255,0.05)",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "rgba(255,255,255,0.06)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "transparent";
                                  }}
                                >
                                  <span
                                    style={{
                                      color: "#f97316",
                                      fontWeight: 600,
                                    }}
                                  >
                                    {t.symbol}
                                  </span>
                                  <span
                                    style={{
                                      color: "#64748b",
                                      marginLeft: 8,
                                      fontSize: 11,
                                    }}
                                  >
                                    {t.full}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Buy Date */}
                        <div>
                          <label
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Buy Date
                          </label>
                          <input
                            type="date"
                            name="buyDate"
                            style={inputStyle}
                            value={formData.buyDate}
                            onChange={onChangeForm}
                            required
                          />
                        </div>

                        {/* Buy Price */}
                        <div>
                          <label
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Buy Price
                            {livePriceFetching && (
                              <span style={{ marginLeft: 6 }}>
                                <span className="loader-spin" />
                              </span>
                            )}
                            {livePrice && (
                              <span
                                style={{
                                  marginLeft: 6,
                                  color: "#22c55e",
                                  fontSize: 11,
                                }}
                              >
                                live ₹{livePrice}
                              </span>
                            )}
                          </label>
                          <input
                            type="number"
                            name="buyPrice"
                            style={inputStyle}
                            placeholder="₹"
                            value={formData.buyPrice}
                            onChange={onChangeForm}
                            required
                            min="0"
                            step="0.01"
                          />
                        </div>

                        {/* Quantity */}
                        <div>
                          <label
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              display: "block",
                              marginBottom: 4,
                            }}
                          >
                            Qty
                          </label>
                          <div style={{ display: "flex", gap: 4 }}>
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((p) => ({
                                  ...p,
                                  quantity: String(
                                    Math.max(0, Number(p.quantity) - 1),
                                  ),
                                }))
                              }
                              style={{
                                ...buttonBaseStyle,
                                padding: "6px 12px",
                                backgroundColor: "#1e293b",
                                color: "#94a3b8",
                                borderRadius: "0.5rem",
                              }}
                            >
                              −
                            </button>
                            <input
                              type="number"
                              name="quantity"
                              style={{ ...inputStyle, textAlign: "center" }}
                              value={formData.quantity}
                              onChange={onChangeForm}
                              required
                              min="1"
                            />
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((p) => ({
                                  ...p,
                                  quantity: String(Number(p.quantity) + 1),
                                }))
                              }
                              style={{
                                ...buttonBaseStyle,
                                padding: "6px 12px",
                                backgroundColor: "#1e293b",
                                color: "#94a3b8",
                                borderRadius: "0.5rem",
                              }}
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Submit */}
                        <div
                          style={{ display: "flex", alignItems: "flex-end" }}
                        >
                          <button
                            type="submit"
                            disabled={submitting}
                            style={{
                              ...buttonBaseStyle,
                              backgroundColor: "#f97316",
                              color: "#fff",
                              width: "100%",
                              justifyContent: "center",
                              borderRadius: "0.75rem",
                              padding: "0.55rem",
                            }}
                          >
                            {submitting ? (
                              <span className="loader-spin" />
                            ) : (
                              "Add"
                            )}
                          </button>
                        </div>
                      </form>
                    )}

                    {error && (
                      <div
                        style={{
                          color: "#ef4444",
                          fontSize: 13,
                          marginBottom: "0.75rem",
                        }}
                      >
                        {error}
                      </div>
                    )}

                    {/* Table */}
                    <div
                      style={{
                        overflowX: "auto",
                        WebkitOverflowScrolling: "touch",
                        width: "100%",
                        maxWidth: "calc(100vw - 2rem)",
                      }}
                    >
                      <table
                        className="holdings-table"
                        style={{
                          width: "100%",
                          borderCollapse: "collapse",
                          minWidth: "600px",
                        }}
                      >
                        <thead>
                          <tr>
                            <th>Ticker</th>
                            <th>Qty</th>
                            <th>Buy Price</th>
                            <th>Cur. Price</th>
                            <th className="mobile-hide-col">Invested</th>
                            <th className="mobile-hide-col">Cur. Value</th>
                            <th>P&amp;L</th>
                            <th>P&amp;L%</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {loading ? (
                            [1, 2, 3].map(skeletonRow)
                          ) : stockHoldings.length === 0 ? (
                            <tr>
                              <td
                                colSpan={9}
                                style={{
                                  textAlign: "center",
                                  padding: "2.5rem",
                                  color: "#64748b",
                                }}
                              >
                                No stock holdings yet. Click &quot;+ Add
                                Stock&quot; to get started.
                              </td>
                            </tr>
                          ) : (
                            stockHoldings.map((h) => (
                              <tr
                                key={h.id}
                                className="holding-row"
                                style={{ cursor: "pointer" }}
                                onClick={(e) => {
                                  if (e.target.closest("button")) return;
                                  setSelectedTicker(h.ticker);
                                  setDrawerOpen(true);
                                }}
                              >
                                <td
                                  data-label="Ticker"
                                  style={{
                                    fontWeight: 700,
                                    color: "#f97316",
                                    fontSize: "15px",
                                  }}
                                >
                                  {h.ticker.replace(".NS", "")}
                                </td>
                                <td
                                  data-label="Qty"
                                  style={{ color: "#f8fafc" }}
                                >
                                  {formatNumber(h.quantity)}
                                </td>
                                <td
                                  data-label="Buy"
                                  style={{ color: "#94a3b8" }}
                                >
                                  {formatCurrency(h.buyPrice)}
                                </td>
                                <td
                                  data-label="Price"
                                  style={{ color: "#f8fafc" }}
                                >
                                  {formatCurrency(h.currentPrice)}
                                </td>
                                <td
                                  data-label="Invested"
                                  className="mobile-hide-col"
                                  style={{ color: "#94a3b8" }}
                                >
                                  {formatCurrency(h.invested)}
                                </td>
                                <td
                                  data-label="Value"
                                  className="mobile-hide-col"
                                  style={{ color: "#f8fafc" }}
                                >
                                  {formatCurrency(h.currentValue)}
                                </td>
                                <td
                                  data-label="P&L"
                                  style={{
                                    color: pnlColor(h.pnl),
                                    fontWeight: 600,
                                  }}
                                >
                                  <span className="pnl-arrow">
                                    {h.pnl >= 0 ? "▲" : "▼"}
                                  </span>{" "}
                                  <span className="pnl-sign">
                                    {h.pnl >= 0 ? "+" : "−"}
                                  </span>{" "}
                                  {formatCurrency(Math.abs(h.pnl ?? 0))}
                                </td>
                                <td
                                  data-label="P&L%"
                                  style={{
                                    color: pnlColor(h.pnlPercent),
                                    fontWeight: 600,
                                  }}
                                >
                                  <span className="pnl-arrow">
                                    {(h.pnlPercent ?? 0) >= 0 ? "▲" : "▼"}
                                  </span>{" "}
                                  <span className="pnl-sign">
                                    {(h.pnlPercent ?? 0) >= 0 ? "+" : "−"}
                                  </span>{" "}
                                  {Math.abs(h.pnlPercent ?? 0).toFixed(2)}%
                                </td>
                                <td data-label="Actions">
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button
                                      title="Edit"
                                      onClick={() => {
                                        setEditTarget(h);
                                        setEditForm({
                                          buyPrice: String(h.buyPrice),
                                          qty: String(h.quantity),
                                          buyDate: h.buyDate || "",
                                        });
                                        setEditError("");
                                      }}
                                      style={{
                                        ...buttonBaseStyle,
                                        padding: "4px 9px",
                                        fontSize: 13,
                                        backgroundColor:
                                          "rgba(255,255,255,0.07)",
                                        color: "#94a3b8",
                                        borderRadius: "0.5rem",
                                      }}
                                    >
                                      ✏
                                    </button>
                                    <button
                                      title="Delete"
                                      onClick={() => setDeleteTarget(h)}
                                      style={{
                                        ...buttonBaseStyle,
                                        padding: "4px 9px",
                                        fontSize: 13,
                                        backgroundColor: "rgba(239,68,68,0.12)",
                                        color: "#ef4444",
                                        borderRadius: "0.5rem",
                                      }}
                                    >
                                      🗑
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {/* ── MUTUAL FUNDS ── */}
                {holdingsSubTab === "Mutual Funds" && (
                  <>
                    {showMfForm && (
                      <div
                        style={{
                          marginBottom: "1rem",
                          padding: "1rem",
                          background: "rgba(139,92,246,0.06)",
                          borderRadius: "0.85rem",
                          border: "1px solid rgba(139,92,246,0.2)",
                          display: "flex",
                          flexDirection: "column",
                          overflow: "visible",
                          gap: "0.7rem",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            color: "#a78bfa",
                            fontSize: "0.78rem",
                            fontWeight: 700,
                            letterSpacing: "0.08em",
                          }}
                        >
                          ADD MUTUAL FUND
                        </p>

                        {/* Fund search */}
                        <div
                          style={{ position: "relative", overflow: "visible" }}
                        >
                          <p
                            style={{
                              margin: "0 0 0.3rem",
                              color: "#94a3b8",
                              fontSize: "0.75rem",
                              fontWeight: 600,
                            }}
                          >
                            SEARCH FUND
                          </p>
                          <input
                            type="text"
                            placeholder="e.g. Mirae Asset, Axis Bluechip..."
                            value={mfQuery}
                            onChange={(e) => {
                              setMfQuery(e.target.value);
                              searchMf(e.target.value);
                            }}
                            style={{ ...inputStyle, fontSize: "0.9rem" }}
                          />
                          {mfSearching && (
                            <p
                              style={{
                                margin: "4px 0 0",
                                color: "#94a3b8",
                                fontSize: "0.72rem",
                              }}
                            >
                              Searching...
                            </p>
                          )}
                          {mfResults.length > 0 && !selectedMf && (
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
                                zIndex: 500,
                                boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                                maxHeight: "180px",
                                overflowY: "auto",
                              }}
                            >
                              {mfResults.map((mf) => (
                                <div
                                  key={mf.schemeCode}
                                  onMouseDown={() => {
                                    setSelectedMf(mf);
                                    fetchLiveMfNav(mf.schemeCode);
                                    setMfQuery(mf.schemeName);
                                    setMfResults([]);
                                  }}
                                  style={{
                                    padding: "0.65rem 1rem",
                                    cursor: "pointer",
                                    borderBottom:
                                      "1px solid rgba(255,255,255,0.06)",
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "rgba(139,92,246,0.1)";
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.backgroundColor =
                                      "transparent";
                                  }}
                                >
                                  <p
                                    style={{
                                      margin: 0,
                                      color: "#a78bfa",
                                      fontWeight: 700,
                                      fontSize: "0.78rem",
                                    }}
                                  >
                                    {mf.schemeCode}
                                  </p>
                                  <p
                                    style={{
                                      margin: "2px 0 0",
                                      color: "#94a3b8",
                                      fontSize: "0.75rem",
                                    }}
                                  >
                                    {mf.schemeName}
                                  </p>
                                </div>
                              ))}
                            </div>
                          )}
                          {selectedMf && (
                            <div
                              style={{
                                marginTop: "6px",
                                padding: "8px 12px",
                                borderRadius: "8px",
                                background: "rgba(139,92,246,0.08)",
                                border: "1px solid rgba(139,92,246,0.25)",
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                              }}
                            >
                              <div>
                                <p
                                  style={{
                                    margin: 0,
                                    color: "#a78bfa",
                                    fontSize: "0.72rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {selectedMf.schemeCode}
                                </p>
                                <p
                                  style={{
                                    margin: 0,
                                    color: "#cbd5e1",
                                    fontSize: "0.72rem",
                                  }}
                                >
                                  {selectedMf.schemeName}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMf(null);
                                  setMfQuery("");
                                  setLiveMfNav(null);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  color: "#64748b",
                                  cursor: "pointer",
                                }}
                              >
                                ✕
                              </button>
                            </div>
                          )}
                        </div>

                        {selectedMf && (
                          <>
                            {/* Purchase date */}
                            <div>
                              <p
                                style={{
                                  margin: "0 0 0.3rem",
                                  color: "#94a3b8",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                }}
                              >
                                PURCHASE DATE
                              </p>
                              <input
                                type="date"
                                value={mfBuyDate}
                                onChange={(e) => setMfBuyDate(e.target.value)}
                                style={inputStyle}
                              />
                            </div>

                            {(liveMfNavFetching || liveMfNav !== null) && (
                              <div
                                style={{
                                  padding: "0.75rem 0.9rem",
                                  borderRadius: "0.75rem",
                                  border: "1px solid rgba(139,92,246,0.2)",
                                  backgroundColor: "rgba(139,92,246,0.08)",
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
                                  Current NAV:
                                </p>
                                <p
                                  style={{
                                    margin: "0.25rem 0 0",
                                    color: "#a78bfa",
                                    fontSize: "1rem",
                                    fontWeight: 700,
                                  }}
                                >
                                  {liveMfNavFetching
                                    ? "Fetching..."
                                    : `₹${liveMfNav?.toFixed(4)}`}
                                </p>
                              </div>
                            )}

                            {/* Purchase NAV */}
                            <div>
                              <p
                                style={{
                                  margin: "0 0 0.3rem",
                                  color: "#94a3b8",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                }}
                              >
                                PURCHASE NAV (₹)
                              </p>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="e.g. 45.23"
                                value={mfBuyNav}
                                onChange={(e) => {
                                  if (/^\d*\.?\d*$/.test(e.target.value))
                                    setMfBuyNav(e.target.value);
                                }}
                                style={{ ...inputStyle, fontSize: "1rem" }}
                              />
                            </div>

                            {/* Units */}
                            <div>
                              <p
                                style={{
                                  margin: "0 0 0.3rem",
                                  color: "#94a3b8",
                                  fontSize: "0.75rem",
                                  fontWeight: 600,
                                }}
                              >
                                UNITS PURCHASED
                              </p>
                              <input
                                type="text"
                                inputMode="decimal"
                                placeholder="e.g. 500.123"
                                value={mfUnits}
                                onChange={(e) => {
                                  if (/^\d*\.?\d*$/.test(e.target.value))
                                    setMfUnits(e.target.value);
                                }}
                                style={{ ...inputStyle, fontSize: "1rem" }}
                              />
                            </div>

                            {mfError && (
                              <p
                                style={{
                                  margin: 0,
                                  color: "#ef4444",
                                  fontSize: "0.78rem",
                                }}
                              >
                                {mfError}
                              </p>
                            )}

                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button
                                type="button"
                                onClick={onSubmitMf}
                                disabled={mfSubmitting}
                                style={{
                                  flex: 1,
                                  background: "#8b5cf6",
                                  color: "white",
                                  borderRadius: "20px",
                                  padding: "8px 16px",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  border: "none",
                                  cursor: mfSubmitting
                                    ? "not-allowed"
                                    : "pointer",
                                  opacity: mfSubmitting ? 0.7 : 1,
                                  fontFamily: "inherit",
                                }}
                              >
                                {mfSubmitting ? "Adding..." : "Add Fund"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setShowMfForm(false);
                                  setMfError("");
                                  setSelectedMf(null);
                                  setMfQuery("");
                                  setMfBuyNav("");
                                  setMfUnits("");
                                  setMfBuyDate("");
                                }}
                                style={{
                                  background: "transparent",
                                  color: "#94a3b8",
                                  borderRadius: "20px",
                                  padding: "8px 16px",
                                  fontSize: "13px",
                                  fontWeight: 600,
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  cursor: "pointer",
                                  fontFamily: "inherit",
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {/* MF Cards */}
                    {mfHoldings.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "3rem",
                          color: "#64748b",
                        }}
                      >
                        <div style={{ fontSize: 40, marginBottom: 8 }}>🏦</div>
                        No mutual funds yet. Click &quot;+ Add MF&quot; to get
                        started.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        {mfHoldings.map((h) => (
                          <div
                            key={h.id}
                            onClick={(e) => {
                              if (e.target.closest("button")) return;
                              openMfDrawer(h);
                            }}
                            style={{
                              backgroundColor: "#0f172a",
                              border: "1px solid rgba(139,92,246,0.2)",
                              borderLeft: "3px solid #8b5cf6",
                              borderRadius: "0.75rem",
                              padding: "0.9rem 1rem",
                              cursor: "pointer",
                              transition: "border-color 0.15s",
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor =
                                "rgba(139,92,246,0.5)";
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor =
                                "rgba(139,92,246,0.2)";
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "#f8fafc",
                                    fontSize: 14,
                                  }}
                                >
                                  {h.schemeName || h.ticker}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#64748b",
                                    marginTop: 2,
                                  }}
                                >
                                  {formatNumber(h.quantity)} units · NAV{" "}
                                  {formatCurrency(h.currentPrice)}
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 6,
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ textAlign: "right" }}>
                                  <div
                                    style={{
                                      fontSize: 15,
                                      fontWeight: 700,
                                      color: "#f8fafc",
                                    }}
                                  >
                                    {formatCurrency(h.currentValue)}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: pnlColor(h.pnl),
                                      fontWeight: 600,
                                    }}
                                  >
                                    {h.pnl >= 0 ? "+" : ""}
                                    {formatCurrency(h.pnl)} (
                                    {(h.pnlPercent ?? 0).toFixed(2)}%)
                                  </div>
                                </div>
                                <div
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                  }}
                                >
                                  <button
                                    title="Edit"
                                    onClick={() => {
                                      setEditTarget(h);
                                      setEditForm({
                                        buyPrice: String(h.buyPrice),
                                        qty: String(h.quantity),
                                        buyDate: h.buyDate || "",
                                      });
                                      setEditError("");
                                    }}
                                    style={{
                                      ...buttonBaseStyle,
                                      padding: "4px 9px",
                                      fontSize: 12,
                                      backgroundColor: "rgba(255,255,255,0.07)",
                                      color: "#94a3b8",
                                      borderRadius: "0.5rem",
                                    }}
                                  >
                                    ✏
                                  </button>
                                  <button
                                    title="Delete"
                                    onClick={() => setDeleteTarget(h)}
                                    style={{
                                      ...buttonBaseStyle,
                                      padding: "4px 9px",
                                      fontSize: 12,
                                      backgroundColor: "rgba(239,68,68,0.12)",
                                      color: "#ef4444",
                                      borderRadius: "0.5rem",
                                    }}
                                  >
                                    🗑
                                  </button>
                                </div>
                              </div>
                            </div>
                            <div
                              style={{
                                marginTop: "0.5rem",
                                display: "flex",
                                gap: "1.5rem",
                                fontSize: 12,
                                color: "#64748b",
                              }}
                            >
                              <span>
                                Invested:{" "}
                                <span style={{ color: "#94a3b8" }}>
                                  {formatCurrency(h.invested)}
                                </span>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* ── FD ── */}
                {holdingsSubTab === "FD" && (
                  <>
                    {showFdForm && (
                      <div
                        style={{
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(16,185,129,0.25)",
                          borderRadius: "0.75rem",
                          padding: "1rem",
                          marginBottom: "1rem",
                        }}
                      >
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(130px,1fr))",
                            gap: "0.75rem",
                            marginBottom: "0.75rem",
                          }}
                        >
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Bank / Institution
                            </label>
                            <input
                              style={inputStyle}
                              placeholder="e.g. SBI"
                              value={fdBank}
                              onChange={(e) => setFdBank(e.target.value)}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Start Date
                            </label>
                            <input
                              type="date"
                              style={inputStyle}
                              value={fdStartDate}
                              onChange={(e) => setFdStartDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Principal (₹)
                            </label>
                            <input
                              type="number"
                              style={inputStyle}
                              placeholder="₹"
                              value={fdPrincipal}
                              onChange={(e) => setFdPrincipal(e.target.value)}
                              min="0"
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Interest Rate (%)
                            </label>
                            <input
                              type="number"
                              style={inputStyle}
                              placeholder="% p.a."
                              value={fdRate}
                              onChange={(e) => setFdRate(e.target.value)}
                              min="0"
                              step="0.01"
                            />
                          </div>
                          <div>
                            <label
                              style={{
                                fontSize: 11,
                                color: "#64748b",
                                display: "block",
                                marginBottom: 4,
                              }}
                            >
                              Maturity Date{" "}
                              <span style={{ color: "#475569" }}>
                                (optional)
                              </span>
                            </label>
                            <input
                              type="date"
                              style={inputStyle}
                              value={fdMaturityDate}
                              onChange={(e) =>
                                setFdMaturityDate(e.target.value)
                              }
                            />
                          </div>
                        </div>

                        {fdError && (
                          <div
                            style={{
                              color: "#ef4444",
                              fontSize: 12,
                              marginBottom: 8,
                            }}
                          >
                            {fdError}
                          </div>
                        )}

                        <button
                          onClick={onSubmitFd}
                          disabled={fdSubmitting}
                          style={{
                            ...buttonBaseStyle,
                            backgroundColor: "#10b981",
                            color: "#fff",
                            padding: "7px 22px",
                          }}
                        >
                          {fdSubmitting ? (
                            <span className="loader-spin" />
                          ) : (
                            "Add FD"
                          )}
                        </button>
                      </div>
                    )}

                    {/* FD Cards */}
                    {fdHoldings.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "3rem",
                          color: "#64748b",
                        }}
                      >
                        <div style={{ fontSize: 40, marginBottom: 8 }}>💰</div>
                        No FDs yet. Click &quot;+ Add FD&quot; to get started.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.75rem" }}>
                        {fdHoldings.map((h) => (
                          <div
                            key={h.id}
                            style={{
                              backgroundColor: "#0f172a",
                              border: "1px solid rgba(16,185,129,0.2)",
                              borderLeft: "3px solid #10b981",
                              borderRadius: "0.75rem",
                              padding: "0.9rem 1rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                flexWrap: "wrap",
                                gap: 6,
                              }}
                            >
                              <div>
                                <div
                                  style={{
                                    fontWeight: 700,
                                    color: "#f8fafc",
                                    fontSize: 15,
                                  }}
                                >
                                  {h.ticker}
                                </div>
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "#10b981",
                                    marginTop: 2,
                                  }}
                                >
                                  {h.fdRate ?? "—"}% p.a.
                                </div>
                              </div>
                              <div
                                style={{
                                  display: "flex",
                                  gap: 8,
                                  alignItems: "center",
                                }}
                              >
                                <div style={{ textAlign: "right" }}>
                                  <div
                                    style={{
                                      fontSize: 15,
                                      fontWeight: 700,
                                      color: "#f8fafc",
                                    }}
                                  >
                                    {formatCurrency(h.currentValue)}
                                  </div>
                                  <div
                                    style={{
                                      fontSize: 12,
                                      color: "#10b981",
                                      fontWeight: 600,
                                    }}
                                  >
                                    +{formatCurrency(h.pnl)} interest
                                  </div>
                                </div>
                                <button
                                  title="Delete"
                                  onClick={() => setDeleteTarget(h)}
                                  style={{
                                    ...buttonBaseStyle,
                                    padding: "4px 9px",
                                    fontSize: 12,
                                    backgroundColor: "rgba(239,68,68,0.12)",
                                    color: "#ef4444",
                                    borderRadius: "0.5rem",
                                  }}
                                >
                                  🗑
                                </button>
                              </div>
                            </div>
                            <div
                              style={{
                                marginTop: "0.5rem",
                                display: "flex",
                                gap: "1.5rem",
                                fontSize: 12,
                                color: "#64748b",
                              }}
                            >
                              <span>
                                Principal:{" "}
                                <span style={{ color: "#94a3b8" }}>
                                  {formatCurrency(h.buyPrice)}
                                </span>
                              </span>
                              {h.buyDate && (
                                <span>
                                  From:{" "}
                                  <span style={{ color: "#94a3b8" }}>
                                    {h.buyDate}
                                  </span>
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── WATCHLIST TAB ── */}
          {dashTab === "Watchlist" && (
            <>
              <div
                style={{
                  display: "flex",
                  gap: "6px",
                  marginBottom: "0.85rem",
                  alignItems: "center",
                }}
              >
                {WATCHLIST_TABS.map((sub) => (
                  <button
                    key={sub}
                    type="button"
                    onClick={() => setWatchlistSubTab(sub)}
                    style={{
                      background:
                        watchlistSubTab === sub
                          ? sub === "Mutual Funds"
                            ? "#8b5cf6"
                            : "#f97316"
                          : "#1e293b",
                      color: watchlistSubTab === sub ? "white" : "#94a3b8",
                      borderRadius: "20px",
                      padding: "5px 14px",
                      fontSize: "12px",
                      fontWeight: 600,
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    {sub}
                  </button>
                ))}
              </div>

              <div ref={watchlistSwipeRef} style={{ touchAction: "pan-y" }}>
                {watchlistSubTab === "Stocks" && (
                  <>
                    {showWatchlistInput && (
                      <div
                        style={{ marginBottom: "1rem", position: "relative" }}
                      >
                        <div style={{ display: "flex", gap: 6 }}>
                          <div style={{ flex: 1, position: "relative" }}>
                            <input
                              style={inputStyle}
                              placeholder="Search NSE ticker…"
                              value={watchInputTicker}
                              onChange={(e) => {
                                setWatchInputTicker(e.target.value);
                                setShowWatchTickerDrop(true);
                              }}
                              onFocus={() => setShowWatchTickerDrop(true)}
                              onBlur={() =>
                                setTimeout(
                                  () => setShowWatchTickerDrop(false),
                                  150,
                                )
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleWatchlistAdd();
                                }
                              }}
                              autoFocus
                            />
                            {showWatchTickerDrop &&
                              watchTickerSuggestions.length > 0 && (
                                <div
                                  style={{
                                    position: "absolute",
                                    top: "100%",
                                    left: 0,
                                    right: 0,
                                    zIndex: 50,
                                    backgroundColor: "#1e293b",
                                    border: "1px solid rgba(255,255,255,0.1)",
                                    borderRadius: "0.5rem",
                                    marginTop: 2,
                                    overflow: "hidden",
                                  }}
                                >
                                  {watchTickerSuggestions.map((t) => (
                                    <div
                                      key={t.symbol}
                                      onMouseDown={() => {
                                        setWatchInputTicker(t.symbol);
                                        setShowWatchTickerDrop(false);
                                      }}
                                      style={{
                                        padding: "0.5rem 0.75rem",
                                        cursor: "pointer",
                                        fontSize: 13,
                                        borderBottom:
                                          "1px solid rgba(255,255,255,0.05)",
                                      }}
                                      onMouseEnter={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                          "rgba(255,255,255,0.06)";
                                      }}
                                      onMouseLeave={(e) => {
                                        e.currentTarget.style.backgroundColor =
                                          "transparent";
                                      }}
                                    >
                                      <span
                                        style={{
                                          color: "#f97316",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {t.symbol}
                                      </span>
                                      <span
                                        style={{
                                          color: "#64748b",
                                          marginLeft: 8,
                                          fontSize: 11,
                                        }}
                                      >
                                        {t.full}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                          </div>
                          <button
                            onClick={handleWatchlistAdd}
                            disabled={watchInputLoading}
                            style={{
                              ...buttonBaseStyle,
                              backgroundColor: "#f97316",
                              color: "#fff",
                              borderRadius: "0.75rem",
                              padding: "6px 16px",
                            }}
                          >
                            {watchInputLoading ? (
                              <span className="loader-spin" />
                            ) : (
                              "Add"
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setShowWatchlistInput(false);
                              setWatchInputTicker("");
                              setWatchInputError("");
                            }}
                            style={{
                              ...buttonBaseStyle,
                              backgroundColor: "rgba(255,255,255,0.07)",
                              color: "#94a3b8",
                              borderRadius: "0.75rem",
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                        {watchInputError && (
                          <div
                            style={{
                              color: "#ef4444",
                              fontSize: 12,
                              marginTop: 4,
                            }}
                          >
                            {watchInputError}
                          </div>
                        )}
                      </div>
                    )}

                    {watchlistLoading ? (
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        {[1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className="animate-pulse"
                            style={{
                              height: 56,
                              borderRadius: "0.75rem",
                              backgroundColor: "rgba(255,255,255,0.05)",
                            }}
                          />
                        ))}
                      </div>
                    ) : watchlistError ? (
                      <div style={{ color: "#ef4444", fontSize: 13 }}>
                        {watchlistError}
                      </div>
                    ) : watchlist.length === 0 ? (
                      <div
                        style={{
                          textAlign: "center",
                          padding: "3rem",
                          color: "#64748b",
                        }}
                      >
                        No watchlist items yet. Click &quot;+ Add&quot; to track
                        a stock.
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        {watchlist.map((item) => (
                          <div
                            key={item.ticker}
                            onClick={() => {
                              setSelectedTicker(item.ticker);
                              setDrawerOpen(true);
                            }}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "0.7rem 0.85rem",
                              borderRadius: "0.75rem",
                              border: "1px solid rgba(255,255,255,0.07)",
                              backgroundColor: "rgba(15,23,42,0.5)",
                              cursor: "pointer",
                              gap: "0.5rem",
                              marginBottom: "6px",
                            }}
                            onMouseEnter={(e) =>
                              (e.currentTarget.style.borderColor =
                                "rgba(249,115,22,0.35)")
                            }
                            onMouseLeave={(e) =>
                              (e.currentTarget.style.borderColor =
                                "rgba(255,255,255,0.07)")
                            }
                          >
                            <div style={{ minWidth: "5rem" }}>
                              <p
                                style={{
                                  margin: 0,
                                  color: "#f8fafc",
                                  fontWeight: 700,
                                  fontSize: "0.9rem",
                                }}
                              >
                                {item.ticker.replace(/\.NS$/i, "")}
                              </p>
                            </div>
                            <div style={{ flex: 1, textAlign: "center" }}>
                              <p
                                style={{
                                  margin: 0,
                                  color: "#f8fafc",
                                  fontSize: "0.95rem",
                                  fontWeight: 600,
                                  fontFamily: "'Barlow Condensed', sans-serif",
                                }}
                              >
                                {item.currentPrice
                                  ? formatCurrency(item.currentPrice)
                                  : "—"}
                              </p>
                              {item.changePct != null && (
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "0.75rem",
                                    color:
                                      Number(item.changePct) >= 0
                                        ? "#22c55e"
                                        : "#ef4444",
                                  }}
                                >
                                  {Number(item.changePct) >= 0 ? "▲" : "▼"}{" "}
                                  {Math.abs(Number(item.changePct)).toFixed(2)}%
                                </p>
                              )}
                            </div>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.5rem",
                              }}
                            >
                              <span
                                style={{
                                  fontSize: "0.7rem",
                                  fontWeight: 700,
                                  padding: "3px 8px",
                                  borderRadius: "20px",
                                  background:
                                    item.sentimentBadge === "Bullish"
                                      ? "rgba(34,197,94,0.15)"
                                      : item.sentimentBadge === "Bearish"
                                        ? "rgba(239,68,68,0.15)"
                                        : "rgba(100,116,139,0.2)",
                                  color:
                                    item.sentimentBadge === "Bullish"
                                      ? "#22c55e"
                                      : item.sentimentBadge === "Bearish"
                                        ? "#ef4444"
                                        : "#94a3b8",
                                  whiteSpace: "nowrap",
                                }}
                              >
                                {item.sentimentBadge || "Neutral"}
                              </span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleWatchlistRemove(item.ticker);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#475569",
                                  fontSize: "0.9rem",
                                  padding: "2px 4px",
                                  lineHeight: 1,
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.color = "#ef4444")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.color = "#475569")
                                }
                              >
                                🗑
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {watchlistSubTab === "Mutual Funds" && (
                  <>
                    <div style={{ marginBottom: "0.85rem" }}>
                      <div style={{ position: "relative" }}>
                        <input
                          type="text"
                          placeholder="Search fund e.g. Mirae Asset, Axis..."
                          value={watchMfQuery}
                          onChange={(e) => {
                            setWatchMfQuery(e.target.value);
                            searchWatchMf(e.target.value);
                          }}
                          style={{ ...inputStyle, fontSize: "0.9rem" }}
                        />
                        {watchMfSearching && (
                          <p
                            style={{
                              margin: "4px 0 0",
                              color: "#94a3b8",
                              fontSize: "0.72rem",
                            }}
                          >
                            Searching...
                          </p>
                        )}
                        {watchMfResults.length > 0 && !watchMfSelected && (
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
                              zIndex: 200,
                              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
                              maxHeight: "180px",
                              overflowY: "auto",
                            }}
                          >
                            {watchMfResults.map((mf) => (
                              <div
                                key={mf.schemeCode}
                                onMouseDown={() => {
                                  setWatchMfSelected(mf);
                                  setWatchMfQuery(mf.schemeName);
                                  setWatchMfResults([]);
                                }}
                                style={{
                                  padding: "0.65rem 1rem",
                                  cursor: "pointer",
                                  borderBottom:
                                    "1px solid rgba(255,255,255,0.06)",
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.backgroundColor =
                                    "rgba(139,92,246,0.1)")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.backgroundColor =
                                    "transparent")
                                }
                              >
                                <p
                                  style={{
                                    margin: 0,
                                    color: "#a78bfa",
                                    fontWeight: 700,
                                    fontSize: "0.78rem",
                                  }}
                                >
                                  {mf.schemeCode}
                                </p>
                                <p
                                  style={{
                                    margin: "2px 0 0",
                                    color: "#94a3b8",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {mf.schemeName}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {watchMfSelected && (
                        <div
                          style={{
                            marginTop: "6px",
                            padding: "8px 12px",
                            borderRadius: "8px",
                            background: "rgba(139,92,246,0.08)",
                            border: "1px solid rgba(139,92,246,0.25)",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                          }}
                        >
                          <div>
                            <p
                              style={{
                                margin: 0,
                                color: "#a78bfa",
                                fontSize: "0.72rem",
                                fontWeight: 700,
                              }}
                            >
                              {watchMfSelected.schemeCode}
                            </p>
                            <p
                              style={{
                                margin: 0,
                                color: "#cbd5e1",
                                fontSize: "0.72rem",
                              }}
                            >
                              {watchMfSelected.schemeName}
                            </p>
                          </div>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              type="button"
                              onClick={handleAddMfWatchlist}
                              disabled={watchMfAdding}
                              style={{
                                background: "#8b5cf6",
                                color: "white",
                                border: "none",
                                borderRadius: "20px",
                                padding: "5px 14px",
                                fontSize: "12px",
                                fontWeight: 600,
                                cursor: "pointer",
                                opacity: watchMfAdding ? 0.7 : 1,
                                fontFamily: "inherit",
                              }}
                            >
                              {watchMfAdding ? "Adding..." : "Add"}
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setWatchMfSelected(null);
                                setWatchMfQuery("");
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: "#64748b",
                                cursor: "pointer",
                                fontSize: "1rem",
                              }}
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      )}
                      {watchMfError && (
                        <p
                          style={{
                            margin: "4px 0 0",
                            color: "#ef4444",
                            fontSize: "0.75rem",
                          }}
                        >
                          {watchMfError}
                        </p>
                      )}
                    </div>

                    {watchlistLoading ? (
                      <div style={{ display: "grid", gap: "0.6rem" }}>
                        {[1, 2].map((i) => (
                          <div
                            key={i}
                            className="animate-pulse"
                            style={{
                              height: "3rem",
                              borderRadius: "0.75rem",
                              backgroundColor: "rgba(51,65,85,0.35)",
                            }}
                          />
                        ))}
                      </div>
                    ) : watchlist.filter((item) => {
                        const code = item.ticker;
                        return !code.endsWith(".NS") && !code.endsWith(".BO");
                      }).length === 0 ? (
                      <div
                        style={{ textAlign: "center", padding: "1.5rem 1rem" }}
                      >
                        <p style={{ margin: 0, fontSize: "1.5rem" }}>🏦</p>
                        <p
                          style={{
                            margin: "0.5rem 0 0",
                            color: "#94a3b8",
                            fontSize: "0.9rem",
                          }}
                        >
                          No funds in watchlist
                        </p>
                        <p
                          style={{
                            margin: "0.3rem 0 0",
                            color: "#475569",
                            fontSize: "0.8rem",
                          }}
                        >
                          Search and add mutual funds above
                        </p>
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "0.5rem" }}>
                        {watchlist
                          .filter(
                            (item) =>
                              !item.ticker.endsWith(".NS") &&
                              !item.ticker.endsWith(".BO"),
                          )
                          .map((item) => (
                            <div
                              key={item.ticker}
                              onClick={() => {
                                setMfDrawerOpen(true);
                                setMfDrawerLoading(true);
                                setMfDrawerData(null);
                                api
                                  .get(`/api/holdings/mf-nav/${item.ticker}`)
                                  .then((res) =>
                                    setMfDrawerData({
                                      ...res.data,
                                      holding: {
                                        ticker: item.ticker,
                                        schemeName:
                                          res.data.schemeName || item.ticker,
                                        invested: null,
                                        currentValue: null,
                                        pnl: null,
                                        pnlPercent: null,
                                        quantity: null,
                                        currentPrice: res.data.currentNav,
                                        buyPrice: null,
                                        buyDate: null,
                                      },
                                    }),
                                  )
                                  .catch(() =>
                                    setMfDrawerData({
                                      error: true,
                                      holding: { ticker: item.ticker },
                                    }),
                                  )
                                  .finally(() => setMfDrawerLoading(false));
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                padding: "0.7rem 0.85rem",
                                borderRadius: "0.75rem",
                                border: "1px solid rgba(139,92,246,0.15)",
                                backgroundColor: "rgba(15,23,42,0.5)",
                                cursor: "pointer",
                                gap: "0.5rem",
                              }}
                              onMouseEnter={(e) =>
                                (e.currentTarget.style.borderColor =
                                  "rgba(139,92,246,0.4)")
                              }
                              onMouseLeave={(e) =>
                                (e.currentTarget.style.borderColor =
                                  "rgba(139,92,246,0.15)")
                              }
                            >
                              <div style={{ flex: 1 }}>
                                <div
                                  style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: "6px",
                                  }}
                                >
                                  <span
                                    style={{
                                      fontSize: "9px",
                                      fontWeight: 700,
                                      background: "rgba(139,92,246,0.2)",
                                      color: "#a78bfa",
                                      borderRadius: "10px",
                                      padding: "1px 6px",
                                    }}
                                  >
                                    MF
                                  </span>
                                  <p
                                    style={{
                                      margin: 0,
                                      color: "#f8fafc",
                                      fontWeight: 700,
                                      fontSize: "0.85rem",
                                    }}
                                  >
                                    {mfNameCache[item.ticker] || item.ticker}
                                  </p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleWatchlistRemove(item.ticker);
                                }}
                                style={{
                                  background: "transparent",
                                  border: "none",
                                  cursor: "pointer",
                                  color: "#475569",
                                  fontSize: "0.9rem",
                                  padding: "2px 4px",
                                  lineHeight: 1,
                                }}
                                onMouseEnter={(e) =>
                                  (e.currentTarget.style.color = "#ef4444")
                                }
                                onMouseLeave={(e) =>
                                  (e.currentTarget.style.color = "#475569")
                                }
                              >
                                🗑
                              </button>
                            </div>
                          ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}

          {/* ── NEWS TAB ── */}
          {dashTab === "News" && (
            <>
              {/* Category pills */}
              <div
                style={{
                  display: "flex",
                  gap: "0.4rem",
                  marginBottom: "1rem",
                  flexWrap: "wrap",
                }}
              >
                {[
                  { label: "All", value: "all" },
                  { label: "Market", value: "market" },
                  { label: "Banking", value: "banking" },
                  { label: "IT", value: "it" },
                  { label: "Pharma", value: "pharma" },
                  { label: "Auto", value: "auto" },
                  { label: "Energy", value: "energy" },
                  { label: "Finance", value: "finance" },
                  { label: "Mutual Funds", value: "mf" },
                  { label: "IPO", value: "ipo" },
                  { label: "Economy", value: "economy" },
                  { label: "SEBI", value: "sebi" },
                  { label: "Govt Policy", value: "policy" },
                  { label: "Rupee", value: "rupee" },
                ].map((cat) => (
                  <button
                    key={cat.value}
                    onClick={() => {
                      setNewsCategory(cat.value);
                      setNewsArticles([]);
                      fetchNews(cat.value);
                    }}
                    style={{
                      ...buttonBaseStyle,
                      backgroundColor:
                        newsCategory === cat.value ? "#f97316" : "#1e293b",
                      color: newsCategory === cat.value ? "#fff" : "#94a3b8",
                      border:
                        newsCategory === cat.value
                          ? "none"
                          : "1px solid rgba(255,255,255,0.08)",
                      textTransform: "capitalize",
                    }}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {newsLoading ? (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {[1, 2, 3, 4].map((i) => (
                    <div
                      key={i}
                      className="animate-pulse"
                      style={{
                        height: 70,
                        borderRadius: "0.75rem",
                        backgroundColor: "rgba(255,255,255,0.05)",
                      }}
                    />
                  ))}
                </div>
              ) : newsError ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "2rem",
                    color: "#64748b",
                  }}
                >
                  <div style={{ color: "#ef4444", marginBottom: 12 }}>
                    {newsError}
                  </div>
                  <button
                    onClick={() => fetchNews(newsCategory)}
                    style={{
                      ...buttonBaseStyle,
                      backgroundColor: "#1e293b",
                      color: "#94a3b8",
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : newsArticles.length === 0 ? (
                <div
                  style={{
                    textAlign: "center",
                    padding: "3rem",
                    color: "#64748b",
                  }}
                >
                  No news articles found.
                </div>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {newsArticles.map((article, i) => (
                    <div
                      key={i}
                      onClick={() =>
                        article.url &&
                        window.open(article.url, "_blank", "noreferrer")
                      }
                      style={{
                        backgroundColor: "#0f172a",
                        border:
                          hoveredIndex === i
                            ? "1px solid rgba(249,115,22,0.3)"
                            : "1px solid rgba(255,255,255,0.07)",
                        borderRadius: "0.75rem",
                        padding: "0",
                        cursor: "pointer",
                        overflow: "hidden",
                        display: "flex",
                        alignItems: "stretch",
                        transition: "border-color 0.15s",
                      }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    >
                      {article.image && (
                        <div
                          style={{
                            width: "80px",
                            minWidth: "80px",
                            flexShrink: 0,
                            overflow: "hidden",
                          }}
                        >
                          <img
                            src={article.image}
                            alt=""
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                              display: "block",
                            }}
                            onError={(e) => {
                              e.currentTarget.parentElement.style.display =
                                "none";
                            }}
                          />
                        </div>
                      )}

                      <div
                        style={{ padding: "10px 12px", flex: 1, minWidth: 0 }}
                      >
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#f8fafc",
                            fontSize: 14,
                            lineHeight: 1.4,
                            marginBottom: 4,
                          }}
                        >
                          {article.title}
                        </div>

                        {article.description && (
                          <p
                            style={{
                              margin: "0 0 6px",
                              color: "#64748b",
                              fontSize: "11px",
                              lineHeight: 1.4,
                              display: "-webkit-box",
                              WebkitLineClamp: 2,
                              WebkitBoxOrient: "vertical",
                              overflow: "hidden",
                            }}
                          >
                            {article.description}
                          </p>
                        )}

                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            marginTop: "0.35rem",
                            gap: "0.5rem",
                            flexWrap: "wrap",
                          }}
                        >
                          <span
                            style={{ color: "#f97316", fontSize: "0.72rem" }}
                          >
                            {article.source || "News"}
                          </span>
                          <span
                            style={{ color: "#475569", fontSize: "0.72rem" }}
                          >
                            {article.pubDate || article.publishedAt
                              ? (() => {
                                  try {
                                    const d = new Date(
                                      article.pubDate || article.publishedAt,
                                    );
                                    if (isNaN(d.getTime())) {
                                      return (
                                        article.pubDate || article.publishedAt
                                      );
                                    }
                                    return d.toLocaleDateString("en-IN", {
                                      day: "numeric",
                                      month: "short",
                                      year: "numeric",
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                    });
                                  } catch {
                                    return (
                                      article.pubDate ||
                                      article.publishedAt ||
                                      ""
                                    );
                                  }
                                })()
                              : ""}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── DELETE MODAL ── */}
      {deleteTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setDeleteTarget(null)}
        >
          <div
            style={{
              ...cardStyle,
              padding: "1.5rem",
              maxWidth: 360,
              width: "90%",
              margin: "0 1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                marginBottom: "0.5rem",
                color: "#f8fafc",
              }}
            >
              Confirm Delete
            </div>
            <div
              style={{
                fontSize: 14,
                color: "#94a3b8",
                marginBottom: "1.25rem",
              }}
            >
              Remove{" "}
              <strong style={{ color: "#f97316" }}>
                {deleteTarget.assetType === "mutual_fund"
                  ? deleteTarget.schemeName || deleteTarget.ticker
                  : deleteTarget.ticker}
              </strong>{" "}
              from your portfolio?
            </div>
            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setDeleteTarget(null)}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "#1e293b",
                  color: "#94a3b8",
                }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(deleteTarget.id)}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "#ef4444",
                  color: "#fff",
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT MODAL ── */}
      {editTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
          onClick={() => setEditTarget(null)}
        >
          <div
            style={{
              ...cardStyle,
              padding: "1.5rem",
              maxWidth: 380,
              width: "90%",
              margin: "0 1rem",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 16,
                marginBottom: "1rem",
                color: "#f8fafc",
              }}
            >
              Edit{" "}
              {editTarget.assetType === "mutual_fund"
                ? "Fund"
                : editTarget.assetType === "fd"
                  ? "FD"
                  : "Holding"}
            </div>

            <div
              style={{ display: "grid", gap: "0.75rem", marginBottom: "1rem" }}
            >
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {editTarget.assetType === "mutual_fund"
                    ? "Buy NAV (₹)"
                    : "Buy Price (₹)"}
                </label>
                <input
                  type="number"
                  style={inputStyle}
                  value={editForm.buyPrice}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, buyPrice: e.target.value }))
                  }
                  min="0"
                  step="0.01"
                />
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {editTarget.assetType === "mutual_fund"
                    ? "Units"
                    : "Quantity"}
                </label>
                <div style={{ display: "flex", gap: 4 }}>
                  <button
                    type="button"
                    onClick={() =>
                      setEditForm((p) => ({
                        ...p,
                        qty: String(Math.max(1, Number(p.qty) - 1)),
                      }))
                    }
                    style={{
                      ...buttonBaseStyle,
                      padding: "6px 12px",
                      backgroundColor: "#1e293b",
                      color: "#94a3b8",
                      borderRadius: "0.5rem",
                    }}
                  >
                    −
                  </button>
                  <input
                    type="number"
                    style={{ ...inputStyle, textAlign: "center" }}
                    value={editForm.qty}
                    onChange={(e) =>
                      setEditForm((p) => ({ ...p, qty: e.target.value }))
                    }
                    min="1"
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
                      ...buttonBaseStyle,
                      padding: "6px 12px",
                      backgroundColor: "#1e293b",
                      color: "#94a3b8",
                      borderRadius: "0.5rem",
                    }}
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label
                  style={{
                    fontSize: 11,
                    color: "#64748b",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  Buy Date
                </label>
                <input
                  type="date"
                  style={inputStyle}
                  value={editForm.buyDate}
                  onChange={(e) =>
                    setEditForm((p) => ({ ...p, buyDate: e.target.value }))
                  }
                />
              </div>
            </div>

            {editError && (
              <div style={{ color: "#ef4444", fontSize: 12, marginBottom: 8 }}>
                {editError}
              </div>
            )}

            <div
              style={{
                display: "flex",
                gap: "0.5rem",
                justifyContent: "flex-end",
              }}
            >
              <button
                onClick={() => setEditTarget(null)}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "#1e293b",
                  color: "#94a3b8",
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editSaving}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "#f97316",
                  color: "#fff",
                }}
              >
                {editSaving ? <span className="loader-spin" /> : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK INTEL DRAWER ── */}
      <StockIntelDrawer
        ticker={selectedTicker}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />

      {/* ── MF INFO DRAWER ── */}
      {mfDrawerOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 100,
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
          }}
        >
          {/* Backdrop */}
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(0,0,0,0.6)",
            }}
            onClick={() => setMfDrawerOpen(false)}
          />
          {/* Drawer panel */}
          <div
            className="drawer-slide"
            style={{
              position: "relative",
              width: "100%",
              maxHeight: "85vh",
              backgroundColor: "#0f172a",
              borderTop: "1px solid rgba(255,255,255,0.1)",
              borderRadius: "1.25rem 1.25rem 0 0",
              overflowY: "auto",
              zIndex: 101,
              padding: "1.25rem 1.25rem 5rem 1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "1rem",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                marginBottom: "0.5rem",
              }}
            >
              <div
                style={{
                  width: "2.5rem",
                  height: "4px",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  borderRadius: "2px",
                }}
              />
            </div>
            {/* Close button */}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "1.25rem",
              }}
            >
              <span
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.1em",
                  backgroundColor: "rgba(139,92,246,0.15)",
                  color: "#8b5cf6",
                  border: "1px solid rgba(139,92,246,0.3)",
                  padding: "3px 10px",
                  borderRadius: 20,
                }}
              >
                MUTUAL FUND
              </span>
              <button
                onClick={() => setMfDrawerOpen(false)}
                style={{
                  ...buttonBaseStyle,
                  backgroundColor: "rgba(255,255,255,0.07)",
                  color: "#94a3b8",
                  borderRadius: "50%",
                  padding: "5px 9px",
                  fontSize: 16,
                }}
              >
                ✕
              </button>
            </div>

            {!mfDrawerLoading && !mfDrawerData?.error && (
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "0.85rem 1rem",
                  background: "rgba(139,92,246,0.08)",
                  borderRadius: "0.85rem",
                  border: "1px solid rgba(139,92,246,0.2)",
                  marginBottom: "1rem",
                }}
              >
                <div>
                  <p
                    style={{ margin: 0, color: "#64748b", fontSize: "0.72rem" }}
                  >
                    Current NAV
                  </p>
                  <p
                    style={{
                      margin: "2px 0 0",
                      color: "#a78bfa",
                      fontWeight: 700,
                      fontSize: "1.4rem",
                      fontFamily: "'Barlow Condensed', sans-serif",
                    }}
                  >
                    ₹{(mfDrawerData?.currentNav || 0).toFixed(4)}
                  </p>
                </div>
                {mfDrawerData?.returns?.["1Y"] != null && (
                  <div style={{ textAlign: "right" }}>
                    <p
                      style={{
                        margin: 0,
                        color: "#64748b",
                        fontSize: "0.72rem",
                      }}
                    >
                      1Y Return
                    </p>
                    <p
                      style={{
                        margin: "2px 0 0",
                        fontWeight: 700,
                        fontSize: "1rem",
                        color:
                          mfDrawerData.returns["1Y"] >= 0
                            ? "#22c55e"
                            : "#ef4444",
                      }}
                    >
                      {mfDrawerData.returns["1Y"] >= 0 ? "+" : ""}
                      {mfDrawerData.returns["1Y"].toFixed(1)}%
                    </p>
                  </div>
                )}
              </div>
            )}

            {mfDrawerLoading ? (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                {[1, 2, 3, 4, 5].map((i) => (
                  <div
                    key={i}
                    className="animate-pulse"
                    style={{
                      height: i === 1 ? 32 : 56,
                      borderRadius: "0.75rem",
                      backgroundColor: "rgba(255,255,255,0.06)",
                    }}
                  />
                ))}
              </div>
            ) : !mfDrawerData || mfDrawerData.error ? (
              <div
                style={{
                  textAlign: "center",
                  padding: "3rem",
                  color: "#64748b",
                }}
              >
                Failed to load fund details.
              </div>
            ) : (
              <>
                {/* Header info */}
                <div style={{ marginBottom: "1.25rem" }}>
                  <div
                    style={{
                      fontSize: 17,
                      fontWeight: 700,
                      lineHeight: 1.3,
                      marginBottom: 4,
                    }}
                  >
                    {mfDrawerData.schemeName}
                  </div>
                  {mfDrawerData.fundHouse && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#94a3b8",
                        marginBottom: 4,
                      }}
                    >
                      {mfDrawerData.fundHouse}
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    {mfDrawerData.holding?.ticker && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          backgroundColor: "rgba(255,255,255,0.05)",
                          padding: "2px 8px",
                          borderRadius: 10,
                        }}
                      >
                        {mfDrawerData.holding.ticker}
                      </span>
                    )}
                    {mfDrawerData.schemeCategory && (
                      <span
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          backgroundColor: "rgba(255,255,255,0.05)",
                          padding: "2px 8px",
                          borderRadius: 10,
                        }}
                      >
                        {mfDrawerData.schemeCategory}
                      </span>
                    )}
                  </div>
                </div>

                {mfDrawerData?.holding?.invested != null && (
                  <div
                    style={{
                      backgroundColor: "rgba(139,92,246,0.08)",
                      border: "1px solid rgba(139,92,246,0.2)",
                      borderRadius: "0.75rem",
                      padding: "1rem",
                      marginBottom: "1rem",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: "0.75rem",
                      }}
                    >
                      {[
                        {
                          label: "Invested",
                          value:
                            mfDrawerData?.holding?.invested != null
                              ? formatCurrency(mfDrawerData.holding.invested)
                              : "Not in portfolio",
                        },
                        {
                          label: "Current Value",
                          value:
                            mfDrawerData?.holding?.currentValue != null
                              ? formatCurrency(
                                  mfDrawerData.holding.currentValue,
                                )
                              : `₹— (NAV: ₹${mfDrawerData?.holding?.currentPrice?.toFixed(2)})`,
                        },
                        {
                          label: "Units",
                          value:
                            mfDrawerData?.holding?.quantity != null
                              ? mfDrawerData.holding.quantity
                              : "—",
                        },
                        {
                          label: "P&L",
                          value:
                            mfDrawerData?.holding?.pnl != null
                              ? `${mfDrawerData.holding.pnl >= 0 ? "+" : ""}${formatCurrency(mfDrawerData.holding.pnl)}`
                              : "—",
                          color:
                            mfDrawerData?.holding?.pnl != null
                              ? pnlColor(mfDrawerData.holding.pnl)
                              : "#f8fafc",
                        },
                      ].map(({ label, value, color }) => (
                        <div key={label}>
                          <div
                            style={{
                              fontSize: 11,
                              color: "#64748b",
                              marginBottom: 3,
                            }}
                          >
                            {label}
                          </div>
                          <div
                            style={{
                              ...numberStyle,
                              fontSize: 15,
                              fontWeight: 700,
                              color: color || "#f8fafc",
                            }}
                          >
                            {value}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* NAV details */}
                <div
                  style={{
                    backgroundColor: "#0f172a",
                    border: "1px solid rgba(255,255,255,0.08)",
                    borderRadius: "0.75rem",
                    padding: "1rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div
                    style={{
                      fontSize: 12,
                      fontWeight: 600,
                      color: "#64748b",
                      marginBottom: "0.75rem",
                    }}
                  >
                    NAV DETAILS
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 3,
                        }}
                      >
                        Current NAV
                      </div>
                      <div
                        style={{
                          ...numberStyle,
                          fontSize: 18,
                          fontWeight: 700,
                          color: "#f97316",
                        }}
                      >
                        ₹
                        {(
                          mfDrawerData?.currentNav ||
                          mfDrawerData?.holding?.currentPrice ||
                          0
                        ).toFixed(4)}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 3,
                        }}
                      >
                        Buy NAV
                      </div>
                      <div
                        style={{
                          ...numberStyle,
                          fontSize: 16,
                          fontWeight: 600,
                          color: "#f8fafc",
                        }}
                      >
                        ₹{mfDrawerData.holding?.buyPrice ?? "—"}
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 3,
                        }}
                      >
                        NAV Growth
                      </div>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: pnlColor(
                            mfDrawerData.holding?.pnlPercent ?? 0,
                          ),
                        }}
                      >
                        {(mfDrawerData.holding?.pnlPercent ?? 0).toFixed(2)}%
                      </div>
                    </div>
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#64748b",
                          marginBottom: 3,
                        }}
                      >
                        Since
                      </div>
                      <div style={{ fontSize: 13, color: "#94a3b8" }}>
                        {mfDrawerData.holding?.buyDate ?? "—"}
                      </div>
                    </div>
                  </div>
                </div>

                {/* NAV History sparkline */}
                {mfDrawerData?.navHistory && mfDrawerData.navHistory.length > 0
                  ? (() => {
                      const allZero = mfDrawerData.navHistory.every(
                        (p) => parseFloat(p.nav) === 0,
                      );
                      if (allZero || (mfDrawerData.currentNav || 0) === 0) {
                        return (
                          <div
                            style={{
                              padding: "1rem",
                              borderRadius: "0.85rem",
                              background: "rgba(239,68,68,0.06)",
                              border: "1px solid rgba(239,68,68,0.15)",
                              textAlign: "center",
                              marginBottom: "1rem",
                            }}
                          >
                            <p style={{ margin: 0, fontSize: "1.2rem" }}>⚠️</p>
                            <p
                              style={{
                                margin: "0.5rem 0 0",
                                color: "#f87171",
                                fontSize: "0.85rem",
                                fontWeight: 600,
                              }}
                            >
                              Fund Inactive / Matured
                            </p>
                            <p
                              style={{
                                margin: "0.3rem 0 0",
                                color: "#64748b",
                                fontSize: "0.75rem",
                              }}
                            >
                              This fund has no active NAV data. It may be
                              closed, matured, or merged into another scheme.
                            </p>
                          </div>
                        );
                      }

                      const hist = mfDrawerData.navHistory.slice(-30);
                      const navs = hist.map((h) => h.nav);
                      const minNav = Math.min(...navs);
                      const maxNav = Math.max(...navs);
                      const range = maxNav - minNav || 1;
                      return (
                        <div
                          style={{
                            backgroundColor: "#0f172a",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: "0.75rem",
                            padding: "1rem",
                            marginBottom: "1rem",
                          }}
                        >
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 600,
                              color: "#64748b",
                              marginBottom: "0.75rem",
                            }}
                          >
                            NAV HISTORY (30 days)
                          </div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "flex-end",
                              gap: 2,
                              height: 48,
                            }}
                          >
                            {hist.map((h, i) => {
                              const heightPct =
                                ((h.nav - minNav) / range) * 80 + 20;
                              const isLast = i === hist.length - 1;
                              return (
                                <div
                                  key={i}
                                  title={`${h.date}: ₹${h.nav}`}
                                  style={{
                                    flex: 1,
                                    height: `${heightPct}%`,
                                    backgroundColor: isLast
                                      ? "#f97316"
                                      : "rgba(139,92,246,0.5)",
                                    borderRadius: "2px 2px 0 0",
                                    transition: "height 0.2s",
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()
                  : null}

                {/* Historical returns */}
                {mfDrawerData?.returns &&
                  Object.keys(mfDrawerData.returns).length > 0 &&
                  Object.values(mfDrawerData.returns).some((v) => v !== 0) && (
                    <div
                      style={{
                        backgroundColor: "#0f172a",
                        border: "1px solid rgba(255,255,255,0.08)",
                        borderRadius: "0.75rem",
                        padding: "1rem",
                      }}
                    >
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#64748b",
                          marginBottom: "0.75rem",
                        }}
                      >
                        HISTORICAL RETURNS
                      </div>
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(4,1fr)",
                          gap: "0.5rem",
                        }}
                      >
                        {["1W", "1M", "3M", "1Y"].map((period) => {
                          const val = mfDrawerData.returns[period] ?? null;
                          return (
                            <div
                              key={period}
                              style={{
                                backgroundColor: "rgba(255,255,255,0.04)",
                                borderRadius: "0.5rem",
                                padding: "0.6rem",
                                textAlign: "center",
                              }}
                            >
                              <div
                                style={{
                                  fontSize: 11,
                                  color: "#64748b",
                                  marginBottom: 4,
                                }}
                              >
                                {period}
                              </div>
                              <div
                                style={{
                                  fontSize: 14,
                                  fontWeight: 700,
                                  color:
                                    val == null ? "#475569" : pnlColor(val),
                                }}
                              >
                                {val == null
                                  ? "—"
                                  : `${val >= 0 ? "+" : ""}${val.toFixed(2)}%`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
