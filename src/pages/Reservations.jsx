import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { useNav } from '../nav.jsx'
import { Modal, Badge, Empty, StatCard, Field, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { todayISO } from '../utils.js'

const STATUS = {
  booked: { label: 'Booked', color: 'blue' },
  seated: { label: 'Seated', color: 'green' },
  completed: { label: 'Completed', color: 'stone' },
  'no-show': { label: 'No-show', color: 'red' },
  cancelled: { label: 'Cancelled', color: 'stone' },
}

const fmtTime = (t) => {
  if (!t) return ''
  const [h, m] = t.split(':').map(Number)
  const ap = h >= 12 ? 'PM' : 'AM'
  const hh = h % 12 || 12
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`
}

export default function Reservations() {
  const { state, t, addReservation, updateReservation, seatReservation } = useStore()
  const { goTo } = useNav()
  const [date, setDate] = useState(todayISO())
  const [addOpen, setAddOpen] = useState(false)
  const [seatFor, setSeatFor] = useState(null) // reservation needing a table pick

  const reservations = state.reservations || []
  const today = todayISO()
  const tmr = new Date(Date.now() + 864e5).toISOString().slice(0, 10)

  // tables currently occupied by a live order
  const busyTables = useMemo(() => {
    const set = new Set()
    state.orders.forEach((o) => { if (o.tableId && ['open', 'kot', 'ready', 'served', 'new'].includes(o.status)) set.add(o.tableId) })
    return set
  }, [state.orders])
  const freeTables = state.tables.filter((tb) => !busyTables.has(tb.id))

  const forDate = reservations
    .filter((r) => r.date === date)
    .sort((a, b) => (a.time || '').localeCompare(b.time || ''))

  const covers = forDate.reduce((s, r) => s + (+r.partySize || 0), 0)
  const seatedCount = forDate.filter((r) => r.status === 'seated').length
  const upcoming = forDate.filter((r) => r.status === 'booked').length

  const doSeat = (r, tableId) => {
    const oid = seatReservation(r.id, tableId)
    setSeatFor(null)
    goTo('billing', { orderId: oid })
  }
  const onSeatClick = (r) => {
    if (r.tableId && !busyTables.has(r.tableId)) doSeat(r, r.tableId)
    else setSeatFor(r)
  }

  const waLink = (r) => {
    const msg = `Namaste ${r.name.split(' ')[0]} ji! Your table at ${state.settings.name} is confirmed for ${fmtTime(r.time)}${r.partySize ? `, ${r.partySize} guests` : ''} on ${new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}. See you soon! 🙏`
    return `https://wa.me/91${r.phone}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">📅 {t('reservations')}</h1>
        <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ New booking</button>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        {[['Today', today], ['Tomorrow', tmr]].map(([lbl, d]) => (
          <button key={d} onClick={() => setDate(d)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${date === d ? 'bg-saffron-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{lbl}</button>
        ))}
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="border border-stone-200 rounded-lg px-2 py-1.5 text-sm" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Bookings" value={forDate.length} sub={new Date(date).toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })} icon="📖" accent="saffron" />
        <StatCard label="Covers (guests)" value={covers} icon="👥" accent="blue" />
        <StatCard label="Yet to arrive" value={upcoming} icon="⏳" accent="purple" />
        <StatCard label="Seated" value={seatedCount} icon="🪑" accent="green" />
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        {forDate.length === 0 ? (
          <Empty icon="📅" text="No bookings for this day. Tap “New booking” to add one." />
        ) : (
          <div className="divide-y divide-stone-50">
            {forDate.map((r) => {
              const st = STATUS[r.status] || STATUS.booked
              const done = ['completed', 'no-show', 'cancelled'].includes(r.status)
              return (
                <div key={r.id} className={`flex items-center gap-3 px-4 py-3 flex-wrap ${done ? 'opacity-60' : ''}`}>
                  <div className="w-16 shrink-0">
                    <div className="font-black text-ink-900 text-sm">{fmtTime(r.time)}</div>
                  </div>
                  <div className="flex-1 min-w-[140px]">
                    <div className="font-semibold text-ink-900 text-sm">{r.name} <span className="text-stone-400 font-normal">· {r.partySize} pax</span></div>
                    <div className="text-[11px] text-stone-400">📞 {r.phone}{r.tableId ? ` · 🪑 ${r.tableId}` : ''}{r.notes ? ` · ${r.notes}` : ''}</div>
                  </div>
                  <Badge color={st.color}>{st.label}</Badge>
                  <div className="flex items-center gap-1.5">
                    {r.status === 'booked' && (
                      <>
                        <button onClick={() => onSeatClick(r)} className="text-[11px] font-bold bg-leaf-600 text-white rounded-lg px-2.5 py-1.5">Seat</button>
                        <a href={waLink(r)} target="_blank" rel="noreferrer" className="text-[11px] font-bold bg-green-50 text-green-700 rounded-lg px-2.5 py-1.5">💬</a>
                        <button onClick={() => updateReservation(r.id, { status: 'no-show' })} className="text-[11px] font-bold bg-stone-100 text-stone-600 rounded-lg px-2.5 py-1.5" title="No-show">🚫</button>
                        <button onClick={() => updateReservation(r.id, { status: 'cancelled' })} className="text-[11px] font-bold bg-stone-100 text-stone-500 rounded-lg px-2.5 py-1.5" title="Cancel">✕</button>
                      </>
                    )}
                    {r.status === 'seated' && r.orderId && (
                      <button onClick={() => goTo('billing', { orderId: r.orderId })} className="text-[11px] font-bold bg-saffron-50 text-saffron-700 rounded-lg px-2.5 py-1.5">Open bill →</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {addOpen && <BookingModal date={date} tables={state.tables} onClose={() => setAddOpen(false)} onSave={(r) => { addReservation(r); setAddOpen(false) }} />}
      {seatFor && (
        <Modal open onClose={() => setSeatFor(null)} title={`Seat ${seatFor.name} — pick a table`}>
          {freeTables.length === 0 ? (
            <p className="text-sm text-stone-500">All tables are occupied right now.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {freeTables.map((tb) => (
                <button key={tb.id} onClick={() => doSeat(seatFor, tb.id)} className="rounded-xl border-2 border-stone-200 hover:border-saffron-400 p-3 text-center">
                  <div className="font-black text-ink-900">{tb.name}</div>
                  <div className="text-[10px] text-stone-400">{tb.seats} seats · {tb.area}</div>
                </button>
              ))}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}

function BookingModal({ date, tables, onClose, onSave }) {
  const [f, setF] = useState({ name: '', phone: '', date, time: '20:00', partySize: 2, tableId: '', notes: '' })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.name.trim() && f.phone.length === 10 && f.time && +f.partySize > 0
  return (
    <Modal open onClose={onClose} title="New booking">
      <div className="grid grid-cols-2 gap-x-3">
        <Field label="Guest name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus /></Field>
        <Field label="Mobile"><input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit" className={inputCls} /></Field>
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
        <Field label="Time"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={inputCls} /></Field>
        <Field label="Party size"><input type="number" min="1" value={f.partySize} onChange={(e) => set('partySize', Math.max(1, +e.target.value || 1))} className={inputCls} /></Field>
        <Field label="Table (optional)">
          <select value={f.tableId} onChange={(e) => set('tableId', e.target.value)} className={inputCls}>
            <option value="">Assign later</option>
            {tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name} ({tb.area}, {tb.seats})</option>)}
          </select>
        </Field>
      </div>
      <Field label="Notes (occasion, seating, allergies…)"><input value={f.notes} onChange={(e) => set('notes', e.target.value)} className={inputCls} placeholder="e.g. Birthday, window seat" /></Field>
      <button onClick={() => onSave(f)} disabled={!valid} className={btnPrimary + ' w-full mt-1'}>Save booking</button>
      {!valid && <p className="text-[11px] text-stone-400 mt-2 text-center">Need a name, 10-digit mobile, time and party size.</p>}
    </Modal>
  )
}
