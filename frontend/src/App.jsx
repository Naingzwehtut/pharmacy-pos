import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import POS from './pages/POS'
import Inventory from './pages/Inventory'
// The dashboard pulls in the charts library (most of the app's size). Load it
// only when an admin opens it, so the till and login screens start faster.
const Dashboard = lazy(() => import('./pages/Dashboard'))
import SalesHistory from './pages/SalesHistory'
import Patients from './pages/Patients'
import PatientDetail from './pages/PatientDetail'

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
        <Route
          path="dashboard"
          element={
            <AdminRoute>
              <Suspense fallback={<div className="loading">Loading dashboard...</div>}>
                <Dashboard />
              </Suspense>
            </AdminRoute>
          }
        />
        <Route path="patients" element={<Patients />} />
        <Route path="patients/:id" element={<PatientDetail />} />
        <Route path="sales" element={<SalesHistory />} />
      </Route>
    </Routes>
  )
}
