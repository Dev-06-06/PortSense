import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import TopNav from "../components/TopNav";
import api from "../services/api";

const FEATURES = [
  {
    icon: "📊",
    title: "Live P&L Dashboard",
    description:
      "Real-time profit and loss across stocks, mutual funds, and fixed deposits with today's change tracking.",
  },
  {
    icon: "🧠",
    title: "AI Rebalancing",
    description:
      "Gemini 2.5 Flash generates specific rebalancing advice with rupee amounts — grounded in your actual beta, diversification, and sector data.",
  },
  {
    icon: "📰",
    title: "FinBERT Sentiment",
    description:
      "ProsusAI/finbert scores fresh GNews headlines per stock. Tier-based 2–7 day freshness window. No stale sentiment badges.",
  },
  {
    icon: "🔗",
    title: "Correlation Heatmap",
    description:
      "Pairwise stock correlation matrix with colour-coded cells. Identifies both strongly positive and negative pairs.",
  },
  {
    icon: "📈",
    title: "Nifty Benchmark",
    description:
      "XIRR-based line chart vs Nifty 50 across your full holding period — including MF and FD in portfolio valuation.",
  },
  {
    icon: "⚡",
    title: "Stress Testing",
    description:
      "6 preset market crash scenarios plus custom shock input. See exact rupee impact with horizontal bar visualisation.",
  },
  {
    icon: "🔍",
    title: "Sector & Risk Analysis",
    description:
      "Sector concentration warnings, portfolio beta, diversification score, and systematic vs idiosyncratic risk split.",
  },
  {
    icon: "💰",
    title: "Tax & Real Returns",
    description:
      "LTCG/STCG classification with ₹1.25L exemption, FD slab rate, and inflation-adjusted real returns per holding.",
  },
  {
    icon: "📰",
    title: "Market News Feed",
    description:
      "13 category filters powered by GNews API — Market, Banking, IT, IPO, SEBI, Economy, Rupee and more.",
  },
];

