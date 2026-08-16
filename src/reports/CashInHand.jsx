import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { inr0, fmtTime, paidFromLabel } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug } from './shared.jsx'

/**
 * The cash leg of a settled bill.
 *
 * A guest who pays ₹800 of a ₹2,000 bill in notes and the rest by UPI records the
 * split, and reading only `payment.method` would either count all ₹2,000 as cash or
 * none of it. Bills with no split fall back to the single method, and — as everywhere
 * else in the till — a bill with no method recorded at all is treated as cash.
 */
const cashOf = (o) => {
  const splits = o.payment?.splits
  if (Array.isArray(splits) && splits.length) {
    return splits.filter((s) => s.method === 'cash').reduce((sum, s) => sum + (+s.amount || 0), 0)
  }
  return (o.payment?.method || 'cash') === 'cash' ? (o.payment?.amount || 0) : 0
}

// what a udhaar bill still owes, so a part-refunded credit bill doesn't collect twice
const dueOf = (o) => (o.payment?.amount || 0) - (o.refund?.amount || 0)

// Local calendar day, NOT toISOString() — a ₹500 note taken at 00:30 belongs to the
// night it was taken, and UTC would file it against the day before.
const dayOf = (ts) => {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const dayLabel = (k) => new Date(k + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })

// inr0 puts the minus after the ₹ ("₹-800"), which reads as a typo on a cash sheet
const signed = (v) => (v < 0 ? '−' + inr0(-v) : inr0(v))

const BLANK = () => ({ float: 0, floats: 0, sales: 0, udhaar: 0, topUp: 0, expense: 0, refund: 0, withdraw: 0 })
const netOf = (d) => d.float + d.sales + d.udhaar + d.topUp - d.expense - d.refund - d.withdraw

/**
 * Cash in hand — what should physically be in the drawer, built up from every leg
 * that moves notes rather than from the sales total alone.
 *
 * Cash sales are the easy half. The half that makes a till read short at closing
 * time is everything else: the vegetable money taken out at 4pm, the refund handed
 * back in notes, the udhaar a regular finally paid off. All of it is in the
 * waterfall, in the order it actually happens.
 */
