import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, download, slug, spanDays } from './shared.jsx'

export default function Inventory({ state, range }) {
  // consumption over the range: from recipes of KOT'd orders in [from,to).
  // The first KOT is tracked too — "days left" divides by it, and on an all-time
  // range an unclamped window would make every ingredient look eternal.
  const { usage, firstKot } = useMemo(() => {
    const u = {}
    let first = 0
    ;(state.orders || []).forEach((o) => {
      if (!o.kotAt || o.kotAt < range.from || o.kotAt >= range.to || o.status === 'cancelled') return
      if (!first || o.kotAt < first) first = o.kotAt
      ;(o.items || []).forEach((li) => {
        const item = (state.items || []).find((i) => i.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => { u[ingId] = (u[ingId] || 0) + qty * li.qty })
      })
    })
    return { usage: u, firstKot: first }
  }, [state.orders, state.items, range])

  const days = spanDays(range, firstKot)

  const rows = (state.ingredients || []).map((g) => {
    const used = usage[g.id] || 0
    const usedValue = used * g.costPerUnit
    const perDay = used / days
    const daysLeft = perDay > 0 ? g.stock / perDay : Infinity
    return { ...g, used, usedValue, daysLeft, stockValue: g.stock * g.costPerUnit }
  })

  const stockValue = rows.reduce((s, r) => s + r.stockValue, 0)
  const consumptionValue = rows.reduce((s, r) => s + r.usedValue, 0)
  const low = rows.filter((r) => r.stock <= r.minStock)

  const waste = (state.waste || []).filter((w) => {
    const ts = new Date(w.date).getTime()
    return ts >= range.from && ts < range.to
  })
  const wasteValue = waste.reduce((s, w) => s + (w.lossValue || 0), 0)
  const wasteByReason = {}
  waste.forEach((w) => { wasteByReason[w.reason] = (wasteByReason[w.reason] || 0) + (w.lossValue || 0) })
  const wasteBars = Object.entries(wasteByReason).map(([label, value]) => ({ label, value }))

  const consumptionBars = rows.filter((r) => r.usedValue > 0).sort((a, b) => b.usedValue - a.usedValue).slice(0, 8)
    .map((r) => ({ label: r.name, value: Math.round(r.usedValue) }))

  const exportCsv = () => {
    const out = [['INVENTORY — ' + range.label], [],
      ['Ingredient', 'Unit', 'In stock', 'Min', 'Used', 'Consumption ₹', 'Days left', 'Stock value ₹']]
    rows.forEach((r) => out.push([
      r.name, r.unit, r.stock, r.minStock, +r.used.toFixed(2), Math.round(r.usedValue),
      r.daysLeft === Infinity ? '—' : r.daysLeft.toFixed(1), Math.round(r.stockValue),
    ]))
    out.push([], ['Total stock value ₹', Math.round(stockValue)],
      ['Consumption value ₹', Math.round(consumptionValue)],
      ['Wastage value ₹', Math.round(wasteValue)])
    if (waste.length) {
      out.push([], ['WASTAGE'], ['Date', 'Item', 'Qty', 'Reason', 'Loss ₹'])
      waste.forEach((w) => out.push([w.date, w.itemName, w.qty, w.reason, Math.round(w.lossValue || 0)]))
    }
    download(`khaanapeena-inventory-${slug(range)}.csv`, out)
  }

  if (!(state.ingredients || []).length) return <Card><Empty icon="📦" text="No ingredients added yet." /></Card>

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Current stock value" value={inr0(stockValue)} icon="📦" accent="saffron" />
        <StatCard label="Consumed" value={inr0(consumptionValue)} sub={range.label} icon="🍳" accent="blue" />
        <StatCard label="Wastage" value={inr0(wasteValue)} sub={`${waste.length} entries`} icon="🗑️" accent="red" />
        <StatCard label="Low stock items" value={low.length} sub={low.slice(0, 2).map((l) => l.name).join(', ') || 'All stocked ✓'} icon="⚠️" accent={low.length ? 'red' : 'green'} />
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" title="Top consumption by value">
          {consumptionBars.length ? <HBars data={consumptionBars} /> : <Empty text="No consumption recorded in this period" />}
        </Card>
        <Card className="!mb-0" title="Wastage by reason">
          {wasteBars.length ? <HBars data={wasteBars} color="#dc2626" /> : <Empty text="No wastage logged in this period 🎉" />}
        </Card>
      </div>

      <Card flush title={`Ingredient stock & consumption — ${range.label}`} sub="Days left projects from how fast you're using it right now">
        <DataTable
          scroll
          rows={rows}
          keyOf={(r) => r.id}
          cols={[
            { h: 'Ingredient', cell: (r) => <span className="font-semibold">{r.name} {r.stock <= r.minStock && <Badge color="red">low</Badge>}</span> },
            { h: 'In stock', num: true, cell: (r) => `${r.stock} ${r.unit}` },
            { h: 'Used', num: true, cell: (r) => `${r.used.toFixed(2)} ${r.unit}` },
            { h: 'Consumption', num: true, cell: (r) => inr0(r.usedValue) },
            { h: 'Days left', num: true, cell: (r) => r.daysLeft === Infinity ? <span className="text-stone-300">—</span> : r.daysLeft < 3 ? <Badge color="red">{r.daysLeft.toFixed(1)}d</Badge> : `${r.daysLeft.toFixed(0)}d` },
            { h: 'Stock value', num: true, cell: (r) => <b>{inr0(r.stockValue)}</b>, foot: () => inr0(stockValue) },
          ]}
        />
      </Card>
    </>
  )
}
