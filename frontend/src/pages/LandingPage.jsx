import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const features = [
  {
    icon: "📊",
    title: "Live P&L",
    description:
      "Real-time profit and loss for every holding with day change tracking",
  },
  {
    icon: "🧠",
    title: "AI Rebalancing",
    description: "Gemini-powered advice grounded in your actual portfolio data",
  },
  {
    icon: "📰",
    title: "FinBERT Sentiment",
    description: "NLP sentiment analysis on live NSE financial news headlines",
  },
  {
    icon: "🔍",
    title: "Sector Analysis",
    description:
      "Spot hidden concentration risk before it impacts your returns",
  },
  {
    icon: "🔗",
    title: "Correlation Heatmap",
    description: "Visualise which stocks move together and over-diversify",
  },
  {
    icon: "📈",
    title: "Nifty Benchmark",
    description:
      "Know if you're actually beating the index with XIRR comparison",
  },
  {
    icon: "⚡",
    title: "Stress Testing",
    description: "Simulate market crashes — see your P&L under 6 scenarios",
  },
  {
    icon: "👁",
    title: "Stock Intel Drawer",
    description:
      "Deep-dive on any stock: technicals, fundamentals, AI analysis",
  },
  {
    icon: "📋",
    title: "Watchlist",
    description: "Monitor stocks you don't own yet with live price + sentiment",
  },
];

