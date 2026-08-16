import React, { useEffect, useState } from 'react'
import { useStore } from './store.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Billing from './pages/Billing.jsx'
import Tables from './pages/Tables.jsx'
import Reservations from './pages/Reservations.jsx'
import KDS from './pages/KDS.jsx'
import OnlineOrders from './pages/OnlineOrders.jsx'
import MenuPage from './pages/Menu.jsx'
import Inventory from './pages/Inventory.jsx'
import Purchase from './pages/Purchase.jsx'
import Customers from './pages/Customers.jsx'
import Feedback from './pages/Feedback.jsx'
import Reports from './pages/Reports.jsx'
import Register from './pages/Register.jsx'
import ExpensesPage from './pages/Expenses.jsx'
import AIInsights from './pages/AIInsights.jsx'
import Waste from './pages/Waste.jsx'
import Staff from './pages/Staff.jsx'
import Settings from './pages/Settings.jsx'
import QRMenu from './pages/QRMenu.jsx'
import Login from './pages/Login.jsx'
import Lock from './pages/Lock.jsx'
import { LANGS } from './i18n.js'
import { NavContext } from './nav.jsx'
import { PermContext } from './perms.jsx'
import { canPage, canAction, firstAllowedPage } from './permissions.js'
import { Kbd } from './components.jsx'
import ShortcutsHelp from './ShortcutsHelp.jsx'
import { PAGE_KEYS, KEY_TO_PAGE, isTyping } from './shortcuts.js'

const NAV = [
  { id: 'dashboard', icon: '📊', key: 'dashboard' },
  { id: 'billing', icon: '🧾', key: 'billing' },
  { id: 'tables', icon: '🪑', key: 'tables' },
  { id: 'reservations', icon: '📅', key: 'reservations' },
  { id: 'kds', icon: '👨‍🍳', key: 'kitchen' },
  { id: 'online', icon: '🛵', key: 'online' },
  { id: 'menu', icon: '📖', key: 'menu' },
  { id: 'inventory', icon: '📦', key: 'inventory' },
  { id: 'purchase', icon: '🚚', key: 'purchase' },
  { id: 'customers', icon: '👥', key: 'customers' },
  { id: 'feedback', icon: '💬', key: 'feedback' },
  { id: 'reports', icon: '📈', key: 'reports' },
  { id: 'register', icon: '💵', key: 'register' },
  { id: 'expenses', icon: '💸', key: 'expenses' },
  { id: 'ai', icon: '✨', key: 'ai' },
  { id: 'waste', icon: '🗑️', key: 'waste' },
  { id: 'staff', icon: '🧑‍💼', key: 'staff' },
  { id: 'settings', icon: '⚙️', key: 'settings' },
]

const PAGES = {
  dashboard: Dashboard, billing: Billing, tables: Tables, reservations: Reservations, kds: KDS,
  online: OnlineOrders, menu: MenuPage, inventory: Inventory, purchase: Purchase, customers: Customers, feedback: Feedback, reports: Reports,
  register: Register, expenses: ExpensesPage, ai: AIInsights, waste: Waste, staff: Staff, settings: Settings,
}

// screens shown in the mobile bottom tab bar (the rest live in the "More" drawer)
const BOTTOM_NAV = ['dashboard', 'billing', 'tables', 'kds']

