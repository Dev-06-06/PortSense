import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "1.25rem",
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

const inputStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "8px 12px",
  fontSize: "0.95rem",
  width: "100%",
};

const outlineButtonStyle = {
  borderRadius: "1rem",
  background: "transparent",
  padding: "0.6rem 0.9rem",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatMemberSince = (createdAt) => {
  const createdDate = createdAt ? new Date(createdAt) : null;

  if (!createdDate || Number.isNaN(createdDate.getTime())) {
    return "Member since -";
  }

  const monthYear = new Intl.DateTimeFormat("en-US", {
    month: "long",
    year: "numeric",
  }).format(createdDate);

  return `Member since ${monthYear}`;
};

const EMPTY_SUMMARY = {
  totalInvested: 0,
  totalCurrentValue: 0,
  totalPnl: 0,
  holdingCount: 0,
};

const AccountPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [userDetails, setUserDetails] = useState(null);
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [isSavingUsername, setIsSavingUsername] = useState(false);
  const [usernameSuccess, setUsernameSuccess] = useState("");
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState("");

  useEffect(() => {
    document.title = "Account | PortSense";
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError("");

      try {
        const [meResponse, summaryResponse] = await Promise.all([
          api.get("/api/auth/me"),
          api.get("/api/holdings/summary"),
        ]);

        setUserDetails(meResponse.data || null);
        setSummary({
          ...EMPTY_SUMMARY,
          ...(summaryResponse.data || {}),
        });
      } catch {
        setError(
          "Unable to load account details. Please refresh and try again.",
        );
        setSummary(EMPTY_SUMMARY);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const displayName = userDetails?.username?.trim() || "User";
  const avatarLetter = (displayName.charAt(0) || "U").toUpperCase();

  const beginEditUsername = () => {
    setIsEditingUsername(true);
    setUsernameInput(displayName);
    setUsernameError("");
  };

  const cancelEditUsername = () => {
    setIsEditingUsername(false);
    setUsernameInput("");
    setUsernameError("");
  };

  const saveUsername = async () => {
    const trimmed = usernameInput.trim();

    if (trimmed.length < 3 || trimmed.length > 30) {
      setUsernameError("Username must be between 3 and 30 characters");
      return;
    }

    setUsernameError("");
    setIsSavingUsername(true);

    try {
      await api.put("/api/auth/update-username", { new_username: trimmed });
      setUserDetails((prev) => (prev ? { ...prev, username: trimmed } : prev));
      setIsEditingUsername(false);
      setUsernameInput("");
      setUsernameSuccess("Username updated");
      window.setTimeout(() => setUsernameSuccess(""), 2000);
    } catch (err) {
      if (err?.response?.status === 409) {
        setUsernameError("Username already taken");
      } else {
        setUsernameError(
          err?.response?.data?.detail || "Unable to update username",
        );
      }
    } finally {
      setIsSavingUsername(false);
    }
  };

  const submitPasswordChange = async (event) => {
    event.preventDefault();
    setPasswordError("");

    if (newPassword.length < 8) {
      setPasswordError("New password must be at least 8 characters");
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError("New password and confirm password must match");
      return;
    }

    setIsChangingPassword(true);

    try {
      await api.put("/api/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });

      setShowPasswordForm(false);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      setPasswordSuccess("Password changed successfully");
      window.setTimeout(() => setPasswordSuccess(""), 2000);
    } catch (err) {
      setPasswordError(
        err?.response?.data?.detail || "Unable to change password",
      );
    } finally {
      setIsChangingPassword(false);
    }
  };

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  return (
    <div style={shellStyle}>
      <style>{`
        .account-grid {
          display: grid;
          grid-template-columns: repeat(1, minmax(0, 1fr));
          gap: 0.75rem;
        }

        .account-stat {
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 0.9rem;
          padding: 0.85rem;
          background: rgba(13, 17, 23, 0.45);
        }

        @media (min-width: 640px) {
          .account-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>

      <div style={containerStyle}>
        <div style={{ ...cardStyle, padding: "1rem" }}>
          <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
            <div
              style={{
                width: "72px",
                height: "72px",
                borderRadius: "9999px",
                background: "rgba(249, 115, 22, 0.2)",
                border: "1px solid rgba(249, 115, 22, 0.45)",
                color: "#fb923c",
                display: "grid",
                placeItems: "center",
                fontSize: "2rem",
                fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                fontWeight: 700,
                lineHeight: 1,
                flexShrink: 0,
              }}
              aria-label="Avatar"
            >
              {avatarLetter}
            </div>

            <div style={{ minWidth: 0 }}>
              {!isEditingUsername ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    flexWrap: "wrap",
                  }}
                >
                  <h1
                    style={{
                      margin: 0,
                      color: "#ffffff",
                      fontSize: "1.5rem",
                      fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                      fontWeight: 600,
                      lineHeight: 1.05,
                    }}
                  >
                    {displayName}
                  </h1>
                  <button
                    type="button"
                    onClick={beginEditUsername}
                    aria-label="Edit username"
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(249, 115, 22, 0.4)",
                      borderRadius: "0.5rem",
                      cursor: "pointer",
                      color: "#fb923c",
                      fontSize: "0.9rem",
                      padding: "0.2rem 0.45rem",
                      lineHeight: 1,
                    }}
                  >
                    ✏️
                  </button>
                </div>
              ) : (
                <div style={{ marginBottom: "0.35rem" }}>
                  <input
                    type="text"
                    value={usernameInput}
                    onChange={(event) => setUsernameInput(event.target.value)}
                    style={inputStyle}
                    maxLength={30}
                    autoFocus
                  />
                  <div
                    style={{
                      display: "flex",
                      gap: "0.5rem",
                      marginTop: "0.5rem",
                      flexWrap: "wrap",
                    }}
                  >
                    <button
                      type="button"
                      onClick={saveUsername}
                      disabled={isSavingUsername}
                      style={{
                        ...outlineButtonStyle,
                        border: "1px solid rgba(249, 115, 22, 0.45)",
                        color: "#fb923c",
                      }}
                    >
                      {isSavingUsername ? "Saving..." : "Save"}
                    </button>
                    <button
                      type="button"
                      onClick={cancelEditUsername}
                      style={{
                        ...outlineButtonStyle,
                        border: "1px solid rgba(148, 163, 184, 0.45)",
                        color: "#cbd5e1",
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                  {usernameError && (
                    <p
                      style={{
                        margin: "0.5rem 0 0",
                        color: "#f87171",
                        fontSize: "0.85rem",
                      }}
                    >
                      {usernameError}
                    </p>
                  )}
                </div>
              )}
              {usernameSuccess && (
                <p
                  style={{
                    margin: "0.35rem 0 0",
                    color: "#22c55e",
                    fontSize: "0.85rem",
                  }}
                >
                  {usernameSuccess}
                </p>
              )}
              <p
                style={{
                  margin: "0.35rem 0 0",
                  color: "#94a3b8",
                  fontSize: "0.95rem",
                }}
              >
                {userDetails?.email || "-"}
              </p>
              <p
                style={{
                  margin: "0.35rem 0 0",
                  color: "#94a3b8",
                  fontSize: "0.85rem",
                }}
              >
                {formatMemberSince(userDetails?.createdAt)}
              </p>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "1rem" }}>
          <h2
            style={{
              margin: "0 0 0.85rem",
              color: "#f8fafc",
              fontSize: "1.05rem",
              fontWeight: 600,
            }}
          >
            Portfolio Summary
          </h2>

          <div className="account-grid">
            <div className="account-stat">
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Total Invested
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.15rem 0 0",
                  fontSize: "1.55rem",
                  color: "#f8fafc",
                }}
              >
                {formatCurrency(summary.totalInvested)}
              </p>
            </div>

            <div className="account-stat">
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Current Value
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.15rem 0 0",
                  fontSize: "1.55rem",
                  color: "#f8fafc",
                }}
              >
                {formatCurrency(summary.totalCurrentValue)}
              </p>
            </div>

            <div className="account-stat">
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Overall P&L
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.15rem 0 0",
                  fontSize: "1.55rem",
                  color: summary.totalPnl >= 0 ? "#22c55e" : "#ef4444",
                }}
              >
                {formatCurrency(summary.totalPnl)}
              </p>
            </div>

            <div className="account-stat">
              <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.82rem" }}>
                Holdings Count
              </p>
              <p
                style={{
                  ...numberStyle,
                  margin: "0.15rem 0 0",
                  fontSize: "1.55rem",
                  color: "#f8fafc",
                }}
              >
                {summary.holdingCount}
              </p>
            </div>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "1rem" }}>
          <h2
            style={{
              margin: 0,
              color: "#f8fafc",
              fontSize: "1.05rem",
              fontWeight: 600,
            }}
          >
            Account
          </h2>

          <div style={{ marginTop: "0.75rem" }}>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.8rem" }}>
              Email
            </p>
            <p
              style={{
                margin: "0.2rem 0 0",
                color: "#e2e8f0",
                fontSize: "0.98rem",
              }}
            >
              {userDetails?.email || "-"}
            </p>
          </div>
        </div>

        <div style={{ ...cardStyle, padding: "1rem" }}>
          {!showPasswordForm ? (
            <button
              type="button"
              onClick={() => {
                setShowPasswordForm(true);
                setPasswordError("");
              }}
              style={{
                ...outlineButtonStyle,
                width: "100%",
                border: "1px solid rgba(249, 115, 22, 0.45)",
                color: "#fb923c",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
              }}
            >
              Change Password
            </button>
          ) : (
            <form onSubmit={submitPasswordChange}>
              <div style={{ display: "grid", gap: "0.65rem" }}>
                <div>
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      color: "#94a3b8",
                      fontSize: "0.82rem",
                    }}
                  >
                    Current Password
                  </p>
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      color: "#94a3b8",
                      fontSize: "0.82rem",
                    }}
                  >
                    New Password
                  </p>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    style={inputStyle}
                    required
                  />
                </div>
                <div>
                  <p
                    style={{
                      margin: "0 0 0.35rem",
                      color: "#94a3b8",
                      fontSize: "0.82rem",
                    }}
                  >
                    Confirm New Password
                  </p>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={(event) =>
                      setConfirmNewPassword(event.target.value)
                    }
                    style={inputStyle}
                    required
                  />
                </div>
              </div>

              {passwordError && (
                <p
                  style={{
                    margin: "0.65rem 0 0",
                    color: "#f87171",
                    fontSize: "0.85rem",
                  }}
                >
                  {passwordError}
                </p>
              )}

              <div
                style={{
                  display: "flex",
                  gap: "0.5rem",
                  marginTop: "0.8rem",
                  flexWrap: "wrap",
                }}
              >
                <button
                  type="submit"
                  disabled={isChangingPassword}
                  style={{
                    ...outlineButtonStyle,
                    border: "1px solid rgba(249, 115, 22, 0.45)",
                    color: "#fb923c",
                  }}
                >
                  {isChangingPassword ? "Updating..." : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowPasswordForm(false);
                    setCurrentPassword("");
                    setNewPassword("");
                    setConfirmNewPassword("");
                    setPasswordError("");
                  }}
                  style={{
                    ...outlineButtonStyle,
                    border: "1px solid rgba(148, 163, 184, 0.45)",
                    color: "#cbd5e1",
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {passwordSuccess && (
            <p
              style={{
                margin: "0.65rem 0 0",
                color: "#22c55e",
                fontSize: "0.85rem",
              }}
            >
              {passwordSuccess}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onLogout}
          style={{
            width: "100%",
            borderRadius: "1rem",
            border: "1px solid rgba(239, 68, 68, 0.4)",
            background: "transparent",
            color: "#f87171",
            padding: "0.85rem 1rem",
            fontSize: "0.95rem",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Sign Out
        </button>

        {loading && (
          <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.9rem" }}>
            Loading account details...
          </p>
        )}

        {error && (
          <p style={{ margin: 0, color: "#f87171", fontSize: "0.9rem" }}>
            {error}
          </p>
        )}
      </div>
    </div>
  );
};

export default AccountPage;
