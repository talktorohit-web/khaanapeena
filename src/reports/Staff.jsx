import React, { useMemo } from 'react'
import { StatCard, Badge } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, NeedsData, Note, download, paidIn, slug, pct, amt, coversOf } from './shared.jsx'

// Employee-of-the-month scoring. Deliberately a fixed, published list rather than a
// tuned formula: the owner has to be able to read why someone won and argue with it.
// Positive weights add up to 100; the penalties can take 25 points back off.
const EARNED = [
  { k: 'sales', w: 35, label: 'Money collected', why: 'the value of the bills they settled' },
  { k: 'orders', w: 25, label: 'Orders taken', why: 'how much business they personally brought in' },
  { k: 'avg', w: 25, label: 'Average bill', why: 'upselling — a bigger bill off the same guests' },
  { k: 'covers', w: 15, label: 'Guests served', why: 'how many people they actually looked after' },
]
const LOST = [
  { k: 'discRate', w: 10, label: 'Discounts given', why: 'measured as a share of their own sales, so a busy person is not punished for being busy' },
  { k: 'voidValue', w: 10, label: 'Voids authorised', why: 'food that was cooked and then taken off a bill' },
  { k: 'refundValue', w: 5, label: 'Refunds', why: 'money handed back after the bill had closed' },
]

