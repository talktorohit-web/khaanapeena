import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Field, inputCls, Toggle, btnGhost, btnPrimary, Badge } from '../components.jsx'
import { LANGS } from '../i18n.js'
import { verifyManagerPin } from '../utils.js'
import { PAGES, ACTIONS, ROLES, resolvePerms } from '../permissions.js'
import { printTest, inElectron } from '../print.js'
import { stats as outboxStats, flush as outboxFlush, retryDead as outboxRetryDead, makeHttpSink } from '../outbox.js'
import { getIdToken } from '../auth.js'

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
          <Field label="HSN / SAC code (for the GST report)">
            <input value={s.hsnCode ?? '996331'} onChange={(e) => set('hsnCode', e.target.value)} placeholder="996331" className={inputCls} />
            <span className="text-[10px] text-stone-400">996331 is restaurant service. Any item you sell as packaged goods can carry its own code — set it in Menu.</span>
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

      <RolesSection />

      <CloudSection />

      <SyncSection />

      <Section title="🆘 Help & support">
        <p className="text-sm text-stone-600 mb-2">Stuck on something, or want a change made to the app? Call or WhatsApp the KhaanaPeena support line.</p>
        <div className="flex items-center gap-3 flex-wrap">
          <a href="tel:9614300003" className="text-lg font-black text-saffron-700">📞 9614300003</a>
          <a href="https://wa.me/919614300003" target="_blank" rel="noreferrer" className={btnGhost}>💬 WhatsApp us</a>
        </div>
        <p className="text-[11px] text-stone-400 mt-2">This number is also printed at the bottom of every bill.</p>
      </Section>

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
      <p className="text-xs text-stone-400 mb-3">Required to edit or remove items already sent to the kitchen. Staff with a Manager/Admin role can also authorise with their own PIN.</p>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-sm text-stone-600">Manager PIN</span>
        <span className="font-mono tracking-[0.3em] text-lg text-stone-400">••••</span>
        <Badge color={isSet ? 'green' : 'red'}>{isSet ? 'Set' : 'Not set'}</Badge>
        {!open && <button onClick={() => { reset(); setOpen(true) }} className={btnGhost + ' ml-auto'}>Change PIN</button>}
      </div>

      {/* Discounts are the easiest way for money to walk out of a restaurant, so
          the default is to make a manager put their PIN against every one. */}
      <div className="flex items-start justify-between gap-3 bg-stone-50 rounded-xl p-3 mt-3 max-w-xl">
        <div>
          <div className="text-sm font-semibold text-ink-900">Manager PIN needed for every discount</div>
          <div className="text-[11px] text-stone-500 leading-snug">
            {isSet
              ? 'A cashier can enter a discount, but the bill will not close until a manager approves it with their PIN. The approving name is recorded on the bill and in the discount report.'
              : 'Set a manager PIN above first — without one there is nothing to check the discount against.'}
          </div>
        </div>
        <Toggle
          on={isSet && state.settings.discountNeedsPin !== false}
          onChange={(v) => isSet && update((s) => { s.settings.discountNeedsPin = v })}
        />
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

