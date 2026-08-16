import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { Bars, HBars } from '../charts.jsx'
import { inr0, billTotals, tableName, fmtTime, bucketize } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, pct, amt, channelOf, channelLabel } from './shared.jsx'

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
      const isComp = bt.discount >= bt.sub && bt.sub > 0
      return { o, bt, isComp, rate: bt.sub ? (bt.discount / bt.sub) * 100 : 0, hh: inHappyHour(o) }
    })
    .sort((a, b) => b.bt.discount - a.bt.discount),
  [paid, state.settings, hh])

  const gross = paid.reduce((s, o) => s + amt(o), 0)
  const totalDiscount = rows.reduce((s, r) => s + r.bt.discount, 0)
  const comps = rows.filter((r) => r.isComp)
  const compValue = comps.reduce((s, r) => s + r.bt.discount, 0)
  const hhRows = rows.filter((r) => r.hh)
  const voidValue = voids.reduce((s, v) => s + (v.amount || 0), 0)
  const totalGiveaway = totalDiscount + voidValue

  // discount over time, so a creeping habit shows up
  const trend = useMemo(
    () => bucketize(rows.map((r) => ({ ts: r.o.paidAt, value: r.bt.discount })), range),
    [rows, range]
  )

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

  const exportCsv = () => {
    const out = [['DISCOUNTS, FREEBIES & VOIDS — ' + range.label], [],
      ['Total discount given ₹', Math.round(totalDiscount)],
      ['Discounted bills', rows.length],
      ['100% free bills', comps.length],
      ['Value given free ₹', Math.round(compValue)],
      ['Voided after KOT ₹', Math.round(voidValue)],
      ['Total giveaway ₹', Math.round(totalGiveaway)],
      ['Giveaway as % of sales', pct(totalGiveaway, gross + totalDiscount)],
      [], ['DISCOUNTED BILLS'], ['Bill No', 'Date', 'Time', 'Type', 'Table', 'Sub-total ₹', 'Discount ₹', 'Discount %', 'Free?', 'Happy hour?', 'Paid ₹', 'Mode']]
    ;[...rows].reverse().forEach((r) => out.push([
      r.o.billNo, new Date(r.o.paidAt).toLocaleDateString('en-IN'), new Date(r.o.paidAt).toLocaleTimeString('en-IN'),
      r.o.type, tableName(state.tables, r.o.tableId) || '', Math.round(r.bt.sub), Math.round(r.bt.discount),
      r.rate.toFixed(1), r.isComp ? 'YES' : '', r.hh ? 'YES' : '', amt(r.o), r.o.payment?.method || '',
    ]))
    out.push([], ['VOIDED AFTER KOT'], ['Item', 'Qty', 'Value ₹', 'By', 'Table', 'When'])
    voids.forEach((v) => out.push([v.item, v.qty, Math.round(v.amount || 0), v.by, v.tableId || '', new Date(v.at).toLocaleString('en-IN')]))
    download(`khaanapeena-discounts-voids-${slug(range)}.csv`, out)
  }

  if (!rows.length && !voids.length) {
    return (
      <Card>
        <Empty icon="✅" text={`No discounts, freebies or voids in ${range.label.toLowerCase()} — nothing leaked.`} />
      </Card>
    )
  }

  const giveawayPct = pct(totalGiveaway, gross + totalDiscount)

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Total given away" value={inr0(totalGiveaway)} sub={`${giveawayPct}% of what you could have earned`} icon="💸" accent={giveawayPct > 10 ? 'red' : 'saffron'} />
        <StatCard label="Discounts" value={inr0(totalDiscount)} sub={`on ${rows.length} bill${rows.length === 1 ? '' : 's'}`} icon="🏷️" accent="blue" />
        <StatCard label="Given 100% free" value={comps.length} sub={inr0(compValue)} icon="🎁" accent={comps.length ? 'red' : 'green'} />
        <StatCard label="Voided after cooking" value={voids.length} sub={inr0(voidValue)} icon="🔒" accent={voids.length ? 'red' : 'green'} />
        <StatCard label="Avg discount" value={rows.length ? inr0(totalDiscount / rows.length) : '₹0'} sub={rows.length ? `${(rows.reduce((s, r) => s + r.rate, 0) / rows.length).toFixed(0)}% off a bill` : ''} icon="📉" accent="purple" />
      </div>

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
              { h: 'Items', cell: (r) => <span className="text-stone-600 text-xs">{(r.o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ')}</span> },
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
