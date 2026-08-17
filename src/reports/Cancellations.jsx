import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Bars, HBars } from '../charts.jsx'
import { inr0, tableName, fmtTime } from '../utils.js'
import { Card, DataTable, Exports, Note, paidIn, slug, pct, amt, mins, median, dur } from './shared.jsx'

const hourLabel = (h) => `${(h % 12) || 12}${h < 12 ? 'a' : 'p'}`
const hourSpan = (h) => `${(h % 12) || 12}${h < 12 ? 'am' : 'pm'}–${((h + 1) % 12) || 12}${(h + 1) % 24 < 12 ? 'am' : 'pm'}`

// An order kept as `cancelled` only because it was merged into another table's
// bill isn't a cancellation — the food still went out and was still paid for.
const isRealCancel = (o) => o.status === 'cancelled' && !o.mergedInto

// No cancel stamp existed before, so fall back through the order's own timeline
// rather than pretending the cancellation happened at midnight.
const cancelTs = (o) => o.cancelledAt || o.updatedAt || o.kotAt || o.createdAt

/**
 * Item cancellations and deletions in one place — the two names an owner uses for
 * the same worry: something was ordered, the kitchen (or the printer) saw it, and
 * then it came off the bill.
 *
 * The column that matters is the gap between **bill printed** and **item deleted**.
 * A line pulled before the bill prints is ordinary service. A line pulled after the
 * guest has already seen a printed total is the classic till fiddle, and that is the
 * pair of timestamps this report puts side by side.
 */
