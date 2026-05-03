import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import BottomNav from "./components/BottomNav";
import DemoBanner from "./components/DemoBanner";
import ProtectedRoute from "./components/ProtectedRoute";
import { useAuth } from "./context/AuthContext";

const LandingPage = lazy(() => import("./pages/LandingPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const RegisterPage = lazy(() => import("./pages/RegisterPage"));
const VerifyEmailPage = lazy(() => import("./pages/VerifyEmailPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AnalyticsPage = lazy(() => import("./pages/AnalyticsPage"));
const ComparisonPage = lazy(() => import("./pages/ComparisonPage"));
const NewsPage = lazy(() => import("./pages/NewsPage"));
const TaxPage = lazy(() => import("./pages/TaxPage"));
const CorrelationPage = lazy(() => import("./pages/CorrelationPage"));
const SentimentPage = lazy(() => import("./pages/SentimentPage"));
const AccountPage = lazy(() => import("./pages/AccountPage"));
const ResetPasswordPage = lazy(() => import("./pages/ResetPasswordPage"));

const routeTransitionStyle = {
  animation: "fadeIn 0.2s ease-in",
};

const PageTransition = ({ children }) => (
  <div style={routeTransitionStyle}>{children}</div>
);

const routeFallbackStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  color: "#94a3b8",
  backgroundColor: "#0d1117",
  fontFamily: "'DM Sans', sans-serif",
};

const RouteFallback = () => <div style={routeFallbackStyle}>Loading...</div>;

const ProtectedLayout = ({ children }) => {
  const { isDemo } = useAuth();

  return (
    <ProtectedRoute>
      <div style={{ minHeight: "100vh", paddingBottom: "60px" }}>
        <DemoBanner />
        <div style={{ paddingTop: isDemo ? "32px" : "0px" }}>{children}</div>
        <BottomNav />
      </div>
    </ProtectedRoute>
  );
};

function App() {
  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route
            path="/"
            element={
              <PageTransition>
                <LandingPage />
              </PageTransition>
            }
          />
          <Route
            path="/login"
            element={
              <PageTransition>
                <LoginPage />
              </PageTransition>
            }
          />
          <Route
            path="/register"
            element={
              <PageTransition>
                <RegisterPage />
              </PageTransition>
            }
          />
          <Route
            path="/reset-password"
            element={
              <PageTransition>
                <ResetPasswordPage />
              </PageTransition>
            }
          />
          <Route
            path="/verify-email"
            element={
              <PageTransition>
                <VerifyEmailPage />
              </PageTransition>
            }
          />
          <Route
            path="/dashboard"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <DashboardPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/analytics"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <AnalyticsPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/comparison"
            element={
              <ProtectedLayout>
                <ComparisonPage />
              </ProtectedLayout>
            }
          />
          <Route
            path="/news"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <NewsPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/tax"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <TaxPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/correlation"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <CorrelationPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/sentiment"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <SentimentPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedLayout>
                <PageTransition>
                  <AccountPage />
                </PageTransition>
              </ProtectedLayout>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}

export default App;
