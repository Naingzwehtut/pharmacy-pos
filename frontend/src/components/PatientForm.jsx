import { useState } from 'react'
import { api } from '../api'

const EMPTY = {
  name: '',
  gender: '',
  date_of_birth: '',
  phone: '',
  address: '',
  allergies: '',
  medical_notes: '',
}

/**
 * Modal to create or edit a patient.
 * Pass `patient` to edit, omit it to create.
 * onSaved(patient) is called with the saved record.
 */
export default function PatientForm({ patient, onSaved, onClose }) {
  const [form, setForm] = useState(
    patient
      ? {
          name: patient.name || '',
          gender: patient.gender || '',
          date_of_birth: patient.date_of_birth || '',
          phone: patient.phone || '',
          address: patient.address || '',
          allergies: patient.allergies || '',
          medical_notes: patient.medical_notes || '',
        }
      : EMPTY
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError('Patient name is required')
      return
    }
    setSaving(true)
    try {
      const saved = patient
        ? await api.updatePatient(patient.id, form)
        : await api.createPatient(form)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{patient ? 'Edit Patient' : 'New Patient'}</h2>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Full name *</label>
            <input type="text" value={form.name} onChange={set('name')} autoFocus />
          </div>
          <div className="form-row">
            <div className="form-group">
              <label>Gender</label>
              <select value={form.gender} onChange={set('gender')}>
                <option value="">—</option>
                <option>Female</option>
                <option>Male</option>
                <option>Other</option>
              </select>
            </div>
            <div className="form-group">
              <label>Date of birth</label>
              <input
                type="date"
                value={form.date_of_birth}
                max={new Date().toISOString().slice(0, 10)}
                onChange={set('date_of_birth')}
              />
            </div>
            <div className="form-group">
              <label>Phone</label>
              <input type="tel" value={form.phone} onChange={set('phone')} />
            </div>
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea rows={2} value={form.address} onChange={set('address')} />
          </div>
          <div className="form-group">
            <label>Allergies</label>
            <input
              type="text"
              placeholder="e.g. Penicillin, Sulfa (leave blank if none known)"
              value={form.allergies}
              onChange={set('allergies')}
            />
          </div>
          <div className="form-group">
            <label>Medical notes</label>
            <textarea
              rows={3}
              placeholder="Chronic conditions, pregnancy, etc."
              value={form.medical_notes}
              onChange={set('medical_notes')}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn" onClick={onClose}>Cancel</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save Patient'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
