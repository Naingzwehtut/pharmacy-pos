import { Fragment, useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Alert, Empty, Modal, Tabs } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { formatDate, formatNumber, todayISO } from '../format'
import { useT } from '../i18n'

function MedicineSearch({ onPick }) {
  const { t } = useT()
  const [q, setQ] = useState('')
  const [results, setResults] = useState([])
  useEffect(() => {
    if (!q.trim()) {
      setResults([])
      return undefined
    }
    const timer = setTimeout(() => {
      api.getMedicines({ search: q, include_expired: 'true', limit: 8 }).then(setResults).catch(() => setResults([]))
    }, 200)
    return () => clearTimeout(timer)
  }, [q])
  return (
    <div className="patient-picker">
      <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('pur.pickMedicine')} />
      {results.length > 0 && (
        <div className="patient-results">
          {results.map((m) => (
            <button key={m.id} type="button" className="patient-result" onClick={() => { onPick(m); setQ(''); setResults([]) }}>
              <span>{m.name}</span>
              <span className="text-muted">{m.generic_name} · {m.stock_quantity} {m.unit_name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function NewDelivery({ suppliers, onSaved }) {
  const { t } = useT()
  const { money } = useSettings()
  const [head, setHead] = useState({ supplier_id: '', invoice_number: '', purchase_date: todayISO(), notes: '' })
  const [lines, setLines] = useState([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const addLine = (m) => {
    const unit = m.box_size ? 'box' : m.strip_size ? 'strip' : 'unit'
    const size = unit === 'box' ? m.box_size : unit === 'strip' ? m.strip_size : 1
    setLines((prev) => [...prev, {
      id: `${m.id}-${Date.now()}`, medicine: m, unit, quantity: '1',
      unit_cost: m.cost_price != null ? String(Math.round(m.cost_price * size)) : '',
      batch_number: '', expiry_date: '', selling_price: '',
    }])
  }
  const setLine = (id, key, value) => setLines((prev) => prev.map((l) => (l.id === id ? { ...l, [key]: value } : l)))
  const total = lines.reduce((s, l) => s + (Number(l.unit_cost) || 0) * (Number(l.quantity) || 0), 0)

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setSaving(true)
    try {
      const res = await api.createPurchase({
        ...head,
        supplier_id: head.supplier_id || null,
        items: lines.map((l) => ({
          medicine_id: l.medicine.id, unit: l.unit, quantity: Number(l.quantity),
          unit_cost: Number(l.unit_cost) || 0, batch_number: l.batch_number,
          expiry_date: l.expiry_date, selling_price: l.selling_price === '' ? null : Number(l.selling_price),
        })),
      })
      setMessage(`${t('pur.saved', { n: res.items.length })} ${res.purchase_number}`)
      setLines([])
      setHead({ ...head, invoice_number: '', notes: '' })
      onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="card">
      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="success" onClose={() => setMessage('')}>{message}</Alert>
      <div className="form-row">
        <div className="form-group">
          <label>{t('pur.supplier')}</label>
          <select value={head.supplier_id} onChange={(e) => setHead({ ...head, supplier_id: e.target.value })}>
            <option value="">—</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="form-group"><label>{t('pur.invoice')}</label><input value={head.invoice_number} onChange={(e) => setHead({ ...head, invoice_number: e.target.value })} /></div>
        <div className="form-group"><label>{t('pur.date')}</label><input type="date" value={head.purchase_date} max={todayISO()} onChange={(e) => setHead({ ...head, purchase_date: e.target.value })} /></div>
      </div>

      <div className="form-group"><label>{t('pur.addLine')}</label><MedicineSearch onPick={addLine} /></div>

      {lines.length > 0 && (
        <div className="table-scroll">
          <table className="data-table purchase-lines">
            <thead>
              <tr>
                <th>{t('pur.items')}</th><th>{t('inv.packs')}</th><th className="num">{t('common.quantity')}</th>
                <th className="num">{t('pur.unitCost')}</th><th>{t('inv.batchNo')}</th><th>{t('inv.expiry')} *</th>
                <th className="num">{t('pur.newPrice')}</th><th className="num">{t('pur.lineTotal')}</th><th></th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const opts = l.medicine.pack_options
                const size = opts.find((o) => o.unit === l.unit)?.size || 1
                return (
                  <tr key={l.id}>
                    <td><div className="strong">{l.medicine.name}</div><div className="text-muted small">{l.medicine.generic_name}</div></td>
                    <td>
                      <select value={l.unit} onChange={(e) => setLine(l.id, 'unit', e.target.value)}>
                        {opts.map((o) => <option key={o.unit} value={o.unit}>{o.unit === 'unit' ? l.medicine.unit_name : `${t(`unit.${o.unit}`)} (${o.size})`}</option>)}
                      </select>
                    </td>
                    <td className="num"><input className="w-sm" type="number" min="1" value={l.quantity} onChange={(e) => setLine(l.id, 'quantity', e.target.value)} required /></td>
                    <td className="num"><input className="w-md" type="number" min="0" step="any" value={l.unit_cost} onChange={(e) => setLine(l.id, 'unit_cost', e.target.value)} required /></td>
                    <td><input className="w-md" value={l.batch_number} onChange={(e) => setLine(l.id, 'batch_number', e.target.value)} /></td>
                    <td><input type="date" value={l.expiry_date} min={todayISO()} onChange={(e) => setLine(l.id, 'expiry_date', e.target.value)} required /></td>
                    <td className="num"><input className="w-md" type="number" min="0" step="any" value={l.selling_price} placeholder={formatNumber(l.medicine.selling_price)} onChange={(e) => setLine(l.id, 'selling_price', e.target.value)} /></td>
                    <td className="num">
                      {formatNumber((Number(l.unit_cost) || 0) * (Number(l.quantity) || 0))}
                      <div className="text-muted small">= {(Number(l.quantity) || 0) * size} {l.medicine.unit_name}</div>
                    </td>
                    <td><button type="button" className="icon-btn danger" onClick={() => setLines((p) => p.filter((x) => x.id !== l.id))}>×</button></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="form-group"><label>{t('common.notes')}</label><input value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} /></div>
      <div className="form-footer">
        <div className="totals-grand inline"><span>{t('common.total')}</span><span>{money(total)}</span></div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={saving || lines.length === 0}>
          {saving ? t('common.saving') : t('pur.save')}
        </button>
      </div>
    </form>
  )
}

function History() {
  const { t } = useT()
  const { money } = useSettings()
  const [rows, setRows] = useState([])
  const [open, setOpen] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.getPurchases().then(setRows).catch((e) => setError(e.message))
  }, [])
  return (
    <div className="card card-flush">
      <Alert>{error}</Alert>
      {rows.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
        <table className="data-table">
          <thead><tr><th>{t('common.date')}</th><th>GRN</th><th>{t('pur.supplier')}</th><th>{t('pur.invoice')}</th><th className="num">{t('pur.items')}</th><th className="num">{t('common.total')}</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <Fragment key={p.id}>
                <tr>
                  <td>{formatDate(p.purchase_date)}</td><td className="small">{p.purchase_number}</td>
                  <td>{p.supplier_name || '—'}</td><td>{p.invoice_number || '—'}</td>
                  <td className="num">{p.item_count}</td><td className="num">{money(p.total_cost)}</td>
                  <td><button type="button" className="btn btn-sm" onClick={() => setOpen(open === p.id ? null : p.id)}>{open === p.id ? t('common.hide') : t('common.details')}</button></td>
                </tr>
                {open === p.id && (
                  <tr className="detail-row"><td colSpan={7}>
                    <table className="data-table inner">
                      <thead><tr><th>{t('pur.items')}</th><th>{t('inv.batchNo')}</th><th>{t('inv.expiry')}</th><th className="num">{t('common.quantity')}</th><th className="num">{t('inv.unitCost')}</th><th className="num">{t('common.total')}</th></tr></thead>
                      <tbody>
                        {p.items.map((i) => (
                          <tr key={i.batch_id}><td>{i.medicine_name}</td><td>{i.batch_number || '—'}</td><td>{formatDate(i.expiry_date)}</td><td className="num">{i.quantity}</td><td className="num">{formatNumber(i.cost_price)}</td><td className="num">{formatNumber(i.line_cost)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                    {p.notes && <p className="text-muted">{p.notes}</p>}
                  </td></tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function Suppliers({ suppliers, reload }) {
  const { t } = useT()
  const { can } = useAuth()
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({})
  const open = (s) => { setEditing(s || 'new'); setForm(s ? { ...s } : { name: '', contact_person: '', phone: '', address: '', notes: '' }) }
  const save = async (e) => {
    e.preventDefault()
    try {
      if (editing === 'new') await api.createSupplier(form)
      else await api.updateSupplier(editing.id, form)
      setEditing(null)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }
  const remove = async (s) => {
    if (!window.confirm(`${t('common.delete')} "${s.name}"?`)) return
    try {
      await api.deleteSupplier(s.id)
      reload()
    } catch (err) {
      setError(err.message)
    }
  }
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  return (
    <div className="card card-flush">
      <div className="card-toolbar"><button type="button" className="btn btn-primary btn-sm" onClick={() => open(null)}>+ {t('pur.addSupplier')}</button></div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      {suppliers.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
        <table className="data-table">
          <thead><tr><th>{t('common.name')}</th><th>{t('pur.contact')}</th><th>{t('common.phone')}</th><th>{t('common.address')}</th><th></th></tr></thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.id}>
                <td className="strong">{s.name}</td><td>{s.contact_person || '—'}</td><td>{s.phone || '—'}</td><td>{s.address || '—'}</td>
                <td className="actions">
                  <button type="button" className="btn btn-sm" onClick={() => open(s)}>{t('common.edit')}</button>
                  {can('admin') && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => remove(s)}>{t('common.delete')}</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {editing && (
        <Modal title={editing === 'new' ? t('pur.addSupplier') : editing.name} onClose={() => setEditing(null)}>
          <form onSubmit={save}>
            <div className="form-group"><label>{t('common.name')} *</label><input value={form.name} onChange={set('name')} required autoFocus /></div>
            <div className="form-row">
              <div className="form-group"><label>{t('pur.contact')}</label><input value={form.contact_person || ''} onChange={set('contact_person')} /></div>
              <div className="form-group"><label>{t('common.phone')}</label><input value={form.phone || ''} onChange={set('phone')} /></div>
            </div>
            <div className="form-group"><label>{t('common.address')}</label><input value={form.address || ''} onChange={set('address')} /></div>
            <div className="form-group"><label>{t('common.notes')}</label><input value={form.notes || ''} onChange={set('notes')} /></div>
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

export default function Purchases() {
  const { t } = useT()
  const [tab, setTab] = useState('new')
  const [suppliers, setSuppliers] = useState([])
  const [version, setVersion] = useState(0)
  const loadSuppliers = useCallback(() => api.getSuppliers().then(setSuppliers).catch(() => {}), [])
  useEffect(() => {
    loadSuppliers()
  }, [loadSuppliers])

  return (
    <div>
      <div className="page-header"><h1 className="page-title">{t('pur.title')}</h1></div>
      <Tabs value={tab} onChange={setTab} tabs={[
        { value: 'new', label: t('pur.new') },
        { value: 'history', label: t('pur.history') },
        { value: 'suppliers', label: t('pur.suppliers'), count: suppliers.length },
      ]} />
      {tab === 'new' && <NewDelivery suppliers={suppliers} onSaved={() => setVersion(version + 1)} />}
      {tab === 'history' && <History key={version} />}
      {tab === 'suppliers' && <Suppliers suppliers={suppliers} reload={loadSuppliers} />}
    </div>
  )
}
