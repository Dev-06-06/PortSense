import { createContext, useContext, useMemo, useState } from 'react'

const AuthContext = createContext(null)

const decodeUserFromToken = (token) => {
  try {
    const payload = token.split('.')[1]
    if (!payload) {
      return null
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
    const json = atob(padded)

    return JSON.parse(json)
  } catch {
    return null
  }
}

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem("token") || null)
  const [user, setUser] = useState(() => {
    try {
      const u = localStorage.getItem("user")
      return u ? JSON.parse(u) : null
    } catch {
      return null
    }
  })

  const login = (receivedToken, userData = decodeUserFromToken(receivedToken)) => {
    localStorage.setItem("token", receivedToken)
    localStorage.setItem("user", JSON.stringify(userData))
    setToken(receivedToken)
    setUser(userData)
  }

  const logout = () => {
    localStorage.removeItem("token")
    localStorage.removeItem("user")
    setToken(null)
    setUser(null)
  }

  const value = useMemo(
    () => ({ user, token, login, logout }),
    [user, token],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export const useAuth = () => {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }

  return context
}