export default function App() {
  const { state, t, update, cloud, cloudStatus, authUser, authReady, unlockSession, lockSession } = useStore()
  const [page, setPage] = useState('dashboard')
  const [focusOrderId, setFocusOrderId] = useState(null)
  const [hash, setHash] = useState(window.location.hash)
  const [helpOpen, setHelpOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  // demo (no-account) mode: explicit '1' opts in, '0' forces the login screen
  // (set on sign-out). With neither flag, grandfather anyone who already has
  // data so existing users aren't suddenly locked out by the new login gate.
  const [demo, setDemo] = useState(() => {
    const f = localStorage.getItem('khaanapeena_demo')
    if (f === '1') return true
    if (f === '0') return false
    return !!localStorage.getItem('khaanapeena_v1')
  })

  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])

  // navigate between pages, optionally handing off an order to focus on
  const goTo = (p, opts = {}) => {
    setPage(p)
    setFocusOrderId(opts.orderId ?? null)
    setDrawerOpen(false)
  }
  const clearFocus = () => setFocusOrderId(null)

  // global keyboard shortcuts — page nav + help (ignored while typing / QR view)
  useEffect(() => {
    if (hash.startsWith('#/qr')) return
    const onKey = (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return
      if (e.key === '?' || (e.key === '/' && e.shiftKey)) { e.preventDefault(); setHelpOpen((v) => !v); return }
      if (e.key === 'Escape') { setHelpOpen(false); return }
      const target = KEY_TO_PAGE[e.key.toLowerCase()]
      // don't let a shortcut jump to a screen the active role can't see
      const sess = state.session
      const allowed = !state.settings?.rbac?.enabled || !sess || canPage(state.settings, sess.role, target)
      if (target && allowed) { e.preventDefault(); goTo(target) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hash, state.session, state.settings])

  // RBAC: if the active role can't see the current page (e.g. after a switch-user),
  // bounce to the first screen it may see
  useEffect(() => {
    const sess = state.session
    if (state.settings?.rbac?.enabled && sess && !canPage(state.settings, sess.role, page)) {
      setPage(firstAllowedPage(state.settings, sess.role))
    }
  }, [state.session, state.settings, page])

  // Customer-facing QR ordering route: #/qr?t=T5 (never gated by login)
  if (hash.startsWith('#/qr')) return <QRMenu hash={hash} />

  // wait for Firebase to resolve the saved session before deciding
  if (!authReady) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-stone-50 text-3xl kp-pulse">🍛</div>
  }
  // not signed in and not in demo → show the login screen
  if (!authUser && !demo) {
    return <Login onDemo={() => { localStorage.setItem('khaanapeena_demo', '1'); setDemo(true) }} />
  }

  // RBAC: when enabled, require a PIN sign-in at this till before the app opens
  // enforce RBAC only where a Manager PIN exists to unlock it: managerPin is
  // device-local, so a device that merely SYNCED rbac.enabled=true (but has no local
  // Manager PIN) would otherwise show a Lock screen no one can pass. Such a device
  // simply doesn't enforce until its owner sets a Manager PIN here (Settings).
  const rbacOn = !!state.settings?.rbac?.enabled && !!state.settings?.managerPin
  const session = state.session || null
  // require a session WITH a role — a malformed/roleless session must re-lock, never
  // fall through to Owner access
  if (rbacOn && !(session && session.role)) return <Lock state={state} onUnlock={unlockSession} />

  const role = rbacOn ? session.role : 'Owner'
  const can = (action) => canAction(state.settings, role, action)
  const visibleNav = rbacOn ? NAV.filter((n) => canPage(state.settings, role, n.id)) : NAV
  const visibleBottom = rbacOn ? BOTTOM_NAV.filter((id) => canPage(state.settings, role, id)) : BOTTOM_NAV

  const Page = PAGES[page] || Dashboard
  const openKots = state.orders.filter((o) => o.status === 'kot').length
  const pendingOnline = state.orders.filter((o) => ['zomato', 'swiggy', 'whatsapp'].includes(o.type) && o.status === 'new').length

  const cloudDot = cloud ? (cloudStatus === 'live' ? 'text-green-400' : cloudStatus === 'error' ? 'text-red-400' : 'text-amber-400 kp-pulse') : 'text-stone-500'
  const currentLabel = t(NAV.find((n) => n.id === page)?.key || 'dashboard')

  const shell = (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* ---- DESKTOP SIDEBAR (hidden on phones) ---- */}
      <aside className="hidden md:flex w-56 shrink-0 bg-ink-900 text-stone-300 flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="text-xl font-black text-white tracking-tight">
            Khaana<span className="text-saffron-500">Peena</span>
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">Restaurant OS · Made for India 🇮🇳</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {visibleNav.map((n) => (
            <button
              key={n.id}
              onClick={() => goTo(n.id)}
              title={`${t(n.key)}  —  shortcut: ${PAGE_KEYS[n.id]}`}
              className={`group w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${
                page === n.id ? 'bg-saffron-600 text-white' : 'hover:bg-white/5'
              }`}
            >
              <span className="text-base">{n.icon}</span>
              <span className="flex-1 text-left">{t(n.key)}</span>
              {n.id === 'kds' && openKots > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full">{openKots}</span>}
              {n.id === 'online' && pendingOnline > 0 && <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 rounded-full kp-pulse">{pendingOnline}</span>}
              <span className={`text-[10px] font-mono font-bold rounded px-1 py-0.5 border transition-colors ${
                page === n.id ? 'border-white/30 text-white/90' : 'border-white/10 text-stone-500 group-hover:border-white/25 group-hover:text-stone-300'
              }`}>{PAGE_KEYS[n.id]}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          {/* No-PIN handover. With staff PIN login off, this is how a mid-shift
              change of hands still gets attributed — one tap, no code to remember.
              Blank falls back to whoever opened the cash register. */}
          {!rbacOn && (state.staff || []).length > 0 && (
            <label className="block mb-2">
              <span className="text-[9px] font-bold uppercase tracking-wider text-stone-500 block mb-1 px-1">On the till</span>
              <select
                value={session?.staffId || ''}
                onChange={(e) => {
                  const st = (state.staff || []).find((x) => x.id === e.target.value)
                  unlockSession(st ? { staffId: st.id, name: st.name, role: st.role || 'Cashier' } : null)
                }}
                className="w-full bg-white/5 hover:bg-white/10 text-stone-200 text-[11px] font-bold rounded-lg px-2 py-1.5 border border-white/10"
              >
                <option value="" className="text-stone-800">Whoever opened the register</option>
                {(state.staff || []).filter((s) => s.present !== false).map((s) => (
                  <option key={s.id} value={s.id} className="text-stone-800">{s.name} · {s.role}</option>
                ))}
              </select>
            </label>
          )}
          {rbacOn && (
            <div className="flex items-center gap-2 mb-2 rounded-lg px-2 py-1.5 bg-white/5">
              <span className="w-6 h-6 rounded-full bg-saffron-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">{(session.name || '?')[0]}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-bold text-white truncate leading-tight">{session.name}</div>
                <div className="text-[9px] text-stone-400 leading-tight">{role}</div>
              </div>
              <button onClick={lockSession} title="Lock / switch user" className="text-[10px] font-bold text-stone-300 hover:text-white bg-white/10 hover:bg-white/20 rounded-md px-2 py-1 shrink-0">🔒 Lock</button>
            </div>
          )}
          <button onClick={() => goTo('settings')} className="w-full flex items-center gap-1.5 text-[10px] font-bold mb-2 rounded-lg px-2 py-1 bg-white/5 hover:bg-white/10">
            <span className={cloudDot}>●</span>
            <span className="text-stone-300 truncate">{cloud ? `☁️ ${cloud.code}` : 'Local only — tap to sync'}</span>
          </button>
          <select
            value={state.settings.lang}
            onChange={(e) => update((s) => { s.settings.lang = e.target.value })}
            className="w-full bg-white/10 text-stone-200 text-xs rounded-lg px-2 py-1.5 outline-none"
          >
            {LANGS.map((l) => <option key={l.code} value={l.code} className="text-ink-900">{l.label}</option>)}
          </select>
          <div className="flex items-center justify-between mt-2">
            <div className="text-[10px] text-stone-500 truncate">{state.settings.name}</div>
            <button onClick={() => setHelpOpen(true)} title="Keyboard shortcuts (press ?)" className="flex items-center gap-1 text-[10px] text-stone-400 hover:text-white shrink-0">
              ⌨️ <Kbd dim>?</Kbd>
            </button>
          </div>
        </div>
      </aside>

      {/* ---- MAIN COLUMN ---- */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* mobile top bar */}
        <header className="md:hidden flex items-center justify-between bg-ink-900 text-white px-4 h-14 shrink-0 pt-[env(safe-area-inset-top)]">
          <div className="min-w-0">
            <div className="text-base font-black leading-none">Khaana<span className="text-saffron-500">Peena</span></div>
            <div className="text-[10px] text-stone-400 truncate">{currentLabel}</div>
          </div>
          <button onClick={() => goTo('settings')} className="flex items-center gap-1 text-[11px] font-bold bg-white/10 rounded-full px-3 py-1.5">
            <span className={cloudDot}>●</span>
            <span className="text-stone-200">{cloud ? cloud.code : 'Sync'}</span>
          </button>
        </header>

        <main className="flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
          <Page />
        </main>

        {/* mobile bottom tab bar */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-white border-t border-stone-200 flex pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_12px_rgba(0,0,0,0.06)]">
          {visibleBottom.map((id) => {
            const n = NAV.find((x) => x.id === id)
            const active = page === id
            return (
              <button key={id} onClick={() => goTo(id)} className={`flex-1 flex flex-col items-center gap-0.5 py-2 relative ${active ? 'text-saffron-600' : 'text-stone-500'}`}>
                <span className="text-xl leading-none">{n.icon}</span>
                <span className="text-[10px] font-bold">{t(n.key)}</span>
                {id === 'kds' && openKots > 0 && <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">{openKots}</span>}
              </button>
            )
          })}
          <button onClick={() => setDrawerOpen(true)} className="flex-1 flex flex-col items-center gap-0.5 py-2 relative text-stone-500">
            <span className="text-xl leading-none">☰</span>
            <span className="text-[10px] font-bold">More</span>
            {pendingOnline > 0 && <span className="absolute top-1 right-1/4 bg-red-500 text-white text-[9px] font-bold px-1 rounded-full kp-pulse">{pendingOnline}</span>}
          </button>
        </nav>
      </div>

      {/* ---- MOBILE "MORE" DRAWER ---- */}
      {drawerOpen && (
        <div className="md:hidden fixed inset-0 z-40 flex" onClick={() => setDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div className="relative ml-auto w-72 max-w-[85%] bg-ink-900 text-stone-300 h-full flex flex-col pt-[env(safe-area-inset-top)]" onClick={(e) => e.stopPropagation()}>
            <div className="px-4 py-4 border-b border-white/10 flex items-center justify-between">
              <span className="text-lg font-black text-white">All screens</span>
              <button onClick={() => setDrawerOpen(false)} className="text-stone-400 text-xl">✕</button>
            </div>
            <nav className="flex-1 overflow-y-auto py-2 px-2 grid grid-cols-2 gap-1.5 content-start">
              {visibleNav.map((n) => {
                const active = page === n.id
                return (
                  <button key={n.id} onClick={() => goTo(n.id)} className={`flex items-center gap-2 px-3 py-3 rounded-xl text-[13px] font-semibold ${active ? 'bg-saffron-600 text-white' : 'bg-white/5'}`}>
                    <span className="text-base">{n.icon}</span>
                    <span className="text-left leading-tight">{t(n.key)}</span>
                    {n.id === 'kds' && openKots > 0 && <span className="ml-auto bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">{openKots}</span>}
                    {n.id === 'online' && pendingOnline > 0 && <span className="ml-auto bg-red-500 text-white text-[9px] font-bold px-1 rounded-full">{pendingOnline}</span>}
                  </button>
                )
              })}
            </nav>
            <div className="p-3 border-t border-white/10">
              {!rbacOn && (state.staff || []).length > 0 && (
                <select
                  value={session?.staffId || ''}
                  onChange={(e) => {
                    const st = (state.staff || []).find((x) => x.id === e.target.value)
                    unlockSession(st ? { staffId: st.id, name: st.name, role: st.role || 'Cashier' } : null)
                  }}
                  className="w-full bg-white/10 text-stone-200 text-sm rounded-lg px-3 py-2.5 outline-none mb-2"
                >
                  <option value="" className="text-ink-900">On the till: whoever opened the register</option>
                  {(state.staff || []).filter((s) => s.present !== false).map((s) => (
                    <option key={s.id} value={s.id} className="text-ink-900">On the till: {s.name}</option>
                  ))}
                </select>
              )}
              <select
                value={state.settings.lang}
                onChange={(e) => update((s) => { s.settings.lang = e.target.value })}
                className="w-full bg-white/10 text-stone-200 text-sm rounded-lg px-3 py-2.5 outline-none mb-2"
              >
                {LANGS.map((l) => <option key={l.code} value={l.code} className="text-ink-900">{l.label}</option>)}
              </select>
              <div className="flex items-center justify-between">
                <div className="text-[11px] text-stone-500 truncate">{state.settings.name}</div>
                {rbacOn && <button onClick={() => { setDrawerOpen(false); lockSession() }} className="text-[11px] font-bold text-stone-300 bg-white/10 rounded-md px-2 py-1 shrink-0">🔒 {session.name} · Lock</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
  )

  return (
    <PermContext.Provider value={{ role, rbacOn, can, lock: lockSession, session }}>
      <NavContext.Provider value={{ page, goTo, focusOrderId, clearFocus }}>
        {shell}
      </NavContext.Provider>
    </PermContext.Provider>
  )
}
