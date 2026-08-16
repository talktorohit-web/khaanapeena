import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Badge, Toggle, Modal, Field, inputCls, btnPrimary, StatCard } from '../components.jsx'
import { uid } from '../utils.js'

const ROLES = ['Manager', 'Cashier', 'Head Chef', 'Cook', 'Waiter', 'Delivery']

export default function Staff() {
  const { state, t, update } = useStore()
  const [addOpen, setAddOpen] = useState(false)
  const [editStaff, setEditStaff] = useState(null)

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
              <th className="py-2.5 px-4">Name</th><th>Role</th><th>Phone</th><th>POS PIN</th><th>On shift</th><th className="pr-4"></th>
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
                <td className="pr-4 text-right"><button onClick={() => setEditStaff(s)} className="text-xs font-bold text-stone-400 hover:text-saffron-600 px-2">✏️ Edit</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 bg-blue-50 border border-blue-100 rounded-2xl p-4 text-sm text-blue-800">
        💡 <b>Coming in Pro:</b> geofenced selfie attendance with anti-spoofing, shift rosters and monthly payroll (PF/ESI-ready) — powered by the same engine as our attendance product.
      </div>

      {addOpen && <StaffModal onClose={() => setAddOpen(false)} />}
      {editStaff && <StaffModal staff={editStaff} onClose={() => setEditStaff(null)} />}
    </div>
  )
}

function StaffModal({ staff, onClose }) {
  const { state, update } = useStore()
  const [f, setF] = useState(staff
    ? { name: staff.name, role: staff.role, phone: staff.phone || '', pin: staff.pin || '' }
    : { name: '', role: 'Waiter', phone: '', pin: '' })

  // A PIN that collides is worse than no PIN: resolveSession checks the manager
  // PIN first, so a staff member sharing it can never log in as themselves and
  // every bill they settle is filed against "Owner". Catch it at entry.
  const pinClash = (() => {
    const p = String(f.pin || '').trim()
    if (p.length < 4) return null
    if (state.settings?.managerPin && p === String(state.settings.managerPin)) {
      return 'This is the Manager PIN. Whoever types it signs in as Owner, so this person could never log in as themselves — and their bills would be filed against "Owner". Pick a different number.'
    }
    const other = (state.staff || []).find((s) => s.id !== staff?.id && String(s.pin) === p)
    return other ? `${other.name} already uses this PIN. Two people on one PIN means their sales, discounts and voids all land on one name.` : null
  })()

  const save = () => {
    update((s) => {
      if (staff) {
        const x = s.staff.find((y) => y.id === staff.id)
        if (x) Object.assign(x, f)
      } else {
        s.staff.push({ ...f, id: uid('s'), present: true })
      }
    })
    onClose()
  }
  const remove = () => {
    if (!staff) return
    if (!confirm(`Remove ${staff.name} from staff?`)) return
    update((s) => { s.staff = s.staff.filter((y) => y.id !== staff.id) })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title={staff ? 'Edit staff member' : 'Add staff member'}>
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Role">
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className={inputCls}>
            {ROLES.map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
        <Field label="POS PIN (4 digit)">
          <input value={f.pin} maxLength={4} onChange={(e) => setF({ ...f, pin: e.target.value.replace(/\D/g, '') })} className={inputCls + (pinClash ? ' !border-red-400' : '')} />
        </Field>
      </div>
      {pinClash && <p className="text-[11px] text-red-600 -mt-2 mb-3 leading-snug">⚠️ {pinClash}</p>}
      <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value.replace(/\D/g, '').slice(0, 10) })} className={inputCls} /></Field>
      <button onClick={save} disabled={!f.name || !!pinClash} className={btnPrimary + ' w-full'}>Save</button>
      {staff && <button onClick={remove} className="w-full mt-2 text-xs font-bold text-red-500 hover:text-red-600 py-1.5">🗑 Remove staff</button>}
    </Modal>
  )
}
