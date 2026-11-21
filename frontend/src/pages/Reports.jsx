import { useCallback, useEffect, useState } from 'react'
import { api } from '../api'
import { Alert, Empty, ExpiryBadge, Stat, Tabs } from '../components/ui'
import { useAuth } from '../context/AuthContext'
import { useSettings } from '../context/SettingsContext'
import { formatDate, formatNumber, todayISO } from '../format'
import { useT } from '../i18n'

function DailyClosing() {
  const { t } = useT()
  const { can } = useAuth()
  const { money, settings } = useSettings()
  const [start, setStart] = useState(todayISO())
  const [end, setEnd] = useState(todayISO())
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    api.getDailyReport({ start_date: start, end_date: end }).then(setData).catch((e) => setError(e.message))
  }, [start, end])
  useEffect(() => {
    load()
  }, [load])

  return (
    <div className="printable">
      <div className="filter-bar card no-print">
        <div className="form-group"><label>{t('common.from')}</label><input type="date" value={start} max={todayISO()} onChange={(e) => setStart(e.target.value)} /></div>
        <div className="form-group"><label>{t('common.to')}</label><input type="date" value={end} max={todayISO()} onChange={(e) => setEnd(e.target.value)} /></div>
        <button type="button" className="btn" onClick={() => { setStart(todayISO()); setEnd(todayISO()) }}>{t('common.today')}</button>
        <button type="button" className="btn" onClick={() => window.print()}>{t('common.print')}</button>
      </div>
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="print-only print-title">
            <h2>{settings.pharmacy_name} – {t('rep.daily')}</h2>
            <p>{formatDate(data.start_date)}{data.end_date !== data.start_date ? ` – ${formatDate(data.end_date)}` : ''}</p>
          </div>
          <div className="stat-grid">
            <Stat label={t('rep.net')} value={money(data.net_sales)} sub={`${data.sales_count} ${t('rep.salesCount')}`} tone="primary" />
            <Stat label={t('rep.cashDrawer')} value={money(data.cash_in_drawer)} tone="ok" />
            <Stat label={t('rep.collected')} value={money(data.total_collected)} />
            <Stat label={t('rep.creditGiven')} value={money(data.credit_given)} sub={`${t('rep.creditRepaid')}: ${money(data.credit_repaid)}`} tone="warning" />
            {can('admin') && <Stat label={t('dash.profit')} value={money(data.profit)} />}
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">{t('rep.byMethod')}</div>
              {data.payment_methods.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
                <table className="data-table">
                  <thead><tr><th>{t('sales.payment')}</th><th className="num">{t('rep.salesCount')}</th><th className="num">{t('rep.repayments')}</th><th className="num">{t('rep.collected')}</th></tr></thead>
                  <tbody>
                    {data.payment_methods.map((m) => (
                      <tr key={m.method}>
                        <td>{t(`pay.${m.method}`)}</td>
                        <td className="num">{m.sales ? `${m.sales} · ${formatNumber(m.sales_amount)}` : '—'}</td>
                        <td className="num">{m.repayments ? formatNumber(m.repayments) : '—'}</td>
                        <td className="num strong">{formatNumber(m.collected)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="card-title">{t('common.total')}</div>
              <div className="totals">
                <div className="totals-line"><span>{t('rep.medicineSales')}</span><span>{money(data.medicine_sales)}</span></div>
                <div className="totals-line"><span>{t('pos.doctorFee')}</span><span>{money(data.doctor_fees)}</span></div>
                <div className="totals-line"><span>{t('pos.deliveryFee')}</span><span>{money(data.delivery_fees)}</span></div>
                <div className="totals-line"><span>{t('rep.gross')}</span><span>{money(data.gross_sales)}</span></div>
                <div className="totals-line discount"><span>{t('rep.discounts')}</span><span>− {money(data.discounts)}</span></div>
                <div className="totals-grand"><span>{t('rep.net')}</span><span>{money(data.net_sales)}</span></div>
                {data.voided_count > 0 && (
                  <div className="totals-line text-danger"><span>{t('rep.voided')} ({data.voided_count})</span><span>{money(data.voided_amount)}</span></div>
                )}
              </div>
            </div>
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="card-title">{t('rep.byCashier')}</div>
              {data.by_cashier.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
                <table className="data-table">
                  <tbody>
                    {data.by_cashier.map((c) => (
                      <tr key={c.cashier}><td>{c.cashier}</td><td className="num">{c.sales}</td><td className="num strong">{money(c.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="card">
              <div className="card-title">{t('rep.topItems')}</div>
              {data.top_items.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
                <table className="data-table">
                  <tbody>
                    {data.top_items.map((i) => (
                      <tr key={i.name}><td>{i.name}</td><td className="num">{i.quantity}</td><td className="num strong">{formatNumber(i.amount)}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function ExpiryReport() {
  const { t } = useT()
  const { money } = useSettings()
  const [days, setDays] = useState(90)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => {
    api.getExpiryReport(days).then(setData).catch((e) => setError(e.message))
  }, [days])

  const table = (rows) => (
    <table className="data-table">
      <thead><tr><th>{t('common.name')}</th><th>{t('inv.batchNo')}</th><th>{t('inv.shelf')}</th><th>{t('inv.expiry')}</th><th className="num">{t('rep.days')}</th><th className="num">{t('inv.stock')}</th><th className="num">{t('rep.value')}</th></tr></thead>
      <tbody>
        {rows.map((b) => (
          <tr key={b.id}>
            <td className="strong">{b.medicine_name}</td><td>{b.batch_number || '—'}</td><td>{b.shelf_location || '—'}</td>
            <td>{formatDate(b.expiry_date)}</td>
            <td className="num"><ExpiryBadge status={b.expiry_status} days={b.days_to_expiry} /></td>
            <td className="num">{b.quantity} {b.unit_name}</td>
            <td className="num">{b.stock_value != null ? formatNumber(b.stock_value) : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )

  return (
    <div className="printable">
      <div className="filter-bar card no-print">
        <div className="form-group">
          <label>{t('rep.within')}</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
            {[30, 60, 90, 180, 365].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <button type="button" className="btn" onClick={() => window.print()}>{t('common.print')}</button>
      </div>
      <Alert>{error}</Alert>
      {data && (
        <>
          <div className="card card-flush">
            <div className="card-title pad">{t('rep.expiredStock')} <span className="text-danger">{money(data.expired_value)}</span></div>
            {data.expired.length === 0 ? <Empty>{t('common.none')}</Empty> : table(data.expired)}
          </div>
          <div className="card card-flush">
            <div className="card-title pad">{t('rep.expiringStock')} <span className="text-warning">{money(data.expiring_value)}</span></div>
            {data.expiring.length === 0 ? <Empty>{t('common.none')}</Empty> : table(data.expiring)}
          </div>
        </>
      )}
    </div>
  )
}

export default function Reports() {
  const { t } = useT()
  const { can } = useAuth()
  const [tab, setTab] = useState('daily')
  const tabs = [{ value: 'daily', label: t('rep.daily') }]
  if (can('admin', 'pharmacist')) tabs.push({ value: 'expiry', label: t('rep.expiry') })
  return (
    <div>
      <div className="page-header no-print"><h1 className="page-title">{t('rep.title')}</h1></div>
      <div className="no-print"><Tabs value={tab} onChange={setTab} tabs={tabs} /></div>
      {tab === 'daily' ? <DailyClosing /> : <ExpiryReport />}
    </div>
  )
}
