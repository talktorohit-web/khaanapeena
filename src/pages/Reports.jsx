import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { reportRange } from '../utils.js'

import Sales from '../reports/Sales.jsx'
import Hourly from '../reports/Hourly.jsx'
import Items from '../reports/Items.jsx'
import Bills from '../reports/Bills.jsx'
import DayEnd from '../reports/DayEnd.jsx'
import TableReport from '../reports/TableReport.jsx'
import Kitchen from '../reports/Kitchen.jsx'
import Staff from '../reports/Staff.jsx'
import Discounts from '../reports/Discounts.jsx'
import Customers from '../reports/Customers.jsx'
import FoodCost from '../reports/FoodCost.jsx'
import Profit from '../reports/Profit.jsx'
import Tax from '../reports/Tax.jsx'
import Inventory from '../reports/Inventory.jsx'
import Purchases from '../reports/Purchases.jsx'
import Variance from '../reports/Variance.jsx'
import Udhaar from '../reports/Udhaar.jsx'
import ExpensesReport from '../reports/ExpensesReport.jsx'
import Cancellations from '../reports/Cancellations.jsx'
import Timing from '../reports/Timing.jsx'
import CashInHand from '../reports/CashInHand.jsx'
import Live from '../reports/Live.jsx'
import RunningStrip from '../reports/RunningStrip.jsx'

const RANGE_KEYS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'],
  ['week', 'This week'], ['30d', '30 days'], ['month', 'This month'], ['all', 'All'],
]

// Grouped so a couple of dozen reports still read as five ideas, not a wall of buttons.
const GROUPS = [
  {
    title: 'Sales',
    tabs: [
      ['sales', '💰 Summary', Sales],
      ['hourly', '⏰ Peak hours', Hourly],
      ['items', '🍽️ Items', Items],
      ['bills', '🧾 Bill register', Bills],
      ['live', '🔴 Running now', Live],
      ['dayend', '🌙 Day-end', DayEnd],
    ],
  },
  {
    title: 'Operations',
    tabs: [
      ['tables', '🪑 Tables', TableReport],
      ['kitchen', '⏱️ Kitchen speed', Kitchen],
      ['timing', '⏱️ Bill timing', Timing],
      ['staff', '👨‍🍳 Staff', Staff],
      ['discounts', '🏷️ Discounts & refunds', Discounts],
      ['cancellations', '🚫 Cancellations', Cancellations],
    ],
  },
  {
    title: 'Money',
    tabs: [
      ['foodcost', '🍲 Food cost', FoodCost],
      ['expenses', '💸 Expenses', ExpensesReport],
      ['cashinhand', '💰 Cash in hand', CashInHand],
      ['udhaar', '📒 Udhaar', Udhaar],
      ['profit', '📈 Profit & loss', Profit],
      ['tax', '🧾 GST & HSN', Tax],
    ],
  },
  {
    title: 'Stock',
    tabs: [
      ['inventory', '📦 Inventory', Inventory],
      ['purchases', '🛒 Purchases', Purchases],
      ['variance', '⚖️ Stock variance', Variance],
    ],
  },
  {
    title: 'Guests',
    tabs: [['customers', '👥 Customers', Customers]],
  },
]

const ALL = GROUPS.flatMap((g) => g.tabs)

// these pick their own period (or ignore dates entirely), so the shared range
// selector would only mislead
const NO_RANGE = ['dayend', 'variance', 'udhaar', 'live']

