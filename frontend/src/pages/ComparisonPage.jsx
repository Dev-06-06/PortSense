import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "1.25rem 1rem 2rem",
};

const containerStyle = {
  width: "100%",
  maxWidth: "72rem",
  margin: "0 auto",
  display: "grid",
  gap: "1rem",
};

const cardBaseStyle = {
  background: "#111827",
  borderRadius: "12px",
  padding: "14px 16px",
  minWidth: "160px",
  flex: "0 0 auto",
};

const ASSET_ORDER = [
  {
    asset: "Your Portfolio",
    key: "portfolio",
    color: "#f97316",
  },
  {
    asset: "Nifty 50",
    key: "nifty50",
    color: "#3b82f6",
  },
  {
    asset: "Gold",
    key: "gold",
    color: "#f59e0b",
  },
  {
    asset: "Silver",
    key: "silver",
    color: "#94a3b8",
  },
  {
    asset: "FD",
    key: "fd",
    color: "#10b981",
  },
  {
    asset: "Nifty Index Fund",
    key: "indexFund",
    color: "#8b5cf6",
  },
];

const formatCurrency = (value) => {
  const amount = Number(value) || 0;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
};

const formatSignedCurrency = (value) => {
  const amount = Number(value) || 0;
  const abs = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.abs(amount));
  return amount >= 0 ? `+${abs}` : `-${abs}`;
};

const formatPct = (value) => {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
};

const formatCompactRupee = (value) => {
  const n = Number(value) || 0;
  const abs = Math.abs(n);
  if (abs >= 100000) {
    return `₹${(n / 100000).toFixed(1)} L`;
  }
  if (abs >= 1000) {
    return `₹${(n / 1000).toFixed(1)} K`;
  }
  return `₹${n.toFixed(0)}`;
};

const normalizeSummary = (summary) => {
  const map = new Map((summary || []).map((item) => [item.asset, item]));
  return ASSET_ORDER.map((item) => {
    const found =
      item.key === "fd"
        ? [...map.values()].find(
            (entry) => entry.asset === "FD" || entry.asset.startsWith("FD @"),
          )
        : map.get(item.asset);
    return {
      asset: found?.asset || item.asset,
      key: item.key,
      color: found?.color || item.color,
      totalInvested: Number(found?.totalInvested) || 0,
      currentValue: Number(found?.currentValue) || 0,
      absoluteReturn: Number(found?.absoluteReturn) || 0,
      returnPct: Number(found?.returnPct) || 0,
    };
  });
};

const getAssetKey = (assetName) => {
  if (assetName.includes("Portfolio")) return "portfolio";
  if (assetName.includes("Nifty 50")) return "nifty50";
  if (assetName.includes("Gold")) return "gold";
  if (assetName.includes("Silver")) return "silver";
  if (assetName.includes("FD")) return "fd";
  if (assetName.includes("Index Fund")) return "indexFund";
  return assetName.toLowerCase().replace(/\s+/g, "");
};

