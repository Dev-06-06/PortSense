import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function VerifyEmailPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const email = location.state?.email || "";

  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [submitting, setSubmitting] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!email) navigate("/register", { replace: true });
  }, [email, navigate]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length === 6) {
      setOtp(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const otpString = otp.join("");
    if (otpString.length !== 6) {
      setError("Please enter the complete 6-digit OTP");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/verify-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otpString }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message);
      login(data.token, data.user);
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setResending(true);
    setError("");
    setSuccess("");
    try {
      const res = await fetch(`${API_BASE}/api/auth/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || data.message);
      setSuccess("New OTP sent to your email");
      setCountdown(60);
      setOtp(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } catch (err) {
      setError(err.message);
    } finally {
      setResending(false);
    }
  };

  const otpFilled = otp.join("").length === 6;

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
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .otp-input {
          width: 48px;
          height: 56px;
          text-align: center;
          font-size: 1.5rem;
          font-weight: 900;
          color: #fff;
          background-color: #0f172a;
          border: 1px solid rgba(255,255,255,0.12);
          border-radius: 0.75rem;
          outline: none;
          font-family: 'Barlow Condensed', sans-serif;
          transition: border-color 0.2s, box-shadow 0.2s;
          caret-color: #f97316;
        }
        .otp-input:focus {
          border-color: #f97316;
          box-shadow: 0 0 0 2px rgba(249,115,22,0.25);
        }
      `}</style>

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
        {/* Logo */}
        <div
          onClick={() => navigate("/")}
          style={{
            cursor: "pointer",
            marginBottom: "1.75rem",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.6rem",
          }}
        >
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: "50%",
              background: "#f97316",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ fontSize: 14, fontWeight: 900, color: "#0d1117" }}>
              P
            </span>
          </div>
          <span
            style={{
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "1.6rem",
              fontWeight: 900,
              letterSpacing: "0.12em",
            }}
          >
            <span style={{ color: "#fff" }}>PORT</span>
            <span style={{ color: "#f97316" }}>SENSE</span>
          </span>
        </div>

        {/* Heading */}
        <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
          <p
            style={{
              margin: "0 0 0.25rem",
              fontSize: "0.65rem",
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              color: "#f97316",
            }}
          >
            One Step Left
          </p>
          <h1
            style={{
              margin: "0 0 0.5rem",
              fontFamily: "'Barlow Condensed', sans-serif",
              fontSize: "2.5rem",
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "#fff",
            }}
          >
            Verify Email
          </h1>
          <p style={{ margin: 0, fontSize: "0.85rem", color: "#64748b" }}>
            We sent a 6-digit OTP to
          </p>
          <p
            style={{
              margin: "0.2rem 0 0",
              fontSize: "0.875rem",
              fontWeight: 700,
              color: "#fff",
            }}
          >
            {email}
          </p>
        </div>

        {/* Error */}
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

        {/* Success */}
        {success && (
          <div
            style={{
              marginBottom: "1rem",
              padding: "0.65rem 0.9rem",
              backgroundColor: "rgba(16,185,129,0.1)",
              border: "1px solid rgba(16,185,129,0.3)",
              borderRadius: "0.75rem",
              color: "#6ee7b7",
              fontSize: "0.85rem",
            }}
          >
            {success}
          </div>
        )}

        {/* OTP Boxes */}
        <div
          onPaste={handlePaste}
          style={{
            display: "flex",
            justifyContent: "center",
            gap: "0.5rem",
            marginBottom: "1.5rem",
          }}
        >
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => (inputRefs.current[index] = el)}
              className="otp-input"
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
            />
          ))}
        </div>

        {/* Verify Button */}
        <button
          type="button"
          onClick={handleVerify}
          disabled={submitting || !otpFilled}
          style={{
            width: "100%",
            border: "none",
            borderRadius: "0.75rem",
            padding: "0.85rem 1rem",
            backgroundColor: !otpFilled || submitting ? "#7c3a10" : "#f97316",
            color: "#fff",
            textTransform: "uppercase",
            fontWeight: 900,
            letterSpacing: "0.15em",
            cursor: !otpFilled || submitting ? "not-allowed" : "pointer",
            fontSize: "0.85rem",
            fontFamily: "'DM Sans', sans-serif",
            opacity: !otpFilled || submitting ? 0.6 : 1,
            transition: "background-color 0.2s",
          }}
        >
          {submitting ? "Verifying..." : "Verify & Continue"}
        </button>

        {/* Resend */}
        <div style={{ textAlign: "center", marginTop: "1rem" }}>
          <button
            type="button"
            onClick={handleResend}
            disabled={countdown > 0 || resending}
            style={{
              background: "none",
              border: "none",
              cursor: countdown > 0 ? "not-allowed" : "pointer",
              color: countdown > 0 ? "#475569" : "#f97316",
              fontSize: "0.85rem",
              fontFamily: "'DM Sans', sans-serif",
              opacity: countdown > 0 ? 0.6 : 1,
            }}
          >
            {resending
              ? "Sending..."
              : countdown > 0
                ? `Resend OTP in ${countdown}s`
                : "Resend OTP"}
          </button>
        </div>

        {/* Wrong email */}
        <p
          style={{
            marginTop: "1rem",
            marginBottom: 0,
            textAlign: "center",
            fontSize: "0.875rem",
            color: "#64748b",
          }}
        >
          Wrong email?{" "}
          <button
            type="button"
            onClick={() => navigate("/register")}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#f97316",
              fontWeight: 700,
              fontSize: "0.875rem",
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            Go back
          </button>
        </p>
      </div>
    </div>
  );
}
