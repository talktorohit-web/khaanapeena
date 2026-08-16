import React, { useMemo } from 'react'
import { StatCard, Empty } from '../components.jsx'
import { Bars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, download, paidIn, slug, pct, amt, spanDays, earliestOf } from './shared.jsx'

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const hourLabel = (h) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}`
const hourSpan = (h) => `${hourLabel(h)}–${hourLabel((h + 1) % 24)}`

// Indian restaurant day-parts — these are the blocks staffing and prep are
// actually planned around, so they matter more than raw clock hours.
const DAYPARTS = [
  { key: 'breakfast', label: '🌅 Breakfast / tiffin', from: 5, to: 11 },
  { key: 'lunch', label: '🍛 Lunch', from: 11, to: 16 },
  { key: 'evening', label: '☕ Evening / snacks', from: 16, to: 19 },
  { key: 'dinner', label: '🌙 Dinner', from: 19, to: 24 },
  { key: 'late', label: '🦉 Late night', from: 0, to: 5 },
]

export default function Hourly({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const gross = paid.reduce((s, o) => s + amt(o), 0)
  const days = spanDays(range, earliestOf(paid, (o) => o.paidAt))

  // hour-of-day collapsed ACROSS every day in the range (deliberately not
  // bucketize(), which lays hours out along a single day's timeline)
  const hours = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, bills: 0, rev: 0 }))
    paid.forEach((o) => { const x = h[new Date(o.paidAt).getHours()]; x.bills++; x.rev += amt(o) })
    return h
  }, [paid])

  // trim dead hours off both ends so the chart shows the trading day, not midnight-to-midnight
  const firstActive = hours.findIndex((h) => h.bills > 0)
  const lastActive = 23 - [...hours].reverse().findIndex((h) => h.bills > 0)
  const active = firstActive === -1 ? hours.slice(8, 24) : hours.slice(firstActive, lastActive + 1)

  const peak = [...hours].sort((a, b) => b.rev - a.rev)[0]
  const quiet = hours.filter((h) => h.bills > 0).sort((a, b) => a.rev - b.rev)[0]

  // weekday x hour grid
  const grid = useMemo(() => {
    const g = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ bills: 0, rev: 0 })))
    paid.forEach((o) => {
      const d = new Date(o.paidAt)
      const cell = g[(d.getDay() + 6) % 7][d.getHours()]
      cell.bills++; cell.rev += amt(o)
    })
    return g
  }, [paid])
  const gridMax = Math.max(1, ...grid.flat().map((c) => c.rev))
  const gridHours = active.map((h) => h.hour)

  const dowTotals = grid.map((row) => row.reduce((s, c) => s + c.rev, 0))

  const parts = DAYPARTS.map((p) => {
    const os = paid.filter((o) => { const h = new Date(o.paidAt).getHours(); return h >= p.from && h < p.to })
    const rev = os.reduce((s, o) => s + amt(o), 0)
    return { ...p, bills: os.length, rev, avg: os.length ? Math.round(rev / os.length) : 0, share: pct(rev, gross) }
  }).filter((p) => p.bills > 0)

  const exportCsv = () => {
    const rows = [['PEAK HOURS — ' + range.label], [],
      ['Hour', 'Bills', 'Revenue ₹', 'Avg bill ₹', 'Share of sales %', 'Avg bills/day']]
    hours.filter((h) => h.bills).forEach((h) => rows.push([
      hourSpan(h.hour), h.bills, Math.round(h.rev), Math.round(h.rev / h.bills), pct(h.rev, gross), (h.bills / days).toFixed(1),
    ]))
    rows.push([], ['DAY-PARTS'], ['Part', 'Bills', 'Revenue ₹', 'Avg bill ₹', 'Share %'])
    parts.forEach((p) => rows.push([p.label, p.bills, Math.round(p.rev), p.avg, p.share]))
    rows.push([], ['WEEKDAY × HOUR (revenue ₹)'], ['Day', ...gridHours.map(hourLabel)])
    grid.forEach((row, i) => rows.push([DOW[i], ...gridHours.map((h) => Math.round(row[h].rev))]))
    download(`khaanapeena-peak-hours-${slug(range)}.csv`, rows)
  }

  if (!paid.length) {
    return <Card><Empty icon="⏰" text={`No settled bills in ${range.label.toLowerCase()} — peak hours appear once you start billing.`} /></Card>
  }

  const busiestDow = DOW[dowTotals.indexOf(Math.max(...dowTotals))]

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Busiest hour" value={peak.bills ? hourSpan(peak.hour) : '—'} sub={`${inr0(peak.rev)} · ${pct(peak.rev, gross)}% of sales`} icon="🔥" accent="saffron" />
        <StatCard label="Busiest day" value={busiestDow} sub={inr0(Math.max(...dowTotals))} icon="📅" accent="purple" />
        <StatCard label="Quietest trading hour" value={quiet ? hourSpan(quiet.hour) : '—'} sub={quiet ? `only ${inr0(quiet.rev)}` : ''} icon="😴" accent="blue" />
        <StatCard label="Top 3 hours together" value={pct([...hours].sort((a, b) => b.rev - a.rev).slice(0, 3).reduce((s, h) => s + h.rev, 0), gross) + '%'} sub="of all your sales" icon="⚡" accent="green" />
      </div>

      <Card title="Sales by hour of day" sub={`Every ${range.label.toLowerCase()} bill, stacked onto one clock — this is where to put your staff`}>
        <Bars data={active.map((h) => ({ label: hourLabel(h.hour).replace('am', 'a').replace('pm', 'p'), value: Math.round(h.rev) }))} labelEvery={active.length > 12 ? 2 : 1} />
      </Card>

      {/* WEEKDAY x HOUR HEATMAP */}
      <Card
        flush
        title="Rush map — weekday × hour"
        sub="Darker = more money that hour. Read it across a row to plan one day, down a column to plan a shift."
      >
        <div className="px-5 pb-5 overflow-x-auto">
          <table className="text-[11px] border-separate" style={{ borderSpacing: 2 }}>
            <thead>
              <tr>
                <th className="text-left text-stone-400 font-medium pr-2 sticky left-0 bg-white"></th>
                {gridHours.map((h) => <th key={h} className="text-stone-400 font-medium w-8">{hourLabel(h).replace('am', 'a').replace('pm', 'p')}</th>)}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, i) => (
                <tr key={i}>
                  <td className="text-stone-500 font-semibold pr-2 sticky left-0 bg-white whitespace-nowrap">{DOW[i]}</td>
                  {gridHours.map((h) => {
                    const c = row[h]
                    const intensity = c.rev / gridMax
                    return (
                      <td
                        key={h}
                        title={`${DOW[i]} ${hourSpan(h)} — ${inr0(c.rev)} · ${c.bills} bill${c.bills === 1 ? '' : 's'}`}
                        className="w-8 h-7 rounded text-center align-middle"
                        style={{
                          background: c.rev ? `rgba(240, 96, 8, ${0.12 + intensity * 0.88})` : '#f5f5f4',
                          color: intensity > 0.55 ? 'white' : '#78716c',
                        }}
                      >{c.bills || ''}</td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-stone-400 mt-2">Number in each box = bills settled. Hover for the rupees.</p>
        </div>
      </Card>

      <Card flush title="Day-parts" sub="Breakfast, lunch, evening and dinner as separate businesses">
        <DataTable
          rows={parts}
          keyOf={(p) => p.key}
          cols={[
            { h: 'Part of day', cell: (p) => <div><span className="font-semibold">{p.label}</span><div className="text-[11px] text-stone-400">{hourLabel(p.from)} – {hourLabel(p.to % 24)}</div></div>, foot: () => 'All day' },
            { h: 'Bills', num: true, cell: (p) => p.bills, foot: () => paid.length },
            { h: 'Revenue', num: true, cell: (p) => <b>{inr0(p.rev)}</b>, foot: () => inr0(gross) },
            { h: 'Avg bill', num: true, cell: (p) => inr0(p.avg), foot: () => inr0(paid.length ? gross / paid.length : 0) },
            { h: 'Share', num: true, cell: (p) => p.share + '%', foot: () => '100%' },
            { h: 'Bills / day', num: true, cell: (p) => (p.bills / days).toFixed(1), foot: () => (paid.length / days).toFixed(1) },
          ]}
        />
      </Card>

      <Card flush title="Hour-by-hour detail" sub="Only hours you actually traded in">
        <DataTable
          scroll
          rows={hours.filter((h) => h.bills > 0).sort((a, b) => b.rev - a.rev)}
          keyOf={(h) => h.hour}
          cols={[
            { h: 'Hour', cell: (h) => <span className="font-semibold">{hourSpan(h.hour)}</span> },
            { h: 'Bills', num: true, cell: (h) => h.bills },
            { h: 'Revenue', num: true, cell: (h) => <b>{inr0(h.rev)}</b> },
            { h: 'Avg bill', num: true, cell: (h) => inr0(h.rev / h.bills) },
            { h: 'Share', num: true, cell: (h) => pct(h.rev, gross) + '%' },
            { h: 'Avg bills/day', num: true, cell: (h) => (h.bills / days).toFixed(1) },
          ]}
        />
      </Card>
    </>
  )
}
