import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import Logo, { APP_NAME_MM } from '../components/Logo'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

export default function Login() {
  const { user, login } = useAuth()
  const { t, lang, setLang } = useT()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (user) return <Navigate to="/pos" replace />

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(username.trim(), password)
      navigate('/pos')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-page">
      <aside className="login-side">
        <Logo sub={APP_NAME_MM} />
        <div className="login-side-text">
          <h2>{t('login.tagline')}</h2>
          <p>{t('login.taglineSub')}</p>
        </div>
        <div className="login-side-foot">© {new Date().getFullYear()} Zwe Pharmacy</div>
      </aside>
      <main className="login-main">
        <div className="login-box">
          <h1>{t('login.title')}</h1>
          <p className="lead">{t('login.lead')}</p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">{t('login.username')}</label>
              <input id="username" value={username} onChange={(e) => setUsername(e.target.value)}
                autoComplete="username" autoFocus required />
            </div>
            <div className="form-group">
              <label htmlFor="password">{t('login.password')}</label>
              <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password" required />
            </div>
            <button type="submit" className="btn btn-primary btn-block btn-lg" disabled={loading}>
              {loading ? t('login.signingIn') : t('login.submit')}
            </button>
          </form>
          <div className="login-lang">
            <div className="lang-switch">
              <button type="button" className={lang === 'my' ? 'on' : ''} onClick={() => setLang('my')}>မြန်မာ</button>
              <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}
