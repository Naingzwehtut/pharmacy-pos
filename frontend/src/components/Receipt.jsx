function formatReceiptDate(isoDate) {
  return new Date(isoDate).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function Receipt({ sale, pharmacy }) {
  const subtotal = sale.subtotal ?? sale.total_amount
  const deliveryFee = sale.delivery_fee ?? 0
  const pharmacyName = pharmacy?.pharmacy_name || 'Pharmacy POS'
  const pharmacyAddress = pharmacy?.pharmacy_address || ''
  const pharmacyPhone = pharmacy?.pharmacy_phone || ''
  const customerName = sale.customer_name?.trim()
  const customerAddress = sale.customer_address?.trim()

  return (
    <div className="receipt">
      <div className="receipt-brand">
        <div className="receipt-brand-name">{pharmacyName}</div>
        {pharmacyAddress && <div className="receipt-brand-detail">{pharmacyAddress}</div>}
        {pharmacyPhone && <div className="receipt-brand-detail">Tel: {pharmacyPhone}</div>}
      </div>

      <div className="receipt-meta">
        <div className="receipt-meta-row">
          <span>Receipt No.</span>
          <span>{sale.sale_number}</span>
        </div>
        <div className="receipt-meta-row">
          <span>Date</span>
          <span>{formatReceiptDate(sale.created_at)}</span>
        </div>
        <div className="receipt-meta-row">
          <span>Cashier</span>
          <span>{sale.cashier_name}</span>
        </div>
      </div>

      {(customerName || customerAddress) && (
        <div className="receipt-customer">
          <div className="receipt-section-label">Customer</div>
          {customerName && <div className="receipt-customer-name">{customerName}</div>}
          {customerAddress && (
            <div className="receipt-customer-address">{customerAddress}</div>
          )}
        </div>
      )}

      <table className="receipt-items">
        <thead>
          <tr>
            <th>Item</th>
            <th className="num">Qty</th>
            <th className="num">Price</th>
            <th className="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          {sale.items.map((item) => (
            <tr key={item.id}>
              <td>{item.medicine_name}</td>
              <td className="num">{item.quantity}</td>
              <td className="num">${item.selling_price.toFixed(2)}</td>
              <td className="num">${item.line_total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="receipt-summary">
        <div className="receipt-summary-row">
          <span>Subtotal</span>
          <span>${subtotal.toFixed(2)}</span>
        </div>
        {deliveryFee > 0 && (
          <div className="receipt-summary-row">
            <span>Delivery fee</span>
            <span>${deliveryFee.toFixed(2)}</span>
          </div>
        )}
        <div className="receipt-summary-row receipt-summary-total">
          <span>Total</span>
          <span>${sale.total_amount.toFixed(2)}</span>
        </div>
      </div>

      <div className="receipt-footer">
        <div>Thank you for your purchase.</div>
        <div>Please retain this receipt for your records.</div>
      </div>
    </div>
  )
}
