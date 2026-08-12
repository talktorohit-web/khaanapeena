import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { makeSeed } from './seed.js'
import { makeT } from './i18n.js'
import { uid, billTotals } from './utils.js'
import {
  loadCloudCfg, saveCloudCfg, createCloud, fetchCloud, subscribeCloud,
  pushChanges, mergeRemote, joinRemote, nextCounter, claimRestaurant, publishPublic,
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
              if (!item) { li.qty = 0; li.price = 0; return }
              li.price = item.price
              li.qty = Math.max(1, Math.min(50, Math.floor(+li.qty || 1)))
            })
            o.sanitized = true
            o.updatedAt = Date.now()
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

    const newOrder = ({ type, tableId = null, source = 'pos' }) => {
      const id = uid('o')
      update((s) => {
        s.orders.push({
          id, billNo: null, type, tableId, items: [], status: 'open',
          createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
          payment: { method: null, discount: 0, amount: 0 }, source, kotNo: null,
        })
      })
      return id
    }

    // KOT number comes from the atomic server counter when cloud-connected,
    // else a local counter (single device, no race). Same pattern for bills.
    const allocNumber = async (name) => {
      const code = loadCloudCfg()?.code
      if (code) { try { return await nextCounter(code, name) } catch { /* offline → local */ } }
      return null
    }

    // returns the KOT number actually issued, so the caller prints the right one
    // (server counter when online, local otherwise — never the stale seed value)
    const sendKot = async (orderId) => {
      const server = await allocNumber('kotNo')
      const issued = server != null ? server : (stateRef.current.counters?.kotNo || 1)
      update((s) => {
        const o = s.orders.find((x) => x.id === orderId)
        if (!o || !o.items.length) return
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

    const settleOrder = async (orderId, { method, discount = 0, customerId = null, redeemPoints = 0 }) => {
      const server = await allocNumber('billNo')
      const issued = server != null ? server : (stateRef.current.counters?.billNo || 1)
      update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      o.payment = { method, discount }
      const totals = billTotals(o, s.settings)
      // composition scheme: no GST collected on the bill
      o.payment.amount = s.settings.gstScheme === 'composition' ? Math.round(totals.taxable) : totals.total
      o.status = 'paid'
      o.paidAt = Date.now()
      o.billNo = issued
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
    const rectifyLine = (orderId, line, delta, manager) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      const li = o.items.find((x) => x.itemId === line.itemId && !!x.deducted === !!line.deducted)
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
        s.orders.push({
          id: newId, billNo: null, type: o.type, tableId: o.tableId, items: moved,
          status: deducted ? 'kot' : 'open', createdAt: Date.now(), kotAt: deducted ? (o.kotAt || Date.now()) : null,
          paidAt: null, customerId: null, payment: { method: null, discount: 0, amount: 0 },
          source: o.source || 'pos', kotNo: deducted ? o.kotNo : null, splitFrom: orderId,
        })
      })
      return newId
    }

    // ---- purchasing: vendors, purchase orders, goods-receipt notes (GRN) ----
    const addVendor = (v) => update((s) => {
      s.vendors = s.vendors || []
      s.vendors.push({ id: uid('ven'), name: '', phone: '', gstin: '', address: '', createdAt: Date.now(), ...v })
    })
    const updateVendor = (id, fields) => update((s) => {
      const v = (s.vendors || []).find((x) => x.id === id); if (v) Object.assign(v, fields)
    })
    const deleteVendor = (id) => update((s) => { s.vendors = (s.vendors || []).filter((x) => x.id !== id) })

    const createPO = ({ vendorId, expectedDate, lines, notes }) => update((s) => {
      s.purchaseOrders = s.purchaseOrders || []
      s.counters.poNo = s.counters.poNo || 1
      const clean = (lines || []).filter((l) => l.ingId && +l.qty > 0).map((l) => ({ ingId: l.ingId, qty: +l.qty, rate: +l.rate || 0 }))
      if (!clean.length) return
      s.purchaseOrders.push({
        id: uid('po'), poNo: s.counters.poNo++, vendorId: vendorId || null,
        date: Date.now(), expectedDate: expectedDate || null, status: 'sent',
        lines: clean, notes: notes || '', createdAt: Date.now(),
      })
    })
    const cancelPO = (id) => update((s) => {
      const po = (s.purchaseOrders || []).find((x) => x.id === id)
      if (po && po.status !== 'received') po.status = 'cancelled'
    })

    // receive goods (against a PO, or standalone if poId null): add to stock with a
    // weighted-average cost, record the GRN, and advance the PO status
    const receiveGRN = ({ poId, vendorId, supplierBillNo, lines }) => update((s) => {
      s.grns = s.grns || []
      s.counters.grnNo = s.counters.grnNo || 1
      const clean = (lines || []).filter((l) => l.ingId && +l.qty > 0).map((l) => ({ ingId: l.ingId, qty: +l.qty, rate: +l.rate || 0 }))
      if (!clean.length) return
      clean.forEach((l) => {
        const ing = (s.ingredients || []).find((g) => g.id === l.ingId)
        if (!ing) return
        const oldStock = +ing.stock || 0, oldCost = +ing.costPerUnit || 0
        const newStock = oldStock + l.qty
        ing.costPerUnit = newStock > 0 ? +(((oldStock * oldCost) + (l.qty * l.rate)) / newStock).toFixed(2) : l.rate
        ing.stock = +newStock.toFixed(3)
      })
      const po = poId ? (s.purchaseOrders || []).find((x) => x.id === poId) : null
      s.grns.push({
        id: uid('grn'), grnNo: s.counters.grnNo++, poId: poId || null,
        vendorId: vendorId || po?.vendorId || null, date: Date.now(),
        supplierBillNo: supplierBillNo || '', lines: clean, createdAt: Date.now(),
      })
      if (po && po.status !== 'cancelled') {
        const recv = {}
        ;(s.grns || []).filter((g) => g.poId === po.id).forEach((g) => g.lines.forEach((l) => { recv[l.ingId] = (recv[l.ingId] || 0) + l.qty }))
        po.status = po.lines.every((l) => (recv[l.ingId] || 0) >= l.qty) ? 'received' : 'partial'
      }
    })

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

    return { update, newOrder, sendKot, settleOrder, resetDemo, rectifyLine, mergeOrders, splitOrder, addReservation, updateReservation, seatReservation, openShift, addCashMovement, closeShift, addVendor, updateVendor, deleteVendor, createPO, cancelPO, receiveGRN, cloudCreate, reconnectCloud, cloudJoin, cloudLeave, signUpFlow, signInFlow, authLogout }
  }, [])

  const t = useMemo(() => makeT(state.settings.lang), [state.settings.lang])

  return <Ctx.Provider value={{ state, t, cloud, cloudStatus, authUser, authReady, ...api }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
