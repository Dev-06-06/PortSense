import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../context/AuthContext";
import api from "../services/api";

const ADMIN_EMAIL = (import.meta.env.VITE_ADMIN_EMAIL || "").trim().toLowerCase();

const companyDocumentTypes = [
  { label: "Annual Report", value: "annual_report" },
  { label: "Quarterly Report", value: "quarterly_report" },
  { label: "Earnings Call", value: "earnings_call" },
  { label: "Presentation", value: "presentation" },
  { label: "FAQ", value: "faq" },
  { label: "Policy", value: "policy" },
];

// The backend is the source of truth for allowed document types.
// Use the same permitted values as companyDocumentTypes so uploads match the API contract.
const personalDocumentTypes = companyDocumentTypes;

const shellStyle = {
  minHeight: "100vh",
  background:
    "radial-gradient(circle at top left, rgba(249, 115, 22, 0.14), transparent 32%), radial-gradient(circle at top right, rgba(148, 163, 184, 0.08), transparent 24%), #0d1117",
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
  backgroundColor: "rgba(15, 23, 42, 0.62)",
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

const textareaStyle = {
  ...inputStyle,
  minHeight: "8rem",
  resize: "vertical",
  lineHeight: 1.6,
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

const emptyUploadResult = {
  ticker: "",
  company: "",
  document_type: "",
  chunks_stored: null,
};

const getAskAiMessage = (error) =>
  error?.response?.data?.detail || error?.response?.data?.message || "Unable to get an answer right now.";

const createUploadState = (defaultDocumentType) => ({
  ticker: "",
  company: "",
  documentType: defaultDocumentType,
  file: null,
  uploading: false,
  error: "",
  success: "",
  result: emptyUploadResult,
});

const getDocumentTypeLabel = (documentTypes, value) =>
  documentTypes.find((type) => type.value === value)?.label || value;

const getUploadMessage = (error) =>
  error?.response?.data?.detail ||
  error?.response?.data?.message ||
  "Unable to upload document.";

const isValidDocumentFile = (file) => {
  const fileName = String(file?.name || "").toLowerCase();
  return fileName.endsWith(".pdf") || fileName.endsWith(".txt");
};

const formatTimestamp = (value) => {
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return "Just now";
  }
};

const normalizeChunksStored = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : value ?? null;
};