const ComparisonPage = () => {
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [fdRate, setFdRate] = useState(7.0);
  const [fdRateInput, setFdRateInput] = useState("7.0");
  const [activeAssets, setActiveAssets] = useState([
    "portfolio",
    "nifty50",
    "gold",
    "silver",
    "fd",
    "indexFund",
  ]);

  const toggleAsset = (key) => {
    setActiveAssets((prev) => {
      if (prev.includes(key)) {
        if (prev.length === 1) return prev;
        return prev.filter((k) => k !== key);
      }
      return [...prev, key];
    });
  };

  useEffect(() => {
    document.title = "What If? | PortSense";
  }, []);

  const fetchComparison = async (rate = fdRate) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/api/comparison/alternatives?fd_rate=${rate}`);
      setData(res.data);
    } catch {
      setError("Failed to load comparison data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComparison();
  }, []);

  const summary = useMemo(() => normalizeSummary(data?.summary), [data]);

  const winnerMessage = useMemo(() => {
    if (!summary.length) return null;

    const portfolio = summary.find((item) => item.asset === "Your Portfolio");
    const alternatives = summary.filter(
      (item) => item.asset !== "Your Portfolio",
    );

    if (!portfolio || !alternatives.length) return null;

    const bestAlt = alternatives.reduce((best, current) =>
      current.returnPct > best.returnPct ? current : best,
    );

    if (portfolio.returnPct >= bestAlt.returnPct) {
      return {
        text: "🏆 Your portfolio outperformed all alternatives!",
        background: "rgba(34, 197, 94, 0.12)",
        border: "1px solid rgba(34, 197, 94, 0.35)",
        color: "#dcfce7",
      };
    }

    return {
      text: `🏆 ${bestAlt.asset} would have returned ${formatPct(bestAlt.returnPct)} vs your portfolio's ${formatPct(portfolio.returnPct)}`,
      background: "rgba(249, 115, 22, 0.1)",
      border: "1px solid rgba(249, 115, 22, 0.3)",
      color: "#ffffff",
    };
  }, [summary]);

  const insights = useMemo(() => {
    const alternatives = summary.filter(
      (item) => item.asset !== "Your Portfolio",
    );
    return [...alternatives].sort((a, b) => b.returnPct - a.returnPct);
  }, [summary]);

  return (
    <div style={shellStyle}>
      <style>{`
        .comparison-pulse {
          animation: comparisonPulse 1.2s ease-in-out infinite;
        }
        @keyframes comparisonPulse {
          0% { opacity: 0.45; }
          50% { opacity: 1; }
          100% { opacity: 0.45; }
        }
      `}</style>

      <div style={containerStyle}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: "0.75rem",
          }}
        >
          <div>
            <h1
              style={{
                margin: "0 0 4px",
                color: "#ffffff",
                fontSize: "24px",
                fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                fontWeight: 900,
                letterSpacing: "0.02em",
              }}
            >
              What If?
            </h1>
            <p
              style={{
                margin: 0,
                color: "#94a3b8",
                fontSize: "13px",
              }}
            >
              See how your portfolio compares to alternative investments with
              the same cash flows
            </p>
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
              flexShrink: 0,
              alignSelf: "flex-start",
              fontFamily: "inherit",
            }}
          >
            Sign Out
          </button>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            background: "#111827",
            borderRadius: "12px",
            padding: "10px 16px",
            border: "1px solid #1e293b",
            marginBottom: "1rem",
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              color: "#94a3b8",
              fontSize: "13px",
              fontWeight: 600,
            }}
          >
            FD Rate (% per annum):
          </span>
          <input
            type="number"
            min="1"
            max="15"
            step="0.1"
            value={fdRateInput}
            onChange={(e) => setFdRateInput(e.target.value)}
            style={{
              width: "70px",
              background: "#0f172a",
              border: "1px solid #334155",
              borderRadius: "8px",
              color: "white",
              padding: "6px 10px",
              fontSize: "14px",
              fontWeight: 700,
              textAlign: "center",
            }}
          />
          <button
            type="button"
            onClick={() => {
              const parsed = parseFloat(fdRateInput);
              if (!isNaN(parsed) && parsed > 0 && parsed <= 15) {
                setFdRate(parsed);
                fetchComparison(parsed);
              }
            }}
            style={{
              background: "#f97316",
              color: "white",
              border: "none",
              borderRadius: "20px",
              padding: "6px 16px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Apply
          </button>
          <span style={{ color: "#475569", fontSize: "11px" }}>
            Default: SBI 1-yr FD @ 7%
          </span>
        </div>

        {loading ? (
          <div
            style={{
              display: "flex",
              gap: "10px",
              overflowX: "auto",
              paddingBottom: "8px",
            }}
          >
            {[1, 2, 3].map((n) => (
              <div
                key={n}
                className="comparison-pulse"
                style={{
                  ...cardBaseStyle,
                  border: "1px solid #1e293b",
                  minHeight: "112px",
                }}
              >
                <div
                  style={{
                    width: "60%",
                    height: "12px",
                    borderRadius: "6px",
                    background: "#1e293b",
                    marginBottom: "12px",
                  }}
                />
                <div
                  style={{
                    width: "85%",
                    height: "10px",
                    borderRadius: "6px",
                    background: "#1e293b",
                    marginBottom: "10px",
                  }}
                />
                <div
                  style={{
                    width: "70%",
                    height: "14px",
                    borderRadius: "6px",
                    background: "#334155",
                    marginBottom: "10px",
                  }}
                />
                <div
                  style={{
                    width: "50%",
                    height: "10px",
                    borderRadius: "6px",
                    background: "#1e293b",
                  }}
                />
              </div>
            ))}
          </div>
        ) : null}

        {!loading && error ? (
          <div
            style={{
              border: "1px solid rgba(239, 68, 68, 0.4)",
              background: "rgba(239, 68, 68, 0.12)",
              color: "#fecaca",
              borderRadius: "12px",
              padding: "12px 14px",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        ) : null}

        {!loading && !error ? (
          <>
            <div
              style={{
                display: "flex",
                gap: "10px",
                overflowX: "auto",
                paddingBottom: "8px",
              }}
            >
              {summary.map((item) => {
                const key = getAssetKey(item.asset);
                const isActive = activeAssets.includes(key);

                return (
                  <div
                    key={item.asset}
                    style={{
                      ...cardBaseStyle,
                      border: isActive
                        ? item.asset === "Your Portfolio"
                          ? "1px solid #f97316"
                          : "1px solid #1e293b"
                        : "1px solid #1e293b",
                      cursor: "pointer",
                      opacity: isActive ? 1 : 0.4,
                      transition: "opacity 0.2s ease, border-color 0.2s ease",
                    }}
                    onClick={() => toggleAsset(key)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "8px",
                      }}
                    >
                      <span
                        style={{
                          width: "8px",
                          height: "8px",
                          borderRadius: "999px",
                          backgroundColor: item.color,
                        }}
                      />
                      <span
                        style={{
                          color: "#e2e8f0",
                          fontSize: "13px",
                          fontWeight: 700,
                        }}
                      >
                        {item.asset}
                      </span>
                    </div>

                    <p
                      style={{
                        margin: "0 0 4px",
                        color: "#94a3b8",
                        fontSize: "12px",
                      }}
                    >
                      Total invested: {formatCurrency(item.totalInvested)}
                    </p>
                    <p
                      style={{
                        margin: "0 0 6px",
                        color: "#ffffff",
                        fontSize: "20px",
                        fontWeight: 800,
                        fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                      }}
                    >
                      {formatCurrency(item.currentValue)}
                    </p>
                    <p
                      style={{
                        margin: "0 0 2px",
                        color: item.returnPct >= 0 ? "#22c55e" : "#ef4444",
                        fontSize: "12px",
                        fontWeight: 700,
                      }}
                    >
                      Return: {formatPct(item.returnPct)}
                    </p>
                    <p
                      style={{
                        margin: 0,
                        color: item.absoluteReturn >= 0 ? "#22c55e" : "#ef4444",
                        fontSize: "12px",
                      }}
                    >
                      Absolute: {formatSignedCurrency(item.absoluteReturn)}
                    </p>

                    <div
                      style={{
                        marginTop: "8px",
                        paddingTop: "8px",
                        borderTop: "1px solid rgba(255,255,255,0.06)",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          width: "24px",
                          height: "3px",
                          borderRadius: "2px",
                          backgroundColor: isActive ? item.color : "#334155",
                          transition: "background-color 0.2s ease",
                        }}
                      />
                      <span
                        style={{
                          fontSize: "10px",
                          color: isActive ? "#94a3b8" : "#475569",
                          fontWeight: 600,
                        }}
                      >
                        {isActive ? "VISIBLE" : "HIDDEN"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <p
              style={{
                margin: "0 0 0.75rem",
                color: "#475569",
                fontSize: "11px",
                textAlign: "center",
              }}
            >
              Click any card to show or hide its line on the chart
            </p>

            <div
              style={{
                background: "#111827",
                border: "1px solid #1e293b",
                borderRadius: "12px",
                padding: "14px 12px 8px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: "1rem",
                }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "1rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  Portfolio Value Over Time
                </p>
                {activeAssets.length < 6 && (
                  <button
                    type="button"
                    onClick={() =>
                      setActiveAssets([
                        "portfolio",
                        "nifty50",
                        "gold",
                        "silver",
                        "fd",
                        "indexFund",
                      ])
                    }
                    style={{
                      background: "#1e293b",
                      color: "#94a3b8",
                      borderRadius: "20px",
                      padding: "4px 12px",
                      fontSize: "11px",
                      fontWeight: 600,
                      border: "1px solid rgba(255,255,255,0.08)",
                      cursor: "pointer",
                      fontFamily: "inherit",
                    }}
                  >
                    Show All
                  </button>
                )}
              </div>

              <div style={{ width: "100%", height: "300px" }}>
                <ResponsiveContainer>
                  <LineChart data={data?.timeline || []}>
                    <CartesianGrid stroke="rgba(255,255,255,0.05)" />
                    <XAxis
                      dataKey="month"
                      interval={2}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    />
                    <YAxis
                      tickFormatter={formatCompactRupee}
                      tick={{ fill: "#64748b", fontSize: 11 }}
                      tickLine={false}
                      axisLine={{ stroke: "rgba(255,255,255,0.1)" }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: "#0f172a",
                        border: "1px solid #1e293b",
                        borderRadius: "10px",
                        color: "#e2e8f0",
                        fontSize: "12px",
                      }}
                      labelStyle={{ color: "#ffffff", fontWeight: 700 }}
                      formatter={(value, name) => [formatCurrency(value), name]}
                    />
                    <Legend verticalAlign="bottom" height={28} />

                    {activeAssets.includes("portfolio") && (
                      <Line
                        key="portfolio"
                        type="monotone"
                        dataKey="portfolio"
                        name="Your Portfolio"
                        stroke="#f97316"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    {activeAssets.includes("nifty50") && (
                      <Line
                        key="nifty50"
                        type="monotone"
                        dataKey="nifty50"
                        name="Nifty 50"
                        stroke="#3b82f6"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    {activeAssets.includes("gold") && (
                      <Line
                        key="gold"
                        type="monotone"
                        dataKey="gold"
                        name="Gold"
                        stroke="#f59e0b"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    {activeAssets.includes("silver") && (
                      <Line
                        key="silver"
                        type="monotone"
                        dataKey="silver"
                        name="Silver"
                        stroke="#94a3b8"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    {activeAssets.includes("fd") && (
                      <Line
                        key="fd"
                        type="monotone"
                        dataKey="fd"
                        name="FD"
                        stroke="#10b981"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    {activeAssets.includes("indexFund") && (
                      <Line
                        key="indexFund"
                        type="monotone"
                        dataKey="indexFund"
                        name="Nifty Index Fund"
                        stroke="#8b5cf6"
                        strokeWidth={2.2}
                        dot={false}
                        connectNulls
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="invested"
                      name="Cumulative Invested"
                      stroke="#64748b"
                      strokeDasharray="5 4"
                      strokeWidth={1.8}
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {winnerMessage ? (
              <div
                style={{
                  background: winnerMessage.background,
                  border: winnerMessage.border,
                  borderRadius: "12px",
                  padding: "12px 16px",
                  color: winnerMessage.color,
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {winnerMessage.text}
              </div>
            ) : null}

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                gap: "10px",
              }}
            >
              {insights.map((item) => (
                <div
                  key={`${item.asset}-insight`}
                  style={{
                    background: "#111827",
                    border: "1px solid #1e293b",
                    borderRadius: "12px",
                    padding: "12px 14px",
                    fontSize: "13px",
                    color: "#cbd5e1",
                    lineHeight: 1.45,
                  }}
                >
                  <span style={{ color: "#ffffff", fontWeight: 700 }}>
                    {item.asset}
                  </span>
                  {": invested same "}
                  <span style={{ color: "#e2e8f0", fontWeight: 600 }}>
                    {formatCurrency(item.totalInvested)}
                  </span>
                  {"  "}
                  <span style={{ color: "#ffffff", fontWeight: 700 }}>
                    {formatCurrency(item.currentValue)}
                  </span>
                  {" ("}
                  <span
                    style={{
                      color: item.returnPct >= 0 ? "#22c55e" : "#ef4444",
                    }}
                  >
                    {formatPct(item.returnPct)}
                  </span>
                  {")"}
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default ComparisonPage;
