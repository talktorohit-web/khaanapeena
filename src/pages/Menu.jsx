import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, VegDot, Toggle, Field, inputCls, btnPrimary, btnGhost, Badge, Empty } from '../components.jsx'
import { inr0, inr, uid } from '../utils.js'

export default function MenuPage() {
  const { state, t, update } = useStore()
  const [editItem, setEditItem] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [q, setQ] = useState('')

  const ql = q.trim().toLowerCase()
  const match = (i) => !ql || i.name.toLowerCase().includes(ql) || (i.nameHi || '').includes(q.trim())
  const totalItems = state.items.length
  const shown = state.items.filter(match).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('menu')} <span className="text-stone-300 text-lg font-bold">· {totalItems}</span></h1>
        <div className="flex gap-2">
          <button onClick={() => setScanOpen(true)} className={btnGhost}>📸 AI Photo → Menu</button>
          <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ {t('addItem')}</button>
        </div>
      </div>

      <div className="mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchItems')} className={inputCls + ' max-w-xs'} />
      </div>

      {state.categories.map((c) => {
        const items = state.items.filter((i) => i.catId === c.id && match(i))
        if (!items.length) return null
        return (
          <div key={c.id} className="mb-6">
            <h3 className="font-bold text-stone-500 text-sm mb-2 uppercase tracking-wide">{c.name} <span className="text-stone-300">· {items.length}</span></h3>
            <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-50">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <VegDot veg={i.veg} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-ink-900">{i.name} {i.recipe?.length > 0 && <span title="Has recipe — food cost tracked" className="text-[10px]">🧪</span>}</div>
                    <div className="text-[11px] text-stone-400">{i.nameHi} · {i.station}</div>
                  </div>
                  <span className="font-bold text-sm w-16 text-right">{inr0(i.price)}</span>
                  <button onClick={() => setEditItem(i)} className="text-xs text-stone-400 hover:text-saffron-600 font-bold px-2">✏️</button>
                  <Toggle on={i.available} onChange={(v) => update((s) => { const x = s.items.find((y) => y.id === i.id); if (x) x.available = v })} />
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {ql && shown === 0 && <Empty icon="🔍" text={`No menu items match “${q.trim()}”`} />}

      {(addOpen || editItem) && (
        <ItemModal
          item={editItem}
          onClose={() => { setAddOpen(false); setEditItem(null) }}
        />
      )}
      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} />}
    </div>
  )
}

