import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import ReceiptModal from '../components/ReceiptModal'
import { Alert, Empty, Pagination, PaymentBadge } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { formatDateTime, formatNumber } from '../format'
import { useT } from '../i18n'

const EMPTY = { start_date: '', end_date: '', sale_number: '', payment_method: '', status: '' }

export default function SalesHistory() {
  const { t } = useT()
  const { can } = useAuth()
  const { money } = useSettings()
  const [data, setData] = useState({ items: [], total: 0, page: 1, pages: 1 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filters, setFilters] = useState(EMPTY)
  const [applied, setApplied] = useState(EMPTY)
  const [page, setPage] = useState(1)
  const [selectedSale, setSelectedSale] = useState(null)
  const [expandedId, setExpandedId] = useState(null)
  const isAdmin = can('admin')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      setData(await api.getSales({ ...applied, page, per_page: 25 }))
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [applied, page])

  useEffect(() => {
    load()
  }, [load])

  const apply = (e) => {
    e.preventDefault()
    setPage(1)
    setApplied(filters)
  }

  const exportCsv = async () => {
    try {
      const blob = await api.exportSales(applied)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sales-${applied.start_date || 'all'}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err.message)
    }
  }

  const voidSale = async (s) => {
    if (!window.confirm(t('sales.voidConfirm', { n: s.sale_number }))) return
    const reason = window.prompt(t('sales.voidReason'))
    if (!reason || !reason.trim()) return
    try {
      await api.voidSale(s.id, reason.trim())
      load()
    } catch (err) {
      setError(err.message)
    }
  }

  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value })

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">{t('sales.title')}</h1>
        {isAdmin && <button type="button" className="btn" onClick={exportCsv}>{t('common.export')}</button>}
      </div>

      <Alert onClose={() => setError('')}>{error}</Alert>

      <form className="filter-bar card" onSubmit={apply}>
        <div className="form-group"><label>{t('common.from')}</label><input type="date" value={filters.start_date} onChange={set('start_date')} /></div>
        <div className="form-group"><label>{t('common.to')}</label><input type="date" value={filters.end_date} onChange={set('end_date')} /></div>
        <div className="form-group"><label>{t('sales.number')}</label><input value={filters.sale_number} onChange={set('sale_number')} placeholder="S2026..." /></div>
        <div className="form-group">
          <label>{t('sales.payment')}</label>
          <select value={filters.payment_method} onChange={set('payment_method')}>
            <option value="">{t('common.all')}</option>
            {['cash', 'kbzpay', 'wavepay', 'ayapay', 'cbpay', 'uabpay', 'mpu_card', 'bank_transfer', 'credit'].map((m) => (
              <option key={m} value={m}>{t(`pay.${m}`)}</option>
            ))}
          </select>
        </div>
        <div className="form-group">
          <label>{t('common.status')}</label>
          <select value={filters.status} onChange={set('status')}>
            <option value="">{t('common.all')}</option>
            <option value="completed">{t('sales.completed')}</option>
            <option value="voided">{t('sales.voided')}</option>
          </select>
        </div>
        <button type="submit" className="btn btn-primary">{t('common.filter')}</button>
        <button type="button" className="btn" onClick={() => { setFilters(EMPTY); setApplied(EMPTY); setPage(1) }}>{t('common.clear')}</button>
      </form>

      <div className="card card-flush">
        {loading && data.items.length === 0 ? <div className="loading">{t('common.loading')}</div> : data.items.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{t('sales.number')}</th>
                  <th>{t('common.date')}</th>
                  <th>{t('sales.customer')}</th>
                  <th>{t('common.cashier')}</th>
                  <th>{t('sales.payment')}</th>
                  <th className="num">{t('common.total')}</th>
                  {isAdmin && <th className="num">{t('sales.profit')}</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((s) => (
                  <Fragment key={s.id}>
                    <tr className={s.status === 'voided' ? 'row-voided' : ''}>
                      <td className="small">{s.sale_number}{s.status === 'voided' && <span className="badge badge-danger badge-xs">{t('sales.voided')}</span>}</td>
                      <td>{formatDateTime(s.created_at)}</td>
                      <td>
                        {s.patient_id ? <Link to={`/patients/${s.patient_id}`}>{s.patient_name}</Link> : s.customer_name || <span className="text-muted">{t('common.walkIn')}</span>}
                      </td>
                      <td>{s.cashier_name}</td>
                      <td>
                        <PaymentBadge method={s.payment_method} />
                        {s.balance_due > 0 && <div className="text-danger small">{money(s.balance_due)}</div>}
                      </td>
                      <td className="num strong">{money(s.total_amount)}</td>
                      {isAdmin && <td className="num">{formatNumber(s.total_profit)}</td>}
                      <td className="actions">
                        <button type="button" className="btn btn-sm" onClick={() => setExpandedId(expandedId === s.id ? null : s.id)}>
                          {expandedId === s.id ? t('common.hide') : t('common.details')}
                        </button>
                        <button type="button" className="btn btn-sm" onClick={() => setSelectedSale(s)}>{t('sales.receipt')}</button>
                        {isAdmin && s.status !== 'voided' && (
                          <button type="button" className="btn btn-sm btn-danger-ghost" onClick={() => voidSale(s)}>{t('sales.void')}</button>
                        )}
                      </td>
                    </tr>
                    {expandedId === s.id && (
                      <tr className="detail-row">
                        <td colSpan={isAdmin ? 8 : 7}>
                          <div className="detail-line">
                            {s.doctor_name && <span>{t('pos.doctor')}: {s.doctor_name}</span>}
                            {s.diagnosis && <span>{t('pos.diagnosis')}: {s.diagnosis}</span>}
                            {s.customer_address && <span>{t('common.address')}: {s.customer_address}</span>}
                            {s.payment_reference && <span>Ref: {s.payment_reference}</span>}
                            {s.discount > 0 && <span>{t('pos.discount')}: {money(s.discount)}</span>}
                            {s.doctor_fee > 0 && <span>{t('pos.doctorFee')}: {money(s.doctor_fee)}</span>}
                            {s.delivery_fee > 0 && <span>{t('pos.deliveryFee')}: {money(s.delivery_fee)}</span>}
                            {s.status === 'voided' && <span className="text-danger">{t('sales.voided')}: {s.void_reason} ({s.voided_by_name})</span>}
                          </div>
                          <table className="data-table inner">
                            <thead>
                              <tr>
                                <th>{t('pos.item')}</th><th>{t('pat.dosage')}</th><th className="num">{t('common.quantity')}</th>
                                <th className="num">{t('common.price')}</th><th className="num">{t('common.total')}</th>
                                {isAdmin && <th className="num">{t('sales.cost')}</th>}
                                {isAdmin && <th className="num">{t('sales.profit')}</th>}
                              </tr>
                            </thead>
                            <tbody>
                              {s.items.map((i) => (
                                <tr key={i.id}>
                                  <td>{i.medicine_name}</td>
                                  <td>{i.dosage || '—'}</td>
                                  <td className="num">{i.unit_qty} {i.unit_size > 1 ? t(`unit.${i.unit_label}`) : ''}</td>
                                  <td className="num">{formatNumber(i.unit_price)}</td>
                                  <td className="num">{formatNumber(i.line_total)}</td>
                                  {isAdmin && <td className="num">{formatNumber(i.cost_price * i.quantity)}</td>}
                                  {isAdmin && <td className="num">{formatNumber(i.line_profit)}</td>}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <Pagination page={data.page} pages={data.pages} onChange={setPage} />
      {selectedSale && <ReceiptModal sale={selectedSale} onClose={() => setSelectedSale(null)} />}
    </div>
  )
}
