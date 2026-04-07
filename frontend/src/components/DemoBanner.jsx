import { useAuth } from "../context/AuthContext";

const DemoBanner = () => {
  const { isDemo } = useAuth();

  if (!isDemo) return null;

  return (
    <>
      <style>{`
        .demo-banner {
          position: fixed;
          top: 0.5rem;
          left: 50%;
          transform: translateX(-50%);
          z-index: 51;
          display: inline-flex;
          align-items: center;
          gap: 0.4rem;
          background-color: rgba(249,115,22,0.15);
          border: 1px solid rgba(249,115,22,0.4);
          border-radius: 999px;
          padding: 0.3rem 0.85rem;
          white-space: nowrap;
          color: #fdba74;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.4px;
        }
        .demo-banner-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #f97316;
          animation: blink 1.5s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div className="demo-banner">
        <span className="demo-banner-dot" />
        DEMO MODE
        <span className="demo-banner-dot" />
      </div>
    </>
  );
};

export default DemoBanner;
