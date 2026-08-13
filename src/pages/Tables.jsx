import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, Field, inputCls, btnPrimary } from '../components.jsx'
import { inr0, minsSince, billTotals, uid } from '../utils.js'
import { useNav } from '../nav.jsx'
import QRCode from 'qrcode'

export default function Tables() {
  const { state, t, newOrder, cloud, update } = useStore()
  const { goTo } = useNav()
  const [qrTable, setQrTable] = useState(null)
  const [editTable, setEditTable] = useState(null) // table object, or 'new'
  const areas = [...new Set(state.tables.map((tb) => tb.area))]

  const orderFor = (tid) => state.orders.find((o) => o.tableId === tid && ['open', 'kot', 'ready', 'served', 'new'].includes(o.status))

  // open an available table straight into billing with a fresh dine-in order
  const openTable = (tb) => {
    const id = newOrder({ type: 'dine', tableId: tb.id })
    goTo('billing', { orderId: id })
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('tables')}</h1>
        <div className="flex gap-3 text-xs items-center">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-white border border-stone-300" /> {t('available')}</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-saffron-500" /> {t('occupied')}</span>
          <button onClick={() => setEditTable('new')} className={btnPrimary + ' !py-1.5 !px-3'}>＋ Add table</button>
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
                    <span className="flex items-center gap-1">
                      <button onClick={() => setEditTable(tb)} title="Edit table" className={`text-[11px] ${o ? 'text-white/70 hover:text-white' : 'text-stone-300 hover:text-saffron-600'}`}>✏️</button>
                      <span className={`text-[10px] ${o ? 'text-white/80' : 'text-stone-400'}`}>{tb.seats} 🪑</span>
                    </span>
                  </div>
                  {o ? (
                    <button onClick={() => goTo('billing', { orderId: o.id })} className="mt-1 text-xs text-left w-full">
                      <div className="font-bold">{inr0(amt)}</div>
                      <div className="text-white/80">{(o.items || []).reduce((s, i) => s + i.qty, 0)} items · {minsSince(o.createdAt)}m</div>
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
      {qrTable && <TableQRModal table={qrTable} cloud={cloud} onClose={() => setQrTable(null)} />}
      {editTable && (
        <TableEditModal
          table={editTable === 'new' ? null : editTable}
          areas={areas}
          existingIds={state.tables.map((x) => x.id)}
          occupied={editTable !== 'new' && !!orderFor(editTable.id)}
          onClose={() => setEditTable(null)}
          onSave={(f) => {
            update((s) => {
              if (editTable === 'new') {
                const id = f.name.trim().toUpperCase().replace(/\s+/g, '') || uid('T')
                if (s.tables.some((x) => x.id === id)) return
                s.tables.push({ id, name: f.name.trim(), seats: +f.seats || 2, area: f.area.trim() || 'Main Hall' })
              } else {
                const tb = s.tables.find((x) => x.id === editTable.id)
                if (tb) Object.assign(tb, { name: f.name.trim() || tb.name, seats: +f.seats || tb.seats, area: f.area.trim() || tb.area })
              }
            })
            setEditTable(null)
          }}
          onDelete={() => {
            update((s) => { s.tables = s.tables.filter((x) => x.id !== editTable.id) })
            setEditTable(null)
          }}
        />
      )}
    </div>
  )
}

function TableEditModal({ table, areas, existingIds = [], occupied, onClose, onSave, onDelete }) {
  const [f, setF] = useState(table
    ? { name: table.name, seats: table.seats, area: table.area }
    : { name: '', seats: 4, area: areas[0] || 'Main Hall' })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  // a new table's id is derived from its name; block a name that maps to an id
  // already in use (else the add would silently no-op)
  const derivedId = f.name.trim().toUpperCase().replace(/\s+/g, '')
  const collides = !table && derivedId && existingIds.includes(derivedId)
  return (
    <Modal open onClose={onClose} title={table ? `Edit table ${table.name}` : 'Add table'}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Table name / no."><input value={f.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. T9" className={inputCls} autoFocus /></Field>
        <Field label="Seats"><input type="number" min="1" value={f.seats} onChange={(e) => set('seats', Math.max(1, +e.target.value || 1))} className={inputCls} /></Field>
      </div>
      <Field label="Area / section">
        <input value={f.area} onChange={(e) => set('area', e.target.value)} list="kp-areas" placeholder="e.g. Main Hall, Family, Outdoor, Rooftop" className={inputCls} />
        <datalist id="kp-areas">{areas.map((a) => <option key={a} value={a} />)}</datalist>
      </Field>
      {collides && <p className="text-[11px] text-red-600 mb-2">A table named “{f.name.trim()}” already exists — pick a different name.</p>}
      <button onClick={() => onSave(f)} disabled={!f.name.trim() || collides} className={btnPrimary + ' w-full'}>{table ? 'Save changes' : 'Add table'}</button>
      {table && (
        occupied
          ? <p className="text-[11px] text-amber-600 mt-2 text-center">This table has a running order — settle or free it before removing.</p>
          : <button onClick={() => { if (confirm(`Remove table ${table.name}?`)) onDelete() }} className="w-full mt-2 text-xs font-bold text-red-500 hover:text-red-600 py-1.5">🗑 Remove table</button>
      )}
    </Modal>
  )
}

function TableQRModal({ table, cloud, onClose }) {
  const [qr, setQr] = useState(null)
  // with cloud sync on, guests order from the public site and their order syncs
  // into this restaurant's kitchen; without it, the QR works on this device only
  const base = cloud ? 'https://khaanapeena.web.app/' : `${window.location.origin}${window.location.pathname}`
  const url = `${base}#/qr?t=${table.id}${cloud ? `&c=${cloud.code}` : ''}`
  useEffect(() => {
    QRCode.toDataURL(url, { width: 240, margin: 1 }).then(setQr)
  }, [url])
  return (
    <Modal open onClose={onClose} title={`Self-order QR — Table ${table.name}`}>
      <div className="flex flex-col items-center">
        {qr && <img src={qr} alt="QR" className="w-52 h-52" />}
        {!cloud && <p className="text-[11px] text-amber-600 mt-2 text-center font-semibold">⚠ Cloud sync is off — this QR only works on this device. Turn on Cloud sync in Settings so guests' phones reach your kitchen.</p>}
        <p className="text-xs text-stone-500 mt-2 text-center">Print & stick on the table. Guests scan → browse menu → order & pay from their phone. Orders land straight in the kitchen.</p>
        <a href={url} className="text-saffron-700 text-xs font-bold mt-2 underline" target="_blank" rel="noreferrer">Open customer view ↗</a>
      </div>
    </Modal>
  )
}
