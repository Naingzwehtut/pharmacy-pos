import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { api } from '../api'
import Logo, { APP_NAME_MM } from '../components/Logo'
import { Alert, Tabs } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useT } from '../i18n'

function NewShop() {
  const { t } = useT()
  const { signInWithToken } = useAuth()
  const navigate = useNavigate()
  const [form, setForm] = useState({
    pharmacy_name: 'Zwe Pharmacy', pharmacy_name_mm: APP_NAME_MM, pharmacy_address: '', pharmacy_phone: '',
    full_name: '', username: 'admin', password: '', confirm: '',
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    if (form.password !== form.confirm) {
      setError(t('setup.mismatch'))
      return
    }
    setSaving(true)
    setError('')
    try {
      signInWithToken(await api.setupOwner(form))
      navigate('/settings')
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit}>
      <Alert>{error}</Alert>
      <div className="form-row">
        <div className="form-group"><label>{t('set.nameEn')}</label><input value={form.pharmacy_name} onChange={set('pharmacy_name')} required /></div>
        <div className="form-group"><label>{t('set.nameMm')}</label><input className="mm" value={form.pharmacy_name_mm} onChange={set('pharmacy_name_mm')} /></div>
      </div>
      <div className="form-row">
        <div className="form-group"><label>{t('common.address')}</label><input value={form.pharmacy_address} onChange={set('pharmacy_address')} /></div>
        <div className="form-group"><label>{t('common.phone')}</label><input value={form.pharmacy_phone} onChange={set('pharmacy_phone')} placeholder="09..." /></div>
      </div>
      <fieldset className="fieldset">
        <legend>{t('setup.owner')}</legend>
        <div className="form-row">
          <div className="form-group"><label>{t('users.fullName')}</label><input value={form.full_name} onChange={set('full_name')} /></div>
          <div className="form-group"><label>{t('users.username')}</label><input value={form.username} onChange={set('username')} required pattern="\S+" /></div>
        </div>
        <div className="form-row">
          <div className="form-group"><label>{t('users.password')}</label><input type="password" value={form.password} onChange={set('password')} minLength={6} required autoComplete="new-password" /></div>
          <div className="form-group"><label>{t('setup.confirm')}</label><input type="password" value={form.confirm} onChange={set('confirm')} minLength={6} required autoComplete="new-password" /></div>
        </div>
      </fieldset>
      <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>{saving ? t('common.saving') : t('setup.start')}</button>
    </form>
  )
}

function FromCloud() {
  const { t } = useT()
  const { refreshSystem } = useAuth()
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
      await refreshSystem()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (result) {
    const tables = result.tables || {}
    return (
      <div>
        <Alert type="success">{t('setup.imported')}</Alert>
        <table className="data-table">
          <tbody>
            {['medicines', 'patients', 'sales', 'users', 'medicine_batches', 'credit_payments'].filter((k) => k in tables).map((k) => (
              <tr key={k}><td>{k.replace('_', ' ')}</td><td className="num">{tables[k]}</td></tr>
            ))}
            <tr><td>files</td><td className="num">{result.files}</td></tr>
          </tbody>
        </table>
        {result.file_errors?.length > 0 && <Alert type="warning">{t('setup.fileErrors', { n: result.file_errors.length })}</Alert>}
        <p className="text-muted">{t('setup.loginWithCloud')}</p>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => navigate('/login')}>{t('login.submit')}</button>
      </div>
    )
  }

  return (
    <form onSubmit={submit}>
      <p className="text-muted">{t('setup.cloudHelp')}</p>
      <Alert>{error}</Alert>
      <div className="form-group">
        <label>{t('setup.dbUrl')} *</label>
        <input value={form.database_url} onChange={set('database_url')} required
          placeholder="postgresql://postgres.xxxx:PASSWORD@aws-0-....pooler.supabase.com:5432/postgres" />
        <div className="hint text-muted">{t('setup.dbUrlHelp')}</div>
      </div>
      <fieldset className="fieldset">
        <legend>{t('setup.files')} ({t('common.optional')})</legend>
        <div className="form-row">
          <div className="form-group"><label>SUPABASE_URL</label><input value={form.supabase_url} onChange={set('supabase_url')} placeholder="https://xxxx.supabase.co" /></div>
          <div className="form-group"><label>{t('setup.secretKey')}</label><input type="password" value={form.supabase_key} onChange={set('supabase_key')} placeholder="sb_secret_..." autoComplete="off" /></div>
        </div>
      </fieldset>
      <p className="text-muted small">{t('setup.readOnly')}</p>
      <button type="submit" className="btn btn-primary btn-lg" disabled={busy}>{busy ? t('setup.importing') : t('setup.import')}</button>
    </form>
  )
}

export default function Setup() {
  const { t, lang, setLang } = useT()
  const { system, user } = useAuth()
  const [tab, setTab] = useState('new')

  if (user) return <Navigate to="/pos" replace />
  if (!system.needs_setup && tab !== 'cloud') return <Navigate to="/login" replace />

  return (
    <div className="setup-page">
      <div className="setup-box">
        <div className="setup-head">
          <Logo sub={APP_NAME_MM} />
          <div className="lang-switch">
            <button type="button" className={lang === 'my' ? 'on' : ''} onClick={() => setLang('my')}>မြန်မာ</button>
            <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => setLang('en')}>English</button>
          </div>
        </div>
        <h1>{t('setup.title')}</h1>
        <p className="text-muted">{t('setup.lead')}</p>
        <Tabs value={tab} onChange={setTab} tabs={[
          { value: 'new', label: t('setup.tabNew') },
          { value: 'cloud', label: t('setup.tabCloud') },
        ]} />
        {tab === 'new' ? <NewShop /> : <FromCloud />}
      </div>
    </div>
  )
}
