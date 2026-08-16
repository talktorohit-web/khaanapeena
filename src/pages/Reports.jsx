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

const RANGE_KEYS = [
  ['today', 'Today'], ['yesterday', 'Yesterday'], ['7d', '7 days'],
  ['week', 'This week'], ['30d', '30 days'], ['month', 'This month'], ['all', 'All'],
]

// Grouped so sixteen reports still read as four ideas, not a wall of buttons.
const GROUPS = [
  {
    title: 'Sales',
    tabs: [
      ['sales', '💰 Summary', Sales],
      ['hourly', '⏰ Peak hours', Hourly],
      ['items', '🍽️ Items', Items],
      ['bills', '🧾 Bill register', Bills],
      ['dayend', '🌙 Day-end', DayEnd],
    ],
  },
  {
    title: 'Operations',
    tabs: [
      ['tables', '🪑 Tables', TableReport],
      ['kitchen', '⏱️ Kitchen speed', Kitchen],
      ['staff', '👨‍🍳 Staff', Staff],
      ['discounts', '🏷️ Discounts & voids', Discounts],
    ],
  },
  {
    title: 'Money',
    tabs: [
      ['foodcost', '🍲 Food cost', FoodCost],
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

// these two pick their own period, so the shared range selector would only confuse
const NO_RANGE = ['dayend', 'variance']

export default function Reports() {
  const { state, t } = useStore()
  const [tab, setTab] = useState('sales')
  const [rangeKey, setRangeKey] = useState('7d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [showCustom, setShowCustom] = useState(false)

  const range = useMemo(() => reportRange(showCustom ? 'custom' : rangeKey, custom), [rangeKey, custom, showCustom])

  const Active = (ALL.find(([k]) => k === tab) || ALL[0])[2]
  const showRange = !NO_RANGE.includes(tab)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <h1 className="text-2xl font-black text-ink-900">{t('reports')}</h1>
        <p className="text-xs text-stone-400">
          {showRange
            ? `${range.label} · ${new Date(range.from).toLocaleDateString('en-IN')} → ${new Date(Math.min(range.to, Date.now())).toLocaleDateString('en-IN')}`
            : 'This report picks its own period'}
        </p>
      </div>

      {/* TAB BAR */}
      <div className="bg-white rounded-2xl border border-stone-100 p-3 mb-4 overflow-x-auto">
        <div className="flex gap-3 min-w-max">
          {GROUPS.map((g, gi) => (
            <div key={g.title} className={gi ? 'pl-3 border-l border-stone-100' : ''}>
              <div className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1.5 px-1">{g.title}</div>
              <div className="flex gap-1.5">
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
      </div>

      {/* RANGE SELECTOR */}
      {showRange && (
        <div className="flex flex-wrap items-center gap-2 mb-5">
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

      <Active state={state} range={range} />
    </div>
  )
}
