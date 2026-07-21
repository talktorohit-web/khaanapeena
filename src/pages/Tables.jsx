import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge } from '../components.jsx'
import { inr0, minsSince, billTotals } from '../utils.js'
import { useNav } from '../nav.jsx'
import QRCode from 'qrcode'

export default function Tables() {
  const { state, t, newOrder } = useStore()
  const { goTo } = useNav()
  const [qrTable, setQrTable] = useState(null)
  const areas = [...new Set(state.tables.map((tb) => tb.area))]

  const orderFor = (tid) => state.orders.find((o) => o.tableId === tid && ['open', 'kot', 'ready', 'served', 'new'].includes(o.status))

  // open an available table straight into billing with a fresh dine-in order
  const openTable = (tb) => {
    const id = newOrder({ type: 'dine', tableId: tb.id })
    goTo('billing', { orderId: id })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-ink-900">{t('tables')}</h1>
        <div className="flex gap-3 text-xs items-center">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-stone-300" /> {t('available')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-saffron-500" /> {t('occupied')}</span>
        </div>
      </div>
      {areas.map((area) => (
        <div key={area} className="mb-6">
          <h3 className="font-bold text-stone-500 text-sm mb-2 uppercase tracking-wide">{area}</h3>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {state.tables.filter((tb) => tb.area === area).map((tb) => {
              const o = orderFor(tb.id)
              const tt = o ? billTotals(o, state.settings) : null
              const amt = o ? (state.settings.gstScheme === 'composition' ? Math.round(tt.taxable) : tt.total) : 0
              return (
                <div key={tb.id} className={`rounded-2xl p-3 border-2 transition-all ${o ? 'bg-saffron-500 border-saffron-600 text-white' : 'bg-white border-stone-200'}`}>
                  <div className="flex items-center justify-between">
                    <span className="font-black text-lg">{tb.name}</span>
                    <span className={`text-[10px] ${o ? 'text-white/80' : 'text-stone-400'}`}>{tb.seats} 🪑</span>
                  </div>
                  {o ? (
                    <button onClick={() => goTo('billing', { orderId: o.id })} className="mt-1 text-xs text-left w-full">
                      <div className="font-bold">{inr0(amt)}</div>
                      <div className="text-white/80">{o.items.reduce((s, i) => s + i.qty, 0)} items · {minsSince(o.createdAt)}m</div>
                      <Badge color={o.status === 'ready' ? 'green' : 'amber'}>{o.status.toUpperCase()}</Badge>
                      <div className="text-[10px] text-white/90 mt-1 font-bold">Tap to open bill →</div>
                    </button>
                  ) : (
                    <div className="mt-1 space-y-1">
                      <button onClick={() => openTable(tb)} className="w-full text-[11px] font-bold bg-saffron-50 text-saffron-700 rounded-lg py-1 hover:bg-saffron-100">＋ {t('newOrder')}</button>
                      <button onClick={() => setQrTable(tb)} className="w-full text-[11px] font-bold bg-stone-100 text-stone-600 rounded-lg py-1 hover:bg-stone-200">📱 {t('qrMenu')}</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ))}
      {qrTable && <TableQRModal table={qrTable} onClose={() => setQrTable(null)} />}
    </div>
  )
}

function TableQRModal({ table, onClose }) {
  const [qr, setQr] = useState(null)
  const url = `${window.location.origin}${window.location.pathname}#/qr?t=${table.id}`
  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr)
  }, [url])
  return (
    <Modal open onClose={onClose} title={`Self-order QR — Table ${table.name}`}>
      <div className="flex flex-col items-center">
        {qr && <img src={qr} alt="QR" className="w-52 h-52" />}
        <p className="text-xs text-stone-500 mt-2 text-center">Print & stick on the table. Guests scan → browse menu → order & pay from their phone. Orders land straight in the kitchen.</p>
        <a href={url} className="text-saffron-700 text-xs font-bold mt-2 underline" target="_blank" rel="noreferrer">Open customer view ↗</a>
      </div>
    </Modal>
  )
}
