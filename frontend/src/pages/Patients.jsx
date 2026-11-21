import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import PatientForm from '../components/PatientForm'
import { Alert, Empty } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { formatDate } from '../format'
import { useT } from '../i18n'

export default function Patients() {
  const navigate = useNavigate()
  const { t } = useT()
  const { money } = useSettings()
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
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('nav.patients')}</h1>
        <button type="button" className="btn btn-primary" onClick={() => setShowForm(true)}>{t('pat.new')}</button>
      </div>
      <Alert onClose={() => setError('')}>{error}</Alert>
      <div className="toolbar">
        <input type="search" className="toolbar-search" placeholder={t('pos.findPatient')} value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
      </div>
      <div className="card card-flush">
        {loading && patients.length === 0 ? <div className="loading">{t('common.loading')}</div> : patients.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>ID</th><th>{t('common.name')}</th><th>{t('pat.age')}</th><th>{t('common.phone')}</th>
                  <th>{t('pos.allergies')}</th><th className="num">{t('pat.visits')}</th><th>{t('pat.lastVisit')}</th>
                  <th className="num">{t('credit.balance')}</th><th></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="clickable" onClick={() => navigate(`/patients/${p.id}`)}>
                    <td className="small">{p.patient_number}</td>
                    <td className="strong">{p.name}</td>
                    <td>{p.age ?? '—'}{p.gender ? ` · ${t(`pat.${p.gender.toLowerCase()}`)}` : ''}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.allergies ? <span className="badge badge-danger">{p.allergies}</span> : '—'}</td>
                    <td className="num">{p.visit_count}</td>
                    <td>{formatDate(p.last_visit)}</td>
                    <td className={`num ${p.balance > 0 ? 'text-danger strong' : ''}`}>{p.balance > 0 ? money(p.balance) : '—'}</td>
                    <td className="actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="btn btn-sm btn-primary" onClick={() => navigate('/pos', { state: { patient: p } })}>
                        {t('pat.newVisit')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {showForm && <PatientForm onSaved={(p) => navigate(`/patients/${p.id}`)} onClose={() => setShowForm(false)} />}
    </div>
  )
}
