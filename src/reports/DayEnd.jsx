import React, { useMemo, useState } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Donut, Bars } from '../charts.jsx'
import { inr0, billTotals, todayISO, dayKey, fmtTime, tableName, paidFromLabel } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, pct, amt, channelOf, channelLabel, coversOf, isAggregator, mins, dur } from './shared.jsx'

const hourLabel = (h) => `${(h % 12) || 12}${h < 12 ? 'a' : 'p'}`
const hourSpan = (h) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}–${((h + 1) % 12) || 12}${(h + 1) % 24 < 12 ? 'am' : 'pm'}`

// Close-of-day MASTER: everything an owner checks before locking up, on one page.
// Deliberately ignores the page-level range — a day-end is always ONE day.
export default function DayEnd({ state }) {
  const [day, setDay] = useState(todayISO())

  const from = new Date(day + 'T00:00:00').getTime()
  const to = from + 864e5

  const paid = useMemo(
    () => (state.orders || []).filter((o) => o.status === 'paid' && o.paidAt >= from && o.paidAt < to).sort((a, b) => a.paidAt - b.paidAt),
    [state.orders, from, to]
  )

  const gross = paid.reduce((s, o) => s + amt(o), 0)
  const discount = paid.reduce((s, o) => s + (o.payment?.discount || 0), 0)
  const comp = state.settings.gstScheme === 'composition'

  // GST is reckoned on own-channel bills only: Sec 9(5) puts Zomato/Swiggy sales on
  // the aggregator's return, so counting them here would overstate what you owe.
  const own = useMemo(() => paid.filter((o) => !isAggregator(o)), [paid])
  const ecoBills = paid.filter(isAggregator)
  const ecoGross = ecoBills.reduce((s, o) => s + amt(o), 0)
  const gst = useMemo(() => own.reduce((a, o) => {
    const bt = billTotals(o, state.settings)
    a.sub += bt.sub; a.discount += bt.discount; a.taxable += bt.taxable
    a.svc += bt.svc; a.roundOff += bt.roundOff
    // the invoice value is rebuilt from the parts so the column adds up, and what
    // was actually taken is tracked separately — on a bill settled under different
    // settings the two can differ, and hiding that would be a fudged tax sheet
    a.invoice += comp ? Math.round(bt.taxable + bt.svc) : bt.total
    a.collected += amt(o)
    if (!comp) { a.cgst += bt.cgst; a.sgst += bt.sgst }
    return a
  }, { sub: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, svc: 0, roundOff: 0, invoice: 0, collected: 0 }), [own, state.settings, comp])
  const tax = gst.cgst + gst.sgst
  const taxable = gst.taxable

  // Payment-type split in the same shape a Petpooja "Order Summary" prints, so an
  // owner switching over can reconcile line for line.
  const modes = [['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card'], ['online', '🛵 Online orders'], ['credit', '📒 Due (udhaar)']]
    .map(([k, label]) => {
      const os = paid.filter((o) => (o.payment?.method || 'cash') === k)
      return { k, label, bills: os.length, amount: os.reduce((s, o) => s + amt(o), 0) }
    })

  // ---- order status, Petpooja's five buckets ----
  const inDay = (ts) => ts >= from && ts < to
  const openOrders = (state.orders || []).filter((o) => ['open', 'kot', 'ready', 'served'].includes(o.status) && inDay(o.createdAt))
  // an order kept as `cancelled` only because it was merged into another table's bill
  // isn't a cancellation — the food went out and it was paid for under the other number
  const cancelledOrders = (state.orders || []).filter((o) => o.status === 'cancelled' && !o.mergedInto && inDay(o.kotAt || o.createdAt))
  const compBills = paid.filter((o) => {
    const bt = billTotals(o, state.settings)
    return o.payment?.discountReason === 'comp' || (bt.discount >= bt.sub && bt.sub > 0)
  })
  const returned = paid.filter((o) => o.refund && inDay(o.refund.at))
  const refundValue = returned.reduce((s, o) => s + o.refund.amount, 0)

  const lineValue = (o) => (o.items || []).reduce((s, li) => s + li.price * li.qty, 0)
  const statusRows = [
    { k: 'open', label: 'Still open (not billed)', orders: openOrders.length, my: openOrders.reduce((s, o) => s + lineValue(o), 0), total: 0 },
    { k: 'billed', label: 'Billed & settled', orders: paid.length, my: paid.reduce((s, o) => s + billTotals(o, state.settings).taxable, 0), total: gross },
    { k: 'cancelled', label: 'Cancelled', orders: cancelledOrders.length, my: cancelledOrders.reduce((s, o) => s + lineValue(o), 0), total: 0 },
    { k: 'comp', label: 'Complimentary (free)', orders: compBills.length, my: compBills.reduce((s, o) => s + billTotals(o, state.settings).sub, 0), total: compBills.reduce((s, o) => s + amt(o), 0) },
    { k: 'return', label: 'Sales return (refunded)', orders: returned.length, my: refundValue, total: refundValue },
  ]

  // ---- cash movements in and out on this day ----
  const dayExpenses = (state.expenses || []).filter((e) => inDay(e.at))
  const expenseTotal = dayExpenses.reduce((s, e) => s + e.amount, 0)
  const cashExpense = dayExpenses.filter((e) => e.paidFrom === 'cash').reduce((s, e) => s + e.amount, 0)
  const movements = (state.shifts || []).flatMap((sh) => (sh.cashMovements || []).filter((m) => inDay(m.at || sh.openedAt)).map((m) => ({ ...m, shift: sh })))
  const topUps = movements.filter((m) => m.type === 'in')
  const withdrawals = movements.filter((m) => m.type === 'out')

  const types = useMemo(() => {
    const m = {}
    paid.forEach((o) => {
      const k = channelOf(o)
      const t = (m[k] = m[k] || { k, bills: 0, rev: 0 })
      t.bills++; t.rev += amt(o)
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }, [paid])

  const topItems = useMemo(() => {
    const m = {}
    paid.forEach((o) => (o.items || []).forEach((li) => {
      const a = (m[li.name] = m[li.name] || { name: li.name, qty: 0, rev: 0 })
      a.qty += li.qty; a.rev += li.price * li.qty
    }))
    return Object.values(m).sort((a, b) => b.qty - a.qty).slice(0, 8)
  }, [paid])

  const voids = (state.voidLog || []).filter((v) => v.at >= from && v.at < to)
  const cancels = cancelledOrders

  // any register shift that closed on this day carries the counted-cash truth
  const shifts = (state.shifts || []).filter((sh) => (sh.closedAt && sh.closedAt >= from && sh.closedAt < to) || (sh.openedAt >= from && sh.openedAt < to))

  const firstBill = paid[0]
  const lastBill = paid[paid.length - 1]

  // Per-guest money comes only from bills that recorded a head count. Dividing the
  // whole day's takings by a partial guest count would invent a spend per guest.
  const countedBills = paid.filter((o) => coversOf(o) > 0)
  const guests = countedBills.reduce((s, o) => s + coversOf(o), 0)
  const guestRev = countedBills.reduce((s, o) => s + amt(o), 0)
  const perGuest = guests ? guestRev / guests : null
  const partySize = countedBills.length ? guests / countedBills.length : null

  // ---- hour by hour ----
  const hourly = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, bills: 0, rev: 0, guests: 0 }))
    paid.forEach((o) => { const x = h[new Date(o.paidAt).getHours()]; x.bills++; x.rev += amt(o); x.guests += coversOf(o) })
    return h
  }, [paid])
  const firstHour = hourly.findIndex((h) => h.bills > 0)
  const lastHour = 23 - [...hourly].reverse().findIndex((h) => h.bills > 0)
  const activeHours = firstHour === -1 ? [] : hourly.slice(firstHour, lastHour + 1)
  const peakHour = [...hourly].sort((a, b) => b.rev - a.rev)[0]

  // ---- category-wise ----
  const catName = (id) => (state.categories || []).find((c) => c.id === id)?.name || 'Uncategorised'
  const byCat = useMemo(() => {
    const m = {}
    paid.forEach((o) => (o.items || []).forEach((li) => {
      const it = (state.items || []).find((i) => i.id === li.itemId)
      const k = it?.catId || '__none'
      const c = (m[k] = m[k] || { k, name: it ? catName(it.catId) : 'Uncategorised', qty: 0, rev: 0, dishes: new Set() })
      c.qty += li.qty; c.rev += li.price * li.qty; c.dishes.add(li.name)
    }))
    return Object.values(m).map((c) => ({ ...c, dishCount: c.dishes.size })).sort((a, b) => b.rev - a.rev)
  }, [paid, state.items, state.categories])
  const catTotal = byCat.reduce((s, c) => s + c.rev, 0)

  // ---- staff / waiter-wise ----
  const byStaff = useMemo(() => {
    const m = {}
    const person = (n) => (m[n] = m[n] || { name: n, bills: 0, rev: 0, discount: 0, orders: 0, covers: 0 })
    paid.forEach((o) => {
      if (!o.settledBy) return
      const p = person(o.settledBy)
      p.bills++; p.rev += amt(o); p.discount += o.payment?.discount || 0
    })
    ;(state.orders || []).forEach((o) => {
      const w = o.waiterName || o.takenBy
      if (!w || !inDay(o.createdAt)) return
      const p = person(w)
      p.orders++; p.covers += coversOf(o)
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }, [paid, state.orders, from, to])
  const unsigned = paid.length - paid.filter((o) => o.settledBy).length

  // ---- udhaar given and collected today ----
  const udhaarGiven = paid.filter((o) => o.payment?.method === 'credit')
  const udhaarGivenValue = udhaarGiven.reduce((s, o) => s + amt(o), 0)
  const udhaarCollected = (state.orders || []).filter((o) => o.creditPaid && inDay(o.creditPaid.at))
  const udhaarCollectedValue = udhaarCollected.reduce((s, o) => s + ((o.payment?.amount || 0) - (o.refund?.amount || 0)), 0)

  // ---- cancellations, with the print clock beside the delete clock ----
  const voidRows = voids.map((v) => {
    const o = (state.orders || []).find((x) => x.id === v.orderId)
    const printedAt = v.printedAt || o?.printedAt || null
    return {
      ...v,
      printedAt,
      gap: printedAt ? mins(v.at - printedAt) : null,
      billNo: v.billNo ?? o?.billNo ?? null,
    }
  })
  const voidValue = voidRows.reduce((s, v) => s + (v.amount || 0), 0)
  const afterPrint = voidRows.filter((v) => v.gap != null && v.gap >= 0)

  // ---- opening / closing cash ----
  const closedShifts = shifts.filter((sh) => sh.z && sh.closedAt)
  const openingCash = shifts.reduce((s, sh) => s + (sh.openingFloat || 0), 0)
  const closingCash = closedShifts.length ? closedShifts.reduce((s, sh) => s + (sh.z.countedCash || 0), 0) : null

  const exportCsv = () => {
    const out = [['DAY-END SUMMARY'], ['Date', new Date(from).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], [],
      ['Total collected ₹', Math.round(gross)],
      ['Bills', paid.length],
      ['Guests served', guests || '—'],
      ['Bills that recorded a guest count', `${countedBills.length} of ${paid.length}`],
      ['Spend per guest ₹', perGuest == null ? '—' : Math.round(perGuest)],
      ['Average party size', partySize == null ? '—' : partySize.toFixed(1)],
      ['Average bill ₹', paid.length ? Math.round(gross / paid.length) : 0],
      ['Discounts given ₹', Math.round(discount)],
      ['Taxable value ₹', Math.round(taxable)],
      [comp ? 'GST (composition — not collected) ₹' : 'GST collected ₹', Math.round(tax)],
      ['First bill', firstBill ? new Date(firstBill.paidAt).toLocaleTimeString('en-IN') : '—'],
      ['Last bill', lastBill ? new Date(lastBill.paidAt).toLocaleTimeString('en-IN') : '—'],
      ['Busiest hour', peakHour && peakHour.bills ? hourSpan(peakHour.hour) : '—'],
      ['Opening cash ₹', shifts.length ? Math.round(openingCash) : '—'],
      ['Closing cash counted ₹', closingCash == null ? '—' : Math.round(closingCash)],
      [], ['ORDER STATUS'], ['Status', 'Orders', 'Before tax ₹', 'Total ₹']]
    statusRows.forEach((r) => out.push([r.label, r.orders, Math.round(r.my), Math.round(r.total)]))
    out.push([], ['PAYMENT MODES'], ['Mode', 'Bills', 'Amount ₹'])
    modes.forEach((m) => out.push([m.label, m.bills, Math.round(m.amount)]))
    out.push([], ['MONEY OUT'],
      ['Expenses booked ₹', Math.round(expenseTotal)],
      ['  of which cash ₹', Math.round(cashExpense)],
      ['Refunds paid back ₹', Math.round(refundValue)],
      ['Cash withdrawn from till ₹', Math.round(withdrawals.reduce((s, m) => s + (m.amount || 0), 0))],
      ['Cash added to till ₹', Math.round(topUps.reduce((s, m) => s + (m.amount || 0), 0))])
    if (dayExpenses.length) {
      out.push([], ['EXPENSE DETAIL'], ['Time', 'Head', 'Explanation', 'Employee', 'Paid from', 'Entered by', 'Amount ₹'])
      dayExpenses.forEach((e) => out.push([
        new Date(e.at).toLocaleTimeString('en-IN'), e.reason, e.note || '', e.staffName || '',
        paidFromLabel(e.paidFrom), e.by || '', Math.round(e.amount),
      ]))
    }
    out.push([], ['ORDER TYPES'], ['Type', 'Bills', 'Revenue ₹'])
    types.forEach((t) => out.push([channelLabel(t.k), t.bills, Math.round(t.rev)]))

    out.push([], ['HOUR BY HOUR'], ['Hour', 'Bills', 'Guests', 'Revenue ₹', 'Avg bill ₹', 'Share of day %'])
    hourly.filter((h) => h.bills).forEach((h) => out.push([
      hourSpan(h.hour), h.bills, h.guests || '—', Math.round(h.rev), Math.round(h.rev / h.bills), pct(h.rev, gross),
    ]))

    out.push([], ['CATEGORY-WISE SALES'], ['Category', 'Dishes sold', 'Plates', 'Value before tax ₹', 'Share %'])
    byCat.forEach((c) => out.push([c.name, c.dishCount, c.qty, Math.round(c.rev), pct(c.rev, catTotal)]))

    out.push([], ['STAFF-WISE'], ['Staff', 'Bills settled', 'Collected ₹', 'Avg bill ₹', 'Discounts given ₹', 'Orders taken', 'Guests served'])
    byStaff.forEach((p) => out.push([
      p.name, p.bills, Math.round(p.rev), p.bills ? Math.round(p.rev / p.bills) : '—',
      Math.round(p.discount), p.orders, p.covers || '—',
    ]))
    if (unsigned) out.push([`${unsigned} bill(s) carry no staff name`, ''])

    out.push([], [comp ? 'COMPOSITION LEVY SUMMARY' : 'GST SUMMARY', '(own channels only — Sec 9(5) puts aggregator sales on their return)'],
      ['Gross sale value before discount ₹', Math.round(gst.sub)],
      ['Less discount ₹', Math.round(gst.discount)],
      ['Taxable value ₹', Math.round(gst.taxable)],
      ['CGST ₹', Math.round(gst.cgst)],
      ['SGST ₹', Math.round(gst.sgst)],
      ['Service charge ₹', Math.round(gst.svc)],
      ['Round off ₹', Math.round(gst.roundOff)],
      ['Invoice value ₹', Math.round(gst.invoice)],
      ['Actually collected ₹', Math.round(gst.collected)],
      ['Own-channel bills', own.length],
      ['Aggregator bills (GST paid by aggregator)', ecoBills.length],
      ['Aggregator sales ₹', Math.round(ecoGross)])

    out.push([], ['UDHAAR (CREDIT)'],
      ['Given today ₹', Math.round(udhaarGivenValue)], ['Bills given on credit', udhaarGiven.length],
      ['Collected today ₹', Math.round(udhaarCollectedValue)], ['Old bills collected', udhaarCollected.length])
    if (udhaarGiven.length) {
      out.push([], ['UDHAAR GIVEN TODAY'], ['Bill No', 'Time', 'Customer', 'Table', 'Amount ₹'])
      udhaarGiven.forEach((o) => out.push([
        o.billNo, new Date(o.paidAt).toLocaleTimeString('en-IN'),
        (state.customers || []).find((c) => c.id === o.customerId)?.name || 'Unknown',
        o.tableId ? tableName(state.tables, o.tableId) : '—', Math.round(amt(o)),
      ]))
    }
    if (udhaarCollected.length) {
      out.push([], ['UDHAAR COLLECTED TODAY'], ['Bill No', 'Bill date', 'Customer', 'Collected via', 'By', 'Amount ₹'])
      udhaarCollected.forEach((o) => out.push([
        o.billNo, new Date(o.paidAt).toLocaleDateString('en-IN'),
        (state.customers || []).find((c) => c.id === o.customerId)?.name || 'Unknown',
        String(o.creditPaid.method || '').toUpperCase(), o.creditPaid.by || '',
        Math.round((o.payment?.amount || 0) - (o.refund?.amount || 0)),
      ]))
    }

    if (returned.length) {
      out.push([], ['REFUNDS'], ['Bill No', 'Refunded at', 'Reason', 'Bill ₹', 'Refunded ₹', 'Full?', 'Back via', 'By'])
      returned.forEach((o) => out.push([
        o.billNo, new Date(o.refund.at).toLocaleTimeString('en-IN'), o.refund.reason || '',
        Math.round(amt(o)), Math.round(o.refund.amount), o.refund.full ? 'YES' : '',
        String(o.refund.method || '').toUpperCase(), o.refund.by || '',
      ]))
    }

    out.push([], ['TOP ITEMS'], ['Item', 'Plates', 'Revenue ₹'])
    topItems.forEach((i) => out.push([i.name, i.qty, Math.round(i.rev)]))
    if (voidRows.length) {
      out.push([], ['ITEM CANCELLATIONS'], ['Item', 'Qty', 'Value ₹', 'Bill No', 'Table', 'Bill printed', 'Item deleted', 'Gap (min)', 'Authorised by'])
      voidRows.forEach((v) => out.push([
        v.item, v.qty, Math.round(v.amount || 0),
        v.billNo == null ? '—' : v.billNo,
        v.tableId ? tableName(state.tables, v.tableId) : '—',
        v.printedAt ? new Date(v.printedAt).toLocaleTimeString('en-IN') : '—',
        new Date(v.at).toLocaleTimeString('en-IN'),
        v.gap == null ? '—' : v.gap.toFixed(1), v.by,
      ]))
    }
    shifts.forEach((sh) => {
      if (!sh.z) return
      out.push([], ['CASH DRAWER — shift closed ' + new Date(sh.closedAt).toLocaleTimeString('en-IN')],
        ['Opening float ₹', sh.openingFloat || 0],
        ['Cash sales ₹', Math.round(sh.z.cash || 0)],
        ['Expected in drawer ₹', Math.round(sh.z.expectedCash || 0)],
        ['Counted ₹', Math.round(sh.z.countedCash || 0)],
        ['Over / short ₹', Math.round((sh.z.countedCash || 0) - (sh.z.expectedCash || 0))])
    })
    download(`khaanapeena-day-end-${day}.csv`, out)
  }

  const shift = (d) => setDay(dayKey(new Date(day + 'T12:00:00').getTime() + d * 864e5))

  return (
    <>
      <Card className="!mb-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button onClick={() => shift(-1)} className="w-9 h-9 rounded-xl border border-stone-200 hover:bg-stone-50 font-bold">←</button>
            <input type="date" value={day} max={todayISO()} onChange={(e) => setDay(e.target.value)} className="border border-stone-200 rounded-xl px-3 py-2 text-sm" />
            <button onClick={() => shift(1)} disabled={day >= todayISO()} className="w-9 h-9 rounded-xl border border-stone-200 hover:bg-stone-50 font-bold disabled:opacity-30">→</button>
            <button onClick={() => setDay(todayISO())} className="text-xs font-bold text-saffron-700 px-2">Today</button>
          </div>
          <div className="text-sm text-stone-500">
            {new Date(from).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <ExportBtn onClick={exportCsv} label="⬇️ Export day-end" />
        </div>
      </Card>

      {!paid.length ? (
        <Card><Empty icon="🌙" text="No bills settled on this day." /></Card>
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-4">
            <StatCard label="Collected" value={inr0(gross)} sub={`${paid.length} bills`} icon="💰" accent="saffron" />
            <StatCard label="Guests served" value={guests || '—'} sub={perGuest == null ? 'guest count not entered' : `${inr0(perGuest)} per guest · party of ${partySize.toFixed(1)}`} icon="👥" accent={guests ? 'green' : 'stone'} />
            <StatCard label="Average bill" value={inr0(gross / paid.length)} icon="📊" accent="purple" />
            <StatCard label="Discounts" value={inr0(discount)} sub={`${pct(discount, gross + discount)}% of sales`} icon="🏷️" accent={discount > gross * 0.1 ? 'red' : 'green'} />
            <StatCard label={comp ? 'Taxable turnover' : 'GST collected'} value={inr0(comp ? taxable : tax)} sub={comp ? 'composition levy base' : 'CGST + SGST · own channels'} icon="🧾" accent="blue" />
            <StatCard label="Trading window" value={firstBill ? `${fmtTime(firstBill.paidAt)}–${fmtTime(lastBill.paidAt)}` : '—'} sub={peakHour && peakHour.bills ? `busiest ${hourSpan(peakHour.hour)}` : 'first → last bill'} icon="🕐" accent="green" />
          </div>

          {/* HOURLY STRIP — where the day's money actually arrived */}
          <Card className="kp-card" flush title="Hour by hour" sub="Every bill settled today, on one clock">
            <div className="px-5 pb-5">
              {activeHours.length
                ? <Bars data={activeHours.map((h) => ({ label: hourLabel(h.hour), value: Math.round(h.rev) }))} height={110} labelEvery={activeHours.length > 12 ? 2 : 1} />
                : <Empty text="No bills to plot" />}
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-stone-400">
                {activeHours.filter((h) => h.bills).map((h) => (
                  <span key={h.hour}><b className="text-stone-600">{hourLabel(h.hour)}</b> {h.bills} bill{h.bills === 1 ? '' : 's'} · {inr0(h.rev)}</span>
                ))}
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <Card className="!mb-0" flush title="Money in, by mode" sub="Match this against your drawer and phone">
              <DataTable
                rows={modes}
                keyOf={(m) => m.k}
                cols={[
                  { h: 'Mode', cell: (m) => <span className="font-semibold">{m.label}</span>, foot: () => 'Total' },
                  { h: 'Bills', num: true, cell: (m) => m.bills, foot: () => paid.length },
                  { h: 'Amount', num: true, cell: (m) => <b>{inr0(m.amount)}</b>, foot: () => inr0(gross) },
                ]}
              />
            </Card>
            <Card className="!mb-0" title="Split" sub="Share of the day's money">
              <Donut data={modes.filter((m) => m.amount > 0).map((m) => ({ label: m.label.replace(/^\S+\s/, ''), value: m.amount }))} />
            </Card>
            <Card className="!mb-0" flush title="Where it came from">
              <DataTable
                rows={types}
                keyOf={(t) => t.k}
                cols={[
                  { h: 'Type', cell: (t) => <span className="text-xs font-semibold">{channelLabel(t.k)}</span> },
                  { h: 'Bills', num: true, cell: (t) => t.bills },
                  { h: 'Revenue', num: true, cell: (t) => <b>{inr0(t.rev)}</b> },
                ]}
              />
            </Card>
          </div>

          {/* ORDER STATUS — the block a Petpooja Order Summary opens with */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="Order status" sub="Every order that touched today, by what happened to it">
              <DataTable
                rows={statusRows}
                keyOf={(r) => r.k}
                cols={[
                  { h: 'Status', cell: (r) => <span className="font-semibold">{r.label}</span> },
                  { h: 'Orders', num: true, cell: (r) => r.orders || <span className="text-stone-300">0</span> },
                  { h: 'Before tax', num: true, cell: (r) => r.my ? inr0(r.my) : <span className="text-stone-300">—</span> },
                  { h: 'Total', num: true, cell: (r) => r.total ? <b>{inr0(r.total)}</b> : <span className="text-stone-300">—</span> },
                ]}
              />
            </Card>
            <Card className="!mb-0 kp-card" flush title="Money out today" sub="Expenses, refunds and cash taken from the drawer">
              <DataTable
                rows={[
                  { k: 'exp', label: '💸 Expenses booked', n: dayExpenses.length, v: expenseTotal },
                  { k: 'expcash', label: '　of which paid in cash', n: dayExpenses.filter((e) => e.paidFrom === 'cash').length, v: cashExpense },
                  { k: 'ref', label: '↩️ Refunds paid back', n: returned.length, v: refundValue },
                  { k: 'wd', label: '📤 Cash withdrawn from till', n: withdrawals.length, v: withdrawals.reduce((s, m) => s + (m.amount || 0), 0) },
                  { k: 'tu', label: '📥 Cash added to till', n: topUps.length, v: topUps.reduce((s, m) => s + (m.amount || 0), 0) },
                ]}
                keyOf={(r) => r.k}
                cols={[
                  { h: 'What', cell: (r) => <span className={r.k === 'expcash' ? 'text-stone-500 text-xs' : 'font-semibold'}>{r.label}</span> },
                  { h: 'Entries', num: true, cell: (r) => r.n || <span className="text-stone-300">0</span> },
                  { h: 'Amount', num: true, cell: (r) => r.v ? <b className={r.k === 'tu' ? 'text-leaf-600' : 'text-red-600'}>{inr0(r.v)}</b> : <span className="text-stone-300">—</span> },
                ]}
              />
              {dayExpenses.length > 0 && (
                <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                  {[...new Set(dayExpenses.map((e) => e.reason))].slice(0, 6).join(' · ')}
                </div>
              )}
            </Card>
          </div>

          {/* CATEGORY & STAFF — what sold, and who sold it */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="Category-wise sales" sub="Before tax and before discount — kitchen sections, not invoice totals">
              <DataTable
                rows={byCat}
                keyOf={(c) => c.k}
                empty="No items on today's bills"
                cols={[
                  { h: 'Category', cell: (c) => <div><span className="font-semibold">{c.name}</span><div className="text-[11px] text-stone-400">{c.dishCount} dish{c.dishCount === 1 ? '' : 'es'}</div></div>, foot: () => 'Total' },
                  { h: 'Plates', num: true, cell: (c) => c.qty, foot: () => byCat.reduce((s, c) => s + c.qty, 0) },
                  { h: 'Value', num: true, cell: (c) => <b>{inr0(c.rev)}</b>, foot: () => inr0(catTotal) },
                  { h: 'Share', num: true, cell: (c) => pct(c.rev, catTotal) + '%', foot: () => '100%' },
                ]}
              />
            </Card>
            <Card className="!mb-0 kp-card" flush title="Staff-wise" sub="Money settled under each name, and the tables they looked after">
              <DataTable
                rows={byStaff}
                keyOf={(p) => p.name}
                empty="No bill or order carries a staff name today"
                cols={[
                  { h: 'Staff', cell: (p) => <span className="font-semibold text-ink-900">{p.name}</span>, foot: () => 'Total' },
                  { h: 'Bills', num: true, cell: (p) => p.bills || <span className="text-stone-300">—</span>, foot: () => byStaff.reduce((s, p) => s + p.bills, 0) },
                  { h: 'Collected', num: true, cell: (p) => p.rev ? <b>{inr0(p.rev)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(byStaff.reduce((s, p) => s + p.rev, 0)) },
                  { h: 'Avg bill', num: true, cell: (p) => p.bills ? inr0(p.rev / p.bills) : <span className="text-stone-300">—</span> },
                  { h: 'Orders', num: true, cell: (p) => p.orders || <span className="text-stone-300">—</span>, foot: () => byStaff.reduce((s, p) => s + p.orders, 0) },
                  { h: 'Guests', num: true, cell: (p) => p.covers || <span className="text-stone-300">—</span>, foot: () => byStaff.reduce((s, p) => s + p.covers, 0) || '—' },
                  { h: 'Discounts', num: true, cell: (p) => p.discount ? <span className="text-red-600">{inr0(p.discount)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(byStaff.reduce((s, p) => s + p.discount, 0)) },
                ]}
              />
              {unsigned > 0 && (
                <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                  {unsigned} of {paid.length} bills carry no staff name — settled with no register open and no staff login.
                </div>
              )}
            </Card>
          </div>

          {/* GST & GUESTS */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title={comp ? '🧾 Composition levy summary' : '🧾 GST summary'} sub={`Rebuilt bill by bill, not divided out of the day's total${ecoBills.length ? ' · aggregator sales excluded' : ''}`}>
              <DataTable
                rows={[
                  { k: 'sub', label: 'Sale value before discount', v: gst.sub },
                  { k: 'disc', label: 'Less: discount given', v: -gst.discount },
                  { k: 'taxable', label: 'Taxable value', v: gst.taxable, bold: true },
                  ...(comp ? [] : [
                    { k: 'cgst', label: `CGST @ ${(state.settings.gstRate ?? 5) / 2}%`, v: gst.cgst },
                    { k: 'sgst', label: `SGST @ ${(state.settings.gstRate ?? 5) / 2}%`, v: gst.sgst },
                  ]),
                  ...(gst.svc ? [{ k: 'svc', label: `Service charge @ ${state.settings.serviceCharge}%`, v: gst.svc }] : []),
                  ...(Math.round(gst.roundOff) ? [{ k: 'ro', label: 'Round off', v: gst.roundOff }] : []),
                  { k: 'invoice', label: 'Invoice value', v: gst.invoice, bold: true },
                ]}
                keyOf={(r) => r.k}
                cols={[
                  { h: 'Head', cell: (r) => <span className={r.bold ? 'font-bold text-ink-900' : 'text-stone-600'}>{r.label}</span> },
                  { h: 'Amount', num: true, cell: (r) => <span className={r.bold ? 'font-black' : r.v < 0 ? 'text-red-600' : ''}>{r.v < 0 ? '−' : ''}{inr0(Math.abs(r.v))}</span> },
                ]}
              />
              <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                {own.length} own-channel bill{own.length === 1 ? '' : 's'}.
                {ecoBills.length > 0 && ` ${ecoBills.length} aggregator bill${ecoBills.length === 1 ? '' : 's'} worth ${inr0(ecoGross)} are left out — under Sec 9(5) Zomato and Swiggy pay the GST on those, not you.`}
                {comp && ' Composition scheme: no GST is charged to the guest, so only the taxable turnover matters here.'}
                {Math.abs(gst.invoice - gst.collected) >= 1 && (
                  <> <b className="text-amber-700">{inr0(gst.collected)} was actually collected</b>, {inr0(Math.abs(gst.invoice - gst.collected))} {gst.collected < gst.invoice ? 'less' : 'more'} than the invoice value rebuilt above — those bills were settled under a different tax or service-charge setting than the one in force now.</>
                )}
              </div>
            </Card>

            <Card className="!mb-0 kp-card" flush title="👥 Guests & spend per head" sub="Only bills where a head count was actually entered">
              <DataTable
                rows={[
                  { k: 'guests', label: 'Guests served', v: guests || null, fmt: 'n' },
                  { k: 'counted', label: 'Bills with a guest count', v: countedBills.length, sub: `of ${paid.length} bills`, fmt: 'n' },
                  { k: 'perguest', label: 'Spend per guest', v: perGuest, fmt: '₹' },
                  { k: 'party', label: 'Average party size', v: partySize, fmt: '1' },
                  { k: 'avgbill', label: 'Average bill', v: paid.length ? gross / paid.length : null, fmt: '₹' },
                ]}
                keyOf={(r) => r.k}
                cols={[
                  { h: 'Measure', cell: (r) => <div><span className="font-semibold">{r.label}</span>{r.sub && <div className="text-[11px] text-stone-400">{r.sub}</div>}</div> },
                  { h: 'Value', num: true, cell: (r) => r.v == null
                    ? <span className="text-stone-300">—</span>
                    : <b>{r.fmt === '₹' ? inr0(r.v) : r.fmt === '1' ? r.v.toFixed(1) : r.v}</b> },
                ]}
              />
              <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                {countedBills.length === paid.length
                  ? 'Every bill today recorded how many people were at the table.'
                  : countedBills.length
                    ? `${paid.length - countedBills.length} bill${paid.length - countedBills.length === 1 ? '' : 's'} recorded no head count and ${paid.length - countedBills.length === 1 ? 'is' : 'are'} left out of the per-guest figures rather than counted as zero.`
                    : 'No bill recorded a head count today, so the per-guest figures read — . Tap the 👥 counter beside the table picker in Billing when you seat a party.'}
              </div>
            </Card>
          </div>

          {/* UDHAAR & REFUNDS */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="📒 Udhaar today" sub="Credit given out, and old credit that came back in">
              <DataTable
                rows={[
                  { k: 'given', label: '📤 Given on credit today', n: udhaarGiven.length, v: udhaarGivenValue, bad: true },
                  { k: 'coll', label: '📥 Old udhaar collected today', n: udhaarCollected.length, v: udhaarCollectedValue },
                ]}
                keyOf={(r) => r.k}
                cols={[
                  { h: 'What', cell: (r) => <span className="font-semibold">{r.label}</span> },
                  { h: 'Bills', num: true, cell: (r) => r.n || <span className="text-stone-300">0</span> },
                  { h: 'Amount', num: true, cell: (r) => r.v
                    ? <b className={r.bad ? 'text-red-600' : 'text-leaf-600'}>{inr0(r.v)}</b>
                    : <span className="text-stone-300">—</span> },
                ]}
              />
              {(udhaarGiven.length > 0 || udhaarCollected.length > 0) && (
                <div className="px-4 pb-4 pt-1 max-h-40 overflow-y-auto">
                  {udhaarGiven.map((o) => (
                    <div key={o.id} className="flex justify-between text-xs py-1 text-stone-500">
                      <span>📤 #{o.billNo} {(state.customers || []).find((c) => c.id === o.customerId)?.name || 'Unknown'}</span>
                      <span className="tabular-nums text-red-600">{inr0(amt(o))}</span>
                    </div>
                  ))}
                  {udhaarCollected.map((o) => (
                    <div key={o.id} className="flex justify-between text-xs py-1 text-stone-500">
                      <span>📥 #{o.billNo} {(state.customers || []).find((c) => c.id === o.customerId)?.name || 'Unknown'} <span className="text-stone-400">· {String(o.creditPaid.method || '').toUpperCase()}</span></span>
                      <span className="tabular-nums text-leaf-600">{inr0((o.payment?.amount || 0) - (o.refund?.amount || 0))}</span>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card className="!mb-0 kp-card" flush title="↩️ Refunds today" sub="Bills settled and then paid back — the invoice keeps its number">
              <DataTable
                rows={returned}
                keyOf={(o) => o.id}
                empty="Nothing refunded today 🎉"
                cols={[
                  { h: 'Bill', cell: (o) => <div><span className="font-black">#{o.billNo}</span><div className="text-[11px] text-stone-400">{fmtTime(o.refund.at)} · {o.refund.by || '—'}</div></div>, foot: () => 'Total' },
                  { h: 'Reason', cell: (o) => o.refund.reason || <span className="text-stone-300">not given</span> },
                  { h: 'Back via', cell: (o) => <Badge color={o.refund.method === 'cash' ? 'green' : 'blue'}>{String(o.refund.method || 'cash').toUpperCase()}</Badge> },
                  { h: 'Bill was', num: true, cell: (o) => inr0(amt(o)) },
                  { h: 'Refunded', num: true, cell: (o) => <b className="text-red-600">−{inr0(o.refund.amount)}</b>, foot: () => inr0(refundValue) },
                ]}
              />
            </Card>
          </div>

          {/* EXPENSES & CANCELLATIONS */}
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="💸 Expenses booked today" sub="Every rupee paid out, and where it came from">
              <DataTable
                scroll
                rows={[...dayExpenses].sort((a, b) => b.at - a.at)}
                keyOf={(e) => e.id}
                empty="No expenses booked today"
                cols={[
                  { h: 'Head', cell: (e) => (
                    <div>
                      <span className="font-semibold">{e.reason}</span>
                      {(e.note || e.staffName) && <div className="text-[11px] text-stone-400">{[e.staffName, e.note].filter(Boolean).join(' · ')}</div>}
                    </div>
                  ), foot: () => 'Total' },
                  { h: 'Time', cell: (e) => <span className="text-xs text-stone-500 tabular-nums">{fmtTime(e.at)}</span> },
                  { h: 'Paid from', cell: (e) => <Badge color={e.paidFrom === 'cash' ? 'green' : 'stone'}>{paidFromLabel(e.paidFrom)}</Badge> },
                  { h: 'Amount', num: true, cell: (e) => <b className="text-red-600">{inr0(e.amount)}</b>, foot: () => inr0(expenseTotal) },
                ]}
              />
            </Card>

            <Card className="!mb-0 kp-card" flush title="🚫 Item cancellations" sub="When the bill printed against when the item came off it">
              <DataTable
                scroll
                rows={[...voidRows].sort((a, b) => b.at - a.at)}
                keyOf={(v) => v.id}
                empty="Nothing cancelled today 🎉"
                cols={[
                  { h: 'Item', cell: (v) => (
                    <div>
                      <span className="font-semibold">{v.qty}× {v.item}</span>
                      <div className="text-[11px] text-stone-400">{v.billNo != null ? `#${v.billNo} · ` : ''}{v.tableId ? tableName(state.tables, v.tableId) : '—'} · {v.by}</div>
                    </div>
                  ), foot: () => 'Total' },
                  { h: 'Printed', cell: (v) => v.printedAt ? <span className="tabular-nums text-xs">{fmtTime(v.printedAt)}</span> : <span className="text-stone-300">—</span> },
                  { h: 'Deleted', cell: (v) => <span className="tabular-nums text-xs">{fmtTime(v.at)}</span> },
                  { h: 'Gap', num: true, cell: (v) => v.gap == null
                    ? <span className="text-stone-300">—</span>
                    : v.gap < 0
                      ? <span className="text-stone-500 text-[11px]">before print</span>
                      : <Badge color={v.gap > 15 ? 'red' : 'amber'}>+{dur(v.gap)}</Badge> },
                  { h: 'Value', num: true, cell: (v) => <b className="text-red-600">{inr0(v.amount || 0)}</b>, foot: () => inr0(voidValue) },
                ]}
              />
              {voidRows.some((v) => v.printedAt == null) && (
                <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                  Rows showing <b>—</b> under Printed were deleted from a bill that had not been printed, or before KhaanaPeena started stamping print times. They are not counted in the gap.
                </div>
              )}
            </Card>
          </div>

          {afterPrint.length > 0 && (
            <Note tone="red">
              <b>{afterPrint.length} item{afterPrint.length === 1 ? ' was' : 's were'} taken off a bill that had already been printed today</b>, worth {inr0(afterPrint.reduce((s, v) => s + (v.amount || 0), 0))}.
              The full history is in the <b>🚫 Cancellations</b> report.
            </Note>
          )}

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0" flush title="Top sellers today">
              <DataTable
                rows={topItems}
                keyOf={(i) => i.name}
                cols={[
                  { h: 'Dish', cell: (i) => <span className="font-semibold">{i.name}</span> },
                  { h: 'Plates', num: true, cell: (i) => i.qty },
                  { h: 'Revenue', num: true, cell: (i) => inr0(i.rev) },
                ]}
              />
            </Card>

            <Card className="!mb-0" title="Leakage check" sub="Everything that cost you food but not money">
              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center py-1.5 border-b border-stone-50">
                  <span className="text-stone-600">Items voided after KOT</span>
                  <span className="font-bold tabular-nums">{voids.length} · <span className="text-red-600">{inr0(voids.reduce((s, v) => s + (v.amount || 0), 0))}</span></span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-stone-50">
                  <span className="text-stone-600">Orders cancelled</span>
                  <span className="font-bold tabular-nums">{cancels.length}</span>
                </div>
                <div className="flex justify-between items-center py-1.5 border-b border-stone-50">
                  <span className="text-stone-600">Bills given 100% free</span>
                  <span className="font-bold tabular-nums">{paid.filter((o) => (o.payment?.discount || 0) > 0 && (o.payment?.discount || 0) >= billTotals(o, state.settings).sub).length}</span>
                </div>
                {voids.length > 0 && (
                  <div className="max-h-40 overflow-y-auto pt-1">
                    {voids.map((v) => (
                      <div key={v.id} className="flex justify-between text-xs py-1 text-stone-500">
                        <span>{v.qty}× {v.item} <span className="text-stone-400">· by {v.by}</span></span>
                        <span className="tabular-nums">{fmtTime(v.at)}</span>
                      </div>
                    ))}
                  </div>
                )}
                {!voids.length && !cancels.length && <p className="text-xs text-leaf-600 font-semibold pt-1">Clean day — nothing voided or cancelled 🎉</p>}
              </div>
            </Card>
          </div>

          {/* OPENING → CLOSING CASH — the two numbers you lock the shutter on */}
          {shifts.length > 0 && (
            <Card className="kp-card" title="🔐 Opening & closing cash" sub="What the drawer started the day with, and what was physically counted at the end">
              <div className="grid sm:grid-cols-4 gap-3 text-sm">
                <Fig l="Opened with" v={inr0(openingCash)} />
                <Fig l="Cash sales today" v={inr0(modes.find((m) => m.k === 'cash')?.amount || 0)} />
                <Fig l="Counted at close" v={closingCash == null ? '—' : inr0(closingCash)} />
                <div>
                  <div className="text-xs text-stone-500">Register</div>
                  <div className="text-lg font-bold text-ink-900">
                    {closedShifts.length
                      ? `Closed ${fmtTime(closedShifts[closedShifts.length - 1].closedAt)}`
                      : <Badge color="amber">Still open</Badge>}
                  </div>
                </div>
              </div>
              {closingCash == null && (
                <p className="text-xs text-stone-500 mt-3">
                  The register has not been closed for this day, so there is no counted figure yet — it reads <b>—</b> rather than a guess.
                  Close it in <b>Cash Register</b> and the count, the expected figure and the difference all land here.
                </p>
              )}
            </Card>
          )}

          {/* CASH DRAWER */}
          {shifts.map((sh) => {
            const z = sh.z
            const variance = z ? Math.round((z.countedCash || 0) - (z.expectedCash || 0)) : null
            return (
              <Card key={sh.id} className="kp-card" title={`💵 Cash drawer — ${sh.openedBy || 'register'}`} sub={z ? `Closed ${new Date(sh.closedAt).toLocaleTimeString('en-IN')} by ${sh.closedBy || '—'}` : 'Still open — close it in Cash Register to lock the day'}>
                {z ? (
                  <div className="grid sm:grid-cols-5 gap-3 text-sm">
                    <Fig l="Opening float" v={inr0(sh.openingFloat || 0)} />
                    <Fig l="Cash sales" v={inr0(z.cash || 0)} />
                    <Fig l="Expected in drawer" v={inr0(z.expectedCash || 0)} />
                    <Fig l="Counted" v={inr0(z.countedCash || 0)} />
                    <div>
                      <div className="text-xs text-stone-500">Over / short</div>
                      <div className={`text-lg font-bold tabular-nums ${variance === 0 ? 'text-leaf-600' : variance > 0 ? 'text-blue-600' : 'text-red-600'}`}>
                        {variance === 0 ? '✓ Tallies' : (variance > 0 ? '+' : '') + inr0(variance)}
                      </div>
                    </div>
                  </div>
                ) : (
                  <Badge color="amber">Register still open</Badge>
                )}
              </Card>
            )
          })}
          {!shifts.length && (
            <Card>
              <p className="text-sm text-stone-500">No cash register shift recorded for this day. Open and close the register in <b>Cash Register</b> to get drawer reconciliation here.</p>
            </Card>
          )}
        </>
      )}
    </>
  )
}

const Fig = ({ l, v }) => (
  <div>
    <div className="text-xs text-stone-500">{l}</div>
    <div className="text-lg font-bold text-ink-900 tabular-nums">{v}</div>
  </div>
)
