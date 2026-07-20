import React, { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { makeSeed } from './seed.js'
import { makeT } from './i18n.js'
import { uid, billTotals } from './utils.js'

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

export function StoreProvider({ children }) {
  const [state, setState] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(state)) } catch { /* storage full */ }
  }, [state])

  // cross-tab sync: the customer QR-menu view runs in its own tab against the
  // same localStorage — adopt writes from other tabs so orders aren't lost
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

  const api = useMemo(() => {
    const update = (fn) => setState((prev) => {
      const draft = structuredClone(prev)
      fn(draft)
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

    return { update, newOrder, sendKot, settleOrder, resetDemo }
  }, [])

  const t = useMemo(() => makeT(state.settings.lang), [state.settings.lang])

  return <Ctx.Provider value={{ state, t, ...api }}>{children}</Ctx.Provider>
}

export const useStore = () => useContext(Ctx)
