import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Alert, DrugThumb, Empty, ExpiryBadge, Modal, Tabs } from '../components/ui'
import { resizeImage } from '../image'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { describeQuantity, formatDate, formatDateTime, formatNumber } from '../format'
import { useT } from '../i18n'

const EMPTY_FORM = {
  name: '', generic_name: '', name_mm: '', category: '', manufacturer: '', barcode: '', shelf_location: '',
  unit_name: 'tablet', selling_price: '', cost_price: '',
  strip_size: '', strip_price: '', box_size: '', box_price: '',
  reorder_level: '10', requires_prescription: false, is_active: true,
  stock_quantity: '', expiry_date: '', batch_number: '',
}

const REASONS = ['count', 'damaged', 'expired', 'lost', 'returned_to_supplier', 'other']

function PhotoPicker({ medicine, photo, onPick, onRemove }) {
  const { t } = useT()
  const preview = photo ? URL.createObjectURL(photo) : medicine?.has_image ? api.medicineImageUrl(medicine) : null
  return (
    <div className="photo-picker">
      <div className="photo-box">
        {preview ? <img src={preview} alt="" /> : <span className="text-muted small">{t('inv.noPhoto')}</span>}
      </div>
      <div className="photo-actions">
        <label className="btn btn-sm">
          {preview ? t('inv.changePhoto') : t('inv.addPhoto')}
          <input type="file" accept="image/*" capture="environment" hidden
            onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPick(f) }} />
        </label>
        {preview && <button type="button" className="btn btn-sm btn-danger-ghost" onClick={onRemove}>{t('common.delete')}</button>}
        <div className="text-muted small">{t('inv.photoHelp')}</div>
      </div>
    </div>
  )
}

