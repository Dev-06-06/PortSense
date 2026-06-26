import { useEffect, useMemo, useState } from "react";
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
  padding: "2rem 1rem",
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

const inputStyle = {
  background: "#1e293b",
  border: "1px solid #334155",
  color: "#ffffff",
  borderRadius: "8px",
  padding: "10px 12px",
  fontSize: "0.95rem",
  width: "100%",
  boxSizing: "border-box",
};

const buttonStyle = {
  border: "none",
  borderRadius: "0.9rem",
  padding: "0.8rem 1rem",
  fontSize: "0.95rem",
  fontWeight: 700,
  cursor: "pointer",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "0.55rem",
  transition: "transform 0.15s ease, opacity 0.15s ease",
};

const spinnerStyle = {
  width: "1rem",
  height: "1rem",
  borderRadius: "999px",
  border: "2px solid rgba(255, 255, 255, 0.3)",
  borderTopColor: "#ffffff",
};

const documentTypes = [
  { label: "Annual Report", value: "annual_report" },
  { label: "Quarterly Report", value: "quarterly_report" },
  { label: "Earnings Call", value: "earnings_call" },
  { label: "Presentation", value: "presentation" },
  { label: "FAQ", value: "faq" },
  { label: "Policy", value: "policy" },
];

const emptyResult = {
  ticker: "",
  document_type: "",
  chunks_stored: null,
};

