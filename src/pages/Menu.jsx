import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, VegDot, Toggle, Field, inputCls, btnPrimary, btnGhost, Badge } from '../components.jsx'
import { inr0, uid } from '../utils.js'

export default function MenuPage() {
  const { state, t, update } = useStore()
  const [editItem, setEditItem] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('menu')}</h1>
        <div className="flex gap-2">
          <button onClick={() => setScanOpen(true)} className={btnGhost}>📸 AI Photo → Menu</button>
          <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ {t('addItem')}</button>
        </div>
      </div>

      {state.categories.map((c) => {
        const items = state.items.filter((i) => i.catId === c.id)
        if (!items.length) return null
        return (
          <div key={c.id} className="mb-6">
            <h3 className="font-bold text-stone-500 text-sm mb-2 uppercase tracking-wide">{c.name} <span className="text-stone-300">· {items.length}</span></h3>
            <div className="bg-white rounded-2xl border border-stone-100 divide-y divide-stone-50">
              {items.map((i) => (
                <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                  <VegDot veg={i.veg} />
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm text-ink-900">{i.name}</div>
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
  const [f, setF] = useState(item || { name: '', nameHi: '', price: '', catId: state.categories[0].id, veg: true, station: 'kitchen', available: true, recipe: [] })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const save = () => {
    update((s) => {
      if (item) {
        const x = s.items.find((y) => y.id === item.id)
        Object.assign(x, { ...f, price: +f.price })
      } else {
        s.items.push({ ...f, id: uid('i'), price: +f.price })
      }
    })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={item ? 'Edit item' : 'Add item'}>
      <Field label="Name (English)"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
      <Field label="Name (Hindi)"><input value={f.nameHi} onChange={(e) => set('nameHi', e.target.value)} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Price (₹)"><input type="number" value={f.price} onChange={(e) => set('price', e.target.value)} className={inputCls} /></Field>
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
      <button onClick={save} disabled={!f.name || !f.price} className={btnPrimary + ' w-full'}>Save</button>
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
