import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Bars, HBars } from '../charts.jsx'
import { inr0, billTotals, tableName, fmtTime, bucketize, discountReasonLabel } from '../utils.js'
import { Card, DataTable, Exports, Note, paidIn, slug, pct, amt, channelOf, channelLabel } from './shared.jsx'

// Discounts, freebies and voids — everything that left the kitchen but didn't turn
// into money. On thin restaurant margins this is usually where the profit goes.
export default function Discounts({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const voids = useMemo(
    () => (state.voidLog || []).filter((v) => v.at >= range.from && v.at < range.to).sort((a, b) => b.at - a.at),
    [state.voidLog, range]
  )

  const hh = state.settings.happyHour || {}
  const inHappyHour = (o) => {
    if (!hh.enabled) return false
    const h = new Date(o.paidAt).getHours()
    return h >= hh.from && h < hh.to
  }

  const rows = useMemo(() => paid
    .filter((o) => (o.payment?.discount || 0) > 0)
    .map((o) => {
      const bt = billTotals(o, state.settings)
      const reason = o.payment?.discountReason || null
      // "free" is either explicitly recorded as on-the-house, or inferred from a
      // bill that was discounted down to nothing (older bills carry no reason)
      const isComp = reason === 'comp' || (bt.discount >= bt.sub && bt.sub > 0)
      return { o, bt, isComp, reason, note: o.payment?.discountNote || '', rate: bt.sub ? (bt.discount / bt.sub) * 100 : 0, hh: inHappyHour(o) }
    })
    .sort((a, b) => b.bt.discount - a.bt.discount),
  [paid, state.settings, hh])

  const gross = paid.reduce((s, o) => s + amt(o), 0)
  const totalDiscount = rows.reduce((s, r) => s + r.bt.discount, 0)
  const comps = rows.filter((r) => r.isComp)
  const compValue = comps.reduce((s, r) => s + r.bt.discount, 0)
  const hhRows = rows.filter((r) => r.hh)
  const voidValue = voids.reduce((s, v) => s + (v.amount || 0), 0)

  // refunds / sales returns — money that came in and went back out again
  const refunds = useMemo(
    () => paid.filter((o) => o.refund && o.refund.at >= range.from && o.refund.at < range.to)
      .sort((a, b) => b.refund.at - a.refund.at),
    [paid, range]
  )
  const refundValue = refunds.reduce((s, o) => s + (o.refund.amount || 0), 0)

  const totalGiveaway = totalDiscount + voidValue + refundValue

  // discount over time, so a creeping habit shows up
  const trend = useMemo(
    () => bucketize(rows.map((r) => ({ ts: r.o.paidAt, value: r.bt.discount })), range),
    [rows, range]
  )

  // the headline of this report: not how much was given away, but WHY
  const byReason = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const k = r.reason || '__none'
      const g = (m[k] = m[k] || { key: k, label: r.reason ? discountReasonLabel(r.reason) : '❓ Not recorded', bills: 0, value: 0, notes: [] })
      g.bills++; g.value += r.bt.discount
      if (r.note) g.notes.push(r.note)
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])
  const unrecorded = byReason.find((g) => g.key === '__none')

  const byChannel = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const k = channelOf(r.o)
      const c = (m[k] = m[k] || { k, bills: 0, value: 0 })
      c.bills++; c.value += r.bt.discount
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const voidByItem = useMemo(() => {
    const m = {}
    voids.forEach((v) => {
      const a = (m[v.item] = m[v.item] || { name: v.item, qty: 0, value: 0, count: 0 })
      a.qty += v.qty || 0; a.value += v.amount || 0; a.count++
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [voids])

  const buildRows = () => {
    const out = [['DISCOUNTS, FREEBIES & VOIDS — ' + range.label], [],
      ['Total discount given ₹', Math.round(totalDiscount)],
      ['Discounted bills', rows.length],
      ['100% free bills', comps.length],
      ['Value given free ₹', Math.round(compValue)],
      ['Voided after KOT ₹', Math.round(voidValue)],
      ['Refunded ₹', Math.round(refundValue)], ['Sales returns', refunds.length],
      ['Total giveaway ₹', Math.round(totalGiveaway)],
      ['Giveaway as % of sales', pct(totalGiveaway, gross + totalDiscount)],
      [], ['WHY DISCOUNTS WERE GIVEN'], ['Reason', 'Bills', 'Value ₹', 'Share of discounts %']]
    byReason.forEach((g) => out.push([g.label, g.bills, Math.round(g.value), pct(g.value, totalDiscount)]))
    out.push([], ['DISCOUNTED BILLS'], ['Bill No', 'Date', 'Time', 'Type', 'Table', 'Reason', 'Note', 'Sub-total ₹', 'Discount ₹', 'Discount %', 'Free?', 'Happy hour?', 'Paid ₹', 'Mode', 'Settled by'])
    ;[...rows].reverse().forEach((r) => out.push([
      r.o.billNo, new Date(r.o.paidAt).toLocaleDateString('en-IN'), new Date(r.o.paidAt).toLocaleTimeString('en-IN'),
      r.o.type, tableName(state.tables, r.o.tableId) || '',
      r.reason ? discountReasonLabel(r.reason) : 'Not recorded', r.note,
      Math.round(r.bt.sub), Math.round(r.bt.discount),
      r.rate.toFixed(1), r.isComp ? 'YES' : '', r.hh ? 'YES' : '', amt(r.o), r.o.payment?.method || '', r.o.settledBy || '',
    ]))
    out.push([], ['REFUNDS / SALES RETURNS'], ['Bill No', 'Bill date', 'Refunded on', 'Type', 'Table', 'Reason', 'Bill ₹', 'Refunded ₹', 'Full?', 'Back via', 'By'])
    refunds.forEach((o) => out.push([
      o.billNo, new Date(o.paidAt).toLocaleDateString('en-IN'), new Date(o.refund.at).toLocaleString('en-IN'),
      o.type, tableName(state.tables, o.tableId) || '', o.refund.reason || '',
      amt(o), Math.round(o.refund.amount), o.refund.full ? 'YES' : '', o.refund.method, o.refund.by,
    ]))
    out.push([], ['VOIDED AFTER KOT'], ['Item', 'Qty', 'Value ₹', 'By', 'Table', 'When'])
    voids.forEach((v) => out.push([v.item, v.qty, Math.round(v.amount || 0), v.by, v.tableId || '', new Date(v.at).toLocaleString('en-IN')]))
    return out
  }

  if (!rows.length && !voids.length && !refunds.length) {
    return (
      <Card>
        <Empty icon="✅" text={`No discounts, refunds, freebies or voids in ${range.label.toLowerCase()} — nothing leaked.`} />
      </Card>
    )
  }

  const giveawayPct = pct(totalGiveaway, gross + totalDiscount)

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint">
        <Exports
          build={buildRows}
          name={`khaanapeena-discounts-voids-${slug(range)}`}
          title="Discounts, freebies & voids"
          period={range.label}
          settings={state.settings}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Total given away" value={inr0(totalGiveaway)} sub={`${giveawayPct}% of what you could have earned`} icon="💸" accent={giveawayPct > 10 ? 'red' : 'saffron'} />
        <StatCard label="Discounts" value={inr0(totalDiscount)} sub={`on ${rows.length} bill${rows.length === 1 ? '' : 's'}`} icon="🏷️" accent="blue" />
        <StatCard label="Refunded back" value={inr0(refundValue)} sub={`${refunds.length} sales return${refunds.length === 1 ? '' : 's'}`} icon="↩️" accent={refunds.length ? 'red' : 'green'} />
        <StatCard label="Given 100% free" value={comps.length} sub={inr0(compValue)} icon="🎁" accent={comps.length ? 'red' : 'green'} />
        <StatCard label="Voided after cooking" value={voids.length} sub={inr0(voidValue)} icon="🔒" accent={voids.length ? 'red' : 'green'} />
      </div>

      {refunds.length > 0 && (
        <Card flush className="kp-card" title="↩️ Refunds / sales returns" sub="Bills that were settled and then paid back. The invoice keeps its number — a GST invoice is credited, never deleted.">
          <DataTable
            scroll
            rows={refunds}
            keyOf={(o) => o.id}
            cols={[
              { h: 'Bill', cell: (o) => <div><span className="font-black">#{o.billNo}</span>{o.refund.full && <div className="mt-0.5"><Badge color="red">FULL</Badge></div>}</div>, foot: () => `${refunds.length} returns` },
              { h: 'Refunded', cell: (o) => <div><div>{new Date(o.refund.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div><div className="text-[11px] text-stone-400">{fmtTime(o.refund.at)} · by {o.refund.by}</div></div> },
              { h: 'Type', cell: (o) => <div><div className="text-xs">{channelLabel(channelOf(o))}</div>{o.tableId && <div className="text-[11px] text-stone-400">🪑 {tableName(state.tables, o.tableId)}</div>}</div> },
              { h: 'Reason', cell: (o) => o.refund.reason || <span className="text-stone-300">not given</span> },
              { h: 'Bill was', num: true, cell: (o) => inr0(amt(o)), foot: () => inr0(refunds.reduce((s, o) => s + amt(o), 0)) },
              { h: 'Refunded', num: true, cell: (o) => <b className="text-red-600">−{inr0(o.refund.amount)}</b>, foot: () => inr0(refundValue) },
              { h: 'Back via', cell: (o) => <Badge color={o.refund.method === 'cash' ? 'green' : 'blue'}>{String(o.refund.method).toUpperCase()}</Badge> },
            ]}
          />
        </Card>
      )}

      {giveawayPct > 10 && (
        <Note tone="red">
          <b>{giveawayPct}% of your potential sales was discounted, comped or voided.</b> On typical restaurant margins anything above 10% eats most of the profit. Check the 100%-free bills and the void list below — those are the two places it usually hides.
        </Note>
      )}

      {hh.enabled && hhRows.length > 0 && (
        <Note tone="blue">
          {hhRows.length} of {rows.length} discounted bills fall inside your happy hour ({hh.from}:00–{hh.to}:00, {hh.discountPct}% off), worth {inr0(hhRows.reduce((s, r) => s + r.bt.discount, 0))}. The remaining {inr0(totalDiscount - hhRows.reduce((s, r) => s + r.bt.discount, 0))} was given outside that window.
        </Note>
      )}

      {/* WHY — the whole point of asking at the till */}
      {rows.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4 mb-4">
          <Card className="!mb-0" flush title="Why discounts were given" sub="Recorded by whoever closed the bill">
            <DataTable
              rows={byReason}
              keyOf={(g) => g.key}
              cols={[
                { h: 'Reason', cell: (g) => (
                  <div>
                    <span className="font-semibold">{g.label}</span>
                    {g.notes.length > 0 && <div className="text-[11px] text-stone-400 truncate max-w-[200px]">{[...new Set(g.notes)].slice(0, 3).join(' · ')}</div>}
                  </div>
                ), foot: () => 'Total' },
                { h: 'Bills', num: true, cell: (g) => g.bills, foot: () => rows.length },
                { h: 'Value', num: true, cell: (g) => <b className="text-red-600">{inr0(g.value)}</b>, foot: () => inr0(totalDiscount) },
                { h: 'Share', num: true, cell: (g) => pct(g.value, totalDiscount) + '%', foot: () => '100%' },
              ]}
            />
          </Card>
          <Card className="!mb-0" title="Where the money went" sub="Biggest give-away reason first">
            <HBars data={byReason.map((g) => ({ label: g.label.replace(/^\S+\s/, ''), value: Math.round(g.value) }))} color="#dc2626" />
          </Card>
        </div>
      )}

      {unrecorded && unrecorded.bills > 0 && (
        <Note>
          {unrecorded.bills} discounted bill{unrecorded.bills > 1 ? 's' : ''} worth {inr0(unrecorded.value)} {unrecorded.bills > 1 ? 'carry' : 'carries'} no reason — {unrecorded.bills === rows.length ? 'these were settled before the reason prompt existed' : 'settled before the reason prompt existed'}. Every discount from now on has to state why before the bill can close.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" title="Discounts over time" sub="A rising line means the habit is spreading">
          {trend.length ? <Bars data={trend} color="#dc2626" /> : <Empty text="No discounts" />}
        </Card>
        <Card className="!mb-0" flush title="Discount by order type" sub="Where the money is being given up">
          <DataTable
            rows={byChannel}
            keyOf={(c) => c.k}
            empty="No discounts given"
            cols={[
              { h: 'Type', cell: (c) => <span className="text-xs font-semibold">{channelLabel(c.k)}</span>, foot: () => 'Total' },
              { h: 'Bills', num: true, cell: (c) => c.bills, foot: () => rows.length },
              { h: 'Discount', num: true, cell: (c) => <b className="text-red-600">{inr0(c.value)}</b>, foot: () => inr0(totalDiscount) },
            ]}
          />
        </Card>
      </div>

      {rows.length > 0 && (
        <Card flush title="Every discounted bill" sub="Biggest first — 100%-free bills are flagged">
          <DataTable
            scroll
            rows={rows}
            keyOf={(r) => r.o.id}
            cols={[
              { h: 'Bill', cell: (r) => <div><span className="font-black">#{r.o.billNo}</span>{r.isComp && <div className="mt-0.5"><Badge color="red">100% FREE</Badge></div>}</div>, foot: () => `${rows.length} bills` },
              { h: 'When', cell: (r) => <div><div>{new Date(r.o.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div><div className="text-[11px] text-stone-400">{fmtTime(r.o.paidAt)}{r.hh ? ' · happy hr' : ''}</div></div> },
              { h: 'Type', cell: (r) => <div><div className="text-xs">{channelLabel(channelOf(r.o))}</div>{r.o.tableId && <div className="text-[11px] text-stone-400">🪑 {tableName(state.tables, r.o.tableId)}</div>}</div> },
              { h: 'Reason', cell: (r) => r.reason
                ? <div><span className="text-xs font-semibold">{discountReasonLabel(r.reason)}</span>{r.note && <div className="text-[11px] text-stone-400">{r.note}</div>}</div>
                : <span className="text-[11px] text-stone-300">not recorded</span> },
              { h: 'Given by', cell: (r) => <span className="text-xs text-stone-500">{r.o.settledBy || '—'}</span> },
              { h: 'Bill was', num: true, cell: (r) => inr0(r.bt.sub), foot: () => inr0(rows.reduce((s, r) => s + r.bt.sub, 0)) },
              { h: 'Discount', num: true, cell: (r) => <b className="text-red-600">−{inr0(r.bt.discount)}</b>, foot: () => inr0(totalDiscount) },
              { h: '% off', num: true, cell: (r) => <Badge color={r.rate >= 100 ? 'red' : r.rate > 20 ? 'amber' : 'stone'}>{r.rate.toFixed(0)}%</Badge> },
              { h: 'Paid', num: true, cell: (r) => inr0(amt(r.o)), foot: () => inr0(rows.reduce((s, r) => s + amt(r.o), 0)) },
            ]}
          />
        </Card>
      )}

      {voids.length > 0 && (
        <div className="grid lg:grid-cols-2 gap-4">
          <Card className="!mb-0" flush title="🔒 Voided after the kitchen had it" sub="Food was already being cooked when this came off the bill">
            <DataTable
              scroll
              rows={voids}
              keyOf={(v) => v.id}
              cols={[
                { h: 'Item', cell: (v) => <div><span className="font-semibold">{v.qty}× {v.item}</span><div className="text-[11px] text-stone-400">by {v.by}{v.tableId ? ` · 🪑 ${tableName(state.tables, v.tableId)}` : ''}</div></div>, foot: () => 'Total' },
                { h: 'When', cell: (v) => <span className="text-xs text-stone-500">{new Date(v.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
                { h: 'Value', num: true, cell: (v) => <b className="text-red-600">{inr0(v.amount || 0)}</b>, foot: () => inr0(voidValue) },
              ]}
            />
          </Card>
          <Card className="!mb-0" title="Most-voided dishes" sub="A dish voided again and again usually means a menu or kitchen problem, not a customer one">
            <HBars data={voidByItem.slice(0, 8).map((v) => ({ label: v.name, value: Math.round(v.value) }))} color="#dc2626" />
          </Card>
        </div>
      )}
    </>
  )
}