export default function KnowledgeBasePage() {
  const { user, decodedToken } = useAuth();

  const [companyForm, setCompanyForm] = useState(() =>
    createUploadState(companyDocumentTypes[0].value),
  );
  const [personalForm, setPersonalForm] = useState(() =>
    createUploadState(personalDocumentTypes[0].value),
  );
  const [recentPersonalUploads, setRecentPersonalUploads] = useState([]);
  const [askQuestion, setAskQuestion] = useState("");
  const [askAnswer, setAskAnswer] = useState("");
  const [askLoading, setAskLoading] = useState(false);
  const [askError, setAskError] = useState("");
  const [askTicker, setAskTicker] = useState("");

  const currentEmail = useMemo(
    () => String(user?.email || decodedToken?.email || "").trim().toLowerCase(),
    [user, decodedToken],
  );
  const isAdmin = Boolean(ADMIN_EMAIL) && currentEmail === ADMIN_EMAIL;
  const uploadedTickerOptions = useMemo(() => {
    const tickers = [];
    const seen = new Set();

    for (const upload of recentPersonalUploads) {
      const ticker = String(upload?.ticker || "").trim().toUpperCase();
      if (!ticker || seen.has(ticker)) {
        continue;
      }
      seen.add(ticker);
      tickers.push(ticker);
    }

    return tickers;
  }, [recentPersonalUploads]);

  const resolvedAskTicker = useMemo(() => {
    if (uploadedTickerOptions.length === 1) {
      return uploadedTickerOptions[0];
    }

    if (uploadedTickerOptions.length > 1) {
      return uploadedTickerOptions.includes(askTicker) ? askTicker : uploadedTickerOptions[0];
    }

    return "";
  }, [askTicker, uploadedTickerOptions]);

  useEffect(() => {
    if (uploadedTickerOptions.length === 0) {
      if (askTicker) {
        setAskTicker("");
      }
      return;
    }

    if (uploadedTickerOptions.length === 1) {
      if (askTicker !== uploadedTickerOptions[0]) {
        setAskTicker(uploadedTickerOptions[0]);
      }
      return;
    }

    if (!uploadedTickerOptions.includes(askTicker)) {
      setAskTicker(uploadedTickerOptions[0]);
    }
  }, [askTicker, uploadedTickerOptions]);

  useEffect(() => {
    document.title = "AI Center | PortSense";
  }, []);

  const submitUpload = async ({
    event,
    endpoint,
    formState,
    setFormState,
    documentTypes,
    successLabel,
    trackRecentUpload,
  }) => {
    event.preventDefault();
    const formElement = event.currentTarget;

    setFormState((previous) => ({
      ...previous,
      error: "",
      success: "",
    }));

    if (!formState.ticker.trim()) {
      setFormState((previous) => ({
        ...previous,
        error: "Ticker is required.",
      }));
      return;
    }

    if (!formState.company.trim()) {
      setFormState((previous) => ({
        ...previous,
        error: "Company is required.",
      }));
      return;
    }

    if (!formState.file) {
      setFormState((previous) => ({
        ...previous,
        error: "Please choose a document to upload.",
      }));
      return;
    }

    if (!isValidDocumentFile(formState.file)) {
      setFormState((previous) => ({
        ...previous,
        error: "Only .pdf and .txt files are allowed.",
      }));
      return;
    }

    setFormState((previous) => ({
      ...previous,
      uploading: true,
      error: "",
      success: "",
    }));

    try {
      const formData = new FormData();
      formData.append("file", formState.file);
      formData.append("ticker", formState.ticker.trim().toUpperCase());
      formData.append("company", formState.company.trim());
      formData.append("document_type", formState.documentType);

      const response = await api.post(endpoint, formData);
      const payload = response?.data || {};

      const nextResult = {
        ticker: String(payload.ticker || formState.ticker.trim().toUpperCase()),
        company: String(payload.company || formState.company.trim()),
        document_type: String(payload.document_type || formState.documentType),
        chunks_stored: normalizeChunksStored(payload.chunks_stored),
      };

      setFormState(() => ({
        ...createUploadState(documentTypes[0].value),
        success: successLabel,
        result: nextResult,
      }));

      if (trackRecentUpload) {
        setRecentPersonalUploads((previous) => [
          {
            id: payload.doc_id || `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            ticker: nextResult.ticker,
            company: nextResult.company,
            documentType: nextResult.document_type,
            chunksStored: nextResult.chunks_stored,
            fileName: formState.file.name,
            uploadedAt: Date.now(),
          },
          ...previous,
        ]);
      }

      formElement?.reset?.();
    } catch (error) {
      // Log raw response for easier debugging of backend validation errors
      try {
        // eslint-disable-next-line no-console
        console.error("Upload error response:", error?.response?.data);
      } catch {}

      setFormState((previous) => ({
        ...previous,
        uploading: false,
        error: getUploadMessage(error),
        success: "",
      }));
      return;
    }

    setFormState((previous) => ({
      ...previous,
      uploading: false,
    }));
  };

  const submitAskAi = async (event) => {
    event.preventDefault();

    const question = askQuestion.trim();
    if (!question) {
      setAskError("Please enter a question first.");
      return;
    }

    const ticker = resolvedAskTicker || undefined;

    setAskLoading(true);
    setAskError("");

    try {
      const response = await api.post("/user/ask-ai", {
        question,
        ticker,
      });

      const payload = response?.data || {};
      setAskAnswer(String(payload.answer || ""));
    } catch (error) {
      setAskError(getAskAiMessage(error));
    } finally {
      setAskLoading(false);
    }
  };

  const renderUploadCard = ({
    title,
    description,
    formState,
    setFormState,
    endpoint,
    documentTypes,
    successLabel,
    trackRecentUpload = false,
    buttonText = "Upload Document",
    fileInputId,
  }) => (
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
          AI Center
        </div>
        <h2
          style={{
            margin: 0,
            fontSize: "1.8rem",
            fontWeight: 800,
            letterSpacing: "-0.02em",
          }}
        >
          {title}
        </h2>
        <p
          style={{
            margin: "0.5rem 0 0",
            color: "#94a3b8",
            lineHeight: 1.6,
          }}
        >
          {description}
        </p>
      </div>

      <form
        onSubmit={(event) =>
          submitUpload({
            event,
            endpoint,
            formState,
            setFormState,
            documentTypes,
            successLabel,
            trackRecentUpload,
          })
        }
        style={{ display: "grid", gap: "1rem" }}
      >
        <div style={{ display: "grid", gap: "1rem" }}>
          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label htmlFor={`${fileInputId}-ticker`} style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Ticker
            </label>
            <input
              id={`${fileInputId}-ticker`}
              value={formState.ticker}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  ticker: event.target.value.toUpperCase(),
                }))
              }
              placeholder="RELIANCE.NS"
              style={inputStyle}
              autoComplete="off"
            />
          </div>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label htmlFor={`${fileInputId}-company`} style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Company
            </label>
            <input
              id={`${fileInputId}-company`}
              value={formState.company}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  company: event.target.value,
                }))
              }
              placeholder="Reliance Industries Ltd"
              style={inputStyle}
              autoComplete="organization"
            />
          </div>

          <div style={{ display: "grid", gap: "0.5rem" }}>
            <label htmlFor={`${fileInputId}-document-type`} style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Document Type
            </label>
            <select
              id={`${fileInputId}-document-type`}
              value={formState.documentType}
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  documentType: event.target.value,
                }))
              }
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
            <label htmlFor={`${fileInputId}-file`} style={{ fontWeight: 700, fontSize: "0.9rem" }}>
              Upload PDF/TXT
            </label>
            <input
              id={`${fileInputId}-file`}
              type="file"
              accept=".pdf,.txt"
              onChange={(event) =>
                setFormState((previous) => ({
                  ...previous,
                  file: event.target.files?.[0] || null,
                }))
              }
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

        {formState.error && (
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
            {formState.error}
          </div>
        )}

        {formState.success && (
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
            <div style={{ fontWeight: 700, marginBottom: "0.45rem" }}>{formState.success}</div>
            <div style={{ display: "grid", gap: "0.25rem", color: "#dcfce7" }}>
              <div>Ticker: {formState.result?.ticker || "-"}</div>
              <div>Company: {formState.result?.company || "-"}</div>
              <div>Document Type: {getDocumentTypeLabel(documentTypes, formState.result?.document_type || "")}</div>
              <div>Chunks Stored: {formState.result?.chunks_stored ?? "-"}</div>
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={formState.uploading}
          style={{
            ...buttonStyle,
            backgroundColor: formState.uploading ? "#334155" : "#f97316",
            color: "#ffffff",
            opacity: formState.uploading ? 0.8 : 1,
            alignSelf: "start",
          }}
        >
          {formState.uploading ? (
            <>
              <span className="kb-spin" style={spinnerStyle} />
              Uploading...
            </>
          ) : (
            buttonText
          )}
        </button>
      </form>
    </div>
  );

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
          <div style={{ marginBottom: "0.75rem" }}>
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
              AI Center
            </div>
            <h1
              style={{
                margin: 0,
                fontSize: "2rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              AI Center
            </h1>
            <p
              style={{
                margin: "0.5rem 0 0",
                color: "#94a3b8",
                lineHeight: 1.6,
              }}
            >
              Upload company knowledge documents or keep your own research in one place.
            </p>
          </div>
        </div>

        {isAdmin &&
          renderUploadCard({
            title: "Company Knowledge Base",
            description: "Upload company documents into the shared knowledge base for all PortSense users.",
            formState: companyForm,
            setFormState: setCompanyForm,
            endpoint: "/admin/upload-doc",
            documentTypes: companyDocumentTypes,
            successLabel: "Company document uploaded successfully.",
            buttonText: "Upload Company Document",
            fileInputId: "company-upload",
          })}

        {isAdmin && (
          <div
            style={{
              ...cardStyle,
              padding: "0.9rem 1.1rem",
              textAlign: "center",
              color: "#cbd5e1",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Personal Research
          </div>
        )}

        {renderUploadCard({
          title: "Upload Personal Research",
          description: "Upload private research files that stay scoped to your account.",
          formState: personalForm,
          setFormState: setPersonalForm,
          endpoint: "/user/upload-doc",
          documentTypes: personalDocumentTypes,
          successLabel: "Personal research uploaded successfully.",
          trackRecentUpload: true,
          buttonText: "Upload Document",
          fileInputId: "personal-upload",
        })}

        <div
          style={{
            ...cardStyle,
            padding: "1rem 1.25rem",
            color: "#cbd5e1",
            lineHeight: 1.6,
          }}
        >
          Note: uploaded files are used as context for AI insights only in AI Center.
        </div>

        <div style={{ ...cardStyle, padding: "1.5rem" }}>
          <div style={{ marginBottom: "1rem" }}>
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
              AI Center
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              My Uploaded Documents
            </h2>
            <p style={{ margin: "0.45rem 0 0", color: "#94a3b8", lineHeight: 1.6 }}>
              Recent personal uploads from this session.
            </p>
          </div>

          {recentPersonalUploads.length === 0 ? (
            <div
              style={{
                borderRadius: "0.9rem",
                border: "1px dashed rgba(148, 163, 184, 0.24)",
                backgroundColor: "rgba(15, 23, 42, 0.42)",
                padding: "1rem",
                color: "#94a3b8",
                lineHeight: 1.6,
              }}
            >
              Your uploaded personal documents will appear here after each successful upload.
            </div>
          ) : (
            <div style={{ display: "grid", gap: "0.75rem" }}>
              {recentPersonalUploads.map((item) => (
                <div
                  key={item.id}
                  style={{
                    borderRadius: "0.9rem",
                    border: "1px solid rgba(255, 255, 255, 0.08)",
                    backgroundColor: "rgba(15, 23, 42, 0.5)",
                    padding: "1rem",
                    display: "grid",
                    gap: "0.55rem",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div style={{ fontWeight: 800, color: "#ffffff" }}>{item.ticker}</div>
                    <div style={{ color: "#94a3b8", fontSize: "0.85rem" }}>{formatTimestamp(item.uploadedAt)}</div>
                  </div>
                  <div style={{ color: "#cbd5e1", lineHeight: 1.6 }}>{item.company}</div>
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "0.5rem",
                      color: "#94a3b8",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>Document Type: {getDocumentTypeLabel(personalDocumentTypes, item.documentType)}</span>
                    <span>Chunks Stored: {item.chunksStored ?? "-"}</span>
                    <span>File: {item.fileName}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ ...cardStyle, padding: "1.5rem" }}>
          <div style={{ marginBottom: "1rem" }}>
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
              AI Center
            </div>
            <h2
              style={{
                margin: 0,
                fontSize: "1.5rem",
                fontWeight: 800,
                letterSpacing: "-0.02em",
              }}
            >
              Ask AI
            </h2>
            <p style={{ margin: "0.45rem 0 0", color: "#94a3b8", lineHeight: 1.6 }}>
              Ask questions about your uploaded documents without leaving this page.
            </p>
          </div>

          <div style={{ display: "grid", gap: "1rem" }}>
            <textarea
              value={askQuestion}
              onChange={(event) => setAskQuestion(event.target.value)}
              placeholder="Ask a question about your uploaded documents..."
              style={textareaStyle}
            />

            {uploadedTickerOptions.length > 1 ? (
              <div style={{ display: "grid", gap: "0.5rem" }}>
                <label htmlFor="ask-ai-ticker" style={{ fontWeight: 700, fontSize: "0.9rem" }}>
                  Search within
                </label>
                <select
                  id="ask-ai-ticker"
                  value={resolvedAskTicker}
                  onChange={(event) => setAskTicker(event.target.value)}
                  style={inputStyle}
                >
                  {uploadedTickerOptions.map((ticker) => (
                    <option key={ticker} value={ticker}>
                      {ticker}
                    </option>
                  ))}
                </select>
              </div>
            ) : uploadedTickerOptions.length === 1 ? (
              <div style={{ color: "#94a3b8", fontSize: "0.9rem" }}>
                Search scope: {resolvedAskTicker}
              </div>
            ) : null}

            <button
                type="button"
                onClick={submitAskAi}
                disabled={askLoading}
              style={{
                ...buttonStyle,
                  backgroundColor: askLoading ? "#334155" : "#f97316",
                color: "#ffffff",
                alignSelf: "start",
                  opacity: askLoading ? 0.82 : 1,
              }}
            >
                {askLoading ? <span className="kb-spin" style={spinnerStyle} /> : null}
              Ask AI
            </button>

            {askError ? (
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
                {askError}
              </div>
            ) : null}

            <div
              style={{
                borderRadius: "0.9rem",
                border: "1px dashed rgba(148, 163, 184, 0.24)",
                backgroundColor: "rgba(15, 23, 42, 0.42)",
                padding: "1rem",
                color: "#94a3b8",
                lineHeight: 1.6,
                minHeight: "5.5rem",
                whiteSpace: "pre-wrap",
              }}
            >
                {askAnswer || "AI responses will appear here."}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