export default function KnowledgeBasePage() {
  const navigate = useNavigate();
  const { user, decodedToken } = useAuth();

  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [ticker, setTicker] = useState("");
  const [company, setCompany] = useState("");
  const [documentType, setDocumentType] = useState(documentTypes[0].value);
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [result, setResult] = useState(emptyResult);

  const currentEmail = useMemo(() => {
    return String(user?.email || decodedToken?.email || "")
      .trim()
      .toLowerCase();
  }, [user, decodedToken]);

  useEffect(() => {
    document.title = "Knowledge Base | PortSense";
  }, []);

  useEffect(() => {
    if (!ADMIN_EMAIL) {
      setForbidden(true);
      setReady(true);
      return;
    }

    if (currentEmail && currentEmail !== ADMIN_EMAIL) {
      navigate("/dashboard", { replace: true });
      return;
    }

    if (currentEmail === ADMIN_EMAIL) {
      setReady(true);
    }
  }, [currentEmail, navigate]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setSuccess("");

    if (!ticker.trim()) {
      setError("Ticker is required.");
      return;
    }

    if (!company.trim()) {
      setError("Company is required.");
      return;
    }

    if (!file) {
      setError("Please choose a document to upload.");
      return;
    }

    const fileName = file.name.toLowerCase();
    const validExtension =
      fileName.endsWith(".pdf") || fileName.endsWith(".txt");

    if (!validExtension) {
      setError("Only .pdf and .txt files are allowed.");
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("ticker", ticker.trim().toUpperCase());
      formData.append("company", company.trim());
      formData.append("document_type", documentType);

      const response = await api.post("/admin/upload-doc", formData);

      const payload = response?.data || {};
      setResult({
        ticker: String(payload.ticker || ticker.trim().toUpperCase()),
        document_type: String(payload.document_type || documentType),
        chunks_stored: Number.isFinite(Number(payload.chunks_stored))
          ? Number(payload.chunks_stored)
          : (payload.chunks_stored ?? null),
      });
      setSuccess("Document uploaded successfully.");
      setFile(null);
      setTicker("");
      setCompany("");
      setDocumentType(documentTypes[0].value);
      event.target.reset?.();
    } catch (err) {
      setError(
        err?.response?.data?.detail ||
          err?.response?.data?.message ||
          "Unable to upload document.",
      );
    } finally {
      setUploading(false);
    }
  };

  if (!ready && !forbidden) {
    return (
      <div style={shellStyle}>
        <div style={containerStyle}>
          <div style={{ ...cardStyle, padding: "1.25rem" }}>Loading...</div>
        </div>
      </div>
    );
  }

  if (forbidden) {
    return (
      <div style={shellStyle}>
        <div style={containerStyle}>
          <div style={{ ...cardStyle, padding: "1.5rem" }}>
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.6rem",
                marginBottom: "0.75rem",
                color: "#fca5a5",
                fontWeight: 700,
              }}
            >
              <span>403</span>
              <span>Forbidden</span>
            </div>
            <div style={{ color: "#cbd5e1", lineHeight: 1.6 }}>
              This page is restricted to the project owner.
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={shellStyle}>
      <style>{`
        .kb-spin {
          animation: kb-spin 0.8s linear infinite;
        }

        @keyframes kb-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={containerStyle}>
        <div style={{ ...cardStyle, padding: "1.5rem" }}>
          <div style={{ marginBottom: "1.25rem" }}>
            <div
              style={{
                color: "#f97316",
                fontSize: "0.72rem",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                marginBottom: "0.4rem",
              }}
            >
              Admin Tool
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Knowledge Base
            </h1>
            <p
              style={{
                margin: "0.5rem 0 0",
                color: "#94a3b8",
                lineHeight: 1.6,
              }}
            >
              Upload company documents into the global RAG knowledge base.
            </p>
          </div>

          <form
            onSubmit={handleSubmit}
            style={{ display: "grid", gap: "1rem" }}
          >
            <div style={{ display: "grid", gap: "1rem" }}>
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label
                  htmlFor="kb-ticker"
                  style={{ fontWeight: 700, fontSize: "0.9rem" }}
                >
                  Ticker
                </label>
                <input
                  id="kb-ticker"
                  value={ticker}
                  onChange={(event) =>
                    setTicker(event.target.value.toUpperCase())
                  }
                  placeholder="RELIANCE.NS"
                  style={inputStyle}
                  autoComplete="off"
                />
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label
                  htmlFor="kb-company"
                  style={{ fontWeight: 700, fontSize: "0.9rem" }}
                >
                  Company
                </label>
                <input
                  id="kb-company"
                  value={company}
                  onChange={(event) => setCompany(event.target.value)}
                  placeholder="Reliance Industries Ltd"
                  style={inputStyle}
                  autoComplete="organization"
                />
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label
                  htmlFor="kb-document-type"
                  style={{ fontWeight: 700, fontSize: "0.9rem" }}
                >
                  Document Type
                </label>
                <select
                  id="kb-document-type"
                  value={documentType}
                  onChange={(event) => setDocumentType(event.target.value)}
                  style={inputStyle}
                >
                  {documentTypes.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label
                  htmlFor="kb-file"
                  style={{ fontWeight: 700, fontSize: "0.9rem" }}
                >
                  File Picker
                </label>
                <input
                  id="kb-file"
                  type="file"
                  accept=".pdf,.txt"
                  onChange={(event) => setFile(event.target.files?.[0] || null)}
                  style={{
                    ...inputStyle,
                    padding: "0.55rem",
                    background: "#111827",
                  }}
                />
                <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>
                  Accepted formats: .pdf, .txt
                </div>
              </div>
            </div>

            {error && (
              <div
                style={{
                  borderRadius: "0.9rem",
                  border: "1px solid rgba(248, 113, 113, 0.35)",
                  backgroundColor: "rgba(127, 29, 29, 0.25)",
                  padding: "0.9rem",
                  color: "#fecaca",
                  lineHeight: 1.6,
                }}
              >
                {error}
              </div>
            )}

            {success && (
              <div
                style={{
                  borderRadius: "0.9rem",
                  border: "1px solid rgba(74, 222, 128, 0.35)",
                  backgroundColor: "rgba(20, 83, 45, 0.28)",
                  padding: "0.9rem",
                  color: "#bbf7d0",
                  lineHeight: 1.6,
                }}
              >
                <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>
                  {success}
                </div>
                <div
                  style={{ display: "grid", gap: "0.25rem", color: "#dcfce7" }}
                >
                  <div>Ticker: {result.ticker || "-"}</div>
                  <div>Document Type: {result.document_type || "-"}</div>
                  <div>Chunks Stored: {result.chunks_stored ?? "-"}</div>
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={uploading}
              style={{
                ...buttonStyle,
                backgroundColor: uploading ? "#334155" : "#f97316",
                color: "#ffffff",
                opacity: uploading ? 0.8 : 1,
                alignSelf: "start",
              }}
            >
              {uploading ? (
                <>
                  <span className="kb-spin" style={spinnerStyle} />
                  Uploading...
                </>
              ) : (
                "Upload Document"
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
