import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import ReceiptModal from '../components/ReceiptModal'

export default function POS() {
  const [search, setSearch] = useState('')
  const [medicines, setMedicines] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [includeDelivery, setIncludeDelivery] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState('0')

  useEffect(() => {
    api.getDeliveryFee()
      .then((data) => setDeliveryFee(String(data.delivery_fee)))
      .catch(() => {})
  }, [])

  const loadMedicines = useCallback(async () => {
    setLoading(true)
    try {
      const data = await api.getMedicines({ search, pos: 'true' })
      setMedicines(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(loadMedicines, 300)
    return () => clearTimeout(timer)
  }, [loadMedicines])

  const addToCart = (medicine) => {
    setError('')
    setCart((prev) => {
      const existing = prev.find((c) => c.medicine_id === medicine.id)
      if (existing) {
        if (existing.quantity >= medicine.stock_quantity) {
          setError(`Only ${medicine.stock_quantity} in stock for ${medicine.name}`)
          return prev
        }
        return prev.map((c) =>
          c.medicine_id === medicine.id ? { ...c, quantity: c.quantity + 1 } : c
        )
      }
      return [...prev, {
        medicine_id: medicine.id,
        name: medicine.name,
        selling_price: medicine.selling_price,
        stock_quantity: medicine.stock_quantity,
        quantity: 1,
      }]
    })
  }

  const updateQty = (medicineId, delta) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.medicine_id !== medicineId) return c
          const newQty = c.quantity + delta
          if (newQty <= 0) return null
          if (newQty > c.stock_quantity) {
            setError(`Only ${c.stock_quantity} in stock`)
            return c
          }
          return { ...c, quantity: newQty }
        })
        .filter(Boolean)
    )
  }

  const removeFromCart = (medicineId) => {
    setCart((prev) => prev.filter((c) => c.medicine_id !== medicineId))
  }

  const cartSubtotal = cart.reduce((sum, c) => sum + c.selling_price * c.quantity, 0)
  const appliedDeliveryFee = includeDelivery ? (parseFloat(deliveryFee) || 0) : 0
  const cartTotal = cartSubtotal + appliedDeliveryFee

  const handleCheckout = async () => {
    if (cart.length === 0) return
    setCheckoutLoading(true)
    setError('')
    try {
      const sale = await api.checkout({
        items: cart.map((c) => ({ medicine_id: c.medicine_id, quantity: c.quantity })),
        delivery_fee: appliedDeliveryFee,
      })
      setCart([])
      setIncludeDelivery(false)
      setCompletedSale(sale)
      loadMedicines()
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Point of Sale</h1>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="pos-layout">
        <div>
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search medicine by name or category..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          </div>

          <div className="card">
            {loading ? (
              <div className="loading">Searching...</div>
            ) : medicines.length === 0 ? (
              <div className="empty-state">No medicines found</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Category</th>
                    <th className="num">Stock</th>
                    <th className="num">Price</th>
                    <th>Expiry</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {medicines.map((m) => (
                    <tr key={m.id}>
                      <td>{m.name}</td>
                      <td>{m.category}</td>
                      <td className="num">{m.stock_quantity}</td>
                      <td className="num">${m.selling_price.toFixed(2)}</td>
                      <td>
                        {m.expiry_status === 'warning' && (
                          <span className="badge badge-warning">Expiring soon</span>
                        )}
                        {m.expiry_status === 'ok' && (
                          <span className="text-muted">{m.expiry_date}</span>
                        )}
                      </td>
                      <td>
                        <button type="button" className="btn btn-sm btn-primary" onClick={() => addToCart(m)}>
                          Add
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-title">Current Sale</div>
          {cart.length === 0 ? (
            <div className="empty-state">Cart is empty</div>
          ) : (
            <>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th className="num">Qty</th>
                    <th className="num">Price</th>
                    <th className="num">Subtotal</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((c) => (
                    <tr key={c.medicine_id}>
                      <td>{c.name}</td>
                      <td className="num">
                        <div className="qty-control">
                          <button type="button" onClick={() => updateQty(c.medicine_id, -1)}>−</button>
                          <span>{c.quantity}</span>
                          <button type="button" onClick={() => updateQty(c.medicine_id, 1)}>+</button>
                        </div>
                      </td>
                      <td className="num">${c.selling_price.toFixed(2)}</td>
                      <td className="num">${(c.selling_price * c.quantity).toFixed(2)}</td>
                      <td>
                        <button type="button" className="btn btn-sm btn-danger" onClick={() => removeFromCart(c.medicine_id)}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <input
                    type="checkbox"
                    checked={includeDelivery}
                    onChange={(e) => setIncludeDelivery(e.target.checked)}
                  />
                  Include delivery fee
                </label>
                {includeDelivery && (
                  <div className="form-group" style={{ marginBottom: 8 }}>
                    <label>Delivery fee</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={deliveryFee}
                      onChange={(e) => setDeliveryFee(e.target.value)}
                    />
                  </div>
                )}
              </div>
              <div className="receipt-line text-muted">
                <span>Subtotal</span>
                <span>${cartSubtotal.toFixed(2)}</span>
              </div>
              {includeDelivery && (
                <div className="receipt-line text-muted">
                  <span>Delivery fee</span>
                  <span>${appliedDeliveryFee.toFixed(2)}</span>
                </div>
              )}
              <div className="cart-total">Total: ${cartTotal.toFixed(2)}</div>
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%', marginTop: '8px' }}
                onClick={handleCheckout}
                disabled={checkoutLoading}
              >
                {checkoutLoading ? 'Processing...' : 'Complete Checkout'}
              </button>
            </>
          )}
        </div>
      </div>

      {completedSale && (
        <ReceiptModal sale={completedSale} onClose={() => setCompletedSale(null)} />
      )}
    </div>
  )
}
