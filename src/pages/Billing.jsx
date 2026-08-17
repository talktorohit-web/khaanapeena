import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, VegDot, Empty, Field, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { inr, inr0, billTotals, verifyManagerPin, tableName, discountReasonLabel, payModeLabel, VOID_REASONS } from '../utils.js'
import { usePerms } from '../perms.jsx'
import { hasModifiers, effectivePrice, lineKey, modsLabel, modsTotal } from '../modifiers.js'
import ModifierPicker from '../ModifierPicker.jsx'
import SettleModal from './SettleModal.jsx'
import PayerModal from './PayerModal.jsx'
import { printBill, printKOT, inElectron } from '../print.js'
import { SpeechRecognition } from '@capacitor-community/speech-recognition'

// Voice ordering runs two ways:
//  • Android app  → the phone's NATIVE recognizer via the Capacitor plugin (free, hi-IN)
//  • Web (Chrome/Edge) → the Web Speech API
// It can't work in Electron (Chromium has no speech service / API key) or a plain
// WebView with no plugin — so the button only appears where one of the two works.
const isNativeApp = () => typeof window !== 'undefined' && !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())
const webSpeechOk = () => typeof window !== 'undefined'
  && !!(window.SpeechRecognition || window.webkitSpeechRecognition)
  && !inElectron() && !window.Capacitor
import { useNav } from '../nav.jsx'

const NUM_WORDS = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, four: 4, chaar: 4, paanch: 5, panch: 5, five: 5, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8 }

