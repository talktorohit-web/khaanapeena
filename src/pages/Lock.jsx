import React, { useState } from 'react'
import { resolveSession } from '../permissions.js'

// Full-screen PIN lock shown when RBAC is on and no one is signed in at this till.
// Staff enter their own PIN (role-scoped access); the owner enters the Manager PIN
// for full access.
export default function Lock({ state, onUnlock }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState(false)
  const s = state.settings || {}
  const present = (state.staff || []).filter((x) => x.present)

  const submit = (value) => {
    const sess = resolveSession(state, value)
    if (sess) { setErr(false); onUnlock(sess) }
    else { setErr(true); setPin(''); if (navigator.vibrate) navigator.vibrate(120) }
  }
  const push = (d) => {
    setErr(false)
    const next = (pin + d).slice(0, 6)
    setPin(next)
    if (next.length === 6) submit(next)
  }
  const back = () => { setErr(false); setPin((p) => p.slice(0, -1)) }

  return (
    <div className="min-h-[100dvh] bg-ink-900 text-white flex flex-col items-center justify-center p-6">
      <div className="text-2xl font-black mb-1">Khaana<span className="text-saffron-500">Peena</span></div>
      <div className="text-sm text-stone-400 mb-6">{s.name} · enter your PIN to start</div>

      {present.length > 0 && (
        <div className="flex flex-wrap gap-1.5 justify-center max-w-xs mb-5">
          {present.map((st) => (
            <span key={st.id} className="text-[11px] bg-white/10 rounded-full px-2.5 py-1 text-stone-300">{st.name.split(' ')[0]} · {st.role}</span>
          ))}
        </div>
      )}

      {/* PIN dots */}
      <div className={`flex gap-3 mb-6 ${err ? 'kp-shake' : ''}`}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={`w-3.5 h-3.5 rounded-full border-2 ${i < pin.length ? 'bg-saffron-500 border-saffron-500' : 'border-white/30'}`} />
        ))}
      </div>
      {err && <div className="text-red-400 text-sm font-bold mb-4 -mt-2">Wrong PIN — try again</div>}

      {/* keypad */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} onClick={() => push(d)} className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-bold active:scale-95 transition">{d}</button>
        ))}
        <button onClick={back} className="h-16 rounded-2xl bg-white/5 hover:bg-white/10 text-xl">⌫</button>
        <button onClick={() => push('0')} className="h-16 rounded-2xl bg-white/10 hover:bg-white/20 text-2xl font-bold active:scale-95 transition">0</button>
        <button onClick={() => submit(pin)} disabled={pin.length < 4} className="h-16 rounded-2xl bg-saffron-600 hover:bg-saffron-500 disabled:opacity-30 text-lg font-bold">→</button>
      </div>

      <div className="text-[11px] text-stone-500 mt-8 text-center max-w-xs">Owner? Enter your <b className="text-stone-400">Manager PIN</b> for full access. Set staff PINs in the Staff screen.</div>
    </div>
  )
}
