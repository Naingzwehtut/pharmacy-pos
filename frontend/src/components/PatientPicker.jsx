import { useEffect, useState } from 'react'
import { api } from '../api'
import PatientForm from './PatientForm'

/**
 * Search-and-select a patient (or register a new one on the spot).
 * value: selected patient object or null. onChange(patient|null).
 */
export default function PatientPicker({ value, onChange }) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [showNew, setShowNew] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const timer = setTimeout(() => {
      api.getPatients({ search, limit: 8 }).then(setResults).catch(() => setResults([]))
    }, 250)
    return () => clearTimeout(timer)
  }, [search, open])

  const choose = (patient) => {
    onChange(patient)
    setSearch('')
    setOpen(false)
    setShowNew(false)
  }

  if (value) {
    return (
      <div className="patient-chip">
        <div className="patient-chip-main">
          <div>
            <strong>{value.name}</strong>{' '}
            <span className="text-muted">
              {value.patient_number}
              {value.age != null && ` · ${value.age}y`}
              {value.gender && ` · ${value.gender}`}
            </span>
          </div>
          <button type="button" className="btn btn-sm" onClick={() => onChange(null)}>
            Change
          </button>
        </div>
        {value.allergies && (
          <div className="allergy-alert">⚠ Allergies: {value.allergies}</div>
        )}
        {value.medical_notes && (
          <div className="text-muted" style={{ marginTop: 4 }}>{value.medical_notes}</div>
        )}
      </div>
    )
  }

  return (
    <div className="patient-picker">
      <input
        type="text"
        placeholder="Search patient by name, phone or ID..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
      />
      {open && (
        <div className="patient-results">
          {results.map((p) => (
            <button type="button" key={p.id} className="patient-result" onClick={() => choose(p)}>
              <span>{p.name}</span>
              <span className="text-muted">
                {p.patient_number}{p.phone ? ` · ${p.phone}` : ''}
              </span>
            </button>
          ))}
          {results.length === 0 && <div className="text-muted" style={{ padding: 8 }}>No patients found</div>}
          <button
            type="button"
            className="patient-result patient-result-new"
            onClick={() => setShowNew(true)}
          >
            + Register new patient
          </button>
        </div>
      )}
      {showNew && <PatientForm onSaved={choose} onClose={() => setShowNew(false)} />}
    </div>
  )
}