export default function CashInHand({ state, range }) {
  const inRange = (ts) => ts != null && ts >= range.from && ts < range.to
  const settings = state.settings

  const paid = useMemo(() => paidIn(state, range), [state.orders, range])

  const cashBills = useMemo(() => paid.map((o) => ({ o, cash: cashOf(o) })).filter((r) => r.cash > 0), [paid])

  // udhaar that came back in notes — recorded against the collection date, not the
  // original bill date, because that's the day the money entered the drawer
  const udhaarCash = useMemo(
    () => (state.orders || []).filter((o) => o.creditPaid && (o.creditPaid.method || 'cash') === 'cash' && inRange(o.creditPaid.at)),
    [state.orders, range]
  )

  const cashExpenses = useMemo(
    () => (state.expenses || []).filter((e) => e.paidFrom === 'cash' && inRange(e.at)),
    [state.expenses, range]
  )

  const cashRefunds = useMemo(
    () => (state.orders || []).filter((o) => o.refund && (o.refund.method || 'cash') === 'cash' && inRange(o.refund.at)),
    [state.orders, range]
  )

  const shifts = useMemo(
    () => (state.shifts || []).slice().sort((a, b) => a.openedAt - b.openedAt),
    [state.shifts]
  )
  const shiftsInRange = shifts.filter((sh) => inRange(sh.openedAt))
  const movements = useMemo(
    () => shifts.flatMap((sh) => (sh.cashMovements || []).map((m) => ({ ...m, at: m.at || sh.openedAt, shift: sh })))
      .filter((m) => inRange(m.at)),
    [shifts, range]
  )
  const topUps = movements.filter((m) => m.type === 'in')
  const withdrawals = movements.filter((m) => m.type === 'out')

  const sum = (list, pick) => list.reduce((s, x) => s + (pick(x) || 0), 0)

  // The first float in the window is the cash the period started with. Every later
  // shift re-declares a float out of money that is already counted here, so adding
  // those in would count the same notes twice — the day-wise table below is where
  // each day's own float belongs.
  const openingFloat = shiftsInRange.length ? (shiftsInRange[0].openingFloat || 0) : 0

  const legs = {
    float: openingFloat,
    sales: sum(cashBills, (r) => r.cash),
    udhaar: sum(udhaarCash, dueOf),
    topUp: sum(topUps, (m) => m.amount),
    expense: sum(cashExpenses, (e) => e.amount),
    refund: sum(cashRefunds, (o) => o.refund.amount),
    withdraw: sum(withdrawals, (m) => m.amount),
  }
  const expected = netOf({ ...legs, floats: 0 })

  const waterfall = [
    { k: 'float', sign: 1, label: '🏦 Opening float', sub: shiftsInRange.length ? `register opened ${new Date(shiftsInRange[0].openedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'no register was opened in this period', v: legs.float, n: shiftsInRange.length ? 1 : 0 },
    { k: 'sales', sign: 1, label: '💵 Cash sales', sub: 'notes taken over the counter, including the cash half of split bills', v: legs.sales, n: cashBills.length },
    { k: 'udhaar', sign: 1, label: '📒 Udhaar collected in cash', sub: 'old credit bills paid off in notes', v: legs.udhaar, n: udhaarCash.length },
    { k: 'topUp', sign: 1, label: '📥 Cash added to the till', sub: 'change brought in, owner top-ups', v: legs.topUp, n: topUps.length },
    { k: 'expense', sign: -1, label: '💸 Expenses paid in cash', sub: 'sabzi, gas, wages — paid straight out of the drawer', v: legs.expense, n: cashExpenses.length },
    { k: 'refund', sign: -1, label: '↩️ Refunds handed back in cash', sub: 'money returned to guests', v: legs.refund, n: cashRefunds.length },
    { k: 'withdraw', sign: -1, label: '📤 Cash taken out of the till', sub: 'banked, or moved to the owner', v: legs.withdraw, n: withdrawals.length },
  ]

  // ---- day-wise ----
  const daily = useMemo(() => {
    const m = {}
    const at = (ts) => (m[dayOf(ts)] = m[dayOf(ts)] || { key: dayOf(ts), ...BLANK() })
    shiftsInRange.forEach((sh) => { const d = at(sh.openedAt); d.float += sh.openingFloat || 0; d.floats++ })
    cashBills.forEach((r) => { at(r.o.paidAt).sales += r.cash })
    udhaarCash.forEach((o) => { at(o.creditPaid.at).udhaar += dueOf(o) })
    topUps.forEach((mv) => { at(mv.at).topUp += mv.amount || 0 })
    cashExpenses.forEach((e) => { at(e.at).expense += e.amount || 0 })
    cashRefunds.forEach((o) => { at(o.refund.at).refund += o.refund.amount || 0 })
    withdrawals.forEach((mv) => { at(mv.at).withdraw += mv.amount || 0 })
    return Object.values(m).map((d) => {
      // a shift closed on this day carries the only figure nobody can argue with:
      // what was physically counted
      const closed = shifts.filter((sh) => sh.z && inRange(sh.closedAt) && dayOf(sh.closedAt) === d.key)
      const counted = closed.length ? closed.reduce((s, sh) => s + (sh.z.countedCash || 0), 0) : null
      return { ...d, expected: netOf(d), counted, closed }
    }).sort((a, b) => (a.key < b.key ? 1 : -1))
  }, [shiftsInRange, cashBills, udhaarCash, topUps, cashExpenses, cashRefunds, withdrawals, shifts])

  // ---- right now ----
  const openShift = shifts.find((sh) => sh.status === 'open' || (!sh.closedAt && sh.openedAt))
  const lastClosed = [...shifts].reverse().find((sh) => sh.closedAt && sh.z)
  const since = openShift ? openShift.openedAt : (lastClosed ? lastClosed.closedAt : null)
  const nowLegs = useMemo(() => {
    if (since == null) return null
    const after = (ts) => ts != null && ts >= since
    return {
      base: openShift ? (openShift.openingFloat || 0) : (lastClosed.z.countedCash || 0),
      sales: (state.orders || []).filter((o) => o.status === 'paid' && after(o.paidAt)).reduce((s, o) => s + cashOf(o), 0),
      udhaar: (state.orders || []).filter((o) => o.creditPaid && (o.creditPaid.method || 'cash') === 'cash' && after(o.creditPaid.at)).reduce((s, o) => s + dueOf(o), 0),
      topUp: ((openShift || lastClosed).cashMovements || []).filter((m) => m.type === 'in' && after(m.at || 0)).reduce((s, m) => s + (m.amount || 0), 0),
      expense: (state.expenses || []).filter((e) => e.paidFrom === 'cash' && after(e.at)).reduce((s, e) => s + (e.amount || 0), 0),
      refund: (state.orders || []).filter((o) => o.refund && (o.refund.method || 'cash') === 'cash' && after(o.refund.at)).reduce((s, o) => s + (o.refund.amount || 0), 0),
      withdraw: ((openShift || lastClosed).cashMovements || []).filter((m) => m.type === 'out' && after(m.at || 0)).reduce((s, m) => s + (m.amount || 0), 0),
    }
  }, [since, openShift, lastClosed, state.orders, state.expenses])
  const nowCash = nowLegs ? nowLegs.base + nowLegs.sales + nowLegs.udhaar + nowLegs.topUp - nowLegs.expense - nowLegs.refund - nowLegs.withdraw : null

  const closedShifts = shifts.filter((sh) => sh.z && inRange(sh.closedAt))
  const variance = closedShifts.reduce((s, sh) => s + ((sh.z.countedCash || 0) - (sh.z.expectedCash || 0)), 0)

  const exportCsv = () => {
    const out = [['CASH IN HAND — ' + range.label], [],
      ['CASH WATERFALL'], ['Movement', 'Entries', 'In ₹', 'Out ₹']]
    waterfall.forEach((w) => out.push([w.label, w.n, w.sign > 0 ? Math.round(w.v) : '', w.sign < 0 ? Math.round(w.v) : '']))
    out.push(['Cash that should be in hand ₹', '', Math.round(expected), ''])
    if (nowCash != null) {
      out.push([], ['RIGHT NOW'],
        [openShift ? 'Register open since' : 'Register last closed', new Date(since).toLocaleString('en-IN')],
        [openShift ? 'Opening float ₹' : 'Counted at close ₹', Math.round(nowLegs.base)],
        ['Cash sales since ₹', Math.round(nowLegs.sales)],
        ['Udhaar collected in cash since ₹', Math.round(nowLegs.udhaar)],
        ['Cash added since ₹', Math.round(nowLegs.topUp)],
        ['Cash expenses since ₹', Math.round(nowLegs.expense)],
        ['Cash refunds since ₹', Math.round(nowLegs.refund)],
        ['Cash withdrawn since ₹', Math.round(nowLegs.withdraw)],
        ['Should be in the drawer now ₹', Math.round(nowCash)])
    }
    out.push([], ['DAY BY DAY'],
      ['Date', 'Opening float ₹', 'Cash sales ₹', 'Udhaar in cash ₹', 'Cash added ₹', 'Cash expenses ₹', 'Cash refunds ₹', 'Cash withdrawn ₹', 'Expected in hand ₹', 'Counted ₹', 'Over / short ₹'])
    daily.forEach((d) => out.push([
      dayLabel(d.key), Math.round(d.float), Math.round(d.sales), Math.round(d.udhaar), Math.round(d.topUp),
      Math.round(d.expense), Math.round(d.refund), Math.round(d.withdraw), Math.round(d.expected),
      d.counted == null ? '—' : Math.round(d.counted),
      d.counted == null ? '—' : Math.round(d.counted - d.expected),
    ]))
    if (closedShifts.length) {
      out.push([], ['REGISTER CLOSINGS — counted vs expected, as the register recorded it'],
        ['Opened', 'By', 'Closed', 'By', 'Opening float ₹', 'Cash sales ₹', 'Expected ₹', 'Counted ₹', 'Over / short ₹'])
      closedShifts.forEach((sh) => out.push([
        new Date(sh.openedAt).toLocaleString('en-IN'), sh.openedBy || '',
        new Date(sh.closedAt).toLocaleString('en-IN'), sh.closedBy || '',
        Math.round(sh.openingFloat || 0), Math.round(sh.z.cash || 0),
        Math.round(sh.z.expectedCash || 0), Math.round(sh.z.countedCash || 0),
        Math.round((sh.z.countedCash || 0) - (sh.z.expectedCash || 0)),
      ]))
    }
    if (cashExpenses.length) {
      out.push([], ['CASH PAID OUT'], ['Date', 'Head', 'Explanation', 'Employee', 'Amount ₹', 'Entered by'])
      cashExpenses.forEach((e) => out.push([
        new Date(e.at).toLocaleString('en-IN'), e.reason, e.note || '', e.staffName || '', Math.round(e.amount), e.by || '',
      ]))
    }
    if (movements.length) {
      out.push([], ['TILL MOVEMENTS'], ['When', 'In / Out', 'Amount ₹', 'Reason', 'By'])
      movements.forEach((m) => out.push([
        new Date(m.at).toLocaleString('en-IN'), m.type === 'in' ? 'IN' : 'OUT', Math.round(m.amount || 0), m.reason || '', m.by || '',
      ]))
    }
    download(`khaanapeena-cash-in-hand-${slug(range)}.csv`, out)
  }

  const nothing = !cashBills.length && !udhaarCash.length && !movements.length && !cashExpenses.length && !cashRefunds.length && !shiftsInRange.length
  if (nothing) {
    return (
      <Card className="kp-card" title="💰 Cash in hand" sub={`No cash moved in ${range.label.toLowerCase()}`}>
        <div className="text-sm text-stone-600 leading-relaxed max-w-2xl space-y-2">
          <p>Nothing in this period was settled in cash, and no register was opened — so there is no drawer to reconcile.</p>
          <p>
            Open the <b>Cash Register</b> with the notes you start the day with, and this report follows the money all the way through:
            cash sales, udhaar collected in notes, money taken out for sabzi, refunds handed back, and what should be left at closing time.
          </p>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label={openShift ? 'In the drawer right now' : 'Cash in hand'}
          value={nowCash == null ? '—' : inr0(nowCash)}
          sub={openShift ? `register open since ${fmtTime(since)}` : lastClosed ? `counted ${inr0(lastClosed.z.countedCash || 0)} at close, plus movements since` : 'no register recorded'}
          icon="💰" accent={nowCash == null ? 'stone' : 'saffron'}
        />
        <StatCard label="Cash taken in" value={inr0(legs.sales + legs.udhaar)} sub={`${cashBills.length} cash bill${cashBills.length === 1 ? '' : 's'}${udhaarCash.length ? ` · ${udhaarCash.length} udhaar` : ''}`} icon="💵" accent="green" />
        <StatCard label="Cash paid out" value={inr0(legs.expense + legs.refund + legs.withdraw)} sub={`${cashExpenses.length} expense${cashExpenses.length === 1 ? '' : 's'}, ${withdrawals.length} withdrawal${withdrawals.length === 1 ? '' : 's'}`} icon="📤" accent="red" />
        <StatCard
          label="Counted vs expected"
          value={closedShifts.length ? (variance === 0 ? '✓ Tallies' : (variance > 0 ? '+' : '') + inr0(variance)) : '—'}
          sub={closedShifts.length ? `over ${closedShifts.length} register closing${closedShifts.length === 1 ? '' : 's'}` : 'no register closed in this period'}
          icon="⚖️" accent={!closedShifts.length ? 'stone' : variance === 0 ? 'green' : variance > 0 ? 'blue' : 'red'}
        />
      </div>

      {/* WATERFALL — the whole point of the report: money in, money out, in order */}
      <Card
        className="kp-card"
        title="Where the cash went"
        sub={`Every movement of notes in ${range.label.toLowerCase()}, in the order it happens on a normal day`}
      >
        <div className="space-y-1">
          {waterfall.map((w) => (
            <div key={w.k} className="flex items-center gap-3 py-2 border-b border-stone-50">
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-sm text-ink-900">{w.label}</div>
                <div className="text-[11px] text-stone-400">{w.sub}</div>
              </div>
              <div className="text-[11px] text-stone-400 tabular-nums w-20 text-right shrink-0">
                {w.n ? `${w.n} entr${w.n === 1 ? 'y' : 'ies'}` : ''}
              </div>
              <div className={`font-bold tabular-nums w-28 text-right shrink-0 ${w.v === 0 ? 'text-stone-300' : w.sign > 0 ? 'text-leaf-600' : 'text-red-600'}`}>
                {w.v === 0 ? '—' : (w.sign > 0 ? '+' : '−') + inr0(w.v)}
              </div>
            </div>
          ))}
          <div className="flex items-center gap-3 pt-3">
            <div className="flex-1 font-black text-ink-900">Cash that should be in hand</div>
            <div className={`text-2xl font-black tabular-nums ${expected < 0 ? 'text-red-600' : 'text-ink-900'}`}>{signed(expected)}</div>
          </div>
          {expected < 0 && (
            <p className="text-xs text-red-600 mt-2">
              This comes out negative because more cash was paid out than the drawer was recorded as holding — usually a shift that was never opened with its float,
              or an expense booked as cash that was really paid from the bank.
            </p>
          )}
        </div>
      </Card>

      {shiftsInRange.length > 1 && (
        <Note tone="blue">
          {shiftsInRange.length} register shifts were opened in this period. Only the <b>first</b> opening float is counted in the waterfall above —
          every later float is declared out of money that is already in these figures, so adding them would count the same notes twice.
          Each day's own float is shown in the day-by-day table.
        </Note>
      )}

      {!shiftsInRange.length && (
        <Note>
          No cash register was opened in this period, so there is no opening float to start from — the waterfall shows the movement of cash only,
          not the balance in the drawer. Open the register at the start of a shift with the notes you have on hand and the totals become absolute.
        </Note>
      )}

      <Card
        flush
        className="kp-card"
        title="Day by day"
        sub="Each day stands on its own — its float, its takings, its payouts, and what was actually counted at closing"
      >
        <DataTable
          scroll
          rows={daily}
          keyOf={(d) => d.key}
          cols={[
            { h: 'Date', cell: (d) => <span className="font-semibold text-ink-900">{dayLabel(d.key)}</span>, foot: () => 'Total' },
            { h: 'Float', num: true, cell: (d) => d.float ? inr0(d.float) : <span className="text-stone-300">—</span>, foot: () => inr0(daily.reduce((s, d) => s + d.float, 0)) },
            { h: '💵 Cash sales', num: true, cell: (d) => d.sales ? <b>{inr0(d.sales)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(legs.sales) },
            { h: '📒 Udhaar', num: true, cell: (d) => d.udhaar ? inr0(d.udhaar) : <span className="text-stone-300">—</span>, foot: () => inr0(legs.udhaar) },
            { h: '📥 Added', num: true, cell: (d) => d.topUp ? <span className="text-leaf-600">{inr0(d.topUp)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(legs.topUp) },
            { h: '💸 Expenses', num: true, cell: (d) => d.expense ? <span className="text-red-600">−{inr0(d.expense)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(legs.expense) },
            { h: '↩️ Refunds', num: true, cell: (d) => d.refund ? <span className="text-red-600">−{inr0(d.refund)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(legs.refund) },
            { h: '📤 Taken out', num: true, cell: (d) => d.withdraw ? <span className="text-red-600">−{inr0(d.withdraw)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(legs.withdraw) },
            { h: 'Expected', num: true, cell: (d) => <b className={d.expected < 0 ? 'text-red-600' : ''}>{signed(d.expected)}</b> },
            { h: 'Counted', num: true, cell: (d) => d.counted == null ? <span className="text-stone-300">—</span> : inr0(d.counted) },
            { h: 'Over / short', num: true, cell: (d) => {
              if (d.counted == null) return <span className="text-stone-300">—</span>
              const v = Math.round(d.counted - d.expected)
              return <Badge color={v === 0 ? 'green' : v > 0 ? 'blue' : 'red'}>{v === 0 ? '✓' : (v > 0 ? '+' : '−') + inr0(Math.abs(v))}</Badge>
            } },
          ]}
        />
        <div className="px-4 pb-4 pt-2 text-[11px] text-stone-400">
          “Counted” only appears on days a register was closed — on every other day there is no physical count to compare against, so it reads <b>—</b> rather than zero.
        </div>
      </Card>

      {closedShifts.length > 0 && (
        <Card
          flush
          className="kp-card"
          title="⚖️ Register closings"
          sub="Counted against expected, exactly as the register recorded it at the time. This is the till's own arithmetic — the day-by-day table above adds udhaar collections, which the register doesn't track."
        >
          <DataTable
            rows={closedShifts}
            keyOf={(sh) => sh.id}
            cols={[
              { h: 'Shift', cell: (sh) => (
                <div>
                  <span className="font-semibold">{new Date(sh.openedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · {fmtTime(sh.openedAt)}–{fmtTime(sh.closedAt)}</span>
                  <div className="text-[11px] text-stone-400">opened by {sh.openedBy || '—'} · closed by {sh.closedBy || '—'}</div>
                </div>
              ), foot: () => 'Total' },
              { h: 'Float', num: true, cell: (sh) => inr0(sh.openingFloat || 0) },
              { h: 'Cash sales', num: true, cell: (sh) => inr0(sh.z.cash || 0), foot: () => inr0(closedShifts.reduce((s, sh) => s + (sh.z.cash || 0), 0)) },
              { h: 'Expected', num: true, cell: (sh) => inr0(sh.z.expectedCash || 0), foot: () => inr0(closedShifts.reduce((s, sh) => s + (sh.z.expectedCash || 0), 0)) },
              { h: 'Counted', num: true, cell: (sh) => <b>{inr0(sh.z.countedCash || 0)}</b>, foot: () => inr0(closedShifts.reduce((s, sh) => s + (sh.z.countedCash || 0), 0)) },
              { h: 'Over / short', num: true, cell: (sh) => {
                const v = Math.round((sh.z.countedCash || 0) - (sh.z.expectedCash || 0))
                return <Badge color={v === 0 ? 'green' : v > 0 ? 'blue' : 'red'}>{v === 0 ? '✓ tallies' : (v > 0 ? '+' : '') + inr0(v)}</Badge>
              }, foot: () => (variance > 0 ? '+' : '') + inr0(variance) },
            ]}
          />
        </Card>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="!mb-0 kp-card" flush title="💸 Cash paid out of the drawer" sub="Every expense settled in notes — the usual reason a till reads short">
          <DataTable
            scroll
            rows={[...cashExpenses].sort((a, b) => b.at - a.at)}
            keyOf={(e) => e.id}
            empty="Nothing paid out in cash"
            cols={[
              { h: 'Head', cell: (e) => (
                <div>
                  <span className="font-semibold">{e.reason}</span>
                  {(e.note || e.staffName) && <div className="text-[11px] text-stone-400">{[e.staffName, e.note].filter(Boolean).join(' · ')}</div>}
                </div>
              ), foot: () => 'Total' },
              { h: 'When', cell: (e) => <span className="text-xs text-stone-500">{new Date(e.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {fmtTime(e.at)}</span> },
              { h: 'By', cell: (e) => <span className="text-xs text-stone-500">{e.by || '—'}</span> },
              { h: 'Amount', num: true, cell: (e) => <b className="text-red-600">−{inr0(e.amount)}</b>, foot: () => inr0(legs.expense) },
            ]}
          />
        </Card>
        <Card className="!mb-0 kp-card" flush title="📥📤 Till movements" sub="Cash put into or taken out of the drawer outside of sales">
          <DataTable
            scroll
            rows={[...movements].sort((a, b) => b.at - a.at)}
            keyOf={(m) => m.id}
            empty="No cash added or removed"
            cols={[
              { h: 'Reason', cell: (m) => (
                <div>
                  <span className="font-semibold">{m.reason || (m.type === 'in' ? 'Cash added' : 'Cash removed')}</span>
                  <div className="text-[11px] text-stone-400">{new Date(m.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {fmtTime(m.at)} · {m.by || '—'}</div>
                </div>
              ), foot: () => 'Net' },
              { h: 'Direction', cell: (m) => <Badge color={m.type === 'in' ? 'green' : 'red'}>{m.type === 'in' ? 'IN' : 'OUT'}</Badge> },
              { h: 'Amount', num: true, cell: (m) => (
                <b className={m.type === 'in' ? 'text-leaf-600' : 'text-red-600'}>{m.type === 'in' ? '+' : '−'}{inr0(m.amount || 0)}</b>
              ), foot: () => signed(legs.topUp - legs.withdraw) },
            ]}
          />
        </Card>
      </div>

      {(state.expenses || []).some((e) => inRange(e.at) && e.paidFrom !== 'cash') && (
        <p className="text-[11px] text-stone-400">
          Expenses paid from anywhere other than the drawer ({[...new Set((state.expenses || []).filter((e) => inRange(e.at) && e.paidFrom !== 'cash').map((e) => paidFromLabel(e.paidFrom)))].join(', ')})
          are deliberately left out — they never touched the notes in hand. They are all in the <b>Expenses</b> report.
          {settings.gstScheme === 'composition' ? ' Cash figures are what the guest actually handed over, composition levy included.' : ''}
        </p>
      )}

      {!cashBills.length && paid.length > 0 && (
        <Note tone="blue">
          Not one of the {paid.length} bills in this period was settled in cash — everything came through UPI, card or online.
          The figures above are float and payouts only.
        </Note>
      )}

      {!daily.length && <Empty icon="💰" text="Nothing to show day by day" />}
    </>
  )
}
