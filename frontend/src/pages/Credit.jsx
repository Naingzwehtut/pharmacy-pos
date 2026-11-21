import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Alert, Empty, Modal, Stat } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { formatDate, formatDateTime } from '../format'
import { useT } from '../i18n'

export function ReceivePayment({ account, onClose, onDone }) {
  const { t } = useT()
  const { money, paymentMethods } = useSettings()
  const [amount, setAmount] = useState(account.balance > 0 ? String(account.balance) : '')
  const [method, setMethod] = useState('cash')
  const [reference, setReference] = useState('')
  const [note, setNote] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      await api.receiveCreditPayment(account.id, { amount: Number(amount), payment_method: method, reference, note })
      onDone()
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={`${t('credit.receive')} · ${account.name}`} onClose={onClose}>
      <form onSubmit={submit}>
        <Alert>{error}</Alert>
        <p>{t('credit.balance')}: <strong>{money(account.balance)}</strong></p>
        <div className="form-group">
          <label>{t('credit.amount')}</label>
          <input type="number" min="1" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </div>
        <div className="pay-methods">
          {paymentMethods.filter((m) => m !== 'credit').map((m) => (
            <button key={m} type="button" className={`pay-chip pay-${m} ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>
              {t(`pay.${m}`)}
            </button>
          ))}
        </div>
        {method !== 'cash' && (
          <div className="form-group"><label>{t('pos.reference')}</label><input value={reference} onChange={(e) => setReference(e.target.value)} /></div>
        )}
        <div className="form-group"><label>{t('common.notes')}</label><input value={note} onChange={(e) => setNote(e.target.value)} /></div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? t('common.saving') : t('credit.receive')}</button>
        </div>
      </form>
    </Modal>
  )
}

export function Statement({ patientId, onClose }) {
  const { t } = useT()
  const { money } = useSettings()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.getCreditStatement(patientId).then(setData).catch((e) => setError(e.message))
  }, [patientId])
  return (
    <Modal title={`${t('credit.statement')}${data ? ` · ${data.patient.name}` : ''}`} onClose={onClose} wide className="printable">
      <Alert>{error}</Alert>
      {!data ? <div className="loading">{t('common.loading')}</div> : (
        <>
          <div className="table-scroll" style={{ maxHeight: 420 }}>
            <table className="data-table">
              <thead><tr><th>{t('common.date')}</th><th>Ref</th><th>{t('common.details')}</th><th className="num">{t('credit.debit')}</th><th className="num">{t('credit.credit')}</th><th className="num">{t('credit.balance')}</th></tr></thead>
              <tbody>
                {data.entries.map((e, i) => (
                  <tr key={i}>
                    <td>{formatDateTime(e.date)}</td>
                    <td className="small">{e.reference || '—'}</td>
                    <td>{e.description}</td>
                    <td className="num">{e.debit ? money(e.debit) : ''}</td>
                    <td className="num text-ok">{e.credit ? money(e.credit) : ''}</td>
                    <td className="num strong">{money(e.balance)}</td>
                  </tr>
                ))}
                {data.entries.length === 0 && <tr><td colSpan={6}><Empty>{t('common.noResults')}</Empty></td></tr>}
              </tbody>
            </table>
          </div>
          <div className="totals-grand inline"><span>{t('credit.balance')}</span><span>{money(data.balance)}</span></div>
          <div className="modal-actions no-print">
            <button type="button" className="btn" onClick={() => window.print()}>{t('common.print')}</button>
            <button type="button" className="btn btn-primary" onClick={onClose}>{t('common.close')}</button>
          </div>
        </>
      )}
    </Modal>
  )
}

export default function Credit() {
  const { t } = useT()
  const { money } = useSettings()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [paying, setPaying] = useState(null)
  const [statementId, setStatementId] = useState(null)

  const load = useCallback(() => {
    api.getCreditAccounts().then(setData).catch((e) => setError(e.message))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  const accounts = (data?.accounts || []).filter((a) => {
    const q = search.trim().toLowerCase()
    return !q || a.name.toLowerCase().includes(q) || (a.phone || '').includes(q) || (a.patient_number || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="page-header"><h1 className="page-title">{t('credit.title')}</h1></div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      {data && (
        <div className="stat-grid">
          <Stat label={t('credit.outstanding')} value={money(data.total_outstanding)} tone="warning" />
          <Stat label={t('credit.customer')} value={data.accounts.filter((a) => a.balance > 0).length} />
        </div>
      )}
      <div className="toolbar">
        <input type="search" className="toolbar-search" placeholder={t('pos.findPatient')} value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="card card-flush">
        {!data ? <div className="loading">{t('common.loading')}</div> : accounts.length === 0 ? <Empty>{t('credit.none')}</Empty> : (
          <table className="data-table">
            <thead><tr><th>{t('credit.customer')}</th><th>{t('common.phone')}</th><th>{t('credit.lastSale')}</th><th className="num">{t('credit.limit')}</th><th className="num">{t('credit.balance')}</th><th></th></tr></thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id}>
                  <td><Link to={`/patients/${a.id}`} className="strong">{a.name}</Link><div className="text-muted small">{a.patient_number}</div></td>
                  <td>{a.phone || '—'}</td>
                  <td>{formatDate(a.last_credit_sale)}</td>
                  <td className="num">{a.credit_limit != null ? money(a.credit_limit) : '—'}</td>
                  <td className={`num strong ${a.balance > 0 ? 'text-danger' : 'text-ok'}`}>
                    {a.balance < 0 ? `${t('credit.advance')} ${money(-a.balance)}` : money(a.balance)}
                  </td>
                  <td className="actions">
                    <button type="button" className="btn btn-sm" onClick={() => setStatementId(a.id)}>{t('credit.statement')}</button>
                    {a.balance > 0 && <button type="button" className="btn btn-sm btn-primary" onClick={() => setPaying(a)}>{t('credit.receive')}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {paying && <ReceivePayment account={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load() }} />}
      {statementId && <Statement patientId={statementId} onClose={() => setStatementId(null)} />}
    </div>
  )
}
