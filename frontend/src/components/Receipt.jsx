import { formatDateTime, formatNumber, toMyanmarDigits } from '../format'
import { translate } from '../i18n'

/** Printable receipt. Language, digits and paper width come from Settings. */
export default function Receipt({ sale, settings }) {
  const lang = settings.receipt_language || 'both'
  const mmDigits = Boolean(settings.receipt_myanmar_digits)
  const cur = settings.currency_label || 'Ks'

  const L = (key) => {
    if (lang === 'both') {
      const e = translate('en', key)
      const m = translate('my', key)
      return e === m ? e : `${m} / ${e}`
    }
    return translate(lang, key)
  }
  const n = (v) => formatNumber(v, { myanmarDigits: mmDigits })
  const d = (text) => (mmDigits ? toMyanmarDigits(text) : text)

  const nameMm = settings.pharmacy_name_mm
  const showMmName = nameMm && lang !== 'en'
  const showEnName = lang !== 'my' || !nameMm
  const customerName = (sale.patient_name || sale.customer_name || '').trim()
  const paid = sale.amount_paid ?? sale.total_amount
  const footerEn = settings.receipt_footer
  const footerMm = settings.receipt_footer_mm

  const unitText = (item) => {
    if (!item.unit_label || item.unit_size <= 1) return ''
    const key = `unit.${item.unit_label}`
    const label = translate(lang === 'en' ? 'en' : 'my', key)
    return label === key ? item.unit_label : label
  }

  return (
    <div className={`receipt receipt-${settings.receipt_paper || '80mm'}`}>
      {sale.status === 'voided' && <div className="receipt-void">{L('receipt.voided')}</div>}
      <div className="receipt-brand">
        {showMmName && <div className="receipt-brand-name mm">{nameMm}</div>}
        {showEnName && <div className={showMmName ? 'receipt-brand-sub' : 'receipt-brand-name'}>{settings.pharmacy_name}</div>}
        {settings.pharmacy_address && <div className="receipt-brand-detail">{settings.pharmacy_address}</div>}
        {settings.pharmacy_phone && (
          <div className="receipt-brand-detail">{L('receipt.tel')}: {d(settings.pharmacy_phone)}</div>
        )}
      </div>

      <div className="receipt-meta">
        <div className="receipt-meta-row"><span>{L('receipt.no')}</span><span>{sale.sale_number}</span></div>
        <div className="receipt-meta-row"><span>{L('receipt.date')}</span><span>{d(formatDateTime(sale.created_at))}</span></div>
        <div className="receipt-meta-row"><span>{L('receipt.cashier')}</span><span>{sale.cashier_name}</span></div>
        {sale.doctor_name && (
          <div className="receipt-meta-row"><span>{L('receipt.doctor')}</span><span>{sale.doctor_name}</span></div>
        )}
      </div>

      {(customerName || sale.customer_address) && (
        <div className="receipt-customer">
          <div className="receipt-section-label">{L(sale.patient_id ? 'receipt.patient' : 'receipt.customer')}</div>
          {customerName && (
            <div className="receipt-customer-name">
              {customerName}
              {sale.patient_number && <span className="receipt-patient-id"> · {sale.patient_number}</span>}
            </div>
          )}
          {sale.customer_phone && <div className="receipt-customer-address">{d(sale.customer_phone)}</div>}
          {sale.customer_address && <div className="receipt-customer-address">{sale.customer_address}</div>}
        </div>
      )}

      <table className="receipt-items">
        <thead>
          <tr>
            <th>{L('pos.item')}</th>
            <th className="num">{lang === 'en' ? 'Qty' : 'ခု'}</th>
            <th className="num">{lang === 'en' ? 'Amount' : 'ကျသင့်ငွေ'}</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>
                {item.medicine_name}
                <div className="receipt-unit">@ {n(item.unit_price)}{unitText(item) ? ` / ${unitText(item)}` : ''}</div>
                {item.dosage && <div className="receipt-dosage">{item.dosage}</div>}
              </td>
              <td className="num">{n(item.unit_qty)} {unitText(item)}</td>
              <td className="num">{n(item.line_total)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt-summary">
        <div className="receipt-summary-row"><span>{L('receipt.subtotal')}</span><span>{n(sale.subtotal)}</span></div>
        {sale.doctor_fee > 0 && (
          <div className="receipt-summary-row"><span>{L('pos.doctorFee')}</span><span>{n(sale.doctor_fee)}</span></div>
        )}
        {sale.delivery_fee > 0 && (
          <div className="receipt-summary-row"><span>{L('pos.deliveryFee')}</span><span>{n(sale.delivery_fee)}</span></div>
        )}
        {sale.discount > 0 && (
          <div className="receipt-summary-row"><span>{L('receipt.discount')}</span><span>− {n(sale.discount)}</span></div>
        )}
        <div className="receipt-summary-row receipt-summary-total">
          <span>{L('receipt.total')}</span><span>{n(sale.total_amount)} {cur}</span>
        </div>
        <div className="receipt-summary-row">
          <span>{L('receipt.payment')}</span>
          <span>{L(`pay.${sale.payment_method || 'cash'}`)}</span>
        </div>
        {sale.payment_reference && (
          <div className="receipt-summary-row"><span>Ref</span><span>{sale.payment_reference}</span></div>
        )}
        {sale.amount_tendered != null && (
          <>
            <div className="receipt-summary-row"><span>{L('pos.cashReceived')}</span><span>{n(sale.amount_tendered)}</span></div>
            <div className="receipt-summary-row"><span>{L('receipt.change')}</span><span>{n(sale.change_given)}</span></div>
          </>
        )}
        {sale.payment_method === 'credit' && (
          <>
            <div className="receipt-summary-row"><span>{L('receipt.paid')}</span><span>{n(paid)}</span></div>
            <div className="receipt-summary-row receipt-summary-strong">
              <span>{L('receipt.balance')}</span><span>{n(sale.balance_due)} {cur}</span>
            </div>
          </>
        )}
      </div>

      <div className="receipt-footer">
        {lang !== 'en' && footerMm && <div className="mm">{footerMm}</div>}
        {lang !== 'my' && footerEn && <div>{footerEn}</div>}
      </div>
    </div>
  )
}
