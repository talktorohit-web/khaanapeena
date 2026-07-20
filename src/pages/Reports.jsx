import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, btnGhost } from '../components.jsx'
import { Bars, Donut, HBars } from '../charts.jsx'
import { inr0, dayKey, fmtDate } from '../utils.js'

export default function Reports() {
  const { state, t } = useStore()
  const [range, setRange] = useState(7)

  const cutoff = Date.now() - range * 864e5
  const paid = useMemo(() => state.orders.filter((o) => o.status === 'paid' && o.paidAt >= cutoff), [state.orders, range])

  const gross = paid.reduce((s, o) => s + (o.payment?.amount || 0), 0)
  const bills = paid.length
  const avg = bills ? Math.round(gross / bills) : 0

  // daily bars
  const byDay = {}
  paid.forEach((o) => { const k = dayKey(o.paidAt); byDay[k] = (byDay[k] || 0) + o.payment.amount })
  const days = []
  for (let i = range - 1; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    days.push({ label: fmtDate(d).split(' ')[0], value: byDay[k] || 0 })
  }

  // top items
  const itemAgg = {}
  paid.forEach((o) => o.items.forEach((li) => {
    itemAgg[li.name] = itemAgg[li.name] || { qty: 0, rev: 0 }
    itemAgg[li.name].qty += li.qty
    itemAgg[li.name].rev += li.qty * li.price
  }))
  const topItems = Object.entries(itemAgg).sort((a, b) => b[1].rev - a[1].rev).slice(0, 8)
    .map(([label, v]) => ({ label, value: v.rev }))

  // channel mix
  const chMix = [
    { label: 'Dine-in', value: paid.filter((o) => o.type === 'dine').length },
    { label: 'Takeaway/Del', value: paid.filter((o) => ['takeaway', 'delivery', 'whatsapp', 'qr'].includes(o.type)).length },
    { label: 'Zomato', value: paid.filter((o) => o.type === 'zomato').length },
    { label: 'Swiggy', value: paid.filter((o) => o.type === 'swiggy').length },
  ]

  // peak hours
  const byHour = {}
  paid.forEach((o) => { const h = new Date(o.paidAt).getHours(); byHour[h] = (byHour[h] || 0) + 1 })
  const hours = Array.from({ length: 13 }, (_, i) => {
    const h = i + 10
    return { label: `${h > 12 ? h - 12 : h}${h >= 12 ? 'p' : 'a'}`, value: byHour[h] || 0 }
  })

  // GST report: own-liability sales vs aggregator (ECO pays under Sec 9(5))
  const own = paid.filter((o) => !['zomato', 'swiggy'].includes(o.type))
  const eco = paid.filter((o) => ['zomato', 'swiggy'].includes(o.type))
  const ownGross = own.reduce((s, o) => s + o.payment.amount, 0)
  const ecoGross = eco.reduce((s, o) => s + o.payment.amount, 0)
  const ownTaxable = Math.round(ownGross / 1.05)
  const ownGst = ownGross - ownTaxable

  const exportCSV = () => {
    const rows = [['Bill No', 'Date', 'Type', 'Items', 'Method', 'Amount']]
    paid.forEach((o) => rows.push([
      o.billNo, new Date(o.paidAt).toLocaleString('en-IN'), o.type,
      o.items.map((i) => `${i.qty}x ${i.name}`).join('; '), o.payment.method, o.payment.amount,
    ]))
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `khaanapeena-sales-${range}d.csv`
    a.click()
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('reports')}</h1>
        <div className="flex gap-2">
          {[[1, 'Today'], [7, '7 days'], [30, '30 days']].map(([d, l]) => (
            <button key={d} onClick={() => setRange(d)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${range === d ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
          ))}
          <button onClick={exportCSV} className={btnGhost}>⬇️ CSV</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Gross sales" value={inr0(gross)} icon="💰" accent="saffron" />
        <StatCard label="Bills" value={bills} icon="🧾" accent="blue" />
        <StatCard label={t('avgBill')} value={inr0(avg)} icon="📊" accent="green" />
        <StatCard label="Aggregator share" value={gross ? Math.round((ecoGross / gross) * 100) + '%' : '0%'} sub="Zomato + Swiggy" icon="🛵" accent="purple" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Daily sales (₹)</h3>
          <p className="text-xs text-stone-400 mb-3">Settled bills per day</p>
          <Bars data={days} labelEvery={range > 10 ? 3 : 1} />
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Channel mix</h3>
          <p className="text-xs text-stone-400 mb-3">Share of bills</p>
          <Donut data={chMix} />
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Top items by revenue</h3>
          <HBars data={topItems} />
        </div>
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Peak hours</h3>
          <p className="text-xs text-stone-400 mb-3">Bills settled by hour of day</p>
          <Bars data={hours} color="#2563eb" fmt={(v) => v + ' bills'} />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-stone-100">
        <h3 className="font-bold text-ink-900 mb-1">GST summary ({range === 1 ? 'today' : `last ${range} days`})</h3>
        <p className="text-xs text-stone-400 mb-4">Aggregator sales are ECO-liable under Sec 9(5) — Zomato/Swiggy deposit that GST, not you. File accordingly.</p>
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="font-bold mb-2">Your GST liability (own sales)</div>
            <Row l="Gross (own channels)" v={inr0(ownGross)} />
            <Row l="Taxable value" v={inr0(ownTaxable)} />
            <Row l="CGST @2.5%" v={inr0(Math.round(ownGst / 2))} />
            <Row l="SGST @2.5%" v={inr0(Math.round(ownGst / 2))} />
          </div>
          <div className="bg-stone-50 rounded-xl p-4">
            <div className="font-bold mb-2">ECO-liable (Sec 9(5)) — informational</div>
            <Row l="Gross via Zomato/Swiggy" v={inr0(ecoGross)} />
            <Row l="GST deposited by aggregator" v={inr0(ecoGross - Math.round(ecoGross / 1.05))} />
            <div className="text-[11px] text-stone-400 mt-2">Report under 'supplies through ECO' in GSTR-1 Table 8; not payable by you.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

const Row = ({ l, v }) => <div className="flex justify-between py-0.5 text-stone-600"><span>{l}</span><b className="text-ink-900">{v}</b></div>
