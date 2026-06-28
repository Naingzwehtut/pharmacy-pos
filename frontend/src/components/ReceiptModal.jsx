import { useEffect, useState } from 'react'
import { api } from '../api'
import Receipt from './Receipt'

export default function ReceiptModal({ sale, onClose }) {
  const [pharmacy, setPharmacy] = useState(null)

  useEffect(() => {
    api.getReceiptSettings()
      .then(setPharmacy)
      .catch(() => setPharmacy({}))
  }, [])

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-receipt" onClick={(e) => e.stopPropagation()}>
        <div className="receipt-print">
          {pharmacy ? (
            <Receipt sale={sale} pharmacy={pharmacy} />
          ) : (
            <div className="loading">Loading receipt...</div>
          )}
        </div>
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onClose}>Close</button>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>Print Receipt</button>
        </div>
      </div>
    </div>
  )
}
