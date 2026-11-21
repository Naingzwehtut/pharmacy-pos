import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Alert, Modal } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { formatDate } from '../format'
import { useT } from '../i18n'

const ROLES = ['admin', 'pharmacist', 'cashier']

export default function Users() {
  const { t } = useT()
  const { user: me } = useAuth()
  const [users, setUsers] = useState([])
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState({})

  const load = useCallback(() => api.getUsers().then(setUsers).catch((e) => setError(e.message)), [])
  useEffect(() => {
    load()
  }, [load])

  const open = (u) => {
    setEditing(u || 'new')
    setForm(u ? { full_name: u.full_name || '', role: u.role, password: '' } : { username: '', full_name: '', role: 'cashier', password: '' })
  }

  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.createUser(form)
      else await api.updateUser(editing.id, form)
      setEditing(null)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const toggle = async (u) => {
    try {
      await api.updateUser(u.id, { is_active: !u.is_active })
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('users.title')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => open(null)}>+ {t('users.add')}</button>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="card card-flush">
        <table className="data-table">
          <thead><tr><th>{t('users.username')}</th><th>{t('users.fullName')}</th><th>{t('common.role')}</th><th>{t('common.status')}</th><th>{t('common.date')}</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className={u.is_active ? '' : 'row-muted'}>
                <td className="strong">{u.username}{u.id === me.id && <span className="text-muted"> (you)</span>}</td>
                <td>{u.full_name || '—'}</td>
                <td><span className={`badge badge-role-${u.role}`}>{t(`role.${u.role}`)}</span></td>
                <td>{u.is_active ? <span className="badge badge-ok">{t('common.active')}</span> : <span className="badge badge-muted">{t('common.inactive')}</span>}</td>
                <td>{formatDate(u.created_at)}</td>
                <td className="actions">
                  <button type="button" className="btn btn-sm" onClick={() => open(u)}>{t('common.edit')}</button>
                  {u.id !== me.id && (
                    <button type="button" className="btn btn-sm" onClick={() => toggle(u)}>{u.is_active ? t('users.deactivate') : t('users.activate')}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card role-help">
        <p><strong>{t('role.admin')}</strong> – everything: dashboard & profit, users, settings, void sales.</p>
        <p><strong>{t('role.pharmacist')}</strong> – till, patients, inventory, receive stock, suppliers, expiry report.</p>
        <p><strong>{t('role.cashier')}</strong> – till, patients, credit repayments, own daily closing. Cannot see costs or profit.</p>
      </div>

      {editing && (
        <Modal title={editing === 'new' ? t('users.add') : editing.username} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            {editing === 'new' && (
              <div className="form-group"><label>{t('users.username')} *</label><input value={form.username} onChange={set('username')} required autoFocus pattern="\S+" /></div>
            )}
            <div className="form-group"><label>{t('users.fullName')}</label><input value={form.full_name} onChange={set('full_name')} /></div>
            <div className="form-group">
              <label>{t('common.role')}</label>
              <select value={form.role} onChange={set('role')}>
                {ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}`)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label>{editing === 'new' ? `${t('users.password')} *` : t('users.newPassword')}</label>
              <input type="password" value={form.password} onChange={set('password')} minLength={6} required={editing === 'new'} autoComplete="new-password" />
            </div>
            <div className="modal-actions">
              <button type="button" className="btn" onClick={() => setEditing(null)}>{t('common.cancel')}</button>
              <button type="submit" className="btn btn-primary">{t('common.save')}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  )
}
