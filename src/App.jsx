import React, { useEffect, useState } from 'react'
import { useStore } from './store.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Billing from './pages/Billing.jsx'
import Tables from './pages/Tables.jsx'
import KDS from './pages/KDS.jsx'
import OnlineOrders from './pages/OnlineOrders.jsx'
import MenuPage from './pages/Menu.jsx'
import Inventory from './pages/Inventory.jsx'
import Customers from './pages/Customers.jsx'
import Reports from './pages/Reports.jsx'
import AIInsights from './pages/AIInsights.jsx'
import Waste from './pages/Waste.jsx'
import Staff from './pages/Staff.jsx'
import Settings from './pages/Settings.jsx'
import QRMenu from './pages/QRMenu.jsx'
import { LANGS } from './i18n.js'
import { NavContext } from './nav.jsx'
import { Kbd } from './components.jsx'
import ShortcutsHelp from './ShortcutsHelp.jsx'
import { PAGE_KEYS, KEY_TO_PAGE, isTyping } from './shortcuts.js'

const NAV = [
  { id: 'dashboard', icon: '📊', key: 'dashboard' },
  { id: 'billing', icon: '🧾', key: 'billing' },
  { id: 'tables', icon: '🪑', key: 'tables' },
  { id: 'kds', icon: '👨‍🍳', key: 'kitchen' },
  { id: 'online', icon: '🛵', key: 'online' },
  { id: 'menu', icon: '📖', key: 'menu' },
  { id: 'inventory', icon: '📦', key: 'inventory' },
  { id: 'customers', icon: '👥', key: 'customers' },
  { id: 'reports', icon: '📈', key: 'reports' },
  { id: 'ai', icon: '✨', key: 'ai' },
  { id: 'waste', icon: '🗑️', key: 'waste' },
  { id: 'staff', icon: '🧑‍💼', key: 'staff' },
  { id: 'settings', icon: '⚙️', key: 'settings' },
]

const PAGES = {
  dashboard: Dashboard, billing: Billing, tables: Tables, kds: KDS, online: OnlineOrders,
  menu: MenuPage, inventory: Inventory, customers: Customers, reports: Reports,
  ai: AIInsights, waste: Waste, staff: Staff, settings: Settings,
}

export default function App() {
  const { state, t, update, cloud, cloudStatus } = useStore()
  const [page, setPage] = useState('dashboard')
  const [focusOrderId, setFocusOrderId] = useState(null)
  const [hash, setHash] = useState(window.location.hash)
  const [helpOpen, setHelpOpen] = useState(false)

  useEffect(() => {
    const fn = () => setHash(window.location.hash)
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])

  // navigate between pages, optionally handing off an order to focus on
  const goTo = (p, opts = {}) => {
    setPage(p)
    setFocusOrderId(opts.orderId ?? null)
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
      if (target) { e.preventDefault(); goTo(target) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hash])

  // Customer-facing QR ordering route: #/qr?t=T5
  if (hash.startsWith('#/qr')) return <QRMenu hash={hash} />

  const Page = PAGES[page] || Dashboard
  const openKots = state.orders.filter((o) => o.status === 'kot').length
  const pendingOnline = state.orders.filter((o) => ['zomato', 'swiggy', 'whatsapp'].includes(o.type) && o.status === 'new').length

  return (
    <NavContext.Provider value={{ page, goTo, focusOrderId, clearFocus }}>
    <div className="flex h-screen overflow-hidden">
      <aside className="w-56 shrink-0 bg-ink-900 text-stone-300 flex flex-col">
        <div className="px-4 py-5 border-b border-white/10">
          <div className="text-xl font-black text-white tracking-tight">
            Khaana<span className="text-saffron-500">Peena</span>
          </div>
          <div className="text-[10px] text-stone-500 mt-0.5">Restaurant OS · Made for India 🇮🇳</div>
        </div>
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV.map((n) => (
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
              {/* shortcut hint — subtle, brightens on hover / active */}
              <span className={`text-[10px] font-mono font-bold rounded px-1 py-0.5 border transition-colors ${
                page === n.id ? 'border-white/30 text-white/90' : 'border-white/10 text-stone-500 group-hover:border-white/25 group-hover:text-stone-300'
              }`}>{PAGE_KEYS[n.id]}</span>
            </button>
          ))}
        </nav>
        <div className="p-3 border-t border-white/10">
          <button onClick={() => goTo('settings')} className="w-full flex items-center gap-1.5 text-[10px] font-bold mb-2 rounded-lg px-2 py-1 bg-white/5 hover:bg-white/10">
            {cloud ? (
              <><span className={cloudStatus === 'live' ? 'text-green-400' : cloudStatus === 'error' ? 'text-red-400' : 'text-amber-400 kp-pulse'}>●</span><span className="text-stone-300">☁️ {cloud.code}</span></>
            ) : (
              <><span className="text-stone-500">●</span><span className="text-stone-400">Local only — tap to sync</span></>
            )}
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
      <main className="flex-1 overflow-y-auto">
        <Page />
      </main>
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
    </div>
    </NavContext.Provider>
  )
}
