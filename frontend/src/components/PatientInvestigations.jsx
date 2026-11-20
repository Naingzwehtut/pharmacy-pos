import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'

const TEST_SUGGESTIONS = [
  'CBC (Complete blood count)',
  'Blood sugar (FBS / RBS)',
  'HbA1c',
  'Lipid profile',
  'Liver function test (LFT)',
  'Renal function test (RFT)',
  'Thyroid function test',
  'Urine routine examination',
  'X-ray',
  'Ultrasound',
  'ECG',
]

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const MAX_MB = 10

function todayLocal() {
  return new Date().toLocaleDateString('en-CA') // YYYY-MM-DD in the clinic's time zone
}

function formatSize(bytes) {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function visitLabel(v) {
  const date = new Date(v.created_at).toLocaleDateString()
  return `${date} · ${v.sale_number}${v.diagnosis ? ` · ${v.diagnosis}` : ''}`
}

// Loads a protected file as a temporary object URL (freed when no longer shown)
function useFileUrl(patientId, inv, enabled = true) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!enabled) return undefined
    let objectUrl = null
    let cancelled = false
    setUrl(null)
    setError('')
    api.getInvestigationFile(patientId, inv.id)
      .then((blob) => {
        if (cancelled) return
        objectUrl = URL.createObjectURL(blob)
        setUrl(objectUrl)
      })
      .catch((err) => !cancelled && setError(err.message))
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [patientId, inv.id, enabled])

  return { url, error }
}

function Thumbnail({ patientId, inv, onOpen }) {
  const { url, error } = useFileUrl(patientId, inv, !inv.is_pdf)
  return (
    <button type="button" className="inv-card" onClick={() => onOpen(inv, url)}>
      <div className="inv-thumb">
        {inv.is_pdf ? (
          <span className="inv-pdf">PDF</span>
        ) : url ? (
          <img src={url} alt={inv.title} />
        ) : (
          <span className="text-muted">{error ? 'Could not load' : 'Loading...'}</span>
        )}
      </div>
      <div className="inv-meta">
        <strong>{inv.title}</strong>
        <div className="text-muted">
          {inv.test_date || new Date(inv.created_at).toLocaleDateString()}
          {inv.sale_number && ` · visit ${inv.sale_number}`}
        </div>
      </div>
    </button>
  )
}

