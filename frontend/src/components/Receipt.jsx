export default function Receipt({ sale }) {
  const date = new Date(sale.created_at).toLocaleString()

  return (
    <div className="receipt">
      <div className="receipt-header">
        <div style={{ fontWeight: 'bold', fontSize: '15px' }}>PHARMACY POS</div>
        <div>Sale #{sale.sale_number}</div>
        <div>{date}</div>
        <div>Cashier: {sale.cashier_name}</div>
      </div>
      {sale.items.map((item) => (
        <div key={item.id}>
          <div>{item.medicine_name}</div>
          <div className="receipt-line">
            <span>{item.quantity} x ${item.selling_price.toFixed(2)}</span>
            <span>${item.line_total.toFixed(2)}</span>
          </div>
        </div>
      ))}
      <div className="receipt-total receipt-line">
        <span>TOTAL</span>
        <span>${sale.total_amount.toFixed(2)}</span>
      </div>
      <div className="text-muted mt-8" style={{ textAlign: 'center' }}>
        Thank you for your purchase
      </div>
    </div>
  )
}
