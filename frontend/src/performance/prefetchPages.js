const importers = {
  "/": () => import("../pages/LandingPage"),
  "/login": () => import("../pages/LoginPage"),
  "/register": () => import("../pages/RegisterPage"),
  "/dashboard": () => import("../pages/DashboardPage"),
  "/analytics": () => import("../pages/AnalyticsPage"),
  "/tax": () => import("../pages/TaxPage"),
  "/correlation": () => import("../pages/CorrelationPage"),
  "/sentiment": () => import("../pages/SentimentPage"),
  "/account": () => import("../pages/AccountPage"),
};

const prefetchCache = new Map();

export const prefetchRoute = (path) => {
  const importer = importers[path];

  if (!importer) {
    return Promise.resolve();
  }

  if (prefetchCache.has(path)) {
    return prefetchCache.get(path);
  }

  const pending = importer().catch(() => null);
  prefetchCache.set(path, pending);
  return pending;
};
