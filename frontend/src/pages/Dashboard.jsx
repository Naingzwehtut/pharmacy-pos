import { useEffect, useState } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend,
} from 'recharts'
import { api } from '../api'

export default function Dashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [deliveryFee, setDeliveryFee] = useState('')
  const [savingFee, setSavingFee] = useState(false)
  const [feeMessage, setFeeMessage] = useState('')
  const [pharmacyForm, setPharmacyForm] = useState({
    pharmacy_name: '',
    pharmacy_address: '',
    pharmacy_phone: '',
  })
  const [savingPharmacy, setSavingPharmacy] = useState(false)
  const [pharmacyMessage, setPharmacyMessage] = useState('')

  useEffect(() => {
    Promise.all([api.getDashboard(), api.getDeliveryFee(), api.getReceiptSettings()])
      .then(([dashboardData, feeData, receiptData]) => {
        setData(dashboardData)
        setDeliveryFee(String(feeData.delivery_fee))
        setPharmacyForm(receiptData)
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const saveDeliveryFee = async (e) => {
    e.preventDefault()
    setSavingFee(true)
    setFeeMessage('')
    try {
      const result = await api.updateDeliveryFee(parseFloat(deliveryFee))
      setDeliveryFee(String(result.delivery_fee))
      setFeeMessage('Default delivery fee saved.')
    } catch (err) {
      setFeeMessage(err.message)
    } finally {
      setSavingFee(false)
    }
  }

  const savePharmacySettings = async (e) => {
    e.preventDefault()
    setSavingPharmacy(true)
    setPharmacyMessage('')
    try {
      const result = await api.updateReceiptSettings(pharmacyForm)
      setPharmacyForm(result)
      setPharmacyMessage('Receipt details saved.')
    } catch (err) {
      setPharmacyMessage(err.message)
    } finally {
      setSavingPharmacy(false)
    }
  }

  if (loading) return <div className="loading">Loading dashboard...</div>
  if (error) return <div className="alert alert-error">{error}</div>
  if (!data) return null

  const { summary, best_selling, low_stock, expiring_soon, expired, sales_by_day } = data

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>

      <div className="summary-grid">
        <div className="summary-box">
          <div className="label">Total Sales</div>
          <div className="value">{summary.total_sales}</div>
        </div>
        <div className="summary-box">
          <div className="label">Total Revenue</div>
          <div className="value">${summary.total_revenue.toFixed(2)}</div>
        </div>
        <div className="summary-box">
          <div className="label">Total Profit</div>
          <div className="value">${summary.total_profit.toFixed(2)}</div>
        </div>
      </div>

      <div className="card mb-16">
        <div className="card-title">Receipt Details</div>
        <form onSubmit={savePharmacySettings}>
          <div className="form-group">
            <label>Pharmacy name</label>
            <input
              value={pharmacyForm.pharmacy_name}
              onChange={(e) => setPharmacyForm({ ...pharmacyForm, pharmacy_name: e.target.value })}
              required
            />
          </div>
          <div className="form-group">
            <label>Address</label>
            <textarea
              rows={2}
              value={pharmacyForm.pharmacy_address}
              onChange={(e) => setPharmacyForm({ ...pharmacyForm, pharmacy_address: e.target.value })}
              placeholder="Street, city"
            />
          </div>
          <div className="form-group">
            <label>Phone</label>
            <input
              value={pharmacyForm.pharmacy_phone}
              onChange={(e) => setPharmacyForm({ ...pharmacyForm, pharmacy_phone: e.target.value })}
              placeholder="+1 234 567 8900"
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingPharmacy}>
            {savingPharmacy ? 'Saving...' : 'Save Receipt Details'}
          </button>
        </form>
        {pharmacyMessage && (
          <div className={`alert ${pharmacyMessage.includes('saved') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {pharmacyMessage}
          </div>
        )}
      </div>

      <div className="card mb-16">
        <div className="card-title">Default Delivery Fee</div>
        <form onSubmit={saveDeliveryFee} className="filter-bar" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label>Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={deliveryFee}
              onChange={(e) => setDeliveryFee(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn-primary" disabled={savingFee}>
            {savingFee ? 'Saving...' : 'Save'}
          </button>
        </form>
        {feeMessage && (
          <div className={`alert ${feeMessage.includes('saved') ? 'alert-success' : 'alert-error'}`} style={{ marginTop: 12, marginBottom: 0 }}>
            {feeMessage}
          </div>
        )}
        <p className="text-muted mt-8" style={{ marginBottom: 0 }}>
          Cashiers can apply this fee at checkout for delivery orders. They can adjust the amount per sale if needed.
        </p>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Revenue & Profit (Last 14 Days)</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sales_by_day}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `$${v.toFixed(2)}`} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke="#2980b9" name="Revenue" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke="#27ae60" name="Profit" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">Best-Selling Medicines</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={best_selling.slice(0, 8)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="quantity_sold" fill="#2980b9" name="Units Sold" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Low Stock Alerts (≤ 10 units)</div>
          {low_stock.length === 0 ? (
            <div className="empty-state">No low stock items</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Stock</th>
                  <th>Expiry</th>
                </tr>
              </thead>
              <tbody>
                {low_stock.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="num"><span className="badge badge-low">{m.stock_quantity}</span></td>
                    <td>{m.expiry_date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="card-title">Expiring Soon (30 days)</div>
          {expiring_soon.length === 0 ? (
            <div className="empty-state">No medicines expiring soon</div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th className="num">Stock</th>
                  <th>Expiry</th>
                  <th className="num">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {expiring_soon.map((m) => (
                  <tr key={m.id}>
                    <td>{m.name}</td>
                    <td className="num">{m.stock_quantity}</td>
                    <td>{m.expiry_date}</td>
                    <td className="num"><span className="badge badge-warning">{m.days_to_expiry}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {expired.length > 0 && (
        <div className="card">
          <div className="card-title">Expired Medicines (Cannot Be Sold)</div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th className="num">Stock</th>
                <th>Expiry</th>
              </tr>
            </thead>
            <tbody>
              {expired.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td>
                  <td className="num">{m.stock_quantity}</td>
                  <td><span className="badge badge-expired">{m.expiry_date}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