// who was looking after the table: the assigned waiter when there is one, else
// whoever punched the order in
const waiterOf = (o) => o.waiterName || o.takenBy || null

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

  const refunds = useMemo(
    () => paid.filter((o) => o.refund && o.refund.by && o.refund.at >= range.from && o.refund.at < range.to),
    [paid, range]
  )

  // ---- employee of the month ----
  // One row per person, gathered from every place a name is stamped, then scored.
  const scored = useMemo(() => {
    const m = {}
    const person = (name) => (m[name] = m[name] || {
      name, sales: 0, bills: 0, orders: 0, plates: 0, covers: 0, coverBills: 0,
      discount: 0, voidValue: 0, voidCount: 0, refundValue: 0, refundCount: 0,
    })
    attributed.forEach((o) => {
      const p = person(o.settledBy)
      p.sales += amt(o); p.bills++; p.discount += o.payment?.discount || 0
    })
    punched.forEach((o) => {
      const p = person(o.takenBy)
      p.orders++
      p.plates += (o.items || []).reduce((s, li) => s + li.qty, 0)
    })
    // covers follow the waiter on the table, which is a different question from who
    // rang the bill — a bill with no head count stays out of the average entirely
    ;(state.orders || []).forEach((o) => {
      const w = waiterOf(o)
      if (!w || !(o.createdAt >= range.from && o.createdAt < range.to)) return
      const c = coversOf(o)
      if (!c) return
      const p = person(w)
      p.covers += c; p.coverBills++
    })
    voids.forEach((v) => { const p = person(v.by || 'Unknown'); p.voidValue += v.amount || 0; p.voidCount++ })
    refunds.forEach((o) => { const p = person(o.refund.by); p.refundValue += o.refund.amount || 0; p.refundCount++ })

    const people = Object.values(m).map((p) => ({
      ...p,
      avg: p.bills ? p.sales / p.bills : 0,
      // a giveaway rate, not a rupee total, so volume alone can't lose you points
      discRate: p.sales + p.discount ? p.discount / (p.sales + p.discount) : 0,
    }))
    if (!people.length) return []

    // every component is scored against the best performer on that component, so
    // the winner of each column always takes its full weight
    const tops = {}
    ;[...EARNED, ...LOST].forEach((c) => { tops[c.k] = Math.max(...people.map((p) => p[c.k]), 0) })

    return people.map((p) => {
      const parts = {}
      let score = 0
      EARNED.forEach((c) => {
        const pts = tops[c.k] ? (p[c.k] / tops[c.k]) * c.w : 0
        parts[c.k] = pts; score += pts
      })
      LOST.forEach((c) => {
        const pts = tops[c.k] ? (p[c.k] / tops[c.k]) * c.w : 0
        parts[c.k] = -pts; score -= pts
      })
      return { ...p, parts, score }
    }).sort((a, b) => b.score - a.score)
  }, [attributed, punched, voids, refunds, state.orders, range])

  // someone with no sales and no orders is a name on a void log, not a candidate
  const candidates = scored.filter((p) => p.sales > 0 || p.orders > 0)
  const champion = candidates[0]

  const exportCsv = () => {
    const out = [['STAFF PERFORMANCE — ' + range.label], []]
    if (candidates.length) {
      out.push(['EMPLOYEE OF THE PERIOD — ' + (champion?.name || '')],
        ['Scored out of 100 earned points, less up to 25 for giveaways'],
        ['Staff', 'Score', 'Collected ₹', 'pts', 'Orders taken', 'pts', 'Avg bill ₹', 'pts', 'Guests served', 'pts',
          'Discount % of own sales', 'pts', 'Voids ₹', 'pts', 'Refunds ₹', 'pts'])
      candidates.forEach((p) => out.push([
        p.name, p.score.toFixed(1),
        Math.round(p.sales), p.parts.sales.toFixed(1),
        p.orders, p.parts.orders.toFixed(1),
        Math.round(p.avg), p.parts.avg.toFixed(1),
        p.covers || '—', p.parts.covers.toFixed(1),
        (p.discRate * 100).toFixed(1), p.parts.discRate.toFixed(1),
        Math.round(p.voidValue), p.parts.voidValue.toFixed(1),
        Math.round(p.refundValue), p.parts.refundValue.toFixed(1),
      ]))
      out.push([])
    }
    out.push(['CASHIER COLLECTION'], ['Cashier', 'Bills', 'Collected ₹', 'Avg bill ₹', 'Cash ₹', 'UPI ₹', 'Card ₹', 'Online ₹', 'Discounts given ₹', 'Discount % of own sales'])
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

      {/* EMPLOYEE OF THE MONTH — every component on show, never just a number */}
      {candidates.length > 0 ? (
        <>
          <Card
            className="kp-card"
            title={`🏆 Employee of the period — ${range.label.toLowerCase()}`}
            sub="Ranked on seven things at once. Every one of them is in the table below, with the points it earned, so you can see exactly why the winner won."
          >
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-16 h-16 rounded-2xl bg-saffron-50 flex items-center justify-center text-3xl shrink-0">👑</div>
              <div className="min-w-0">
                <div className="text-2xl font-black text-ink-900">{champion.name}</div>
                <div className="text-sm text-stone-500">
                  {inr0(champion.sales)} collected on {champion.bills} bill{champion.bills === 1 ? '' : 's'}
                  {champion.orders ? ` · ${champion.orders} order${champion.orders === 1 ? '' : 's'} taken` : ''}
                  {champion.covers ? ` · ${champion.covers} guests served` : ''}
                  {champion.bills ? ` · ${inr0(champion.avg)} average bill` : ''}
                </div>
              </div>
              <div className="ml-auto text-right">
                <div className="text-3xl font-black text-saffron-600 tabular-nums">{champion.score.toFixed(0)}</div>
                <div className="text-[11px] text-stone-400">points</div>
              </div>
            </div>
            {candidates.length === 1 && (
              <p className="text-xs text-stone-400 mt-3">
                Only one person has bills or orders against their name in this period, so there is nobody to rank them against — the score is 100 by default.
              </p>
            )}
          </Card>

          <Card
            flush
            className="kp-card"
            title="How the score is built"
            sub="Big number on top is what they did; small number underneath is what it was worth"
          >
            <DataTable
              rows={candidates}
              keyOf={(p) => p.name}
              cols={[
                { h: 'Staff', cell: (p, i) => (
                  <div>
                    <span className="font-semibold text-ink-900">{i === 0 ? '👑 ' : `${i + 1}. `}{p.name}</span>
                    <div className="text-[11px] text-stone-400">{p.bills} bill{p.bills === 1 ? '' : 's'} settled</div>
                  </div>
                ) },
                { h: 'Money collected', num: true, cell: (p) => <Part v={inr0(p.sales)} pts={p.parts.sales} /> },
                { h: 'Orders taken', num: true, cell: (p) => <Part v={p.orders || '—'} pts={p.parts.orders} /> },
                { h: 'Average bill', num: true, cell: (p) => <Part v={p.bills ? inr0(p.avg) : '—'} pts={p.parts.avg} /> },
                { h: 'Guests served', num: true, cell: (p) => <Part v={p.covers || '—'} pts={p.parts.covers} /> },
                { h: 'Discounts', num: true, cell: (p) => <Part v={p.discount ? `${(p.discRate * 100).toFixed(1)}%` : '—'} pts={p.parts.discRate} /> },
                { h: 'Voids', num: true, cell: (p) => <Part v={p.voidValue ? inr0(p.voidValue) : '—'} pts={p.parts.voidValue} /> },
                { h: 'Refunds', num: true, cell: (p) => <Part v={p.refundValue ? inr0(p.refundValue) : '—'} pts={p.parts.refundValue} /> },
                { h: 'Score', num: true, cell: (p, i) => (
                  <Badge color={i === 0 ? 'saffron' : p.score < 0 ? 'red' : 'stone'}>{p.score.toFixed(0)}</Badge>
                ) },
              ]}
            />
            <div className="px-5 pb-5 pt-3 text-xs text-stone-500 leading-relaxed border-t border-stone-50">
              <p className="mb-2">
                <b>How the points work.</b> On each of the seven measures, whoever is best in this period takes the full weight and everyone else
                gets their share of it. The four things that earn points add up to 100:{' '}
                {EARNED.map((c) => `${c.label} ${c.w}`).join(', ')}. The three that lose points can take up to 25 back off:{' '}
                {LOST.map((c) => `${c.label} ${c.w}`).join(', ')}.
              </p>
              <ul className="space-y-0.5">
                {[...EARNED, ...LOST].map((c) => (
                  <li key={c.k} className="text-[11px] text-stone-400">
                    <b className="text-stone-500">{c.label} ({c.w})</b> — {c.why}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-stone-400">
                Guest counts come from the head count on the table, so anyone whose tables were never counted scores nothing there rather than being
                credited with a guess. Nobody is ranked on a measure the till never recorded.
              </p>
            </div>
          </Card>
        </>
      ) : (
        <NeedsData icon="🏆" title="Not enough is attributed to rank anyone yet">
          Employee of the month needs bills settled under a staff name, or orders punched under one. Turn on <b>Staff Login</b> in
          Settings → Staff access so every bill is signed, and assign a waiter to each table — the ranking fills itself from there.
        </NeedsData>
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

// one scoring component: what they did, and underneath it what that was worth
const Part = ({ v, pts }) => (
  <div>
    <div className="font-semibold text-ink-900">{v}</div>
    <div className={`text-[11px] tabular-nums ${pts > 0 ? 'text-leaf-600' : pts < 0 ? 'text-red-600' : 'text-stone-300'}`}>
      {pts === 0 ? '0 pts' : `${pts > 0 ? '+' : '−'}${Math.abs(pts).toFixed(1)} pts`}
    </div>
  </div>
)
