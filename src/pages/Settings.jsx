import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Field, inputCls, Toggle, btnGhost, btnPrimary, Badge } from '../components.jsx'
import { LANGS } from '../i18n.js'
import { verifyManagerPin } from '../utils.js'
import { printTest, inElectron } from '../print.js'

export default function Settings() {
  const { state, t, update, resetDemo } = useStore()
  const s = state.settings
  const set = (k, v) => update((st) => { st.settings[k] = v })
  const setHH = (k, v) => update((st) => { st.settings.happyHour[k] = v })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-5">{t('settings')}</h1>

      <AccountSection />

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

      <PrinterSection />

      <SecuritySection />

      <CloudSection />

      <Section title="🧹 Demo data">
        <p className="text-xs text-stone-400 mb-2">Everything is stored on this device (works fully offline). Reset restores the sample restaurant.</p>
        <button onClick={() => { if (confirm('Reset all data to the demo seed?')) resetDemo() }} className={btnGhost}>↺ Reset demo data</button>
      </Section>
    </div>
  )
}

function AccountSection() {
  const { authUser, authLogout } = useStore()
  const [busy, setBusy] = useState(false)
  const signOut = async () => {
    setBusy(true)
    await authLogout()
    localStorage.setItem('khaanapeena_demo', '0') // force the login screen
    window.location.reload()
  }
  const toLogin = () => { localStorage.setItem('khaanapeena_demo', '0'); window.location.reload() }
  return (
    <Section title="👤 Account">
      {authUser ? (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-ink-900">{authUser.email}</div>
            <div className="text-xs text-stone-400">Signed in — your restaurant syncs to this account.</div>
          </div>
          <button onClick={signOut} disabled={busy} className={btnGhost}>{busy ? 'Signing out…' : 'Sign out'}</button>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-ink-900">Demo mode (no account)</div>
            <div className="text-xs text-stone-400">Data lives on this device only. Create an account to sync across devices and keep it safe.</div>
          </div>
          <button onClick={toLogin} className={btnPrimary}>Sign in / Create account</button>
        </div>
      )}
    </Section>
  )
}

