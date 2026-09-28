import { Fragment, useCallback, useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import PatientPicker from '../components/PatientPicker'
import ReceiptModal from '../components/ReceiptModal'

const DOCTOR_KEY = 'last_doctor_name'

export default function POS() {
  const location = useLocation()
  const [search, setSearch] = useState('')
  const [medicines, setMedicines] = useState([])
  const [cart, setCart] = useState([])
  const [loading, setLoading] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [error, setError] = useState('')
  const [completedSale, setCompletedSale] = useState(null)
  const [includeDelivery, setIncludeDelivery] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState('0')
  const [customerName, setCustomerName] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  // Clinic / visit state
  const [patient, setPatient] = useState(location.state?.patient || null)
  const [includeDoctorFee, setIncludeDoctorFee] = useState(Boolean(location.state?.patient))
  const [doctorFee, setDoctorFee] = useState('0')
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem(DOCTOR_KEY) || '')
  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [visitNotes, setVisitNotes] = useState('')

  useEffect(() => {
    api.getDoctorFee()
      .then((data) => setDoctorFee(String(data.doctor_fee)))
      .catch(() => {})
  }, [])

  const selectPatient = (p) => {
    setPatient(p)
    setIncludeDoctorFee(Boolean(p))
  }

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
        dosage: '',
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

  const updateDosage = (medicineId, dosage) => {
    setCart((prev) => prev.map((c) => (c.medicine_id === medicineId ? { ...c, dosage } : c)))
  }

  const removeFromCart = (medicineId) => {
    setCart((prev) => prev.filter((c) => c.medicine_id !== medicineId))
  }

  const cartSubtotal = cart.reduce((sum, c) => sum + c.selling_price * c.quantity, 0)
  const appliedDeliveryFee = includeDelivery ? (parseFloat(deliveryFee) || 0) : 0
  const appliedDoctorFee = includeDoctorFee ? (parseFloat(doctorFee) || 0) : 0
  const cartTotal = cartSubtotal + appliedDeliveryFee + appliedDoctorFee
  const canCheckout = cart.length > 0 || appliedDoctorFee > 0

  const handleCheckout = async () => {
    if (!canCheckout) return

    const name = customerName.trim() || patient?.name || ''
    const address = customerAddress.trim() || patient?.address || ''

    if (includeDelivery && !name) {
      setError('Customer name is required for delivery orders')
      return
    }
    if (includeDelivery && !address) {
      setError('Customer address is required for delivery orders')
      return
    }
    if (includeDoctorFee && appliedDoctorFee <= 0) {
      setError('Enter a doctor fee, or untick "Include doctor fee"')
      return
    }

    setCheckoutLoading(true)
    setError('')
    try {
      if (doctorName.trim()) localStorage.setItem(DOCTOR_KEY, doctorName.trim())
      const sale = await api.checkout({
        items: cart.map((c) => ({
          medicine_id: c.medicine_id,
          quantity: c.quantity,
          dosage: c.dosage.trim(),
        })),
        delivery_fee: appliedDeliveryFee,
        doctor_fee: appliedDoctorFee,
        customer_name: customerName.trim(),
        customer_address: customerAddress.trim(),
        patient_id: patient?.id || null,
        doctor_name: patient ? doctorName.trim() : '',
        symptoms: patient ? symptoms.trim() : '',
        diagnosis: patient ? diagnosis.trim() : '',
        visit_notes: patient ? visitNotes.trim() : '',
      })
      setCart([])
      setIncludeDelivery(false)
      setCustomerName('')
      setCustomerAddress('')
      setPatient(null)
      setIncludeDoctorFee(false)
      setSymptoms('')
      setDiagnosis('')
      setVisitNotes('')
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
                      <td className="num">{m.selling_price.toFixed(2)}</td>
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

        <div>
          <div className="card">
            <div className="card-title">Patient</div>
            <PatientPicker value={patient} onChange={selectPatient} />
            {!patient && (
              <p className="text-muted" style={{ marginBottom: 0, marginTop: 8 }}>
                Leave empty for a walk-in pharmacy sale.
              </p>
            )}
            {patient && (
              <div style={{ marginTop: 12 }}>
                <div className="form-group">
                  <label>Doctor</label>
                  <input
                    type="text"
                    value={doctorName}
                    onChange={(e) => setDoctorName(e.target.value)}
                    placeholder="Doctor name"
                  />
                </div>
                <div className="form-group">
                  <label>Symptoms / complaint</label>
                  <textarea rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Diagnosis</label>
                  <textarea rows={2} value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                </div>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <label>Notes (optional)</label>
                  <textarea rows={2} value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">Current Sale</div>
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: 16 }}>No medicines added</div>
            ) : (
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
                    <Fragment key={c.medicine_id}>
                      <tr className="cart-row">
                        <td>{c.name}</td>
                        <td className="num">
                          <div className="qty-control">
                            <button type="button" onClick={() => updateQty(c.medicine_id, -1)}>−</button>
                            <span>{c.quantity}</span>
                            <button type="button" onClick={() => updateQty(c.medicine_id, 1)}>+</button>
                          </div>
                        </td>
                        <td className="num">{c.selling_price.toFixed(2)}</td>
                        <td className="num">{(c.selling_price * c.quantity).toFixed(2)}</td>
                        <td>
                          <button type="button" className="btn btn-sm btn-danger" onClick={() => removeFromCart(c.medicine_id)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                      {patient && (
                        <tr>
                          <td colSpan={5} className="dosage-cell">
                            <input
                              type="text"
                              className="dosage-input"
                              placeholder="Dosage, e.g. 1 tablet 3 times a day for 5 days"
                              value={c.dosage}
                              maxLength={300}
                              onChange={(e) => updateDosage(c.medicine_id, e.target.value)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            {(!patient || (includeDelivery && !patient.address)) && (
              <div className="customer-fields">
                {!patient && (
                  <div className="form-group">
                    <label>Customer name{includeDelivery ? '' : ' (optional)'}</label>
                    <input
                      type="text"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Customer name"
                    />
                  </div>
                )}
                <div className="form-group">
                  <label>
                    Customer address
                    {includeDelivery ? '' : ' (optional)'}
                  </label>
                  <textarea
                    rows={2}
                    value={customerAddress}
                    onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder={includeDelivery ? 'Required for delivery' : 'Delivery address'}
                  />
                </div>
              </div>
            )}

            <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #e0e0e0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <input
                  type="checkbox"
                  checked={includeDoctorFee}
                  onChange={(e) => setIncludeDoctorFee(e.target.checked)}
                />
                Include doctor fee
              </label>
              {includeDoctorFee && (
                <div className="form-group" style={{ marginBottom: 8 }}>
                  <label>Doctor fee</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={doctorFee}
                    onChange={(e) => setDoctorFee(e.target.value)}
                  />
                </div>
              )}
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
              <span>Medicines</span>
              <span>MMK{cartSubtotal.toFixed(2)}</span>
            </div>
            {includeDoctorFee && (
              <div className="receipt-line text-muted">
                <span>Doctor fee</span>
                <span>MMK{appliedDoctorFee.toFixed(2)}</span>
              </div>
            )}
            {includeDelivery && (
              <div className="receipt-line text-muted">
                <span>Delivery fee</span>
                <span>MMK{appliedDeliveryFee.toFixed(2)}</span>
              </div>
            )}
            <div className="cart-total">Total: MMK{cartTotal.toFixed(2)}</div>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '8px' }}
              onClick={handleCheckout}
              disabled={checkoutLoading || !canCheckout}
            >
              {checkoutLoading ? 'Processing...' : 'Complete Checkout'}
            </button>
          </div>
        </div>
      </div>

      {completedSale && (
        <ReceiptModal sale={completedSale} onClose={() => setCompletedSale(null)} />
      )}
    </div>
  )
}
