import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  BarChart2,
  TrendingUp,
  Radio,
  UserCircle,
  Receipt,
  BookOpen,
} from "lucide-react";
import { prefetchRoute } from "../routes/prefetch";
const tabs = [
  {
    label: "Dashboard",
    icon: <LayoutDashboard size={20} />,
    path: "/dashboard",
  },
  { label: "Analytics", icon: <BarChart2 size={20} />, path: "/analytics" },
  {
    label: "Tax",
    icon: <Receipt size={20} />,
    path: "/tax",
  },
  { label: "Compare", icon: <TrendingUp size={20} />, path: "/comparison" },
  { label: "Sentiment", icon: <Radio size={20} />, path: "/sentiment" },
  { label: "Account", icon: <UserCircle size={20} />, path: "/account" },
  { label: "AI", icon: <BookOpen size={20} />, path: "/knowledge-base" },
];

const BottomNav = () => {
  const { pathname } = useLocation();

  const isActive = (path) =>
    pathname === path || pathname.startsWith(`${path}/`);

  return (
    <>
      <style>{`
        .bottom-nav {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          height: 64px;
          background: #111827;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
          display: grid;
          grid-template-columns: repeat(7, minmax(0, 1fr));
        }

        .bottom-nav-link {
          color: #94a3b8;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 2px;
          font-size: 9px;
          line-height: 1;
          font-weight: 600;
          min-width: 0;
          padding: 0 2px;
        }

        .bottom-nav-link.active {
          color: #f97316;
        }

        .bottom-nav-icon {
          font-size: 24px;
          line-height: 1;
        }

        .bottom-nav-label {
          white-space: normal;
          overflow-wrap: anywhere;
          text-align: center;
          line-height: 1.05;
          max-width: 100%;
        }

        @media (max-width: 767px) {
          .bottom-nav-link {
            font-size: 8px;
          }
        }

        @media (max-width: 360px) {
          .bottom-nav {
            height: 68px;
          }

          .bottom-nav-link {
            gap: 1px;
          }
        }
      `}</style>

      <nav aria-label="Bottom navigation" className="bottom-nav">
        {tabs.map((tab) => {
          const active = isActive(tab.path);

          return (
            <Link
              key={tab.path}
              to={tab.path}
              className={`bottom-nav-link ${active ? "active" : ""}`}
              onMouseEnter={() => prefetchRoute(tab.path)}
              onFocus={() => prefetchRoute(tab.path)}
              onTouchStart={() => prefetchRoute(tab.path)}
            >
              <span className="bottom-nav-icon" aria-hidden="true">
                {tab.icon}
              </span>
              <span className="bottom-nav-label">{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
};

export default BottomNav;
