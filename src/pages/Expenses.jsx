import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Empty, Badge, inputCls, btnPrimary } from '../components.jsx'
import { inr0, todayISO, fmtTime, EXPENSE_REASONS, PAID_FROM, paidFromLabel } from '../utils.js'

const BLANK = () => ({ reason: '', amount: '', note: '', staffId: '', paidFrom: 'cash' })
const ROWS = 8

// Day-book for money going out that isn't stock: rent, salaries, gas, the ₹200 the
// cook was given for vegetables. Entered as a sheet of blank rows because that's
// how an owner actually sits down and writes the day's spending — one screen, many
// lines, one save.
export default function Expenses() {
  const { state, addExpenses, deleteExpense } = useStore()
  const [date, setDate] = useState(todayISO())
  const [rows, setRows] = useState(() => Array.from({ length: ROWS }, BLANK))
  const [saved, setSaved] = useState('')

  const staff = state.staff || []
  const all = state.expenses || []

  const dayExpenses = useMemo(
    () => all.filter((e) => e.date === date).sort((a, b) => b.at - a.at),
    [all, date]
  )
  const dayTotal = dayExpenses.reduce((s, e) => s + e.amount, 0)

  const monthTotal = useMemo(() => {
    const m = date.slice(0, 7)
    return all.filter((e) => (e.date || '').startsWith(m)).reduce((s, e) => s + e.amount, 0)
  }, [all, date])

  const cashToday = dayExpenses.filter((e) => e.paidFrom === 'cash').reduce((s, e) => s + e.amount, 0)

  const setRow = (i, patch) => setRows((r) => r.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const removeRow = (i) => setRows((r) => (r.length > 1 ? r.filter((_, j) => j !== i) : [BLANK()]))
  const addRow = () => setRows((r) => [...r, BLANK()])

  const ready = rows.filter((r) => r.reason && +r.amount > 0)
  const pendingTotal = ready.reduce((s, r) => s + +r.amount, 0)

  const save = () => {
    if (!ready.length) return
    // stamp each row at the chosen day so a late entry lands on the right date,
    // but keep the real clock time when it's today
    const isToday = date === todayISO()
    const at = isToday ? Date.now() : new Date(date + 'T12:00:00').getTime()
    addExpenses(ready.map((r) => ({
      ...r,
      date, at,
      staffName: staff.find((s) => s.id === r.staffId)?.name || '',
      note: r.note,
    })))
    setRows(Array.from({ length: ROWS }, BLANK))
    setSaved(`Saved ${ready.length} expense${ready.length > 1 ? 's' : ''} · ${inr0(pendingTotal)}`)
    setTimeout(() => setSaved(''), 4000)
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-ink-900">💸 Expenses</h1>
          <p className="text-xs text-stone-400">Everything you pay out that isn't stock — rent, salaries, gas, repairs</p>
        </div>
        <input type="date" value={date} max={todayISO()} onChange={(e) => setDate(e.target.value)} className="border border-stone-200 rounded-xl px-3 py-2 text-sm" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Spent on this day" value={inr0(dayTotal)} sub={`${dayExpenses.length} entr${dayExpenses.length === 1 ? 'y' : 'ies'}`} icon="💸" accent="saffron" />
        <StatCard label="Paid in cash" value={inr0(cashToday)} sub="taken out of the drawer" icon="💵" accent="red" />
        <StatCard label="This month" value={inr0(monthTotal)} sub={new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })} icon="📅" accent="blue" />
        <StatCard label="Ready to save" value={inr0(pendingTotal)} sub={`${ready.length} row${ready.length === 1 ? '' : 's'} filled in`} icon="✍️" accent={ready.length ? 'green' : 'stone'} />
      </div>

      {/* ENTRY SHEET */}
      <div className="bg-white rounded-2xl border border-stone-100 mb-4 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 flex-wrap gap-2">
          <span className="text-sm font-bold text-ink-900">Date: {date}</span>
          <span className="text-xs text-blue-600">Only rows with a reason &amp; amount will be saved</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="text-left text-xs text-stone-400 bg-stone-50/70 border-b border-stone-100">
                <th className="py-2.5 px-4 font-medium">Reason</th>
                <th className="py-2.5 px-2 font-medium w-32">Amount</th>
                <th className="py-2.5 px-2 font-medium">Explanation</th>
                <th className="py-2.5 px-2 font-medium w-44">Employee</th>
                <th className="py-2.5 px-2 font-medium w-40">Paid From</th>
                <th className="py-2.5 px-2 font-medium w-12"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-b border-stone-50">
                  <td className="py-2 px-4">
                    <select value={r.reason} onChange={(e) => setRow(i, { reason: e.target.value })} className={inputCls + ' !py-2'}>
                      <option value="">Select Reason</option>
                      {EXPENSE_REASONS.map((x) => <option key={x} value={x}>{x}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <input type="number" min="0" inputMode="numeric" value={r.amount} onChange={(e) => setRow(i, { amount: e.target.value })} placeholder="Enter Amount" className={inputCls + ' !py-2 text-right tabular-nums'} />
                  </td>
                  <td className="py-2 px-2">
                    <input value={r.note} maxLength={120} onChange={(e) => setRow(i, { note: e.target.value })} placeholder="Enter Explanation" className={inputCls + ' !py-2'} />
                  </td>
                  <td className="py-2 px-2">
                    <select value={r.staffId} onChange={(e) => setRow(i, { staffId: e.target.value })} className={inputCls + ' !py-2'}>
                      <option value="">Select Employee</option>
                      {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select value={r.paidFrom} onChange={(e) => setRow(i, { paidFrom: e.target.value })} className={inputCls + ' !py-2'}>
                      {PAID_FROM.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                    </select>
                  </td>
                  <td className="py-2 px-2 text-center">
                    <button onClick={() => removeRow(i)} title="Clear this row" className="w-8 h-8 rounded-lg border border-stone-200 text-stone-400 hover:text-red-500 hover:border-red-200">🗑</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2">
          <button onClick={addRow} className="text-xs font-bold text-saffron-700 hover:underline">＋ Add another row</button>
          <div className="flex items-center gap-3">
            {saved && <span className="text-xs font-bold text-leaf-600">✓ {saved}</span>}
            <button onClick={save} disabled={!ready.length} className={btnPrimary}>Save {ready.length ? `${ready.length} expense${ready.length > 1 ? 's' : ''} · ${inr0(pendingTotal)}` : 'expenses'}</button>
          </div>
        </div>
      </div>

      {/* WHAT'S ALREADY BOOKED */}
      <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
        <div className="px-4 py-3 border-b border-stone-100">
          <h3 className="font-bold text-ink-900">Booked on {new Date(date + 'T12:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</h3>
        </div>
        {!dayExpenses.length ? (
          <Empty icon="🧾" text="Nothing booked on this day yet." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="py-2 px-4 font-medium">Reason</th>
                  <th className="py-2 px-2 font-medium">Explanation</th>
                  <th className="py-2 px-2 font-medium">Employee</th>
                  <th className="py-2 px-2 font-medium">Paid from</th>
                  <th className="py-2 px-2 font-medium">Entered</th>
                  <th className="py-2 px-2 font-medium text-right">Amount</th>
                  <th className="py-2 px-2 w-12"></th>
                </tr>
              </thead>
              <tbody>
                {dayExpenses.map((e) => (
                  <tr key={e.id} className="border-b border-stone-50">
                    <td className="py-2.5 px-4 font-semibold text-ink-900">{e.reason}</td>
                    <td className="py-2.5 px-2 text-stone-600">{e.note || <span className="text-stone-300">—</span>}</td>
                    <td className="py-2.5 px-2 text-stone-600">{e.staffName || <span className="text-stone-300">—</span>}</td>
                    <td className="py-2.5 px-2"><Badge color={e.paidFrom === 'cash' ? 'red' : 'blue'}>{paidFromLabel(e.paidFrom)}</Badge></td>
                    <td className="py-2.5 px-2 text-[11px] text-stone-400">{fmtTime(e.at)} · {e.by}</td>
                    <td className="py-2.5 px-2 text-right font-bold tabular-nums">{inr0(e.amount)}</td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => { if (confirm(`Delete this ${inr0(e.amount)} expense?`)) deleteExpense(e.id) }}
                        className="text-stone-300 hover:text-red-500"
                      >🗑</button>
                    </td>
                  </tr>
                ))}
                <tr className="border-t-2 border-stone-100 font-black">
                  <td className="py-2.5 px-4">Total</td>
                  <td colSpan={4}></td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-saffron-700">{inr0(dayTotal)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      <p className="text-[11px] text-stone-400 mt-3">
        Cash expenses are taken off what the Cash Register expects in the drawer, so your till still tallies at closing.
        Everything here feeds <b>Reports → Profit &amp; loss</b> and the day-end summary.
      </p>
    </div>
  )
}
