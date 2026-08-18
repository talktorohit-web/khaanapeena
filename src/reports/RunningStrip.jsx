import React from 'react'
import { inr0 } from '../utils.js'
import { useRunningNow, LOOKBACK_DAYS } from './running.js'

/**
 * The floor, right now, on top of the Reports dashboard: what has been collected
 * today and what is still sitting on the tables. Above the tabs, so it is the first
 * thing seen whichever report is open.
 *
 * Every figure comes from running.js — the same module the 🔴 Running now report
 * reads, so the strip and the report can never disagree about a rupee.
 *
 * `kp-noprint` is deliberate. The strip lives outside #kp-report, which the print
 * stylesheet only makes *invisible* — its gap would still be reserved at the top of
 * the page. And a snapshot that is true for one second has no business on a report
 * printed for a date range.
 */
export default function RunningStrip({ state }) {
  const { rows, notOrdered, runningValue, avgPerTable, estimate, projection, settledToday, earnedToday } = useRunningNow(state)

  const withItems = rows.filter((r) => r.lines).length
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-3 mb-4 kp-noprint">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
        <div className="flex items-center gap-2 text-xs font-bold text-ink-900">
          <span className="w-2 h-2 rounded-full bg-red-500 kp-pulse" />
          Running right now
          <span className="font-normal text-stone-400">· live, and not governed by the date range below</span>
        </div>
        <span className="text-[11px] text-stone-400">~ marks an estimate, never money collected</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <Cell
          tone="green" icon="💰" label="Settled today"
          value={inr0(earnedToday)}
          sub={`${plural(settledToday.length, 'bill', 'bills')} closed — money in hand`}
        />
        <Cell
          tone="blue" icon="🧾" label="On running tables"
          value={inr0(runningValue)}
          sub={`${plural(withItems, 'table has', 'tables have')} items punched in — real, not estimated`}
        />
        <Cell
          tone="stone" icon="🪑" label="Seated, not ordered"
          value={avgPerTable == null ? '—' : '~' + inr0(estimate)}
          sub={avgPerTable == null
            ? `${plural(notOrdered.length, 'table', 'tables')} · no settled bills in ${LOOKBACK_DAYS} days to estimate from — counted as nothing`
            : `${notOrdered.length} × ${inr0(avgPerTable)}, the average table bill of the last ${LOOKBACK_DAYS} days`}
        />
        <Cell
          tone="stone" icon="📊" label="Still to come"
          value={'~' + inr0(projection)}
          sub="Running bills plus the estimate above — an estimate, not a total"
        />
        <Cell
          tone="purple" icon="📈" label="Earned + expected"
          value={'~' + inr0(earnedToday + projection)}
          sub={`${inr0(earnedToday)} in hand + ~${inr0(projection)} still to come`}
        />
      </div>
    </div>
  )
}

const TONES = {
  green: 'bg-green-50', blue: 'bg-blue-50', purple: 'bg-purple-50', stone: 'bg-stone-50',
}

const Cell = ({ icon, label, value, sub, tone }) => (
  <div className={`rounded-xl px-3 py-2 ${TONES[tone]}`}>
    <div className="text-[11px] font-medium text-stone-500">{icon} {label}</div>
    <div className="text-lg font-black tabular-nums text-ink-900 truncate">{value}</div>
    <div className="text-[10px] text-stone-400 leading-tight">{sub}</div>
  </div>
)
