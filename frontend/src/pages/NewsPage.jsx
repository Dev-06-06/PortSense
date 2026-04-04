import { useEffect, useState } from "react";
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

const categories = [
  { label: "All", value: "all" },
  { label: "Market", value: "market" },
  { label: "Banking", value: "banking" },
  { label: "IT", value: "it" },
  { label: "Pharma", value: "pharma" },
  { label: "Auto", value: "auto" },
  { label: "Energy", value: "energy" },
];

const NewsPage = () => {
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [hoveredIndex, setHoveredIndex] = useState(null);

  const fetchNews = async (category) => {
    setLoading(true);
    setError("");

    try {
      const response = await api.get(
        `/api/news/feed?category=${encodeURIComponent(category)}`,
      );

      const payload = response?.data || {};
      if (payload?.error) {
        setArticles([]);
        setError("News feed unavailable. Try again later.");
        return;
      }

      const nextArticles = Array.isArray(payload?.articles)
        ? payload.articles
        : [];
      setArticles(nextArticles);
    } catch {
      setArticles([]);
      setError("News feed unavailable. Try again later.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    document.title = "Market News | PortSense";
  }, []);

  useEffect(() => {
    fetchNews(activeCategory);
  }, [activeCategory]);

  useEffect(() => {
    const intervalId = window.setInterval(
      () => {
        fetchNews(activeCategory);
      },
      15 * 60 * 1000,
    );

    return () => window.clearInterval(intervalId);
  }, [activeCategory]);

  return (
    <div style={shellStyle}>
      <style>{`
        .news-skeleton {
          animation: news-pulse 1.2s ease-in-out infinite;
        }

        @keyframes news-pulse {
          0% { opacity: 0.35; }
          50% { opacity: 0.8; }
          100% { opacity: 0.35; }
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
            Market News
          </h1>
          <p
            style={{
              margin: 0,
              color: "#94a3b8",
              fontSize: "0.9rem",
            }}
          >
            Live NSE/BSE news feed
          </p>
        </div>

        <div
          style={{
            ...cardStyle,
            padding: "0.75rem",
            overflowX: "auto",
            display: "flex",
            gap: "0.5rem",
            whiteSpace: "nowrap",
          }}
        >
          {categories.map((category) => (
            <button
              key={category.value}
              type="button"
              onClick={() => setActiveCategory(category.value)}
              style={{
                border: "none",
                borderRadius: "999px",
                padding: "0.45rem 0.85rem",
                fontSize: "0.78rem",
                fontWeight: 700,
                cursor: "pointer",
                color:
                  activeCategory === category.value ? "#111827" : "#cbd5e1",
                backgroundColor:
                  activeCategory === category.value ? "#f97316" : "#1e293b",
                transition: "all 0.2s ease",
              }}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div style={{ ...cardStyle, padding: "0.8rem" }}>
          {loading ? (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {Array.from({ length: 3 }).map((_, idx) => (
                <div
                  key={`skeleton-${idx}`}
                  className="news-skeleton"
                  style={{
                    backgroundColor: "#111827",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "12px",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                  }}
                >
                  <div
                    style={{
                      height: "16px",
                      width: "84%",
                      borderRadius: "6px",
                      backgroundColor: "rgba(148, 163, 184, 0.2)",
                      marginBottom: "12px",
                    }}
                  />
                  <div
                    style={{
                      height: "12px",
                      width: "60%",
                      borderRadius: "6px",
                      backgroundColor: "rgba(148, 163, 184, 0.18)",
                    }}
                  />
                </div>
              ))}
            </div>
          ) : error ? (
            <div
              style={{
                minHeight: "12rem",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                gap: "0.8rem",
              }}
            >
              <p style={{ margin: 0, color: "#cbd5e1" }}>
                News feed unavailable. Try again later.
              </p>
              <button
                type="button"
                onClick={() => fetchNews(activeCategory)}
                style={{
                  border: "none",
                  borderRadius: "0.6rem",
                  padding: "0.5rem 0.9rem",
                  fontWeight: 700,
                  color: "#111827",
                  backgroundColor: "#f97316",
                  cursor: "pointer",
                }}
              >
                Retry
              </button>
            </div>
          ) : articles.length === 0 ? (
            <div
              style={{
                minHeight: "12rem",
                display: "grid",
                placeItems: "center",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: "0.95rem",
              }}
            >
              No news available for this category
            </div>
          ) : (
            <div>
              {articles.map((article, index) => (
                <button
                  key={`${article.link || article.title}-${index}`}
                  type="button"
                  onClick={() => {
                    if (article?.link) {
                      window.open(
                        article.link,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }
                  }}
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  style={{
                    width: "100%",
                    textAlign: "left",
                    borderRadius: "12px",
                    padding: "16px",
                    marginBottom: "12px",
                    border:
                      hoveredIndex === index
                        ? "1px solid #f97316"
                        : "1px solid rgba(148, 163, 184, 0.22)",
                    backgroundColor: "#111827",
                    cursor: "pointer",
                  }}
                >
                  <p
                    style={{
                      margin: "0 0 10px",
                      color: "#ffffff",
                      fontSize: "15px",
                      fontWeight: 600,
                      lineHeight: 1.4,
                    }}
                  >
                    {article?.title || "Untitled article"}
                  </p>

                  <div
                    style={{
                      color: "#64748b",
                      fontSize: "12px",
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "1rem",
                    }}
                  >
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: "60%",
                      }}
                    >
                      {article?.source || "Unknown source"}
                    </span>
                    <span
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {article?.pubDate || ""}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NewsPage;
