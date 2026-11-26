import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Desktop app only: where data and images are kept, backups and restore. */
export default function DataBackup() {
  const [info, setInfo] = useState(null)
  const [folder, setFolder] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(() => {
    api.systemInfo()
      .then((d) => {
        setInfo(d)
        setFolder(d.backup_folder || '')
      })
      .catch(() => setInfo(null)) // website: not available
  }, [])

  useEffect(() => {
    api.systemStatus().then((s) => s.desktop && load()).catch(() => {})
  }, [load])

  const run = async (fn, success) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (success) setMsg({ ok: true, text: success })
      load()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const download = (name) => run(async () => {
    const blob = await api.downloadBackup(name)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  })

  const restore = (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (!window.confirm(`Replace ALL data on this computer with the backup "${file.name}"? A safety copy of the current data is saved first.`)) return
    run(() => api.restoreBackup(file), 'Backup checked. Close the app and open it again to finish restoring.')
  }

  if (!info) return null

  return (
    <div className="card mb-16">
      <div className="card-title">Data &amp; Backups (this computer)</div>
      {msg && <div className={`alert ${msg.ok ? 'alert-success' : 'alert-error'}`}>{msg.text}</div>}
      <p className="text-muted" style={{ marginTop: 0 }}>
        All data and investigation images are stored on this computer. A backup is made automatically once a day
        while the app is open; the last 30 are kept.
      </p>
      <div className="form-group">
        <label>Data folder</label>
        <div className="path-row">
          <code>{info.data_dir}</code>
          <button type="button" className="btn btn-sm" onClick={() => run(() => api.openFolder('data'))}>Open</button>
          <button type="button" className="btn btn-sm" onClick={() => run(() => api.openFolder('uploads'))}>Open images folder</button>
        </div>
      </div>
      <div className="form-group">
        <label>Also copy backups to (USB drive or Google Drive folder)</label>
        <div className="path-row">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="E:\ZweBackups" />
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.setBackupFolder(folder), 'Saved')}>Save</button>
        </div>
      </div>
      <div className="path-row" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(api.createBackup, 'Backup saved')}>Back up now</button>
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>Restore from file...</button>
        <button type="button" className="btn" onClick={() => run(() => api.openFolder('backups'))}>Open backups folder</button>
        <input ref={fileRef} type="file" accept=".zip" hidden onChange={restore} />
      </div>
      {info.backups.length === 0 ? (
        <p className="text-muted">No backups yet.</p>
      ) : (
        <table className="data-table">
          <tbody>
            {info.backups.slice(0, 10).map((b) => (
              <tr key={b.name}>
                <td>{b.name}</td>
                <td>{new Date(b.created_at).toLocaleString()}</td>
                <td className="num">{mb(b.size)}</td>
                <td><button type="button" className="btn btn-sm" onClick={() => download(b.name)}>Download</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
