import React, { useMemo } from 'react'
import { StatCard, Badge } from '../components.jsx'
import { Bars, HBars } from '../charts.jsx'
import { inr0, bucketize, paidFromLabel } from '../utils.js'
import { Card, DataTable, ExportBtn, download, paidIn, slug, pct, amt, spanDays, earliestOf } from './shared.jsx'

// Everything paid out that isn't stock. Purchases (GRNs) are the other half of the
// money going out and live on their own tab — keeping them apart is what stops the
// P&L double-counting the same rupee.
export default function ExpensesReport({ state, range }) {
  const rows = useMemo(
    () => (state.expenses || [])
      .filter((e) => e.at >= range.from && e.at < range.to)
      .sort((a, b) => b.at - a.at),
    [state.expenses, range]
  )

  const total = rows.reduce((s, e) => s + e.amount, 0)
  const days = spanDays(range, earliestOf(rows, (e) => e.at))
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const sales = paid.reduce((s, o) => s + amt(o), 0)

  const byReason = useMemo(() => {
    const m = {}
    rows.forEach((e) => {
      const r = (m[e.reason] = m[e.reason] || { reason: e.reason, count: 0, value: 0 })
      r.count++; r.value += e.amount
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const bySource = useMemo(() => {
    const m = {}
    rows.forEach((e) => {
      const k = e.paidFrom || 'cash'
      const r = (m[k] = m[k] || { key: k, count: 0, value: 0 })
      r.count++; r.value += e.amount
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const byStaff = useMemo(() => {
    const m = {}
    rows.filter((e) => e.staffName).forEach((e) => {
      const r = (m[e.staffName] = m[e.staffName] || { name: e.staffName, count: 0, value: 0 })
      r.count++; r.value += e.amount
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const trend = useMemo(
    () => bucketize(rows.map((e) => ({ ts: e.at, value: e.amount })), range),
    [rows, range]
  )

  const exportCsv = () => {
    const out = [['EXPENSES — ' + range.label], [],
      ['Total ₹', Math.round(total)], ['Entries', rows.length], ['Per day ₹', Math.round(total / days)],
      ['As % of sales', pct(total, sales)],
      [], ['BY HEAD'], ['Reason', 'Entries', 'Amount ₹', 'Share %']]
    byReason.forEach((r) => out.push([r.reason, r.count, Math.round(r.value), pct(r.value, total)]))
    out.push([], ['BY SOURCE'], ['Paid from', 'Entries', 'Amount ₹'])
    bySource.forEach((r) => out.push([paidFromLabel(r.key), r.count, Math.round(r.value)]))
    if (byStaff.length) {
      out.push([], ['BY EMPLOYEE'], ['Employee', 'Entries', 'Amount ₹'])
      byStaff.forEach((r) => out.push([r.name, r.count, Math.round(r.value)]))
    }
    out.push([], ['ALL ENTRIES'], ['Date', 'Time', 'Reason', 'Explanation', 'Employee', 'Paid from', 'Entered by', 'Amount ₹'])
    ;[...rows].reverse().forEach((e) => out.push([
      e.date, new Date(e.at).toLocaleTimeString('en-IN'), e.reason, e.note || '', e.staffName || '',
      paidFromLabel(e.paidFrom), e.by || '', Math.round(e.amount),
    ]))
    download(`khaanapeena-expenses-${slug(range)}.csv`, out)
  }

  if (!rows.length) {
    return (
      <Card title="💸 Expenses" sub={`Nothing booked in ${range.label.toLowerCase()}`}>
        <p className="text-sm text-stone-600 max-w-2xl leading-relaxed">
          Book what you pay out — rent, salaries, gas, the ₹200 handed to the cook for vegetables — on the
          <b> Expenses</b> screen. It takes cash expenses off what the register expects in the drawer, and turns
          <b> Profit &amp; loss</b> from an estimate into a real number.
        </p>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total spent" value={inr0(total)} sub={`${rows.length} entries · ${range.label}`} icon="💸" accent="saffron" />
        <StatCard label="Per day" value={inr0(total / days)} sub={`over ${days.toFixed(0)} days`} icon="📅" accent="blue" />
        <StatCard label="As % of sales" value={sales ? pct(total, sales) + '%' : '—'} sub={sales ? `on ${inr0(sales)} of sales` : 'no sales in range'} icon="⚖️" accent={pct(total, sales) > 30 ? 'red' : 'green'} />
        <StatCard label="Biggest head" value={byReason[0]?.reason || '—'} sub={byReason[0] ? inr0(byReason[0].value) : ''} icon="🔝" accent="purple" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0 kp-card" flush title="Where the money went" sub="Grouped by head">
          <DataTable
            rows={byReason}
            keyOf={(r) => r.reason}
            cols={[
              { h: 'Head', cell: (r) => <span className="font-semibold">{r.reason}</span>, foot: () => 'Total' },
              { h: 'Entries', num: true, cell: (r) => r.count, foot: () => rows.length },
              { h: 'Amount', num: true, cell: (r) => <b>{inr0(r.value)}</b>, foot: () => inr0(total) },
              { h: 'Share', num: true, cell: (r) => pct(r.value, total) + '%', foot: () => '100%' },
            ]}
          />
        </Card>
        <Card className="!mb-0 kp-card" title="Biggest heads" sub="Ranked by rupees">
          <HBars data={byReason.slice(0, 8).map((r) => ({ label: r.reason, value: Math.round(r.value) }))} color="#dc2626" />
        </Card>
      </div>

      <Card className="kp-card" title="Spending over time" sub={`₹ per ${range.bucket === 'hour' ? 'hour' : range.bucket === 'week' ? 'week' : 'day'}`}>
        <Bars data={trend} color="#dc2626" />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0 kp-card" flush title="Paid from" sub="Cash expenses come out of the till drawer">
          <DataTable
            rows={bySource}
            keyOf={(r) => r.key}
            cols={[
              { h: 'Source', cell: (r) => <Badge color={r.key === 'cash' ? 'red' : 'blue'}>{paidFromLabel(r.key)}</Badge>, foot: () => 'Total' },
              { h: 'Entries', num: true, cell: (r) => r.count, foot: () => rows.length },
              { h: 'Amount', num: true, cell: (r) => <b>{inr0(r.value)}</b>, foot: () => inr0(total) },
            ]}
          />
        </Card>
        <Card className="!mb-0 kp-card" flush title="Handled by" sub="Who the money was given to or spent by">
          <DataTable
            rows={byStaff}
            keyOf={(r) => r.name}
            empty="No employee tagged on any expense"
            cols={[
              { h: 'Employee', cell: (r) => <span className="font-semibold">{r.name}</span> },
              { h: 'Entries', num: true, cell: (r) => r.count },
              { h: 'Amount', num: true, cell: (r) => <b>{inr0(r.value)}</b> },
            ]}
          />
        </Card>
      </div>

      <Card flush className="kp-card" title="Every expense" sub={range.label}>
        <DataTable
          scroll
          rows={rows}
          keyOf={(e) => e.id}
          cols={[
            { h: 'Date', cell: (e) => <div><div className="font-semibold">{new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div><div className="text-[11px] text-stone-400">{new Date(e.at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div></div>, foot: () => `${rows.length} entries` },
            { h: 'Head', cell: (e) => <span className="font-semibold text-ink-900">{e.reason}</span> },
            { h: 'Explanation', cell: (e) => <span className="text-stone-600">{e.note || <span className="text-stone-300">—</span>}</span> },
            { h: 'Employee', cell: (e) => e.staffName || <span className="text-stone-300">—</span> },
            { h: 'Paid from', cell: (e) => <Badge color={e.paidFrom === 'cash' ? 'red' : 'blue'}>{paidFromLabel(e.paidFrom)}</Badge> },
            { h: 'Entered by', cell: (e) => <span className="text-stone-500 text-xs">{e.by}</span> },
            { h: 'Amount', num: true, cell: (e) => <b>{inr0(e.amount)}</b>, foot: () => inr0(total) },
          ]}
        />
      </Card>
    </>
  )
}
