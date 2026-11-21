import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
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
      <div className="login-box">
        <div className="login-brand">
          <div className="brand-mark brand-mark-lg">℞</div>
          <div>
            <div className="login-app">Pharmacy & Clinic POS</div>
            <div className="text-muted">ဆေးဆိုင်နှင့် ဆေးခန်း အရောင်းစနစ်</div>
          </div>
        </div>
        <h1>{t('login.title')}</h1>
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
        <div className="lang-switch lang-switch-center">
          <button type="button" className={lang === 'my' ? 'on' : ''} onClick={() => setLang('my')}>မြန်မာ</button>
          <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
        </div>
      </div>
    </div>
  )
}
