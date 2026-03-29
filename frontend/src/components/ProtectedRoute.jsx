import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const ProtectedRoute = ({ children }) => {
  const { token, isTokenExpired, logout } = useAuth()

  useEffect(() => {
    if (token && isTokenExpired) {
      logout()
    }
  }, [token, isTokenExpired, logout])

  if (!token || isTokenExpired) {
    return <Navigate to='/login' replace />
  }

  return children
}

export default ProtectedRoute