function LandingPage() {
  const navigate = useNavigate();
  const { user, login } = useAuth();
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState("");

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
    <div style={styles.page}>
      <style>{responsiveCss}</style>

      <main style={styles.main}>
        <section style={styles.hero}>
          <h1 style={styles.heading}>
            <span>Know Your Portfolio.</span>
            <span style={styles.headingAccent}>Before It Surprises You.</span>
          </h1>
          <p style={styles.subheading}>
            AI-powered risk analysis for Indian retail investors.
          </p>

          <div
            style={{
              display: "flex",
              gap: "2rem",
              marginTop: "1.5rem",
              flexWrap: "wrap",
            }}
          >
            {[
              { value: "10+", label: "Analytics Modules" },
              { value: "AI", label: "Gemini + FinBERT" },
              { value: "Live", label: "NSE Market Data" },
            ].map((stat) => (
              <div key={stat.label}>
                <p
                  style={{
                    margin: 0,
                    fontSize: "1.8rem",
                    fontWeight: 900,
                    fontFamily: "Barlow Condensed, sans-serif",
                    color: "#f97316",
                  }}
                >
                  {stat.value}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "0.78rem",
                    color: "#64748b",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                  }}
                >
                  {stat.label}
                </p>
              </div>
            ))}
          </div>

          <div style={styles.ctaRow}>
            <button
              onClick={() =>
                user ? navigate("/dashboard") : navigate("/login")
              }
              style={{
                ...styles.button,
                ...styles.primaryButton,
                border: "none",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              Get Started
            </button>
            <button
              onClick={handleDemoLogin}
              disabled={demoLoading}
              style={{
                ...styles.button,
                ...styles.secondaryButton,
                cursor: demoLoading ? "not-allowed" : "pointer",
                opacity: demoLoading ? 0.7 : 1,
                border: "none",
                fontFamily: "inherit",
              }}
            >
              {demoLoading ? "Loading..." : "⚡ Try Demo"}
            </button>
          </div>

          {demoError && (
            <p
              style={{
                color: "#ef4444",
                fontSize: "0.8rem",
                marginTop: "0.5rem",
              }}
            >
              {demoError}
            </p>
          )}

          <p style={styles.tagline}>Free forever. No credit card required.</p>
        </section>

        <section style={{ padding: "2rem 0 1rem" }}>
          <p
            style={{
              margin: "0 0 1.5rem",
              color: "#64748b",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            How it works
          </p>
          <div
            style={{ display: "flex", flexDirection: "column", gap: "1rem" }}
          >
            {[
              {
                step: "01",
                title: "Add your holdings",
                desc: "Enter your NSE stocks with buy price and date",
              },
              {
                step: "02",
                title: "Get instant analysis",
                desc: "Live P&L, sector breakdown, beta, correlation — all computed automatically",
              },
              {
                step: "03",
                title: "Act on AI insights",
                desc: "Gemini rebalancing advice and FinBERT sentiment guide your next move",
              },
            ].map((item) => (
              <div
                key={item.step}
                style={{
                  display: "flex",
                  gap: "1rem",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{
                    fontFamily: "Barlow Condensed, sans-serif",
                    fontSize: "2rem",
                    fontWeight: 900,
                    color: "#1e293b",
                    lineHeight: 1,
                    minWidth: "2.5rem",
                  }}
                >
                  {item.step}
                </span>
                <div>
                  <p
                    style={{
                      margin: 0,
                      color: "#f8fafc",
                      fontWeight: 700,
                      fontSize: "1rem",
                    }}
                  >
                    {item.title}
                  </p>
                  <p
                    style={{
                      margin: "0.2rem 0 0",
                      color: "#94a3b8",
                      fontSize: "0.88rem",
                    }}
                  >
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section style={styles.featuresSection}>
          <p
            style={{
              margin: "0 0 1rem",
              color: "#64748b",
              fontSize: "0.75rem",
              fontWeight: 700,
              letterSpacing: "0.15em",
              textTransform: "uppercase",
            }}
          >
            What's inside
          </p>
          <div className="landing-features-grid" style={styles.featuresGrid}>
            {features.map((feature) => (
              <article key={feature.title} style={styles.card}>
                <div style={styles.iconCircle} aria-hidden="true">
                  <span style={styles.icon}>{feature.icon}</span>
                </div>
                <h3 style={styles.cardTitle}>{feature.title}</h3>
                <p style={styles.cardDescription}>{feature.description}</p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer style={styles.footer}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
          }}
        >
          <p
            style={{
              margin: 0,
              color: "#64748b",
              fontSize: "0.85rem",
              fontWeight: 700,
              fontFamily: "Barlow Condensed, sans-serif",
              letterSpacing: "0.05em",
            }}
          >
            PORTSENSE
          </p>
          <p style={{ margin: 0, color: "#475569", fontSize: "0.8rem" }}>
            Built for Indian retail investors · devtry55@gmail.com
          </p>
        </div>
      </footer>
    </div>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0d1117",
    color: "#ffffff",
    display: "flex",
    flexDirection: "column",
  },
  main: {
    width: "min(1120px, 100%)",
    margin: "0 auto",
    padding: "4.5rem 1.25rem 2.5rem",
    flex: 1,
  },
  hero: {
    minHeight: "100vh",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "flex-start",
    textAlign: "left",
  },
  heading: {
    margin: 0,
    color: "#ffffff",
    fontFamily: "Barlow Condensed, sans-serif",
    fontSize: "4rem",
    lineHeight: 1,
    letterSpacing: "-0.02em",
    display: "flex",
    flexDirection: "column",
    gap: "0.2rem",
  },
  headingAccent: {
    color: "#f97316",
    fontSize: "3.5rem",
  },
  subheading: {
    margin: "1.25rem 0 0",
    color: "#94a3b8",
    fontFamily: "DM Sans, sans-serif",
    fontSize: "1.25rem",
    maxWidth: "38rem",
  },
  ctaRow: {
    marginTop: "2rem",
    display: "flex",
    gap: "1rem",
    flexWrap: "wrap",
  },
  button: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    textDecoration: "none",
    textTransform: "uppercase",
    letterSpacing: "0.15em",
    fontWeight: 900,
    borderRadius: "0.75rem",
    padding: "1rem 2rem",
    fontSize: "0.95rem",
    minWidth: "11.5rem",
    transition:
      "transform 160ms ease, opacity 160ms ease, background 160ms ease",
  },
  primaryButton: {
    background: "#f97316",
    color: "#ffffff",
    border: "1px solid transparent",
  },
  secondaryButton: {
    background: "transparent",
    color: "#ffffff",
    border: "1px solid rgba(255, 255, 255, 0.2)",
  },
  tagline: {
    margin: "1rem 0 0",
    color: "#64748b",
    fontSize: "0.875rem",
  },
  featuresSection: {
    paddingBottom: "2rem",
  },
  featuresGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: "1rem",
  },
  card: {
    borderRadius: "1rem",
    border: "1px solid rgba(255, 255, 255, 0.08)",
    background: "rgba(15, 23, 42, 0.6)",
    padding: "1.5rem",
    textAlign: "left",
  },
  iconCircle: {
    height: "2.5rem",
    width: "2.5rem",
    borderRadius: "999px",
    background: "#f97316",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: "0.8rem",
  },
  icon: {
    fontSize: "1.1rem",
    lineHeight: 1,
  },
  cardTitle: {
    margin: 0,
    color: "#ffffff",
    fontWeight: 700,
    fontSize: "1.125rem",
  },
  cardDescription: {
    margin: "0.55rem 0 0",
    color: "#94a3b8",
    fontSize: "0.95rem",
  },
  footer: {
    borderTop: "1px solid rgba(255, 255, 255, 0.08)",
    padding: "1rem 1rem 1.6rem",
    background: "#0d1117",
  },
};

const responsiveCss = `
  @media (max-width: 900px) {
    .landing-features-grid {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 640px) {
    .landing-features-grid {
      gap: 0.85rem;
    }
  }
`;

export default LandingPage;
