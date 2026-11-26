import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'

/** First run of the desktop app: start a new shop, or copy the data from the cloud. */
export default function Setup() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('new')
  const [checked, setChecked] = useState(false)

  useEffect(() => {
    api.systemStatus()
      .then((s) => (s.needs_setup ? setChecked(true) : navigate('/login', { replace: true })))
      .catch(() => setChecked(true))
  }, [navigate])

  if (!checked) return <div className="loading">Loading...</div>

  return (
    <div className="login-page">
      <div className="login-box setup-box">
        <h1>Welcome to Zwe POS</h1>
        <p className="text-muted" style={{ marginTop: -4 }}>
          Everything is saved on this computer, including patient images, so it works without internet.
        </p>
        <div className="setup-tabs">
          <button type="button" className={`btn ${tab === 'new' ? 'btn-primary' : ''}`} onClick={() => setTab('new')}>
            Start a new shop
          </button>
          <button type="button" className={`btn ${tab === 'cloud' ? 'btn-primary' : ''}`} onClick={() => setTab('cloud')}>
            Move data from the cloud
          </button>
        </div>
        {tab === 'new' ? <NewShop /> : <FromCloud />}
      </div>
    </div>
  )
}

function NewShop() {
  const [form, setForm] = useState({
    pharmacy_name: 'ZWE PHARMACY', pharmacy_address: '', pharmacy_phone: '',
    username: 'admin', password: '', confirm: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError('The two passwords are different')
      return
    }
    setSaving(true)
    setError('')
    try {
      const data = await api.setupOwner(form)
      localStorage.setItem('token', data.access_token)
      window.location.replace('/dashboard') // reload so the app picks up the new login
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group"><label>Pharmacy name</label><input value={form.pharmacy_name} onChange={set('pharmacy_name')} required /></div>
      <div className="form-row">
        <div className="form-group"><label>Address</label><input value={form.pharmacy_address} onChange={set('pharmacy_address')} /></div>
        <div className="form-group"><label>Phone</label><input value={form.pharmacy_phone} onChange={set('pharmacy_phone')} /></div>
      </div>
      <div className="form-group"><label>Admin username</label><input value={form.username} onChange={set('username')} required pattern="\S+" /></div>
      <div className="form-row">
        <div className="form-group"><label>Password</label><input type="password" value={form.password} onChange={set('password')} minLength={6} required autoComplete="new-password" /></div>
        <div className="form-group"><label>Repeat password</label><input type="password" value={form.confirm} onChange={set('confirm')} minLength={6} required autoComplete="new-password" /></div>
      </div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={saving}>
        {saving ? 'Saving...' : 'Start'}
      </button>
    </form>
  )
}

function FromCloud() {
  const navigate = useNavigate()
  const [form, setForm] = useState({ database_url: '', supabase_url: '', supabase_key: '' })
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      setResult(await api.importCloud(form))
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const t = result.tables || {}
    return (
      <div>
        <div className="alert alert-success">Done. Your data is now on this computer.</div>
        <table className="data-table">
          <tbody>
            {['medicines', 'patients', 'sales', 'users', 'patient_investigations'].filter((k) => k in t).map((k) => (
              <tr key={k}><td>{k.replace('_', ' ')}</td><td className="num">{t[k]}</td></tr>
            ))}
            <tr><td>image / PDF files</td><td className="num">{result.files}</td></tr>
          </tbody>
        </table>
        {result.file_errors?.length > 0 && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>
            {result.file_errors.length} files could not be downloaded. Check the Supabase URL and secret key.
          </div>
        )}
        <p className="text-muted">Sign in with the same username and password you used before.</p>
        <button type="button" className="btn btn-primary" style={{ width: '100%' }} onClick={() => navigate('/login')}>Sign In</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className="text-muted">
        Copies medicines, patients, visits, sales, settings and staff accounts from your Supabase database to this
        computer. The cloud database is only read, never changed.
      </p>
      {error && <div className="alert alert-error">{error}</div>}
      <div className="form-group">
        <label>Database connection string *</label>
        <input value={form.database_url} onChange={set('database_url')} required
          placeholder="postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres" />
        <div className="text-muted mt-8">Supabase → Connect → Session pooler. Replace [YOUR-PASSWORD] with your database password.</div>
      </div>
      <p className="text-muted mt-8"><strong>Investigation images (optional):</strong> to bring blood reports and scans to this computer, add:</p>
      <div className="form-group"><label>SUPABASE_URL</label><input value={form.supabase_url} onChange={set('supabase_url')} placeholder="https://xxxx.supabase.co" /></div>
      <div className="form-group"><label>Secret key (sb_secret_… or service_role)</label><input type="password" value={form.supabase_key} onChange={set('supabase_key')} autoComplete="off" /></div>
      <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={busy}>
        {busy ? 'Copying... this can take a few minutes' : 'Copy data to this computer'}
      </button>
    </form>
  )
}
