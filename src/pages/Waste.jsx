import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Field, inputCls, btnPrimary } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, uid, todayISO } from '../utils.js'

const REASONS = ['Over-production', 'Spoilage', 'Customer return', 'Kitchen error', 'Expired stock']

export default function Waste() {
  const { state, t, update } = useStore()
  const [f, setF] = useState({ itemName: '', qty: '', reason: REASONS[0], lossValue: '' })

  const totalLoss = state.waste.reduce((s, w) => s + w.lossValue, 0)
  const byReason = REASONS.map((r) => ({
    label: r,
    value: state.waste.filter((w) => w.reason === r).reduce((s, w) => s + w.lossValue, 0),
  })).filter((x) => x.value > 0)

  const add = () => {
    update((s) => s.waste.push({ id: uid('w'), date: todayISO(), itemName: f.itemName, qty: f.qty, reason: f.reason, lossValue: +f.lossValue || 0 }))
    setF({ itemName: '', qty: '', reason: REASONS[0], lossValue: '' })
  }

  const monthlyProjection = totalLoss * 2 // rough demo projection

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-black text-ink-900">🗑️ {t('waste')}</h1>
      </div>
      <p className="text-sm text-stone-500 mb-5">Every wasted kilo is profit in the bin. Track it, see the ₹, stop it.</p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-5">
        <StatCard label="Loss logged" value={inr0(totalLoss)} icon="💸" accent="red" />
        <StatCard label="Entries" value={state.waste.length} icon="📋" accent="blue" />
        <StatCard label="Yearly run-rate" value={inr0(totalLoss * 26)} sub="if this pace continues" icon="⚠️" accent="red" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Log waste</h3>
          <Field label="What was wasted?"><input value={f.itemName} onChange={(e) => setF({ ...f, itemName: e.target.value })} placeholder="e.g. Dal Makhani leftover" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="2 kg" className={inputCls} /></Field>
            <Field label="Loss value (₹)"><input type="number" min="0" value={f.lossValue} onChange={(e) => setF({ ...f, lossValue: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Reason">
            <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={inputCls}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <button onClick={add} disabled={!f.itemName || !(+f.lossValue > 0)} className={btnPrimary + ' w-full'}>Log it</button>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-stone-100">
            <h3 className="font-bold text-ink-900 mb-3">Loss by reason</h3>
            {byReason.length ? <HBars data={byReason} color="#dc2626" /> : <p className="text-sm text-stone-400">Nothing logged yet</p>}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-stone-100 max-h-64 overflow-y-auto">
            <h3 className="font-bold text-ink-900 mb-2">Recent entries</h3>
            {[...state.waste].reverse().map((w) => (
              <div key={w.id} className="flex items-center justify-between py-1.5 border-b border-stone-50 text-sm">
                <div>
                  <span className="font-semibold">{w.itemName}</span>
                  <span className="text-xs text-stone-400 ml-2">{w.qty} · {w.reason} · {w.date}</span>
                </div>
                <b className="text-red-600">−{inr0(w.lossValue)}</b>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
