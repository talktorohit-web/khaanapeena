import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Badge, Toggle, Modal, Field, inputCls, btnPrimary, StatCard } from '../components.jsx'
import { uid } from '../utils.js'

export default function Staff() {
  const { state, t, update } = useStore()
  const [addOpen, setAddOpen] = useState(false)

  const present = state.staff.filter((s) => s.present).length

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-ink-900">{t('staff')}</h1>
        <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ Add staff</button>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5 max-w-md">
        <StatCard label="On shift now" value={`${present} / ${state.staff.length}`} icon="🧑‍🍳" accent="green" />
        <StatCard label="Roles" value={new Set(state.staff.map((s) => s.role)).size} icon="🎖️" accent="blue" />
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="py-2.5 px-4">Name</th><th>Role</th><th>Phone</th><th>POS PIN</th><th>On shift</th>
            </tr>
          </thead>
          <tbody>
            {state.staff.map((s) => (
              <tr key={s.id} className="border-b border-stone-50">
                <td className="py-2.5 px-4 font-semibold">{s.name}</td>
                <td><Badge color={s.role === 'Manager' ? 'saffron' : s.role.includes('Chef') ? 'amber' : 'stone'}>{s.role}</Badge></td>
                <td className="text-stone-500">{s.phone}</td>
                <td className="font-mono text-stone-400">••••</td>
                <td><Toggle on={s.present} onChange={(v) => update((st) => { const x = st.staff.find((y) => y.id === s.id); if (x) x.present = v })} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
        💡 <b>Coming in Pro:</b> geofenced selfie attendance with anti-spoofing, shift rosters and monthly payroll (PF/ESI-ready) — powered by the same engine as our attendance product.
      </div>

      {addOpen && <AddStaff onClose={() => setAddOpen(false)} />}
    </div>
  )
}

function AddStaff({ onClose }) {
  const { update } = useStore()
  const [f, setF] = useState({ name: '', role: 'Waiter', phone: '', pin: '' })
  const save = () => {
    update((s) => s.staff.push({ ...f, id: uid('s'), present: true }))
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="Add staff member">
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inputCls}>
            {['Manager', 'Cashier', 'Head Chef', 'Cook', 'Waiter', 'Delivery'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="POS PIN (4 digit)"><input value={f.pin} maxLength={4} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} className={inputCls} /></Field>
      </div>
      <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className={inputCls} /></Field>
      <button onClick={save} disabled={!f.name} className={btnPrimary + ' w-full'}>Save</button>
    </Modal>
  )
}
