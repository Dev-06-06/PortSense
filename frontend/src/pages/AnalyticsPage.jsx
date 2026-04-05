import { useEffect, useMemo, useState } from "react";
import {
  Cell,
  Pie,
  PieChart,
  Tooltip,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
} from "recharts";
import api from "../services/api";

const SLICE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#ef4444",
  "#f59e0b",
  "#06b6d4",
];

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "1.25rem 1rem 2rem",
};

const containerStyle = {
  width: "100%",
  maxWidth: "52rem",
  margin: "0 auto",
  display: "grid",
  gap: "1rem",
};

const cardStyle = {
  borderRadius: "1rem",
  border: "1px solid rgba(255, 255, 255, 0.1)",
  backgroundColor: "rgba(15, 23, 42, 0.6)",
  backdropFilter: "blur(8px)",
  padding: "1.25rem",
};

const sectionTitleStyle = {
  margin: "0 0 0.75rem",
  fontSize: "1.1rem",
  fontWeight: 700,
  color: "#f8fafc",
};

const labelStyle = {
  margin: 0,
  fontSize: "0.8rem",
  color: "#94a3b8",
  marginBottom: "0.25rem",
};

const numberStyle = {
  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
  letterSpacing: "0.02em",
};

const bigNumberStyle = {
  ...numberStyle,
  fontSize: "2.2rem",
  fontWeight: 700,
  margin: "0 0 0.15rem",
  color: "#f97316",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: "0.82rem",
};

const thStyle = {
  textAlign: "left",
  padding: "0.5rem 0.4rem",
  color: "#94a3b8",
  fontWeight: 600,
  borderBottom: "1px solid rgba(255,255,255,0.08)",
};

const tdStyle = {
  padding: "0.6rem 0.4rem",
  color: "#e2e8f0",
  borderBottom: "1px solid rgba(255,255,255,0.05)",
};

const tabs = ["Overview", "Beta / Diversification", "Benchmark", "Risk", "Correlation"];

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatPercent = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.00%";
  return `${numeric.toFixed(2)}%`;
};

const parseAdvice = (text) => {
  const wellMatch = text.match(
    /\*\*What You Did Well[:\*]*\*?\*?([\s\S]*?)(?=\*\*Key Risks|\*\*Rebalancing|$)/i,
  );
  const risksMatch = text.match(
    /\*\*Key Risks[:\*]*\*?\*?([\s\S]*?)(?=\*\*Rebalancing|$)/i,
  );
  const stepsMatch = text.match(
    /\*\*Rebalancing Steps[:\*]*\*?\*?([\s\S]*?)$/i,
  );
  return {
    well: wellMatch?.[1]?.trim() || "",
    risks: risksMatch?.[1]?.trim() || "",
    steps: stepsMatch?.[1]?.trim() || "",
  };
};

