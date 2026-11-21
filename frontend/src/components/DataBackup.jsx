import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../api'
import { formatDateTime } from '../format'
import { useT } from '../i18n'
import { Alert } from './ui'

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`

/** Settings card for the desktop app: backups, backup folder, restore. */
export default function DataBackup() {
  const { t } = useT()
  const [info, setInfo] = useState(null)
  const [folder, setFolder] = useState('')
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef(null)

  const load = useCallback(() => {
    api.systemInfo().then((d) => {
      setInfo(d)
      setFolder(d.backup_folder || '')
    }).catch((e) => setMsg({ type: 'error', text: e.message }))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const run = async (fn, success) => {
    setBusy(true)
    setMsg(null)
    try {
      await fn()
      if (success) setMsg({ type: 'success', text: success })
      load()
    } catch (e) {
      setMsg({ type: 'error', text: e.message })
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
    if (!window.confirm(t('data.restoreConfirm', { name: file.name }))) return
    run(() => api.restoreBackup(file), t('data.restoreStaged'))
  }

  if (!info) return null

  return (
    <div className="card">
      <div className="card-title">{t('data.title')}</div>
      <Alert type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Alert>
      <p className="text-muted">{t('data.auto')}</p>

      <div className="data-row">
        <div>
          <div className="text-muted small">{t('data.location')}</div>
          <code className="path">{info.data_dir}</code>
        </div>
        <button type="button" className="btn btn-sm" onClick={() => run(() => api.openFolder('data'))}>{t('data.open')}</button>
      </div>

      <div className="form-group">
        <label>{t('data.extraFolder')}</label>
        <div className="inline-form">
          <input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="E:\\ZweBackups  /  C:\\Users\\...\\Google Drive\\Zwe" />
          <button type="button" className="btn" disabled={busy} onClick={() => run(() => api.setBackupFolder(folder), t('common.saved'))}>{t('common.save')}</button>
        </div>
        <div className="hint text-muted">{t('data.extraHelp')}</div>
      </div>

      <div className="header-actions" style={{ marginBottom: 12 }}>
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => run(api.createBackup, t('data.done'))}>{t('data.now')}</button>
        <button type="button" className="btn" disabled={busy} onClick={() => fileRef.current?.click()}>{t('data.restore')}</button>
        <button type="button" className="btn btn-ghost" onClick={() => run(() => api.openFolder('backups'))}>{t('data.openBackups')}</button>
        <input ref={fileRef} type="file" accept=".zip" hidden onChange={restore} />
      </div>

      {info.backups.length === 0 ? (
        <p className="text-muted">{t('data.none')}</p>
      ) : (
        <div className="table-scroll" style={{ maxHeight: 260 }}>
          <table className="data-table">
            <tbody>
              {info.backups.map((b) => (
                <tr key={b.name}>
                  <td className="small">{b.name}</td>
                  <td className="small text-muted">{formatDateTime(b.created_at)}</td>
                  <td className="num small">{mb(b.size)}</td>
                  <td className="actions"><button type="button" className="btn btn-sm" onClick={() => download(b.name)}>{t('data.download')}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
