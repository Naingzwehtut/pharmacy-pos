import { useEffect, useState, useRef } from 'react'
import { api } from '../api'

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function pad(n) {
  return String(n).padStart(2, '0')
}

function toKey(year, month, day) {
  return `${year}-${pad(month + 1)}-${pad(day)}`
}

function currencyFmt(v) {
  return `${Number(v || 0).toFixed(2)}`
}

export default function Calendar() {
  const today = new Date()
  const [cursor, setCursor] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [hovered, setHovered] = useState(null) // { key, x, y }
  const containerRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api.getCalendarStats(cursor.year, cursor.month + 1)
      .then((res) => {
        if (!cancelled) setStats(res || {})
      })
      .catch((err) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [cursor])

  const changeMonth = (delta) => {
    setHovered(null)
    setCursor((prev) => {
      let month = prev.month + delta
      let year = prev.year
      if (month < 0) { month = 11; year -= 1 }
      if (month > 11) { month = 0; year += 1 }
      return { year, month }
    })
  }

  const goToday = () => {
    setHovered(null)
    setCursor({ year: today.getFullYear(), month: today.getMonth() })
  }

  const firstOfMonth = new Date(cursor.year, cursor.month, 1)
  const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate()
  const startWeekday = firstOfMonth.getDay()
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7

  // Determine max revenue in the visible month for relative intensity shading
  const revenues = Object.values(stats).map((d) => Number(d.total_revenue || 0))
  const maxRevenue = revenues.length ? Math.max(...revenues) : 0

  const cells = []
  for (let i = 0; i < totalCells; i++) {
    const dayNum = i - startWeekday + 1
    const inMonth = dayNum >= 1 && dayNum <= daysInMonth
    const key = inMonth ? toKey(cursor.year, cursor.month, dayNum) : null
    const dayStats = inMonth ? stats[key] : null
    const isToday =
      inMonth &&
      cursor.year === today.getFullYear() &&
      cursor.month === today.getMonth() &&
      dayNum === today.getDate()

    const intensity = dayStats && maxRevenue > 0
      ? Math.min(1, Number(dayStats.total_revenue || 0) / maxRevenue)
      : 0

    cells.push({ i, dayNum, inMonth, key, dayStats, isToday, intensity })
  }

  const handleEnter = (cell, e) => {
    if (!cell.inMonth || !cell.dayStats) return
    const rect = e.currentTarget.getBoundingClientRect()
    const containerRect = containerRef.current.getBoundingClientRect()
    setHovered({
      key: cell.key,
      dayNum: cell.dayNum,
      stats: cell.dayStats,
      x: rect.left - containerRect.left + rect.width / 2,
      y: rect.top - containerRect.top,
    })
  }

  const handleLeave = () => setHovered(null)

  return (
    <div className="card" ref={containerRef} style={{ position: 'relative' }}>
      <div className="cal-header">
        <div className="cal-title">
          {MONTH_NAMES[cursor.month]} {cursor.year}
        </div>
        <div className="cal-nav">
          <button type="button" className="cal-nav-btn" onClick={() => changeMonth(-1)} aria-label="Previous month">
            &#8249;
          </button>
          <button type="button" className="cal-today-btn" onClick={goToday}>
            Today
          </button>
          <button type="button" className="cal-nav-btn" onClick={() => changeMonth(1)} aria-label="Next month">
            &#8250;
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      <div className="cal-grid cal-weekdays">
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-weekday">{w}</div>
        ))}
      </div>

      <div className={`cal-grid cal-days ${loading ? 'cal-loading' : ''}`}>
        {cells.map((cell) => (
          <div
            key={cell.i}
            className={[
              'cal-cell',
              !cell.inMonth ? 'cal-cell-empty' : '',
              cell.isToday ? 'cal-cell-today' : '',
              cell.dayStats ? 'cal-cell-has-data' : '',
            ].filter(Boolean).join(' ')}
            style={
              cell.dayStats
                ? { '--intensity': cell.intensity }
                : undefined
            }
            onMouseEnter={(e) => handleEnter(cell, e)}
            onMouseLeave={handleLeave}
          >
            {cell.inMonth && <span className="cal-day-num">{cell.dayNum}</span>}
            {cell.dayStats && <span className="cal-dot" />}
          </div>
        ))}
      </div>

      {hovered && (
        <div
          className="cal-tooltip"
          style={{ left: hovered.x, top: hovered.y }}
        >
          <div className="cal-tooltip-date">
            {MONTH_NAMES[cursor.month]} {hovered.dayNum}, {cursor.year}
          </div>
          <div className="cal-tooltip-row">
            <span>Total Items Sold</span>
            <strong>{hovered.stats.total_items_sold}</strong>
          </div>
          <div className="cal-tooltip-row">
            <span>Total Revenue</span>
            <strong>{currencyFmt(hovered.stats.total_revenue)}</strong>
          </div>
          <div className="cal-tooltip-row">
            <span>Total Profit</span>
            <strong className="cal-tooltip-profit">{currencyFmt(hovered.stats.total_profit)}</strong>
          </div>
        </div>
      )}

      <style>{`
        .cal-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 16px;
        }
        .cal-title {
          font-size: 16px;
          font-weight: 600;
          color: #1c2b36;
        }
        .cal-nav {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .cal-nav-btn {
          width: 28px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid #dfe4e8;
          background: #fff;
          color: #2980b9;
          font-size: 16px;
          line-height: 1;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.15s ease;
        }
        .cal-nav-btn:hover {
          background: #eef4fa;
        }
        .cal-today-btn {
          padding: 0 10px;
          height: 28px;
          border-radius: 6px;
          border: 1px solid #dfe4e8;
          background: #fff;
          color: #4a5a66;
          font-size: 12px;
          cursor: pointer;
          transition: background 0.15s ease;
        }
        .cal-today-btn:hover {
          background: #f4f6f7;
        }
        .cal-grid {
          display: grid;
          grid-template-columns: repeat(7, 1fr);
        }
        .cal-weekdays {
          margin-bottom: 4px;
        }
        .cal-weekday {
          text-align: center;
          font-size: 11px;
          font-weight: 600;
          color: #8a97a1;
          padding: 4px 0;
        }
        .cal-days {
          gap: 4px;
          transition: opacity 0.15s ease;
        }
        .cal-loading {
          opacity: 0.5;
        }
        .cal-cell {
          position: relative;
          aspect-ratio: 1 / 1;
          border-radius: 8px;
          border: 1px solid #eceef0;
          background: #fff;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .cal-cell-empty {
          border-color: transparent;
          background: transparent;
        }
        .cal-cell-has-data {
          cursor: pointer;
          background: color-mix(in srgb, #2980b9 calc(var(--intensity) * 55%), #ffffff);
          border-color: color-mix(in srgb, #2980b9 calc(var(--intensity) * 40% + 10%), #eceef0);
        }
        .cal-cell-has-data:hover {
          border-color: #2980b9;
          box-shadow: 0 0 0 2px rgba(41, 128, 185, 0.15);
        }
        .cal-cell-today {
          border-color: #2980b9;
          border-width: 2px;
        }
        .cal-day-num {
          font-size: 12px;
          font-weight: 500;
          color: #45525c;
        }
        .cal-cell-has-data .cal-day-num {
          color: #1c2b36;
          font-weight: 600;
        }
        .cal-dot {
          position: absolute;
          bottom: 5px;
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #27ae60;
        }
        .cal-tooltip {
          position: absolute;
          transform: translate(-50%, calc(-100% - 10px));
          background: #1c2b36;
          color: #fff;
          border-radius: 8px;
          padding: 10px 12px;
          min-width: 170px;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
          pointer-events: none;
          z-index: 20;
        }
        .cal-tooltip::after {
          content: '';
          position: absolute;
          left: 50%;
          top: 100%;
          transform: translateX(-50%);
          border: 6px solid transparent;
          border-top-color: #1c2b36;
        }
        .cal-tooltip-date {
          font-size: 11px;
          color: #9fb0bd;
          margin-bottom: 6px;
        }
        .cal-tooltip-row {
          display: flex;
          justify-content: space-between;
          gap: 16px;
          font-size: 13px;
          padding: 2px 0;
        }
        .cal-tooltip-profit {
          color: #6fd090;
        }
      `}</style>
    </div>
  )
}
