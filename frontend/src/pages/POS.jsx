import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { api } from '../api'
import PatientPicker from '../components/PatientPicker'
import ReceiptModal from '../components/ReceiptModal'
import { Alert } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { describeQuantity, formatDate, formatNumber } from '../format'
import { useT } from '../i18n'

const DOCTOR_KEY = 'last_doctor_name'
const DRAFT_KEY = 'pos_draft_v2'

function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY)) || null
  } catch {
    return null
  }
}

function saveDraft(draft) {
  try {
    if (draft) localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
    else localStorage.removeItem(DRAFT_KEY)
  } catch {
    /* storage unavailable */
  }
}

const lineKey = (medicineId, unit) => `${medicineId}:${unit}`

export default function POS() {
  const location = useLocation()
  const { t } = useT()
  const { user } = useAuth()
  const { settings, money, paymentMethods } = useSettings()
  const searchRef = useRef(null)
  const draft = useMemo(() => (location.state?.patient ? null : loadDraft()), []) // eslint-disable-line

  const [search, setSearch] = useState('')
  const [medicines, setMedicines] = useState([])
  const [loading, setLoading] = useState(false)
  const [cart, setCart] = useState(draft?.cart || [])
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [completedSale, setCompletedSale] = useState(null)

  const [patient, setPatient] = useState(location.state?.patient || draft?.patient || null)
  const [doctorName, setDoctorName] = useState(() => localStorage.getItem(DOCTOR_KEY) || '')
  const [symptoms, setSymptoms] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [visitNotes, setVisitNotes] = useState('')

  const [includeDoctorFee, setIncludeDoctorFee] = useState(Boolean(location.state?.patient))
  const [doctorFee, setDoctorFee] = useState('')
  const [includeDelivery, setIncludeDelivery] = useState(false)
  const [deliveryFee, setDeliveryFee] = useState('')
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerAddress, setCustomerAddress] = useState('')

  const [discountMode, setDiscountMode] = useState('amount')
  const [discountInput, setDiscountInput] = useState('')

  const [method, setMethod] = useState('cash')
  const [tendered, setTendered] = useState('')
  const [reference, setReference] = useState('')
  const [paidNow, setPaidNow] = useState('')

  useEffect(() => {
    setDoctorFee((v) => v || String(settings.default_doctor_fee || ''))
    setDeliveryFee((v) => v || String(settings.default_delivery_fee || ''))
  }, [settings.default_doctor_fee, settings.default_delivery_fee])

  useEffect(() => {
    saveDraft(cart.length ? { cart, patient } : null)
  }, [cart, patient])

  const loadMedicines = useCallback(async () => {
    setLoading(true)
    try {
      setMedicines(await api.getMedicines({ search, pos: 'true', limit: 60 }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [search])

  useEffect(() => {
    const timer = setTimeout(loadMedicines, 250)
    return () => clearTimeout(timer)
  }, [loadMedicines])

  // ---- cart ----
  const baseInCart = (medicineId, exceptKey) =>
    cart
      .filter((c) => c.medicine_id === medicineId && c.key !== exceptKey)
      .reduce((sum, c) => sum + c.quantity * c.size, 0)

  const addToCart = (medicine, unit = 'unit') => {
    setError('')
    const option = medicine.pack_options.find((o) => o.unit === unit) || medicine.pack_options[0]
    const key = lineKey(medicine.id, option.unit)
    const existing = cart.find((c) => c.key === key)
    const nextBase = baseInCart(medicine.id) + option.size
    if (nextBase > medicine.sellable_quantity) {
      setError(t('pos.stockLimit', { n: describeQuantity(medicine.sellable_quantity, medicine, t), name: medicine.name }))
      return
    }
    if (medicine.requires_prescription && !existing) setNotice(`${medicine.name}: ${t('pos.rxWarning')}`)
    setCart((prev) => {
      if (prev.some((c) => c.key === key)) {
        return prev.map((c) => (c.key === key ? { ...c, quantity: c.quantity + 1 } : c))
      }
      return [...prev, {
        key,
        medicine_id: medicine.id,
        name: medicine.name,
        name_mm: medicine.name_mm,
        unit: option.unit,
        label: option.label,
        size: option.size,
        price: option.price,
        pack_options: medicine.pack_options,
        sellable: medicine.sellable_quantity,
        unit_name: medicine.unit_name,
        rx: medicine.requires_prescription,
        quantity: 1,
        dosage: '',
      }]
    })
  }

  const setQty = (key, qty) => {
    setCart((prev) => prev.map((c) => {
      if (c.key !== key) return c
      const q = Math.max(1, Math.floor(Number(qty) || 1))
      const others = prev.filter((o) => o.medicine_id === c.medicine_id && o.key !== key)
        .reduce((s, o) => s + o.quantity * o.size, 0)
      const maxQ = Math.floor((c.sellable - others) / c.size)
      if (q > maxQ) {
        setError(t('pos.stockLimit', { n: c.sellable - others, name: c.name }))
        return { ...c, quantity: Math.max(maxQ, 1) }
      }
      return { ...c, quantity: q }
    }))
  }

  const changeUnit = (key, unit) => {
    setCart((prev) => {
      const line = prev.find((c) => c.key === key)
      const option = line.pack_options.find((o) => o.unit === unit)
      const newKey = lineKey(line.medicine_id, unit)
      if (prev.some((c) => c.key === newKey)) return prev
      const others = prev.filter((o) => o.medicine_id === line.medicine_id && o.key !== key)
        .reduce((s, o) => s + o.quantity * o.size, 0)
      if (others + option.size > line.sellable) {
        setError(t('pos.stockLimit', { n: line.sellable - others, name: line.name }))
        return prev
      }
      return prev.map((c) => (c.key === key
        ? { ...c, key: newKey, unit, label: option.label, size: option.size, price: option.price, quantity: 1 }
        : c))
    })
  }

  const updateDosage = (key, dosage) =>
    setCart((prev) => prev.map((c) => (c.key === key ? { ...c, dosage } : c)))
  const removeLine = (key) => setCart((prev) => prev.filter((c) => c.key !== key))

  // ---- totals ----
  const subtotal = cart.reduce((s, c) => s + c.price * c.quantity, 0)
  const appliedDoctorFee = includeDoctorFee ? Number(doctorFee) || 0 : 0
  const appliedDeliveryFee = includeDelivery ? Number(deliveryFee) || 0 : 0
  const gross = subtotal + appliedDoctorFee + appliedDeliveryFee
  const discountValue = Number(discountInput) || 0
  const discount = Math.min(
    discountMode === 'percent' ? Math.round((gross * discountValue) / 100) : discountValue,
    gross
  )
  const total = Math.max(gross - discount, 0)
  const tenderedValue = Number(tendered) || 0
  const change = tenderedValue - total
  const canCheckout = cart.length > 0 || appliedDoctorFee > 0

  const quickCash = useMemo(() => {
    if (total <= 0) return []
    const set = new Set([total])
    for (const step of [1000, 5000, 10000, 50000]) {
      const v = Math.ceil(total / step) * step
      if (v > total) set.add(v)
    }
    return [...set].sort((a, b) => a - b).slice(0, 4)
  }, [total])

  const resetSale = () => {
    setCart([])
    setPatient(null)
    setIncludeDoctorFee(false)
    setIncludeDelivery(false)
    setCustomerName('')
    setCustomerPhone('')
    setCustomerAddress('')
    setSymptoms('')
    setDiagnosis('')
    setVisitNotes('')
    setDiscountInput('')
    setMethod('cash')
    setTendered('')
    setReference('')
    setPaidNow('')
    setNotice('')
    saveDraft(null)
  }

  const handleCheckout = async () => {
    if (!canCheckout || checkoutLoading) return
    setError('')
    const name = customerName.trim() || patient?.name || ''
    const address = customerAddress.trim() || patient?.address || ''
    if (includeDelivery && (!name || !address)) {
      setError(`${t('pos.customerName')} / ${t('pos.customerAddress')}`)
      return
    }
    if (method === 'credit' && !patient) {
      setError(t('pos.creditNeedsPatient'))
      return
    }
    if (method === 'cash' && tendered !== '' && tenderedValue < total) {
      setError(t('pos.cashShort'))
      return
    }
    setCheckoutLoading(true)
    try {
      if (doctorName.trim()) localStorage.setItem(DOCTOR_KEY, doctorName.trim())
      const sale = await api.checkout({
        items: cart.map((c) => ({
          medicine_id: c.medicine_id,
          unit: c.unit,
          quantity: c.quantity,
          dosage: c.dosage.trim(),
        })),
        patient_id: patient?.id || null,
        doctor_name: patient ? doctorName.trim() : '',
        symptoms: patient ? symptoms.trim() : '',
        diagnosis: patient ? diagnosis.trim() : '',
        visit_notes: patient ? visitNotes.trim() : '',
        doctor_fee: appliedDoctorFee,
        delivery_fee: appliedDeliveryFee,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        customer_address: customerAddress.trim(),
        discount,
        payment_method: method,
        payment_reference: method !== 'cash' && method !== 'credit' ? reference.trim() : '',
        amount_tendered: method === 'cash' && tendered !== '' ? tenderedValue : null,
        amount_paid: method === 'credit' ? Number(paidNow) || 0 : null,
      })
      resetSale()
      setCompletedSale(sale)
      loadMedicines()
    } catch (err) {
      setError(err.message)
    } finally {
      setCheckoutLoading(false)
    }
  }

  // ---- keyboard: F2 search, F9 checkout ----
  const checkoutRef = useRef(handleCheckout)
  checkoutRef.current = handleCheckout
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') {
        e.preventDefault()
        searchRef.current?.focus()
        searchRef.current?.select()
      } else if (e.key === 'F9') {
        e.preventDefault()
        checkoutRef.current()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onSearchKey = async (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    const code = search.trim()
    if (!code) return
    // Barcode scanners type the code and press Enter
    const exact = medicines.find((m) => m.barcode && m.barcode === code)
    if (exact) {
      addToCart(exact)
      setSearch('')
      return
    }
    if (/^\d{6,}$/.test(code)) {
      try {
        const m = await api.findBarcode(code)
        addToCart(m)
        setSearch('')
        return
      } catch {
        /* not a barcode: fall through */
      }
    }
    if (medicines.length) {
      addToCart(medicines[0])
    }
  }

  const methodsShown = paymentMethods.length ? paymentMethods : ['cash']
  const unitName = (name) => {
    const text = t(`unit.${name}`)
    return text === `unit.${name}` ? name : text
  }

  return (
    <div className="pos-page">
      <div className="page-header">
        <h1 className="page-title">{t('pos.title')}</h1>
        <span className="text-muted hide-mobile">{t('pos.searchHint')}</span>
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>
      <Alert type="warning" onClose={() => setNotice('')}>{notice}</Alert>

      <div className="pos-layout">
        <section className="pos-products">
          <div className="search-bar">
            <input
              ref={searchRef}
              type="search"
              placeholder={t('pos.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={onSearchKey}
              autoFocus
            />
          </div>

          <div className="card card-flush">
            {loading && medicines.length === 0 ? (
              <div className="loading">{t('pos.searching')}</div>
            ) : medicines.length === 0 ? (
              <div className="empty-state">{t('pos.noMedicines')}</div>
            ) : (
              <div className="product-list">
                {medicines.map((m) => (
                  <div key={m.id} className="product-row">
                    <div className="product-info">
                      <div className="product-name">
                        {m.name}
                        {m.requires_prescription && <span className="badge badge-danger badge-xs">{t('pos.rx')}</span>}
                        {m.expiry_status === 'warning' && (
                          <span className="badge badge-warning badge-xs">{t('pos.expiringSoon')}</span>
                        )}
                      </div>
                      <div className="product-meta">
                        {m.name_mm && <span className="mm">{m.name_mm}</span>}
                        {m.generic_name && <span>{m.generic_name}</span>}
                        <span>{t('pos.stock')}: {describeQuantity(m.sellable_quantity, m, t)}</span>
                        {m.shelf_location && <span>{t('inv.shelf')} {m.shelf_location}</span>}
                        <span>{t('pos.expiry')}: {formatDate(m.expiry_date)}</span>
                      </div>
                    </div>
                    <div className="pack-buttons">
                      {m.pack_options.map((o) => (
                        <button
                          key={o.unit}
                          type="button"
                          className="pack-btn"
                          disabled={o.size > m.sellable_quantity}
                          onClick={() => addToCart(m, o.unit)}
                          title={`${o.size} ${m.unit_name}`}
                        >
                          <span className="pack-label">{unitName(o.unit === 'unit' ? m.unit_name : o.unit)}</span>
                          <span className="pack-price">{formatNumber(o.price)}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="pos-side">
          <div className="card">
            <div className="card-title">{t('pos.patient')}</div>
            <PatientPicker value={patient} onChange={(p) => { setPatient(p); setIncludeDoctorFee(Boolean(p)) }} />
            {!patient && <p className="text-muted hint">{t('pos.walkInHint')}</p>}
            {patient && (
              <div className="visit-fields">
                <div className="form-row">
                  <div className="form-group">
                    <label>{t('pos.doctor')}</label>
                    <input value={doctorName} onChange={(e) => setDoctorName(e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>{t('pos.diagnosis')}</label>
                    <input value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} />
                  </div>
                </div>
                <div className="form-group">
                  <label>{t('pos.symptoms')}</label>
                  <textarea rows={2} value={symptoms} onChange={(e) => setSymptoms(e.target.value)} />
                </div>
                <div className="form-group">
                  <label>{t('pos.visitNotes')}</label>
                  <input value={visitNotes} onChange={(e) => setVisitNotes(e.target.value)} />
                </div>
              </div>
            )}
          </div>

          <div className="card">
            <div className="card-title">
              <span>{t('pos.cart')}</span>
              {cart.length > 0 && (
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setCart([])}>
                  {t('pos.clearCart')}
                </button>
              )}
            </div>
            {cart.length === 0 ? (
              <div className="empty-state compact">{t('pos.cartEmpty')}</div>
            ) : (
              <table className="data-table cart-table">
                <tbody>
                  {cart.map((c) => (
                    <Fragment key={c.key}>
                      <tr className="cart-row">
                        <td>
                          <div className="cart-name">{c.name}{c.rx && <span className="badge badge-danger badge-xs">Rx</span>}</div>
                          <div className="cart-sub">
                            {c.pack_options.length > 1 ? (
                              <select value={c.unit} onChange={(e) => changeUnit(c.key, e.target.value)} className="unit-select">
                                {c.pack_options.map((o) => (
                                  <option key={o.unit} value={o.unit}>
                                    {o.unit === 'unit' ? unitName(c.unit_name) : `${unitName(o.unit)} (${o.size})`}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span>{unitName(c.unit_name)}</span>
                            )}
                            <span className="text-muted">@ {formatNumber(c.price)}</span>
                          </div>
                        </td>
                        <td className="num">
                          <div className="qty-control">
                            <button type="button" onClick={() => (c.quantity <= 1 ? removeLine(c.key) : setQty(c.key, c.quantity - 1))}>−</button>
                            <input
                              type="number"
                              min="1"
                              value={c.quantity}
                              onChange={(e) => setQty(c.key, e.target.value)}
                              aria-label={t('common.quantity')}
                            />
                            <button type="button" onClick={() => setQty(c.key, c.quantity + 1)}>+</button>
                          </div>
                        </td>
                        <td className="num strong">{formatNumber(c.price * c.quantity)}</td>
                        <td>
                          <button type="button" className="icon-btn danger" onClick={() => removeLine(c.key)} aria-label={t('pos.remove')}>×</button>
                        </td>
                      </tr>
                      {patient && (
                        <tr className="dosage-row">
                          <td colSpan={4}>
                            <input
                              className="dosage-input"
                              placeholder={t('pos.dosage')}
                              value={c.dosage}
                              maxLength={300}
                              onChange={(e) => updateDosage(c.key, e.target.value)}
                            />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}

            <div className="fee-toggles">
              <label className="check">
                <input type="checkbox" checked={includeDoctorFee} onChange={(e) => setIncludeDoctorFee(e.target.checked)} />
                {t('pos.includeDoctorFee')}
              </label>
              {includeDoctorFee && (
                <input type="number" min="0" className="inline-input" value={doctorFee}
                  onChange={(e) => setDoctorFee(e.target.value)} aria-label={t('pos.doctorFee')} />
              )}
              <label className="check">
                <input type="checkbox" checked={includeDelivery} onChange={(e) => setIncludeDelivery(e.target.checked)} />
                {t('pos.includeDelivery')}
              </label>
              {includeDelivery && (
                <input type="number" min="0" className="inline-input" value={deliveryFee}
                  onChange={(e) => setDeliveryFee(e.target.value)} aria-label={t('pos.deliveryFee')} />
              )}
            </div>

            {includeDelivery && (
              <div className="customer-fields">
                {!patient && (
                  <div className="form-row">
                    <div className="form-group">
                      <label>{t('pos.customerName')}</label>
                      <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
                    </div>
                    <div className="form-group">
                      <label>{t('pos.customerPhone')}</label>
                      <input value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} placeholder="09..." />
                    </div>
                  </div>
                )}
                <div className="form-group">
                  <label>{t('pos.customerAddress')}</label>
                  <textarea rows={2} value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)}
                    placeholder={patient?.address || ''} />
                </div>
              </div>
            )}

            <div className="discount-row">
              <label>{t('pos.discount')}</label>
              <div className="input-group">
                <input type="number" min="0" value={discountInput} onChange={(e) => setDiscountInput(e.target.value)} placeholder="0" />
                <button type="button" className={`seg ${discountMode === 'amount' ? 'on' : ''}`} onClick={() => setDiscountMode('amount')}>
                  {settings.currency_label}
                </button>
                <button type="button" className={`seg ${discountMode === 'percent' ? 'on' : ''}`} onClick={() => setDiscountMode('percent')}>%</button>
              </div>
            </div>
            {user?.role === 'cashier' && (
              <div className="text-muted hint">max {settings.cashier_max_discount_percent}%</div>
            )}

            <div className="totals">
              <div className="totals-line"><span>{t('pos.medicines')}</span><span>{money(subtotal)}</span></div>
              {appliedDoctorFee > 0 && <div className="totals-line"><span>{t('pos.doctorFee')}</span><span>{money(appliedDoctorFee)}</span></div>}
              {appliedDeliveryFee > 0 && <div className="totals-line"><span>{t('pos.deliveryFee')}</span><span>{money(appliedDeliveryFee)}</span></div>}
              {discount > 0 && <div className="totals-line discount"><span>{t('pos.discount')}</span><span>− {money(discount)}</span></div>}
              <div className="totals-grand"><span>{t('common.total')}</span><span>{money(total)}</span></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('pos.payment')}</div>
            <div className="pay-methods">
              {methodsShown.map((m) => (
                <button key={m} type="button" className={`pay-chip pay-${m} ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>
                  {t(`pay.${m}`)}
                </button>
              ))}
            </div>

            {method === 'cash' && (
              <div className="pay-detail">
                <div className="form-group">
                  <label>{t('pos.cashReceived')}</label>
                  <input type="number" min="0" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={formatNumber(total)} />
                </div>
                <div className="quick-cash">
                  {quickCash.map((v) => (
                    <button key={v} type="button" className="btn btn-sm" onClick={() => setTendered(String(v))}>
                      {v === total ? t('pos.exact') : formatNumber(v)}
                    </button>
                  ))}
                </div>
                {tendered !== '' && (
                  <div className={`change-box ${change < 0 ? 'short' : ''}`}>
                    <span>{t('pos.change')}</span>
                    <strong>{money(Math.max(change, 0))}</strong>
                  </div>
                )}
              </div>
            )}
            {method !== 'cash' && method !== 'credit' && (
              <div className="form-group pay-detail">
                <label>{t('pos.reference')} ({t('common.optional')})</label>
                <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="e.g. 0123456789" />
              </div>
            )}
            {method === 'credit' && (
              <div className="pay-detail">
                {!patient ? (
                  <div className="alert alert-warning">{t('pos.creditNeedsPatient')}</div>
                ) : (
                  <>
                    {patient.balance > 0 && (
                      <div className="text-muted">{t('pos.balance')}: <strong>{money(patient.balance)}</strong></div>
                    )}
                    <div className="form-group">
                      <label>{t('pos.paidNow')}</label>
                      <input type="number" min="0" value={paidNow} onChange={(e) => setPaidNow(e.target.value)} placeholder="0" />
                    </div>
                    <div className="change-box warn">
                      <span>{t('pos.owed')}</span>
                      <strong>{money(Math.max(total - (Number(paidNow) || 0), 0))}</strong>
                    </div>
                  </>
                )}
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary btn-block btn-xl"
              onClick={handleCheckout}
              disabled={checkoutLoading || !canCheckout}
            >
              {checkoutLoading ? t('pos.processing') : `${t('pos.checkout')} · ${money(total)}`}
              <span className="kbd">F9</span>
            </button>
          </div>
        </section>
      </div>

      {completedSale && (
        <ReceiptModal sale={completedSale} onClose={() => { setCompletedSale(null); searchRef.current?.focus() }} />
      )}
    </div>
  )
}