function InvestigationForm({ patientId, visits, investigation, onSaved, onClose }) {
  const editing = Boolean(investigation)
  const [file, setFile] = useState(null)
  const [preview, setPreview] = useState(null)
  const [form, setForm] = useState({
    title: investigation?.title || '',
    test_date: investigation ? investigation.test_date || '' : todayLocal(),
    sale_id: investigation?.sale_id ? String(investigation.sale_id) : '',
    notes: investigation?.notes || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!file || file.type === 'application/pdf') {
      setPreview(null)
      return undefined
    }
    const u = URL.createObjectURL(file)
    setPreview(u)
    return () => URL.revokeObjectURL(u)
  }, [file])

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleFile = (e) => {
    const f = e.target.files?.[0] || null
    setError('')
    if (f && f.size > MAX_MB * 1024 * 1024) {
      setError(`File is too large (max ${MAX_MB} MB)`)
      e.target.value = ''
      setFile(null)
      return
    }
    setFile(f)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!editing && !file) return setError('Choose an image or PDF')
    if (!form.title.trim()) return setError('Test name is required')
    setSaving(true)
    setError('')
    try {
      if (editing) {
        await api.updateInvestigation(patientId, investigation.id, form)
      } else {
        const data = new FormData()
        data.append('file', file)
        Object.entries(form).forEach(([k, v]) => data.append(k, v))
        await api.uploadInvestigation(patientId, data)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0 }}>{editing ? 'Edit investigation' : 'Add investigation'}</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          {!editing && (
            <div className="form-group">
              <label>Report image or PDF *</label>
              <input type="file" accept={ACCEPT} onChange={handleFile} />
              <div className="text-muted">JPG, PNG, WebP or PDF, up to {MAX_MB} MB. On a phone you can take a photo.</div>
              {preview && <img src={preview} alt="Preview" className="inv-preview" />}
            </div>
          )}
          <div className="form-group">
            <label>Test name *</label>
            <input
              list="inv-test-suggestions"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. CBC, Lipid profile"
              maxLength={200}
            />
            <datalist id="inv-test-suggestions">
              {TEST_SUGGESTIONS.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <div className="form-group">
            <label>Test date</label>
            <input type="date" value={form.test_date} onChange={set('test_date')} max={todayLocal()} />
          </div>
          {visits.length > 0 && (
            <div className="form-group">
              <label>Related visit (optional)</label>
              <select value={form.sale_id} onChange={set('sale_id')}>
                <option value="">— Not linked to a visit —</option>
                {visits.map((v) => (
                  <option key={v.id} value={v.id}>{visitLabel(v)}</option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Notes</label>
            <textarea rows={3} value={form.notes} onChange={set('notes')} placeholder="e.g. Hb low, repeat in 1 month" />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose} disabled={saving}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? (editing ? 'Saving...' : 'Uploading...') : editing ? 'Save' : 'Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function Viewer({ patientId, inv, initialUrl, canModify, onEdit, onDeleted, onClose }) {
  const fetched = useFileUrl(patientId, inv, !initialUrl)
  const url = initialUrl || fetched.url
  const [error, setError] = useState('')
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${inv.title}"? The file will be removed permanently.`)) return
    setDeleting(true)
    try {
      await api.deleteInvestigation(patientId, inv.id)
      onDeleted()
    } catch (err) {
      setError(err.message)
      setDeleting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal inv-viewer" onClick={(e) => e.stopPropagation()}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>{inv.title}</h2>
        <div className="text-muted" style={{ marginBottom: 12 }}>
          {inv.test_date ? `Test date ${inv.test_date}` : 'No test date'}
          {inv.sale_number && ` · visit ${inv.sale_number}`}
          {` · uploaded by ${inv.uploaded_by_name || 'unknown'}, ${new Date(inv.created_at).toLocaleString()}`}
          {` · ${formatSize(inv.file_size)}`}
        </div>
        {inv.notes && <p style={{ whiteSpace: 'pre-wrap' }}>{inv.notes}</p>}
        {(error || fetched.error) && <div className="alert alert-error">{error || fetched.error}</div>}

        <div className="inv-viewer-body">
          {!url ? (
            !fetched.error && <div className="loading">Loading file...</div>
          ) : inv.is_pdf ? (
            <iframe src={url} title={inv.title} />
          ) : (
            <a href={url} target="_blank" rel="noreferrer">
              <img src={url} alt={inv.title} />
            </a>
          )}
        </div>

        <div className="modal-actions">
          {canModify && (
            <>
              <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
              <button type="button" className="btn" onClick={onEdit}>Edit</button>
            </>
          )}
          {url && (
            <>
              <a className="btn" href={url} target="_blank" rel="noreferrer">Open full size</a>
              <a className="btn" href={url} download={inv.original_filename || `${inv.title}`}>Download</a>
            </>
          )}
          <button type="button" className="btn btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}

export default function PatientInvestigations({ patientId, visits }) {
  const { user } = useAuth()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null) // { inv, url }

  const load = useCallback(async () => {
    try {
      setItems(await api.getInvestigations(patientId))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [patientId])

  useEffect(() => {
    load()
  }, [load])

  const canModify = (inv) => user?.role === 'admin' || user?.id === inv.uploaded_by

  return (
    <div className="card">
      <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span>Investigations ({items.length})</span>
        <button type="button" className="btn btn-sm btn-primary" onClick={() => setAdding(true)}>
          + Add result
        </button>
      </div>
      {error && <div className="alert alert-error">{error}</div>}
      {loading ? (
        <div className="loading">Loading investigations...</div>
      ) : items.length === 0 ? (
        <div className="empty-state">No blood reports or test results yet</div>
      ) : (
        <div className="inv-grid">
          {items.map((inv) => (
            <Thumbnail
              key={inv.id}
              patientId={patientId}
              inv={inv}
              onOpen={(i, url) => setViewing({ inv: i, url })}
            />
          ))}
        </div>
      )}

      {adding && (
        <InvestigationForm
          patientId={patientId}
          visits={visits}
          onSaved={() => {
            setAdding(false)
            load()
          }}
          onClose={() => setAdding(false)}
        />
      )}
      {editing && (
        <InvestigationForm
          patientId={patientId}
          visits={visits}
          investigation={editing}
          onSaved={() => {
            setEditing(null)
            load()
          }}
          onClose={() => setEditing(null)}
        />
      )}
      {viewing && (
        <Viewer
          patientId={patientId}
          inv={viewing.inv}
          initialUrl={viewing.url}
          canModify={canModify(viewing.inv)}
          onEdit={() => {
            setEditing(viewing.inv)
            setViewing(null)
          }}
          onDeleted={() => {
            setViewing(null)
            load()
          }}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}
