// The running floor, right now — read by the 🔴 Running now report AND by the
// summary strip on the Reports dashboard. Both take their rupees from here, because
// two implementations of one figure drift and the owner ends up shown two different
// answers to "what is sitting on my tables".
import { useEffect, useMemo, useState } from 'react'
import { billTotals, tableName, minsSince, todayISO } from '../utils.js'
import { amt, coversOf } from './shared.jsx'

export const RUNNING = ['open', 'kot', 'ready', 'served']

// how far back the "what a table normally spends" estimate looks. Long enough to
// smooth a quiet Tuesday, short enough that last winter's prices don't set today's.
export const LOOKBACK_DAYS = 30

/**
 * Deliberately outside any report date range — "how much is sitting on my tables at
 * this moment" has no date.
 *
 * The projection is the part to be careful with: running tables have a real bill
 * value, but a table that has been seated and hasn't ordered yet has nothing to add
 * up. That gap is filled with what a table normally spends here. `avgPerTable` is
 * null when there are no settled table bills to average — those tables then
 * contribute NOTHING rather than a made-up figure, and every screen showing
 * `estimate` / `projection` must mark them as estimates.
 */
export function runningNow(state) {
  const settings = state.settings
  const tables = state.tables || []
  const orders = state.orders || []

  const running = orders
    .filter((o) => RUNNING.includes(o.status) && !o.mergedInto)
    .sort((a, b) => a.createdAt - b.createdAt)

  const rows = running.map((o) => {
    const lines = (o.items || []).reduce((s, li) => s + li.qty, 0)
    return {
      o,
      table: o.tableId ? tableName(tables, o.tableId) : null,
      waiter: o.waiterName || o.takenBy || null,
      guests: coversOf(o),
      lines,
      value: lines ? billTotals(o, settings).total : 0,
      openedFor: minsSince(o.createdAt),
      kotFor: o.kotAt ? minsSince(o.kotAt) : null,
    }
  })

  const occupiedIds = new Set(rows.filter((r) => r.o.tableId).map((r) => r.o.tableId))
  const freeTables = tables.filter((t) => !occupiedIds.has(t.id))
  const seatedGuests = rows.reduce((s, r) => s + r.guests, 0)
  const countedTables = rows.filter((r) => r.guests > 0).length

  // seated but nothing punched in yet — the tables the projection has to guess for
  const notOrdered = rows.filter((r) => !r.lines)
  const runningValue = rows.reduce((s, r) => s + r.value, 0)

  // ---- what a table normally spends, from real settled bills ----
  const lookbackFrom = Date.now() - LOOKBACK_DAYS * 864e5
  const recent = orders.filter((o) => o.status === 'paid' && o.paidAt >= lookbackFrom && o.tableId)
  const avgPerTable = recent.length ? recent.reduce((s, o) => s + amt(o), 0) / recent.length : null
  const estimate = avgPerTable == null ? 0 : notOrdered.length * avgPerTable
  const projection = runningValue + estimate

  const todayFrom = new Date(todayISO() + 'T00:00:00').getTime()
  const settledToday = orders.filter((o) => o.status === 'paid' && o.paidAt >= todayFrom)
  const earnedToday = settledToday.reduce((s, o) => s + amt(o), 0)

  return {
    rows, tables, freeTables, occupiedIds, seatedGuests, countedTables,
    notOrdered, runningValue, recent, avgPerTable, estimate, projection,
    settledToday, earnedToday,
  }
}

// The same numbers on a 15s heartbeat — the interval the kitchen screen runs on, so
// waiting times stay honest. The tick is a memo dependency as well as a re-render,
// or `openedFor` would be frozen at whatever it was when the order list last changed.
export function useRunningNow(state) {
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((x) => x + 1), 15000)
    return () => clearInterval(id)
  }, [])
  return useMemo(() => runningNow(state), [state, tick])
}
