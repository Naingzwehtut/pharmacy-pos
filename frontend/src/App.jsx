import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
import Purchases from './pages/Purchases'
import SalesHistory from './pages/SalesHistory'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'
import Credit from './pages/Credit'
import Reports from './pages/Reports'
import Users from './pages/Users'
import Settings from './pages/Settings'

function PrivateRoute({ children, roles }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="loading">Loading...</div>
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to="/pos" replace />
  return children
}

// Charts are heavy: load the dashboard only when an admin opens it
const Dashboard = lazy(() => import('./pages/Dashboard'))

const STOCK = ['admin', 'pharmacist']
const ADMIN = ['admin']

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
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="credit" element={<Credit />} />
        <Route path="sales" element={<SalesHistory />} />
        <Route path="reports" element={<Reports />} />
        <Route path="inventory" element={<PrivateRoute roles={STOCK}><Inventory /></PrivateRoute>} />
        <Route path="purchases" element={<PrivateRoute roles={STOCK}><Purchases /></PrivateRoute>} />
        <Route path="dashboard" element={<PrivateRoute roles={ADMIN}><Suspense fallback={<div className="loading">Loading...</div>}><Dashboard /></Suspense></PrivateRoute>} />
        <Route path="users" element={<PrivateRoute roles={ADMIN}><Users /></PrivateRoute>} />
        <Route path="settings" element={<PrivateRoute roles={ADMIN}><Settings /></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/pos" replace />} />
      </Route>
    </Routes>
  )
}
