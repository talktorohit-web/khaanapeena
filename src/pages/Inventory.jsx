import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, Field, inputCls, btnPrimary, StatCard } from '../components.jsx'
import { inr0 } from '../utils.js'

export default function Inventory() {
  const { state, t, update } = useStore()
  const [buyIng, setBuyIng] = useState(null)

  // usage per ingredient over last 7 days (from recipes of KOT-ed orders)
  const usage = useMemo(() => {
    const u = {}
    const cutoff = Date.now() - 7 * 864e5
    state.orders.forEach((o) => {
      if (!o.kotAt || o.kotAt < cutoff || o.status === 'cancelled') return
      o.items.forEach((li) => {
        const item = state.items.find((i) => i.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => {
          u[ingId] = (u[ingId] || 0) + qty * li.qty
        })
      })
    })
    return u
  }, [state.orders, state.items])

  const rows = state.ingredients.map((g) => {
    const weekly = usage[g.id] || 0
    const daily = weekly / 7
    const daysLeft = daily > 0 ? g.stock / daily : Infinity
    return { ...g, weekly, daysLeft }
  })
  const low = rows.filter((r) => r.stock <= r.minStock)
  const stockValue = rows.reduce((s, r) => s + r.stock * r.costPerUnit, 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-5">{t('inventory')}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="Stock value" value={inr0(stockValue)} icon="💰" accent="saffron" />
        <StatCard label={t('lowStock')} value={low.length} sub={low.map((l) => l.name).slice(0, 3).join(', ') || 'All good ✓'} icon="⚠️" accent={low.length ? 'red' : 'green'} />
        <StatCard label="Auto-deduction" value="ON" sub="Recipes deduct stock on every KOT" icon="🔄" accent="blue" />
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="py-2.5 px-4">Ingredient</th><th>In stock</th><th>Min</th><th>7-day usage</th><th>Days left</th><th>Value</th><th className="pr-4"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className={`border-b border-stone-50 ${r.stock <= r.minStock ? 'bg-red-50/50' : ''}`}>
                <td className="py-2.5 px-4 font-semibold">{r.name}</td>
                <td>{r.stock} {r.unit}</td>
                <td className="text-stone-400">{r.minStock}</td>
                <td>{r.weekly.toFixed(1)} {r.unit}</td>
                <td>
                  {r.daysLeft === Infinity ? <span className="text-stone-300">—</span>
                    : r.daysLeft < 3 ? <Badge color="red">{r.daysLeft.toFixed(1)}d ⚠️</Badge>
                    : <span>{r.daysLeft.toFixed(0)}d</span>}
                </td>
                <td>{inr0(r.stock * r.costPerUnit)}</td>
                <td className="pr-4 text-right">
                  <button onClick={() => setBuyIng(r)} className="text-xs font-bold text-saffron-700 hover:underline">+ Purchase</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {buyIng && (
        <PurchaseModal ing={buyIng} onClose={() => setBuyIng(null)} onSave={(qty, cost) => {
          update((s) => {
            const g = s.ingredients.find((x) => x.id === buyIng.id)
            if (g) { g.stock = +(g.stock + qty).toFixed(3); if (cost) g.costPerUnit = cost }
          })
          setBuyIng(null)
        }} />
      )}
    </div>
  )
}

function PurchaseModal({ ing, onClose, onSave }) {
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState(ing.costPerUnit)
  return (
    <Modal open onClose={onClose} title={`Purchase — ${ing.name}`}>
      <Field label={`Quantity (${ing.unit})`}><input type="number" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} autoFocus /></Field>
      <Field label={`Cost per ${ing.unit} (₹)`}><input type="number" value={cost} onChange={(e) => setCost(+e.target.value)} className={inputCls} /></Field>
      <div className="text-xs text-stone-400 mb-3">Total: {inr0((+qty || 0) * cost)}</div>
      <button onClick={() => onSave(+qty, +cost)} disabled={!+qty} className={btnPrimary + ' w-full'}>Add to stock</button>
    </Modal>
  )
}
