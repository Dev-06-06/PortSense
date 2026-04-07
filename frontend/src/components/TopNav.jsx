import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const TopNav = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        zIndex: 50,
        height: "3rem",
        backgroundColor: "#0d1117",
        borderBottom: "1px solid rgba(255,255,255,0.07)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 1.25rem",
      }}
    >
      {/* Logo */}
      <span
        onClick={() => navigate("/")}
        style={{
          fontFamily: "'Barlow Condensed', 'DM Sans', sans-serif",
          fontSize: "1.3rem",
          fontWeight: 900,
          letterSpacing: "0.08em",
          cursor: "pointer",
          userSelect: "none",
          lineHeight: 1,
        }}
      >
        <span style={{ color: "#ffffff" }}>PORT</span>
        <span style={{ color: "#f97316" }}>SENSE</span>
      </span>

      {/* Right side — show Login only if not logged in */}
      {!user && (
        <span
          onClick={() => navigate("/login")}
          style={{
            fontSize: "0.82rem",
            fontWeight: 700,
            color: "#94a3b8",
            cursor: "pointer",
            letterSpacing: "0.05em",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "#f97316")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "#94a3b8")}
        >
          Login
        </span>
      )}
    </div>
  );
};

export default TopNav;
