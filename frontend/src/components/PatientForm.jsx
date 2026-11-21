import { useState } from 'react'
import { api } from '../api'
import { todayISO } from '../format'
import { useT } from '../i18n'
import { Alert, Modal } from './ui'

const FIELDS = ['name', 'gender', 'date_of_birth', 'phone', 'nrc_number', 'address', 'allergies', 'medical_notes']

/**
 * Modal to create or edit a patient / customer.
 * Pass `patient` to edit, omit it to create. onSaved(patient) gets the saved record.
 */
export default function PatientForm({ patient, onSaved, onClose }) {
  const { t } = useT()
  const [form, setForm] = useState(() => {
    const f = Object.fromEntries(FIELDS.map((k) => [k, patient?.[k] || '']))
    f.credit_limit = patient?.credit_limit != null ? String(patient.credit_limit) : ''
    return f
  })
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.name.trim()) {
      setError(t('pat.nameRequired'))
      return
    }
    setSaving(true)
    try {
      const payload = { ...form, credit_limit: form.credit_limit === '' ? null : Number(form.credit_limit) }
      const saved = patient ? await api.updatePatient(patient.id, payload) : await api.createPatient(payload)
      onSaved(saved)
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  return (
    <Modal title={patient ? t('pat.edit') : t('pat.new')} onClose={onClose} wide>
      <Alert>{error}</Alert>
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label>{t('pat.fullName')} *</label>
          <input type="text" value={form.name} onChange={set('name')} autoFocus />
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('pat.gender')}</label>
            <select value={form.gender} onChange={set('gender')}>
              <option value="">—</option>
              <option value="Female">{t('pat.female')}</option>
              <option value="Male">{t('pat.male')}</option>
              <option value="Other">{t('pat.other')}</option>
            </select>
          </div>
          <div className="form-group">
            <label>{t('pat.dob')}</label>
            <input type="date" value={form.date_of_birth} max={todayISO()} onChange={set('date_of_birth')} />
          </div>
          <div className="form-group">
            <label>{t('common.phone')}</label>
            <input type="tel" value={form.phone} onChange={set('phone')} placeholder="09..." />
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>{t('pat.nrc')} ({t('common.optional')})</label>
            <input value={form.nrc_number} onChange={set('nrc_number')} placeholder="12/LaMaNa(N)123456" />
          </div>
          <div className="form-group">
            <label>{t('credit.limit')} ({t('common.optional')})</label>
            <input type="number" min="0" value={form.credit_limit} onChange={set('credit_limit')} placeholder="—" />
          </div>
        </div>
        <div className="form-group">
          <label>{t('common.address')}</label>
          <textarea rows={2} value={form.address} onChange={set('address')} />
        </div>
        <div className="form-group">
          <label>{t('pos.allergies')}</label>
          <input type="text" placeholder={t('pat.allergyHint')} value={form.allergies} onChange={set('allergies')} />
        </div>
        <div className="form-group">
          <label>{t('pat.medicalNotes')}</label>
          <textarea rows={3} placeholder={t('pat.medicalHint')} value={form.medical_notes} onChange={set('medical_notes')} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>{t('common.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </div>
      </form>
    </Modal>
  )
}
