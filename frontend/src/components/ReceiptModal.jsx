import { useEffect } from 'react'
import { useSettings } from '../context/SettingsContext'
import { useT } from '../i18n'
import Receipt from './Receipt'

export default function ReceiptModal({ sale, onClose }) {
  const { settings } = useSettings()
  const { t } = useT()

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) window.print()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div className="modal modal-receipt" onMouseDown={(e) => e.stopPropagation()}>
        <div className={`receipt-print paper-${settings.receipt_paper || '80mm'}`}>
          <Receipt sale={sale} settings={settings} />
        </div>
        <div className="modal-actions no-print">
          <button type="button" className="btn" onClick={onClose}>{t('common.close')}</button>
          <button type="button" className="btn btn-primary" onClick={() => window.print()} autoFocus>
            {t('receipt.print')}
          </button>
        </div>
      </div>
    </div>
  )
}
