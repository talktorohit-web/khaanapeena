import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { makeSeed } from './seed.js'
import { makeT } from './i18n.js'
import { uid, billTotals } from './utils.js'
import {
  loadCloudCfg, saveCloudCfg, createCloud, fetchCloud, subscribeCloud,
  pushChanges, mergeRemote, joinRemote,
} from './cloud.js'

const KEY = 'khaanapeena_v1'
const Ctx = createContext(null)

function load() {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const s = JSON.parse(raw)
      if (s && s.v === 1) return s
    }
  } catch { /* corrupted state falls through to reseed */ }
  return makeSeed()
}

// stamp updatedAt on orders whose content changed vs prev, and metaUpdatedAt
// when any non-order slice changed — this powers per-order cloud LWW merging
function stampChanges(prev, draft) {
  const now = Date.now()
  const prevById = {}
  prev.orders.forEach((o) => { prevById[o.id] = o })
  draft.orders.forEach((o) => {
    const p = prevById[o.id]
    if (!p) { o.updatedAt = o.updatedAt || now; return }
    if (JSON.stringify({ ...p, updatedAt: 0 }) !== JSON.stringify({ ...o, updatedAt: 0 })) o.updatedAt = now
  })
  for (const k of Object.keys(draft)) {
    if (k === 'orders' || k === 'metaUpdatedAt') continue
    if (JSON.stringify(prev[k]) !== JSON.stringify(draft[k])) { draft.metaUpdatedAt = now; break }
  }
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(load)
  const [cloud, setCloud] = useState(loadCloudCfg)
  const [cloudStatus, setCloudStatus] = useState('idle') // idle | syncing | live | error
  const lastPushRef = useRef(0)

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
      setState((local) => {
        const merged = mergeRemote(local, remote)
        // owner device runs inventory deduction for KOTs that arrived from
        // guest/other devices (their lines were never deducted locally)
        if (cloud.role === 'owner') {
          merged.orders.forEach((o) => {
            if (!['kot', 'ready', 'served', 'paid'].includes(o.status)) return
            o.items.forEach((li) => {
              if (li.deducted) return
              const item = merged.items.find((i) => i.id === li.itemId)
              item?.recipe?.forEach(({ ingId, qty }) => {
                const ing = merged.ingredients.find((g) => g.id === ingId)
                if (ing) ing.stock = Math.max(0, +(ing.stock - qty * li.qty).toFixed(3))
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
    }, 400)
    return () => clearTimeout(timer)
  }, [state, cloud?.code])

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

    const sendKot = (orderId) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o || !o.items.length) return
      o.status = 'kot'
      o.kotAt = Date.now()
      o.kotNo = s.counters.kotNo++
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

    const settleOrder = (orderId, { method, discount = 0, customerId = null, redeemPoints = 0 }) => update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      if (!o) return
      o.payment = { method, discount }
      const totals = billTotals(o, s.settings)
      // composition scheme: no GST collected on the bill
      o.payment.amount = s.settings.gstScheme === 'composition' ? Math.round(totals.taxable) : totals.total
      o.status = 'paid'
      o.paidAt = Date.now()
      o.billNo = s.counters.billNo++
      o.customerId = customerId || o.customerId
      if (o.customerId) {
        const c = s.customers.find((x) => x.id === o.customerId)
        if (c) {
          c.visits++
          c.totalSpend += totals.total
          c.points += Math.floor(totals.taxable / 100) * (s.settings.loyaltyEarnPer100 || 1)
          if (redeemPoints) c.points = Math.max(0, c.points - redeemPoints)
          c.lastVisit = Date.now()
        }
      }
    })

    const resetDemo = () => {
      localStorage.removeItem(KEY)
      setState(makeSeed())
    }

    // ---- cloud actions ----
    const cloudCreate = async () => {
      const code = await createCloud(JSON.parse(localStorage.getItem(KEY)) || makeSeed())
      const cfg = { code, role: 'owner' }
      saveCloudCfg(cfg)
      setCloud(cfg)
      return code
    }

    const cloudJoin = async (code) => {
      const remote = await fetchCloud(code.trim().toUpperCase())
      if (!remote || !remote.meta) throw new Error('Restaurant code not found')
      const adopted = joinRemote(remote)
      setState(adopted)
      const cfg = { code: code.trim().toUpperCase(), role: 'device' }
      saveCloudCfg(cfg)
      setCloud(cfg)
    }

    const cloudLeave = () => {
      saveCloudCfg(null)
      setCloud(null)
      setCloudStatus('idle')
    }

    return { update, newOrder, sendKot, settleOrder, resetDemo, cloudCreate, cloudJoin, cloudLeave }
  }, [])

  const t = useMemo(() => makeT(state.settings.lang), [state.settings.lang])

  return <Ctx.Provider value={{ state, t, cloud, cloudStatus, ...api }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
