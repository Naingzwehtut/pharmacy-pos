// Formatting helpers for Myanmar Kyat amounts, digits and dates.

const MM_DIGITS = '၀၁၂၃၄၅၆၇၈၉'

export function toMyanmarDigits(text) {
  return String(text).replace(/[0-9]/g, (d) => MM_DIGITS[d])
}

/** 12500 -> "12,500". Kyat has no everyday fractions, so decimals only when present. */
export function formatNumber(value, { myanmarDigits = false } = {}) {
  const n = Number(value) || 0
  const hasFraction = Math.abs(n - Math.round(n)) > 0.004
  const text = n.toLocaleString('en-US', {
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  })
  return myanmarDigits ? toMyanmarDigits(text) : text
}

/** "12,500 Ks" */
export function formatMoney(value, currency = 'Ks', opts = {}) {
  const text = formatNumber(value, opts)
  return currency ? `${text} ${currency}` : text
}

/** Today's date (YYYY-MM-DD) in the browser's local time zone. */
export function todayISO() {
  const d = new Date()
  const offset = d.getTimezoneOffset() * 60000
  return new Date(d - offset).toISOString().slice(0, 10)
}

export function formatDateTime(iso, lang = 'en') {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString(lang === 'my' ? 'en-GB' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function formatDate(iso) {
  if (!iso) return '—'
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
}

/** Shows "2 strip + 3 tablet" style quantities from base units. Pass t() to translate unit names. */
export function describeQuantity(baseQty, medicine, t) {
  if (!medicine) return String(baseQty)
  const tr = (key, fallback) => {
    if (!t) return fallback
    const text = t(key)
    return text === key ? fallback : text
  }
  const unit = tr(`unit.${medicine.unit_name}`, medicine.unit_name || 'unit')
  if (medicine.strip_size && baseQty >= medicine.strip_size) {
    const strips = Math.floor(baseQty / medicine.strip_size)
    const rest = baseQty % medicine.strip_size
    const strip = tr('unit.strip', 'strip')
    return rest ? `${strips} ${strip} + ${rest} ${unit}` : `${strips} ${strip}`
  }
  return `${baseQty} ${unit}`
}
