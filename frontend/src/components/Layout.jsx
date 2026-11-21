import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useTheme } from '../context/ThemeContext'
import { useT } from '../i18n'
import Logo, { APP_NAME, APP_NAME_MM } from './Logo'
import { Alert, Modal } from './ui'

const ICONS = {
  pos: 'M3 3h18v4H3zM5 7v14h14V7M9 11h6M9 15h6',
  patients: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  credit: 'M2 7h20v12H2zM2 11h20M6 15h4',
  inventory: 'M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
  purchases: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  sales: 'M4 4h16v16H4zM8 8h8M8 12h8M8 16h5',
  reports: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  dashboard: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  users: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
}

function Icon({ name }) {
  return (
    <svg className="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  )
}

const NAV = [
  { group: 'nav.groupShop' },
  { to: '/pos', key: 'pos', roles: null },
  { to: '/patients', key: 'patients', roles: null },
  { to: '/credit', key: 'credit', roles: null },
  { to: '/sales', key: 'sales', roles: null },
  { group: 'nav.groupStock', roles: ['admin', 'pharmacist'] },
  { to: '/inventory', key: 'inventory', roles: ['admin', 'pharmacist'] },
  { to: '/purchases', key: 'purchases', roles: ['admin', 'pharmacist'] },
  { group: 'nav.groupOffice' },
  { to: '/reports', key: 'reports', roles: null },
  { to: '/dashboard', key: 'dashboard', roles: ['admin'] },
  { to: '/users', key: 'users', roles: ['admin'] },
  { to: '/settings', key: 'settings', roles: ['admin'] },
]

function ChangePassword({ onClose }) {
  const { t } = useT()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await api.changePassword(current, next)
      setMsg({ type: 'success', text: t('common.saved') })
      setTimeout(onClose, 800)
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    }
  }
  return (
    <Modal title={t('nav.changePassword')} onClose={onClose}>
      <form onSubmit={submit}>
        <Alert type={msg?.type}>{msg?.text}</Alert>
        <div className="form-group">
          <label>{t('users.current')}</label>
          <input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} required autoFocus />
        </div>
        <div className="form-group">
          <label>{t('users.password')}</label>
          <input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={6} required />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary">{t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function Layout() {
  const { user, logout } = useAuth()
  const { settings } = useSettings()
  const { t, lang, setLang } = useT()
  const { mode, setMode } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [pwOpen, setPwOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMenuOpen(false), [location.pathname])

  const shopName = lang === 'my' ? settings.pharmacy_name_mm || APP_NAME_MM : settings.pharmacy_name

  return (
    <div className={`app-layout ${menuOpen ? 'menu-open' : ''}`}>
      <header className="topbar">
        <button type="button" className="icon-btn menu-btn" onClick={() => setMenuOpen(!menuOpen)} aria-label={t('nav.menu')}>
          ☰
        </button>
        <Logo />
      </header>

      <aside className="sidebar">
        <div className="sidebar-header">
          <Logo sub={shopName === APP_NAME ? APP_NAME_MM : shopName} />
        </div>
        <nav className="sidebar-nav">
          {NAV.filter((n) => !n.roles || n.roles.includes(user?.role)).map((n) => (n.group ? (
            <div key={n.group} className="nav-group">{t(n.group)}</div>
          ) : (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={n.key} />
              <span>{t(`nav.${n.key}`)}</span>
            </NavLink>
          )))}
        </nav>
        <div className="sidebar-footer">
          <div className="lang-switch" role="group" aria-label="Language">
            <button type="button" className={lang === 'my' ? 'on' : ''} onClick={() => setLang('my')}>မြန်မာ</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
          <div className="lang-switch theme-switch" role="group" aria-label={t('theme.label')}>
            {['light', 'dark', 'system'].map((m) => (
              <button key={m} type="button" className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>{t(`theme.${m}`)}</button>
            ))}
          </div>
          <div className="user-box">
            <div className="user-name">{user?.full_name || user?.username}</div>
            <div className="user-role">{t(`role.${user?.role}`)}</div>
          </div>
          <div className="sidebar-actions">
            <button type="button" onClick={() => setPwOpen(true)}>{t('nav.changePassword')}</button>
            <button type="button" onClick={logout}>{t('nav.signOut')}</button>
          </div>
        </div>
      </aside>
      <div className="sidebar-scrim" onClick={() => setMenuOpen(false)} />
      <main className="main-content">
        <Outlet />
      </main>
      {pwOpen && <ChangePassword onClose={() => setPwOpen(false)} />}
    </div>
  )
}
