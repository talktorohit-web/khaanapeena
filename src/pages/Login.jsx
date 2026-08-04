import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { resetPassword, authError } from '../auth.js'
import { inputCls, btnPrimary } from '../components.jsx'

export default function Login({ onDemo }) {
  const { signInFlow, signUpFlow } = useStore()
  const [mode, setMode] = useState('signin') // signin | signup
  const [rname, setRname] = useState('')
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [info, setInfo] = useState('')

  const submit = async () => {
    setErr(''); setInfo(''); setBusy(true)
    try {
      if (mode === 'signup') await signUpFlow(email, pass, rname)
      else await signInFlow(email, pass)
      // on success the auth listener + cloud adopt take over; nothing else to do
    } catch (e) {
      setErr(authError(e))
    } finally {
      setBusy(false)
    }
  }

  const forgot = async () => {
    if (!email) { setErr('Enter your email first, then tap "Forgot password".'); return }
    setErr(''); setInfo('')
    try { await resetPassword(email); setInfo('Password reset link sent to ' + email) }
    catch (e) { setErr(authError(e)) }
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-5 bg-gradient-to-br from-saffron-50 via-stone-50 to-amber-50">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="text-4xl mb-1">🍛</div>
          <div className="text-2xl font-black text-ink-900">Khaana<span className="text-saffron-600">Peena</span></div>
          <div className="text-xs text-stone-500 mt-0.5">Restaurant OS · Made for India 🇮🇳</div>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-stone-100 p-5">
          <div className="grid grid-cols-2 gap-1 bg-stone-100 rounded-xl p-1 mb-4">
            {[['signin', 'Sign in'], ['signup', 'Create account']].map(([k, l]) => (
              <button key={k} onClick={() => { setMode(k); setErr(''); setInfo('') }} className={`py-2 rounded-lg text-sm font-bold ${mode === k ? 'bg-white shadow text-ink-900' : 'text-stone-500'}`}>{l}</button>
            ))}
          </div>

          {mode === 'signup' && (
            <label className="block mb-3">
              <span className="text-xs font-semibold text-stone-500 block mb-1">Restaurant name</span>
              <input value={rname} onChange={(e) => setRname(e.target.value)} placeholder="e.g. Sharma Ji Da Dhaba" className={inputCls} />
            </label>
          )}
          <label className="block mb-3">
            <span className="text-xs font-semibold text-stone-500 block mb-1">Email</span>
            <input type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@restaurant.com" className={inputCls} />
          </label>
          <label className="block mb-1">
            <span className="text-xs font-semibold text-stone-500 block mb-1">Password</span>
            <input type="password" autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} placeholder="••••••••" className={inputCls} />
          </label>
          {mode === 'signin' && <button onClick={forgot} className="text-[11px] text-saffron-700 font-semibold mb-2">Forgot password?</button>}

          {err && <p className="text-xs text-red-600 my-2">{err}</p>}
          {info && <p className="text-xs text-green-600 my-2">{info}</p>}

          <button onClick={submit} disabled={busy || !email || pass.length < 6 || (mode === 'signup' && !rname)} className={btnPrimary + ' w-full mt-2'}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account & restaurant' : 'Sign in'}
          </button>
        </div>

        <div className="text-center mt-4">
          <button onClick={onDemo} className="text-sm text-stone-500 font-semibold underline decoration-stone-300 underline-offset-2">Skip — try the demo offline</button>
          <p className="text-[10px] text-stone-400 mt-1 max-w-xs mx-auto">The demo works fully on this device with no account. Create an account when you're ready to sync across devices and keep your data.</p>
        </div>
      </div>
    </div>
  )
}
