import React from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Badge } from '../components.jsx'
import { Bars, Donut } from '../charts.jsx'
import { inr0, dayKey, todayISO, fmtDate, FESTIVALS_2026 } from '../utils.js'

export default function Dashboard() {
  const { state, t } = useStore()
  const today = todayISO()
  const paid = state.orders.filter((o) => o.status === 'paid')
  const todayOrders = paid.filter((o) => dayKey(o.paidAt) === today)
  const todaySales = todayOrders.reduce((s, o) => s + (o.payment?.amount || 0), 0)
  const avgBill = todayOrders.length ? Math.round(todaySales / todayOrders.length) : 0

  const openOrders = state.orders.filter((o) => ['open', 'kot', 'ready', 'served', 'new'].includes(o.status))
  const occupiedTables = new Set(openOrders.filter((o) => o.tableId).map((o) => o.tableId))
  const lowStock = state.ingredients.filter((g) => g.stock <= g.minStock)

  // last 14 days sales
  const byDay = {}
  paid.forEach((o) => {
    const k = dayKey(o.paidAt)
    byDay[k] = (byDay[k] || 0) + (o.payment?.amount || 0)
  })
  const days = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i)
    const k = d.toISOString().slice(0, 10)
    days.push({ label: fmtDate(d).split(' ')[0], value: byDay[k] || 0 })
  }

  const payMix = ['upi', 'cash', 'card', 'online'].map((m) => ({
    label: m.toUpperCase(),
    value: todayOrders.length
      ? todayOrders.filter((o) => o.payment?.method === m).length
      : paid.filter((o) => o.payment?.method === m).length,
  }))

  const upcoming = FESTIVALS_2026.filter((f) => f.date >= today).slice(0, 2)

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-2xl font-black text-ink-900">{t('dashboard')}</h1>
          <p className="text-sm text-stone-500">{state.settings.name} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>
        <Badge color="green">● Online · Offline-safe</Badge>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label={t('todaySales')} value={inr0(todaySales)} sub={`${todayOrders.length} bills settled`} icon="💰" accent="saffron" />
        <StatCard label={t('avgBill')} value={inr0(avgBill)} sub="per settled bill today" icon="🧾" accent="blue" />
        <StatCard label={t('liveTables')} value={`${occupiedTables.size} / ${state.tables.length}`} sub="occupied right now" icon="🪑" accent="green" />
        <StatCard label={t('lowStock')} value={lowStock.length} sub={lowStock.slice(0, 2).map((g) => g.name).join(', ') || 'All stocked ✓'} icon="📦" accent={lowStock.length ? 'red' : 'green'} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-5">
        <div className="lg:col-span-2 bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Sales — last 14 days</h3>
          <p className="text-xs text-stone-400 mb-3">Settled bill value per day (₹)</p>
          <Bars data={days} labelEvery={2} />
        </div>
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-1">Payment mix</h3>
          <p className="text-xs text-stone-400 mb-3">{todayOrders.length ? 'Today' : 'All time'} · share of bills</p>
          <Donut data={payMix} />
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">🔴 Live orders</h3>
          {openOrders.length === 0 && <p className="text-sm text-stone-400">No open orders. Kitchen is quiet 😌</p>}
          <div className="space-y-2">
            {openOrders.slice(0, 6).map((o) => (
              <div key={o.id} className="flex items-center justify-between text-sm border-b border-stone-50 pb-2">
                <div>
                  <span className="font-semibold text-ink-900">{o.tableId ? `Table ${o.tableId}` : o.type === 'qr' ? 'QR order' : o.type}</span>
                  <span className="text-stone-400 text-xs ml-2">{o.items.reduce((s, i) => s + i.qty, 0)} items</span>
                </div>
                <Badge color={o.status === 'kot' ? 'amber' : o.status === 'ready' ? 'green' : o.status === 'new' ? 'red' : 'blue'}>{o.status.toUpperCase()}</Badge>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">🪔 Festival radar <Badge color="purple">KhaanaPeena AI</Badge></h3>
          {upcoming.map((f) => (
            <div key={f.date} className="mb-3 pb-3 border-b border-stone-50 last:border-0">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-sm text-ink-900">{f.name}</span>
                <span className="text-xs text-stone-400">{fmtDate(f.date)}</span>
              </div>
              <p className="text-xs text-stone-500 mt-1">{f.tip}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">💬 Latest feedback</h3>
          {state.feedback.slice(-3).reverse().map((f) => (
            <div key={f.id} className="mb-3 pb-3 border-b border-stone-50 last:border-0">
              <div className="flex items-center gap-2">
                <span className="text-amber-500 text-sm">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                <Badge color={f.sentiment === 'positive' ? 'green' : f.sentiment === 'negative' ? 'red' : 'stone'}>{f.sentiment}</Badge>
              </div>
              <p className="text-xs text-stone-500 mt-1 line-clamp-2">“{f.text}”</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