function RolesSection() {
  const { state, update, lockSession } = useStore()
  const rbac = state.settings.rbac || { enabled: false, matrix: {} }
  const enabled = !!rbac.enabled
  const hasPin = !!state.settings.managerPin
  const [openRole, setOpenRole] = useState(null)
  const perms = resolvePerms(state.settings)

  const toggle = (on) => update((s) => {
    s.settings.rbac = { ...(s.settings.rbac || {}), enabled: on, matrix: s.settings.rbac?.matrix || {} }
    // enabling: keep the owner signed in at THIS till so they aren't locked out mid-config
    if (on) s.session = { staffId: null, name: 'Owner', role: 'Owner' }
  })

  const toggleCap = (roleName, kind, key) => update((s) => {
    s.settings.rbac = s.settings.rbac || { enabled: true, matrix: {} }
    s.settings.rbac.matrix = s.settings.rbac.matrix || {}
    const cur = s.settings.rbac.matrix[roleName] || { pages: [...(perms[roleName]?.pages || [])], actions: [...(perms[roleName]?.actions || [])] }
    const list = new Set(cur[kind] || [])
    list.has(key) ? list.delete(key) : list.add(key)
    s.settings.rbac.matrix[roleName] = { ...cur, [kind]: [...list] }
  })

  return (
    <Section title="🛡️ Staff roles & permissions">
      <p className="text-xs text-stone-400 mb-3">Give each staff role access to only the screens and actions they need. Staff sign in at the till with their PIN (set in the Staff screen); you (the owner) sign in with your <b>Manager PIN</b> for full access.</p>

      {!hasPin && !enabled && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 mb-3">⚠️ Set a <b>Manager PIN</b> above first — it's how you (the owner) unlock full access at the till.</div>
      )}

      {/* Pre-flight. These two problems only bite AFTER staff login is switched
          on, by which point the owner is staring at a lock screen. */}
      {hasPin && (() => {
        const staff = state.staff || []
        const clashManager = staff.filter((s) => String(s.pin) === String(state.settings.managerPin))
        const noPin = staff.filter((s) => s.present !== false && !String(s.pin || '').trim())
        const dupes = staff.filter((s, i) => s.pin && staff.findIndex((x) => String(x.pin) === String(s.pin)) !== i)
        if (!clashManager.length && !noPin.length && !dupes.length) {
          return (
            <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-xs text-green-800 mb-3">
              ✓ Ready — every staff member on shift has their own PIN, and none of them clash with your Manager PIN.
            </div>
          )
        }
        return (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-800 mb-3 space-y-1">
            <div className="font-bold">Fix these on the Staff screen before turning this on:</div>
            {clashManager.map((s) => (
              <div key={s.id}>• <b>{s.name}</b> has the same PIN as your Manager PIN — they'd sign in as "Owner" and every bill they settle would be filed against Owner, not them.</div>
            ))}
            {dupes.map((s) => (
              <div key={s.id}>• <b>{s.name}</b> shares a PIN with someone else — their sales and voids would land on one name.</div>
            ))}
            {noPin.map((s) => (
              <div key={s.id}>• <b>{s.name}</b> is on shift with no PIN set — they won't be able to sign in at the till.</div>
            ))}
          </div>
        )
      })()}

      <div className="flex items-center gap-3 mb-3">
        <Toggle on={enabled} onChange={(v) => { if (v && !hasPin) return; toggle(v) }} />
        <span className="text-sm text-stone-600">Require staff PIN sign-in & enforce role permissions</span>
        {enabled && <Badge color="green">On</Badge>}
      </div>

      {enabled && (
        <>
          <div className="space-y-2">
            {ROLES.map((r) => {
              const p = perms[r] || { pages: [], actions: [] }
              const isOpen = openRole === r
              return (
                <div key={r} className="border border-stone-200 rounded-xl overflow-hidden">
                  <button onClick={() => setOpenRole(isOpen ? null : r)} className="w-full flex items-center justify-between px-3 py-2.5 bg-stone-50 hover:bg-stone-100">
                    <span className="font-bold text-sm text-ink-900">{r}</span>
                    <span className="text-[11px] text-stone-400">{p.pages.length} screens · {p.actions.length} actions {isOpen ? '▲' : '▼'}</span>
                  </button>
                  {isOpen && (
                    <div className="p-3 space-y-3">
                      <div>
                        <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide mb-1.5">Screens</div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                          {PAGES.map(([id, label]) => (
                            <label key={id} className="flex items-center gap-1.5 text-[12px] text-stone-700 cursor-pointer">
                              <input type="checkbox" checked={p.pages.includes(id)} onChange={() => toggleCap(r, 'pages', id)} className="accent-saffron-600" />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] font-bold text-stone-500 uppercase tracking-wide mb-1.5">Sensitive actions</div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {ACTIONS.map(([id, label]) => (
                            <label key={id} className="flex items-center gap-1.5 text-[12px] text-stone-700 cursor-pointer">
                              <input type="checkbox" checked={p.actions.includes(id)} onChange={() => toggleCap(r, 'actions', id)} className="accent-saffron-600" />
                              {label}
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <button onClick={lockSession} className={btnGhost + ' mt-3'}>🔒 Lock this till now</button>
        </>
      )}
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

// Durable dual-write: mirror every settled bill to the owner's own invoice database.
// The outbox already queues bills; this panel sets the endpoint and shows sync health.
function SyncSection() {
  const { state, update, cloud } = useStore()
  const sync = state.settings.sync || {}
  const [url, setUrl] = useState(sync.apiUrl || '')
  const [st, setSt] = useState({ pending: 0, dead: 0, total: 0 })
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  // live sync-health poll (queue is tenant-scoped by the cloud code)
  React.useEffect(() => {
    if (!cloud?.code) return
    const tick = () => setSt(outboxStats(cloud.code))
    tick()
    const iv = setInterval(tick, 3000)
    return () => clearInterval(iv)
  }, [cloud?.code])

  if (!cloud?.code) {
    return (
      <Section title="🗄️ Backup bills to your own database (advanced)">
        <p className="text-sm text-stone-600">Turn on cloud sync first (sign in above). Durable dual-write then mirrors every settled bill to your own invoice database, on top of the live cloud — an off-site, gapless copy for accounting and recovery.</p>
      </Section>
    )
  }

  const on = !!sync.apiUrl
  const health = !on
    ? { label: '○ Off', color: 'stone', note: 'Bills stay on the live cloud only.' }
    : st.dead > 0
      ? { label: `● ${st.dead} failed`, color: 'red', note: 'Some bills were rejected — check the endpoint, then Retry failed.' }
      : st.pending > 0
        ? { label: `● ${st.pending} queued`, color: 'amber', note: 'Sending to your database…' }
        : { label: '● Up to date', color: 'green', note: 'Every settled bill is mirrored to your database.' }

  const saveUrl = () => {
    const v = url.trim()
    if (v && !/^https:\/\//i.test(v) && !/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(v)) {
      setMsg('Endpoint must start with https:// — your bill data and sign-in token are sent there.')
      return
    }
    update((s) => { s.settings.sync = { ...(s.settings.sync || {}), apiUrl: v } })
    setMsg(v ? 'Endpoint saved. New bills mirror to your database as they settle.' : 'Endpoint cleared — dual-write is off.')
  }
  const flushNow = async () => {
    if (!cloud?.code || !sync.apiUrl) return
    setBusy(true); setMsg('')
    try {
      const r = await outboxFlush(cloud.code, makeHttpSink(sync.apiUrl, getIdToken))
      setMsg(`Sent ${r.sent}${r.failed ? ` · ${r.failed} will retry` : ''}${r.dead ? ` · ${r.dead} rejected` : ''}.`)
      setSt(outboxStats(cloud.code))
    } catch { setMsg('Could not reach the sync endpoint.') }
    setBusy(false)
  }
  const retryFailed = async () => { outboxRetryDead(cloud.code); setSt(outboxStats(cloud.code)); await flushNow() }

  return (
    <Section title="🗄️ Backup bills to your own database (advanced)">
      <p className="text-sm text-stone-600 mb-3">Optional, for tech-savvy owners: keep a second copy of every bill in your own database, on top of the live cloud — an off-site backup for accounting. Leave blank to stay on cloud-only. Ask your developer if unsure.</p>
      <Field label="Your database web address (leave blank if you don't have one)">
        <div className="flex items-center gap-2">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.yourshop.in" className={inputCls + ' font-mono'} />
          <button onClick={saveUrl} disabled={url.trim() === (sync.apiUrl || '')} className={btnPrimary}>Save</button>
        </div>
      </Field>

      <div className="flex items-center gap-3 mt-3 flex-wrap">
        <Badge color={health.color}>{health.label}</Badge>
        <span className="text-xs text-stone-500">{health.note}</span>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-3 max-w-xs">
        <div className="bg-stone-50 rounded-xl px-3 py-2"><div className="text-xl font-black text-ink-900 tabular-nums">{st.pending}</div><div className="text-[11px] text-stone-400">Queued to send</div></div>
        <div className="bg-stone-50 rounded-xl px-3 py-2"><div className={`text-xl font-black tabular-nums ${st.dead ? 'text-red-600' : 'text-ink-900'}`}>{st.dead}</div><div className="text-[11px] text-stone-400">Rejected (need attention)</div></div>
      </div>

      {on && (
        <div className="flex items-center gap-2 mt-3">
          <button onClick={flushNow} disabled={busy} className={btnGhost}>{busy ? 'Syncing…' : '↻ Sync now'}</button>
          {st.dead > 0 && <button onClick={retryFailed} disabled={busy} className={btnGhost}>Retry failed</button>}
        </div>
      )}
      {msg && <p className="text-xs text-stone-500 mt-2">{msg}</p>}
    </Section>
  )
}

const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
    <h3 className="font-bold text-ink-900 mb-3">{title}</h3>
    {children}
  </div>
)