function PrinterSection() {
  const { state, update } = useStore()
  const p = state.settings.printer || { enabled: false, mode: 'browser', ip: '', port: 9100, width: 48, kitchenIp: '' }
  const setP = (k, v) => update((s) => {
    s.settings.printer = { ...(s.settings.printer || {}), [k]: v }
  })
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const test = async () => {
    setBusy(true); setMsg(null)
    const res = await printTest(state.settings)
    setBusy(false)
    if (res.ok) setMsg({ ok: true, text: 'Test receipt sent to the printer ✓' })
    else if (res.reason === 'browser') setMsg({ ok: false, text: 'Pick a printer type above (Network / USB / Bluetooth), then test.' })
    else setMsg({ ok: false, text: 'Could not print: ' + res.reason })
  }

  return (
    <Section title="🖨️ Thermal printer">
      <p className="text-xs text-stone-400 mb-3">Print bills and kitchen tickets (KOT) on an 80mm/58mm thermal printer. Network (LAN) printing needs the Windows desktop app; USB &amp; Bluetooth work in Chrome/Edge and the desktop app. If left off, KhaanaPeena uses the normal print dialog.</p>
      <div className="flex items-center gap-3 mb-3">
        <Toggle on={!!p.enabled} onChange={(v) => setP('enabled', v)} />
        <span className="text-sm text-stone-600">Use a thermal printer</span>
      </div>
      {p.enabled && (
        <>
          <div className="grid sm:grid-cols-2 gap-x-4">
            <Field label="Connection">
              <select value={p.mode} onChange={(e) => setP('mode', e.target.value)} className={inputCls}>
                <option value="network">Network / LAN {inElectron() ? '' : '(desktop app only)'}</option>
                <option value="usb">USB (WebUSB)</option>
                <option value="bluetooth">Bluetooth (BLE)</option>
                <option value="browser">Off — use print dialog</option>
              </select>
            </Field>
            <Field label="Paper width">
              <select value={p.width} onChange={(e) => setP('width', +e.target.value)} className={inputCls}>
                <option value={48}>80 mm (48 chars)</option>
                <option value={32}>58 mm (32 chars)</option>
              </select>
            </Field>
          </div>
          {p.mode === 'network' && (
            <div className="grid sm:grid-cols-3 gap-x-4">
              <Field label="Printer IP address">
                <input value={p.ip} onChange={(e) => setP('ip', e.target.value.trim())} placeholder="192.168.1.50" className={inputCls + ' font-mono'} />
              </Field>
              <Field label="Port">
                <input type="number" value={p.port} onChange={(e) => setP('port', +e.target.value || 9100)} className={inputCls + ' font-mono'} />
              </Field>
              <Field label="Kitchen printer IP (optional)">
                <input value={p.kitchenIp} onChange={(e) => setP('kitchenIp', e.target.value.trim())} placeholder="same as bill printer" className={inputCls + ' font-mono'} />
              </Field>
            </div>
          )}
          {p.mode === 'usb' && <p className="text-xs text-stone-400 mb-2">On first print, the browser asks you to pick the USB printer. Uses raw ESC/POS.</p>}
          {p.mode === 'bluetooth' && <p className="text-xs text-amber-600 mb-2">Bluetooth (BLE) support varies by printer model; if your printer isn't found, use Network or USB.</p>}
          <div className="flex items-center gap-3 mt-1">
            <button onClick={test} disabled={busy} className={btnGhost}>{busy ? 'Printing…' : '🧾 Test print'}</button>
            {msg && <span className={`text-xs ${msg.ok ? 'text-green-600' : 'text-red-600'}`}>{msg.text}</span>}
          </div>
        </>
      )}
    </Section>
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
  const { cloud, cloudStatus, authUser, reconnectCloud } = useStore()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const toLogin = () => { localStorage.setItem('khaanapeena_demo', '0'); window.location.reload() }
  const doReconnect = async () => {
    setBusy(true); setErr('')
    try { await reconnectCloud() } catch (e) { setErr(e.message || 'Could not sync — check internet') }
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
            <span className="text-xs text-stone-500">Synced to {authUser?.email || 'your account'}</span>
          </div>
          <p className="text-sm text-stone-600 mb-2">To add another device — billing PC, kitchen screen, a manager's phone — install KhaanaPeena there and <b>sign in with this same email</b>. Everything syncs automatically; there are no codes to type or share.</p>
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="text-xs text-stone-500">Restaurant code (only for your table QR menus):</span>
            <span className="font-mono text-sm font-black tracking-widest bg-stone-100 rounded-lg px-3 py-1.5">{cloud.code}</span>
            <button onClick={() => navigator.clipboard?.writeText(cloud.code)} className={btnGhost}>Copy</button>
          </div>
          <p className="text-xs text-stone-400">🔒 Your bills, menu, inventory and customer data are locked to your account — only devices signed in as you can open them. Guests who scan a table QR can view the menu and place an order, and nothing more.</p>
        </div>
      ) : authUser ? (
        <div>
          <p className="text-sm text-stone-600 mb-3">You're signed in as <b>{authUser.email}</b>, but this device isn't syncing yet.</p>
          <button onClick={doReconnect} disabled={busy} className={btnPrimary}>{busy ? 'Connecting…' : '☁️ Sync this device'}</button>
        </div>
      ) : (
        <div>
          <p className="text-sm text-stone-600 mb-3">Cloud sync keeps every device — billing PC, kitchen screen, phones — on one live copy of your data. It needs a free account, which is also what keeps your data private to you.</p>
          <button onClick={toLogin} className={btnPrimary}>Sign in / Create account</button>
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
