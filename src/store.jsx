import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { makeSeed } from './seed.js'
import { makeT } from './i18n.js'
import { uid, billTotals, sentiment, todayISO } from './utils.js'
import { lineKey, repriceLine } from './modifiers.js'
import { seedPrinters } from './stations.js'
import {
  loadCloudCfg, saveCloudCfg, createCloud, fetchCloud, subscribeCloud,
  pushChanges, mergeRemote, joinRemote, nextCounterAtLeast, claimRestaurant, publishPublic,
  stampMetaRecords, migrateCloudFormat, isLegacyFormat,
} from './cloud.js'
import { onAuth, signUp, signIn, logout, setUserRestaurant, getUserRestaurant, getIdToken } from './auth.js'
import { enqueue as outboxEnqueue, flush as outboxFlush, makeHttpSink, financialYear } from './outbox.js'

const KEY = 'khaanapeena_v1'
const Ctx = createContext(null)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.v === 1) {
        // per-record sync bookkeeping: ensure the deletion log exists and GC old
        // tombstones (a 45-day-old delete is safe to forget — all devices synced)
        s._tomb = s._tomb || {}
        const cutoff = Date.now() - 45 * 864e5
        for (const k of Object.keys(s._tomb)) if ((s._tomb[k] || 0) < cutoff) delete s._tomb[k]
        // heal any order whose `items` was lost to a cloud round-trip (RTDB drops
        // empty arrays) so already-persisted corrupt state can't crash on next load
        ;(s.orders || []).forEach((o) => { if (o && !o.items) o.items = [] })
        // Service charge shipped as 5% in the seed, but an install created before
        // that keeps its old 0 and would never show the line at all. Set it once,
        // and record that we did — so an owner who deliberately chooses 0 later is
        // never overridden again.
        if (s.settings && !s.settings.svcConfigured) {
          if (!s.settings.serviceCharge) s.settings.serviceCharge = 5
          s.settings.svcConfigured = true
        }
        if (s.settings && s.settings.supportPhone == null) s.settings.supportPhone = '9614300003'
        // Kitchen printers used to be free text typed onto each dish. Seed one
        // printer per station the menu ALREADY routes to (not just our four
        // defaults), so no existing dish opens the editor pointing at a counter
        // that isn't in the list.
        if (s.settings && !s.settings.printers) s.settings.printers = seedPrinters(s.items)
        return s
      }
    }
  } catch { /* corrupted state falls through to reseed */ }
  return makeSeed()
}

