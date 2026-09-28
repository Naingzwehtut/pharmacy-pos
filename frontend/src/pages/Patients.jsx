import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import PatientForm from '../components/PatientForm'

export default function Patients() {
  const navigate = useNavigate()
  const [patients, setPatients] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    const timer = setTimeout(async () => {
      setLoading(true)
      try {
        setPatients(await api.getPatients({ search, limit: 200 }))
        setError('')
      } catch (err) {
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Patients</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>
          New Patient
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search by name, phone or patient ID..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading patients...</div>
        ) : patients.length === 0 ? (
          <div className="empty-state">No patients found</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Age</th>
                <th>Gender</th>
                <th>Phone</th>
                <th>Allergies</th>
                <th className="num">Visits</th>
                <th>Last visit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id}>
                  <td>{p.patient_number}</td>
                  <td>{p.name}</td>
                  <td>{p.age ?? '—'}</td>
                  <td>{p.gender || '—'}</td>
                  <td>{p.phone || '—'}</td>
                  <td>
                    {p.allergies ? <span className="badge badge-expired">{p.allergies}</span> : '—'}
                  </td>
                  <td className="num">{p.visit_count}</td>
                  <td>{p.last_visit ? new Date(p.last_visit).toLocaleDateString() : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      style={{ marginRight: 4 }}
                      onClick={() => navigate(`/patients/${p.id}`)}
                    >
                      History
                    </button>
                    <button
                      type="button"
                      className="btn btn-sm btn-primary"
                      onClick={() => navigate('/pos', { state: { patient: p } })}
                    >
                      New Visit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <PatientForm
          onSaved={(p) => navigate(`/patients/${p.id}`)}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}