const AnalyticsPage = () => {
  // STATE
  const [sectors, setSectors] = useState([]);
  const [beta, setBeta] = useState(null);
  const [diversification, setDiversification] = useState(null);
  const [benchmark, setBenchmark] = useState(null);
  const [loadingSectors, setLoadingSectors] = useState(true);
  const [loadingBeta, setLoadingBeta] = useState(true);
  const [loadingDiv, setLoadingDiv] = useState(true);
  const [loadingBench, setLoadingBench] = useState(true);
  const [stressData, setStressData] = useState(null);
  const [loadingStress, setLoadingStress] = useState(false);
  const [stressAnalysed, setStressAnalysed] = useState(false);
  const [customShock, setCustomShock] = useState("");
  const [runningCustom, setRunningCustom] = useState(false);
  const [customResult, setCustomResult] = useState(null);
  const [riskData, setRiskData] = useState(null);
  const [loadingRisk, setLoadingRisk] = useState(true);
  const [error, setError] = useState(null);
  const [adviceText, setAdviceText] = useState("");
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [activeTab, setActiveTab] = useState("Overview");
  const [corrMatrixData, setCorrMatrixData] = useState({ tickers: [], matrix: [] });
  const [corrLoading, setCorrLoading] = useState(false);
  const [corrError, setCorrError] = useState("");
  const [corrFetched, setCorrFetched] = useState(false);
  const [expandedPair, setExpandedPair] = useState(null);
  const [explanations, setExplanations] = useState({});
  const [loadingPair, setLoadingPair] = useState(null);

  // Parse advice text
  const parsedAdvice = useMemo(() => parseAdvice(adviceText), [adviceText]);

  // Fetch rebalancing advice
  const onGetAdvice = async () => {
    setAdviceLoading(true);
    setAdviceError("");
    try {
      const res = await api.post("/api/genai/rebalance");
      const text = res?.data?.advice;
      setAdviceText(typeof text === "string" ? text.trim() : "");
    } catch {
      setAdviceError("Unable to generate rebalancing advice right now.");
      setAdviceText("");
    } finally {
      setAdviceLoading(false);
    }
  };

  const onAnalyseStress = async () => {
    setLoadingStress(true);
    setStressAnalysed(false);
    setCustomResult(null);
    try {
      const res = await api.get("/api/analytics/stress-test");
      setStressData(res.data);
      setStressAnalysed(true);
    } catch {
      setStressData(null);
    } finally {
      setLoadingStress(false);
    }
  };

  const onRunCustomStress = async () => {
    const raw = parseFloat(customShock);
    if (!raw || raw >= 0 || raw < -99) return;
    setRunningCustom(true);
    setCustomResult(null);
    try {
      const res = await api.get(
        `/api/analytics/stress-test?custom_shock=${raw / 100}`,
      );
      const customScenario = (res.data?.scenarios || []).find(
        (s) => s.id === "custom",
      );
      setCustomResult(customScenario || null);
    } catch {
      // silent fail
    } finally {
      setRunningCustom(false);
    }
  };

  // CORRELATION HELPER FUNCTIONS
  const sanitizeTicker = (ticker) => String(ticker || '').replace(/\.NS$/i, '').trim()

  const toNumber = (value) => {
    const numeric = Number(value)
    return Number.isFinite(numeric) ? numeric : 0
  }

  const normalizeCorrelationPayload = (payload) => {
    const matrixSource = payload?.matrix || payload?.correlationMatrix || payload?.correlations || payload || {}
    const payloadTickers = Array.isArray(payload?.tickers)
      ? payload.tickers
      : Array.isArray(payload?.symbols)
        ? payload.symbols
        : []
    if (Array.isArray(matrixSource)) {
      const tickers = payloadTickers.map(sanitizeTicker)
      const matrix = matrixSource.map((row, rowIndex) =>
        (Array.isArray(row) ? row : []).map((value, columnIndex) => {
          if (rowIndex === columnIndex) return 1
          return toNumber(value)
        }),
      )
      return { tickers, matrix }
    }
    const objectMatrix = typeof matrixSource === 'object' && matrixSource !== null ? matrixSource : {}
    const rawTickers = payloadTickers.length > 0 ? payloadTickers : Object.keys(objectMatrix)
    const tickers = rawTickers.map(sanitizeTicker)
    const matrix = tickers.map((rowTicker, rowIndex) =>
      tickers.map((columnTicker, columnIndex) => {
        if (rowIndex === columnIndex) return 1
        const rowKey = rawTickers[rowIndex]
        const columnKey = rawTickers[columnIndex]
        const fromExact = objectMatrix?.[rowKey]?.[columnKey]
        const fromSanitized = objectMatrix?.[rowTicker]?.[columnTicker]
        const reverseExact = objectMatrix?.[columnKey]?.[rowKey]
        const reverseSanitized = objectMatrix?.[columnTicker]?.[rowTicker]
        return toNumber(fromExact ?? fromSanitized ?? reverseExact ?? reverseSanitized)
      }),
    )
    return { tickers, matrix }
  }

  const getCellVisual = (value, isDiagonal) => {
    if (isDiagonal) return { background: '#f97316', color: '#111827' }
    if (value > 0.7) return { background: '#16a34a', color: '#f8fafc' }
    if (value >= 0.3 && value <= 0.7) return { background: '#4ade80', color: '#111827' }
    if (value >= -0.3 && value <= 0.3) return { background: '#334155', color: '#e2e8f0' }
    if (value >= -0.7 && value < -0.3) return { background: '#f87171', color: '#111827' }
    return { background: '#dc2626', color: '#f8fafc' }
  }

  const getStrengthLabel = (value) => {
    const absValue = Math.abs(value)
    if (absValue < 0.3) return 'Weak'
    if (absValue < 0.7) return value >= 0 ? 'Moderate Positive' : 'Moderate Negative'
    return value >= 0 ? 'Strong Positive' : 'Strong Negative'
  }

  const getPairBorderColor = (value) => {
    const absValue = Math.abs(value)
    if (absValue < 0.3) return '#64748b'
    return value >= 0 ? '#16a34a' : '#dc2626'
  }

  const corrTopPairs = useMemo(() => {
    const pairs = []
    const { tickers, matrix } = corrMatrixData
    for (let r = 0; r < tickers.length; r++) {
      for (let c = r + 1; c < tickers.length; c++) {
        const value = toNumber(matrix?.[r]?.[c])
        pairs.push({
          ticker1: tickers[r],
          ticker2: tickers[c],
          correlation: Number(value.toFixed(2)),
          absCorrelation: Math.abs(value),
        })
      }
    }
    return pairs.sort((a, b) => b.absCorrelation - a.absCorrelation).slice(0, 5)
  }, [corrMatrixData])

  const fetchCorrelation = async () => {
    setCorrLoading(true)
    setCorrError("")
    try {
      const res = await api.get('/api/analytics/correlation')
      setCorrMatrixData(normalizeCorrelationPayload(res?.data))
      setCorrFetched(true)
    } catch {
      setCorrError('Unable to load correlation data.')
    } finally {
      setCorrLoading(false)
    }
  }

  const handleCorrExplain = async (pair) => {
    const key = `${pair.ticker1}-${pair.ticker2}`
    if (expandedPair === key) { setExpandedPair(null); return }
    if (explanations[key]) { setExpandedPair(key); return }
    setLoadingPair(key)
    try {
      const res = await api.post('/api/genai/explain-correlation', {
        ticker1: pair.ticker1,
        ticker2: pair.ticker2,
        correlation: pair.correlation,
        strength: getStrengthLabel(pair.correlation),
      })
      setExplanations(prev => ({ ...prev, [key]: res.data.explanation }))
      setExpandedPair(key)
    } catch {
      setExplanations(prev => ({ ...prev, [key]: 'Unable to load explanation.' }))
      setExpandedPair(key)
    } finally {
      setLoadingPair(null)
    }
  }

  // Initial fetch - all endpoints in parallel
  useEffect(() => {
    document.title = "Analytics | PortSense";
    const controller = new AbortController();

    const fetchAll = async () => {
      try {
        const [sectorsRes, betaRes, divRes, benchRes, riskRes] =
          await Promise.allSettled([
            api
              .get("/api/analytics/sectors", { signal: controller.signal })
              .finally(() => {
                if (!controller.signal.aborted) setLoadingSectors(false);
              }),
            api
              .get("/api/analytics/beta", { signal: controller.signal })
              .finally(() => {
                if (!controller.signal.aborted) setLoadingBeta(false);
              }),
            api
              .get("/api/analytics/diversification", {
                signal: controller.signal,
              })
              .finally(() => {
                if (!controller.signal.aborted) setLoadingDiv(false);
              }),
            api
              .get("/api/analytics/benchmark", { signal: controller.signal })
              .finally(() => {
                if (!controller.signal.aborted) setLoadingBench(false);
              }),
            api
              .get("/api/analytics/risk-decomposition", {
                signal: controller.signal,
              })
              .finally(() => {
                if (!controller.signal.aborted) setLoadingRisk(false);
              }),
          ]);

        if (controller.signal.aborted) return;

        if (sectorsRes.status === "fulfilled") {
          setSectors(sectorsRes.value.data.sectors || []);
        }
        if (betaRes.status === "fulfilled") {
          setBeta(betaRes.value.data);
        }
        if (divRes.status === "fulfilled") {
          setDiversification(divRes.value.data);
        }
        if (benchRes.status === "fulfilled") {
          setBenchmark(benchRes.value.data);
        }
        if (riskRes.status === "fulfilled") setRiskData(riskRes.value.data);
      } catch (err) {
        if (
          err?.name === "AbortError" ||
          err?.name === "CanceledError" ||
          err?.code === "ERR_CANCELED"
        )
          return;
        setError("Failed to load analytics");
      }
    };
    fetchAll();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (activeTab === "Correlation" && !corrFetched) {
      fetchCorrelation()
    }
  }, [activeTab])

  return (
    <div style={shellStyle}>
      <style>{`
        .analytics-spin { animation: analytics-spin 0.9s linear infinite; }
        .correlation-spin { animation: analytics-spin 0.9s linear infinite; }
        @keyframes analytics-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={containerStyle}>
        <div>
          <h1
            style={{
              margin: "0 0 0.3rem",
              fontSize: "1.55rem",
              fontWeight: 800,
              color: "#f8fafc",
            }}
          >
            Portfolio Analytics
          </h1>
          <p
            style={{
              margin: 0,
              color: "#94a3b8",
              fontSize: "0.9rem",
            }}
          >
            Track allocation, benchmark performance, and portfolio risk.
          </p>
        </div>

        <div
          style={{
            position: "sticky",
            top: 0,
            zIndex: 10,
            background: "#0d1117",
            borderBottom: "1px solid #1e293b",
            display: "flex",
            gap: "8px",
            padding: "10px 16px",
            overflowX: "auto",
          }}
        >
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              style={{
                background: activeTab === tab ? "#f97316" : "#1e293b",
                color: activeTab === tab ? "white" : "#94a3b8",
                borderRadius: "20px",
                padding: "6px 18px",
                fontSize: "13px",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        {activeTab === "Overview" && (
          <>
            {/* ========== 1. SECTOR BREAKDOWN ========== */}
            {sectors && (
              <div style={cardStyle}>
                <h2 style={sectionTitleStyle}>Sector Breakdown</h2>

                {loadingSectors ? (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      justifyContent: "center",
                      padding: "2rem 0",
                    }}
                  >
                    <div
                      className="analytics-spin"
                      style={{
                        width: "1.5rem",
                        height: "1.5rem",
                        borderRadius: "999px",
                        border: "3px solid #475569",
                        borderTopColor: "#f97316",
                      }}
                    />
                    <p
                      style={{
                        margin: 0,
                        color: "#94a3b8",
                        fontSize: "0.88rem",
                      }}
                    >
                      Loading sectors...
                    </p>
                  </div>
                ) : error ? (
                  <p
                    style={{ margin: 0, color: "#f87171", fontSize: "0.88rem" }}
                  >
                    {error}
                  </p>
                ) : sectors.length === 0 ? (
                  <div style={{ textAlign: "center", padding: "2rem 0" }}>
                    <p
                      style={{
                        margin: 0,
                        color: "#94a3b8",
                        fontSize: "0.88rem",
                      }}
                    >
                      Add stocks from the Dashboard to see sector breakdown.
                    </p>
                  </div>
                ) : (
                  <>
                    {/* Pie Chart */}
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: "1rem",
                      }}
                    >
                      <PieChart width={300} height={300}>
                        <Pie
                          data={sectors.map((s) => ({
                            name: s.name || s.sector,
                            value: s.weight || s.percentage,
                          }))}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          labelLine={false}
                          label={({ name, percent }) =>
                            `${name} ${(percent * 100).toFixed(1)}%`
                          }
                        >
                          {sectors.map((_, index) => (
                            <Cell
                              key={`cell-${index}`}
                              fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value) => [
                            `${Number(value).toFixed(2)}%`,
                            "Weight",
                          ]}
                          contentStyle={{
                            border: "1px solid rgba(255,255,255,0.12)",
                            borderRadius: "0.65rem",
                            backgroundColor: "#111827",
                            color: "#f8fafc",
                          }}
                        />
                      </PieChart>
                    </div>

                    {/* Concentration Warnings */}
                    {sectors.filter((s) => s.isOverweight).length > 0 && (
                      <div
                        style={{
                          marginTop: "1rem",
                          display: "grid",
                          gap: "0.5rem",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.75rem",
                            color: "#94a3b8",
                            fontWeight: 700,
                          }}
                        >
                          CONCENTRATION WARNING
                        </p>
                        {sectors
                          .filter((s) => s.isOverweight)
                          .map((s, idx) => (
                            <div
                              key={idx}
                              style={{
                                borderRadius: "0.75rem",
                                border: "1px solid rgba(249,115,22,0.4)",
                                backgroundColor: "rgba(249,115,22,0.1)",
                                padding: "0.75rem",
                              }}
                            >
                              <p
                                style={{
                                  margin: 0,
                                  fontSize: "0.75rem",
                                  color: "#fdba74",
                                }}
                              >
                                ⚠️ {s.name || s.sector} is{" "}
                                {Number(s.weight || s.percentage).toFixed(2)}%
                                of portfolio
                              </p>
                            </div>
                          ))}
                      </div>
                    )}

                    {/* Sector Table */}
                    <div style={{ overflowX: "auto", marginTop: "1rem" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Sector</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>
                              Weight %
                            </th>
                            <th style={{ ...thStyle, textAlign: "right" }}>
                              Value ₹
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {sectors.map((s, idx) => (
                            <tr key={idx}>
                              <td style={{ ...tdStyle, color: "#f8fafc" }}>
                                {s.name || s.sector}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>
                                {Number(s.weight || s.percentage).toFixed(2)}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>
                                {formatCurrency(s.value || 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {activeTab === "Beta / Diversification" && (
          <>
            {/* ========== 2. BETA ANALYSIS ========== */}
            {beta && (
              <div style={cardStyle}>
                <h2 style={sectionTitleStyle}>Beta Analysis</h2>

                {loadingBeta ? (
                  <p
                    style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}
                  >
                    Loading beta...
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "0.5rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <p style={{ ...bigNumberStyle, color: "#f8fafc" }}>
                        {Number(beta.portfolioBeta || 0).toFixed(2)}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.88rem",
                          color: "#f97316",
                        }}
                      >
                        Portfolio Beta
                      </p>
                    </div>

                    <div style={{ overflowX: "auto" }}>
                      <table style={tableStyle}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Ticker</th>
                            <th style={{ ...thStyle, textAlign: "right" }}>
                              Beta
                            </th>
                            <th style={{ ...thStyle, textAlign: "right" }}>
                              Weight %
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {(beta.perStock || []).map((stock, idx) => (
                            <tr key={idx}>
                              <td style={{ ...tdStyle, color: "#f8fafc" }}>
                                {stock.ticker}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>
                                {Number(stock.beta || 0).toFixed(2)}
                              </td>
                              <td style={{ ...tdStyle, textAlign: "right" }}>
                                {Number(stock.weight || 0).toFixed(2)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ========== 3. DIVERSIFICATION SCORE ========== */}
            {diversification && (
              <div style={cardStyle}>
                <h2 style={sectionTitleStyle}>Diversification Score</h2>

                {loadingDiv ? (
                  <p
                    style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}
                  >
                    Loading diversification...
                  </p>
                ) : (
                  <>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        gap: "0.5rem",
                        marginBottom: "1rem",
                      }}
                    >
                      <p style={bigNumberStyle}>
                        {Number(diversification.score || 0).toFixed(1)}
                      </p>
                      <p
                        style={{
                          margin: 0,
                          fontSize: "0.88rem",
                          color: "#94a3b8",
                        }}
                      >
                        /10
                      </p>
                    </div>
                    <p
                      style={{
                        margin: "0 0 1rem",
                        fontSize: "0.88rem",
                        color: "#cbd5e1",
                      }}
                    >
                      {diversification.verdict || "Moderate"}
                    </p>

                    {/* Sub-score progress bars */}
                    <div style={{ display: "grid", gap: "0.75rem" }}>
                      {/* Sector Score */}
                      <div>
                        <p style={labelStyle}>
                          Sector Score:{" "}
                          {Number(diversification.sectorScore || 0).toFixed(1)}
                          /10
                        </p>
                        <div
                          style={{
                            height: "6px",
                            backgroundColor: "#1e293b",
                            borderRadius: "999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: "999px",
                              width: `${Math.min(100, ((Number(diversification.sectorScore) || 0) / 10) * 100)}%`,
                              backgroundColor: "#f97316",
                            }}
                          />
                        </div>
                      </div>

                      {/* Size Score */}
                      <div>
                        <p style={labelStyle}>
                          Size Score:{" "}
                          {Number(diversification.sizeScore || 0).toFixed(1)}/10
                        </p>
                        <div
                          style={{
                            height: "6px",
                            backgroundColor: "#1e293b",
                            borderRadius: "999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: "999px",
                              width: `${Math.min(100, ((Number(diversification.sizeScore) || 0) / 10) * 100)}%`,
                              backgroundColor: "#f97316",
                            }}
                          />
                        </div>
                      </div>

                      {/* Correlation Score */}
                      <div>
                        <p style={labelStyle}>
                          Correlation Score:{" "}
                          {Number(
                            diversification.correlationScore || 0,
                          ).toFixed(1)}
                          /10
                        </p>
                        <div
                          style={{
                            height: "6px",
                            backgroundColor: "#1e293b",
                            borderRadius: "999px",
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              height: "100%",
                              borderRadius: "999px",
                              width: `${Math.min(100, ((Number(diversification.correlationScore) || 0) / 10) * 100)}%`,
                              backgroundColor: "#f97316",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}

        {/* ========== 4. BENCHMARK VS NIFTY 50 ========== */}
        {activeTab === "Benchmark" && benchmark && (
          <div style={cardStyle}>
            <h2 style={sectionTitleStyle}>Benchmark vs Nifty 50</h2>

            {loadingBench ? (
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
                Loading benchmark...
              </p>
            ) : benchmark.timeSeries && benchmark.timeSeries.length > 0 ? (
              <div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={benchmark.timeSeries}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      stroke="#475569"
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: "#94a3b8" }}
                      stroke="#475569"
                      domain={["auto", "auto"]}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "#1e293b",
                        border: "1px solid #475569",
                        borderRadius: "0.5rem",
                        padding: "0.75rem",
                      }}
                      labelStyle={{ color: "#cbd5e1", fontSize: "0.85rem" }}
                      formatter={(v) => `${v.toFixed(1)}`}
                      itemStyle={{ color: "#e2e8f0", fontSize: "0.85rem" }}
                    />
                    <Legend
                      wrapperStyle={{ paddingTop: "1rem" }}
                      iconType="line"
                      textStyle={{ color: "#94a3b8", fontSize: "0.85rem" }}
                    />
                    <Line
                      type="monotone"
                      dataKey="portfolio"
                      stroke="#f97316"
                      dot={false}
                      name="Your Portfolio"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="nifty"
                      stroke="#60a5fa"
                      dot={false}
                      name="Nifty 50"
                      strokeWidth={2}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
                Benchmark comparison unavailable
              </p>
            )}
          </div>
        )}

        {/* ========== 5. STRESS TEST ========== */}
        {activeTab === "Risk" && (
          <>
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 0.25rem",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                Stress Test
              </h2>
              <p
                style={{
                  margin: "0 0 1rem",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                }}
              >
                See your estimated portfolio impact under market crash scenarios
              </p>

              {!stressAnalysed && !loadingStress && (
                <button
                  type="button"
                  onClick={onAnalyseStress}
                  style={{
                    width: "100%",
                    border: "none",
                    borderRadius: "0.85rem",
                    backgroundColor: "#f97316",
                    color: "#ffffff",
                    padding: "0.85rem 1rem",
                    fontWeight: 900,
                    letterSpacing: "0.12em",
                    textTransform: "uppercase",
                    cursor: "pointer",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "0.9rem",
                  }}
                >
                  Analyse Scenarios
                </button>
              )}

              {loadingStress && (
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
                  Running scenarios...
                </p>
              )}

              {stressAnalysed && stressData && (
                <>
                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    {(stressData?.scenarios || [])
                      .filter((s) => s.id !== "custom")
                      .map((scenario) => {
                        const isLoss = scenario.total_portfolio_loss < 0;
                        return (
                          <div
                            key={scenario.id}
                            style={{
                              borderRadius: "0.75rem",
                              border: "1px solid rgba(255,255,255,0.1)",
                              backgroundColor: "rgba(30,41,59,0.3)",
                              padding: "0.75rem",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "space-between",
                                gap: "0.75rem",
                              }}
                            >
                              <div>
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "0.95rem",
                                    fontWeight: 700,
                                    color: "#f8fafc",
                                  }}
                                >
                                  {scenario.name}
                                </p>
                                <p
                                  style={{
                                    margin: "0.2rem 0 0",
                                    fontSize: "0.8rem",
                                    color: "#94a3b8",
                                  }}
                                >
                                  {scenario.description}
                                </p>
                              </div>

                              <div style={{ textAlign: "right" }}>
                                <p
                                  style={{
                                    margin: 0,
                                    fontSize: "1rem",
                                    fontWeight: 700,
                                    color: isLoss ? "#f87171" : "#4ade80",
                                  }}
                                >
                                  {scenario.total_portfolio_loss_pct > 0
                                    ? "+"
                                    : ""}
                                  {scenario.total_portfolio_loss_pct}%
                                </p>
                                <p
                                  style={{
                                    margin: "0.2rem 0 0",
                                    fontSize: "0.82rem",
                                    color: "#cbd5e1",
                                  }}
                                >
                                  ₹
                                  {Math.abs(
                                    scenario.total_portfolio_loss,
                                  ).toLocaleString("en-IN", {
                                    maximumFractionDigits: 0,
                                  })}
                                </p>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div
                    style={{
                      marginTop: "1rem",
                      borderRadius: "0.85rem",
                      border: "1px solid rgba(255,255,255,0.12)",
                      backgroundColor: "rgba(15,23,42,0.45)",
                      padding: "0.85rem",
                      display: "grid",
                      gap: "0.75rem",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.75rem",
                        color: "#94a3b8",
                        letterSpacing: "0.1em",
                        fontWeight: 700,
                      }}
                    >
                      CUSTOM SCENARIO
                    </p>

                    <p
                      style={{
                        margin: 0,
                        fontSize: "0.82rem",
                        color: "#cbd5e1",
                      }}
                    >
                      Enter a negative number (e.g. -25 means market falls 25%)
                    </p>

                    <div style={{ display: "grid", gap: "0.6rem" }}>
                      <input
                        type="number"
                        inputMode="decimal"
                        step="0.1"
                        min="-99"
                        max="-0.1"
                        placeholder="-25"
                        value={customShock}
                        onChange={(e) => setCustomShock(e.target.value)}
                        style={{
                          width: "100%",
                          backgroundColor: "#0f172a",
                          border: "1px solid rgba(255,255,255,0.15)",
                          borderRadius: "0.75rem",
                          padding: "0.7rem 0.85rem",
                          color: "#e5e7eb",
                          fontSize: "1rem",
                          boxSizing: "border-box",
                        }}
                      />
                      <button
                        type="button"
                        onClick={onRunCustomStress}
                        disabled={
                          runningCustom ||
                          !customShock ||
                          parseFloat(customShock) >= 0
                        }
                        style={{
                          width: "100%",
                          border: "none",
                          borderRadius: "0.75rem",
                          backgroundColor: runningCustom
                            ? "#ea580c"
                            : "#f97316",
                          color: "#fff",
                          padding: "0.7rem 1rem",
                          fontWeight: 700,
                          cursor:
                            runningCustom ||
                            !customShock ||
                            parseFloat(customShock) >= 0
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            runningCustom ||
                            !customShock ||
                            parseFloat(customShock) >= 0
                              ? 0.6
                              : 1,
                          fontSize: "0.9rem",
                        }}
                      >
                        {runningCustom
                          ? "Calculating..."
                          : "Run Custom Scenario"}
                      </button>
                    </div>

                    {customResult && (
                      <div
                        style={{
                          borderRadius: "0.75rem",
                          border: "1px solid rgba(255,255,255,0.1)",
                          backgroundColor: "rgba(30,41,59,0.3)",
                          padding: "0.75rem",
                          display: "grid",
                          gap: "0.25rem",
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.95rem",
                            fontWeight: 700,
                            color: "#f8fafc",
                          }}
                        >
                          {customResult.name}
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "1rem",
                            fontWeight: 700,
                            color: "#f87171",
                          }}
                        >
                          {customResult.total_portfolio_loss_pct}%
                        </p>
                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.82rem",
                            color: "#cbd5e1",
                          }}
                        >
                          Estimated loss: ₹
                          {Math.abs(
                            customResult.total_portfolio_loss,
                          ).toLocaleString("en-IN", {
                            maximumFractionDigits: 0,
                          })}
                        </p>
                      </div>
                    )}
                  </div>

                  <div style={{ marginTop: "1rem" }}>
                    <button
                      type="button"
                      onClick={onAnalyseStress}
                      style={{
                        width: "100%",
                        border: "none",
                        borderRadius: "0.85rem",
                        backgroundColor: "#f97316",
                        color: "#ffffff",
                        padding: "0.85rem 1rem",
                        fontWeight: 900,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        cursor: "pointer",
                        fontFamily: "'DM Sans', sans-serif",
                        fontSize: "0.9rem",
                      }}
                    >
                      Refresh
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* ========== 6. RISK DECOMPOSITION ========== */}
            <div style={cardStyle}>
              <h2
                style={{
                  margin: "0 0 0.25rem",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  color: "#f8fafc",
                }}
              >
                Portfolio Risk Decomposition
              </h2>
              <p
                style={{
                  margin: "0 0 1rem",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                }}
              >
                What is driving your portfolio's volatility?
              </p>

              {loadingRisk ? (
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
                  Calculating risk components...
                </p>
              ) : !riskData || riskData.systematic_pct === null ? (
                <div
                  style={{
                    borderRadius: "0.75rem",
                    border: "1px solid rgba(248,113,113,0.35)",
                    backgroundColor: "rgba(127,29,29,0.2)",
                    padding: "0.85rem",
                  }}
                >
                  <p
                    style={{ margin: 0, color: "#fca5a5", fontSize: "0.88rem" }}
                  >
                    {riskData?.verdict ||
                      "Risk decomposition is unavailable right now."}
                  </p>
                </div>
              ) : (
                <>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "0.75rem",
                      marginBottom: "0.85rem",
                    }}
                  >
                    <div
                      style={{
                        borderRadius: "0.75rem",
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(30,41,59,0.3)",
                        padding: "0.75rem",
                      }}
                    >
                      <p style={labelStyle}>Portfolio Volatility</p>
                      <p
                        style={{
                          ...numberStyle,
                          margin: 0,
                          fontSize: "1.55rem",
                          fontWeight: 700,
                          color: "#f97316",
                        }}
                      >
                        {formatPercent(riskData.portfolio_vol_pct || 0)}
                      </p>
                    </div>
                    <div
                      style={{
                        borderRadius: "0.75rem",
                        border: "1px solid rgba(255,255,255,0.1)",
                        backgroundColor: "rgba(30,41,59,0.3)",
                        padding: "0.75rem",
                      }}
                    >
                      <p style={labelStyle}>Systematic Risk</p>
                      <p
                        style={{
                          ...numberStyle,
                          margin: 0,
                          fontSize: "1.55rem",
                          fontWeight: 700,
                          color: "#60a5fa",
                        }}
                      >
                        {formatPercent(riskData.systematic_pct || 0)}
                      </p>
                    </div>
                  </div>

                  <div style={{ display: "grid", gap: "0.75rem" }}>
                    <div>
                      <p style={labelStyle}>Systematic (Market)</p>
                      <div
                        style={{
                          height: "7px",
                          backgroundColor: "#1e293b",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: "999px",
                            width: `${Math.min(100, Number(riskData.systematic_pct) || 0)}%`,
                            backgroundColor: "#60a5fa",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <p style={labelStyle}>Sector Concentration</p>
                      <div
                        style={{
                          height: "7px",
                          backgroundColor: "#1e293b",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: "999px",
                            width: `${Math.min(100, Number(riskData.sector_concentration_pct) || 0)}%`,
                            backgroundColor: "#f59e0b",
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <p style={labelStyle}>Idiosyncratic (Stock-Specific)</p>
                      <div
                        style={{
                          height: "7px",
                          backgroundColor: "#1e293b",
                          borderRadius: "999px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            borderRadius: "999px",
                            width: `${Math.min(100, Number(riskData.idiosyncratic_pct) || 0)}%`,
                            backgroundColor: "#34d399",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  <div
                    style={{
                      marginTop: "0.85rem",
                      borderRadius: "0.75rem",
                      border: "1px solid rgba(56,189,248,0.35)",
                      backgroundColor: "rgba(14,116,144,0.15)",
                      padding: "0.8rem",
                    }}
                  >
                    <p
                      style={{
                        margin: 0,
                        color: "#bae6fd",
                        fontSize: "0.86rem",
                        lineHeight: 1.5,
                      }}
                    >
                      {riskData.verdict ||
                        "Risk decomposition calculated successfully."}
                    </p>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {/* ========== 7. REBALANCING ADVISOR ========== */}
        {activeTab === "Risk" && (
          <div
            style={{
              borderRadius: "1rem",
              border: "1px solid rgba(255,255,255,0.08)",
              backgroundColor: "rgba(15,23,42,0.6)",
              backdropFilter: "blur(8px)",
              padding: "1.25rem",
            }}
          >
            <h2
              style={{
                margin: "0 0 0.25rem",
                fontSize: "1.1rem",
                fontWeight: 700,
                color: "#f8fafc",
              }}
            >
              Rebalancing Advisor
            </h2>
            <p
              style={{
                margin: "0 0 1rem",
                color: "#94a3b8",
                fontSize: "0.85rem",
              }}
            >
              AI-powered advice grounded in your actual portfolio data
            </p>

            <button
              type="button"
              onClick={onGetAdvice}
              disabled={adviceLoading}
              style={{
                width: "100%",
                border: "none",
                borderRadius: "0.85rem",
                backgroundColor: adviceLoading ? "#ea580c" : "#f97316",
                color: "#ffffff",
                padding: "0.85rem 1rem",
                fontWeight: 900,
                letterSpacing: "0.12em",
                textTransform: "uppercase",
                cursor: adviceLoading ? "not-allowed" : "pointer",
                opacity: adviceLoading ? 0.85 : 1,
                fontFamily: "'DM Sans', sans-serif",
                fontSize: "0.9rem",
              }}
            >
              {adviceLoading ? "Analysing..." : "Get Rebalancing Advice"}
            </button>

            <p
              style={{
                margin: "0.5rem 0 0",
                color: "#6b7280",
                fontSize: "0.75rem",
              }}
            >
              This is AI-generated analysis, not financial advice
            </p>

            {adviceError && (
              <p
                style={{
                  margin: "0.75rem 0 0",
                  color: "#fca5a5",
                  fontSize: "0.875rem",
                }}
              >
                {adviceError}
              </p>
            )}

            {!adviceLoading && adviceText && (
              <div
                style={{
                  marginTop: "1rem",
                  borderRadius: "0.85rem",
                  border: "1px solid rgba(255,255,255,0.08)",
                  backgroundColor: "rgba(2,6,23,0.55)",
                  padding: "1rem",
                  display: "grid",
                  gap: "0.85rem",
                }}
              >
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#22c55e",
                    }}
                  >
                    What You Did Well
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "#ffffff",
                      fontSize: "0.95rem",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {parsedAdvice.well || "No details provided."}
                  </p>
                </div>
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#ef4444",
                    }}
                  >
                    Key Risks
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "#ffffff",
                      fontSize: "0.95rem",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {parsedAdvice.risks || "No details provided."}
                  </p>
                </div>
                <div style={{ display: "grid", gap: "0.3rem" }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: "1rem",
                      fontWeight: 700,
                      color: "#f97316",
                    }}
                  >
                    Rebalancing Steps
                  </h3>
                  <p
                    style={{
                      margin: 0,
                      color: "#ffffff",
                      fontSize: "0.95rem",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      fontFamily: "'DM Sans', sans-serif",
                    }}
                  >
                    {parsedAdvice.steps || "No details provided."}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === "Correlation" && (
          <>
            {/* Heatmap Card */}
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Correlation Heatmap</h2>
              <p style={{ margin: "0 0 1rem", color: "#94a3b8", fontSize: "0.85rem" }}>
                Pairwise stock correlation matrix for current holdings.
              </p>

              <button
                type="button"
                onClick={fetchCorrelation}
                style={{
                  background: "#1e293b", color: "#94a3b8",
                  borderRadius: "20px", padding: "6px 18px",
                  fontSize: "13px", fontWeight: 600,
                  border: "1px solid rgba(255,255,255,0.08)",
                  cursor: "pointer", marginBottom: "1rem",
                  fontFamily: "inherit",
                }}
                onMouseEnter={e => { e.currentTarget.style.background="#f97316"; e.currentTarget.style.color="white"; }}
                onMouseLeave={e => { e.currentTarget.style.background="#1e293b"; e.currentTarget.style.color="#94a3b8"; }}
              >
                ↻ Refresh
              </button>

              {corrLoading ? (
                <div style={{ minHeight: "200px", display: "grid", placeItems: "center" }}>
                  <div className="analytics-spin" style={{
                    width: "1.5rem", height: "1.5rem",
                    borderRadius: "999px",
                    border: "3px solid #475569",
                    borderTopColor: "#f97316",
                  }} />
                </div>
              ) : corrError ? (
                <p style={{ margin: 0, color: "#fca5a5" }}>{corrError}</p>
              ) : corrMatrixData.tickers.length === 0 ? (
                <p style={{ margin: 0, color: "#94a3b8" }}>No correlation data available.</p>
              ) : (
                <div style={{ overflowX: "auto", paddingBottom: "0.25rem" }}>
                  <table style={{ borderCollapse: "separate", borderSpacing: "6px", width: "max-content", minWidth: "400px" }}>
                    <thead>
                      <tr>
                        <th style={{ minWidth: "80px", padding: "0.45rem", color: "#cbd5e1", textAlign: "left", fontWeight: 600 }}>
                          Ticker
                        </th>
                        {corrMatrixData.tickers.map(ticker => (
                          <th key={`h-${ticker}`} style={{
                            minWidth: "56px", width: "56px",
                            padding: "0.25rem", color: "#cbd5e1",
                            textAlign: "center", fontWeight: 600,
                            fontSize: "0.75rem",
                          }}>
                            {ticker}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {corrMatrixData.tickers.map((rowTicker, rowIndex) => (
                        <tr key={`row-${rowTicker}`}>
                          <th style={{ minWidth: "80px", padding: "0.45rem", color: "#cbd5e1", textAlign: "left", fontWeight: 600, fontSize: "0.75rem" }}>
                            {rowTicker}
                          </th>
                          {corrMatrixData.tickers.map((colTicker, colIndex) => {
                            const isDiag = rowIndex === colIndex
                            const val = isDiag ? 1 : toNumber(corrMatrixData.matrix?.[rowIndex]?.[colIndex])
                            const visual = getCellVisual(val, isDiag)
                            return (
                              <td key={`cell-${rowTicker}-${colTicker}`} style={{
                                minWidth: "56px", width: "56px", height: "56px",
                                padding: "0.25rem", textAlign: "center",
                                verticalAlign: "middle", borderRadius: "0.5rem",
                                backgroundColor: visual.background,
                                color: visual.color,
                                fontSize: "0.85rem", fontWeight: 600,
                              }}>
                                {val.toFixed(2)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Top Correlated Pairs Card */}
            <div style={cardStyle}>
              <h2 style={sectionTitleStyle}>Top Correlated Pairs</h2>
              {corrLoading ? (
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>Calculating...</p>
              ) : corrTopPairs.length === 0 ? (
                <p style={{ margin: 0, color: "#94a3b8" }}>Not enough data to compute pairs.</p>
              ) : (
                <div style={{ display: "grid", gap: "0.5rem" }}>
                  {corrTopPairs.map(pair => {
                    const key = `${pair.ticker1}-${pair.ticker2}`
                    return (
                      <div key={key}>
                        <div style={{
                          borderRadius: "0.85rem",
                          border: `1px solid ${getPairBorderColor(pair.correlation)}`,
                          backgroundColor: "rgba(2,6,23,0.45)",
                          padding: "0.85rem 1rem",
                          display: "flex", flexWrap: "wrap",
                          gap: "0.75rem", alignItems: "center",
                          justifyContent: "space-between",
                        }}>
                          <p style={{ margin: 0, color: "#e2e8f0", fontWeight: 600 }}>
                            {pair.ticker1} ↔ {pair.ticker2}
                          </p>
                          <p style={{ margin: 0, color: "#cbd5e1", fontSize: "1.1rem", fontWeight: 600 }}>
                            {pair.correlation.toFixed(2)}
                          </p>
                          <p style={{ margin: 0, color: "#94a3b8" }}>
                            {getStrengthLabel(pair.correlation)}
                          </p>
                          <button
                            onClick={() => handleCorrExplain(pair)}
                            disabled={loadingPair === key}
                            style={{
                              border: "1px solid rgba(249,115,22,0.4)",
                              backgroundColor: "rgba(249,115,22,0.1)",
                              color: "#f97316",
                              borderRadius: "0.6rem",
                              padding: "0.35rem 0.85rem",
                              fontSize: "0.8rem", fontWeight: 700,
                              cursor: loadingPair === key ? "not-allowed" : "pointer",
                              opacity: loadingPair === key ? 0.6 : 1,
                            }}
                          >
                            {loadingPair === key ? "Loading..." : expandedPair === key ? "Hide" : "Explain"}
                          </button>
                        </div>
                        {expandedPair === key && explanations[key] && (
                          <div style={{
                            borderRadius: "0.75rem",
                            border: "1px solid rgba(255,255,255,0.07)",
                            backgroundColor: "rgba(2,6,23,0.6)",
                            padding: "0.85rem 1rem",
                            marginTop: "-0.25rem",
                          }}>
                            <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.85rem", lineHeight: 1.6 }}>
                              {explanations[key]}
                            </p>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AnalyticsPage;
