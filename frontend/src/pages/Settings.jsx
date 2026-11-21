import { useEffect, useState } from 'react'
import { api } from '../api'
import DataBackup from '../components/DataBackup'
import Receipt from '../components/Receipt'
import { Alert } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { useT } from '../i18n'

const ALL_METHODS = ['cash', 'kbzpay', 'wavepay', 'ayapay', 'cbpay', 'uabpay', 'mpu_card', 'bank_transfer', 'credit']

const SAMPLE_SALE = {
  sale_number: 'S20261121093000AB12',
  created_at: new Date().toISOString(),
  cashier_name: 'cashier',
  customer_name: 'Daw Aye Aye',
  patient_id: 1,
  patient_number: 'P00001',
  patient_name: 'Daw Aye Aye',
  doctor_name: 'Dr. Khin Mar',
  items: [
    { id: 1, medicine_name: 'Paracap 500mg', unit_label: 'strip', unit_size: 10, unit_qty: 2, unit_price: 500, line_total: 1000, dosage: '1 tablet 3 times a day, 3 days' },
    { id: 2, medicine_name: 'ORS (Royal-D)', unit_label: 'sachet', unit_size: 1, unit_qty: 3, unit_price: 200, line_total: 600 },
  ],
  subtotal: 1600,
  doctor_fee: 5000,
  delivery_fee: 0,
  discount: 100,
  total_amount: 6500,
  payment_method: 'cash',
  amount_paid: 6500,
  amount_tendered: 10000,
  change_given: 3500,
  balance_due: 0,
}

export default function Settings() {
  const { t } = useT()
  const { settings, setSettings } = useSettings()
  const { system } = useAuth()
  const [form, setForm] = useState(settings)
  const [msg, setMsg] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => setForm(settings), [settings])

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const methods = (form.enabled_payment_methods || '').split(',').filter(Boolean)
  const toggleMethod = (m) => {
    const next = methods.includes(m) ? methods.filter((x) => x !== m) : [...methods, m]
    setForm({ ...form, enabled_payment_methods: ALL_METHODS.filter((x) => next.includes(x)).join(',') })
  }

  const save = async (e) => {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    try {
      const saved = await api.updateSettings(form)
      setSettings((s) => ({ ...s, ...saved }))
      setMsg({ type: 'success', text: t('common.saved') })
    } catch (err) {
      setMsg({ type: 'error', text: err.message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">{t('set.title')}</h1></div>
      <div className="settings-layout">
        <form onSubmit={save}>
          <Alert type={msg?.type} onClose={() => setMsg(null)}>{msg?.text}</Alert>
          <div className="card">
            <div className="card-title">{t('set.pharmacy')}</div>
            <div className="form-row">
              <div className="form-group"><label>{t('set.nameEn')} *</label><input value={form.pharmacy_name} onChange={set('pharmacy_name')} required /></div>
              <div className="form-group"><label>{t('set.nameMm')}</label><input className="mm" value={form.pharmacy_name_mm} onChange={set('pharmacy_name_mm')} /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>{t('common.address')}</label><input value={form.pharmacy_address} onChange={set('pharmacy_address')} /></div>
              <div className="form-group"><label>{t('common.phone')}</label><input value={form.pharmacy_phone} onChange={set('pharmacy_phone')} placeholder="09..." /></div>
            </div>
            <div className="form-row">
              <div className="form-group"><label>{t('set.footerMm')}</label><input className="mm" value={form.receipt_footer_mm} onChange={set('receipt_footer_mm')} /></div>
              <div className="form-group"><label>{t('set.footer')}</label><input value={form.receipt_footer} onChange={set('receipt_footer')} /></div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label>{t('set.receiptLang')}</label>
                <select value={form.receipt_language} onChange={set('receipt_language')}>
                  {['both', 'my', 'en'].map((l) => <option key={l} value={l}>{t(`set.lang.${l}`)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('set.paper')}</label>
                <select value={form.receipt_paper} onChange={set('receipt_paper')}>
                  <option value="80mm">80 mm</option>
                  <option value="58mm">58 mm</option>
                  <option value="a5">A5</option>
                </select>
              </div>
              <div className="form-group"><label>{t('set.currency')}</label><input value={form.currency_label} onChange={set('currency_label')} placeholder="Ks / ကျပ် / MMK" /></div>
            </div>
            <label className="check"><input type="checkbox" checked={Boolean(form.receipt_myanmar_digits)} onChange={set('receipt_myanmar_digits')} /> {t('set.digits')}</label>
          </div>

          <div className="card">
            <div className="card-title">{t('set.fees')}</div>
            <div className="form-row">
              <div className="form-group"><label>{t('set.doctorFee')}</label><input type="number" min="0" value={form.default_doctor_fee} onChange={set('default_doctor_fee')} /></div>
              <div className="form-group"><label>{t('set.deliveryFee')}</label><input type="number" min="0" value={form.default_delivery_fee} onChange={set('default_delivery_fee')} /></div>
              <div className="form-group"><label>{t('set.maxDiscount')}</label><input type="number" min="0" max="100" value={form.cashier_max_discount_percent} onChange={set('cashier_max_discount_percent')} /></div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">{t('set.payments')}</div>
            <div className="pay-methods">
              {ALL_METHODS.map((m) => (
                <button key={m} type="button" className={`pay-chip pay-${m} ${methods.includes(m) ? 'on' : ''}`} onClick={() => toggleMethod(m)}>
                  {t(`pay.${m}`)}
                </button>
              ))}
            </div>
          </div>

          <button type="submit" className="btn btn-primary btn-lg" disabled={saving}>{saving ? t('common.saving') : t('common.save')}</button>
          {system.desktop && <div style={{ marginTop: 24 }}><DataBackup /></div>}
        </form>

        <div className="settings-preview">
          <div className="card-title">{t('receipt.title')}</div>
          <div className={`receipt-preview paper-${form.receipt_paper}`}>
            <Receipt sale={SAMPLE_SALE} settings={form} />
          </div>
        </div>
      </div>
    </div>
  )
}
