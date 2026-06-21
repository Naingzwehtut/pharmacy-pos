import { useEffect, useState } from 'react'
import { api } from '../api'

const EMPTY_FORM = {
  name: '',
  category: '',
  stock_quantity: '',
  cost_price: '',
  selling_price: '',
  expiry_date: '',
}

function ExpiryBadge({ status }) {
  if (status === 'expired') return <span className="badge badge-expired">Expired</span>
  if (status === 'warning') return <span className="badge badge-warning">Expiring soon</span>
  return <span className="badge badge-ok">OK</span>
}

export default function Inventory() {
  const [medicines, setMedicines] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const load = async () => {
    setLoading(true)
    try {
      const data = await api.getMedicines({ search, include_expired: 'true' })
      setMedicines(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const timer = setTimeout(load, 300)
    return () => clearTimeout(timer)
  }, [search])

  const openAdd = () => {
    setEditId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const openEdit = (m) => {
    setEditId(m.id)
    setForm({
      name: m.name,
      category: m.category,
      stock_quantity: String(m.stock_quantity),
      cost_price: String(m.cost_price),
      selling_price: String(m.selling_price),
      expiry_date: m.expiry_date,
    })
    setShowForm(true)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    const payload = {
      ...form,
      stock_quantity: parseInt(form.stock_quantity, 10),
      cost_price: parseFloat(form.cost_price),
      selling_price: parseFloat(form.selling_price),
    }
    try {
      if (editId) {
        await api.updateMedicine(editId, payload)
      } else {
        await api.createMedicine(payload)
      }
      setShowForm(false)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete "${name}"?`)) return
    try {
      await api.deleteMedicine(id)
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inventory</h1>
        <button type="button" className="btn btn-primary" onClick={openAdd}>Add Medicine</button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="search-bar">
        <input
          type="text"
          placeholder="Search medicines..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="card">
        {loading ? (
          <div className="loading">Loading inventory...</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th className="num">Stock</th>
                <th className="num">Cost</th>
                <th className="num">Sell Price</th>
                <th className="num">Profit/Unit</th>
                <th>Expiry</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {medicines.map((m) => (
                <tr key={m.id} style={m.is_expired ? { background: '#fdf2f2' } : undefined}>
                  <td>{m.name}</td>
                  <td>{m.category}</td>
                  <td className="num">
                    {m.stock_quantity}
                    {m.stock_quantity <= 10 && m.stock_quantity > 0 && (
                      <span className="badge badge-low" style={{ marginLeft: 4 }}>Low</span>
                    )}
                  </td>
                  <td className="num">${m.cost_price.toFixed(2)}</td>
                  <td className="num">${m.selling_price.toFixed(2)}</td>
                  <td className="num">${m.profit_per_unit.toFixed(2)}</td>
                  <td>{m.expiry_date}</td>
                  <td><ExpiryBadge status={m.expiry_status} /></td>
                  <td>
                    <button type="button" className="btn btn-sm" onClick={() => openEdit(m)} style={{ marginRight: 4 }}>
                      Edit
                    </button>
                    <button type="button" className="btn btn-sm btn-danger" onClick={() => handleDelete(m.id, m.name)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={() => setShowForm(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>{editId ? 'Edit Medicine' : 'Add Medicine'}</h2>
            <form onSubmit={handleSubmit}>
              <div className="form-group">
                <label>Name</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Category</label>
                  <input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Stock Quantity</label>
                  <input type="number" min="0" value={form.stock_quantity} onChange={(e) => setForm({ ...form, stock_quantity: e.target.value })} required />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cost Price</label>
                  <input type="number" step="0.01" min="0" value={form.cost_price} onChange={(e) => setForm({ ...form, cost_price: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Selling Price</label>
                  <input type="number" step="0.01" min="0" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: e.target.value })} required />
                </div>
              </div>
              <div className="form-group">
                <label>Expiry Date</label>
                <input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} required />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary">{editId ? 'Save Changes' : 'Add Medicine'}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
