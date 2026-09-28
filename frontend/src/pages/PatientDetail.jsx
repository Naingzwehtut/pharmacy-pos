import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { useAuth } from '../context/AuthContext'
import PatientForm from '../components/PatientForm'
import ReceiptModal from '../components/ReceiptModal'

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
  const { user } = useAuth()
  const [patient, setPatient] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(false)
  const [expandedId, setExpandedId] = useState(null)
  const [receiptSale, setReceiptSale] = useState(null)

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
    if (!window.confirm(`Delete patient "${patient.name}"?`)) return
    try {
      await api.deletePatient(patient.id)
      navigate('/patients')
    } catch (err) {
      setError(err.message)
    }
  }

  if (loading) return <div className="loading">Loading patient...</div>
  if (!patient) return <div className="alert alert-error">{error || 'Patient not found'}</div>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">
          <Link to="/patients" className="text-muted">Patients</Link> / {patient.name}
        </h1>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn" onClick={() => setEditing(true)}>Edit</button>
          {user?.role === 'admin' && patient.visit_count === 0 && (
            <button type="button" className="btn btn-danger" onClick={handleDelete}>Delete</button>
          )}
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/pos', { state: { patient } })}
          >
            New Visit
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {patient.allergies && (
        <div className="allergy-alert" style={{ marginBottom: 16 }}>
          ⚠ Allergies: {patient.allergies}
        </div>
      )}

      <div className="card">
        <div className="card-title">
          {patient.patient_number}
        </div>
        <div className="detail-grid">
          <Field label="Age">{patient.age != null ? `${patient.age} years` : null}</Field>
          <Field label="Gender">{patient.gender}</Field>
          <Field label="Date of birth">{patient.date_of_birth}</Field>
          <Field label="Phone">{patient.phone}</Field>
          <Field label="Address">{patient.address}</Field>
          <Field label="Medical notes">{patient.medical_notes}</Field>
        </div>
      </div>

      <div className="summary-grid">
        <div className="summary-box">
          <div className="label">Visits</div>
          <div className="value">{patient.visit_count}</div>
        </div>
        <div className="summary-box">
          <div className="label">Doctor fees paid</div>
          <div className="value">{patient.total_doctor_fees.toFixed(2)}</div>
        </div>
        <div className="summary-box">
          <div className="label">Total spent</div>
          <div className="value">{patient.total_spent.toFixed(2)}</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Visit History</div>
        {patient.visits.length === 0 ? (
          <div className="empty-state">No visits yet</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Doctor</th>
                <th>Diagnosis</th>
                <th>Medicines</th>
                <th className="num">Doctor fee</th>
                <th className="num">Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patient.visits.map((v) => (
                <Fragment key={v.id}>
                  <tr>
                    <td>{new Date(v.created_at).toLocaleString()}</td>
                    <td>{v.doctor_name || '—'}</td>
                    <td>{v.diagnosis || '—'}</td>
                    <td>{v.items.length ? v.items.map((i) => i.medicine_name).join(', ') : '—'}</td>
                    <td className="num">{v.doctor_fee.toFixed(2)}</td>
                    <td className="num">{v.total_amount.toFixed(2)}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{ marginRight: 4 }}
                        onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                      >
                        {expandedId === v.id ? 'Hide' : 'Details'}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setReceiptSale(v)}>
                        Receipt
                      </button>
                    </td>
                  </tr>
                  {expandedId === v.id && (
                    <tr>
                      <td colSpan={7} style={{ background: '#fafafa' }}>
                        <div className="detail-grid" style={{ marginBottom: 12 }}>
                          <Field label="Symptoms">{v.symptoms}</Field>
                          <Field label="Diagnosis">{v.diagnosis}</Field>
                          <Field label="Notes">{v.visit_notes}</Field>
                        </div>
                        {v.items.length > 0 && (
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Medicine</th>
                                <th>Dosage / instructions</th>
                                <th className="num">Qty</th>
                                <th className="num">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {v.items.map((i) => (
                                <tr key={i.id}>
                                  <td>{i.medicine_name}</td>
                                  <td>{i.dosage || '—'}</td>
                                  <td className="num">{i.quantity}</td>
                                  <td className="num">{i.line_total.toFixed(2)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                        <div className="text-muted" style={{ marginTop: 8 }}>
                          Receipt {v.sale_number} · served by {v.cashier_name}
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editing && (
        <PatientForm
          patient={patient}
          onSaved={() => {
            setEditing(false)
            load()
          }}
          onClose={() => setEditing(false)}
        />
      )}
      {receiptSale && <ReceiptModal sale={receiptSale} onClose={() => setReceiptSale(null)} />}
    </div>
  )
}
