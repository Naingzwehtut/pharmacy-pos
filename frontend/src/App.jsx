import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Dashboard from './pages/Dashboard'
import SalesHistory from './pages/SalesHistory'

function PrivateRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  return children
}

function AdminRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (user.role !== 'admin') return <Navigate to="/pos" replace />
  return children
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <PrivateRoute>
            <Layout />
          </PrivateRoute>
        }
      >
        <Route index element={<Navigate to="/pos" replace />} />
        <Route path="pos" element={<POS />} />
        <Route path="inventory" element={<AdminRoute><Inventory /></AdminRoute>} />
        <Route path="dashboard" element={<AdminRoute><Dashboard /></AdminRoute>} />
        <Route path="sales" element={<SalesHistory />} />
      </Route>
    </Routes>
  )
}
