import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "")
  .trim()
  .toLowerCase();

const shellStyle = {
  minHeight: "100vh",
  backgroundColor: "#0d1117",
  color: "#e5e7eb",
  fontFamily: "'DM Sans', sans-serif",
  padding: "2rem 1rem 2rem 1rem",
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

const CACHE_KEY = "portsense_account_cache";
const CACHE_TTL_MS = 5 * 60 * 1000;

const getCache = () => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { data, timestamp } = JSON.parse(raw);
    if (Date.now() - timestamp > CACHE_TTL_MS) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return data;
  } catch {
    return null;
  }
};

const setCache = (data) => {
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        data,
        timestamp: Date.now(),
      }),
    );
  } catch {}
};

const AccountPage = () => {
  const navigate = useNavigate();
  const { logout } = useAuth();

  const [userDetails, setUserDetails] = useState(null);
  const [healthData, setHealthData] = useState(null);
  const [sinceData, setSinceData] = useState(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [sinceLoading, setSinceLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [usernameInput, setUsernameInput] = useState("");
  const [usernameError, setUsernameError] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [profileName, setProfileName] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState("");
  const [profileError, setProfileError] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  useEffect(() => {
    document.title = "Account | PortSense";
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setHealthLoading(true);
      setSinceLoading(true);
      setError("");

      const cached = getCache();
      if (cached) {
        setUserDetails(cached.userDetails);
        setHealthData(cached.healthData);
        setSinceData(cached.sinceData);
        setLoading(false);
        setHealthLoading(false);
        setSinceLoading(false);
        return;
      }

      try {
        const [meResponse, healthResponse, sinceResponse] = await Promise.all([
          api.get("/api/auth/me"),
          api.get("/api/analytics/health-score"),
          api.get("/api/holdings/since"),
        ]);

        setUserDetails(meResponse.data || null);
        setHealthData(healthResponse.data || null);
        setSinceData(sinceResponse.data || null);
        setCache({
          userDetails: meResponse.data,
          healthData: healthResponse.data,
          sinceData: sinceResponse.data,
        });
        setHealthLoading(false);
        setSinceLoading(false);
      } catch {
        setError(
          "Unable to load account details. Please refresh and try again.",
        );
        setHealthData(null);
        setSinceData(null);
        setHealthLoading(false);
        setSinceLoading(false);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  useEffect(() => {
    if (userDetails) {
      setProfileName(userDetails.username || "");
      setUsernameInput(userDetails.username || "");
      setPhotoUrl(userDetails.photoUrl || "");
    }
  }, [userDetails]);

  const displayName = userDetails?.username?.trim() || "User";
  const avatarLetter = (displayName.charAt(0) || "U").toUpperCase();

  const handleProfileSave = async () => {
    const trimmedUsername = usernameInput.trim();
    const trimmedPhotoUrl = photoUrl.trim();
    const currentPhotoUrl = userDetails?.photoUrl || "";

    if (trimmedUsername.length < 3 || trimmedUsername.length > 30) {
      setUsernameError("Username must be between 3 and 30 characters");
      return;
    }

    setUsernameError("");
    setProfileError("");
    setSavingProfile(true);

    try {
      if (trimmedUsername !== displayName) {
        await api.put("/api/auth/update-username", {
          new_username: trimmedUsername,
        });
      }

      if (trimmedPhotoUrl !== currentPhotoUrl) {
        await api.put("/api/auth/update-profile", {
          photoUrl: trimmedPhotoUrl,
        });
      }

      setUserDetails((prev) =>
        prev
          ? {
              ...prev,
              username:
                trimmedUsername !== displayName
                  ? trimmedUsername
                  : prev.username,
              photoUrl:
                trimmedPhotoUrl !== currentPhotoUrl
                  ? trimmedPhotoUrl
                  : prev.photoUrl,
            }
          : prev,
      );
      sessionStorage.removeItem("portsense_account_cache");
      setProfileName(trimmedUsername);
      setUsernameInput(trimmedUsername);
      setPhotoUrl(trimmedPhotoUrl);
      setProfileSuccess("Profile updated");
      window.setTimeout(() => setProfileSuccess(""), 2000);
    } catch (err) {
      if (err?.response?.status === 409) {
        setUsernameError("Username already taken");
      } else {
        setProfileError(
          err?.response?.data?.detail || "Unable to update profile",
        );
      }
    } finally {
      setSavingProfile(false);
    }
  };

  const onLogout = () => {
    logout();
    navigate("/", { replace: true });
  };

  const handleDeleteAccount = async () => {
    setDeletingAccount(true);
    setDeleteError("");
    try {
      await api.delete("/api/auth/delete-account");
      logout();
      navigate("/", { replace: true });
    } catch (err) {
      setDeleteError(err?.response?.data?.detail || "Unable to delete account");
      setDeletingAccount(false);
    }
  };

  return (
    <div style={shellStyle}>
      <style>{`
        .account-grid {
          display: grid;
          grid-template-columns: 1fr;
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
        <div style={{ ...cardStyle, padding: "1rem", position: "relative" }}>
          <button
            type="button"
            onClick={onLogout}
            style={{
              position: "absolute",
              top: "1rem",
              right: "1rem",
              backgroundColor: "rgba(239,68,68,0.1)",
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#f87171",
              borderRadius: "20px",
              padding: "5px 14px",
              fontSize: 13,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>

          <div style={{ marginBottom: "1rem" }}>
            <p
              style={{
                margin: 0,
                color: "#f97316",
                fontSize: "0.65rem",
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
              }}
            >
              User Profile
            </p>
          </div>

          <div
            style={{
              display: "flex",
              gap: "1.5rem",
              alignItems: "flex-start",
              flexWrap: "wrap",
            }}
          >
            <div
              style={{
                width: "80px",
                height: "80px",
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
                overflow: "hidden",
              }}
              aria-label="Avatar"
            >
              {photoUrl.trim() ? (
                <img
                  src={photoUrl.trim()}
                  alt={profileName || "User avatar"}
                  style={{
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    borderRadius: "50%",
                  }}
                />
              ) : (
                avatarLetter
              )}
            </div>

            <div
              style={{
                display: "flex",
                flex: 1,
                flexDirection: "column",
                gap: "0.75rem",
                minWidth: 0,
              }}
            >
              <div>
                <p
                  style={{
                    margin: "0 0 0.35rem",
                    color: "#94a3b8",
                    fontSize: "0.82rem",
                  }}
                >
                  NAME
                </p>
                <input
                  type="text"
                  value={usernameInput}
                  onChange={(event) => setUsernameInput(event.target.value)}
                  style={inputStyle}
                  maxLength={30}
                />
                {usernameError && (
                  <p
                    style={{
                      margin: "0.45rem 0 0",
                      color: "#f87171",
                      fontSize: "0.85rem",
                    }}
                  >
                    {usernameError}
                  </p>
                )}
              </div>

              <div>
                <p
                  style={{
                    margin: "0 0 0.35rem",
                    color: "#94a3b8",
                    fontSize: "0.82rem",
                  }}
                >
                  EMAIL
                </p>
                <input
                  type="text"
                  value={userDetails?.email || "-"}
                  disabled
                  style={{
                    ...inputStyle,
                    opacity: 0.6,
                    cursor: "not-allowed",
                  }}
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
                  AVATAR URL
                </p>
                <input
                  type="url"
                  value={photoUrl}
                  onChange={(event) => setPhotoUrl(event.target.value)}
                  placeholder="https://..."
                  style={inputStyle}
                />
              </div>

              <button
                type="button"
                onClick={handleProfileSave}
                disabled={savingProfile}
                style={{
                  width: "100%",
                  background: "#f97316",
                  color: "#ffffff",
                  border: "none",
                  borderRadius: "0.75rem",
                  padding: "0.85rem 1rem",
                  fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                  fontSize: "0.95rem",
                  fontWeight: 900,
                  letterSpacing: "0.15em",
                  textTransform: "uppercase",
                  cursor: "pointer",
                  opacity: savingProfile ? 0.75 : 1,
                }}
              >
                {savingProfile ? "Saving..." : "Save Profile"}
              </button>

              {profileSuccess && (
                <p
                  style={{
                    margin: 0,
                    color: "#22c55e",
                    fontSize: "0.85rem",
                  }}
                >
                  {profileSuccess}
                </p>
              )}

              {profileError && (
                <p
                  style={{
                    margin: 0,
                    color: "#f87171",
                    fontSize: "0.85rem",
                  }}
                >
                  {profileError}
                </p>
              )}
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
            Portfolio Health Score
          </h2>
          {healthLoading ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
              Calculating...
            </p>
          ) : !healthData ? (
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem" }}>
              Not enough data
            </p>
          ) : (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "0.5rem",
                  marginBottom: "1rem",
                }}
              >
                <span
                  style={{
                    fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
                    fontSize: "3.5rem",
                    fontWeight: 700,
                    color: healthData.color,
                    lineHeight: 1,
                  }}
                >
                  {healthData.score}
                </span>
                <span
                  style={{
                    fontSize: "1.2rem",
                    color: "#475569",
                    fontWeight: 600,
                  }}
                >
                  /100
                </span>
                <span
                  style={{
                    marginLeft: "0.5rem",
                    fontSize: "0.85rem",
                    fontWeight: 700,
                    color: healthData.color,
                    backgroundColor: `${healthData.color}18`,
                    borderRadius: "20px",
                    padding: "3px 10px",
                  }}
                >
                  {healthData.label}
                </span>
              </div>

              {[
                { key: "diversification", label: "Diversification", max: 40 },
                { key: "beta", label: "Beta Stability", max: 30 },
                { key: "sector", label: "Sector Balance", max: 30 },
              ].map(({ key, label, max }) => {
                const val = healthData.breakdown?.[key] || 0;
                const pct = Math.round((val / max) * 100);
                return (
                  <div key={key} style={{ marginBottom: "0.65rem" }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        fontSize: "0.75rem",
                        marginBottom: "3px",
                      }}
                    >
                      <span style={{ fontSize: "0.78rem", color: "#94a3b8" }}>
                        {label}
                      </span>
                      <span
                        style={{
                          fontSize: "0.78rem",
                          color: "#f8fafc",
                          fontWeight: 600,
                        }}
                      >
                        {val}/{max}
                      </span>
                    </div>
                    <div
                      style={{
                        height: "5px",
                        backgroundColor: "rgba(255,255,255,0.08)",
                        borderRadius: "999px",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          width: `${pct}%`,
                          height: "100%",
                          backgroundColor: healthData.color,
                          borderRadius: "999px",
                          transition: "width 0.5s ease",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </>
          )}
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
            Holding Since
          </h2>
          {sinceLoading ? (
            <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.88rem" }}>
              Loading...
            </p>
          ) : !sinceData || !sinceData.earliestBuyDate ? (
            <p style={{ margin: 0, color: "#64748b", fontSize: "0.88rem" }}>
              No holdings yet
            </p>
          ) : (
            <div className="account-grid">
              <div className="account-stat">
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.78rem" }}>
                  Investing Since
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.2rem 0 0",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {new Date(sinceData.earliestBuyDate).toLocaleDateString(
                    "en-IN",
                    {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    },
                  )}
                </p>
              </div>
              <div className="account-stat">
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.78rem" }}>
                  Days Invested
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.2rem 0 0",
                    fontSize: "1.55rem",
                    fontWeight: 700,
                    color: "#f97316",
                  }}
                >
                  {sinceData.totalDaysInvested}
                </p>
              </div>
              <div className="account-stat">
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.78rem" }}>
                  Longest Held
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.2rem 0 0",
                    fontSize: "1.1rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {sinceData.longestHeldTicker}
                </p>
                <p
                  style={{
                    margin: "2px 0 0",
                    color: "#64748b",
                    fontSize: "0.75rem",
                  }}
                >
                  {sinceData.longestHeldDays} days
                </p>
              </div>
              <div className="account-stat">
                <p style={{ margin: 0, color: "#94a3b8", fontSize: "0.78rem" }}>
                  Total Holdings
                </p>
                <p
                  style={{
                    ...numberStyle,
                    margin: "0.2rem 0 0",
                    fontSize: "1.55rem",
                    fontWeight: 700,
                    color: "#f8fafc",
                  }}
                >
                  {sinceData.totalHoldings}
                </p>
              </div>
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, padding: "1rem" }}>
          <button
            type="button"
            onClick={() => navigate("/reset-password")}
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
        </div>

        {userDetails?.email?.trim().toLowerCase() === ADMIN_EMAIL && (
          <div style={{ ...cardStyle, padding: "1rem" }}>
            <button
              type="button"
              onClick={() => navigate("/knowledge-base")}
              style={{
                ...outlineButtonStyle,
                width: "100%",
                border: "1px solid rgba(249, 115, 22, 0.45)",
                color: "#fb923c",
                padding: "0.85rem 1rem",
                fontSize: "0.95rem",
              }}
            >
              Open Knowledge Base
            </button>
          </div>
        )}

        {/* Only show delete option if not demo user */}
        {userDetails?.email !== "demo@portsense.in" && (
          <div style={{ ...cardStyle, padding: "1rem" }}>
            {!showDeleteConfirm ? (
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(true)}
                style={{
                  ...outlineButtonStyle,
                  width: "100%",
                  border: "1px solid rgba(239,68,68,0.45)",
                  color: "#f87171",
                  padding: "0.85rem 1rem",
                  fontSize: "0.95rem",
                }}
              >
                Delete Account
              </button>
            ) : (
              <div style={{ display: "grid", gap: "0.75rem" }}>
                <p
                  style={{
                    margin: 0,
                    color: "#f87171",
                    fontSize: "0.9rem",
                    fontWeight: 600,
                  }}
                >
                  Are you sure? This action is permanent and cannot be undone.
                </p>
                {deleteError && (
                  <p
                    style={{ margin: 0, color: "#f87171", fontSize: "0.85rem" }}
                  >
                    {deleteError}
                  </p>
                )}
                <div style={{ display: "flex", gap: "0.5rem" }}>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    disabled={deletingAccount}
                    style={{
                      ...outlineButtonStyle,
                      border: "1px solid rgba(239,68,68,0.6)",
                      color: "#f87171",
                      backgroundColor: "rgba(239,68,68,0.1)",
                    }}
                  >
                    {deletingAccount ? "Deleting..." : "Yes, Delete My Account"}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDeleteConfirm(false);
                      setDeleteError("");
                    }}
                    style={{
                      ...outlineButtonStyle,
                      border: "1px solid rgba(148,163,184,0.45)",
                      color: "#cbd5e1",
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
