import { createContext, useContext, useEffect, useMemo, useState } from 'react'

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
  const [token, setToken] = useState(null)
  const [user, setUser] = useState(null)

  const login = (nextToken) => {
    localStorage.setItem('token', nextToken)
    setToken(nextToken)
    setUser(decodeUserFromToken(nextToken))
  }

  const logout = () => {
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
  }

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    if (!storedToken) {
      return
    }

    setToken(storedToken)
    setUser(decodeUserFromToken(storedToken))
  }, [])

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