// stamp updatedAt on orders whose content changed, and per-record _u (+ deletion
// tombstones) on every meta collection — this powers per-order AND per-record cloud
// LWW merging, so two devices editing different records never clobber each other
function stampChanges(prev, draft) {
  const now = Date.now()
  const prevById = {}
  prev.orders.forEach((o) => { prevById[o.id] = o })
  draft.orders.forEach((o) => {
    const p = prevById[o.id]
    if (!p) { o.updatedAt = o.updatedAt || now; return }
    if (JSON.stringify({ ...p, updatedAt: 0 }) !== JSON.stringify({ ...o, updatedAt: 0 })) o.updatedAt = now
  })
  stampMetaRecords(prev, draft, now)
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load)
  const [cloud, setCloud] = useState(loadCloudCfg)
  const [cloudStatus, setCloudStatus] = useState('idle') // idle | syncing | live | error
  const [authUser, setAuthUser] = useState(null) // { uid, email } | null
  const [authReady, setAuthReady] = useState(false)
  const lastPushRef = useRef(0)
  const lastPublicRef = useRef(0)
  const migratedRef = useRef(false) // legacy whole-blob → per-record migration runs once
  const authUserRef = useRef(null)
  const stateRef = useRef(state) // latest state, for reading counters synchronously in async actions
  useEffect(() => { authUserRef.current = authUser }, [authUser])
  useEffect(() => { stateRef.current = state }, [state])

  // watch Firebase auth state (persists across app restarts)
  useEffect(() => {
    let unsub = () => {}
    try { unsub = onAuth((u) => { setAuthUser(u); setAuthReady(true) }) }
    catch { setAuthReady(true) } // offline / auth unavailable → let the app run in demo
    return () => unsub()
  }, [])

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full */ }
  }, [state])

  // cross-tab sync (same device): adopt writes from other tabs
  useEffect(() => {
    const fn = (e) => {
      if (e.key !== KEY || !e.newValue) return
      try {
        const v = JSON.parse(e.newValue)
        if (v && v.v === 1) setState(v)
      } catch { /* ignore malformed */ }
    }
    window.addEventListener('storage', fn)
    return () => window.removeEventListener('storage', fn)
  }, [])

  // ---- cloud: inbound subscription ----
  useEffect(() => {
    if (!cloud?.code) return
    setCloudStatus('syncing')
    const unsub = subscribeCloud(cloud.code, (remote) => {
      setCloudStatus('live')
      // one-time upgrade of a legacy whole-blob restaurant to the per-record layout
      if (cloud.role === 'owner' && isLegacyFormat(remote) && !migratedRef.current) {
        migratedRef.current = true
        migrateCloudFormat(cloud.code, joinRemote(remote)).catch(() => { migratedRef.current = false })
      }
      setState((local) => {
        const merged = mergeRemote(local, remote)
        if (cloud.role === 'owner') {
          // SECURITY: guest QR orders are UNAUTHENTICATED writes. Before they can
          // touch billing or inventory, re-price every line from the authoritative
          // menu and clamp qty — a forged payload (price:0, qty:1000000, or a bogus
          // itemId) then can't zero a bill or drain stock.
          merged.orders.forEach((o) => {
            if (o.source !== 'qr-guest' || o.sanitized) return
            ;(o.items || []).forEach((li) => {
              const item = merged.items.find((i) => i.id === li.itemId)
              if (!item) { li.qty = 0; li.price = 0; li.mods = []; return }
              // add-ons are re-looked-up by id and re-priced from the menu too —
              // otherwise a guest could invent a "-₹500 discount" option
              const { mods, price } = repriceLine(li, item)
              li.mods = mods
              li.basePrice = item.price
              li.price = price
              li.qty = Math.max(1, Math.min(50, Math.floor(+li.qty || 1)))
              if (li.notes) li.notes = String(li.notes).slice(0, 80) // cap any instruction a guest attached
            })
            o.sanitized = true
            o.updatedAt = Date.now()
          })
          // SECURITY: guest reviews are unauthenticated writes too. Clamp the rating,
          // trim the free text, and recompute sentiment ourselves — a guest can't
          // forge a sentiment label, a reply, or a resolved flag.
          ;(merged.feedback || []).forEach((f) => {
            if (f.source !== 'qr-guest' || f.sanitized) return
            f.rating = Math.max(1, Math.min(5, Math.floor(+f.rating || 1)))
            f.text = String(f.text || '').slice(0, 500)
            f.sentiment = sentiment(f.text, f.rating)
            delete f.reply
            f.resolved = false
            f.sanitized = true
            f._u = Date.now()
          })
          // owner device runs inventory deduction for KOTs that arrived from
          // guest/other devices (their lines were never deducted locally)
          merged.orders.forEach((o) => {
            if (!['kot', 'ready', 'served', 'paid'].includes(o.status)) return
            ;(o.items || []).forEach((li) => {
              if (li.deducted) return
              const item = merged.items.find((i) => i.id === li.itemId)
              item?.recipe?.forEach(({ ingId, qty }) => {
                const ing = merged.ingredients.find((g) => g.id === ingId)
                if (ing) { ing.stock = Math.max(0, +(ing.stock - qty * li.qty).toFixed(3)); ing._u = Date.now() }
              })
              li.deducted = true
              li.updatedAt = Date.now()
              o.updatedAt = Date.now()
            })
          })
        }
        return JSON.stringify(merged) === JSON.stringify(local) ? local : merged
      })
    })
    return unsub
  }, [cloud?.code])

  // ---- cloud: outbound push (debounced, only what changed since last push;
  // echo pushes after a merge are no-ops thanks to the updatedAt filter) ----
  useEffect(() => {
    if (!cloud?.code) return
    const timer = setTimeout(() => {
      const since = lastPushRef.current
      lastPushRef.current = Date.now()
      pushChanges(cloud.code, state, since).catch(() => setCloudStatus('error'))
      // owner keeps the world-readable guest menu in sync when the menu-affecting
      // slices (settings, categories, items) change — gated on their newest _u
      if (cloud.role === 'owner') {
        const pubVer = Math.max(
          state.settings?._u || 0,
          ...(state.items || []).map((i) => i._u || 0),
          ...(state.categories || []).map((c) => c._u || 0),
        )
        if (pubVer > lastPublicRef.current) {
          lastPublicRef.current = pubVer
          publishPublic(cloud.code, state).catch(() => {})
        }
      }
    }, 400)
    return () => clearTimeout(timer)
  }, [state, cloud?.code])

  // ---- dual-write: drain the outbox to the invoice API (dormant unless a sync
  // endpoint is configured) — on mount, when connectivity returns, and every 30s ----
  useEffect(() => {
    const code = cloud?.code
    const apiUrl = state.settings?.sync?.apiUrl
    if (!code || !apiUrl) return
    const sink = makeHttpSink(apiUrl, getIdToken)
    const run = () => { if (navigator.onLine) outboxFlush(code, sink).catch(() => {}) }
    run()
    const iv = setInterval(run, 30000)
    window.addEventListener('online', run)
    return () => { clearInterval(iv); window.removeEventListener('online', run) }
  }, [cloud?.code, state.settings?.sync?.apiUrl])

  const api = useMemo(() => {
    const update = (fn) => setState((prev) => {
      const draft = structuredClone(prev)
      fn(draft)
      stampChanges(prev, draft)
      return draft
    })

    // Who is operating this till right now: the RBAC session when staff login is
    // on, else whoever opened the cash register (Register asks for a name). Stamped
    // onto orders + bills so the Staff report can attribute sales. null when
    // neither is known — Firebase drops null keys, so nothing is written remotely.
    const operatorName = (s) =>
      s.session?.name || (s.shifts || []).find((sh) => sh.status === 'open')?.openedBy || null

    const newOrder = ({ type, tableId = null, source = 'pos' }) => {
      const id = uid('o')
      update((s) => {
        s.orders.push({
          id, billNo: null, type, tableId, items: [], status: 'open',
          createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
          payment: { method: null, discount: 0, amount: 0 }, source, kotNo: null,
          takenBy: operatorName(s),
          // a table already knows who is serving it — inherit rather than re-ask
          ...(tableId ? (() => {
            const tb = (s.tables || []).find((x) => x.id === tableId)
            const st = tb?.waiterId && (s.staff || []).find((x) => x.id === tb.waiterId)
            return st ? { waiterId: st.id, waiterName: st.name } : {}
          })() : {}),
        })
      })
      return id
    }

    // An offline RTDB runTransaction (web SDK, no persistence) NEVER rejects — its
    // promise just stays pending until reconnect. Awaiting it directly would hang
    // "Send KOT"/"Settle" forever the instant WiFi drops. Race it against a short
    // timeout so we fall back to the local counter and keep serving.
    const withTimeout = (p, ms = 2500) => Promise.race([p, new Promise((r) => setTimeout(() => r(null), ms))])
    // atomic, server-authoritative counter, FLOORED at this device's local next
    // number (so an offline device that issued 6,7,8 locally can't have the server
    // hand out 6 again = a duplicate GST invoice number), with the offline timeout.
    // Returns null → caller uses the local counter.
    const allocNumber = async (name, floor = 1) => {
      const code = loadCloudCfg()?.code
      if (code) {
        try { const v = await withTimeout(nextCounterAtLeast(code, name, floor)); if (v != null) return v } catch { /* offline → local */ }
      }
      return null
    }

    // returns the KOT number actually issued, so the caller prints the right one
    // (server counter when online, local otherwise — never the stale seed value)
    const sendKot = async (orderId) => {
      const localNext = stateRef.current.counters?.kotNo || 1
      const server = await allocNumber('kotNo', localNext)
      const issued = server != null ? server : localNext
      update((s) => {
        const o = s.orders.find((x) => x.id === orderId)
        if (!o || !(o.items || []).length) return
        o.status = 'kot'
        o.kotAt = Date.now()
        o.kotNo = issued
        // keep the local counter past the number we just issued (server or local)
        // so an offline settle later never re-issues a used number
        s.counters.kotNo = Math.max(s.counters.kotNo || 1, issued + 1)
        // auto-deduct inventory from recipes
        o.items.forEach((li) => {
          if (li.deducted) return
          const item = s.items.find((i) => i.id === li.itemId)
          item?.recipe?.forEach(({ ingId, qty }) => {
            const ing = s.ingredients.find((g) => g.id === ingId)
            if (ing) ing.stock = Math.max(0, +(ing.stock - qty * li.qty).toFixed(3))
          })
          li.deducted = true
        })
      })
      return issued
    }

    const settleOrder = async (orderId, { method, discount = 0, discountPct = null, discountReason = null, discountNote = null, customerId = null, redeemPoints = 0, splits = null, nc = null, party = null }) => {
      // GUARD: never settle an already-paid order twice. An online 'ready' order
      // exposes a settle control on BOTH KDS and Online Orders, so a double-tap
      // (or two staff) would otherwise burn a second invoice number and double the
      // loyalty credit. Check before allocating so we don't even waste a number.
      const pre = stateRef.current.orders.find((x) => x.id === orderId)
      if (!pre || pre.status === 'paid') return pre?.billNo || null
      const localNext = stateRef.current.counters?.billNo || 1
      const server = await allocNumber('billNo', localNext)
      const issued = server != null ? server : localNext
      update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o || o.status === 'paid') return
      // SECURITY belt: a guest (qr-guest) order may reach a non-owner till before the
      // owner device re-priced it. Re-price from the authoritative menu here too, so
      // ANY device that settles it can't be handed a forged price:0 / qty:1e6 bill.
      if (o.source === 'qr-guest' && !o.sanitized) {
        ;(o.items || []).forEach((li) => {
          const item = s.items.find((i) => i.id === li.itemId)
          if (!item) { li.qty = 0; li.price = 0; li.mods = []; return }
          const { mods, price } = repriceLine(li, item)
          li.mods = mods
          li.basePrice = item.price
          li.price = price
          li.qty = Math.max(1, Math.min(50, Math.floor(+li.qty || 1)))
        })
        o.sanitized = true
      }
      o.payment = { method, discount }
      // why the money was given up — only stored when there was a discount, so
      // Firebase never carries an empty key on the overwhelming majority of bills
      if (discount > 0 && discountReason) {
        o.payment.discountReason = discountReason
        if (discountNote) o.payment.discountNote = String(discountNote).slice(0, 60)
      }
      if (discount > 0 && discountPct > 0) o.payment.discountPct = +discountPct
      const totals = billTotals(o, s.settings)
      // composition scheme: no GST collected, but service charge still applies
      o.payment.amount = s.settings.gstScheme === 'composition' ? Math.round(totals.taxable + totals.svc) : totals.total

      // "Not chargeable" — the food went out and nothing is collected. The bill is
      // still numbered and kept so the foregone value is auditable; a reference and
      // an explanation are mandatory at the till, which is why they're recorded here.
      if (method === 'nc' && nc) {
        o.payment.nc = { reference: String(nc.reference || '').slice(0, 40), explanation: String(nc.explanation || '').slice(0, 200), by: nc.by || operatorName(s) || 'Manager', value: o.payment.amount }
        o.payment.amount = 0
      }
      // paid across several modes — keep the parts; paymentSplit() reads them
      if (Array.isArray(splits) && splits.length > 1) {
        o.payment.splits = splits.map((x) => ({ method: x.method, amount: Math.round(+x.amount || 0) })).filter((x) => x.amount > 0)
      }
      // a firm needs its GSTIN on the invoice to claim input credit
      if (party && party.type === 'firm' && (party.gstin || party.name)) {
        o.party = { type: 'firm', name: String(party.name || '').slice(0, 80), gstin: String(party.gstin || '').toUpperCase().slice(0, 15) }
      }
      o.status = 'paid'
      o.paidAt = Date.now()
      o.billNo = issued
      // attribute the collection to whoever is on the till (Staff report / drawer)
      const who = operatorName(s)
      if (who) o.settledBy = who
      // advance the local counter past the issued number so an offline bill later
      // can't duplicate an invoice number already used (server or local)
      s.counters.billNo = Math.max(s.counters.billNo || 1, issued + 1)
      o.customerId = customerId || o.customerId
      if (o.customerId) {
        const c = s.customers.find((x) => x.id === o.customerId)
        if (c) {
          c.visits++
          // record what the customer actually paid (composition bills charge only
          // the taxable value — using totals.total would inflate spend/loyalty)
          c.totalSpend += o.payment.amount
          c.points += Math.floor(totals.taxable / 100) * (s.settings.loyaltyEarnPer100 || 1)
          if (redeemPoints) c.points = Math.max(0, c.points - redeemPoints)
          c.lastVisit = Date.now()
        }
      }
      })
      // dual-write mirror: queue this bill for the Postgres invoice authority.
      // Dormant unless a sync endpoint is configured — with none set this is a
      // no-op and the live billing flow is unchanged. Best-effort; never blocks
      // the bill. Built from the pre-update snapshot + the values just assigned.
      try {
        const st = stateRef.current
        const code = loadCloudCfg()?.code
        if (code && st.settings?.sync?.apiUrl) {
          const o = st.orders.find((x) => x.id === orderId)
          if (o) {
            const bt = billTotals({ ...o, payment: { ...o.payment, discount } }, st.settings)
            const composition = st.settings.gstScheme === 'composition'
            outboxEnqueue(code, 'bill', orderId, {
              sourceOrderId: orderId,
              outletCode: code,
              billNo: issued,
              fy: financialYear(Date.now()),
              amount: composition ? Math.round(bt.taxable) : bt.total,
              method,
              gstScheme: st.settings.gstScheme || 'regular',
              taxable: Math.round(bt.taxable),
              cgst: composition ? 0 : Math.round(bt.cgst),
              sgst: composition ? 0 : Math.round(bt.sgst),
              settledAt: new Date().toISOString(),
              lines: (o.items || []).map((li) => ({ name: li.name, qty: li.qty, price: li.price })),
            })
          }
        }
      } catch { /* mirror is best-effort — a settled bill is never held up by it */ }
    }

    // ---- table service: who is looking after this table ----
    // Assigning at seating time is what makes waiter-wise sales and the
    // employee-of-the-month ranking real rather than guessed.
    const assignTableWaiter = (tableId, staffId) => update((s) => {
      const tb = (s.tables || []).find((x) => x.id === tableId)
      const st = (s.staff || []).find((x) => x.id === staffId)
      if (tb) tb.waiterId = staffId || null
      // carry it onto whatever order is running on that table right now
      ;(s.orders || []).forEach((o) => {
        if (o.tableId !== tableId || !['open', 'kot', 'ready', 'served'].includes(o.status)) return
        o.waiterId = staffId || null
        o.waiterName = st?.name || null
        o.updatedAt = Date.now()
      })
    })

    const setOrderWaiter = (orderId, staffId) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      const st = (s.staff || []).find((x) => x.id === staffId)
      o.waiterId = staffId || null
      o.waiterName = st?.name || null
      o.updatedAt = Date.now()
      // keep the table's default in step, so the next order inherits it
      const tb = (s.tables || []).find((x) => x.id === o.tableId)
      if (tb) tb.waiterId = staffId || null
    })

    // stamp when the bill was first printed — the gap between this and paidAt is
    // how long a table sat holding a printed bill, and it anchors the
    // cancellation report ("item deleted 12 minutes AFTER the bill was printed")
    const markPrinted = (orderId) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (o && !o.printedAt) { o.printedAt = Date.now(); o.updatedAt = Date.now() }
    })

    // ---- move selected items onto another running order ----
    // Different from split (which makes a NEW bill) and merge (which moves ALL of
    // them): this is one dish walking to another table.
    const moveItems = (fromId, toId, picks) => update((s) => {
      const from = s.orders.find((x) => x.id === fromId)
      const to = s.orders.find((x) => x.id === toId)
      if (!from || !to || from.id === to.id || from.status === 'paid' || to.status === 'paid') return
      to.items = to.items || []
      picks.forEach(({ idx, qty }) => {
        const li = from.items[idx]
        const take = Math.min(+qty || 0, li ? li.qty : 0)
        if (!li || take <= 0) return
        // a KOT'd line keeps its deducted flag so stock isn't taken twice
        const existing = to.items.find((x) => lineKey(x) === lineKey(li))
        if (existing) existing.qty += take
        else to.items.push({ ...li, qty: take })
        li.qty -= take
      })
      from.items = from.items.filter((li) => li.qty > 0)
      from.updatedAt = Date.now()
      to.updatedAt = Date.now()
    })

    // ---- someone else is paying ----
    // A host sends guests in and settles from wherever they are. We keep who they
    // are on the order so the receipt can be sent after the bill closes, and so
    // the bill register can answer "who actually paid for this table?".
    const setOrderPayer = (orderId, payer) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      o.payer = payer
        ? {
          name: String(payer.name || '').slice(0, 60),
          phone: String(payer.phone || '').replace(/\D/g, '').slice(-10),
          requestedAt: o.payer?.requestedAt || null,
          receiptSentAt: o.payer?.receiptSentAt || null,
        }
        : undefined
      o.updatedAt = Date.now()
    })

    // stamp that the bill (or the receipt) actually went out, so the till can show
    // "sent 8:42pm" rather than leaving the cashier guessing whether they did it
    const markPayerSent = (orderId, kind) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o || !o.payer) return
      o.payer[kind === 'receipt' ? 'receiptSentAt' : 'requestedAt'] = Date.now()
      o.updatedAt = Date.now()
    })

    // ---- expenses: money out that isn't stock ----
    // Recorded separately from GRNs (which buy inventory) and from shift cash
    // movements (which only move the float). A cash expense is subtracted from the
    // drawer by shiftTotals, so the register still reconciles.
    const addExpenses = (rows) => update((s) => {
      s.expenses = s.expenses || []
      ;(rows || []).forEach((r) => {
        if (!r.reason || !(+r.amount > 0)) return
        s.expenses.push({
          id: uid('ex'),
          at: r.at || Date.now(),
          date: r.date || todayISO(),
          reason: r.reason,
          amount: +r.amount,
          note: String(r.note || '').slice(0, 120),
          staffId: r.staffId || null,
          staffName: r.staffName || '',
          paidFrom: r.paidFrom || 'cash',
          by: operatorName(s) || 'Owner',
        })
      })
    })
    const deleteExpense = (id) => update((s) => { s.expenses = (s.expenses || []).filter((x) => x.id !== id) })

    // ---- refund / sales return ----
    // The bill stays settled and keeps its invoice number — a GST invoice is never
    // deleted, it's credited. Refunded food isn't resellable, so no stock returns.
    const refundBill = (orderId, { amount, reason, method, by }) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o || o.status !== 'paid' || o.refund) return
      const paidAmt = o.payment?.amount || 0
      const amt = Math.max(0, Math.min(paidAmt, Math.round(+amount || 0)))
      if (!amt) return
      o.refund = {
        amount: amt, reason: String(reason || '').slice(0, 80),
        method: method || o.payment?.method || 'cash',
        full: amt >= paidAmt, at: Date.now(), by: by || operatorName(s) || 'Manager',
      }
      o.updatedAt = Date.now()
      // claw back the loyalty this bill earned on the refunded portion
      const c = o.customerId && s.customers.find((x) => x.id === o.customerId)
      if (c) {
        c.totalSpend = Math.max(0, (c.totalSpend || 0) - amt)
        c.points = Math.max(0, (c.points || 0) - Math.floor(amt / 100) * (s.settings.loyaltyEarnPer100 || 1))
      }
    })

    // ---- udhaar / credit ----
    // A bill settled on credit is closed and numbered like any other, but the money
    // hasn't arrived. It stays outstanding until someone records the collection.
    const collectDue = (orderId, { method = 'cash' } = {}) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o || o.payment?.method !== 'credit' || o.creditPaid) return
      o.creditPaid = { at: Date.now(), method, by: operatorName(s) || 'Owner' }
      o.updatedAt = Date.now()
    })

    // ---- physical stock take ----
    // The only honest way to get a theoretical-vs-actual variance: the system
    // knows what the recipes SHOULD have consumed, but only a human counting the
    // godown knows what actually left it. We snapshot both numbers at the moment
    // of counting (the system figure is stored, not recomputed later, so the
    // variance stays true even after stock moves on) and optionally correct stock
    // to the counted reality.
    const recordStockTake = (lines, { correct = true } = {}) => update((s) => {
      s.stockTakes = s.stockTakes || []
      s.stockTakes.push({
        id: uid('st'), at: Date.now(), by: operatorName(s) || 'Owner', corrected: !!correct,
        lines: lines.map((l) => ({
          ingId: l.ingId, system: +l.system || 0, counted: +l.counted || 0, cost: +l.cost || 0,
        })),
      })
      if (correct) {
        lines.forEach((l) => {
          const g = s.ingredients.find((x) => x.id === l.ingId)
          if (g) g.stock = +(+l.counted || 0).toFixed(3)
        })
      }
    })

    const resetDemo = () => {
      localStorage.removeItem(KEY)
      setState(makeSeed())
    }

    // ---- cash register / shifts ----
    const openShift = (openingFloat, by) => update((s) => {
      s.shifts = s.shifts || []
      if (s.shifts.some((x) => x.status === 'open')) return // one open register at a time
      s.shifts.push({
        id: uid('sh'), openedAt: Date.now(), openedBy: by || '', openingFloat: +openingFloat || 0,
        cashMovements: [], status: 'open', closedAt: null, closedBy: null, z: null,
      })
    })
    const addCashMovement = (type, amount, reason, by) => update((s) => {
      const sh = (s.shifts || []).find((x) => x.status === 'open')
      if (!sh) return
      sh.cashMovements = sh.cashMovements || []
      sh.cashMovements.push({ id: uid('cm'), at: Date.now(), type, amount: +amount || 0, reason: reason || '', by: by || '' })
    })
    // close = generate the Z-report: snapshot totals so history is immutable
    const closeShift = (countedCash, by, zSnapshot) => update((s) => {
      const sh = (s.shifts || []).find((x) => x.status === 'open')
      if (!sh) return
      sh.closedAt = Date.now()
      sh.closedBy = by || ''
      sh.status = 'closed'
      sh.z = { ...zSnapshot, countedCash: +countedCash || 0, variance: (+countedCash || 0) - (zSnapshot?.expectedCash || 0) }
    })

    // ---- reservations / table bookings ----
    const addReservation = (r) => update((s) => {
      s.reservations = s.reservations || []
      s.reservations.push({ id: uid('res'), status: 'booked', createdAt: Date.now(), ...r })
    })
    const updateReservation = (id, fields) => update((s) => {
      const r = (s.reservations || []).find((x) => x.id === id)
      if (r) Object.assign(r, fields)
    })
    // seat a booking: open a dine-in order on its table and mark it seated
    const seatReservation = (id, tableId) => {
      // already seated? return the existing order — never create a duplicate/orphan
      // (guards against a double-tap on "Seat" before the button re-renders)
      const existing = (stateRef.current.reservations || []).find((x) => x.id === id)
      if (existing && existing.status === 'seated' && existing.orderId) return existing.orderId
      const oid = uid('o')
      update((s) => {
        const r = (s.reservations || []).find((x) => x.id === id)
        if (!r || r.status === 'seated') return
        const tid = tableId || r.tableId || null
        s.orders.push({
          id: oid, billNo: null, type: 'dine', tableId: tid, items: [], status: 'open',
          createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
          payment: { method: null, discount: 0, amount: 0 }, source: 'reservation', kotNo: null,
          // the booking already told us how many are coming — pre-fill the cover
          // count so the waiter only corrects it if the party turns up different
          covers: +r.partySize || null,
          takenBy: operatorName(s),
        })
        r.status = 'seated'
        r.orderId = oid
        if (tid) r.tableId = tid
      })
      return oid
    }

    // manager-authorized correction of a punched (KOT'd) line: reduce qty or remove.
    // Restores the recipe stock that was deducted, and records a void-log entry.
    // delta: a negative number to decrement, or 'remove' to void the whole line.
    const rectifyLine = (orderId, line, delta, manager, reason) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      // match the full line identity (dish + kitchen state + chosen options) —
      // itemId alone would hit the wrong line when a dish is on the bill twice
      // with different add-ons
      const li = o.items.find((x) => lineKey(x) === lineKey(line))
      if (!li) return
      const oldQty = li.qty
      const newQty = delta === 'remove' ? 0 : Math.max(0, oldQty + delta)
      const removed = oldQty - newQty
      if (removed <= 0) return
      if (li.deducted) {
        const item = s.items.find((i) => i.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => {
          const ing = s.ingredients.find((g) => g.id === ingId)
          if (ing) ing.stock = +(ing.stock + qty * removed).toFixed(3)
        })
      }
      s.voidLog = s.voidLog || []
      s.voidLog.push({
        id: uid('v'), at: Date.now(), orderId, tableId: o.tableId || null,
        item: li.name, qty: removed, amount: li.price * removed, by: manager?.name || 'Manager',
        // context the cancellation report needs: an item pulled AFTER the bill was
        // printed is a different (and more suspicious) event than one pulled before
        billNo: o.billNo || null, printedAt: o.printedAt || null, orderCreatedAt: o.createdAt || null,
        reason: reason || null,
      })
      if (newQty <= 0) o.items = o.items.filter((x) => x !== li)
      else { li.qty = newQty; li.updatedAt = Date.now() }
      o.updatedAt = Date.now()
    })

    // ---- table/bill operations: merge + split ----
    // merge the `from` order's items into `into`, then close `from` (freeing its
    // table). `from` is kept as a cancelled/merged record so it doesn't resurrect
    // from the cloud (orders have no tombstone).
    const mergeOrders = (intoId, fromId) => update((s) => {
      const into = s.orders.find((o) => o.id === intoId)
      const from = s.orders.find((o) => o.id === fromId)
      if (!into || !from || into.id === from.id || into.status === 'paid' || from.status === 'paid') return
      into.items = [...(into.items || []), ...(from.items || [])]
      into.updatedAt = Date.now()
      from.items = []
      from.status = 'cancelled'
      from.mergedInto = intoId
      from.updatedAt = Date.now()
    })

    // split selected quantities off the current order into a NEW order (same table),
    // so a group can pay separately. Deducted (KOT'd) lines carry their flag so stock
    // isn't deducted again. Returns the new order id.
    const splitOrder = (orderId, picks) => {
      const newId = uid('o')
      update((s) => {
        const o = s.orders.find((x) => x.id === orderId)
        if (!o) return
        const moved = []
        picks.forEach(({ idx, qty }) => {
          const li = o.items[idx]
          const take = Math.min(+qty || 0, li ? li.qty : 0)
          if (!li || take <= 0) return
          moved.push({ ...li, qty: take })
          li.qty -= take
        })
        if (!moved.length) return
        o.items = o.items.filter((li) => li.qty > 0)
        o.updatedAt = Date.now()
        const deducted = moved.some((li) => li.deducted)
        // inherit the parent's kitchen status — splitting a bill at payment time
        // (order already 'ready'/'served') must NOT throw the food back onto the KDS
        // "preparing" queue. Only a not-yet-fired split starts 'open'.
        const status = deducted ? (['ready', 'served', 'paid'].includes(o.status) ? o.status : 'kot') : 'open'
        s.orders.push({
          id: newId, billNo: null, type: o.type, tableId: o.tableId, items: moved,
          status, createdAt: Date.now(), kotAt: deducted ? (o.kotAt || Date.now()) : null,
          paidAt: null, customerId: null, payment: { method: null, discount: 0, amount: 0 },
          source: o.source || 'pos', kotNo: deducted ? o.kotNo : null, splitFrom: orderId,
        })
      })
      return newId
    }

    // ---- customer feedback & reviews ----
    // owner/staff records a review captured at the counter (post-bill) or by phone
    const addFeedback = ({ rating, text = '', tableId = null, orderId = null, customerId = null, source = 'pos' }) => update((s) => {
      s.feedback = s.feedback || []
      const r = Math.max(1, Math.min(5, Math.floor(+rating || 0)))
      if (!r) return
      s.feedback.push({
        id: uid('f'), rating: r, text: String(text || '').slice(0, 500),
        sentiment: sentiment(text, r), tableId, orderId, customerId, source,
        reply: null, resolved: false, date: Date.now(),
      })
    })
    // owner's public/private reply to a review (marks it addressed)
    const replyFeedback = (id, text, by) => update((s) => {
      const f = (s.feedback || []).find((x) => x.id === id)
      if (!f) return
      f.reply = { text: String(text || '').slice(0, 500), at: Date.now(), by: by || '' }
      f.resolved = true
    })
    const resolveFeedback = (id, resolved = true) => update((s) => {
      const f = (s.feedback || []).find((x) => x.id === id)
      if (f) f.resolved = !!resolved
    })
    const deleteFeedback = (id) => update((s) => { s.feedback = (s.feedback || []).filter((x) => x.id !== id) })

    // ---- RBAC session (who's operating THIS till) ----
    // stored on top-level `state.session`, which is device-local by construction:
    // it isn't a synced COLLECTION, settings, or order, so buildPushPatch never
    // pushes it and mergeRemote preserves the local value.
    const unlockSession = (sess) => update((s) => { s.session = sess || null })
    const lockSession = () => update((s) => { s.session = null })

    // ---- purchasing: vendors, purchase orders, goods-receipt notes (GRN) ----
    const addVendor = (v) => update((s) => {
      s.vendors = s.vendors || []
      s.vendors.push({ id: uid('ven'), name: '', phone: '', gstin: '', address: '', createdAt: Date.now(), ...v })
    })
    const updateVendor = (id, fields) => update((s) => {
      const v = (s.vendors || []).find((x) => x.id === id); if (v) Object.assign(v, fields)
    })
    const deleteVendor = (id) => update((s) => { s.vendors = (s.vendors || []).filter((x) => x.id !== id) })

    // PO number comes from the atomic server counter when cloud-connected (so two
    // devices never issue the same PO#), else the local counter. Same for GRN.
    const createPO = async ({ vendorId, expectedDate, lines, notes }) => {
      const clean = (lines || []).filter((l) => l.ingId && +l.qty > 0).map((l) => ({ ingId: l.ingId, qty: +l.qty, rate: +l.rate || 0 }))
      if (!clean.length) return
      const server = await allocNumber('poNo', stateRef.current.counters?.poNo || 1)
      update((s) => {
        s.purchaseOrders = s.purchaseOrders || []
        const issued = server != null ? server : (s.counters.poNo || 1)
        s.purchaseOrders.push({
          id: uid('po'), poNo: issued, vendorId: vendorId || null,
          date: Date.now(), expectedDate: expectedDate || null, status: 'sent',
          lines: clean, notes: notes || '', createdAt: Date.now(),
        })
        s.counters.poNo = Math.max(s.counters.poNo || 1, issued + 1)
      })
    }
    const cancelPO = (id) => update((s) => {
      const po = (s.purchaseOrders || []).find((x) => x.id === id)
      if (po && po.status !== 'received') po.status = 'cancelled'
    })

    // receive goods (against a PO, or standalone if poId null): add to stock with a
    // weighted-average cost, record the GRN, and advance the PO status
    const receiveGRN = async ({ poId, vendorId, supplierBillNo, lines }) => {
      const clean = (lines || []).filter((l) => l.ingId && +l.qty > 0).map((l) => ({ ingId: l.ingId, qty: +l.qty, rate: +l.rate || 0 }))
      if (!clean.length) return
      const server = await allocNumber('grnNo', stateRef.current.counters?.grnNo || 1)
      update((s) => {
      s.grns = s.grns || []
      const grnNo = server != null ? server : (s.counters.grnNo || 1)
      clean.forEach((l) => {
        const ing = (s.ingredients || []).find((g) => g.id === l.ingId)
        if (!ing) return
        const oldStock = +ing.stock || 0, oldCost = +ing.costPerUnit || 0
        const newStock = oldStock + l.qty
        // only blend cost when a real rate was entered — a rate-less (0) receipt must
        // not crater the weighted-average and corrupt stock valuation + food-cost %
        if (+l.rate > 0) ing.costPerUnit = newStock > 0 ? +(((oldStock * oldCost) + (l.qty * l.rate)) / newStock).toFixed(2) : l.rate
        ing.stock = +newStock.toFixed(3)
      })
      const po = poId ? (s.purchaseOrders || []).find((x) => x.id === poId) : null
      s.grns.push({
        id: uid('grn'), grnNo, poId: poId || null,
        vendorId: vendorId || po?.vendorId || null, date: Date.now(),
        supplierBillNo: supplierBillNo || '', lines: clean, createdAt: Date.now(),
      })
      s.counters.grnNo = Math.max(s.counters.grnNo || 1, grnNo + 1)
      if (po && po.status !== 'cancelled') {
        const recv = {}
        ;(s.grns || []).filter((g) => g.poId === po.id).forEach((g) => g.lines.forEach((l) => { recv[l.ingId] = (recv[l.ingId] || 0) + l.qty }))
        po.status = po.lines.every((l) => (recv[l.ingId] || 0) >= l.qty) ? 'received' : 'partial'
      }
      })
    }

    // ---- cloud actions ----
    // cloud sync is tied to an account — a restaurant node is always owner-bound so
    // only devices signed in as the owner (or an added member) can read/write it
    const cloudCreate = async () => {
      const uid = authUserRef.current?.uid
      if (!uid) throw new Error('Sign in first — cloud sync is tied to your account')
      const code = await createCloud(JSON.parse(localStorage.getItem(KEY)) || makeSeed(), uid)
      await setUserRestaurant(uid, code, '')
      const cfg = { code, role: 'owner' }
      saveCloudCfg(cfg)
      setCloud(cfg)
      return code
    }

    // re-attach this signed-in device to its owner's restaurant (or create one if the
    // account has none yet) — used when a device is authed but not currently syncing
    const reconnectCloud = async () => {
      const uid = authUserRef.current?.uid
      if (!uid) throw new Error('Sign in first — cloud sync is tied to your account')
      const rec = await getUserRestaurant(uid)
      if (rec?.code && (await adoptAsOwner(rec.code, uid))) return rec.code
      const seedData = JSON.parse(localStorage.getItem(KEY)) || makeSeed()
      const code = await createCloud(seedData, uid)
      await setUserRestaurant(uid, code, seedData.settings.name)
      saveCloudCfg({ code, role: 'owner' })
      setCloud({ code, role: 'owner' })
      return code
    }

    const cloudJoin = async (code) => {
      const remote = await fetchCloud(code.trim().toUpperCase())
      if (!remote || !remote.meta) throw new Error('Restaurant code not found')
      const adopted = joinRemote(remote)
      setState(adopted)
      // we just adopted the cloud's state — mark it as already-pushed so the first
      // debounced push doesn't re-upload this (possibly stale) snapshot over newer meta
      lastPushRef.current = Date.now()
      const cfg = { code: code.trim().toUpperCase(), role: 'device' }
      saveCloudCfg(cfg)
      setCloud(cfg)
    }

    const cloudLeave = () => {
      saveCloudCfg(null)
      setCloud(null)
      setCloudStatus('idle')
    }

    // adopt a restaurant as its owner (used after sign-in); claim + publish menu
    const adoptAsOwner = async (code, uid) => {
      const remote = await fetchCloud(code)
      if (!remote || !remote.meta) return false
      const adopted = joinRemote(remote)
      setState(adopted)
      lastPushRef.current = Date.now() // adopted cloud state; don't echo it back over newer meta
      if (uid) { try { await claimRestaurant(code, uid) } catch { /* rules */ } }
      try { await publishPublic(code, adopted) } catch { /* rules */ }
      const cfg = { code, role: 'owner' }
      saveCloudCfg(cfg)
      setCloud(cfg)
      return true
    }

    // ---- account flows ----
    // sign up: create the account, spin up this owner's cloud restaurant, bind it to the uid
    const signUpFlow = async (email, password, restaurantName) => {
      const cred = await signUp(email, password)
      const uid = cred.user.uid
      const base = JSON.parse(localStorage.getItem(KEY)) || makeSeed()
      if (restaurantName) base.settings.name = restaurantName
      base.metaUpdatedAt = Date.now()
      setState(base) // reflect the entered name locally too
      const code = await createCloud(base, uid) // owner-bound + hardened from birth
      await setUserRestaurant(uid, code, restaurantName || base.settings.name)
      const cfg = { code, role: 'owner' }
      saveCloudCfg(cfg)
      setCloud(cfg)
    }

    // sign in: load this owner's bound restaurant (or create one if they have none)
    const signInFlow = async (email, password) => {
      const cred = await signIn(email, password)
      const uid = cred.user.uid
      const rec = await getUserRestaurant(uid)
      if (rec?.code && (await adoptAsOwner(rec.code, uid))) return
      const seedData = JSON.parse(localStorage.getItem(KEY)) || makeSeed()
      const code = await createCloud(seedData, uid)
      await setUserRestaurant(uid, code, seedData.settings.name)
      saveCloudCfg({ code, role: 'owner' })
      setCloud({ code, role: 'owner' })
    }

    const authLogout = async () => {
      try { await logout() } catch { /* ignore */ }
      cloudLeave()
      setAuthUser(null)
    }

    return { update, newOrder, sendKot, settleOrder, resetDemo, recordStockTake, addExpenses, deleteExpense, refundBill, collectDue, assignTableWaiter, setOrderWaiter, markPrinted, moveItems, setOrderPayer, markPayerSent, rectifyLine, mergeOrders, splitOrder, addFeedback, replyFeedback, resolveFeedback, deleteFeedback, unlockSession, lockSession, addReservation, updateReservation, seatReservation, openShift, addCashMovement, closeShift, addVendor, updateVendor, deleteVendor, createPO, cancelPO, receiveGRN, cloudCreate, reconnectCloud, cloudJoin, cloudLeave, signUpFlow, signInFlow, authLogout }
  }, [])

  const t = useMemo(() => makeT(state.settings.lang), [state.settings.lang])

  return <Ctx.Provider value={{ state, t, cloud, cloudStatus, authUser, authReady, ...api }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
