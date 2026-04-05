import { useEffect, useMemo, useState } from "react";
import api from "../services/api";

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "1.25rem 1rem 5rem",
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

const FILTERS = ["All", "LTCG", "STCG", "FD Interest"];
const LTCG_EXEMPTION = 125000;

const HOLDING_TYPE_VARIANTS = {
  LTCG: "LTCG",
  STCG: "STCG",
  MF_LTCG: "MF LTCG",
  MF_STCG: "MF STCG",
  FD_INTEREST: "FD Interest",
};

const FILTER_HOLDING_TYPE_MAP = {
  All: [
    HOLDING_TYPE_VARIANTS.LTCG,
    HOLDING_TYPE_VARIANTS.STCG,
    HOLDING_TYPE_VARIANTS.MF_LTCG,
    HOLDING_TYPE_VARIANTS.MF_STCG,
    HOLDING_TYPE_VARIANTS.FD_INTEREST,
  ],
  LTCG: [HOLDING_TYPE_VARIANTS.LTCG, HOLDING_TYPE_VARIANTS.MF_LTCG],
  STCG: [HOLDING_TYPE_VARIANTS.STCG, HOLDING_TYPE_VARIANTS.MF_STCG],
  "FD Interest": [HOLDING_TYPE_VARIANTS.FD_INTEREST],
};

const HOLDING_TYPE_BADGE_MAP = {
  [HOLDING_TYPE_VARIANTS.LTCG]: {
    label: HOLDING_TYPE_VARIANTS.LTCG,
    color: "#22c55e",
    background: "rgba(34,197,94,0.12)",
  },
  [HOLDING_TYPE_VARIANTS.MF_LTCG]: {
    label: HOLDING_TYPE_VARIANTS.MF_LTCG,
    color: "#22c55e",
    background: "rgba(34,197,94,0.12)",
  },
  [HOLDING_TYPE_VARIANTS.STCG]: {
    label: HOLDING_TYPE_VARIANTS.STCG,
    color: "#f59e0b",
    background: "rgba(245,158,11,0.12)",
  },
  [HOLDING_TYPE_VARIANTS.MF_STCG]: {
    label: HOLDING_TYPE_VARIANTS.MF_STCG,
    color: "#f59e0b",
    background: "rgba(245,158,11,0.12)",
  },
  [HOLDING_TYPE_VARIANTS.FD_INTEREST]: {
    label: HOLDING_TYPE_VARIANTS.FD_INTEREST,
    color: "#38bdf8",
    background: "rgba(56,189,248,0.12)",
  },
};

const formatCurrency = (value, digits = 2) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value) || 0);

const formatPercent = (value) => {
  const num = Number(value) || 0;
  const sign = num > 0 ? "+" : "";
  return `${sign}${num.toFixed(2)}%`;
};

const toneForSignedValue = (value) =>
  (Number(value) || 0) >= 0 ? "#22c55e" : "#ef4444";

