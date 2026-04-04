import { useAuth } from "../context/AuthContext";

const DemoBanner = () => {
  const { isDemo } = useAuth();

  if (!isDemo) return null;

  return (
    <>
      <style>{`
        .demo-banner {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          z-index: 2000;
          background: linear-gradient(90deg, #f97316, #ea580c);
          color: white;
          text-align: center;
          padding: 6px 16px;
          font-size: 12px;
          font-weight: 700;
          letter-spacing: 0.4px;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
        }
        .demo-banner-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: white;
          animation: blink 1.5s ease-in-out infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }
      `}</style>
      <div className="demo-banner">
        <span className="demo-banner-dot" />
        DEMO MODE — Holdings reset on each login. Feel free to add, edit, or
        delete.
        <span className="demo-banner-dot" />
      </div>
    </>
  );
};

export default DemoBanner;