export default function Cancellations({ state, range }) {
  const inRange = (ts) => ts != null && ts >= range.from && ts < range.to
  const orderOf = (id) => (state.orders || []).find((o) => o.id === id)

  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const gross = paid.reduce((s, o) => s + amt(o), 0)

  // ---- items deleted off a running bill (the void log) ----
  const voidRows = useMemo(() => (state.voidLog || [])
    .filter((v) => inRange(v.at))
    .map((v) => {
      const o = orderOf(v.orderId)
      // the void entry now carries its own copies of these, but entries written
      // before that still have to be read off the order they came from
      const printedAt = v.printedAt || o?.printedAt || null
      return {
        id: v.id, kind: 'void',
        item: v.item, qty: v.qty || 0, value: v.amount || 0,
        printedAt, at: v.at,
        gap: printedAt ? mins(v.at - printedAt) : null,
        tableId: v.tableId || o?.tableId || null,
        billNo: v.billNo || o?.billNo || null,
        openedAt: v.orderCreatedAt || o?.createdAt || null,
        by: v.by || 'Unknown',
      }
    }), [state.voidLog, state.orders, range])

  // ---- whole orders that were cancelled ----
  const cancelledOrders = useMemo(
    () => (state.orders || []).filter((o) => isRealCancel(o) && inRange(cancelTs(o))),
    [state.orders, range]
  )
  const emptyCancels = cancelledOrders.filter((o) => !(o.items || []).length).length

  const cancelRows = useMemo(() => cancelledOrders.flatMap((o) => (o.items || []).map((li, i) => ({
    id: o.id + '#' + i, kind: 'cancel',
    item: li.name, qty: li.qty, value: li.price * li.qty,
    printedAt: o.printedAt || null, at: cancelTs(o),
    gap: o.printedAt ? mins(cancelTs(o) - o.printedAt) : null,
    tableId: o.tableId || null,
    billNo: o.billNo || null,
    openedAt: o.createdAt || null,
    by: o.cancelledBy || o.takenBy || 'Unknown',
  }))), [cancelledOrders])

  const rows = useMemo(() => [...voidRows, ...cancelRows].sort((a, b) => b.at - a.at), [voidRows, cancelRows])

  const totalQty = rows.reduce((s, r) => s + r.qty, 0)
  const totalValue = rows.reduce((s, r) => s + r.value, 0)
  // only rows that actually know when the bill printed can be judged on the gap —
  // counting the rest as "before print" would flatter the numbers
  const timed = rows.filter((r) => r.gap != null)
  const afterPrint = timed.filter((r) => r.gap >= 0)
  const noPrintTime = rows.length - timed.length
  const medGap = median(afterPrint.map((r) => r.gap))

  const byItem = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const a = (m[r.item] = m[r.item] || { name: r.item, count: 0, qty: 0, value: 0, afterPrint: 0 })
      a.count++; a.qty += r.qty; a.value += r.value
      if (r.gap != null && r.gap >= 0) a.afterPrint++
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const byStaff = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const a = (m[r.by] = m[r.by] || { name: r.by, count: 0, qty: 0, value: 0, afterPrint: 0, gaps: [] })
      a.count++; a.qty += r.qty; a.value += r.value
      if (r.gap != null && r.gap >= 0) { a.afterPrint++; a.gaps.push(r.gap) }
    })
    return Object.values(m).map((s) => ({ ...s, medGap: median(s.gaps) })).sort((a, b) => b.value - a.value)
  }, [rows])

  const hours = useMemo(() => {
    const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0, value: 0 }))
    rows.forEach((r) => { const x = h[new Date(r.at).getHours()]; x.count++; x.value += r.value })
    return h
  }, [rows])
  const firstActive = hours.findIndex((h) => h.count > 0)
  const lastActive = 23 - [...hours].reverse().findIndex((h) => h.count > 0)
  const activeHours = firstActive === -1 ? [] : hours.slice(firstActive, lastActive + 1)

  const when = (ts) => (ts ? new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '')
  const kindLabel = (k) => (k === 'void' ? 'Item deleted from bill' : 'Order cancelled')

  const buildRows = () => {
    const out = [['ITEM CANCELLATIONS & DELETIONS — ' + range.label], [],
      ['Cancellation events', rows.length],
      ['Items pulled off bills', totalQty],
      ['Value ₹', Math.round(totalValue)],
      ['As % of settled sales', pct(totalValue, gross + totalValue)],
      ['Deleted AFTER the bill was printed', afterPrint.length],
      ['Median print → delete gap (min)', medGap == null ? '—' : medGap.toFixed(1)],
      ['Rows with no print time recorded', noPrintTime],
      ['Whole orders cancelled', cancelledOrders.length],
      [], ['EVERY CANCELLED / DELETED ITEM'],
      ['What happened', 'Item', 'Qty', 'Value ₹', 'Bill No', 'Table', 'Order opened', 'Bill printed', 'Item deleted', 'Gap print → delete (min)', 'Authorised by']]
    rows.forEach((r) => out.push([
      kindLabel(r.kind), r.item, r.qty, Math.round(r.value),
      r.billNo == null ? '—' : r.billNo,
      r.tableId ? tableName(state.tables, r.tableId) : '—',
      r.openedAt ? when(r.openedAt) : '—',
      r.printedAt ? when(r.printedAt) : '—',
      when(r.at),
      r.gap == null ? '—' : r.gap.toFixed(1),
      r.by,
    ]))
    out.push([], ['MOST-CANCELLED ITEMS'], ['Item', 'Times', 'Qty', 'Value ₹', 'Of which after print'])
    byItem.forEach((i) => out.push([i.name, i.count, i.qty, Math.round(i.value), i.afterPrint]))
    out.push([], ['BY STAFF'], ['Authorised by', 'Times', 'Qty', 'Value ₹', 'After print', 'Median print → delete (min)'])
    byStaff.forEach((s) => out.push([s.name, s.count, s.qty, Math.round(s.value), s.afterPrint, s.medGap == null ? '—' : s.medGap.toFixed(1)]))
    out.push([], ['BY HOUR OF DAY'], ['Hour', 'Events', 'Value ₹'])
    hours.filter((h) => h.count).forEach((h) => out.push([hourSpan(h.hour), h.count, Math.round(h.value)]))
    return out
  }

  if (!rows.length) {
    return (
      <Card className="kp-card">
        <Empty icon="✅" text={`Nothing was cancelled or deleted in ${range.label.toLowerCase()} — no item left a bill after it was punched.`} />
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint">
        <Exports
          build={buildRows}
          name={`khaanapeena-cancellations-${slug(range)}`}
          title="Cancellations & deletions"
          period={range.label}
          settings={state.settings}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Cancellations" value={rows.length} sub={`${totalQty} item${totalQty === 1 ? '' : 's'} pulled off bills`} icon="🚫" accent="saffron" />
        <StatCard label="Value lost" value={inr0(totalValue)} sub={`${pct(totalValue, gross + totalValue)}% of what you could have billed`} icon="💸" accent={totalValue > gross * 0.03 ? 'red' : 'blue'} />
        <StatCard label="Deleted after printing" value={afterPrint.length} sub={afterPrint.length ? inr0(afterPrint.reduce((s, r) => s + r.value, 0)) : 'none — clean'} icon="🖨️" accent={afterPrint.length ? 'red' : 'green'} />
        <StatCard label="Typical delay" value={medGap == null ? '—' : dur(medGap)} sub="bill printed → item deleted" icon="⏱️" accent={medGap == null ? 'purple' : medGap > 10 ? 'red' : 'purple'} />
        <StatCard label="Whole orders cancelled" value={cancelledOrders.length} sub={emptyCancels ? `${emptyCancels} had no items on them` : 'before anything was billed'} icon="🗑️" accent={cancelledOrders.length ? 'red' : 'green'} />
      </div>

      {noPrintTime > 0 && (
        <Note>
          {noPrintTime} of {rows.length} rows show <b>—</b> for the print time: the bill was never printed, or it was deleted before KhaanaPeena
          started stamping <b>when a bill is printed</b>. Those rows are left out of the gap figures rather than counted as zero.
          Everything printed from now on carries the stamp.
        </Note>
      )}

      {afterPrint.length > 0 && (
        <Note tone="red">
          <b>{afterPrint.length} item{afterPrint.length === 1 ? ' was' : 's were'} taken off a bill that had already been printed</b>, worth {inr0(afterPrint.reduce((s, r) => s + r.value, 0))}.
          That is the one pattern worth reading line by line below — the guest saw a total, then the total changed.
        </Note>
      )}

      <Card
        flush
        className="kp-card"
        title="Every cancelled & deleted item"
        sub={`Newest first. “Bill printed” and “Item deleted” are the two clocks — the gap between them is the column to read.${emptyCancels ? ` ${emptyCancels} cancelled order${emptyCancels === 1 ? '' : 's'} carried no items and so add no rows here.` : ''}`}
      >
        <DataTable
          scroll
          rows={rows}
          keyOf={(r) => r.id}
          cols={[
            { h: 'Item', cell: (r) => (
              <div>
                <span className="font-semibold text-ink-900">{r.qty}× {r.item}</span>
                <div className="mt-0.5"><Badge color={r.kind === 'void' ? 'amber' : 'red'}>{kindLabel(r.kind)}</Badge></div>
              </div>
            ), foot: () => 'Total' },
            { h: 'Qty', num: true, cell: (r) => r.qty, foot: () => totalQty },
            { h: 'Value', num: true, cell: (r) => <b className="text-red-600">{inr0(r.value)}</b>, foot: () => inr0(totalValue) },
            { h: 'Bill no', num: true, cell: (r) => r.billNo == null ? <span className="text-stone-300">—</span> : <span className="font-black">#{r.billNo}</span> },
            { h: 'Table', cell: (r) => r.tableId ? <span className="text-xs">🪑 {tableName(state.tables, r.tableId)}</span> : <span className="text-stone-300">—</span> },
            { h: 'Bill printed', cell: (r) => r.printedAt
              ? <div><div className="tabular-nums">{fmtTime(r.printedAt)}</div><div className="text-[11px] text-stone-400">{new Date(r.printedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div></div>
              : <span className="text-stone-300">—</span> },
            { h: 'Item deleted', cell: (r) => (
              <div><div className="tabular-nums">{fmtTime(r.at)}</div><div className="text-[11px] text-stone-400">{new Date(r.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div></div>
            ) },
            { h: 'Gap', num: true, cell: (r) => {
              if (r.gap == null) return <span className="text-stone-300">—</span>
              if (r.gap < 0) return <span className="text-stone-500 text-xs">before print</span>
              return <Badge color={r.gap > 15 ? 'red' : r.gap > 3 ? 'amber' : 'stone'}>+{dur(r.gap)}</Badge>
            } },
            { h: 'Authorised by', cell: (r) => <span className="text-xs font-semibold">{r.by}</span> },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0 kp-card" title="Most-cancelled dishes" sub="A dish that keeps coming off bills is usually a kitchen or menu problem, not a customer one">
          <HBars data={byItem.slice(0, 10).map((i) => ({ label: i.name, value: Math.round(i.value) }))} color="#dc2626" />
        </Card>
        <Card className="!mb-0 kp-card" flush title="Who authorised them" sub="Every deletion needs a manager — this is the list of who used that power">
          <DataTable
            rows={byStaff}
            keyOf={(s) => s.name}
            cols={[
              { h: 'Staff', cell: (s) => <span className="font-semibold">{s.name}</span>, foot: () => 'Total' },
              { h: 'Times', num: true, cell: (s) => s.count, foot: () => rows.length },
              { h: 'Items', num: true, cell: (s) => s.qty, foot: () => totalQty },
              { h: 'Value', num: true, cell: (s) => <b className="text-red-600">{inr0(s.value)}</b>, foot: () => inr0(totalValue) },
              { h: 'After print', num: true, cell: (s) => s.afterPrint ? <Badge color="red">{s.afterPrint}</Badge> : <span className="text-stone-300">0</span>, foot: () => afterPrint.length },
              { h: 'Typical delay', num: true, cell: (s) => s.medGap == null ? <span className="text-stone-300">—</span> : dur(s.medGap) },
            ]}
          />
        </Card>
      </div>

      <Card className="kp-card" title="When they happen" sub="Cancellations clustered into one hour usually point at that shift, not at the dish">
        {activeHours.length
          ? <Bars data={activeHours.map((h) => ({ label: hourLabel(h.hour), value: h.count }))} color="#dc2626" fmt={(v) => `${v} cancellation${v === 1 ? '' : 's'}`} labelEvery={activeHours.length > 12 ? 2 : 1} />
          : <Empty text="Nothing to plot" />}
      </Card>

      <p className="text-[11px] text-stone-400">
        “Item deleted from bill” is a line removed after the kitchen already had the KOT. “Order cancelled” is a whole table's order killed off.
        Both cost you food; only the second one is visible to the guest.
      </p>
    </>
  )
}
