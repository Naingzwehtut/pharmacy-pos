import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { api } from '../api'
import { Alert, Empty, ExpiryBadge, Stat } from '../components/ui'
import { useSettings } from '../context/SettingsContext'
import { describeQuantity, formatDate, formatNumber } from '../format'
import { useTheme } from '../context/ThemeContext'
import { useT } from '../i18n'
import Calendar from './Calendar'

function change(now, before) {
  if (!before) return null
  const pct = ((now - before) / before) * 100
  return `${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%`
}

const compact = (v) => (Math.abs(v) >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : Math.abs(v) >= 1e3 ? `${Math.round(v / 1e3)}K` : String(v))

export default function Dashboard() {
  const { t } = useT()
  const { money } = useSettings()
  const { theme } = useTheme()
  const c = theme === 'dark'
    ? { main: '#5fbf88', second: '#e0a43a', text: '#b9bdb8', grid: '#2c302d', tip: '#1c1f1d' }
    : { main: '#1f6b43', second: '#a15c07', text: '#4a514d', grid: '#e3e4df', tip: '#ffffff' }
  const [data, setData] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    api.getDashboard().then(setData).catch((err) => setError(err.message))
  }, [])

  if (error) return <Alert>{error}</Alert>
  if (!data) return <div className="loading">{t('common.loading')}</div>

  const { today, yesterday, this_month: month, summary } = data
  const chartData = data.sales_by_day.map((d) => ({ ...d, label: d.date.slice(5) }))

  return (
    <div>
      <div className="page-header"><h1 className="page-title">{t('dash.title')}</h1></div>

      <div className="stat-grid">
        <Stat label={`${t('common.today')} · ${t('dash.revenue')}`} value={money(today.revenue)}
          sub={`${today.sales} ${t('dash.sales')} ${change(today.revenue, yesterday.revenue) ? `· ${change(today.revenue, yesterday.revenue)} vs ${t('common.yesterday')}` : ''}`} tone="primary" />
        <Stat label={`${t('common.today')} · ${t('dash.profit')}`} value={money(today.profit)} tone="ok" />
        <Stat label={`${t('common.thisMonth')} · ${t('dash.revenue')}`} value={money(month.revenue)} sub={`${month.sales} ${t('dash.sales')} · ${t('dash.profit')} ${money(month.profit)}`} />
        <Stat label={t('dash.outstanding')} value={money(summary.outstanding_credit)} tone="warning" />
        <Stat label={t('dash.stockValue')} value={money(summary.stock_value)} sub={summary.expired_stock_value > 0 ? `${t('dash.expiredValue')}: ${money(summary.expired_stock_value)}` : null} />
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">{t('dash.chart')}</div>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ left: 0, right: 8, top: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: c.text }} />
                <YAxis tick={{ fontSize: 11, fill: c.text }} tickFormatter={compact} width={44} />
                <Tooltip formatter={(v) => money(v)} contentStyle={{ background: c.tip, border: `1px solid ${c.grid}` }} labelStyle={{ color: c.text }} />
                <Legend />
                <Line type="monotone" dataKey="revenue" stroke={c.main} name={t('dash.revenue')} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="profit" stroke={c.second} name={t('dash.profit')} strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="card">
          <div className="card-title">{t('dash.best')}</div>
          {data.best_selling.length === 0 ? <Empty>{t('common.noResults')}</Empty> : (
            <div className="chart-container">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.best_selling.slice(0, 8)} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={c.grid} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: c.text }} tickFormatter={compact} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: c.text }} />
                  <Tooltip formatter={(v) => money(v)} contentStyle={{ background: c.tip, border: `1px solid ${c.grid}` }} labelStyle={{ color: c.text }} />
                  <Bar dataKey="revenue" fill={c.main} name={t('dash.revenue')} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      <div className="grid-3">
        <div className="card card-flush">
          <div className="card-title pad">{t('dash.lowStock')} <Link to="/inventory" className="small">→</Link></div>
          {data.low_stock.length === 0 ? <Empty>{t('common.none')}</Empty> : (
            <table className="data-table">
              <tbody>
                {data.low_stock.slice(0, 10).map((m) => (
                  <tr key={m.id}><td>{m.name}</td><td className="num"><span className="badge badge-low">{describeQuantity(m.stock_quantity, m, t)}</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card card-flush">
          <div className="card-title pad">{t('dash.expiringSoon')} <Link to="/reports" className="small">→</Link></div>
          {data.expiring_soon.length === 0 ? <Empty>{t('common.none')}</Empty> : (
            <table className="data-table">
              <tbody>
                {data.expiring_soon.slice(0, 10).map((b) => (
                  <tr key={b.id}>
                    <td>{b.medicine_name}<div className="text-muted small">{b.batch_number} · {b.quantity}</div></td>
                    <td className="num">{formatDate(b.expiry_date)}<div><ExpiryBadge status={b.expiry_status} days={b.days_to_expiry} /></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className="card card-flush">
          <div className="card-title pad">{t('dash.methods')}</div>
          {data.payment_methods_this_month.length === 0 ? <Empty>{t('common.none')}</Empty> : (
            <table className="data-table">
              <tbody>
                {data.payment_methods_this_month.sort((a, b) => b.amount - a.amount).map((m) => (
                  <tr key={m.method}><td>{t(`pay.${m.method}`)}</td><td className="num">{m.count}</td><td className="num strong">{formatNumber(m.amount)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {data.expired.length > 0 && (
        <div className="card card-flush card-danger">
          <div className="card-title pad">{t('dash.expired')}</div>
          <table className="data-table">
            <tbody>
              {data.expired.map((b) => (
                <tr key={b.id}><td>{b.medicine_name}</td><td>{b.batch_number}</td><td className="num">{b.quantity}</td><td><span className="badge badge-danger">{formatDate(b.expiry_date)}</span></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="card">
        <div className="card-title">{t('dash.calendar')}</div>
        <Calendar />
      </div>
    </div>
  )
}
