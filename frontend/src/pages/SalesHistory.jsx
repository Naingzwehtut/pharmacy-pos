import { Fragment, useEffect, useState } from 'react'
import { api } from '../api'
import ReceiptModal from '../components/ReceiptModal'

export default function SalesHistory() {
  const [sales, setSales] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState({
    start_date: '',
    end_date: '',
    sale_number: '',
  })
  const [selectedSale, setSelectedSale] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  const load = async (override = {}) => {
    setLoading(true)
    setError('')
    try {
      const f = { ...filters, ...override }
      const params = {}
      if (f.start_date) params.start_date = f.start_date + 'T00:00:00'
      if (f.end_date) params.end_date = f.end_date + 'T23:59:59'
      if (f.sale_number) params.sale_number = f.sale_number
      const data = await api.getSales(params)
      setSales(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const handleFilter = (e) => {
    e.preventDefault()
    load()
  }

  const clearFilters = () => {
    const empty = { start_date: '', end_date: '', sale_number: '' }
    setFilters(empty)
    load(empty)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Sales History</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <form className="filter-bar card" onSubmit={handleFilter}>
        <div className="form-group">
          <label>From</label>
          <input
            type="date"
            value={filters.start_date}
            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>To</label>
          <input
            type="date"
            value={filters.end_date}
            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
          />
        </div>
        <div className="form-group">
          <label>Sale #</label>
          <input
            type="text"
            placeholder="S2024..."
            value={filters.sale_number}
            onChange={(e) => setFilters({ ...filters, sale_number: e.target.value })}
          />
        </div>
        <button type="submit" className="btn btn-primary">Filter</button>
        <button type="button" className="btn" onClick={clearFilters}>Clear</button>
      </form>

      <div className="card">
        {loading ? (
          <div className="loading">Loading sales...</div>
        ) : sales.length === 0 ? (
          <div className="empty-state">No sales found</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Sale #</th>
                <th>Date</th>
                <th>Customer</th>
                <th>Cashier</th>
                <th className="num">Items</th>
                <th className="num">Subtotal</th>
                <th className="num">Delivery</th>
                <th className="num">Total</th>
                <th className="num">Cost</th>
                <th className="num">Profit</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((s) => (
                <Fragment key={s.id}>
                  <tr>
                    <td>{s.sale_number}</td>
                    <td>{new Date(s.created_at).toLocaleString()}</td>
                    <td>{s.customer_name || 'Walk-in'}</td>
                    <td>{s.cashier_name}</td>
                    <td className="num">{s.items.length}</td>
                    <td className="num">${(s.subtotal ?? s.total_amount).toFixed(2)}</td>
                    <td className="num">
                      {(s.delivery_fee ?? 0) > 0 ? `$${s.delivery_fee.toFixed(2)}` : '—'}
                    </td>
                    <td className="num">${s.total_amount.toFixed(2)}</td>
                    <td className="num">${s.total_cost.toFixed(2)}</td>
                    <td className="num">${s.total_profit.toFixed(2)}</td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}
                        style={{ marginRight: 4 }}
                      >
                        {expandedId === s.id ? 'Hide' : 'Details'}
                      </button>
                      <button type="button" className="btn btn-sm" onClick={() => setSelectedSale(s)}>
                        Receipt
                      </button>
                    </td>
                  </tr>
                  {expandedId === s.id && (
                    <tr>
                      <td colSpan={11} style={{ background: '#fafafa' }}>
                        <div style={{ marginBottom: 8, fontSize: 13 }}>
                          {s.customer_name && <>Customer: {s.customer_name} · </>}
                          {s.customer_address && <>Address: {s.customer_address} · </>}
                          Subtotal: ${(s.subtotal ?? s.total_amount).toFixed(2)}
                          {(s.delivery_fee ?? 0) > 0 && ` · Delivery: $${s.delivery_fee.toFixed(2)}`}
                          {' · '}Total: ${s.total_amount.toFixed(2)}
                        </div>
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Medicine</th>
                              <th className="num">Qty</th>
                              <th className="num">Cost (at sale)</th>
                              <th className="num">Price (at sale)</th>
                              <th className="num">Total</th>
                              <th className="num">Profit</th>
                            </tr>
                          </thead>
                          <tbody>
                            {s.items.map((item) => (
                              <tr key={item.id}>
                                <td>{item.medicine_name}</td>
                                <td className="num">{item.quantity}</td>
                                <td className="num">${item.cost_price.toFixed(2)}</td>
                                <td className="num">${item.selling_price.toFixed(2)}</td>
                                <td className="num">${item.line_total.toFixed(2)}</td>
                                <td className="num">${item.line_profit.toFixed(2)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedSale && (
        <ReceiptModal sale={selectedSale} onClose={() => setSelectedSale(null)} />
      )}
    </div>
  )
}