function ItemModal({ item, onClose }) {
  const { state, update } = useStore()
  const [f, setF] = useState(item || { name: '', nameHi: '', price: '', catId: state.categories[0]?.id ?? '', veg: true, station: 'kitchen', available: true, recipe: [] })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  const ings = state.ingredients || []
  const recipe = f.recipe || []
  const ingCost = (id) => ings.find((g) => g.id === id)?.costPerUnit || 0
  const ingUnit = (id) => ings.find((g) => g.id === id)?.unit || ''
  const plateCost = recipe.reduce((s, r) => s + (+r.qty || 0) * ingCost(r.ingId), 0)
  const foodCostPct = +f.price > 0 && recipe.length ? (plateCost / +f.price) * 100 : null

  const addLine = () => {
    const used = new Set(recipe.map((r) => r.ingId))
    const next = ings.find((g) => !used.has(g.id))
    if (next) set('recipe', [...recipe, { ingId: next.id, qty: 0 }])
  }
  const setLine = (idx, patch) => set('recipe', recipe.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const rmLine = (idx) => set('recipe', recipe.filter((_, i) => i !== idx))

  const save = () => {
    // keep only complete recipe lines (ingredient + positive per-plate qty), and
    // MERGE duplicate lines for the same ingredient — two lines for one ingredient
    // would otherwise deduct its stock twice on KOT and double-count its plate cost
    const byIng = {}
    recipe.forEach((r) => { if (r.ingId && +r.qty > 0) byIng[r.ingId] = (byIng[r.ingId] || 0) + +r.qty })
    const cleanRecipe = Object.entries(byIng).map(([ingId, qty]) => ({ ingId, qty: +qty.toFixed(3) }))
    update((s) => {
      if (item) {
        const x = s.items.find((y) => y.id === item.id)
        Object.assign(x, { ...f, price: +f.price, recipe: cleanRecipe })
      } else {
        s.items.push({ ...f, id: uid('i'), price: +f.price, recipe: cleanRecipe })
      }
    })
    onClose()
  }
  const remove = () => {
    if (!item) return
    if (!confirm(`Remove “${item.name}” from the menu? Past bills keep this item; it just won't be orderable.`)) return
    update((s) => { s.items = s.items.filter((y) => y.id !== item.id) })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={item ? 'Edit item' : 'Add item'}>
      <Field label="Name (English)"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
      <Field label="Name (Hindi)"><input value={f.nameHi} onChange={(e) => set('nameHi', e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹)"><input type="number" min="0" value={f.price} onChange={(e) => set('price', e.target.value)} className={inputCls} /></Field>
        <Field label="Category">
          <select value={f.catId} onChange={(e) => set('catId', e.target.value)} className={inputCls}>
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Station">
          <select value={f.station} onChange={(e) => set('station', e.target.value)} className={inputCls}>
            {['kitchen', 'tandoor', 'chinese', 'beverage'].map((st) => <option key={st}>{st}</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={f.veg ? 'veg' : 'nonveg'} onChange={(e) => set('veg', e.target.value === 'veg')} className={inputCls}>
            <option value="veg">🟢 Veg</option><option value="nonveg">🔴 Non-veg</option>
          </select>
        </Field>
      </div>
      {/* Optional per-item HSN — only needed when this item isn't plain restaurant
          service (bottled water, sweets by weight). Blank uses the shop-wide code. */}
      <Field label="HSN / SAC code (optional)">
        <input value={f.hsn ?? ''} onChange={(e) => set('hsn', e.target.value)} placeholder={state.settings.hsnCode || '996331'} className={inputCls} />
        <span className="text-[10px] text-stone-400">Leave blank unless this is sold as goods, not restaurant service.</span>
      </Field>

      {/* Recipe editor — powers auto stock-deduction on KOT and the Food Cost report */}
      <div className="border border-stone-100 rounded-xl p-3 mb-3 bg-stone-50/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-stone-500">🧪 Recipe (per plate)</span>
          {foodCostPct != null && (
            <span className="text-[11px] font-bold">
              Plate cost {inr(+plateCost.toFixed(2))} · <span className={foodCostPct <= 30 ? 'text-leaf-600' : foodCostPct <= 40 ? 'text-amber-600' : 'text-red-600'}>{foodCostPct.toFixed(0)}% food cost</span>
            </span>
          )}
        </div>
        {recipe.length === 0 && <p className="text-[11px] text-stone-400 mb-2">Add ingredients to auto-deduct stock on every KOT and track food-cost %.</p>}
        <div className="space-y-1.5">
          {recipe.map((r, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <select value={r.ingId} onChange={(e) => setLine(idx, { ingId: e.target.value })} className={inputCls + ' !py-1.5 flex-1'}>
                {ings.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="number" min="0" step="0.001" value={r.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} className={inputCls + ' !py-1.5 w-20'} />
              <span className="text-[11px] text-stone-400 w-8">{ingUnit(r.ingId)}</span>
              <button onClick={() => rmLine(idx)} className="text-stone-300 hover:text-red-500 text-sm px-1" title="Remove">✕</button>
            </div>
          ))}
        </div>
        {ings.length > recipe.length && (
          <button onClick={addLine} className="mt-2 text-xs font-bold text-saffron-700 hover:underline">＋ Add ingredient</button>
        )}
      </div>

      <button onClick={save} disabled={!f.name || !(+f.price > 0)} className={btnPrimary + ' w-full'}>Save</button>
      {item && <button onClick={remove} className="w-full mt-2 text-xs font-bold text-red-500 hover:text-red-600 py-1.5">🗑 Remove from menu</button>}
    </Modal>
  )
}

// AI photo→menu onboarding (simulated extraction — production uses vision model)
const SCAN_RESULT = [
  { name: 'Amritsari Kulcha', nameHi: 'अमृतसरी कुलचा', price: 120, veg: true, station: 'tandoor', cat: 'c_breads' },
  { name: 'Sarson Da Saag', nameHi: 'सरसों दा साग', price: 210, veg: true, station: 'kitchen', cat: 'c_main' },
  { name: 'Makki Di Roti', nameHi: 'मक्की दी रोटी', price: 40, veg: true, station: 'tandoor', cat: 'c_breads' },
  { name: 'Patiala Lassi (Large)', nameHi: 'पटियाला लस्सी', price: 130, veg: true, station: 'beverage', cat: 'c_bev' },
]

function ScanModal({ onClose }) {
  const { update } = useStore()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState(SCAN_RESULT.map(() => true))
  const scan = () => { setStep(1); setTimeout(() => setStep(2), 1600) }
  const importItems = () => {
    update((s) => {
      SCAN_RESULT.forEach((r, i) => {
        if (picked[i] && !s.items.some((x) => x.name === r.name)) {
          s.items.push({ id: uid('i'), catId: r.cat, name: r.name, nameHi: r.nameHi, price: r.price, veg: r.veg, station: r.station, available: true, recipe: [] })
        }
      })
    })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="📸 AI Photo → Menu import">
      {step === 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-stone-500 mb-4">Click a photo of your printed menu card — KhaanaPeena AI reads it and builds your digital menu in seconds. No typing.</p>
          <div className="border-2 border-dashed border-stone-300 rounded-2xl py-10 mb-4 text-stone-400">
            <div className="text-3xl mb-2">🖼️</div>
            <div className="text-xs">Drop menu photo here (demo uses a sample)</div>
          </div>
          <button onClick={scan} className={btnPrimary}>Scan sample menu photo</button>
        </div>
      )}
      {step === 1 && (
        <div className="text-center py-10">
          <div className="text-3xl mb-3 kp-pulse">✨</div>
          <p className="text-sm font-bold text-ink-900">Reading menu…</p>
          <p className="text-xs text-stone-400">Detecting items, prices & veg marks</p>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="text-sm text-stone-500 mb-3">Found <b>{SCAN_RESULT.length} items</b> — untick any you don't want:</p>
          {SCAN_RESULT.map((r, i) => (
            <label key={i} className="flex items-center gap-3 py-2 border-b border-stone-50 text-sm">
              <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
              <VegDot veg={r.veg} />
              <span className="flex-1">{r.name} <span className="text-stone-400 text-xs">{r.nameHi}</span></span>
              <b>{inr0(r.price)}</b>
            </label>
          ))}
          <button onClick={importItems} className={btnPrimary + ' w-full mt-4'}>Import {picked.filter(Boolean).length} items</button>
        </div>
      )}
    </Modal>
  )
}
