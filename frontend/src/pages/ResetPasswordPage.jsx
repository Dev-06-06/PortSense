import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    setError("");
    setSuccess("");
  }, [step]);

  const handleSendEmail = async (event) => {
    event.preventDefault();
    setError("");

    if (!email.trim()) {
      setError("Email is required");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to send OTP");
      }

      setStep(2);
      setSuccess("If an account exists, an OTP has been sent.");
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = async (event) => {
    event.preventDefault();
    setError("");

    if (!otp.trim() || !newPassword) {
      setError("OTP and new password are required");
      return;
    }

    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    try {
      setSubmitting(true);
      const response = await fetch(`${API_BASE}/api/auth/reset-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          otp: otp.trim(),
          newPassword,
        }),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Unable to reset password");
      }

      setSuccess("Password reset successful! Redirecting to login...");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.message || "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-[#0d1117] px-4 py-10 text-white"
      style={{ fontFamily: "'DM Sans', sans-serif" }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=Barlow+Condensed:wght@600;700;800;900&display=swap');
        .score-num { font-family: 'Barlow Condensed', sans-serif; }
      `}</style>

      <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-2xl border border-white/8 bg-slate-900/60 p-6 shadow-2xl shadow-black/30">
          <div className="mb-6 flex justify-center">
            <button
              onClick={() => navigate("/")}
              style={{ all: "unset", cursor: "pointer" }}
            >
              <div className="flex items-center gap-2">
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: "50%",
                    background: "#2563eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <span
                    style={{ fontSize: 14, fontWeight: 900, color: "#0d1117" }}
                  >
                    P
                  </span>
                </div>
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', sans-serif",
                    fontSize: 18,
                    fontWeight: 900,
                    letterSpacing: "0.18em",
                    textTransform: "uppercase",
                    color: "#fff",
                  }}
                >
                  PortSense
                </span>
              </div>
            </button>
          </div>

          <div className="mb-5">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-[#2563eb]">
              PortSense Access
            </p>
            <h1 className="score-num mt-2 text-4xl font-extrabold uppercase tracking-wide text-white">
              Reset Password
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Reset your password using an OTP sent to your email.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/10 px-3 py-2 text-sm text-red-300">
              {error}
            </div>
          )}

          {success && (
            <div className="mb-4 rounded-xl border border-green-500/35 bg-green-500/10 px-3 py-2 text-sm text-green-300">
              {success}
            </div>
          )}

          {step === 1 && (
            <form onSubmit={handleSendEmail} className="space-y-4">
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
                >
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#2563eb]"
                  placeholder="you@example.com"
                  autoComplete="email"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl border border-[#2563eb]/40 bg-[#2563eb] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Sending..." : "Send OTP"}
              </button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={handleReset} className="space-y-4">
              <div>
                <label
                  htmlFor="otp"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
                >
                  OTP
                </label>
                <input
                  id="otp"
                  type="text"
                  value={otp}
                  onChange={(event) => setOtp(event.target.value)}
                  className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#2563eb]"
                  placeholder="Enter OTP"
                  required
                />
              </div>

              <div>
                <label
                  htmlFor="newPassword"
                  className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-slate-400"
                >
                  New Password
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    className="w-full rounded-xl border border-white/8 bg-slate-800 px-3 py-2.5 text-sm text-white outline-none transition-all focus:ring-2 focus:ring-[#2563eb]"
                    placeholder="Min. 6 characters"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-[#2563eb]"
                    tabIndex={-1}
                  >
                    {showPassword ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="18"
                        height="18"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-xl border border-[#2563eb]/40 bg-[#2563eb] px-4 py-2.5 text-sm font-black uppercase tracking-widest text-white transition-all hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          )}

          <p className="mt-5 text-center text-sm text-slate-400">
            <Link
              to="/login"
              className="font-semibold text-[#2563eb] hover:text-blue-500"
            >
              ← Back to Login
            </Link>
          </p>
        </section>
      </div>
    </main>
  );
}
