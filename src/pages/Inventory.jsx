import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, Field, inputCls, btnPrimary, StatCard } from '../components.jsx'
import { inr0, uid } from '../utils.js'

const UNITS = ['kg', 'g', 'ltr', 'ml', 'unit', 'pcs', 'packet', 'bottle']

export default function Inventory() {
  const { state, t, update } = useStore()
  const [buyIng, setBuyIng] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [editIng, setEditIng] = useState(null)

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
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-ink-900">{t('inventory')}</h1>
        <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ Add ingredient</button>
      </div>
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
                <td className="pr-4 text-right whitespace-nowrap">
                  <button onClick={() => setEditIng(r)} className="text-xs font-bold text-stone-400 hover:text-saffron-600 px-1.5">✏️</button>
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
            if (!g) return
            // weighted-average cost, same as a GRN receipt — a single spot purchase
            // must not re-value the entire existing stock at the new rate
            const oldStock = +g.stock || 0, oldCost = +g.costPerUnit || 0, rate = +cost || 0
            const newStock = oldStock + qty
            if (rate > 0) g.costPerUnit = newStock > 0 ? +(((oldStock * oldCost) + (qty * rate)) / newStock).toFixed(2) : rate
            g.stock = +newStock.toFixed(3)
          })
          setBuyIng(null)
        }} />
      )}

      {addOpen && (
        <IngredientModal onClose={() => setAddOpen(false)} onSave={(f) => {
          update((s) => {
            s.ingredients = s.ingredients || []
            s.ingredients.push({ id: uid('g'), name: f.name.trim(), unit: f.unit, stock: +f.stock || 0, minStock: +f.minStock || 0, costPerUnit: +f.cost || 0 })
          })
          setAddOpen(false)
        }} />
      )}

      {editIng && (
        <IngredientModal ing={editIng} onClose={() => setEditIng(null)} onSave={(f) => {
          update((s) => {
            const g = s.ingredients.find((x) => x.id === editIng.id)
            if (g) Object.assign(g, { name: f.name.trim(), unit: f.unit, stock: +f.stock || 0, minStock: +f.minStock || 0, costPerUnit: +f.cost || 0 })
          })
          setEditIng(null)
        }} onDelete={() => {
          const usedIn = (state.items || []).filter((it) => (it.recipe || []).some((r) => r.ingId === editIng.id))
          if (usedIn.length) { alert(`Can't delete — “${editIng.name}” is used in ${usedIn.length} recipe(s). Remove it from those items first.`); return }
          if (!confirm(`Delete ingredient “${editIng.name}”?`)) return
          update((s) => { s.ingredients = s.ingredients.filter((x) => x.id !== editIng.id) })
          setEditIng(null)
        }} />
      )}
    </div>
  )
}

function IngredientModal({ ing, onClose, onSave, onDelete }) {
  const [f, setF] = useState(ing
    ? { name: ing.name, unit: ing.unit, stock: ing.stock, minStock: ing.minStock, cost: ing.costPerUnit }
    : { name: '', unit: 'kg', stock: '', minStock: '', cost: '' })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  return (
    <Modal open onClose={onClose} title={ing ? `Edit — ${ing.name}` : 'Add ingredient'}>
      <Field label="Ingredient name"><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Ginger-Garlic Paste" className={inputCls} autoFocus /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Unit">
          <select value={f.unit} onChange={(e) => set('unit', e.target.value)} className={inputCls}>
            {UNITS.map((u) => <option key={u}>{u}</option>)}
          </select>
        </Field>
        <Field label={`Cost per ${f.unit} (₹)`}><input type="number" min="0" value={f.cost} onChange={(e) => set('cost', e.target.value)} className={inputCls} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label={`In stock (${f.unit})`}><input type="number" min="0" value={f.stock} onChange={(e) => set('stock', e.target.value)} className={inputCls} /></Field>
        <Field label={`Min / reorder level (${f.unit})`}><input type="number" min="0" value={f.minStock} onChange={(e) => set('minStock', e.target.value)} className={inputCls} /></Field>
      </div>
      <button onClick={() => onSave(f)} disabled={!f.name.trim()} className={btnPrimary + ' w-full'}>{ing ? 'Save changes' : 'Add ingredient'}</button>
      {ing && onDelete && <button onClick={onDelete} className="w-full mt-2 text-xs font-bold text-red-500 hover:text-red-600 py-1.5">🗑 Delete ingredient</button>}
    </Modal>
  )
}

function PurchaseModal({ ing, onClose, onSave }) {
  const [qty, setQty] = useState('')
  const [cost, setCost] = useState(ing.costPerUnit)
  return (
    <Modal open onClose={onClose} title={`Purchase — ${ing.name}`}>
      <Field label={`Quantity (${ing.unit})`}><input type="number" min="0" value={qty} onChange={(e) => setQty(e.target.value)} className={inputCls} autoFocus /></Field>
      <Field label={`Cost per ${ing.unit} (₹)`}><input type="number" min="0" value={cost} onChange={(e) => setCost(Math.max(0, +e.target.value || 0))} className={inputCls} /></Field>
      <div className="text-xs text-stone-400 mb-3">Total: {inr0((+qty || 0) * cost)}</div>
      <button onClick={() => onSave(+qty, +cost)} disabled={!(+qty > 0)} className={btnPrimary + ' w-full'}>Add to stock</button>
    </Modal>
  )
}
