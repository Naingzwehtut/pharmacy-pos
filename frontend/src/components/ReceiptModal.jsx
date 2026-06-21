import Receipt from '../components/Receipt'

export default function ReceiptModal({ sale, onClose }) {
  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-print">
          <Receipt sale={sale} />
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>Print Receipt</button>
        </div>
      </div>
    </div>
  )
}
