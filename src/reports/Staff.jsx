import React, { useMemo } from 'react'
import { StatCard, Badge } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, NeedsData, Note, download, paidIn, slug, pct, amt } from './shared.jsx'

// Staff accountability. Bills carry `settledBy` (who took the money) and orders
// carry `takenBy` (who punched it). Both are stamped from the RBAC session, or —
// when staff login is off — from whoever opened the cash register.
export default function Staff({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const punched = useMemo(
    () => (state.orders || []).filter((o) => o.takenBy && o.createdAt >= range.from && o.createdAt < range.to),
    [state.orders, range]
  )
  const voids = useMemo(
    () => (state.voidLog || []).filter((v) => v.at >= range.from && v.at < range.to),
    [state.voidLog, range]
  )
  const shifts = useMemo(
    () => (state.shifts || []).filter((sh) => sh.openedAt >= range.from && sh.openedAt < range.to).sort((a, b) => b.openedAt - a.openedAt),
    [state.shifts, range]
  )

  const attributed = paid.filter((o) => o.settledBy)

  const cashiers = useMemo(() => {
    const m = {}
    attributed.forEach((o) => {
      const c = (m[o.settledBy] = m[o.settledBy] || { name: o.settledBy, bills: 0, gross: 0, discount: 0, cash: 0, upi: 0, card: 0, online: 0 })
      c.bills++
      c.gross += amt(o)
      c.discount += o.payment?.discount || 0
      c[o.payment?.method || 'cash'] = (c[o.payment?.method || 'cash'] || 0) + amt(o)
    })
    return Object.values(m).sort((a, b) => b.gross - a.gross)
  }, [attributed])

  const takers = useMemo(() => {
    const m = {}
    punched.forEach((o) => {
      const t = (m[o.takenBy] = m[o.takenBy] || { name: o.takenBy, orders: 0, billed: 0, rev: 0, plates: 0 })
      t.orders++
      t.plates += (o.items || []).reduce((s, li) => s + li.qty, 0)
      if (o.status === 'paid') { t.billed++; t.rev += amt(o) }
    })
    return Object.values(m).sort((a, b) => b.rev - a.rev)
  }, [punched])

  const voidsBy = useMemo(() => {
    const m = {}
    voids.forEach((v) => {
      const b = (m[v.by || 'Unknown'] = m[v.by || 'Unknown'] || { name: v.by || 'Unknown', count: 0, qty: 0, value: 0 })
      b.count++; b.qty += v.qty || 0; b.value += v.amount || 0
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [voids])

  const exportCsv = () => {
    const out = [['STAFF PERFORMANCE — ' + range.label], [],
      ['CASHIER COLLECTION'], ['Cashier', 'Bills', 'Collected ₹', 'Avg bill ₹', 'Cash ₹', 'UPI ₹', 'Card ₹', 'Online ₹', 'Discounts given ₹', 'Discount % of own sales']]
    cashiers.forEach((c) => out.push([
      c.name, c.bills, Math.round(c.gross), Math.round(c.gross / c.bills),
      Math.round(c.cash || 0), Math.round(c.upi || 0), Math.round(c.card || 0), Math.round(c.online || 0),
      Math.round(c.discount), pct(c.discount, c.gross + c.discount),
    ]))
    out.push([], ['ORDERS PUNCHED'], ['Staff', 'Orders', 'Billed', 'Revenue ₹', 'Avg bill ₹', 'Plates', 'Plates per order'])
    takers.forEach((t) => out.push([
      t.name, t.orders, t.billed, Math.round(t.rev), t.billed ? Math.round(t.rev / t.billed) : 0, t.plates, (t.plates / t.orders).toFixed(1),
    ]))
    if (voidsBy.length) {
      out.push([], ['VOIDS BY STAFF'], ['Staff', 'Void actions', 'Items', 'Value ₹'])
      voidsBy.forEach((v) => out.push([v.name, v.count, v.qty, Math.round(v.value)]))
    }
    if (shifts.length) {
      out.push([], ['REGISTER SHIFTS'], ['Opened', 'By', 'Closed', 'By', 'Cash sales ₹', 'Expected ₹', 'Counted ₹', 'Over/short ₹'])
      shifts.forEach((sh) => out.push([
        new Date(sh.openedAt).toLocaleString('en-IN'), sh.openedBy || '',
        sh.closedAt ? new Date(sh.closedAt).toLocaleString('en-IN') : 'still open', sh.closedBy || '',
        Math.round(sh.z?.cash || 0), Math.round(sh.z?.expectedCash || 0), Math.round(sh.z?.countedCash || 0),
        sh.z ? Math.round((sh.z.countedCash || 0) - (sh.z.expectedCash || 0)) : '',
      ]))
    }
    download(`khaanapeena-staff-${slug(range)}.csv`, out)
  }

  if (!cashiers.length && !takers.length && !voidsBy.length) {
    return (
      <NeedsData icon="👨‍🍳" title="No bills are attributed to a staff member yet">
        KhaanaPeena stamps every order and bill with whoever is on the till. It takes that name from
        <b> Staff Login</b> (turn it on in Settings → Staff access, then each person unlocks with their own PIN),
        or failing that from the name entered when the <b>Cash Register</b> is opened. Do either one and this
        report starts filling from the next bill.
      </NeedsData>
    )
  }

  const unattributed = paid.length - attributed.length

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Staff collecting money" value={cashiers.length} sub={range.label} icon="👨‍🍳" accent="saffron" />
        <StatCard label="Attributed collection" value={inr0(attributed.reduce((s, o) => s + amt(o), 0))} sub={`${attributed.length} of ${paid.length} bills`} icon="💰" accent="green" />
        <StatCard label="Discounts given by staff" value={inr0(cashiers.reduce((s, c) => s + c.discount, 0))} icon="🏷️" accent="red" />
        <StatCard label="Voids after KOT" value={voids.length} sub={inr0(voids.reduce((s, v) => s + (v.amount || 0), 0))} icon="🔒" accent={voids.length ? 'red' : 'green'} />
      </div>

      {unattributed > 0 && (
        <Note>
          {unattributed} of {paid.length} bills in this period carry no staff name — they were settled before staff attribution was switched on, or with no register open. Turn on <b>Staff Login</b> in Settings so every bill is signed.
        </Note>
      )}

      {cashiers.length > 0 && (
        <Card flush title="Cashier collection" sub="Who took how much, in what form — and how much they gave away">
          <DataTable
            rows={cashiers}
            keyOf={(c) => c.name}
            cols={[
              { h: 'Cashier', cell: (c) => <span className="font-semibold text-ink-900">{c.name}</span>, foot: () => 'Total' },
              { h: 'Bills', num: true, cell: (c) => c.bills, foot: () => attributed.length },
              { h: 'Collected', num: true, cell: (c) => <b>{inr0(c.gross)}</b>, foot: () => inr0(cashiers.reduce((s, c) => s + c.gross, 0)) },
              { h: 'Avg bill', num: true, cell: (c) => inr0(c.gross / c.bills) },
              { h: '💵 Cash', num: true, cell: (c) => inr0(c.cash || 0), foot: () => inr0(cashiers.reduce((s, c) => s + (c.cash || 0), 0)) },
              { h: '📲 UPI', num: true, cell: (c) => inr0(c.upi || 0), foot: () => inr0(cashiers.reduce((s, c) => s + (c.upi || 0), 0)) },
              { h: '💳 Card', num: true, cell: (c) => inr0(c.card || 0), foot: () => inr0(cashiers.reduce((s, c) => s + (c.card || 0), 0)) },
              { h: 'Discounts', num: true, cell: (c) => c.discount ? <Badge color={pct(c.discount, c.gross + c.discount) > 8 ? 'red' : 'stone'}>{inr0(c.discount)}</Badge> : <span className="text-stone-300">—</span>, foot: () => inr0(cashiers.reduce((s, c) => s + c.discount, 0)) },
            ]}
          />
        </Card>
      )}

      {takers.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Card className="!mb-0" flush title="Orders punched" sub="Who is bringing the orders in — and who upsells">
            <DataTable
              rows={takers}
              keyOf={(t) => t.name}
              cols={[
                { h: 'Staff', cell: (t) => <span className="font-semibold">{t.name}</span>, foot: () => 'Total' },
                { h: 'Orders', num: true, cell: (t) => t.orders, foot: () => takers.reduce((s, t) => s + t.orders, 0) },
                { h: 'Revenue', num: true, cell: (t) => <b>{inr0(t.rev)}</b>, foot: () => inr0(takers.reduce((s, t) => s + t.rev, 0)) },
                { h: 'Avg bill', num: true, cell: (t) => t.billed ? inr0(t.rev / t.billed) : <span className="text-stone-300">—</span> },
                { h: 'Plates/order', num: true, cell: (t) => (t.plates / t.orders).toFixed(1) },
              ]}
            />
          </Card>
          <Card className="!mb-0" title="Average bill by staff" sub="A higher bar means better upselling on the same guests">
            <HBars data={takers.filter((t) => t.billed).map((t) => ({ label: t.name, value: Math.round(t.rev / t.billed) }))} color="#9333ea" />
          </Card>
        </div>
      )}

      {voidsBy.length > 0 && (
        <Card flush title="🔒 Voids by staff" sub="Items pulled off a bill after the kitchen already had them — the classic leak">
          <DataTable
            rows={voidsBy}
            keyOf={(v) => v.name}
            cols={[
              { h: 'Staff', cell: (v) => <span className="font-semibold">{v.name}</span>, foot: () => 'Total' },
              { h: 'Void actions', num: true, cell: (v) => v.count, foot: () => voids.length },
              { h: 'Items', num: true, cell: (v) => v.qty },
              { h: 'Value', num: true, cell: (v) => <span className="text-red-600 font-bold">{inr0(v.value)}</span>, foot: () => inr0(voids.reduce((s, v) => s + (v.amount || 0), 0)) },
            ]}
          />
        </Card>
      )}

      {shifts.length > 0 && (
        <Card flush title="Register shifts" sub="Drawer handovers — over/short is counted cash minus what the till expected">
          <DataTable
            rows={shifts}
            keyOf={(sh) => sh.id}
            cols={[
              { h: 'Opened', cell: (sh) => <div><div className="font-semibold">{new Date(sh.openedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div><div className="text-[11px] text-stone-400">by {sh.openedBy || '—'}</div></div> },
              { h: 'Closed', cell: (sh) => sh.closedAt ? <div><div>{new Date(sh.closedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</div><div className="text-[11px] text-stone-400">by {sh.closedBy || '—'}</div></div> : <Badge color="amber">open</Badge> },
              { h: 'Cash sales', num: true, cell: (sh) => inr0(sh.z?.cash || 0) },
              { h: 'Expected', num: true, cell: (sh) => inr0(sh.z?.expectedCash || 0) },
              { h: 'Counted', num: true, cell: (sh) => sh.z ? inr0(sh.z.countedCash || 0) : <span className="text-stone-300">—</span> },
              { h: 'Over / short', num: true, cell: (sh) => {
                if (!sh.z) return <span className="text-stone-300">—</span>
                const v = Math.round((sh.z.countedCash || 0) - (sh.z.expectedCash || 0))
                return <Badge color={v === 0 ? 'green' : v > 0 ? 'blue' : 'red'}>{v === 0 ? '✓ tallies' : (v > 0 ? '+' : '') + inr0(v)}</Badge>
              } },
            ]}
          />
        </Card>
      )}
    </>
  )
}