export default function Billing() {
  const { state, t, update, newOrder, sendKot, settleOrder, rectifyLine, mergeOrders, splitOrder, moveItems, setOrderWaiter, markPrinted } = useStore()
  const { focusOrderId, clearFocus } = useNav()
  const { can } = usePerms()
  const [orderId, setOrderId] = useState(null)
  const [billOps, setBillOps] = useState(false) // split/merge modal
  const [editUnlock, setEditUnlock] = useState(false) // manager unlocked editing of punched items
  const [authManager, setAuthManager] = useState(null)
  const [pinAsk, setPinAsk] = useState(null) // { title, onOk }
  const [noteIdx, setNoteIdx] = useState(null) // which cart line's instruction is being edited
  const [noteText, setNoteText] = useState('')
  // dishes waiting for their choices to be picked. A queue rather than a single
  // item because one voice command can name several dishes that each need asking.
  const [modQueue, setModQueue] = useState([])
  const [voidAsk, setVoidAsk] = useState(null) // { li, delta } awaiting a cancellation reason
  const [payerForId, setPayerForId] = useState(null) // order whose bill is being sent to a remote payer
  const [receiptForId, setReceiptForId] = useState(null) // bill whose remote payer is owed a receipt

  // guest count on a dine-in table — feeds spend-per-guest and staffing reports
  const changeCovers = (d) => update((s) => {
    const o = s.orders.find((x) => x.id === orderId)
    if (o) o.covers = Math.max(0, Math.min(99, (o.covers || 0) + d)) || null
  })

  // per-item cooking instruction (e.g. "less chilly") — saved on the line and printed on the KOT
  const saveNote = (idx, text) => {
    update((s) => { const o = s.orders.find((x) => x.id === orderId); if (o && o.items[idx]) o.items[idx].notes = text.trim() || undefined })
    setNoteIdx(null); setNoteText('')
  }

  // when another page (Tables, Dashboard) sends us here for a specific order, select it
  useEffect(() => {
    if (focusOrderId) {
      setOrderId(focusOrderId)
      clearFocus()
    }
  }, [focusOrderId])

  // relock manager editing whenever the selected order changes
  useEffect(() => { setEditUnlock(false); setAuthManager(null) }, [orderId])
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [vegOnly, setVegOnly] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [printOrder, setPrintOrder] = useState(null)
  const [cartOpen, setCartOpen] = useState(false) // mobile bottom-sheet toggle
  const [printMsg, setPrintMsg] = useState('')
  const [listening, setListening] = useState(false)
  const [voiceMsg, setVoiceMsg] = useState('')
  const recRef = useRef(null)

  // aggregator/WhatsApp orders are settled from Online Orders/KDS, not the POS tab strip
  const activeOrders = state.orders.filter((o) => ['open', 'kot', 'ready', 'served'].includes(o.status) && !['zomato', 'swiggy', 'whatsapp'].includes(o.type))
  const order = state.orders.find((o) => o.id === orderId && o.status !== 'paid')
  // Both derived from live state rather than held as snapshots, so each one can
  // only exist while it still makes sense: the pay request disappears the moment
  // the bill is settled, and the receipt appears only once it's actually numbered.
  const payerOrder = payerForId
    ? state.orders.find((o) => o.id === payerForId && o.status !== 'paid')
    : null
  const receiptOrder = receiptForId
    ? state.orders.find((o) => o.id === receiptForId && o.status === 'paid' && o.billNo)
    : null

  const hour = new Date().getHours()
  const hh = state.settings.happyHour
  const happyHourNow = hh?.enabled && hour >= hh.from && hour < hh.to

  // billing keyboard shortcuts: F2 new order, F4 send KOT, F9 settle
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'F2') { e.preventDefault(); setOrderId(newOrder({ type: 'takeaway' })) }
      else if (e.key === 'F4') { if (order?.items.some((i) => !i.deducted)) { e.preventDefault(); sendKot(orderId) } }
      else if (e.key === 'F9') { if (order?.items.length && can('settle')) { e.preventDefault(); setSettleOpen(true) } }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [order, orderId])

  const items = useMemo(() => {
    const ql = q.toLowerCase()
    return state.items.filter(
      (i) =>
        i.available &&
        (cat === 'all' || i.catId === cat) &&
        (!vegOnly || i.veg) &&
        (!ql || i.name.toLowerCase().includes(ql) || (i.nameHi || '').includes(q))
    )
  }, [state.items, cat, q, vegOnly])

  // Add a dish. When it carries modifier groups the till has to ask first, so the
  // tap opens the picker instead of punching a line straight in.
  const addItem = (item) => {
    if (hasModifiers(item)) { setModQueue([{ item, qty: 1 }]); return }
    pushLine(item, [], 1)
  }

  const pushLine = (item, mods, qty = 1) => {
    let id = orderId
    if (!order) {
      id = newOrder({ type: 'takeaway' })
      setOrderId(id)
    }
    const price = effectivePrice(item, mods)
    update((s) => {
      const o = s.orders.find((x) => x.id === id)
      if (!o) return
      const draft = { itemId: item.id, deducted: false, mods }
      // only merge into a line with the SAME choices — "extra spicy" is a
      // different thing to sell than the plain dish
      const li = o.items.find((x) => !x.deducted && lineKey(x) === lineKey(draft))
      if (li) li.qty += qty
      else o.items.push({
        itemId: item.id, name: item.name, price, qty,
        ...(mods.length ? { mods, basePrice: item.price } : {}),
      })
    })
  }

  const changeQty = (li, d) =>
    update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      // match on the full line identity (dish + kitchen state + chosen options),
      // never itemId alone — the same dish can sit on two lines with different mods
      const line = o?.items.find((x) => lineKey(x) === lineKey(li))
      if (!line) return
      line.qty += d
      if (line.qty <= 0) o.items = o.items.filter((x) => x !== line)
    })

  // ---- Voice ordering (Hindi/English) — native recognizer in the app, Web Speech on web ----
  // Android app: use the phone's built-in recognizer via the Capacitor plugin.
  const startNativeVoice = async () => {
    try {
      const avail = await SpeechRecognition.available()
      if (!avail?.available) { setVoiceMsg('Voice input isn’t available on this device'); return }
      const perm = await SpeechRecognition.requestPermissions().catch(() => null)
      if (perm && perm.speechRecognition && perm.speechRecognition !== 'granted') {
        setVoiceMsg('Microphone blocked — allow mic access for KhaanaPeena in Settings'); return
      }
      setVoiceMsg('🎙️ Listening… say e.g. “do butter naan, ek dal makhani”')
      setListening(true)
      const res = await SpeechRecognition.start({
        language: state.settings.lang === 'hi' ? 'hi-IN' : 'en-IN',
        maxResults: 1, partialResults: false, popup: false,
      })
      setListening(false)
      const text = (res?.matches && res.matches[0]) || ''
      if (!text) { setVoiceMsg("Didn't catch that — tap 🎙️ and speak again"); return }
      const added = parseVoice(text)
      setVoiceMsg(added.length ? `Heard: “${text}” → added ${added.join(', ')}` : `Heard: “${text}” — no matching item`)
    } catch {
      setListening(false)
      setVoiceMsg('Voice error — check the app’s microphone permission')
    }
  }

  const toggleVoice = () => {
    if (isNativeApp()) {
      if (listening) { SpeechRecognition.stop().catch(() => {}); setListening(false); return }
      startNativeVoice()
      return
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setVoiceMsg('Voice not supported in this browser — use Chrome/Edge'); return }
    if (listening) { recRef.current?.stop(); return }
    const rec = new SR()
    rec.lang = state.settings.lang === 'hi' ? 'hi-IN' : 'en-IN'
    rec.interimResults = false
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      const added = parseVoice(text)
      setVoiceMsg(added.length ? `Heard: “${text}” → added ${added.join(', ')}` : `Heard: “${text}” — no matching item`)
    }
    rec.onend = () => setListening(false)
    rec.onerror = (ev) => {
      setListening(false)
      const map = {
        'not-allowed': 'Microphone blocked — allow mic access for this site, then try again',
        'service-not-allowed': 'Microphone blocked — allow mic access for this site, then try again',
        'no-speech': "Didn't catch that — tap 🎙️ and speak again",
        'audio-capture': 'No microphone found — check your mic is connected',
        'network': 'Voice needs an internet connection',
      }
      setVoiceMsg(map[ev?.error] || 'Voice error — try again')
    }
    recRef.current = rec
    setVoiceMsg('🎙️ Listening… say e.g. “do butter naan, ek dal makhani”')
    setListening(true)
    try { rec.start() } catch { setListening(false); setVoiceMsg('Tap 🎙️ again to start') }
  }

  const parseVoice = (text) => {
    // match full item names (longest first) against the transcript, consuming each
    // occurrence so "butter chicken" can't also match "chicken tikka"
    let remaining = ' ' + text.toLowerCase() + ' '
    const sorted = [...state.items].sort((a, b) => b.name.length - a.name.length)
    const matches = []
    for (const item of sorted) {
      const names = [item.name.toLowerCase().replace(/\s*\(.*?\)/g, '').trim(), (item.nameHi || '').trim()].filter(Boolean)
      for (const nm of names) {
        const idx = remaining.indexOf(nm)
        if (idx < 0) continue
        const before = remaining.slice(0, idx).trim().split(/\s+/)
        const lastW = before[before.length - 1] || ''
        const qty = /^\d+$/.test(lastW) ? parseInt(lastW) : NUM_WORDS[lastW] || 1
        matches.push({ item, qty })
        remaining = remaining.slice(0, idx) + ' ' + remaining.slice(idx + nm.length)
        break
      }
    }
    if (!matches.length) return []
    let id = orderId
    if (!order) { id = newOrder({ type: 'takeaway' }); setOrderId(id) }
    // A dish with choices (half/full, spice level) cannot be punched from speech —
    // nobody said which. Add the plain ones straight away and queue the rest for
    // the picker, or a spoken "dal makhani" would silently bill a full plate.
    const plain = matches.filter((m) => !hasModifiers(m.item))
    const needChoice = matches.filter((m) => hasModifiers(m.item))
    if (plain.length) {
      update((s) => {
        const o = s.orders.find((x) => x.id === id)
        if (!o) return
        plain.forEach(({ item, qty }) => {
          const li = o.items.find((x) => !x.deducted && lineKey(x) === lineKey({ itemId: item.id, deducted: false, mods: [] }))
          if (li) li.qty += qty
          else o.items.push({ itemId: item.id, name: item.name, price: item.price, qty })
        })
      })
    }
    if (needChoice.length) setModQueue(needChoice)
    return matches.map((m) => `${m.qty}× ${m.item.name}${hasModifiers(m.item) ? ' (choose…)' : ''}`)
  }

  const totals = order ? billTotals(order, state.settings) : null

  const cartCount = order ? order.items.reduce((s, i) => s + i.qty, 0) : 0
  const cartTotal = totals ? (state.settings.gstScheme === 'regular' ? totals.total : Math.round(totals.taxable)) : 0

  const flashPrint = (m) => { setPrintMsg(m); setTimeout(() => setPrintMsg(''), 3500) }

  // Send KOT to kitchen, then print the just-added items to the kitchen printer
  const doSendKot = async () => {
    if (!order) return
    const newItems = order.items.filter((i) => !i.deducted)
    // use the number sendKot actually issues (server counter when cloud-connected),
    // not the local seed value — otherwise every cloud KOT prints a stale "#1"
    const kotNo = await sendKot(orderId)
    const kotOrder = { ...order, items: newItems, kotNo, kotAt: Date.now() }
    const res = await printKOT(kotOrder, state.settings)
    if (res.ok) flashPrint('🖨️ KOT sent to kitchen printer')
    else if (res.reason && res.reason !== 'browser') flashPrint('⚠️ KOT print failed: ' + res.reason)
  }

  // Try the thermal printer; fall back to the printable HTML receipt
  const doPrintBill = async () => {
    if (!order || !totals) return
    // stamp the print time before sending: the gap to settlement is a report of
    // its own, and an item deleted after this moment is a different event
    markPrinted(orderId)
    const res = await printBill(order, state.settings, totals)
    if (res.ok) flashPrint('🖨️ Bill printed')
    else setPrintOrder(order)
  }

  return (
    <div className="flex h-full">
      {/* LEFT: menu grid */}
      <div className="flex-1 flex flex-col p-3 sm:p-4 min-w-0">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchItems')} className={inputCls + ' max-w-xs'} />
          <button onClick={() => setVegOnly(!vegOnly)} className={`${btnGhost} ${vegOnly ? '!bg-green-50 !border-green-300 !text-green-700' : ''}`}>🟢 {t('veg')}</button>
          {(isNativeApp() || webSpeechOk()) && (
            <button onClick={toggleVoice} title="Voice ordering" className={`${btnGhost} ${listening ? '!bg-red-50 !border-red-300 !text-red-600 kp-pulse' : ''}`}>
              🎙️ {listening ? t('listening') : t('voiceOrder')}
            </button>
          )}
          {happyHourNow && <Badge color="amber">🕒 Happy Hour −{hh.discountPct}%</Badge>}
        </div>
        {voiceMsg && <div className="text-xs text-stone-500 mb-2 bg-stone-100 rounded-lg px-3 py-1.5">{voiceMsg}</div>}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <CatChip active={cat === 'all'} onClick={() => setCat('all')}>All</CatChip>
          {state.categories.map((c) => (
            <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {state.settings.lang === 'hi' ? c.nameHi : state.settings.lang === 'pa' ? c.namePa : c.name}
            </CatChip>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto content-start flex-1 pb-24 md:pb-2">
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => addItem(i)}
              className="bg-white rounded-xl border border-stone-100 shadow-sm p-3 text-left hover:border-saffron-400 hover:shadow transition-all active:scale-95"
            >
              <div className="flex items-start justify-between gap-1">
                <VegDot veg={i.veg} />
                <span className="text-[10px] text-stone-400 uppercase">{i.station}</span>
              </div>
              <div className="font-semibold text-[13px] text-ink-900 mt-1 leading-tight">{i.name}</div>
              {state.settings.lang !== 'en' && <div className="text-[11px] text-stone-400">{i.nameHi}</div>}
              <div className="flex items-baseline gap-1.5 mt-1">
                <span className="text-saffron-700 font-bold text-sm">{inr0(i.price)}</span>
                {hasModifiers(i) && <span className="text-[10px] font-bold text-blue-600">🧩 choices</span>}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* MOBILE: floating "view order" bar (above the app tab bar) */}
      {cartCount > 0 && !cartOpen && (
        <button
          onClick={() => setCartOpen(true)}
          className="md:hidden fixed inset-x-3 z-30 bg-ink-900 text-white rounded-2xl shadow-xl flex items-center justify-between px-4 py-3"
          style={{ bottom: 'calc(4.5rem + env(safe-area-inset-bottom))' }}
        >
          <span className="font-bold text-sm">🛒 {cartCount} item{cartCount > 1 ? 's' : ''}{order?.tableId ? ` · 🪑 ${tableName(state.tables, order.tableId)}` : ''}</span>
          <span className="font-black">{inr0(cartTotal)} · View →</span>
        </button>
      )}

      {/* MOBILE backdrop for the cart sheet */}
      {cartOpen && <div className="md:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setCartOpen(false)} />}

      {/* RIGHT: order panel — desktop side panel, mobile bottom sheet */}
      <div className={`bg-white flex-col
        ${cartOpen ? 'flex' : 'hidden'} md:flex
        fixed inset-x-0 bottom-0 z-40 h-[86dvh] rounded-t-2xl shadow-2xl border-t border-stone-200
        md:static md:h-full md:w-[340px] md:shrink-0 md:border-l md:border-t-0 md:rounded-none md:shadow-none`}>
        {/* mobile sheet header */}
        <div className="md:hidden flex items-center justify-between px-4 pt-3 pb-1">
          <div className="w-10 h-1 bg-stone-300 rounded-full mx-auto absolute left-1/2 -translate-x-1/2 top-1.5" />
          <span className="font-black text-ink-900">Current order</span>
          <button onClick={() => setCartOpen(false)} className="text-stone-400 text-xl">✕</button>
        </div>
        <div className="p-3 border-b border-stone-100">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button title="New order (F2)" onClick={() => setOrderId(newOrder({ type: 'takeaway' }))} className="shrink-0 bg-saffron-600 text-white text-xs font-bold rounded-lg px-3 py-1.5">＋ {t('newOrder')} <span className="opacity-60 font-mono">F2</span></button>
            {activeOrders.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrderId(o.id)}
                className={`shrink-0 text-xs font-semibold rounded-lg px-2.5 py-1.5 border ${o.id === orderId ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}
              >
                {o.tableId ? `🪑 ${tableName(state.tables, o.tableId)}` : o.type === 'qr' ? '📱 QR' : '🛍️'} {(o.items || []).reduce((s, i) => s + i.qty, 0)}
              </button>
            ))}
          </div>
          {order && (
            <div className="flex items-center gap-2 mt-2">
              {['dine', 'takeaway', 'delivery'].includes(order.type) ? (
                <select
                  value={order.type}
                  onChange={(e) => update((s) => { const o = s.orders.find((x) => x.id === orderId); if (o) { o.type = e.target.value; if (e.target.value !== 'dine') o.tableId = null } })}
                  className="text-xs border border-stone-200 rounded-lg px-2 py-1"
                >
                  <option value="dine">{t('dineIn')}</option>
                  <option value="takeaway">{t('takeaway')}</option>
                  <option value="delivery">{t('delivery')}</option>
                </select>
              ) : (
                <Badge color="purple">{order.type.toUpperCase()}{order.tableId ? ` · ${tableName(state.tables, order.tableId)}` : ''}</Badge>
              )}
              {order.type === 'dine' && (
                <select
                  value={order.tableId || ''}
                  onChange={(e) => update((s) => { const o = s.orders.find((x) => x.id === orderId); if (o) o.tableId = e.target.value || null })}
                  className="text-xs border border-stone-200 rounded-lg px-2 py-1"
                >
                  <option value="">Table…</option>
                  {state.tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name} ({tb.area})</option>)}
                </select>
              )}
              {/* Who is serving this table. Assigned at seating so waiter-wise
                  sales and the employee ranking rest on a real record. */}
              {order.type === 'dine' && (
                <select
                  value={order.waiterId || ''}
                  onChange={(e) => setOrderWaiter(orderId, e.target.value || null)}
                  title="Which waiter is looking after this table"
                  className={`text-xs border rounded-lg px-2 py-1 ${order.waiterId ? 'border-stone-200 text-stone-600' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                >
                  <option value="">Waiter…</option>
                  {(state.staff || []).filter((s) => s.present !== false).map((s) => (
                    <option key={s.id} value={s.id}>{s.name}{s.role ? ` (${s.role})` : ''}</option>
                  ))}
                </select>
              )}
              {/* How many guests are on this table. Amber until it's set, because an
                  unfilled cover count silently blanks the per-guest reports. */}
              {order.type === 'dine' && (
                <div
                  title="How many guests are eating on this table"
                  className={`flex items-center gap-0.5 text-xs border rounded-lg px-1.5 py-0.5 shrink-0 ${order.covers ? 'border-stone-200 text-stone-600' : 'border-amber-300 bg-amber-50 text-amber-700'}`}
                >
                  <span className="mr-0.5">👥</span>
                  <button onClick={() => changeCovers(-1)} className="w-4 font-black leading-none disabled:opacity-30" disabled={!order.covers}>−</button>
                  <span className="w-5 text-center font-bold tabular-nums">{order.covers || '–'}</span>
                  <button onClick={() => changeCovers(1)} className="w-4 font-black leading-none">＋</button>
                </div>
              )}
              <Badge color={order.status === 'kot' ? 'amber' : order.status === 'ready' ? 'green' : 'blue'}>{order.status.toUpperCase()}</Badge>
            </div>
          )}
          {order && (order.items || []).some((i) => i.deducted) && (
            editUnlock ? (
              <button onClick={() => { setEditUnlock(false); setAuthManager(null) }} className="w-full mt-2 text-[11px] font-bold bg-green-50 text-green-700 border border-green-200 rounded-lg py-1.5">
                🔓 Manager mode{authManager ? ` · ${authManager.name}` : ''} — tap to lock
              </button>
            ) : (
              <button onClick={() => setPinAsk({ title: 'Manager PIN — edit sent items', onOk: (m) => { setEditUnlock(true); setAuthManager(m); setPinAsk(null) } })} className="w-full mt-2 text-[11px] font-bold bg-stone-100 text-stone-600 border border-stone-200 rounded-lg py-1.5">
                🔒 Edit items already sent to kitchen (manager)
              </button>
            )
          )}
          {order && order.items.length > 0 && (
            <button onClick={() => setBillOps(true)} className="w-full mt-2 text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200 rounded-lg py-1.5">
              ⑂ Split / Move / Merge
            </button>
          )}
          {/* Someone not at the table is paying — send them the bill to settle */}
          {order && order.items.length > 0 && (
            <button onClick={() => setPayerForId(order.id)} className="w-full mt-2 text-[11px] font-bold bg-green-50 text-green-700 border border-green-200 rounded-lg py-1.5">
              📤 {order.payer?.requestedAt ? `Bill sent to ${order.payer.name || order.payer.phone}` : 'Someone else is paying — send them the bill'}
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!order || order.items.length === 0 ? (
            <Empty icon="🛒" text="Tap items to add" />
          ) : (
            order.items.map((li, idx) => (
              <div key={idx} className="py-2 border-b border-stone-50">
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-semibold text-ink-900 truncate">{li.name} {li.deducted && <span className="text-[9px] text-amber-600 font-bold">KOT✓</span>}</div>
                    {li.mods?.length > 0 && (
                      <div className="text-[11px] text-blue-600 leading-tight break-words">
                        {modsLabel(li.mods)}{modsTotal(li.mods) > 0 ? <span className="text-stone-400"> · +{inr0(modsTotal(li.mods))}</span> : null}
                      </div>
                    )}
                    <div className="text-[11px] text-stone-400">{inr0(li.price)} × {li.qty}</div>
                    {li.notes && <div className="text-[11px] text-saffron-700 font-semibold mt-0.5 flex items-start gap-1"><span>📝</span><span className="break-words">{li.notes}</span></div>}
                  </div>
                  <button
                    onClick={() => { if (noteIdx === idx) { setNoteIdx(null) } else { setNoteIdx(idx); setNoteText(li.notes || '') } }}
                    title="Add a cooking instruction (prints on the kitchen ticket)"
                    className={`w-7 h-7 rounded-md text-sm shrink-0 ${li.notes ? 'bg-saffron-100 text-saffron-700' : 'bg-stone-100 text-stone-400 hover:text-saffron-600'}`}
                  >📝</button>
                  <div className="flex items-center gap-1">
                    {li.deducted ? (
                      editUnlock ? (
                        <>
                          <QtyBtn onClick={() => setVoidAsk({ li, delta: -1 })}>−</QtyBtn>
                          <span className="w-6 text-center text-sm font-bold">{li.qty}</span>
                          <button title="Remove this item" onClick={() => setVoidAsk({ li, delta: 'remove' })} className="w-6 h-6 rounded-md bg-red-100 hover:bg-red-200 text-red-600 font-bold text-sm leading-none">🗑</button>
                        </>
                      ) : (
                        <>
                          <QtyBtn disabled>−</QtyBtn>
                          <span className="w-6 text-center text-sm font-bold">{li.qty}</span>
                          <QtyBtn disabled>＋</QtyBtn>
                        </>
                      )
                    ) : (
                      <>
                        <QtyBtn onClick={() => changeQty(li, -1)}>−</QtyBtn>
                        <span className="w-6 text-center text-sm font-bold">{li.qty}</span>
                        <QtyBtn onClick={() => changeQty(li, 1)}>＋</QtyBtn>
                      </>
                    )}
                  </div>
                  <div className="w-14 text-right text-[13px] font-bold">{inr0(li.price * li.qty)}</div>
                </div>
                {noteIdx === idx && (
                  <div className="flex items-center gap-2 mt-2">
                    <input
                      autoFocus value={noteText} maxLength={80}
                      onChange={(e) => setNoteText(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveNote(idx, noteText); if (e.key === 'Escape') { setNoteIdx(null); setNoteText('') } }}
                      placeholder="e.g. kam mirchi / less chilly · no onion · extra spicy"
                      className="flex-1 text-[12px] border border-stone-200 rounded-lg px-2 py-1.5"
                    />
                    <button onClick={() => saveNote(idx, noteText)} className="text-[11px] font-bold bg-saffron-600 hover:bg-saffron-700 text-white rounded-lg px-3 py-1.5 shrink-0">Save</button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {order && totals && (
          <div className="border-t border-stone-100 p-3 space-y-1 text-sm">
            <Row l={t('subtotal')} v={inr(totals.sub)} />
            {totals.discount > 0 && <Row l={t('discount')} v={'−' + inr(totals.discount)} cls="text-green-600" />}
            {totals.svc > 0 && <Row l={`Service charge ${totals.svcRate}%`} v={inr(totals.svc)} muted />}
            {state.settings.gstScheme === 'regular' ? (
              <>
                <Row l={`CGST ${totals.gstRate / 2}%`} v={inr(totals.cgst)} muted />
                <Row l={`SGST ${totals.gstRate / 2}%`} v={inr(totals.sgst)} muted />
              </>
            ) : (
              <Row l="Composition scheme — no GST on bill" v="" muted />
            )}
            <div className="flex justify-between font-black text-lg text-ink-900 pt-1 border-t border-stone-100">
              <span>{t('total')}</span><span>{inr0(state.settings.gstScheme === 'regular' ? totals.total : Math.round(totals.taxable + totals.svc))}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button title="Send KOT (F4)" onClick={doSendKot} disabled={!order.items.some((i) => !i.deducted)} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-xs">🔥 {t('sendKot')} <span className="opacity-60 font-mono">F4</span></button>
              <button title="Print bill" onClick={doPrintBill} className="bg-stone-700 hover:bg-stone-800 text-white font-bold rounded-xl py-2.5 text-xs">🖨️ {t('printBill')}</button>
              <button title={can('settle') ? 'Settle / Pay (F9)' : 'Not allowed for your role'} onClick={() => can('settle') && setSettleOpen(true)} disabled={!order.items.length || !can('settle')} className="bg-leaf-600 hover:bg-leaf-500 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-xs">💳 {t('settle')} <span className="opacity-60 font-mono">F9</span></button>
            </div>
            {printMsg && <div className="text-[11px] text-center mt-1 text-stone-500">{printMsg}</div>}
          </div>
        )}
      </div>

      {settleOpen && order && (
        <SettleModal
          order={order} totals={totals} allowDiscount={can('discount')} onClose={() => setSettleOpen(false)}
          onDone={(payload) => {
            const settledId = orderId
            // the person who paid isn't in the room — close the loop by offering
            // them proof once the bill actually settles (we watch for it below,
            // because settleOrder is async and may wait on a server bill number)
            if (order.payer?.phone) setReceiptForId(settledId)
            settleOrder(settledId, payload)
            setSettleOpen(false)
            setOrderId(null)
            setCartOpen(false)
          }}
          happyHourNow={happyHourNow}
        />
      )}
      {payerOrder && <PayerModal order={payerOrder} mode="bill" onClose={() => setPayerForId(null)} />}
      {/* waits for the bill number the settle actually issued before offering the receipt */}
      {receiptOrder && <PayerModal order={receiptOrder} mode="receipt" onClose={() => setReceiptForId(null)} />}
      {voidAsk && (
        <VoidReasonModal
          line={voidAsk.li}
          remove={voidAsk.delta === 'remove'}
          onClose={() => setVoidAsk(null)}
          onOk={(reason) => { rectifyLine(orderId, voidAsk.li, voidAsk.delta, authManager, reason); setVoidAsk(null) }}
        />
      )}
      {modQueue.length > 0 && (
        <ModifierPicker
          key={modQueue[0].item.id + modQueue.length}
          item={modQueue[0].item}
          initialQty={modQueue[0].qty}
          queued={modQueue.length - 1}
          onClose={() => setModQueue((q) => q.slice(1))}
          onAdd={(mods, qty) => { pushLine(modQueue[0].item, mods, qty); setModQueue((q) => q.slice(1)) }}
        />
      )}
      {printOrder && <BillPrint order={printOrder} onClose={() => setPrintOrder(null)} />}
      {pinAsk && (
        <ManagerPinModal
          title={pinAsk.title}
          onClose={() => setPinAsk(null)}
          verify={(pin) => verifyManagerPin(state, pin)}
          onOk={pinAsk.onOk}
        />
      )}
      {billOps && order && (
        <BillOpsModal
          order={order}
          orders={state.orders}
          tables={state.tables}
          onMerge={(fromId) => { mergeOrders(order.id, fromId); setBillOps(false) }}
          onSplit={(picks) => { const nid = splitOrder(order.id, picks); setBillOps(false); if (nid) setOrderId(nid) }}
          onMove={(toId, picks) => { moveItems(order.id, toId, picks); setBillOps(false) }}
          onClose={() => setBillOps(false)}
        />
      )}
    </div>
  )
}

function BillOpsModal({ order, orders, tables, onMerge, onSplit, onMove, onClose }) {
  const [tab, setTab] = useState('split')
  const [picks, setPicks] = useState(() => order.items.map(() => 0))
  const [moveTo, setMoveTo] = useState('')
  const tblName = (id) => tables.find((t) => t.id === id)?.name || id
  const mergeable = orders.filter((o) => o.id !== order.id && ['open', 'kot', 'ready', 'served'].includes(o.status) && !['zomato', 'swiggy', 'whatsapp'].includes(o.type))
  const splitTotal = order.items.reduce((s, li, i) => s + li.price * (picks[i] || 0), 0)
  const anySplit = picks.some((q) => q > 0)
  const pickList = () => order.items.map((li, i) => ({ idx: i, qty: picks[i] || 0 })).filter((p) => p.qty > 0)

  // the item picker is identical for splitting and moving — only the destination differs
  const ItemPicker = () => (
    <div className="space-y-2 mb-3">
      {order.items.map((li, i) => (
        <div key={i} className="flex items-center gap-2">
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-ink-900 truncate">{li.name}</div>
            <div className="text-[11px] text-stone-400">{inr0(li.price)} × {li.qty}{li.deducted ? ' · KOT✓' : ''}{li.mods?.length ? ` · ${modsLabel(li.mods)}` : ''}</div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPicks((p) => p.map((q, j) => (j === i ? Math.max(0, q - 1) : q)))} className="w-7 h-7 rounded-md bg-stone-100 font-bold">−</button>
            <span className="w-8 text-center text-sm font-bold tabular-nums">{picks[i] || 0}</span>
            <button onClick={() => setPicks((p) => p.map((q, j) => (j === i ? Math.min(li.qty, q + 1) : q)))} className="w-7 h-7 rounded-md bg-stone-100 font-bold">＋</button>
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <Modal open title="Split / Move / Merge" onClose={onClose} wide>
      <div className="flex gap-2 mb-4 flex-wrap">
        {[['split', '⑂ Split bill'], ['move', '➡ Move items'], ['merge', '⇄ Merge tables']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-lg text-sm font-bold ${tab === k ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'move' ? (
        <div>
          <p className="text-xs text-stone-400 mb-3">
            Send selected items to another running table — when a guest moves seats, or a dish was punched on the wrong table.
            Items already sent to the kitchen carry their KOT status across, so stock isn't deducted twice.
          </p>
          {mergeable.length === 0 ? (
            <Empty icon="➡" text="No other running order to move items to." />
          ) : (
            <>
              <ItemPicker />
              <label className="block mb-3">
                <span className="text-xs font-semibold text-stone-500 block mb-1">Move to</span>
                <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={inputCls}>
                  <option value="">Choose the table…</option>
                  {mergeable.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.tableId ? `🪑 ${tblName(o.tableId)}` : o.type.toUpperCase()} · {(o.items || []).reduce((s, li) => s + li.qty, 0)} items
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-center justify-between border-t border-stone-100 pt-3">
                <div className="text-sm text-stone-500">Moving <b className="text-ink-900 ml-1">{inr0(splitTotal)}</b></div>
                <button disabled={!anySplit || !moveTo} onClick={() => onMove(moveTo, pickList())} className={btnPrimary}>Move items</button>
              </div>
            </>
          )}
        </div>
      ) : tab === 'split' ? (
        <div>
          <p className="text-xs text-stone-400 mb-3">Move items onto a separate bill (for a guest paying on their own). The rest stays on this bill; both are settled separately.</p>
          <div className="space-y-2 mb-3">
            {order.items.map((li, i) => (
              <div key={i} className="flex items-center gap-2">
                <div className="flex-1 min-w-0"><div className="text-sm font-semibold text-ink-900 truncate">{li.name}</div><div className="text-[11px] text-stone-400">{inr0(li.price)} × {li.qty}{li.deducted ? ' · KOT✓' : ''}</div></div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPicks((p) => p.map((q, j) => (j === i ? Math.max(0, q - 1) : q)))} className="w-7 h-7 rounded-md bg-stone-100 font-bold">−</button>
                  <span className="w-8 text-center text-sm font-bold tabular-nums">{picks[i] || 0}</span>
                  <button onClick={() => setPicks((p) => p.map((q, j) => (j === i ? Math.min(li.qty, q + 1) : q)))} className="w-7 h-7 rounded-md bg-stone-100 font-bold">＋</button>
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-stone-100 pt-3">
            <div className="text-sm text-stone-500">New bill <b className="text-ink-900 ml-1">{inr0(splitTotal)}</b></div>
            <button disabled={!anySplit} onClick={() => onSplit(order.items.map((li, i) => ({ idx: i, qty: picks[i] || 0 })).filter((p) => p.qty > 0))} className={btnPrimary}>Create separate bill</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="text-xs text-stone-400 mb-3">Combine another table's running order into this bill. That table is freed.</p>
          {mergeable.length === 0 ? <Empty icon="⇄" text="No other open orders to merge." /> : (
            <div className="space-y-2">
              {mergeable.map((o) => {
                const tot = o.items.reduce((s, li) => s + li.price * li.qty, 0)
                return (
                  <div key={o.id} className="flex items-center justify-between border border-stone-200 rounded-xl px-3 py-2">
                    <div><div className="text-sm font-semibold text-ink-900">{o.tableId ? `🪑 ${tblName(o.tableId)}` : o.type.toUpperCase()}</div><div className="text-[11px] text-stone-400">{o.items.length} item{o.items.length > 1 ? 's' : ''} · {inr0(tot)}</div></div>
                    <button onClick={() => { if (confirm('Merge this order into the current bill?')) onMerge(o.id) }} className="text-xs font-bold bg-saffron-600 hover:bg-saffron-700 text-white rounded-lg px-3 py-1.5">Merge in</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}

// A cancelled item is food already cooked. Asking why at the moment it happens is
// the only time anyone knows — the cancellation report is built on these answers.
function VoidReasonModal({ line, remove, onClose, onOk }) {
  const [reason, setReason] = useState('')
  return (
    <Modal open onClose={onClose} title={remove ? `Remove ${line.name}?` : `Reduce ${line.name} by 1?`}>
      <p className="text-xs text-stone-500 mb-3">
        This item has already gone to the kitchen. It will be logged against the manager, with the time,
        and it shows up in the cancellation report.
      </p>
      <span className="text-xs font-semibold text-stone-500 block mb-1.5">Why? <span className="text-red-500">*</span></span>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {VOID_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 border ${reason === r ? 'bg-ink-900 text-white border-ink-900' : 'bg-white border-stone-200 text-stone-600'}`}>{r}</button>
        ))}
      </div>
      <button onClick={() => onOk(reason)} disabled={!reason} className={btnPrimary + ' w-full'}>
        {remove ? 'Remove item' : 'Reduce by 1'}
      </button>
    </Modal>
  )
}

function ManagerPinModal({ title, onClose, verify, onOk }) {
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const submit = () => {
    const m = verify(pin)
    if (m) onOk(m)
    else { setErr('Wrong PIN'); setPin('') }
  }
  return (
    <Modal open onClose={onClose} title={`🔒 ${title}`}>
      <p className="text-xs text-stone-500 mb-3">Only a manager can change items already sent to the kitchen. Enter the manager PIN to authorise.</p>
      <input
        type="password" inputMode="numeric" autoFocus value={pin}
        onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
        onKeyDown={(e) => e.key === 'Enter' && submit()}
        placeholder="••••" className={inputCls + ' text-center text-2xl tracking-[0.5em] font-mono'}
      />
      {err && <p className="text-xs text-red-600 mt-2">{err}</p>}
      <button onClick={submit} disabled={pin.length < 4} className={btnPrimary + ' w-full mt-4'}>Authorise</button>
      <p className="text-[10px] text-stone-400 mt-2 text-center">Set or change the PIN in Settings → Security.</p>
    </Modal>
  )
}

const CatChip = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{children}</button>
)
const QtyBtn = ({ onClick, disabled, children }) => (
  <button onClick={onClick} disabled={disabled} title={disabled ? 'Sent to kitchen — add a fresh line instead' : undefined} className="w-6 h-6 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm leading-none disabled:opacity-30 disabled:cursor-not-allowed">{children}</button>
)
const Row = ({ l, v, muted, cls = '' }) => (
  <div className={`flex justify-between ${muted ? 'text-stone-400 text-xs' : 'text-stone-600'} ${cls}`}><span>{l}</span><span>{v}</span></div>
)
export function BillPrint({ order, onClose }) {
  const { state } = useStore()
  const s = state.settings
  const totals = billTotals(order, s)
  const isComposition = s.gstScheme === 'composition'
  const payable = isComposition ? Math.round(totals.taxable + totals.svc) : totals.total
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300)
    return () => clearTimeout(id)
  }, [])
  return (
    <Modal open onClose={onClose} title="Bill preview">
      <div id="kp-print" className="mx-auto bg-white border border-dashed border-stone-300 p-4 text-[12px] font-mono w-[280px] text-ink-900">
        <div className="text-center">
          <div className="font-black text-sm">{s.name}</div>
          <div>{s.address}</div>
          <div>Ph: {s.phone}</div>
          <div>GSTIN: {s.gstin}</div>
          <div>FSSAI: {s.fssai}</div>
          <div className="font-bold mt-1">{isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE'}</div>
        </div>
        <div className="border-t border-dashed border-stone-400 my-1" />
        <div>Bill No: {order.billNo || 'DRAFT'} · {order.tableId ? `Table ${order.tableId}` : order.type}{order.covers ? ` · ${order.covers} guest${order.covers > 1 ? 's' : ''}` : ''}</div>
        {order.waiterName && <div>Served by: {order.waiterName}</div>}
        {order.payer?.phone && <div>Paid by: {order.payer.name || order.payer.phone}</div>}
        {order.party?.type === 'firm' && (
          <div className="border border-dashed border-stone-400 px-1 my-1">
            <div>Billed to: {order.party.name}</div>
            <div>GSTIN: {order.party.gstin}</div>
          </div>
        )}
        <div>{new Date(order.createdAt).toLocaleString('en-IN')}</div>
        <div className="border-t border-dashed border-stone-400 my-1" />
        {(order.items || []).map((li, i) => {
          // priced add-ons get their own rupee line — a guest who asked for extra
          // chicken should see what the extra chicken cost, not just a bigger total
          const base = li.basePrice ?? li.price
          const priced = (li.mods || []).filter((m) => +m.price > 0)
          const free = (li.mods || []).filter((m) => !(+m.price > 0))
          return (
            <div key={i}>
              <div className="flex justify-between">
                <span>{li.name} × {li.qty}</span><span>{(base * li.qty).toFixed(2)}</span>
              </div>
              {free.length > 0 && <div className="text-[10px] pl-2">({free.map((m) => m.name).join(', ')})</div>}
              {priced.map((m, j) => (
                <div key={j} className="flex justify-between text-[11px] pl-2">
                  <span>+ {m.name} × {li.qty}</span><span>{(m.price * li.qty).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )
        })}
        <div className="border-t border-dashed border-stone-400 my-1" />
        <div className="flex justify-between"><span>Subtotal</span><span>{totals.sub.toFixed(2)}</span></div>
        {totals.discount > 0 && (
          <>
            <div className="flex justify-between"><span>Discount{order.payment?.discountPct ? ` (${order.payment.discountPct}%)` : ''}</span><span>-{totals.discount.toFixed(2)}</span></div>
            {order.payment?.discountReason && (
              <div className="text-[10px] text-stone-600">({discountReasonLabel(order.payment.discountReason).replace(/^\S+\s/, '')}{order.payment.discountNote ? ` — ${order.payment.discountNote}` : ''})</div>
            )}
          </>
        )}
        {/* service charge sits above the tax lines because GST is charged on it */}
        {totals.svc > 0 && <div className="flex justify-between"><span>Service charge @{totals.svcRate}%</span><span>{totals.svc.toFixed(2)}</span></div>}
        {!isComposition && (
          <>
            <div className="flex justify-between"><span>CGST @{totals.gstRate / 2}%</span><span>{totals.cgst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>SGST @{totals.gstRate / 2}%</span><span>{totals.sgst.toFixed(2)}</span></div>
          </>
        )}
        {order.svcWaived && s.serviceCharge > 0 && <div className="text-[10px]">Service charge waived at guest's request</div>}
        <div className="flex justify-between font-black text-sm border-t border-dashed border-stone-400 mt-1 pt-1">
          <span>TOTAL</span><span>₹{payable}</span>
        </div>
        {order.payment?.nc && (
          <div className="border border-dashed border-stone-400 px-1 mt-1 text-[10px]">
            <div className="font-bold">NOT CHARGEABLE — ₹0 collected</div>
            <div>Ref: {order.payment.nc.reference}</div>
            <div>{order.payment.nc.explanation}</div>
            <div>Approved by: {order.payment.nc.by}</div>
          </div>
        )}
        {order.payment?.splits?.length > 1 && (
          <div className="text-[10px] mt-1">
            Paid: {order.payment.splits.map((sp) => `${payModeLabel(sp.method).replace(/^\S+\s/, '')} ${sp.amount}`).join(' + ')}
          </div>
        )}
        {isComposition && <div className="mt-1 text-[10px]">Composition taxable person, not eligible to collect tax on supplies</div>}
        <div className="text-center mt-2">🙏 Dhanyavaad! Visit again 🙏<br />Powered by KhaanaPeena<br />Support: {s.supportPhone || '9614300003'}</div>
      </div>
    </Modal>
  )
}
