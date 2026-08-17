import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Bars } from '../charts.jsx'
import { inr0, tableName, fmtTime } from '../utils.js'
import { Card, DataTable, Exports, Note, paidIn, slug, pct, amt, mins, median, dur, channelOf, channelLabel } from './shared.jsx'

const hourLabel = (h) => `${(h % 12) || 12}${h < 12 ? 'a' : 'p'}`
const hourSpan = (h) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}–${((h + 1) % 12) || 12}${(h + 1) % 24 < 12 ? 'am' : 'pm'}`

// A gap is only usable if both ends exist and the result is sane. Clock drift and
// half-migrated records can produce negatives or three-day spans; those are bad
// data, not slow service, and must be dropped rather than averaged in.
const gapOf = (from, to) => {
  if (!from || !to) return null
  const m = mins(to - from)
  return m >= 0 && m < 1440 ? m : null
}

// Local calendar day, NOT toISOString() — a bill settled at 00:20 belongs to the
// night it was settled, and UTC would roll it back onto the day before.
const dayOf = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Bill timing: when a table's order opened, when the kitchen was told, when the
 * bill was printed, and when the money finally arrived.
 *
 * The number an owner is really asking for is the middle-to-last gap — printed to
 * settled. A bill that sits printed on a table for twenty minutes is a table that
 * can't be turned, and a long tail of them is either a payment bottleneck at the
 * till or a bill nobody chased.
 */
export default function Timing({ state, range }) {
  const paid = useMemo(() => paidIn(state, range).sort((a, b) => b.paidAt - a.paidAt), [state.orders, range])

  const rows = useMemo(() => paid.map((o) => ({
    o,
    createdAt: o.createdAt || null,
    kotAt: o.kotAt || null,
    printedAt: o.printedAt || null,
    paidAt: o.paidAt,
    kitchen: gapOf(o.kotAt, o.readyAt),
    lag: gapOf(o.printedAt, o.paidAt),
    seat: gapOf(o.createdAt, o.paidAt),
  })), [paid])

  const withPrint = rows.filter((r) => r.lag != null)
  const medLag = median(withPrint.map((r) => r.lag))
  const medKitchen = median(rows.map((r) => r.kitchen).filter((v) => v != null))
  const medSeat = median(rows.map((r) => r.seat).filter((v) => v != null))
  const printCoverage = rows.length ? withPrint.length / rows.length : 0
  const slowest = [...withPrint].sort((a, b) => b.lag - a.lag).slice(0, 10)

  // print → settle by hour of the print, so a slow hour points at a slow shift
  const hours = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, bills: 0, lags: [] }))
    rows.forEach((r) => {
      const x = h[new Date(r.paidAt).getHours()]
      x.bills++
      if (r.lag != null) x.lags.push(r.lag)
    })
    return h.map((x) => ({ ...x, med: median(x.lags), timed: x.lags.length }))
  }, [rows])
  const firstActive = hours.findIndex((h) => h.bills > 0)
  const lastActive = 23 - [...hours].reverse().findIndex((h) => h.bills > 0)
  const activeHours = firstActive === -1 ? [] : hours.slice(firstActive, lastActive + 1)

  // day-wise roll-up — the owner's "daily / selected period / weekly" ask, answered
  // by letting the shared range pick the window and then splitting it back by day
  const days = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const k = dayOf(r.paidAt)
      const d = (m[k] = m[k] || { key: k, bills: 0, rev: 0, lags: [], seats: [], longest: null })
      d.bills++
      d.rev += amt(r.o)
      if (r.lag != null) {
        d.lags.push(r.lag)
        if (!d.longest || r.lag > d.longest.lag) d.longest = r
      }
      if (r.seat != null) d.seats.push(r.seat)
    })
    return Object.values(m)
      .map((d) => ({ ...d, med: median(d.lags), medSeat: median(d.seats) }))
      .sort((a, b) => (a.key < b.key ? 1 : -1))
  }, [rows])

  const stamp = (ts) => (ts ? fmtTime(ts) : null)

  const buildRows = () => {
    const out = [['BILL TIMING — ' + range.label], [],
      ['Bills settled', rows.length],
      ['Bills with a print time', withPrint.length],
      ['Median print → settle (min)', medLag == null ? '—' : medLag.toFixed(1)],
      ['Median kitchen time KOT → ready (min)', medKitchen == null ? '—' : medKitchen.toFixed(1)],
      ['Median table time opened → settled (min)', medSeat == null ? '—' : medSeat.toFixed(1)],
      [], ['DAY-WISE'], ['Date', 'Bills', 'Revenue ₹', 'Bills timed', 'Median print → settle (min)', 'Longest print → settle (min)', 'Longest bill no', 'Median table time (min)']]
    days.forEach((d) => out.push([
      new Date(d.key + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }),
      d.bills, Math.round(d.rev), d.lags.length,
      d.med == null ? '—' : d.med.toFixed(1),
      d.longest ? d.longest.lag.toFixed(1) : '—',
      d.longest ? d.longest.o.billNo : '—',
      d.medSeat == null ? '—' : d.medSeat.toFixed(1),
    ]))
    out.push([], ['BY HOUR SETTLED'], ['Hour', 'Bills', 'Bills timed', 'Median print → settle (min)'])
    hours.filter((h) => h.bills).forEach((h) => out.push([hourSpan(h.hour), h.bills, h.timed, h.med == null ? '—' : h.med.toFixed(1)]))
    out.push([], ['EVERY BILL'],
      ['Bill No', 'Table', 'Type', 'Order opened', 'KOT fired', 'Bill printed', 'Bill settled',
        'Kitchen time KOT → ready (min)', 'Print → settle (min)', 'Total table time (min)', 'Amount ₹', 'Settled by'])
    rows.forEach((r) => out.push([
      r.o.billNo,
      r.o.tableId ? tableName(state.tables, r.o.tableId) : '—',
      channelLabel(channelOf(r.o)),
      r.createdAt ? new Date(r.createdAt).toLocaleString('en-IN') : '—',
      r.kotAt ? new Date(r.kotAt).toLocaleString('en-IN') : '—',
      r.printedAt ? new Date(r.printedAt).toLocaleString('en-IN') : '—',
      new Date(r.paidAt).toLocaleString('en-IN'),
      r.kitchen == null ? '—' : r.kitchen.toFixed(1),
      r.lag == null ? '—' : r.lag.toFixed(1),
      r.seat == null ? '—' : r.seat.toFixed(1),
      Math.round(amt(r.o)), r.o.settledBy || '',
    ]))
    return out
  }

  if (!rows.length) {
    return <Card className="kp-card"><Empty icon="⏱️" text={`No bills settled in ${range.label.toLowerCase()} — timing needs settled bills.`} /></Card>
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint">
        <Exports
          build={buildRows}
          name={`khaanapeena-bill-timing-${slug(range)}`}
          title="Bill timing"
          period={range.label}
          settings={state.settings}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Bills settled" value={rows.length} sub={range.label} icon="🧾" accent="saffron" />
        <StatCard label="Print → settle" value={medLag == null ? '—' : dur(medLag)} sub={medLag == null ? 'no print times yet' : `median of ${withPrint.length} bills`} icon="⏱️" accent={medLag == null ? 'stone' : medLag > 10 ? 'red' : 'green'} />
        <StatCard label="Slowest bill" value={slowest[0] ? dur(slowest[0].lag) : '—'} sub={slowest[0] ? `#${slowest[0].o.billNo}` : 'nothing timed'} icon="🐢" accent={slowest[0] && slowest[0].lag > 30 ? 'red' : 'blue'} />
        <StatCard label="Kitchen time" value={dur(medKitchen)} sub="KOT fired → marked ready" icon="🔥" accent="purple" />
        <StatCard label="Table time" value={dur(medSeat)} sub="order opened → bill settled" icon="🪑" accent="blue" />
      </div>

      {printCoverage < 1 && (
        <Note>
          {withPrint.length === 0
            ? <>None of these bills recorded <b>when the bill was printed</b>.</>
            : <>{rows.length - withPrint.length} of {rows.length} bills ({100 - Math.round(printCoverage * 100)}%) have no print time.</>}{' '}
          KhaanaPeena only started stamping the print moment recently, so bills settled before that show <b>—</b> in the “Bill printed” column
          and are left out of the print → settle figures rather than counted as instant. Bills printed from now on all carry it.
        </Note>
      )}

      <Card className="kp-card" flush title="Day by day" sub="The same window, split back into days — this is the daily / weekly roll-up">
        <DataTable
          rows={days}
          keyOf={(d) => d.key}
          cols={[
            { h: 'Date', cell: (d) => (
              <div>
                <span className="font-semibold text-ink-900">{new Date(d.key + 'T12:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</span>
                <div className="text-[11px] text-stone-400">{new Date(d.key + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long' })}</div>
              </div>
            ), foot: () => `${days.length} day${days.length === 1 ? '' : 's'}` },
            { h: 'Bills', num: true, cell: (d) => d.bills, foot: () => rows.length },
            { h: 'Revenue', num: true, cell: (d) => inr0(d.rev), foot: () => inr0(rows.reduce((s, r) => s + amt(r.o), 0)) },
            { h: 'Timed', num: true, cell: (d) => d.lags.length ? `${d.lags.length}/${d.bills}` : <span className="text-stone-300">—</span>, foot: () => `${withPrint.length}/${rows.length}` },
            { h: 'Median print → settle', num: true, cell: (d) => d.med == null
              ? <span className="text-stone-300">—</span>
              : <Badge color={d.med > 15 ? 'red' : d.med > 7 ? 'amber' : 'green'}>{dur(d.med)}</Badge>, foot: () => medLag == null ? '—' : dur(medLag) },
            { h: 'Longest', num: true, cell: (d) => d.longest
              ? <span title={`bill #${d.longest.o.billNo}`}>{dur(d.longest.lag)}</span>
              : <span className="text-stone-300">—</span> },
            { h: 'Table time', num: true, cell: (d) => dur(d.medSeat) },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0 kp-card" title="Print → settle by hour" sub={medLag == null ? 'Needs print times before this can be plotted' : 'How long a printed bill waits, by the hour it was settled'}>
          {activeHours.some((h) => h.med != null)
            ? <Bars
                data={activeHours.map((h) => ({ label: hourLabel(h.hour), value: h.med == null ? 0 : Math.round(h.med) }))}
                color="#9333ea"
                fmt={(v) => dur(v)}
                labelEvery={activeHours.length > 12 ? 2 : 1}
              />
            : <Empty icon="🖨️" text="No printed-bill times recorded yet" />}
        </Card>
        <Card className="!mb-0 kp-card" flush title="Slowest bills to settle" sub="Printed and then left sitting — each one is a table you couldn't turn">
          <DataTable
            rows={slowest}
            keyOf={(r) => r.o.id}
            empty="Nothing timed yet"
            cols={[
              { h: 'Bill', cell: (r) => <div><span className="font-black">#{r.o.billNo}</span><div className="text-[11px] text-stone-400">{r.o.tableId ? `🪑 ${tableName(state.tables, r.o.tableId)}` : channelLabel(channelOf(r.o))}</div></div> },
              { h: 'Printed', cell: (r) => <span className="tabular-nums text-xs">{stamp(r.printedAt)}</span> },
              { h: 'Settled', cell: (r) => <span className="tabular-nums text-xs">{stamp(r.paidAt)}</span> },
              { h: 'Waited', num: true, cell: (r) => <Badge color="red">{dur(r.lag)}</Badge> },
              { h: 'Amount', num: true, cell: (r) => <b>{inr0(amt(r.o))}</b> },
            ]}
          />
        </Card>
      </div>

      <Card
        flush
        className="kp-card"
        title="Every bill, timestamp by timestamp"
        sub="Newest first. Four clocks per bill and the three gaps between them."
      >
        <DataTable
          scroll
          rows={rows}
          keyOf={(r) => r.o.id}
          cols={[
            { h: 'Bill', cell: (r) => (
              <div>
                <span className="font-black">#{r.o.billNo}</span>
                <div className="text-[11px] text-stone-400">{r.o.tableId ? `🪑 ${tableName(state.tables, r.o.tableId)}` : channelLabel(channelOf(r.o))}</div>
              </div>
            ), foot: () => `${rows.length} bills` },
            { h: 'Order opened', cell: (r) => stamp(r.createdAt) || <span className="text-stone-300">—</span> },
            { h: 'KOT fired', cell: (r) => stamp(r.kotAt) || <span className="text-stone-300">—</span> },
            { h: 'Bill printed', cell: (r) => stamp(r.printedAt) || <span className="text-stone-300">—</span> },
            { h: 'Bill settled', cell: (r) => <b className="tabular-nums">{stamp(r.paidAt)}</b> },
            { h: 'Kitchen', num: true, cell: (r) => r.kitchen == null ? <span className="text-stone-300">—</span> : dur(r.kitchen) },
            { h: 'Print → settle', num: true, cell: (r) => r.lag == null
              ? <span className="text-stone-300">—</span>
              : <Badge color={r.lag > 15 ? 'red' : r.lag > 7 ? 'amber' : 'green'}>{dur(r.lag)}</Badge>, foot: () => medLag == null ? '—' : `med ${dur(medLag)}` },
            { h: 'Table time', num: true, cell: (r) => r.seat == null ? <span className="text-stone-300">—</span> : dur(r.seat) },
            { h: 'Amount', num: true, cell: (r) => inr0(amt(r.o)), foot: () => inr0(rows.reduce((s, x) => s + amt(x.o), 0)) },
          ]}
        />
      </Card>

      <p className="text-[11px] text-stone-400">
        Kitchen time is KOT fired → marked ready on the kitchen screen. Print → settle is bill printed → money taken. Table time is order opened → bill settled.
        Medians, not averages — one forgotten bill shouldn't decide what “normal” looks like.
        {pct(withPrint.length, rows.length) < 100 && ` Only bills carrying a print stamp (${withPrint.length} of ${rows.length}) count towards the print → settle figures.`}
      </p>
    </>
  )
}
