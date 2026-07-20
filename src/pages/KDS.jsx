import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Empty, Badge } from '../components.jsx'
import { minsSince, fmtTime } from '../utils.js'

export default function KDS() {
  const { state, t, update } = useStore()
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const kots = state.orders.filter((o) => o.status === 'kot').sort((a, b) => a.kotAt - b.kotAt)
  const ready = state.orders.filter((o) => o.status === 'ready').sort((a, b) => a.kotAt - b.kotAt)

  const setStatus = (id, st) => update((s) => { const o = s.orders.find((x) => x.id === id); if (o) o.status = st })

  return (
    <div className="p-6 h-full flex flex-col">
      <h1 className="text-2xl font-black text-ink-900 mb-4">{t('kitchen')}</h1>
      <div className="grid md:grid-cols-2 gap-4 flex-1 min-h-0">
        <div className="bg-white rounded-2xl border border-stone-100 p-4 overflow-y-auto">
          <h3 className="font-bold text-amber-600 mb-3">🔥 {t('preparing')} ({kots.length})</h3>
          {kots.length === 0 && <Empty icon="😌" text="No pending KOTs" />}
          <div className="grid sm:grid-cols-2 gap-3">
            {kots.map((o) => <Ticket key={o.id} o={o} action={() => setStatus(o.id, 'ready')} actionLabel={`✓ ${t('markReady')}`} actionCls="bg-leaf-600 hover:bg-leaf-500" />)}
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-stone-100 p-4 overflow-y-auto">
          <h3 className="font-bold text-leaf-600 mb-3">🛎️ {t('ready')} ({ready.length})</h3>
          {ready.length === 0 && <Empty icon="🍽️" text="Nothing waiting to be served" />}
          <div className="grid sm:grid-cols-2 gap-3">
            {ready.map((o) => <Ticket key={o.id} o={o} action={() => setStatus(o.id, 'served')} actionLabel={`✓ ${t('served')}`} actionCls="bg-stone-700 hover:bg-stone-800" />)}
          </div>
        </div>
      </div>
    </div>
  )
}

function Ticket({ o, action, actionLabel, actionCls }) {
  const mins = minsSince(o.kotAt)
  const late = mins > 15
  const stations = {}
  o.items.forEach((li) => {
    const st = li.station || 'kitchen'
    ;(stations[st] = stations[st] || []).push(li)
  })
  return (
    <div className={`rounded-xl border-2 p-3 ${late ? 'border-red-400 bg-red-50' : 'border-stone-200'}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-black text-sm">KOT #{o.kotNo} · {o.tableId ? `T-${o.tableId}` : o.type === 'qr' ? 'QR' : o.type}</span>
        <span className={`text-xs font-bold ${late ? 'text-red-600 kp-pulse' : 'text-stone-400'}`}>{mins}m</span>
      </div>
      {o.items.map((li, i) => (
        <div key={i} className="flex justify-between text-[13px] py-0.5">
          <span>{li.name}{li.notes && <span className="text-[10px] text-purple-600 block">📝 {li.notes}</span>}</span>
          <b>× {li.qty}</b>
        </div>
      ))}
      <div className="text-[10px] text-stone-400 mt-1">{fmtTime(o.kotAt)}</div>
      <button onClick={action} className={`w-full mt-2 text-white text-xs font-bold rounded-lg py-2 ${actionCls}`}>{actionLabel}</button>
    </div>
  )
}
