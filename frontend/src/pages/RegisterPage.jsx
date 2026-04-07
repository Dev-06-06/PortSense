import { useEffect, useState } from "react";
import api from "../services/api";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { prefetchRoute } from "../routes/prefetch";

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  display: "grid",
  placeItems: "center",
  padding: "1.5rem",
};

const cardStyle = {
  width: "100%",
  maxWidth: "28rem",
  backgroundColor: "#111827",
  border: "1px solid rgba(255, 255, 255, 0.12)",
  borderRadius: "1rem",
  padding: "1.5rem",
  color: "#fff",
};

const fieldStyle = {
  width: "100%",
  border: "1px solid rgba(255, 255, 255, 0.2)",
  backgroundColor: "#0f172a",
  color: "#fff",
  borderRadius: "0.75rem",
  padding: "0.75rem",
  boxSizing: "border-box",
};

const buttonStyle = {
  width: "100%",
  border: "none",
  borderRadius: "0.75rem",
  padding: "0.85rem 1rem",
  backgroundColor: "#f97316",
  color: "#fff",
  textTransform: "uppercase",
  fontWeight: 900,
  letterSpacing: "0.2em",
  cursor: "pointer",
};

const logoStyle = {
  marginTop: 0,
  marginBottom: "1rem",
  fontFamily: "'Barlow Condensed', sans-serif",
  fontSize: "2rem",
  fontWeight: 700,
  letterSpacing: "0.1em",
  lineHeight: 1,
};

const getTokenFromResponse = (data) =>
  data?.token || data?.access_token || data?.accessToken;

const RegisterPage = () => {
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    document.title = "Register | PortSense";
  }, []);

  const onSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await api.post("/api/auth/register", {
        username,
        email,
        password,
      });
      const token = getTokenFromResponse(response.data);

      if (!token) {
        throw new Error("No token returned from server");
      }

      login(token);
      navigate("/dashboard");
    } catch (err) {
      const detail = err?.response?.data?.detail;
      if (detail === "Email already registered") {
        setError(
          "An account with this email already exists. Please log in instead.",
        );
      } else {
        setError("Registration failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={shellStyle}>
      <form onSubmit={onSubmit} style={cardStyle}>
        <h2
          style={{ ...logoStyle, cursor: "pointer" }}
          onClick={() => navigate("/")}
        >
          <span style={{ color: "#ffffff" }}>PORT</span>
          <span style={{ color: "#f97316" }}>SENSE</span>
        </h2>
        <h1 style={{ marginTop: 0, marginBottom: "1rem" }}>Register</h1>

        <div style={{ display: "grid", gap: "0.85rem" }}>
          <input
            className="border border-white/20 bg-slate-900 text-white rounded-xl p-3"
            type="text"
            placeholder="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            style={fieldStyle}
          />

          <input
            className="border border-white/20 bg-slate-900 text-white rounded-xl p-3"
            type="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            style={fieldStyle}
          />

          <div style={{ position: "relative" }}>
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              style={{ ...fieldStyle, paddingRight: "3rem" }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              style={{
                position: "absolute",
                right: "0.75rem",
                top: "50%",
                transform: "translateY(-50%)",
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "#94a3b8",
                fontSize: "0.8rem",
                fontWeight: 600,
                padding: "0.25rem",
                userSelect: "none",
              }}
              aria-label={showPassword ? "Hide password" : "Show password"}
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>

          {error && <p style={{ margin: 0, color: "#ef4444" }}>{error}</p>}

          <button type="submit" style={buttonStyle} disabled={loading}>
            {loading ? "Creating account..." : "Register"}
          </button>
        </div>

        <p style={{ marginBottom: 0, marginTop: "1rem", color: "#cbd5e1" }}>
          Already have an account?{" "}
          <Link
            to="/login"
            style={{ color: "#f97316", fontWeight: 700 }}
            onMouseEnter={() => prefetchRoute("/login")}
            onFocus={() => prefetchRoute("/login")}
            onTouchStart={() => prefetchRoute("/login")}
          >
            Login
          </Link>
        </p>
      </form>
    </div>
  );
};

export default RegisterPage;
