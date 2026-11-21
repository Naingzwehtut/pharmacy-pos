import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import PatientForm from '../components/PatientForm'
import PatientInvestigations from '../components/PatientInvestigations'
import ReceiptModal from '../components/ReceiptModal'
import { Alert, Empty, PaymentBadge, Stat } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { formatDate, formatDateTime, formatNumber } from '../format'
import { useT } from '../i18n'
import { ReceivePayment, Statement } from './Credit'

function Field({ label, children }) {
  return (
    <div className="detail-field">
      <div className="text-muted">{label}</div>
      <div>{children || '—'}</div>
    </div>
  )
}

export default function PatientDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { can } = useAuth()
  const { t } = useT()
  const { money } = useSettings()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [receiptSale, setReceiptSale] = useState(null)
  const [paying, setPaying] = useState(false)
  const [statement, setStatement] = useState(false)

  const load = useCallback(async () => {
    try {
      setPatient(await api.getPatient(id))
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async () => {
    if (!window.confirm(`${t('common.delete')} "${patient.name}"?`)) return
    try {
      await api.deletePatient(patient.id)
      navigate('/patients')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading">{t('common.loading')}</div>
  if (!patient) return <Alert>{error || 'Patient not found'}</Alert>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Link to="/patients" className="text-muted">{t('nav.patients')}</Link> / {patient.name}
        </h1>
        <div className="header-actions">
          <button type="button" className="btn" onClick={() => setEditing(true)}>{t('common.edit')}</button>
          {can('admin') && patient.visits.length === 0 && (
            <button type="button" className="btn btn-danger-ghost" onClick={handleDelete}>{t('common.delete')}</button>
          )}
          <button type="button" className="btn btn-primary" onClick={() => navigate('/pos', { state: { patient } })}>
            {t('pat.newVisit')}
          </button>
        </div>
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>
      {patient.allergies && <div className="allergy-alert big">⚠ {t('pos.allergies')}: {patient.allergies}</div>}

      <div className="card">
        <div className="card-title">{patient.patient_number}</div>
        <div className="detail-grid">
          <Field label={t('pat.age')}>{patient.age != null ? `${patient.age}` : null}</Field>
          <Field label={t('pat.gender')}>{patient.gender && t(`pat.${patient.gender.toLowerCase()}`)}</Field>
          <Field label={t('pat.dob')}>{patient.date_of_birth && formatDate(patient.date_of_birth)}</Field>
          <Field label={t('common.phone')}>{patient.phone}</Field>
          <Field label={t('pat.nrc')}>{patient.nrc_number}</Field>
          <Field label={t('common.address')}>{patient.address}</Field>
          <Field label={t('pat.medicalNotes')}>{patient.medical_notes}</Field>
          <Field label={t('credit.limit')}>{patient.credit_limit != null ? money(patient.credit_limit) : null}</Field>
        </div>
      </div>

      <div className="stat-grid">
        <Stat label={t('pat.visits')} value={patient.visit_count} />
        <Stat label={t('pat.doctorFeesPaid')} value={money(patient.total_doctor_fees)} />
        <Stat label={t('pat.totalSpent')} value={money(patient.total_spent)} />
        <Stat label={t('credit.balance')} value={money(patient.balance)} tone={patient.balance > 0 ? 'warning' : undefined}
          sub={
            <span className="stat-actions">
              <button type="button" className="link-btn" onClick={() => setStatement(true)}>{t('credit.statement')}</button>
              {patient.balance > 0 && <button type="button" className="link-btn" onClick={() => setPaying(true)}>{t('credit.receive')}</button>}
            </span>
          } />
      </div>

      <PatientInvestigations patientId={patient.id} visits={patient.visits} />

      <div className="card card-flush">
        <div className="card-title pad">{t('pat.visitHistory')}</div>
        {patient.visits.length === 0 ? <Empty>{t('pat.noVisits')}</Empty> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('common.date')}</th><th>{t('pos.doctor')}</th><th>{t('pos.diagnosis')}</th><th>{t('pos.medicines')}</th>
                  <th>{t('sales.payment')}</th><th className="num">{t('common.total')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {patient.visits.map((v) => (
                  <Fragment key={v.id}>
                    <tr className={v.status === 'voided' ? 'row-voided' : ''}>
                      <td>{formatDateTime(v.created_at)}</td>
                      <td>{v.doctor_name || '—'}</td>
                      <td>{v.diagnosis || '—'}</td>
                      <td>{v.items.length ? v.items.map((i) => i.medicine_name).join(', ') : '—'}</td>
                      <td><PaymentBadge method={v.payment_method} />{v.status === 'voided' && <span className="badge badge-danger badge-xs">{t('sales.voided')}</span>}</td>
                      <td className="num">{money(v.total_amount)}</td>
                      <td className="actions">
                        <button type="button" className="btn btn-sm" onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}>
                          {expandedId === v.id ? t('common.hide') : t('common.details')}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setReceiptSale(v)}>{t('sales.receipt')}</button>
                      </td>
                    </tr>
                    {expandedId === v.id && (
                      <tr className="detail-row">
                        <td colSpan={7}>
                          <div className="detail-grid">
                            <Field label={t('pos.symptoms')}>{v.symptoms}</Field>
                            <Field label={t('pos.diagnosis')}>{v.diagnosis}</Field>
                            <Field label={t('common.notes')}>{v.visit_notes}</Field>
                          </div>
                          {v.items.length > 0 && (
                            <table className="data-table inner">
                              <thead><tr><th>{t('pos.item')}</th><th>{t('pat.dosage')}</th><th className="num">{t('common.quantity')}</th><th className="num">{t('common.amount')}</th></tr></thead>
                              <tbody>
                                {v.items.map((i) => (
                                  <tr key={i.id}>
                                    <td>{i.medicine_name}</td><td>{i.dosage || '—'}</td>
                                    <td className="num">{i.unit_qty} {i.unit_size > 1 ? t(`unit.${i.unit_label}`) : ''}</td>
                                    <td className="num">{formatNumber(i.line_total)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                          <div className="text-muted small">{v.sale_number} · {v.cashier_name}</div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editing && <PatientForm patient={patient} onSaved={() => { setEditing(false); load() }} onClose={() => setEditing(false)} />}
      {receiptSale && <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />}
      {paying && <ReceivePayment account={patient} onClose={() => setPaying(false)} onDone={() => { setPaying(false); load() }} />}
      {statement && <Statement patientId={patient.id} onClose={() => setStatement(false)} />}
    </div>
  )
}
