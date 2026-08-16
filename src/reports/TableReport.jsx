import React, { useMemo } from 'react'
import { StatCard, Empty, Badge } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, amt, mins, median, dur, spanDays, earliestOf } from './shared.jsx'

// Table & section performance. Turnaround is measured from when the order was
// opened to when the bill was settled — the seat-time a table is actually blocked
// for, which is what limits how many parties you can serve in an evening.
export default function TableReport({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const dine = useMemo(() => paid.filter((o) => o.type === 'dine' && o.tableId), [paid])
  const days = spanDays(range, earliestOf(dine, (o) => o.paidAt))

  const rows = useMemo(() => (state.tables || []).map((tb) => {
    const os = dine.filter((o) => o.tableId === tb.id)
    const rev = os.reduce((s, o) => s + amt(o), 0)
    const times = os.map((o) => mins((o.servedAt || o.paidAt) - o.createdAt)).filter((m) => m > 0 && m < 600)
    return {
      id: tb.id, name: tb.name, area: tb.area || '—', seats: tb.seats || 0,
      bills: os.length, rev,
      avg: os.length ? rev / os.length : 0,
      tat: median(times),
      perSeat: tb.seats ? rev / tb.seats : 0,
      turnsPerDay: os.length / days,
    }
  }), [state.tables, dine, days])

  const areas = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const a = (m[r.area] = m[r.area] || { area: r.area, tables: 0, seats: 0, bills: 0, rev: 0, tats: [] })
      a.tables++; a.seats += r.seats; a.bills += r.bills; a.rev += r.rev
      if (r.tat != null) a.tats.push(r.tat)
    })
    return Object.values(m).map((a) => ({ ...a, tat: median(a.tats), perSeat: a.seats ? a.rev / a.seats : 0 })).sort((x, y) => y.rev - x.rev)
  }, [rows])

  const dineRev = dine.reduce((s, o) => s + amt(o), 0)
  const allTats = dine.map((o) => mins((o.servedAt || o.paidAt) - o.createdAt)).filter((m) => m > 0 && m < 600)
  const medTat = median(allTats)
  const totalSeats = rows.reduce((s, r) => s + r.seats, 0)
  const used = rows.filter((r) => r.bills > 0)
  const idle = rows.filter((r) => r.bills === 0)

  // seed demo orders are generated with a flat 45-minute lifetime, so on demo data
  // every turnaround reads the same — say so rather than let it look like a bug
  const flatTat = allTats.length > 3 && new Set(allTats.map((t) => Math.round(t))).size === 1

  const exportCsv = () => {
    const out = [['TABLE PERFORMANCE — ' + range.label], [],
      ['Table', 'Area', 'Seats', 'Parties served', 'Revenue ₹', 'Avg bill ₹', 'Median seat-time (min)', '₹ per seat', 'Turns/day']]
    ;[...rows].sort((a, b) => b.rev - a.rev).forEach((r) => out.push([
      r.name, r.area, r.seats, r.bills, Math.round(r.rev), Math.round(r.avg),
      r.tat == null ? '' : r.tat.toFixed(0), Math.round(r.perSeat), r.turnsPerDay.toFixed(2),
    ]))
    out.push([], ['BY SECTION'], ['Area', 'Tables', 'Seats', 'Parties', 'Revenue ₹', '₹ per seat', 'Median seat-time (min)'])
    areas.forEach((a) => out.push([a.area, a.tables, a.seats, a.bills, Math.round(a.rev), Math.round(a.perSeat), a.tat == null ? '' : a.tat.toFixed(0)]))
    download(`khaanapeena-tables-${slug(range)}.csv`, out)
  }

  if (!dine.length) {
    return <Card><Empty icon="🪑" text={`No dine-in bills in ${range.label.toLowerCase()} — table performance needs settled dine-in orders.`} /></Card>
  }

  const best = [...rows].sort((a, b) => b.rev - a.rev)[0]

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Dine-in revenue" value={inr0(dineRev)} sub={`${dine.length} parties`} icon="🍽️" accent="saffron" />
        <StatCard label="Typical seat-time" value={dur(medTat)} sub="opened → bill settled" icon="⏱️" accent="blue" />
        <StatCard label="Best table" value={best?.name || '—'} sub={best ? `${inr0(best.rev)} · ${best.bills} parties` : ''} icon="🏆" accent="green" />
        <StatCard label="₹ per seat" value={inr0(totalSeats ? dineRev / totalSeats : 0)} sub={`${totalSeats} seats · ${range.label}`} icon="💺" accent="purple" />
        <StatCard label="Tables never used" value={idle.length} sub={idle.length ? idle.slice(0, 3).map((t) => t.name).join(', ') : 'all earning ✓'} icon="🈳" accent={idle.length ? 'red' : 'green'} />
      </div>

      {flatTat && (
        <Note tone="blue">
          Every seat-time here is identical because these are <b>demo orders</b> — the sample data is generated with a fixed 45-minute lifetime. Real bills you settle yourself will show true variation.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" flush title="Section performance" sub="Which part of the room earns its floor space">
          <DataTable
            rows={areas}
            keyOf={(a) => a.area}
            cols={[
              { h: 'Section', cell: (a) => <div><span className="font-semibold">{a.area}</span><div className="text-[11px] text-stone-400">{a.tables} tables · {a.seats} seats</div></div>, foot: () => 'All' },
              { h: 'Parties', num: true, cell: (a) => a.bills, foot: () => dine.length },
              { h: 'Revenue', num: true, cell: (a) => <b>{inr0(a.rev)}</b>, foot: () => inr0(dineRev) },
              { h: '₹/seat', num: true, cell: (a) => inr0(a.perSeat), foot: () => inr0(totalSeats ? dineRev / totalSeats : 0) },
              { h: 'Seat-time', num: true, cell: (a) => dur(a.tat) },
            ]}
          />
        </Card>
        <Card className="!mb-0" title="Revenue by table" sub="Top earners">
          <HBars data={used.sort((a, b) => b.rev - a.rev).slice(0, 10).map((r) => ({ label: `${r.name} (${r.area})`, value: Math.round(r.rev) }))} />
        </Card>
      </div>

      <Card flush title="Table-by-table" sub="Seat-time is the median — one forgotten bill won't skew it">
        <DataTable
          scroll
          rows={[...rows].sort((a, b) => b.rev - a.rev)}
          keyOf={(r) => r.id}
          cols={[
            { h: 'Table', cell: (r) => <div><span className="font-semibold text-ink-900">{r.name}</span><div className="text-[11px] text-stone-400">{r.area} · {r.seats} seats</div></div>, foot: () => 'Total' },
            { h: 'Parties', num: true, cell: (r) => r.bills || <span className="text-stone-300">0</span>, foot: () => dine.length },
            { h: 'Revenue', num: true, cell: (r) => r.rev ? <b>{inr0(r.rev)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(dineRev) },
            { h: 'Avg bill', num: true, cell: (r) => r.bills ? inr0(r.avg) : <span className="text-stone-300">—</span>, foot: () => inr0(dine.length ? dineRev / dine.length : 0) },
            { h: 'Seat-time', num: true, cell: (r) => r.tat == null ? <span className="text-stone-300">—</span> : <Badge color={r.tat > 90 ? 'red' : r.tat > 60 ? 'amber' : 'green'}>{dur(r.tat)}</Badge> },
            { h: '₹/seat', num: true, cell: (r) => r.seats ? inr0(r.perSeat) : <span className="text-stone-300">—</span> },
            { h: 'Turns/day', num: true, cell: (r) => r.turnsPerDay.toFixed(1) },
          ]}
        />
      </Card>

      <p className="text-[11px] text-stone-400">
        Seat-time counts from the moment the order is opened on the POS to the moment the bill is settled. A table that shows a long seat-time and a low bill is where you're losing turns.
      </p>
    </>
  )
}