const TaxPage = () => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeFilter, setActiveFilter] = useState("All");

  useEffect(() => {
    document.title = "Tax & Real Returns | PortSense";
  }, []);

  useEffect(() => {
    let mounted = true;

    const fetchTaxSummary = async () => {
      setLoading(true);
      setError("");

      try {
        const response = await api.get("/api/tax/summary");
        if (mounted) {
          setData(response?.data || null);
        }
      } catch {
        if (mounted) {
          setError("Unable to load tax summary right now. Please try again.");
          setData(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchTaxSummary();

    return () => {
      mounted = false;
    };
  }, []);

  const summary = data?.summary || {
    totalAbsoluteGain: 0,
    totalEstimatedTax: 0,
    totalLTCGGain: 0,
    totalSTCGGain: 0,
    ltcgExemptionUsed: 0,
    netAfterTax: 0,
    inflationRate: 5.5,
  };

  const holdings = Array.isArray(data?.holdings) ? data.holdings : [];

  const filteredHoldings = useMemo(() => {
    if (activeFilter === "All") {
      return holdings;
    }
    const allowedTypes = FILTER_HOLDING_TYPE_MAP[activeFilter] || [];
    return holdings.filter((item) =>
      allowedTypes.includes(String(item?.holdingType || "").trim()),
    );
  }, [activeFilter, holdings]);

  const ltcgTax = useMemo(
    () =>
      holdings
        .filter(
          (item) =>
            item?.holdingType === HOLDING_TYPE_VARIANTS.LTCG ||
            item?.holdingType === HOLDING_TYPE_VARIANTS.MF_LTCG,
        )
        .reduce((acc, item) => acc + (Number(item?.estimatedTax) || 0), 0),
    [holdings],
  );

  const stcgTax = useMemo(
    () =>
      holdings
        .filter(
          (item) =>
            item?.holdingType === HOLDING_TYPE_VARIANTS.STCG ||
            item?.holdingType === HOLDING_TYPE_VARIANTS.MF_STCG,
        )
        .reduce((acc, item) => acc + (Number(item?.estimatedTax) || 0), 0),
    [holdings],
  );

  const inflationRate = Number(summary.inflationRate) || 5.5;
  const presentValue = 100000;
  const futureRealValue = presentValue / (1 + inflationRate / 100) ** 10;
  const purchasingPowerLoss = presentValue - futureRealValue;

  const exemptionUsed = Number(summary.ltcgExemptionUsed) || 0;
  const totalEstimatedTax = Number(summary.totalEstimatedTax) || 0;
  const totalLTCGGain = Number(summary.totalLTCGGain) || 0;
  const showLTCGExemptionBanner =
    totalEstimatedTax === 0 &&
    totalLTCGGain > 0 &&
    exemptionUsed >= totalLTCGGain;
  const exemptionProgress = Math.max(
    0,
    Math.min(100, (exemptionUsed / LTCG_EXEMPTION) * 100),
  );

  return (
    <div style={shellStyle}>
      <style>{`
        .tax-summary-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .tax-breakdown-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .tax-table-wrap {
          overflow-x: auto;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.9rem;
        }

        .tax-table {
          width: 100%;
          min-width: 860px;
          border-collapse: collapse;
        }

        .tax-table thead th {
          font-size: 0.73rem;
          color: #94a3b8;
          font-weight: 700;
          text-align: left;
          padding: 0.7rem 0.75rem;
          background: rgba(30, 41, 59, 0.65);
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          letter-spacing: 0.03em;
          text-transform: uppercase;
        }

        .tax-table tbody td {
          padding: 0.7rem 0.75rem;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
          font-size: 0.82rem;
          color: #e2e8f0;
          vertical-align: top;
        }

        .tax-table tbody tr:last-child td {
          border-bottom: none;
        }

        .tax-table tbody tr:hover {
          background: rgba(148, 163, 184, 0.08);
        }

        @media (max-width: 760px) {
          .tax-summary-grid,
          .tax-breakdown-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>

      <div style={containerStyle}>
        <header style={{ display: "grid", gap: "0.5rem" }}>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
              fontSize: "22px",
              fontWeight: 700,
              color: "#ffffff",
              letterSpacing: "0.02em",
            }}
          >
            Tax & Real Returns
          </h1>
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
            Estimated tax liability and inflation-adjusted returns
          </p>
          <div
            style={{
              width: "fit-content",
              background: "rgba(245,158,11,0.1)",
              color: "#f59e0b",
              borderRadius: 20,
              padding: "4px 12px",
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            ⚠ Indicative only — consult a tax advisor
          </div>
        </header>

        {loading ? (
          <section style={{ ...cardStyle, padding: "1rem" }}>
            <p style={{ margin: 0, color: "#94a3b8" }}>
              Loading tax summary...
            </p>
          </section>
        ) : error ? (
          <section style={{ ...cardStyle, padding: "1rem" }}>
            <p style={{ margin: 0, color: "#fca5a5" }}>{error}</p>
          </section>
        ) : (
          <>
            <section className="tax-summary-grid">
              <article style={{ ...cardStyle, padding: "0.9rem" }}>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
                  Total Gain
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.25rem 0 0",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: toneForSignedValue(summary.totalAbsoluteGain),
                  }}
                >
                  {formatCurrency(summary.totalAbsoluteGain)}
                </p>
              </article>

              <article style={{ ...cardStyle, padding: "0.9rem" }}>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
                  Estimated Tax
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.25rem 0 0",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: totalEstimatedTax > 0 ? "#f97316" : "#fb7185",
                  }}
                >
                  {formatCurrency(summary.totalEstimatedTax)}
                </p>
                {showLTCGExemptionBanner && (
                  <p
                    style={{
                      margin: "0.45rem 0 0",
                      padding: "0.5rem 0.6rem",
                      borderRadius: "0.5rem",
                      border: "1px solid rgba(34, 197, 94, 0.28)",
                      background: "rgba(34, 197, 94, 0.1)",
                      color: "#86efac",
                      fontSize: "0.74rem",
                      lineHeight: 1.45,
                    }}
                  >
                    Your total LTCG gains of {formatCurrency(totalLTCGGain, 0)}{" "}
                    are within the ₹1.25L annual exemption limit. No LTCG tax is
                    owed.
                  </p>
                )}
              </article>

              <article style={{ ...cardStyle, padding: "0.9rem" }}>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
                  Net After Tax
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.25rem 0 0",
                    fontSize: "1.5rem",
                    fontWeight: 700,
                    color: toneForSignedValue(summary.netAfterTax),
                  }}
                >
                  {formatCurrency(summary.netAfterTax)}
                </p>
              </article>

              <article
                style={{
                  ...cardStyle,
                  padding: "0.9rem",
                  display: "grid",
                  gap: "0.45rem",
                }}
              >
                <p style={{ margin: 0, fontSize: "0.75rem", color: "#94a3b8" }}>
                  LTCG Exemption Used
                </p>
                <p
                  style={{
                    margin: 0,
                    color: "#f8fafc",
                    fontWeight: 700,
                    fontSize: "0.85rem",
                  }}
                >
                  {formatCurrency(exemptionUsed, 0)} / ₹1,25,000
                </p>
                <div
                  style={{
                    width: "100%",
                    height: "8px",
                    borderRadius: "999px",
                    background: "rgba(100, 116, 139, 0.35)",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${exemptionProgress}%`,
                      height: "100%",
                      background: "linear-gradient(90deg, #f59e0b, #fb923c)",
                    }}
                  />
                </div>
              </article>
            </section>

            <section className="tax-breakdown-grid">
              <article
                style={{
                  ...cardStyle,
                  padding: "0.95rem",
                  borderLeft: "4px solid #22c55e",
                }}
              >
                <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.8rem" }}>
                  Long Term (&gt;1yr) @ 12.5%
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.35rem 0 0",
                    fontSize: "1.3rem",
                    color: "#22c55e",
                    fontWeight: 700,
                  }}
                >
                  {formatCurrency(summary.totalLTCGGain)}
                </p>
                <p
                  style={{
                    margin: "0.2rem 0 0",
                    color: "#94a3b8",
                    fontSize: "0.82rem",
                  }}
                >
                  Tax:{" "}
                  <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                    {formatCurrency(ltcgTax)}
                  </span>
                </p>
              </article>

              <article
                style={{
                  ...cardStyle,
                  padding: "0.95rem",
                  borderLeft: "4px solid #f59e0b",
                }}
              >
                <p style={{ margin: 0, color: "#cbd5e1", fontSize: "0.8rem" }}>
                  Short Term (&lt;1yr) @ 20%
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.35rem 0 0",
                    fontSize: "1.3rem",
                    color: "#f59e0b",
                    fontWeight: 700,
                  }}
                >
                  {formatCurrency(summary.totalSTCGGain)}
                </p>
                <p
                  style={{
                    margin: "0.2rem 0 0",
                    color: "#94a3b8",
                    fontSize: "0.82rem",
                  }}
                >
                  Tax:{" "}
                  <span style={{ color: "#f8fafc", fontWeight: 700 }}>
                    {formatCurrency(stcgTax)}
                  </span>
                </p>
              </article>
            </section>

            <section
              style={{
                ...cardStyle,
                padding: "0.95rem",
                display: "grid",
                gap: "0.8rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                <h2
                  style={{ margin: 0, color: "#f8fafc", fontSize: "1.05rem" }}
                >
                  Holdings Tax View
                </h2>
                <div
                  style={{
                    display: "inline-flex",
                    gap: "0.35rem",
                    padding: "0.2rem",
                    borderRadius: "999px",
                    border: "1px solid rgba(255, 255, 255, 0.12)",
                    background: "rgba(15, 23, 42, 0.7)",
                  }}
                >
                  {FILTERS.map((filter) => {
                    const active = activeFilter === filter;
                    return (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setActiveFilter(filter)}
                        style={{
                          border: "none",
                          borderRadius: "999px",
                          padding: "0.35rem 0.7rem",
                          fontSize: "0.75rem",
                          cursor: "pointer",
                          fontWeight: 700,
                          color: active ? "#ffffff" : "#94a3b8",
                          background: active ? "#f97316" : "transparent",
                        }}
                      >
                        {filter}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="tax-table-wrap">
                <table className="tax-table">
                  <thead>
                    <tr>
                      <th>Ticker</th>
                      <th>Held</th>
                      <th>Type</th>
                      <th>Nominal Return</th>
                      <th>Real Return</th>
                      <th>Est. Tax</th>
                      <th>Days to LTCG</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredHoldings.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          style={{ color: "#94a3b8", textAlign: "center" }}
                        >
                          No holdings for this filter.
                        </td>
                      </tr>
                    ) : (
                      filteredHoldings.map((item) => {
                        const nominalReturn =
                          Number(item?.nominalReturnPct) || 0;
                        const realReturn = Number(item?.realReturnPct) || 0;
                        const estimatedTax = Number(item?.estimatedTax) || 0;
                        const holdingType = String(
                          item?.holdingType || "",
                        ).trim();
                        const showLTCGExemptionLabel =
                          estimatedTax === 0 && item?.isLTCG === true;
                        const badge = HOLDING_TYPE_BADGE_MAP[holdingType] || {
                          label: holdingType || "Unknown",
                          color: "#94a3b8",
                          background: "rgba(148,163,184,0.16)",
                        };
                        const daysToLTCG = Number(item?.daysToLTCG) || 0;

                        let ltcgLabel = (
                          <span style={{ color: "#94a3b8", fontWeight: 700 }}>
                            {daysToLTCG} days
                          </span>
                        );

                        if (
                          holdingType === HOLDING_TYPE_VARIANTS.LTCG ||
                          holdingType === HOLDING_TYPE_VARIANTS.MF_LTCG
                        ) {
                          ltcgLabel = (
                            <span style={{ color: "#22c55e", fontWeight: 700 }}>
                              ✓ LTCG
                            </span>
                          );
                        } else if (
                          holdingType === HOLDING_TYPE_VARIANTS.STCG ||
                          holdingType === HOLDING_TYPE_VARIANTS.MF_STCG
                        ) {
                          if (daysToLTCG < 30) {
                            ltcgLabel = (
                              <span
                                style={{ color: "#f59e0b", fontWeight: 700 }}
                              >
                                {daysToLTCG} days
                              </span>
                            );
                          }
                        } else if (
                          holdingType === HOLDING_TYPE_VARIANTS.FD_INTEREST
                        ) {
                          ltcgLabel = (
                            <span style={{ color: "#38bdf8", fontWeight: 700 }}>
                              Not applicable
                            </span>
                          );
                        }

                        return (
                          <tr key={`${item.ticker}-${item.buyDate || "na"}`}>
                            <td>
                              <div
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: "6px",
                                }}
                              >
                                {item?.assetType === "mutual_fund" && (
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
                                )}
                                {item?.assetType === "fd" && (
                                  <span
                                    style={{
                                      fontSize: "9px",
                                      fontWeight: 700,
                                      background: "rgba(16,185,129,0.2)",
                                      color: "#34d399",
                                      borderRadius: "10px",
                                      padding: "1px 6px",
                                    }}
                                  >
                                    FD
                                  </span>
                                )}
                                <span
                                  style={{ color: "#f8fafc", fontWeight: 700 }}
                                >
                                  {(item?.displayName || item?.ticker || "-")
                                    .length > 30
                                    ? (
                                        item?.displayName ||
                                        item?.ticker ||
                                        "-"
                                      ).substring(0, 30) + "..."
                                    : item?.displayName || item?.ticker || "-"}
                                </span>
                              </div>
                            </td>
                            <td>{Number(item?.holdingDays) || 0} days</td>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 9px",
                                  borderRadius: "999px",
                                  fontSize: "0.72rem",
                                  fontWeight: 700,
                                  color: badge.color,
                                  background: badge.background,
                                }}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td
                              style={{
                                color: toneForSignedValue(nominalReturn),
                                fontWeight: 700,
                              }}
                            >
                              {formatPercent(nominalReturn)}
                            </td>
                            <td>
                              <span style={{ color: "#94a3b8" }}>
                                Nominal:{" "}
                                <span
                                  style={{
                                    color: toneForSignedValue(nominalReturn),
                                  }}
                                >
                                  {formatPercent(nominalReturn)}
                                </span>
                              </span>
                              <br />
                              <span
                                style={{
                                  color: toneForSignedValue(realReturn),
                                  fontWeight: 700,
                                }}
                              >
                                Real: {formatPercent(realReturn)}
                              </span>
                            </td>
                            <td style={{ color: "#fb7185", fontWeight: 700 }}>
                              {showLTCGExemptionLabel ? (
                                <span
                                  style={{
                                    color: "#94a3b8",
                                    fontSize: "0.75rem",
                                    fontWeight: 600,
                                  }}
                                >
                                  Covered under ₹1.25L exemption
                                </span>
                              ) : item?.taxNote ? (
                                <span
                                  style={{
                                    color: "#f59e0b",
                                    fontSize: "0.75rem",
                                  }}
                                >
                                  {item.taxNote}
                                </span>
                              ) : (
                                formatCurrency(estimatedTax)
                              )}
                            </td>
                            <td>{ltcgLabel}</td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <section
              style={{
                ...cardStyle,
                padding: "1rem",
                display: "grid",
                gap: "0.45rem",
              }}
            >
              <h2 style={{ margin: 0, color: "#f8fafc", fontSize: "1.02rem" }}>
                Inflation Impact
              </h2>
              <p
                style={{
                  margin: 0,
                  color: "#cbd5e1",
                  fontSize: "0.9rem",
                  lineHeight: 1.6,
                }}
              >
                At {inflationRate.toFixed(1)}% annual CPI inflation, ₹1 lakh
                today will be worth {formatCurrency(futureRealValue, 0)} in 10
                years in real terms.
              </p>
              <p
                style={{
                  margin: 0,
                  color: "#f59e0b",
                  fontSize: "0.88rem",
                  fontWeight: 700,
                }}
              >
                {formatCurrency(purchasingPowerLoss, 0)} of purchasing power
                lost to inflation
              </p>
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default TaxPage;
