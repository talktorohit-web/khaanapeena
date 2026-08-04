import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Field, inputCls, Toggle, btnGhost, btnPrimary, Badge } from '../components.jsx'
import { LANGS } from '../i18n.js'
import { verifyManagerPin } from '../utils.js'

export default function Settings() {
  const { state, t, update, resetDemo } = useStore()
  const s = state.settings
  const set = (k, v) => update((st) => { st.settings[k] = v })
  const setHH = (k, v) => update((st) => { st.settings.happyHour[k] = v })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-5">{t('settings')}</h1>

      <Section title="🏪 Restaurant profile">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Restaurant name"><input value={s.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
          <Field label="Phone"><input value={s.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Address (printed on bills)"><input value={s.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="GSTIN"><input value={s.gstin} onChange={(e) => set('gstin', e.target.value)} className={inputCls} /></Field>
          <Field label="FSSAI licence no. (mandatory on bills)"><input value={s.fssai} onChange={(e) => set('fssai', e.target.value)} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="🧾 GST & billing">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="GST scheme">
            <select value={s.gstScheme} onChange={(e) => set('gstScheme', e.target.value)} className={inputCls}>
              <option value="regular">Regular — 5% (Tax Invoice, CGST+SGST shown)</option>
              <option value="composition">Composition — Bill of Supply (no GST on bill)</option>
            </select>
          </Field>
          <Field label="GST rate % (regular scheme)">
            <select value={s.gstRate} onChange={(e) => set('gstRate', +e.target.value)} className={inputCls}>
              <option value="5">5% (standalone restaurant, no ITC)</option>
              <option value="18">18% (hotel ≥₹7,500 tariff / catering)</option>
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Service charge % (0 = off)"><input type="number" value={s.serviceCharge} onChange={(e) => set('serviceCharge', +e.target.value || 0)} className={inputCls} /></Field>
          <Field label="UPI ID (dynamic QR on bills)"><input value={s.upiId} onChange={(e) => set('upiId', e.target.value)} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="🕒 Happy hour automation">
        <div className="flex items-center gap-3 mb-3">
          <Toggle on={s.happyHour.enabled} onChange={(v) => setHH('enabled', v)} />
          <span className="text-sm text-stone-600">Auto-apply discount during slow hours</span>
        </div>
        {s.happyHour.enabled && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="From (hour)"><input type="number" min="0" max="23" value={s.happyHour.from} onChange={(e) => setHH('from', +e.target.value)} className={inputCls} /></Field>
            <Field label="To (hour)"><input type="number" min="0" max="23" value={s.happyHour.to} onChange={(e) => setHH('to', +e.target.value)} className={inputCls} /></Field>
            <Field label="Discount %"><input type="number" value={s.happyHour.discountPct} onChange={(e) => setHH('discountPct', +e.target.value)} className={inputCls} /></Field>
          </div>
        )}
      </Section>

      <Section title="🌐 Language & loyalty">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="App language">
            <select value={s.lang} onChange={(e) => set('lang', e.target.value)} className={inputCls}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Points earned per ₹100">
            <input type="number" value={s.loyaltyEarnPer100} onChange={(e) => set('loyaltyEarnPer100', +e.target.value || 1)} className={inputCls} />
          </Field>
        </div>
      </Section>

      <SecuritySection />

      <CloudSection />

      <Section title="🧹 Demo data">
        <p className="text-xs text-stone-400 mb-2">Everything is stored on this device (works fully offline). Reset restores the sample restaurant.</p>
        <button onClick={() => { if (confirm('Reset all data to the demo seed?')) resetDemo() }} className={btnGhost}>↺ Reset demo data</button>
      </Section>
    </div>
  )
}

