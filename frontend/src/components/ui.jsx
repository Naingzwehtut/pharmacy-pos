import { useEffect } from 'react'
import { api } from '../api'
import { useT } from '../i18n'

export function Modal({ title, onClose, children, wide = false, className = '' }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose?.()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal ${wide ? 'modal-wide' : ''} ${className}`}
        onMouseDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {title && (
          <div className="modal-header">
            <h2>{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">×</button>
          </div>
        )}
        {children}
      </div>
    </div>
  )
}

export function Alert({ type = 'error', children, onClose }) {
  if (!children) return null
  return (
    <div className={`alert alert-${type}`}>
      <span>{children}</span>
      {onClose && (
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Dismiss">×</button>
      )}
    </div>
  )
}

export function Stat({ label, value, sub, tone }) {
  return (
    <div className={`stat ${tone ? `stat-${tone}` : ''}`}>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  )
}

export function ExpiryBadge({ status, days }) {
  const { t } = useT()
  if (status === 'expired') return <span className="badge badge-danger">{t('inv.expired')}</span>
  if (status === 'warning') {
    return <span className="badge badge-warning">{t('inv.expiring')}{days != null ? ` · ${days}d` : ''}</span>
  }
  if (status === 'none') return <span className="badge badge-muted">{t('inv.noStock')}</span>
  return <span className="badge badge-ok">{t('inv.ok')}</span>
}

const PAY_TONE = {
  cash: 'ok',
  credit: 'warning',
  kbzpay: 'info',
  wavepay: 'info',
  ayapay: 'info',
  cbpay: 'info',
  uabpay: 'info',
}

export function PaymentBadge({ method }) {
  const { t } = useT()
  const m = method || 'cash'
  return <span className={`badge badge-${PAY_TONE[m] || 'muted'}`}>{t(`pay.${m}`)}</span>
}

export function Pagination({ page, pages, onChange }) {
  const { t } = useT()
  if (!pages || pages <= 1) return null
  return (
    <div className="pagination">
      <button type="button" className="btn btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        ‹ {t('common.previous')}
      </button>
      <span className="text-muted">{t('common.page', { page, pages })}</span>
      <button type="button" className="btn btn-sm" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        {t('common.next')} ›
      </button>
    </div>
  )
}

export function Empty({ children }) {
  return <div className="empty-state">{children}</div>
}

export function Tabs({ tabs, value, onChange }) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={value === tab.value}
          className={`tab ${value === tab.value ? 'tab-active' : ''}`}
          onClick={() => onChange(tab.value)}
        >
          {tab.label}
          {tab.count != null && <span className="tab-count">{tab.count}</span>}
        </button>
      ))}
    </div>
  )
}

/** Small drug photo, or the first letters of the name when there is none. */
export function DrugThumb({ medicine, size = 40 }) {
  const style = { width: size, height: size }
  if (medicine.has_image) {
    return <img className="drug-thumb" style={style} src={api.medicineImageUrl(medicine)} alt="" loading="lazy" />
  }
  const letters = medicine.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase()
  return <div className="drug-thumb drug-thumb-empty" style={style}>{letters}</div>
}

