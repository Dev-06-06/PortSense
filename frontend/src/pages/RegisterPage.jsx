import { useEffect, useState } from "react";
import api from "../services/api";
import { Link, useNavigate } from "react-router-dom";
import { useGoogleAuth } from "../hooks/useGoogleAuth";
import { prefetchRoute } from "../routes/prefetch";

const RegisterPage = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { initGoogleButton } = useGoogleAuth("/dashboard");

  useEffect(() => {
    document.title = "Register | PortSense";
  }, []);

  useEffect(() => {
    initGoogleButton("google-register-btn");
  }, [initGoogleButton]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/register", { username, email, password });
      navigate("/verify-email", {
        state: { email: email.trim().toLowerCase() },
      });
    } catch (err) {
      const detail =
        err?.response?.data?.detail || err?.response?.data?.message;
      if (detail === "Email already registered") {
        setError(
          "An account with this email already exists. Please log in instead.",
        );
      } else {
        setError(detail || "Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        backgroundColor: "#0d1117",
        display: "grid",
        placeItems: "center",
        padding: "1.5rem",
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "26rem",
          backgroundColor: "#111827",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: "1.25rem",
          padding: "2rem",
          color: "#fff",
          boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
        }}
      >
        {/* Logo button */}
        <button
          type="button"
          onClick={() => navigate("/")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.6rem",
            background: "none",
            border: "none",
            padding: 0,
            marginBottom: "1.75rem",
            cursor: "pointer",
            justifyContent: "center",
            width: "100%",
          }}
        >
          <div
            style={{
              width: "32px",
              height: "32px",
              borderRadius: "50%",
              backgroundColor: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span
              style={{
                color: "#fff",
                fontSize: "14px",
                fontWeight: 900,
                fontFamily: "'DM Sans', sans-serif",
              }}
            >
              P
            </span>
          </div>
          <div
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontWeight: 900,
              letterSpacing: "0.18em",
              fontSize: "1.6rem",
            }}
          >
            <span style={{ color: "#fff" }}>PORT</span>
            <span style={{ color: "#f97316" }}>SENSE</span>
          </div>
        </button>

        <div style={{ marginBottom: "1.5rem" }}>
          <p
            style={{
              margin: "0 0 0.25rem",
              fontSize: "0.7rem",
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#f97316",
            }}
          >
            GET STARTED
          </p>
          <h1
            style={{
              margin: 0,
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "2.5rem",
              fontWeight: 900,
              letterSpacing: "0.04em",
              color: "#fff",
              lineHeight: 1,
            }}
          >
            REGISTER
          </h1>
          <p
            style={{
              margin: "0.25rem 0 0",
              fontSize: "0.85rem",
              color: "#64748b",
            }}
          >
            Create your account to manage your portfolio.
          </p>
        </div>

        {error && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.65rem 0.9rem",
              backgroundColor: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              borderRadius: "0.75rem",
              color: "#fca5a5",
              fontSize: "0.85rem",
            }}
          >
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={{ display: "grid", gap: "0.9rem" }}>
            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                USERNAME
              </label>
              <input
                type="text"
                placeholder="Your name"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="name"
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backgroundColor: "#0f172a",
                  color: "#fff",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  boxSizing: "border-box",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.9rem",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#f97316")}
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")
                }
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                EMAIL
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                style={{
                  width: "100%",
                  border: "1px solid rgba(255,255,255,0.12)",
                  backgroundColor: "#0f172a",
                  color: "#fff",
                  borderRadius: "0.75rem",
                  padding: "0.75rem 1rem",
                  boxSizing: "border-box",
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: "0.9rem",
                  outline: "none",
                  transition: "border-color 0.2s",
                }}
                onFocus={(e) => (e.currentTarget.style.borderColor = "#f97316")}
                onBlur={(e) =>
                  (e.currentTarget.style.borderColor = "rgba(255,255,255,0.12)")
                }
              />
            </div>

            <div>
              <label
                style={{
                  display: "block",
                  marginBottom: "0.4rem",
                  fontSize: "0.72rem",
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  color: "#94a3b8",
                }}
              >
                PASSWORD
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Minimum 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "#0f172a",
                    color: "#fff",
                    borderRadius: "0.75rem",
                    padding: "0.75rem 3.5rem 0.75rem 1rem",
                    boxSizing: "border-box",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "0.9rem",
                    outline: "none",
                    transition: "border-color 0.2s",
                  }}
                  onFocus={(e) =>
                    (e.currentTarget.style.borderColor = "#f97316")
                  }
                  onBlur={(e) =>
                    (e.currentTarget.style.borderColor =
                      "rgba(255,255,255,0.12)")
                  }
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    padding: "0.25rem",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <line
                        x1="1"
                        y1="1"
                        x2="23"
                        y2="23"
                        stroke="#64748b"
                        strokeWidth="1.4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <svg
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      xmlns="http://www.w3.org/2000/svg"
                    >
                      <path
                        d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"
                        stroke="#64748b"
                        strokeWidth="1.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      <circle cx="12" cy="12" r="3" fill="#64748b" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                border: "none",
                borderRadius: "0.75rem",
                padding: "0.85rem 1rem",
                backgroundColor: loading ? "#7c3a10" : "#f97316",
                color: "#fff",
                textTransform: "uppercase",
                fontWeight: 900,
                letterSpacing: "0.15em",
                cursor: loading ? "not-allowed" : "pointer",
                fontSize: "0.85rem",
                fontFamily: "'DM Sans', sans-serif",
                transition: "background-color 0.2s",
              }}
            >
              REGISTER
            </button>
          </div>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            margin: "1.25rem 0",
          }}
        >
          <div
            style={{
              height: "1px",
              flex: 1,
              background: "rgba(255,255,255,0.08)",
            }}
          />
          <span
            style={{
              fontSize: "0.75rem",
              color: "#475569",
              whiteSpace: "nowrap",
            }}
          >
            or continue with
          </span>
          <div
            style={{
              height: "1px",
              flex: 1,
              background: "rgba(255,255,255,0.08)",
            }}
          />
        </div>

        <div
          id="google-register-btn"
          style={{ width: "100%", display: "flex", justifyContent: "center" }}
        />

        <p
          style={{
            marginTop: "1.25rem",
            marginBottom: 0,
            textAlign: "center",
            fontSize: "0.875rem",
            color: "#94a3b8",
          }}
        >
          Already have an account?{" "}
          <Link
            to="/login"
            style={{
              color: "#f97316",
              fontWeight: 700,
              textDecoration: "none",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "#fb923c")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "#f97316")}
            onMouseEnter={() => prefetchRoute("/login")}
          >
            Login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;