const STATS = [
  { value: "13+", label: "Analytics Features" },
  { value: "3", label: "Asset Classes" },
  { value: "AI", label: "Gemini + FinBERT" },
  { value: "Live", label: "NSE Market Data" },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    title: "Add your holdings",
    desc: "Enter NSE stocks, mutual funds, or fixed deposits with buy price and date. Typeahead search included.",
  },
  {
    step: "02",
    title: "Get instant analysis",
    desc: "Live P&L, sector breakdown, beta, correlation heatmap — all computed automatically on every load.",
  },
  {
    step: "03",
    title: "Act on AI insights",
    desc: "Gemini rebalancing advice with rupee amounts and FinBERT sentiment on today's headlines guide your next move.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");
  const [hoveredFeature, setHoveredFeature] = useState(null);

  useEffect(() => {
    document.title = "PortSense — Know Your Portfolio";
  }, []);

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setDemoError("");
    try {
      const res = await api.post("/api/auth/login", {
        email: "demo@portsense.in",
        password: "Demo@1234",
      });
      login(res.data.access_token);
      navigate("/dashboard");
    } catch {
      setDemoError("Demo unavailable. Try again.");
    } finally {
      setDemoLoading(false);
    }
  };

  return (
    <div style={s.page}>
      <TopNav />
      <style>{css}</style>

      {/* ── HERO ── */}
      <section style={s.hero}>
        <div style={s.heroInner}>
          <div style={s.heroBadge}>
            <span style={s.heroBadgeDot} />
            AI-Powered · Indian Markets · Free Forever
          </div>

          <h1 style={s.heading}>
            <span>Know Your Portfolio.</span>
            <span style={s.headingAccent}>Before It Surprises You.</span>
          </h1>

          <p style={s.subheading}>
            FinBERT sentiment analysis on live headlines. Gemini AI rebalancing
            advice with rupee amounts. Beta, correlation, stress test — all in
            one platform built for Indian retail investors.
          </p>

          {/* Stats */}
          <div style={s.statsRow}>
            {STATS.map((stat) => (
              <div key={stat.label} style={s.statItem}>
                <span style={s.statValue}>{stat.value}</span>
                <span style={s.statLabel}>{stat.label}</span>
              </div>
            ))}
          </div>

          {/* CTAs */}
          <div style={s.ctaRow}>
            <button
              onClick={() => (user ? navigate("/dashboard") : navigate("/login"))}
              style={s.primaryBtn}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
            >
              {user ? "Go to Dashboard →" : "Get Started →"}
            </button>
            <button
              onClick={handleDemoLogin}
              disabled={demoLoading}
              style={{
                ...s.secondaryBtn,
                cursor: demoLoading ? "not-allowed" : "pointer",
                opacity: demoLoading ? 0.7 : 1,
              }}
              onMouseEnter={(e) => {
                if (!demoLoading) {
                  e.currentTarget.style.backgroundColor =
                    "rgba(249,115,22,0.1)";
                  e.currentTarget.style.borderColor =
                    "rgba(249,115,22,0.6)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.borderColor =
                  "rgba(255,255,255,0.2)";
              }}
            >
              {demoLoading ? "Loading..." : "⚡ Try Demo"}
            </button>
          </div>

          {demoError && <p style={s.demoError}>{demoError}</p>}

          {/* Demo credentials */}
          <div style={s.demoBox}>
            <span style={s.demoBoxLabel}>Demo credentials</span>
            <span style={s.demoBoxText}>
              demo@portsense.in &nbsp;·&nbsp; Demo@1234
            </span>
          </div>
        </div>

        {/* Decorative gradient orb */}
        <div style={s.heroOrb} />
      </section>

      {/* ── HOW IT WORKS ── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <p style={s.sectionLabel}>How it works</p>
          <div style={s.stepsRow}>
            {HOW_IT_WORKS.map((item, idx) => (
              <div key={item.step} style={s.stepItem}>
                <div style={s.stepNumber}>{item.step}</div>
                {idx < HOW_IT_WORKS.length - 1 && (
                  <div style={s.stepConnector} />
                )}
                <p style={s.stepTitle}>{item.title}</p>
                <p style={s.stepDesc}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section style={{ ...s.section, backgroundColor: "rgba(15,23,42,0.4)" }}>
        <div style={s.sectionInner}>
          <p style={s.sectionLabel}>What's inside</p>
          <h2 style={s.sectionHeading}>
            Everything your broker app doesn't show you
          </h2>
          <div className="features-grid">
            {FEATURES.map((feature, idx) => (
              <article
                key={feature.title}
                onMouseEnter={() => setHoveredFeature(idx)}
                onMouseLeave={() => setHoveredFeature(null)}
                style={{
                  ...s.featureCard,
                  borderColor:
                    hoveredFeature === idx
                      ? "rgba(249,115,22,0.4)"
                      : "rgba(255,255,255,0.07)",
                  backgroundColor:
                    hoveredFeature === idx
                      ? "rgba(249,115,22,0.05)"
                      : "rgba(15,23,42,0.6)",
                  transform:
                    hoveredFeature === idx ? "translateY(-2px)" : "none",
                }}
              >
                <div style={s.featureIcon}>{feature.icon}</div>
                <h3 style={s.featureTitle}>{feature.title}</h3>
                <p style={s.featureDesc}>{feature.description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── ASSET CLASSES ── */}
      <section style={s.section}>
        <div style={s.sectionInner}>
          <p style={s.sectionLabel}>Multi-asset support</p>
          <h2 style={s.sectionHeading}>One platform. Three asset classes.</h2>
          <div className="assets-grid">
            {[
              {
                icon: "📈",
                title: "NSE Stocks",
                color: "#f97316",
                points: [
                  "Live prices via yfinance",
                  "Beta and correlation analysis",
                  "FinBERT sentiment per ticker",
                  "LTCG/STCG tax classification",
                ],
              },
              {
                icon: "🏦",
                title: "Mutual Funds",
                color: "#8b5cf6",
                points: [
                  "NAV via MFAPI.in",
                  "30-day sparkline history",
                  "1W/1M/3M/1Y returns",
                  "Included in benchmark comparison",
                ],
              },
              {
                icon: "💰",
                title: "Fixed Deposits",
                color: "#10b981",
                points: [
                  "Quarterly compound interest",
                  "Multiple FDs per bank",
                  "FD slab rate tax calculation",
                  "Included in What If? comparison",
                ],
              },
            ].map((asset) => (
              <div
                key={asset.title}
                style={{
                  ...s.assetCard,
                  borderLeft: `3px solid ${asset.color}`,
                }}
              >
                <div style={{ fontSize: "2rem", marginBottom: "0.75rem" }}>
                  {asset.icon}
                </div>
                <h3
                  style={{
                    ...s.assetTitle,
                    color: asset.color,
                  }}
                >
                  {asset.title}
                </h3>
                <ul style={s.assetList}>
                  {asset.points.map((point) => (
                    <li key={point} style={s.assetPoint}>
                      <span style={{ color: asset.color, marginRight: "6px" }}>
                        ✓
                      </span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ ...s.section, backgroundColor: "rgba(15,23,42,0.4)" }}>
        <div style={s.sectionInner}>
          <p style={s.sectionLabel}>Built with</p>
          <h2 style={s.sectionHeading}>Production-grade tech stack</h2>
          <div className="tech-grid">
            {[
              { name: "FastAPI", role: "Backend API", color: "#10b981" },
              { name: "React + Vite", role: "Frontend", color: "#60a5fa" },
              { name: "MongoDB Atlas", role: "Database", color: "#22c55e" },
              { name: "FinBERT", role: "NLP Sentiment", color: "#f97316" },
              { name: "Gemini 2.5 Flash", role: "AI Advisor", color: "#a78bfa" },
              { name: "GNews API", role: "News Feed", color: "#f59e0b" },
              { name: "yfinance", role: "Market Data", color: "#38bdf8" },
              { name: "MFAPI.in", role: "MF NAV Data", color: "#fb923c" },
              { name: "Render + Vercel", role: "Deployment", color: "#94a3b8" },
            ].map((tech) => (
              <div key={tech.name} style={s.techChip}>
                <span
                  style={{
                    width: "8px",
                    height: "8px",
                    borderRadius: "50%",
                    backgroundColor: tech.color,
                    flexShrink: 0,
                  }}
                />
                <div>
                  <p style={s.techName}>{tech.name}</p>
                  <p style={s.techRole}>{tech.role}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ── */}
      <section style={s.ctaSection}>
        <div style={s.sectionInner}>
          <div style={s.ctaCard}>
            <h2 style={s.ctaHeading}>
              Ready to understand your portfolio?
            </h2>
            <p style={s.ctaSubtext}>
              Free forever. No credit card. No broker login needed.
            </p>
            <div style={s.ctaButtons}>
              <button
                onClick={() =>
                  user ? navigate("/dashboard") : navigate("/register")
                }
                style={s.primaryBtn}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = "0.9")}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = "1")}
              >
                {user ? "Go to Dashboard →" : "Create Free Account →"}
              </button>
              <button
                onClick={handleDemoLogin}
                disabled={demoLoading}
                style={{
                  ...s.secondaryBtn,
                  cursor: demoLoading ? "not-allowed" : "pointer",
                }}
                onMouseEnter={(e) => {
                  if (!demoLoading) {
                    e.currentTarget.style.backgroundColor =
                      "rgba(249,115,22,0.1)";
                    e.currentTarget.style.borderColor =
                      "rgba(249,115,22,0.6)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.borderColor =
                    "rgba(255,255,255,0.2)";
                }}
              >
                {demoLoading ? "Loading..." : "⚡ Try Demo First"}
              </button>
            </div>
            {demoError && <p style={s.demoError}>{demoError}</p>}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer style={s.footer}>
        <div style={s.footerInner}>
          <p style={s.footerLogo}>
            PORT<span style={{ color: "#f97316" }}>SENSE</span>
          </p>
          <p style={s.footerText}>
            Built for Indian retail investors · devprojects.notify@gmail.com
          </p>
          <p style={s.footerDisclaimer}>
            Not financial advice. Tax estimates are indicative only.
          </p>
        </div>
      </footer>
    </div>
  );
}

/* ── STYLES ── */
const s = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    color: "#ffffff",
    fontFamily: "'DM Sans', sans-serif",
    display: "flex",
    flexDirection: "column",
  },

  /* Hero */
  hero: {
    position: "relative",
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    padding: "6rem 1.25rem 4rem",
    overflow: "hidden",
  },
  heroInner: {
    width: "100%",
    maxWidth: "48rem",
    margin: "0 auto",
    position: "relative",
    zIndex: 1,
  },
  heroOrb: {
    position: "absolute",
    top: "20%",
    right: "-10%",
    width: "500px",
    height: "500px",
    borderRadius: "50%",
    background:
      "radial-gradient(circle, rgba(249,115,22,0.08) 0%, transparent 70%)",
    pointerEvents: "none",
  },
  heroBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    backgroundColor: "rgba(249,115,22,0.1)",
    border: "1px solid rgba(249,115,22,0.3)",
    borderRadius: "999px",
    padding: "4px 12px",
    fontSize: "0.75rem",
    fontWeight: 700,
    color: "#fdba74",
    letterSpacing: "0.05em",
    marginBottom: "1.5rem",
  },
  heroBadgeDot: {
    width: "6px",
    height: "6px",
    borderRadius: "50%",
    backgroundColor: "#f97316",
  },
  heading: {
    margin: "0 0 1.25rem",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "clamp(2.5rem, 6vw, 4.5rem)",
    fontWeight: 900,
    lineHeight: 1.05,
    letterSpacing: "-0.02em",
    display: "flex",
    flexDirection: "column",
    gap: "0.15rem",
  },
  headingAccent: {
    color: "#f97316",
  },
  subheading: {
    margin: "0 0 2rem",
    color: "#94a3b8",
    fontSize: "1.1rem",
    lineHeight: 1.7,
    maxWidth: "42rem",
  },

  /* Stats */
  statsRow: {
    display: "flex",
    gap: "2.5rem",
    marginBottom: "2.5rem",
    flexWrap: "wrap",
  },
  statItem: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },
  statValue: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "2rem",
    fontWeight: 900,
    color: "#f97316",
    lineHeight: 1,
  },
  statLabel: {
    fontSize: "0.72rem",
    color: "#64748b",
    fontWeight: 700,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
  },

  /* CTAs */
  ctaRow: {
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
    marginBottom: "1.5rem",
  },
  primaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#f97316",
    color: "#fff",
    border: "none",
    borderRadius: "0.75rem",
    padding: "0.85rem 2rem",
    fontSize: "0.9rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    cursor: "pointer",
    fontFamily: "inherit",
    transition: "opacity 0.15s",
  },
  secondaryBtn: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "transparent",
    color: "#fff",
    border: "1px solid rgba(255,255,255,0.2)",
    borderRadius: "0.75rem",
    padding: "0.85rem 2rem",
    fontSize: "0.9rem",
    fontWeight: 800,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    fontFamily: "inherit",
    transition: "background-color 0.15s, border-color 0.15s",
  },
  demoError: {
    color: "#ef4444",
    fontSize: "0.8rem",
    margin: "0.5rem 0 0",
  },
  demoBox: {
    display: "inline-flex",
    alignItems: "center",
    gap: "0.75rem",
    backgroundColor: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.6rem",
    padding: "0.5rem 0.85rem",
    flexWrap: "wrap",
  },
  demoBoxLabel: {
    fontSize: "0.7rem",
    fontWeight: 700,
    color: "#475569",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  },
  demoBoxText: {
    fontSize: "0.78rem",
    color: "#94a3b8",
    fontFamily: "monospace",
  },

  /* Sections */
  section: {
    padding: "5rem 1.25rem",
  },
  sectionInner: {
    width: "100%",
    maxWidth: "72rem",
    margin: "0 auto",
  },
  sectionLabel: {
    margin: "0 0 0.6rem",
    fontSize: "0.72rem",
    fontWeight: 700,
    letterSpacing: "0.15em",
    textTransform: "uppercase",
    color: "#f97316",
  },
  sectionHeading: {
    margin: "0 0 2.5rem",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "clamp(1.6rem, 3vw, 2.2rem)",
    fontWeight: 800,
    color: "#f8fafc",
    lineHeight: 1.2,
  },

  /* How it works */
  stepsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: "2rem",
    position: "relative",
  },
  stepItem: {
    position: "relative",
  },
  stepNumber: {
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "3.5rem",
    fontWeight: 900,
    color: "rgba(249,115,22,0.15)",
    lineHeight: 1,
    marginBottom: "0.5rem",
  },
  stepConnector: {
    display: "none",
  },
  stepTitle: {
    margin: "0 0 0.4rem",
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: "1rem",
  },
  stepDesc: {
    margin: 0,
    color: "#64748b",
    fontSize: "0.88rem",
    lineHeight: 1.6,
  },

  /* Features */
  featureCard: {
    borderRadius: "1rem",
    border: "1px solid rgba(255,255,255,0.07)",
    backgroundColor: "rgba(15,23,42,0.6)",
    padding: "1.5rem",
    transition: "border-color 0.2s, background-color 0.2s, transform 0.2s",
    cursor: "default",
  },
  featureIcon: {
    fontSize: "1.6rem",
    marginBottom: "0.75rem",
  },
  featureTitle: {
    margin: "0 0 0.5rem",
    color: "#f8fafc",
    fontWeight: 700,
    fontSize: "1rem",
  },
  featureDesc: {
    margin: 0,
    color: "#64748b",
    fontSize: "0.85rem",
    lineHeight: 1.6,
  },

  /* Asset classes */
  assetCard: {
    backgroundColor: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "1rem",
    padding: "1.5rem",
  },
  assetTitle: {
    margin: "0 0 1rem",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "1.3rem",
    fontWeight: 800,
    letterSpacing: "0.03em",
  },
  assetList: {
    margin: 0,
    padding: 0,
    listStyle: "none",
    display: "flex",
    flexDirection: "column",
    gap: "0.5rem",
  },
  assetPoint: {
    fontSize: "0.85rem",
    color: "#94a3b8",
    display: "flex",
    alignItems: "flex-start",
  },

  /* Tech stack */
  techChip: {
    display: "flex",
    alignItems: "center",
    gap: "0.75rem",
    backgroundColor: "rgba(15,23,42,0.6)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "0.75rem",
    padding: "0.75rem 1rem",
  },
  techName: {
    margin: 0,
    fontSize: "0.88rem",
    fontWeight: 700,
    color: "#f8fafc",
  },
  techRole: {
    margin: 0,
    fontSize: "0.72rem",
    color: "#475569",
  },

  /* Final CTA */
  ctaSection: {
    padding: "5rem 1.25rem",
  },
  ctaCard: {
    backgroundColor: "rgba(249,115,22,0.06)",
    border: "1px solid rgba(249,115,22,0.2)",
    borderRadius: "1.5rem",
    padding: "3.5rem 2rem",
    textAlign: "center",
    maxWidth: "48rem",
    margin: "0 auto",
  },
  ctaHeading: {
    margin: "0 0 0.75rem",
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "clamp(1.8rem, 4vw, 2.5rem)",
    fontWeight: 900,
    color: "#f8fafc",
  },
  ctaSubtext: {
    margin: "0 0 2rem",
    color: "#64748b",
    fontSize: "1rem",
  },
  ctaButtons: {
    display: "flex",
    gap: "1rem",
    justifyContent: "center",
    flexWrap: "wrap",
  },

  /* Footer */
  footer: {
    borderTop: "1px solid rgba(255,255,255,0.07)",
    padding: "1.5rem 1.25rem 2rem",
    backgroundColor: "#0d1117",
  },
  footerInner: {
    maxWidth: "72rem",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0.4rem",
    textAlign: "center",
  },
  footerLogo: {
    margin: 0,
    fontFamily: "'Barlow Condensed', sans-serif",
    fontSize: "1.1rem",
    fontWeight: 900,
    letterSpacing: "0.08em",
    color: "#ffffff",
  },
  footerText: {
    margin: 0,
    color: "#475569",
    fontSize: "0.82rem",
  },
  footerDisclaimer: {
    margin: 0,
    color: "#334155",
    fontSize: "0.75rem",
  },
};

const css = `
  @media (max-width: 768px) {
    .features-grid {
      grid-template-columns: 1fr !important;
    }
    .assets-grid {
      grid-template-columns: 1fr !important;
    }
    .tech-grid {
      grid-template-columns: repeat(2, 1fr) !important;
    }
  }
  @media (max-width: 480px) {
    .tech-grid {
      grid-template-columns: 1fr !important;
    }
  }
  .features-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1rem;
  }
  .assets-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 1.5rem;
  }
  .tech-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
`;