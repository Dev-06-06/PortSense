import { Navigate, Route, Routes } from 'react-router-dom'
import BottomNav from './components/BottomNav'
import ProtectedRoute from './components/ProtectedRoute'
import AnalyticsPage from './pages/AnalyticsPage'
import AdvisorPage from './pages/AdvisorPage'
import BenchmarkPage from './pages/BenchmarkPage'
import CorrelationPage from './pages/CorrelationPage'
import DashboardPage from './pages/DashboardPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SentimentPage from './pages/SentimentPage'

const routeTransitionStyle = {
  animation: 'fadeIn 0.2s ease-in',
}

const PageTransition = ({ children }) => <div style={routeTransitionStyle}>{children}</div>

const ProtectedLayout = ({ children }) => (
  <ProtectedRoute>
    <div style={{ minHeight: '100vh', paddingBottom: '60px' }}>
      {children}
      <BottomNav />
    </div>
  </ProtectedRoute>
)

function App() {
  return (
    <>
      <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <Routes>
      <Route path='/' element={<PageTransition><LandingPage /></PageTransition>} />
      <Route path='/login' element={<PageTransition><LoginPage /></PageTransition>} />
      <Route path='/register' element={<PageTransition><RegisterPage /></PageTransition>} />
      <Route
        path='/dashboard'
        element={
          <ProtectedLayout>
            <PageTransition>
              <DashboardPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route
        path='/analytics'
        element={
          <ProtectedLayout>
            <PageTransition>
              <AnalyticsPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route
        path='/correlation'
        element={
          <ProtectedLayout>
            <PageTransition>
              <CorrelationPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route
        path='/benchmark'
        element={
          <ProtectedLayout>
            <PageTransition>
              <BenchmarkPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route
        path='/sentiment'
        element={
          <ProtectedLayout>
            <PageTransition>
              <SentimentPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route
        path='/advisor'
        element={
          <ProtectedLayout>
            <PageTransition>
              <AdvisorPage />
            </PageTransition>
          </ProtectedLayout>
        }
      />
      <Route path='*' element={<Navigate to='/' replace />} />
      </Routes>
    </>
  )
}

export default App