export default function Reports() {
  const { state, t } = useStore()
  const [tab, setTab] = useState('sales')
  const [rangeKey, setRangeKey] = useState('7d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)

  const range = useMemo(() => reportRange(showCustom ? 'custom' : rangeKey, custom), [rangeKey, custom, showCustom])

  const Active = (ALL.find(([k]) => k === tab) || ALL[0])[2]
  const showRange = !NO_RANGE.includes(tab)

  const tabLabel = (ALL.find(([k]) => k === tab) || ALL[0])[1]
  const periodText = showRange
    ? `${range.label} · ${new Date(range.from).toLocaleDateString('en-IN')} → ${new Date(Math.min(range.to, Date.now())).toLocaleDateString('en-IN')}`
    : tab === 'live'
      ? 'Right now — this report has no date range'
      : 'This report picks its own period'

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4 flex items-start justify-between gap-3 flex-wrap kp-noprint">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t('reports')}</h1>
          <p className="text-xs text-stone-400">{periodText}</p>
        </div>
        {/* Straight to the browser's own Save-as-PDF: no library to bundle, and it
            works the same in the browser, the PC app and the Android app. */}
        <button
          onClick={() => window.print()}
          title="Opens your print dialog — choose “Save as PDF” as the destination"
          className="border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2 text-sm"
        >🖨️ Save as PDF</button>
      </div>

      {/* Above the tabs AND above the range buttons on purpose: these are the
          numbers the owner asks for first, they belong to no date range, and
          nothing here may look like the selector governs them. Its own component
          so its 15s heartbeat re-renders five figures, not the whole report. */}
      <RunningStrip state={state} />

      {/* TAB BAR — every report visible at once. It used to scroll sideways, which
          hid half the tabs behind a gesture nobody thinks to make on a till. */}
      <div className="bg-white rounded-2xl border border-stone-100 p-3 mb-4 kp-noprint">
        {GROUPS.map((g, gi) => (
          <div key={g.title} className={`flex items-baseline gap-2 flex-wrap ${gi ? 'mt-2 pt-2 border-t border-stone-100' : ''}`}>
            <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 w-[72px] shrink-0">{g.title}</div>
            <div className="flex gap-1.5 flex-wrap flex-1">
              {g.tabs.map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${
                    tab === k ? 'bg-ink-900 text-white' : 'bg-stone-50 hover:bg-stone-100 text-stone-600'
                  }`}
                >{label}</button>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* RANGE SELECTOR */}
      {showRange && (
        <div className="flex flex-wrap items-center gap-2 mb-5 kp-noprint">
          {RANGE_KEYS.map(([k, l]) => (
            <button
              key={k}
              onClick={() => { setRangeKey(k); setShowCustom(false) }}
              className={`px-3 py-1.5 rounded-full text-xs font-bold ${!showCustom && rangeKey === k ? 'bg-saffron-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
            >{l}</button>
          ))}
          <button onClick={() => setShowCustom((v) => !v)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${showCustom ? 'bg-saffron-600 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>📅 Custom</button>
          {showCustom && (
            <div className="flex items-center gap-1 text-xs">
              <input type="date" value={custom.from} onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} className="border border-stone-200 rounded-lg px-2 py-1" />
              <span className="text-stone-400">→</span>
              <input type="date" value={custom.to} onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} className="border border-stone-200 rounded-lg px-2 py-1" />
            </div>
          )}
        </div>
      )}

      {/* Everything below prints; the id is what the print stylesheet isolates. */}
      <div id="kp-report">
        {/* letterhead — hidden on screen, the first thing on the printed page */}
        <div className="kp-printonly mb-4 pb-3 border-b-2 border-stone-300">
          <div className="text-xl font-black text-ink-900">{state.settings.name}</div>
          <div className="text-[11px] text-stone-500">
            {state.settings.address}
            {state.settings.gstin ? ` · GSTIN ${state.settings.gstin}` : ''}
            {state.settings.fssai ? ` · FSSAI ${state.settings.fssai}` : ''}
          </div>
          <div className="flex justify-between items-baseline mt-2">
            <div className="text-base font-bold text-ink-900">{tabLabel.replace(/^\S+\s/, '')}</div>
            <div className="text-[11px] text-stone-500">{periodText}</div>
          </div>
          <div className="text-[10px] text-stone-400">Generated {new Date().toLocaleString('en-IN')} · KhaanaPeena</div>
        </div>

        <Active state={state} range={range} />
      </div>
    </div>
  )
}
