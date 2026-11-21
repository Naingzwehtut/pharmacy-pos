import { createContext, useContext, useEffect, useState } from 'react'
import { api } from '../api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  // { desktop, needs_setup, version } from the server
  const [system, setSystem] = useState({ desktop: false, needs_setup: false })

  const refreshSystem = () =>
    api.systemStatus().then(setSystem).catch(() => {})

  useEffect(() => {
    refreshSystem()
  }, [])

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (token) {
      api.me()
        .then(setUser)
        .catch(() => {
          localStorage.removeItem('token')
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
    // The API client fires this when the server rejects the token
    const onExpired = () => setUser(null)
    window.addEventListener('auth:expired', onExpired)
    return () => window.removeEventListener('auth:expired', onExpired)
  }, [])

  // After first-run setup or a cloud import the server hands back a token
  const signInWithToken = (data) => {
    localStorage.setItem('token', data.access_token)
    setUser(data.user)
    setSystem((s) => ({ ...s, needs_setup: false }))
  }

  const login = async (username, password) => {
    const data = await api.login(username, password)
    localStorage.setItem('token', data.access_token)
    setUser(data.user)
    return data.user
  }

  const logout = () => {
    localStorage.removeItem('token')
    setUser(null)
  }

  const can = (...roles) => Boolean(user && roles.includes(user.role))

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, can, system, refreshSystem, signInWithToken }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