function SecuritySection() {
  const { state, update } = useStore()
  const isSet = !!state.settings.managerPin
  const [open, setOpen] = useState(false)
  const [cur, setCur] = useState('')
  const [nw, setNw] = useState('')
  const [cf, setCf] = useState('')
  const [msg, setMsg] = useState(null) // { ok, text }

  const onlyDigits = (v) => v.replace(/\D/g, '').slice(0, 6)
  const reset = () => { setCur(''); setNw(''); setCf(''); setMsg(null) }

  const save = () => {
    // must know the current PIN (if one is set)
    if (isSet && String(cur) !== String(state.settings.managerPin)) { setMsg({ ok: false, text: 'Current PIN is incorrect' }); return }
    if (nw.length < 4) { setMsg({ ok: false, text: 'New PIN must be at least 4 digits' }); return }
    if (nw !== cf) { setMsg({ ok: false, text: "New PIN and confirmation don't match" }); return }
    update((s) => { s.settings.managerPin = nw })
    reset()
    setOpen(false)
    setMsg({ ok: true, text: 'Manager PIN changed ✓' })
  }

  return (
    <Section title="🔒 Security — manager PIN">
      <p className="text-xs text-stone-400 mb-3">Required to rectify items already sent to the kitchen (edit/void a punched bill). Staff with a Manager/Admin role can also authorise with their own PIN.</p>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm text-stone-600">Manager PIN</span>
        <span className="font-mono tracking-[0.3em] text-lg text-stone-400">••••</span>
        <Badge color={isSet ? 'green' : 'red'}>{isSet ? 'Set' : 'Not set'}</Badge>
        {!open && <button onClick={() => { reset(); setOpen(true) }} className={btnGhost + ' ml-auto'}>Change PIN</button>}
      </div>

      {open && (
        <div className="bg-stone-50 rounded-xl p-4 mt-2 max-w-sm">
          {isSet && (
            <Field label="Current PIN">
              <input type="password" inputMode="numeric" autoComplete="off" value={cur} onChange={(e) => { setCur(onlyDigits(e.target.value)); setMsg(null) }} className={inputCls + ' font-mono tracking-widest'} placeholder="••••" />
            </Field>
          )}
          <Field label="New PIN (4–6 digits)">
            <input type="password" inputMode="numeric" autoComplete="new-password" value={nw} onChange={(e) => { setNw(onlyDigits(e.target.value)); setMsg(null) }} className={inputCls + ' font-mono tracking-widest'} placeholder="••••" />
          </Field>
          <Field label="Confirm new PIN">
            <input type="password" inputMode="numeric" autoComplete="new-password" value={cf} onChange={(e) => { setCf(onlyDigits(e.target.value)); setMsg(null) }} onKeyDown={(e) => e.key === 'Enter' && save()} className={inputCls + ' font-mono tracking-widest'} placeholder="••••" />
          </Field>
          {msg && !msg.ok && <p className="text-xs text-red-600 mb-2">{msg.text}</p>}
          <div className="flex gap-2">
            <button onClick={save} className={btnPrimary}>Save new PIN</button>
            <button onClick={() => { reset(); setOpen(false) }} className={btnGhost}>Cancel</button>
          </div>
        </div>
      )}
      {msg && msg.ok && <p className="text-xs text-green-600 mt-1">{msg.text}</p>}
    </Section>
  )
}

function CloudSection() {
  const { cloud, cloudStatus, cloudCreate, cloudJoin, cloudLeave } = useStore()
  const [joinCode, setJoinCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const doCreate = async () => {
    setBusy(true); setErr('')
    try { await cloudCreate() } catch { setErr('Could not reach cloud — check internet') }
    setBusy(false)
  }
  const doJoin = async () => {
    setBusy(true); setErr('')
    try { await cloudJoin(joinCode) } catch (e) { setErr(e.message || 'Join failed') }
    setBusy(false)
  }

  return (
    <Section title="☁️ Cloud sync — connect all devices">
      {cloud ? (
        <div>
          <div className="flex items-center gap-3 mb-2">
            <Badge color={cloudStatus === 'live' ? 'green' : cloudStatus === 'error' ? 'red' : 'amber'}>
              {cloudStatus === 'live' ? '● LIVE' : cloudStatus === 'error' ? '● OFFLINE' : '● CONNECTING'}
            </Badge>
            <span className="text-xs text-stone-500">{cloud.role === 'owner' ? 'This is the main POS device' : 'Joined device'}</span>
          </div>
          <p className="text-sm text-stone-600 mb-1">Restaurant code — enter this on every other device (PC, phone, kitchen screen):</p>
          <div className="flex items-center gap-2 mb-3">
            <span className="font-mono text-xl font-black tracking-widest bg-stone-100 rounded-xl px-4 py-2">{cloud.code}</span>
            <button onClick={() => navigator.clipboard?.writeText(cloud.code)} className={btnGhost}>Copy</button>
          </div>
          <p className="text-xs text-stone-400 mb-3">Bills, KOTs, menu and inventory sync live across every connected device. Table QR stickers now carry this code, so guest phones order straight into your kitchen.</p>
          <button onClick={cloudLeave} className={btnGhost}>Disconnect this device</button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-stone-600 mb-3">Right now this device works alone. Turn on cloud sync to connect the billing PC, kitchen screen and phones to one restaurant.</p>
          <button onClick={doCreate} disabled={busy} className={btnPrimary + ' mr-2'}>{busy ? 'Creating…' : '☁️ Create Restaurant Cloud'}</button>
          <div className="flex items-center gap-2 mt-3">
            <input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Have a code? e.g. KPXXXXXXXX" className={inputCls + ' max-w-xs font-mono'} />
            <button onClick={doJoin} disabled={busy || joinCode.length < 8} className={btnGhost}>Join</button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
    </Section>
  )
}

const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
    <h3 className="font-bold text-ink-900 mb-3">{title}</h3>
    {children}
  </div>
)
