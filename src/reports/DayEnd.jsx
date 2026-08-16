import React, { useMemo, useState } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Donut } from '../charts.jsx'
import { inr0, billTotals, todayISO, fmtTime } from '../utils.js'
import { Card, DataTable, ExportBtn, download, pct, amt, channelOf, channelLabel, coversOf } from './shared.jsx'

// Close-of-day: everything an owner checks before locking up, on one screen.
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
  const tax = paid.reduce((s, o) => { const bt = billTotals(o, state.settings); return s + (comp ? 0 : bt.cgst + bt.sgst) }, 0)
  const taxable = paid.reduce((s, o) => s + billTotals(o, state.settings).taxable, 0)

  const modes = [['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card'], ['online', '🛵 Online']]
    .map(([k, label]) => {
      const os = paid.filter((o) => (o.payment?.method || 'cash') === k)
      return { k, label, bills: os.length, amount: os.reduce((s, o) => s + amt(o), 0) }
    })

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
  const cancels = (state.orders || []).filter((o) => o.status === 'cancelled' && (o.kotAt || o.createdAt) >= from && (o.kotAt || o.createdAt) < to)

  // any register shift that closed on this day carries the counted-cash truth
  const shifts = (state.shifts || []).filter((sh) => (sh.closedAt && sh.closedAt >= from && sh.closedAt < to) || (sh.openedAt >= from && sh.openedAt < to))

  const firstBill = paid[0]
  const lastBill = paid[paid.length - 1]
  const guests = paid.reduce((s, o) => s + coversOf(o), 0)

  const exportCsv = () => {
    const out = [['DAY-END SUMMARY'], ['Date', new Date(from).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })], [],
      ['Total collected ₹', Math.round(gross)],
      ['Bills', paid.length],
      ['Guests served', guests || '—'],
      ['Spend per guest ₹', guests ? Math.round(gross / guests) : '—'],
      ['Average bill ₹', paid.length ? Math.round(gross / paid.length) : 0],
      ['Discounts given ₹', Math.round(discount)],
      ['Taxable value ₹', Math.round(taxable)],
      [comp ? 'GST (composition — not collected) ₹' : 'GST collected ₹', Math.round(tax)],
      ['First bill', firstBill ? new Date(firstBill.paidAt).toLocaleTimeString('en-IN') : '—'],
      ['Last bill', lastBill ? new Date(lastBill.paidAt).toLocaleTimeString('en-IN') : '—'],
      [], ['PAYMENT MODES'], ['Mode', 'Bills', 'Amount ₹']]
    modes.forEach((m) => out.push([m.label, m.bills, Math.round(m.amount)]))
    out.push([], ['ORDER TYPES'], ['Type', 'Bills', 'Revenue ₹'])
    types.forEach((t) => out.push([channelLabel(t.k), t.bills, Math.round(t.rev)]))
    out.push([], ['TOP ITEMS'], ['Item', 'Plates', 'Revenue ₹'])
    topItems.forEach((i) => out.push([i.name, i.qty, Math.round(i.rev)]))
    if (voids.length) {
      out.push([], ['VOIDED AFTER KOT'], ['Item', 'Qty', 'Value ₹', 'By', 'Time'])
      voids.forEach((v) => out.push([v.item, v.qty, Math.round(v.amount || 0), v.by, new Date(v.at).toLocaleTimeString('en-IN')]))
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

  const shift = (d) => setDay(new Date(new Date(day + 'T12:00:00').getTime() + d * 864e5).toISOString().slice(0, 10))

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
            <StatCard label="Guests served" value={guests || '—'} sub={guests ? `${inr0(gross / guests)} per guest` : 'guest count not entered'} icon="👥" accent={guests ? 'green' : 'stone'} />
            <StatCard label="Average bill" value={inr0(gross / paid.length)} icon="📊" accent="purple" />
            <StatCard label="Discounts" value={inr0(discount)} sub={`${pct(discount, gross + discount)}% of sales`} icon="🏷️" accent={discount > gross * 0.1 ? 'red' : 'green'} />
            <StatCard label={comp ? 'Taxable turnover' : 'GST collected'} value={inr0(comp ? taxable : tax)} sub={comp ? 'composition levy base' : 'CGST + SGST'} icon="🧾" accent="blue" />
            <StatCard label="Trading window" value={firstBill ? `${fmtTime(firstBill.paidAt)}–${fmtTime(lastBill.paidAt)}` : '—'} sub="first → last bill" icon="🕐" accent="green" />
          </div>

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

          {/* CASH DRAWER */}
          {shifts.map((sh) => {
            const z = sh.z
            const variance = z ? Math.round((z.countedCash || 0) - (z.expectedCash || 0)) : null
            return (
              <Card key={sh.id} title={`💵 Cash drawer — ${sh.openedBy || 'register'}`} sub={z ? `Closed ${new Date(sh.closedAt).toLocaleTimeString('en-IN')} by ${sh.closedBy || '—'}` : 'Still open — close it in Cash Register to lock the day'}>
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
