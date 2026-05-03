import { useEffect, useState } from "react";
import api from "../services/api";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { prefetchRoute } from "../routes/prefetch";
import { useGoogleAuth } from "../hooks/useGoogleAuth";

const LoginPage = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { initGoogleButton } = useGoogleAuth("/dashboard");

  useEffect(() => {
    document.title = "Login | PortSense";
  }, []);

  useEffect(() => {
    initGoogleButton("google-login-btn");
  }, [initGoogleButton]);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await api.post("/api/auth/login", { email, password });
      const token = response.data?.token || response.data?.access_token;
      if (!token) throw new Error("No token returned");
      login(token, response.data?.user);
      navigate("/dashboard");
    } catch (err) {
      const msg = err?.response?.data?.detail || err?.response?.data?.message;
      setError(msg || "Login failed. Please check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const [eyeHover, setEyeHover] = useState(false);
  const [forgotHover, setForgotHover] = useState(false);

  return (
    <div style={{
      minHeight: "100vh",
      backgroundColor: "#0d1117",
      display: "grid",
      placeItems: "center",
      padding: "1.5rem",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');`}</style>

      <div style={{
        width: "100%",
        maxWidth: "26rem",
        backgroundColor: "#111827",
        border: "1px solid rgba(255,255,255,0.1)",
        borderRadius: "1.25rem",
        padding: "2rem",
        color: "#fff",
        boxShadow: "0 25px 50px rgba(0,0,0,0.5)",
      }}>

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
          }}
        >
          <div style={{
            width: "32px",
            height: "32px",
            borderRadius: "50%",
            backgroundColor: "#f97316",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}>
            <span style={{ color: "#fff", fontSize: "14px", fontWeight: 900, fontFamily: "'DM Sans', sans-serif" }}>P</span>
          </div>
          <div style={{
            fontFamily: "'Barlow Condensed', sans-serif",
            fontWeight: 900,
            letterSpacing: "0.18em",
            color: "#fff",
            fontSize: "1rem",
          }}>PORTSENSE</div>
        </button>

        {/* Heading */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div style={{ margin: 0, marginBottom: "0.25rem", fontSize: "0.65rem", fontWeight: 800, letterSpacing: "0.2em", textTransform: "uppercase", color: "#f97316" }}>WELCOME BACK</div>
          <h1 style={{ margin: 0, fontFamily: "'Barlow Condensed', sans-serif", fontSize: "2.5rem", fontWeight: 900, color: "#fff" }}>LOGIN</h1>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.85rem", color: "#64748b" }}>Continue tracking your portfolio.</p>
        </div>

        {error && (
          <div style={{
            marginBottom: "1rem",
            padding: "0.65rem 0.9rem",
            backgroundColor: "rgba(239,68,68,0.1)",
            border: "1px solid rgba(239,68,68,0.3)",
            borderRadius: "0.75rem",
            color: "#fca5a5",
            fontSize: "0.85rem",
          }}>{error}</div>
        )}

        <form onSubmit={onSubmit}>
          <div style={{ display: "grid", gap: "0.9rem" }}>

            {/* Email */}
            <div>
              <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94a3b8" }}>Email</label>
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
                }}
              />
            </div>

            {/* Password */}
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.4rem" }}>
                <label style={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.15em", textTransform: "uppercase", color: "#94a3b8" }}>Password</label>
                <Link
                  to="/reset-password"
                  onMouseEnter={() => setForgotHover(true)}
                  onMouseLeave={() => setForgotHover(false)}
                  style={{ fontSize: "0.75rem", color: forgotHover ? "#f97316" : "#64748b", textDecoration: "none" }}
                >
                  Forgot password?
                </Link>
              </div>

              <div style={{ position: "relative" }}>
                <input
                  type={showPassword ? "text" : "password"}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    border: "1px solid rgba(255,255,255,0.12)",
                    backgroundColor: "#0f172a",
                    color: "#fff",
                    borderRadius: "0.75rem",
                    padding: "0.75rem 1rem",
                    paddingRight: "3.5rem",
                    boxSizing: "border-box",
                    fontFamily: "'DM Sans', sans-serif",
                    fontSize: "0.9rem",
                    outline: "none",
                  }}
                />

                <button
                  type="button"
                  onClick={() => setShowPassword((p) => !p)}
                  onMouseEnter={() => setEyeHover(true)}
                  onMouseLeave={() => setEyeHover(false)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  style={{
                    position: "absolute",
                    right: "0.75rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    background: "none",
                    border: "none",
                    padding: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                  }}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" stroke={eyeHover ? "#f97316" : "#64748b"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" stroke={eyeHover ? "#f97316" : "#64748b"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                      <line x1="1" y1="1" x2="23" y2="23" stroke={eyeHover ? "#f97316" : "#64748b"} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke={eyeHover ? "#f97316" : "#64748b"} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="3" fill={eyeHover ? "#f97316" : "#64748b"} />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              style={{
                width: "100%",
                border: "none",
                borderRadius: "0.75rem",
                padding: "0.85rem",
                backgroundColor: loading ? "#7c3a10" : "#f97316",
                color: "#fff",
                fontFamily: "'Barlow Condensed', sans-serif",
                fontSize: "1rem",
                fontWeight: 900,
                letterSpacing: "0.2em",
                cursor: loading ? "not-allowed" : "pointer",
                textTransform: "none",
              }}
            >
              {loading ? "LOGGING IN..." : "LOGIN"}
            </button>
          </div>
        </form>

        {/* OR Divider */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1.25rem 0" }}>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
          <div style={{ fontSize: "0.75rem", color: "#475569" }}>or</div>
          <div style={{ flex: 1, height: "1px", background: "rgba(255,255,255,0.1)" }} />
        </div>

        {/* Google Button Container */}
        <div id="google-login-btn" style={{ width: "100%", display: "flex", justifyContent: "center" }} />

        {/* Register link */}
        <p style={{ marginTop: "1.25rem", marginBottom: 0, textAlign: "center", fontSize: "0.875rem", color: "#94a3b8" }}>
          Don't have an account?{' '}
          <Link to="/register" onMouseEnter={() => prefetchRoute("/register") } style={{ color: "#f97316", fontWeight: 700, textDecoration: "none" }}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;