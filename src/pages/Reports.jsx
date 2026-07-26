import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, btnGhost, Badge, Empty } from '../components.jsx'
import { Bars, Donut, HBars } from '../charts.jsx'
import { inr0, inr, reportRange, bucketize } from '../utils.js'

const RANGE_KEYS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'],
  ['week', 'This week'], ['30d', '30 days'], ['month', 'This month'], ['all', 'All'],
]

const MODES = [
  { key: 'cash', label: 'Cash', icon: '💵', color: '#16a34a' },
  { key: 'upi', label: 'UPI', icon: '📲', color: '#2563eb' },
  { key: 'card', label: 'Card', icon: '💳', color: '#9333ea' },
  { key: 'online', label: 'Online (Zomato/Swiggy)', icon: '🛵', color: '#f06008' },
]

function download(name, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

export default function Reports() {
  const { state, t } = useStore()
  const [tab, setTab] = useState('sales')
  const [rangeKey, setRangeKey] = useState('7d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)

  const range = useMemo(() => reportRange(showCustom ? 'custom' : rangeKey, custom), [rangeKey, custom, showCustom])

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t('reports')}</h1>
          <p className="text-xs text-stone-400">{range.label} · {new Date(range.from).toLocaleDateString('en-IN')} → {new Date(Math.min(range.to, Date.now())).toLocaleDateString('en-IN')}</p>
        </div>
        <div className="flex gap-2">
          {[['sales', '💰 Sales & Earnings'], ['inventory', '📦 Inventory']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
          ))}
        </div>
      </div>

      {/* range selector */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {RANGE_KEYS.map(([k, l]) => (
          <button
            key={k}
            onClick={() => { setRangeKey(k); setShowCustom(false) }}
            className={`px-3 py-1.5 rounded-full text-xs font-bold ${!showCustom && rangeKey === k ? 'bg-saffron-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
          >{l}</button>
        ))}
        <button onClick={() => setShowCustom((v) => !v)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${showCustom ? 'bg-saffron-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>📅 Custom</button>
        {showCustom && (
          <div className="flex items-center gap-1 text-xs">
            <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="border border-stone-200 rounded-lg px-2 py-1" />
            <span className="text-stone-400">→</span>
            <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="border border-stone-200 rounded-lg px-2 py-1" />
          </div>
        )}
      </div>

      {tab === 'sales' ? <SalesReport state={state} range={range} /> : <InventoryReport state={state} range={range} />}
    </div>
  )
}

function SalesReport({ state, range }) {
  const paid = useMemo(
    () => state.orders.filter((o) => o.status === 'paid' && o.paidAt >= range.from && o.paidAt < range.to),
    [state.orders, range]
  )

  const gross = paid.reduce((s, o) => s + (o.payment?.amount || 0), 0)
  const discount = paid.reduce((s, o) => s + (o.payment?.discount || 0), 0)
  const bills = paid.length
  const avg = bills ? Math.round(gross / bills) : 0
  const netTaxable = Math.round(gross / 1.05)

  // payment mode breakdown
  const modeRows = MODES.map((m) => {
    const os = paid.filter((o) => (o.payment?.method || 'cash') === m.key)
    const amount = os.reduce((s, o) => s + (o.payment?.amount || 0), 0)
    return { ...m, amount, count: os.length, pct: gross ? Math.round((amount / gross) * 100) : 0 }
  })

  // earnings trend (bucketed by range)
  const trend = useMemo(
    () => bucketize(paid.map((o) => ({ ts: o.paidAt, value: o.payment?.amount || 0 })), range),
    [paid, range]
  )
  const trendLabelEvery = trend.length > 16 ? 3 : trend.length > 9 ? 2 : 1

  // channel mix (by bills)
  const channels = [
    { label: 'Dine-in', value: paid.filter((o) => o.type === 'dine').length },
    { label: 'Takeaway', value: paid.filter((o) => o.type === 'takeaway').length },
    { label: 'QR / self', value: paid.filter((o) => ['qr', 'qr-guest'].includes(o.type) || o.source === 'qr-guest').length },
    { label: 'Delivery', value: paid.filter((o) => o.type === 'delivery').length },
    { label: 'Zomato', value: paid.filter((o) => o.type === 'zomato').length },
    { label: 'Swiggy', value: paid.filter((o) => o.type === 'swiggy').length },
  ].filter((c) => c.value > 0).map((c) => ({ ...c, value: c.value }))

  // top items
  const itemAgg = {}
  paid.forEach((o) => (o.items || []).forEach((li) => {
    const a = (itemAgg[li.name] = itemAgg[li.name] || { qty: 0, rev: 0 })
    a.qty += li.qty; a.rev += li.qty * li.price
  }))
  const topByRev = Object.entries(itemAgg).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8).map(([label, v]) => ({ label, value: v.rev }))
  const topByQty = Object.entries(itemAgg).sort((a, b) => b[1].qty - a[1].qty).slice(0, 8).map(([label, v]) => ({ label, value: v.qty }))

  // day-of-week performance
  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => ({ label, value: 0 }))
  paid.forEach((o) => { const i = (new Date(o.paidAt).getDay() + 6) % 7; dow[i].value += o.payment?.amount || 0 })

  // GST
  const own = paid.filter((o) => !['zomato', 'swiggy'].includes(o.type))
  const eco = paid.filter((o) => ['zomato', 'swiggy'].includes(o.type))
  const ownGross = own.reduce((s, o) => s + (o.payment?.amount || 0), 0)
  const ecoGross = eco.reduce((s, o) => s + (o.payment?.amount || 0), 0)
  const ownTaxable = Math.round(ownGross / 1.05)
  const ownGst = ownGross - ownTaxable

  const exportBills = () => {
    const rows = [['Bill No', 'Date', 'Time', 'Type', 'Table', 'Items', 'Payment mode', 'Discount', 'Amount (₹)']]
    ;[...paid].sort((a, b) => a.paidAt - b.paidAt).forEach((o) => rows.push([
      o.billNo, new Date(o.paidAt).toLocaleDateString('en-IN'), new Date(o.paidAt).toLocaleTimeString('en-IN'),
      o.type, o.tableId || '', o.items.map((i) => `${i.qty}x ${i.name}`).join('; '),
      o.payment?.method || '', o.payment?.discount || 0, o.payment?.amount || 0,
    ]))
    rows.push([])
    rows.push(['SUMMARY — ' + range.label])
    rows.push(['Total earnings', '', '', '', '', '', '', '', gross])
    modeRows.forEach((m) => rows.push([m.label, '', '', '', '', '', '', m.count + ' bills', m.amount]))
    download(`khaanapeena-sales-${range.label.replace(/\s+/g, '-').toLowerCase()}.csv`, rows)
  }

  if (bills === 0) {
    return (
      <div className="bg-white rounded-2xl border border-stone-100 py-4">
        <Empty icon="🧾" text={`No settled bills in ${range.label.toLowerCase()}. Settle some orders in Billing, then they'll appear here.`} />
      </div>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={exportBills} className={btnGhost}>⬇️ Export CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Total earnings" value={inr0(gross)} sub={`${range.label}`} icon="💰" accent="saffron" />
        <StatCard label="Net (pre-GST)" value={inr0(netTaxable)} sub="taxable value" icon="🧮" accent="blue" />
        <StatCard label="Bills" value={bills} icon="🧾" accent="green" />
        <StatCard label="Avg. bill" value={inr0(avg)} icon="📊" accent="purple" />
        <StatCard label="Discounts given" value={inr0(discount)} icon="🏷️" accent="red" />
      </div>

      {/* PAYMENT MODE BREAKDOWN */}
      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Earnings by payment mode</h3>
          <p className="text-xs text-stone-400 mb-3">How much came in as cash vs UPI vs card vs online</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                <th className="py-2">Mode</th><th>Bills</th><th>Amount</th><th className="w-1/3">Share</th>
              </tr>
            </thead>
            <tbody>
              {modeRows.map((m) => (
                <tr key={m.key} className="border-b border-stone-50">
                  <td className="py-2.5 font-semibold">{m.icon} {m.label}</td>
                  <td>{m.count}</td>
                  <td className="font-bold">{inr0(m.amount)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-stone-100 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                      </div>
                      <span className="text-xs font-bold w-9 text-right">{m.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 font-black">Total</td><td className="font-black">{bills}</td>
                <td className="font-black text-saffron-700">{inr0(gross)}</td><td></td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Cash vs digital</h3>
          <p className="text-xs text-stone-400 mb-3">By amount</p>
          <Donut data={modeRows.filter((m) => m.amount > 0).map((m) => ({ label: m.label.split(' ')[0], value: m.amount }))} />
        </div>
      </div>

      {/* EARNINGS TREND */}
      <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
        <h3 className="font-bold text-ink-900 mb-1">Earnings trend</h3>
        <p className="text-xs text-stone-400 mb-3">₹ per {range.bucket === 'hour' ? 'hour' : range.bucket === 'week' ? 'week' : 'day'} · {range.label}</p>
        <Bars data={trend} labelEvery={trendLabelEvery} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Top items by revenue</h3>
          {topByRev.length ? <HBars data={topByRev} /> : <Empty text="No items" />}
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Most sold (by plates)</h3>
          {topByQty.length ? <HBars data={topByQty} color="#2563eb" fmt={(v) => v + ' plates'} /> : <Empty text="No items" />}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">By day of week</h3>
          <p className="text-xs text-stone-400 mb-3">Total ₹ earned</p>
          <Bars data={dow} color="#9333ea" />
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Order channels</h3>
          <p className="text-xs text-stone-400 mb-3">Share of bills</p>
          {channels.length ? <HBars data={channels} color="#16a34a" fmt={(v) => v + ''} /> : <Empty text="No orders" />}
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-2">GST summary</h3>
          <Row l="Your gross (own)" v={inr0(ownGross)} />
          <Row l="Taxable value" v={inr0(ownTaxable)} />
          <Row l="CGST @2.5%" v={inr0(Math.round(ownGst / 2))} />
          <Row l="SGST @2.5%" v={inr0(Math.round(ownGst / 2))} />
          <div className="border-t border-stone-100 my-2" />
          <Row l="Via Zomato/Swiggy" v={inr0(ecoGross)} />
          <p className="text-[10px] text-stone-400 mt-1">Aggregator deposits GST on their sales under Sec 9(5) — not payable by you.</p>
        </div>
      </div>
    </>
  )
}

function InventoryReport({ state, range }) {
  // consumption over the range: from recipes of KOT'd orders in [from,to)
  const usage = useMemo(() => {
    const u = {}
    state.orders.forEach((o) => {
      if (!o.kotAt || o.kotAt < range.from || o.kotAt >= range.to || o.status === 'cancelled') return
      ;(o.items || []).forEach((li) => {
        const item = state.items.find((i) => i.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => { u[ingId] = (u[ingId] || 0) + qty * li.qty })
      })
    })
    return u
  }, [state.orders, state.items, range])

  const spanDays = Math.max(1, (Math.min(range.to, Date.now()) - range.from) / 864e5)

  const rows = state.ingredients.map((g) => {
    const used = usage[g.id] || 0
    const usedValue = used * g.costPerUnit
    const perDay = used / spanDays
    const daysLeft = perDay > 0 ? g.stock / perDay : Infinity
    return { ...g, used, usedValue, daysLeft, stockValue: g.stock * g.costPerUnit }
  })

  const stockValue = rows.reduce((s, r) => s + r.stockValue, 0)
  const consumptionValue = rows.reduce((s, r) => s + r.usedValue, 0)
  const low = rows.filter((r) => r.stock <= r.minStock)

  // wastage in range
  const waste = state.waste.filter((w) => {
    const ts = new Date(w.date).getTime()
    return ts >= range.from && ts < range.to
  })
  const wasteValue = waste.reduce((s, w) => s + (w.lossValue || 0), 0)
  const wasteByReason = {}
  waste.forEach((w) => { wasteByReason[w.reason] = (wasteByReason[w.reason] || 0) + (w.lossValue || 0) })
  const wasteBars = Object.entries(wasteByReason).map(([label, value]) => ({ label, value }))

  const consumptionBars = rows.filter((r) => r.usedValue > 0).sort((a, b) => b.usedValue - a.usedValue).slice(0, 8)
    .map((r) => ({ label: r.name, value: Math.round(r.usedValue) }))

  const exportInv = () => {
    const out = [['Ingredient', 'Unit', 'In stock', 'Min', 'Used (' + range.label + ')', 'Consumption ₹', 'Days left', 'Stock value ₹']]
    rows.forEach((r) => out.push([
      r.name, r.unit, r.stock, r.minStock, +r.used.toFixed(2), Math.round(r.usedValue),
      r.daysLeft === Infinity ? '—' : r.daysLeft.toFixed(1), Math.round(r.stockValue),
    ]))
    out.push([])
    out.push(['Total stock value', '', '', '', '', '', '', Math.round(stockValue)])
    out.push(['Consumption value', '', '', '', '', Math.round(consumptionValue)])
    out.push(['Wastage value', '', '', '', '', Math.round(wasteValue)])
    download(`khaanapeena-inventory-${range.label.replace(/\s+/g, '-').toLowerCase()}.csv`, out)
  }

  return (
    <>
      <div className="flex justify-end mb-3">
        <button onClick={exportInv} className={btnGhost}>⬇️ Export CSV</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Current stock value" value={inr0(stockValue)} icon="📦" accent="saffron" />
        <StatCard label="Consumed" value={inr0(consumptionValue)} sub={range.label} icon="🍳" accent="blue" />
        <StatCard label="Wastage" value={inr0(wasteValue)} sub={`${waste.length} entries`} icon="🗑️" accent="red" />
        <StatCard label="Low stock items" value={low.length} sub={low.slice(0, 2).map((l) => l.name).join(', ') || 'All stocked ✓'} icon="⚠️" accent={low.length ? 'red' : 'green'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Top consumption by value</h3>
          {consumptionBars.length ? <HBars data={consumptionBars} /> : <Empty text="No consumption recorded in this period" />}
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Wastage by reason</h3>
          {wasteBars.length ? <HBars data={wasteBars} color="#dc2626" /> : <Empty text="No wastage logged in this period 🎉" />}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-x-auto">
        <div className="p-4 pb-0"><h3 className="font-bold text-ink-900">Ingredient stock & consumption — {range.label}</h3></div>
        <table className="w-full text-sm mt-2">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="py-2 px-4">Ingredient</th><th>In stock</th><th>Used</th><th>Consumption ₹</th><th>Days left</th><th>Stock value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-stone-50 ${r.stock <= r.minStock ? 'bg-red-50/40' : ''}`}>
                <td className="py-2.5 px-4 font-semibold">{r.name} {r.stock <= r.minStock && <Badge color="red">low</Badge>}</td>
                <td>{r.stock} {r.unit}</td>
                <td>{r.used.toFixed(2)} {r.unit}</td>
                <td>{inr0(r.usedValue)}</td>
                <td>{r.daysLeft === Infinity ? <span className="text-stone-300">—</span> : r.daysLeft < 3 ? <Badge color="red">{r.daysLeft.toFixed(1)}d</Badge> : `${r.daysLeft.toFixed(0)}d`}</td>
                <td className="font-semibold">{inr0(r.stockValue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}

const Row = ({ l, v }) => <div className="flex justify-between py-0.5 text-stone-600 text-sm"><span>{l}</span><b className="text-ink-900">{v}</b></div>
