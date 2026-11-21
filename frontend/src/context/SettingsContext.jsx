import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api } from '../api'
import { formatMoney } from '../format'
import { useAuth } from './AuthContext'

const DEFAULTS = {
  pharmacy_name: 'Zwe Pharmacy',
  pharmacy_name_mm: 'ဇွဲ ဆေးဆိုင်',
  pharmacy_address: '',
  pharmacy_phone: '',
  receipt_footer: 'Thank you for your purchase.',
  receipt_footer_mm: '',
  receipt_language: 'both',
  receipt_myanmar_digits: false,
  receipt_paper: '80mm',
  currency_label: 'Ks',
  default_delivery_fee: 0,
  default_doctor_fee: 0,
  default_doctor_name: 'Dr Ye Htut',
  cashier_max_discount_percent: 10,
  enabled_payment_methods: 'cash,kbzpay,wavepay,ayapay,cbpay,mpu_card,bank_transfer,credit',
}

const SettingsContext = createContext({ settings: DEFAULTS, reload: () => {}, money: (v) => String(v) })

export function SettingsProvider({ children }) {
  const { user } = useAuth()
  const [settings, setSettings] = useState(DEFAULTS)

  const reload = useCallback(() => {
    if (!user) return Promise.resolve()
    return api.getSettings()
      .then((s) => setSettings({ ...DEFAULTS, ...s }))
      .catch(() => {})
  }, [user])

  useEffect(() => {
    reload()
  }, [reload])

  const money = useCallback(
    (value, opts) => formatMoney(value, settings.currency_label, opts),
    [settings.currency_label]
  )

  const paymentMethods = (settings.enabled_payment_methods || 'cash')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean)

  return (
    <SettingsContext.Provider value={{ settings, reload, money, paymentMethods, setSettings }}>
      {children}
    </SettingsContext.Provider>
  )
}

export function useSettings() {
  return useContext(SettingsContext)
}