function MedicineForm({ medicine, categories, onSaved, onClose }) {
  const { t } = useT()
  const [form, setForm] = useState(() => {
    if (!medicine) return EMPTY_FORM
    const f = { ...EMPTY_FORM }
    for (const k of Object.keys(EMPTY_FORM)) {
      if (medicine[k] !== undefined && medicine[k] !== null) f[k] = typeof medicine[k] === 'number' ? String(medicine[k]) : medicine[k]
    }
    return f
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [photo, setPhoto] = useState(null) // resized Blob waiting to upload
  const [removePhoto, setRemovePhoto] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  const pickPhoto = async (file) => {
    try {
      setPhoto(await resizeImage(file))
      setRemovePhoto(false)
    } catch (err) {
      setError(err.message)
    }
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = { ...form }
    if (medicine) {
      delete payload.stock_quantity
      delete payload.expiry_date
      delete payload.batch_number
    }
    try {
      let saved = medicine ? await api.updateMedicine(medicine.id, payload) : await api.createMedicine(payload)
      if (photo) saved = await api.uploadMedicineImage(saved.id, photo)
      else if (removePhoto && saved.has_image) saved = await api.deleteMedicineImage(saved.id)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={medicine ? t('inv.edit') : t('inv.add')} onClose={onClose} wide>
      <Alert>{error}</Alert>
      <form onSubmit={submit}>
        <PhotoPicker
          medicine={removePhoto ? null : medicine}
          photo={photo}
          onPick={pickPhoto}
          onRemove={() => { setPhoto(null); setRemovePhoto(true) }}
        />
        <div className="form-row">
          <div className="form-group"><label>{t('inv.name')} *</label><input value={form.name} onChange={set('name')} required autoFocus /></div>
          <div className="form-group"><label>{t('inv.generic')}</label><input value={form.generic_name} onChange={set('generic_name')} /></div>
          <div className="form-group"><label>{t('inv.nameMm')}</label><input className="mm" value={form.name_mm} onChange={set('name_mm')} /></div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('common.category')} *</label>
            <input value={form.category} onChange={set('category')} list="categories" required />
            <datalist id="categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="form-group"><label>{t('inv.manufacturer')}</label><input value={form.manufacturer} onChange={set('manufacturer')} /></div>
          <div className="form-group"><label>{t('inv.barcode')}</label><input value={form.barcode} onChange={set('barcode')} /></div>
          <div className="form-group"><label>{t('inv.shelf')}</label><input value={form.shelf_location} onChange={set('shelf_location')} placeholder="A-3" /></div>
        </div>

        <fieldset className="fieldset">
          <legend>{t('inv.packs')}</legend>
          <div className="form-row">
            <div className="form-group"><label>{t('inv.unitName')}</label><input value={form.unit_name} onChange={set('unit_name')} list="units" /></div>
            <datalist id="units">{['tablet', 'capsule', 'bottle', 'sachet', 'tube', 'ampoule', 'vial', 'piece', 'inhaler'].map((u) => <option key={u} value={u} />)}</datalist>
            <div className="form-group"><label>{t('inv.unitPrice')} *</label><input type="number" min="0" step="any" value={form.selling_price} onChange={set('selling_price')} required /></div>
            <div className="form-group"><label>{t('inv.unitCost')}</label><input type="number" min="0" step="any" value={form.cost_price} onChange={set('cost_price')} /></div>
          </div>
          <div className="form-row">
            <div className="form-group"><label>{t('inv.stripSize')}</label><input type="number" min="0" value={form.strip_size} onChange={set('strip_size')} placeholder="10" /></div>
            <div className="form-group"><label>{t('inv.stripPrice')}</label><input type="number" min="0" step="any" value={form.strip_price} onChange={set('strip_price')} disabled={!form.strip_size} /></div>
            <div className="form-group"><label>{t('inv.boxSize')}</label><input type="number" min="0" value={form.box_size} onChange={set('box_size')} placeholder="100" /></div>
            <div className="form-group"><label>{t('inv.boxPrice')}</label><input type="number" min="0" step="any" value={form.box_price} onChange={set('box_price')} disabled={!form.box_size} /></div>
          </div>
        </fieldset>

        <div className="form-row">
          <div className="form-group"><label>{t('inv.reorder')}</label><input type="number" min="0" value={form.reorder_level} onChange={set('reorder_level')} /></div>
          <label className="check"><input type="checkbox" checked={form.requires_prescription} onChange={set('requires_prescription')} /> {t('inv.rx')}</label>
          <label className="check"><input type="checkbox" checked={form.is_active} onChange={set('is_active')} /> {t('inv.active')}</label>
        </div>

        {!medicine && (
          <fieldset className="fieldset">
            <legend>{t('inv.opening')} ({t('common.optional')})</legend>
            <div className="form-row">
              <div className="form-group"><label>{t('inv.openingQty')}</label><input type="number" min="0" value={form.stock_quantity} onChange={set('stock_quantity')} /></div>
              <div className="form-group"><label>{t('inv.expiry')}</label><input type="date" value={form.expiry_date} onChange={set('expiry_date')} required={Number(form.stock_quantity) > 0} /></div>
              <div className="form-group"><label>{t('inv.batchNo')}</label><input value={form.batch_number} onChange={set('batch_number')} /></div>
            </div>
          </fieldset>
        )}

        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
        </div>
      </form>
    </Modal>
  )
}

function StockModal({ medicineId, onClose, onChanged }) {
  const { t } = useT()
  const { money } = useSettings()
  const [medicine, setMedicine] = useState(null)
  const [moves, setMoves] = useState([])
  const [tab, setTab] = useState('batches')
  const [error, setError] = useState('')
  const [adj, setAdj] = useState({ change: '', reason: 'count', batch_id: '', expiry_date: '', note: '' })

  const load = useCallback(async () => {
    try {
      const [m, mv] = await Promise.all([api.getMedicine(medicineId), api.getMovements({ medicine_id: medicineId, limit: 100 })])
      setMedicine(m)
      setMoves(mv)
    } catch (err) {
      setError(err.message)
    }
  }, [medicineId])

  useEffect(() => {
    load()
  }, [load])

  const submitAdjust = async (e) => {
    e.preventDefault()
    setError('')
    try {
      await api.adjustStock(medicineId, {
        change: Number(adj.change),
        reason: adj.reason,
        batch_id: adj.batch_id || null,
        expiry_date: adj.expiry_date || null,
        note: adj.note,
      })
      setAdj({ change: '', reason: 'count', batch_id: '', expiry_date: '', note: '' })
      await load()
      onChanged()
      setTab('batches')
    } catch (err) {
      setError(err.message)
    }
  }

  const adding = Number(adj.change) > 0

  return (
    <Modal title={medicine ? medicine.name : t('common.loading')} onClose={onClose} wide>
      <Alert>{error}</Alert>
      {medicine && (
        <>
          <div className="stock-summary">
            <span>{t('inv.stock')}: <strong>{describeQuantity(medicine.stock_quantity, medicine, t)}</strong></span>
            <span>{t('inv.sellable')}: <strong>{medicine.sellable_quantity}</strong></span>
            {medicine.expired_quantity > 0 && <span className="text-danger">{t('inv.expiredQty')}: <strong>{medicine.expired_quantity}</strong></span>}
          </div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'batches', label: t('inv.batches'), count: medicine.batches.filter((b) => b.quantity > 0).length },
              { value: 'adjust', label: t('inv.adjust') },
              { value: 'history', label: t('inv.history') },
            ]}
          />
          {tab === 'batches' && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('inv.batchNo')}</th><th>{t('inv.expiry')}</th><th className="num">{t('inv.stock')}</th>
                  <th className="num">{t('inv.unitCost')}</th><th>{t('common.status')}</th>
                </tr>
              </thead>
              <tbody>
                {medicine.batches.filter((b) => b.quantity > 0).map((b) => (
                  <tr key={b.id}>
                    <td>{b.batch_number || '—'}</td>
                    <td>{formatDate(b.expiry_date)}</td>
                    <td className="num">{b.quantity} / {b.initial_quantity}</td>
                    <td className="num">{b.cost_price != null ? money(b.cost_price) : '—'}</td>
                    <td><ExpiryBadge status={b.expiry_status} days={b.days_to_expiry} /></td>
                  </tr>
                ))}
                {medicine.batches.every((b) => b.quantity <= 0) && (
                  <tr><td colSpan={5}><Empty>{t('inv.noStock')}</Empty></td></tr>
                )}
              </tbody>
            </table>
          )}
          {tab === 'adjust' && (
            <form onSubmit={submitAdjust}>
              <div className="form-row">
                <div className="form-group">
                  <label>{t('inv.change')}</label>
                  <input type="number" value={adj.change} onChange={(e) => setAdj({ ...adj, change: e.target.value })} required placeholder="-5 / 20" />
                </div>
                <div className="form-group">
                  <label>{t('common.reason')}</label>
                  <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}>
                    {REASONS.map((r) => <option key={r} value={r}>{t(`inv.reason.${r}`)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('inv.batchNo')}</label>
                  <select value={adj.batch_id} onChange={(e) => setAdj({ ...adj, batch_id: e.target.value })}>
                    <option value="">{adding ? '+ new batch' : t('inv.anyBatch')}</option>
                    {medicine.batches.filter((b) => b.quantity > 0 || adding).map((b) => (
                      <option key={b.id} value={b.id}>{b.batch_number || `#${b.id}`} · {b.expiry_date} · {b.quantity}</option>
                    ))}
                  </select>
                </div>
                {adding && !adj.batch_id && (
                  <div className="form-group">
                    <label>{t('inv.expiry')}</label>
                    <input type="date" value={adj.expiry_date} onChange={(e) => setAdj({ ...adj, expiry_date: e.target.value })} required />
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>{t('common.notes')}</label>
                <input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="submit" className="btn btn-primary">{t('common.save')}</button>
              </div>
            </form>
          )}
          {tab === 'history' && (
            <div className="table-scroll" style={{ maxHeight: 360 }}>
              <table className="data-table">
                <thead><tr><th>{t('common.date')}</th><th className="num">±</th><th>{t('common.reason')}</th><th>Ref</th><th>{t('common.cashier')}</th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td>{formatDateTime(m.created_at)}</td>
                      <td className={`num ${m.change < 0 ? 'text-danger' : 'text-ok'}`}>{m.change > 0 ? `+${m.change}` : m.change}</td>
                      <td>{m.reason.startsWith('adjust:') ? t(`inv.reason.${m.reason.slice(7)}`) : m.reason}{m.note ? ` – ${m.note}` : ''}</td>
                      <td className="text-muted">{m.reference || m.batch_number || ''}</td>
                      <td>{m.user_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </Modal>
  )
}

export default function Inventory() {
  const { t } = useT()
  const { can } = useAuth()
  const { money } = useSettings()
  const [medicines, setMedicines] = useState([])
  const [categories, setCategories] = useState([])
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(null) // null | 'new' | medicine
  const [stockId, setStockId] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setMedicines(await api.getMedicines({ search, include_expired: 'true', status }))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search, status])

  useEffect(() => {
    const timer = setTimeout(load, 250)
    return () => clearTimeout(timer)
  }, [load])

  useEffect(() => {
    api.getCategories().then(setCategories).catch(() => {})
  }, [])

  const handleDelete = async (m) => {
    if (!window.confirm(`${t('common.delete')} "${m.name}"?`)) return
    try {
      await api.deleteMedicine(m.id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const totalValue = medicines.reduce((s, m) => s + (m.cost_price || 0) * m.sellable_quantity, 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('inv.title')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>{t('inv.add')}</button>
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>

      <div className="toolbar">
        <input type="search" className="toolbar-search" placeholder={t('inv.searchPlaceholder')} value={search} onChange={(e) => setSearch(e.target.value)} />
        <Tabs
          value={status}
          onChange={setStatus}
          tabs={[
            { value: '', label: t('inv.filter.all') },
            { value: 'low', label: t('inv.filter.low') },
            { value: 'expiring', label: t('inv.filter.expiring') },
            { value: 'expired', label: t('inv.filter.expired') },
            { value: 'inactive', label: t('inv.filter.inactive') },
          ]}
        />
      </div>

      <div className="card card-flush">
        {loading && medicines.length === 0 ? (
          <div className="loading">{t('common.loading')}</div>
        ) : medicines.length === 0 ? (
          <Empty>{t('common.noResults')}</Empty>
        ) : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.name')}</th>
                  <th>{t('common.category')}</th>
                  <th className="num">{t('inv.stock')}</th>
                  <th className="num">{t('inv.unitPrice')}</th>
                  <th className="num">{t('inv.packs')}</th>
                  <th>{t('inv.nearestExpiry')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m) => (
                  <tr key={m.id} className={m.is_active ? '' : 'row-muted'}>
                    <td className="name-cell">
                      <DrugThumb medicine={m} size={36} />
                      <div>
                      <div className="strong">
                        {m.name}
                        {m.requires_prescription && <span className="badge badge-danger badge-xs">Rx</span>}
                      </div>
                      <div className="text-muted small">
                        {[m.name_mm, m.generic_name, m.barcode, m.shelf_location && `${t('inv.shelf')} ${m.shelf_location}`].filter(Boolean).join(' · ')}
                      </div>
                      </div>
                    </td>
                    <td>{m.category}</td>
                    <td className="num">
                      <div>{describeQuantity(m.stock_quantity, m, t)}</div>
                      <div className="badges-right">
                        {m.is_low_stock && <span className="badge badge-low">{t('inv.low')}</span>}
                        {m.expired_quantity > 0 && <span className="badge badge-danger">{t('inv.expiredQty')} {m.expired_quantity}</span>}
                      </div>
                    </td>
                    <td className="num">
                      {money(m.selling_price)}
                      {m.cost_price != null && <div className="text-muted small">{t('inv.unitCost')}: {formatNumber(m.cost_price)}</div>}
                    </td>
                    <td className="num small">
                      {m.pack_options.slice(1).map((o) => (
                        <div key={o.unit}>{t(`unit.${o.unit}`)}({o.size}) {formatNumber(o.price)}</div>
                      ))}
                    </td>
                    <td>
                      <div>{formatDate(m.expiry_date)}</div>
                      <ExpiryBadge status={m.expiry_status} days={m.expiry_status === 'warning' ? m.days_to_expiry : null} />
                    </td>
                    <td className="actions">
                      <button type="button" className="btn btn-sm" onClick={() => setStockId(m.id)}>{t('inv.batches')}</button>
                      <button type="button" className="btn btn-sm" onClick={() => setEditing(m)}>{t('common.edit')}</button>
                      {can('admin') && (
                        <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => handleDelete(m)}>{t('common.delete')}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {medicines.length > 0 && (
        <p className="text-muted small">{medicines.length} · {t('inv.stockValue')}: {money(totalValue)}</p>
      )}

      {editing && (
        <MedicineForm
          medicine={editing === 'new' ? null : editing}
          categories={categories}
          onSaved={() => { setEditing(null); load() }}
          onClose={() => setEditing(null)}
        />
      )}
      {stockId && <StockModal medicineId={stockId} onClose={() => setStockId(null)} onChanged={load} />}
    </div>
  )
}
