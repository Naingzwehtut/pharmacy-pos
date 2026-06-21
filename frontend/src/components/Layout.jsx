import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Layout() {
  const { user, logout } = useAuth()

  return (
    <div className="app-layout">
      <aside className="sidebar">
        <div className="sidebar-header">Pharmacy POS</div>
        <nav className="sidebar-nav">
          <NavLink to="/pos" className={({ isActive }) => isActive ? 'active' : ''}>
            Point of Sale
          </NavLink>
          {user?.role === 'admin' && (
            <>
              <NavLink to="/inventory" className={({ isActive }) => isActive ? 'active' : ''}>
                Inventory
              </NavLink>
              <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'active' : ''}>
                Dashboard
              </NavLink>
            </>
          )}
          <NavLink to="/sales" className={({ isActive }) => isActive ? 'active' : ''}>
            Sales History
          </NavLink>
        </nav>
        <div className="sidebar-footer">
          <div>{user?.username} ({user?.role})</div>
          <button type="button" onClick={logout}>Sign Out</button>
        </div>
      </aside>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}
