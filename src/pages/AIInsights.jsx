import React, { useMemo } from 'react'
import { useStore } from '../store.jsx'
import { Badge } from '../components.jsx'
import { Bars } from '../charts.jsx'
import { inr0, dayKey, forecastNext7, FESTIVALS_2026, todayISO, fmtDate } from '../utils.js'
import { useNav } from '../nav.jsx'

export default function AIInsights() {
  const { state, t } = useStore()
  const { goTo } = useNav()

  const paid = state.orders.filter((o) => o.status === 'paid')

  const insights = useMemo(() => {
    // daily totals
    const byDay = {}
    paid.forEach((o) => { const k = dayKey(o.paidAt); byDay[k] = (byDay[k] || 0) + o.payment.amount })
    const daily = Object.entries(byDay).sort().map(([date, total]) => ({ date, total }))
    const fc = forecastNext7(daily)

    // item stats last 14d vs previous 14d
    const now = Date.now()
    const sold14 = {}, soldPrev = {}
    paid.forEach((o) => {
      const age = (now - o.paidAt) / 864e5
      const bucket = age <= 14 ? sold14 : age <= 28 ? soldPrev : null
      if (!bucket) return
      o.items.forEach((li) => { bucket[li.itemId || li.name] = (bucket[li.itemId || li.name] || 0) + li.qty })
    })
    const dead = state.items.filter((i) => i.available && !sold14[i.id]).slice(0, 6)
    const rising = state.items
      .map((i) => ({ i, a: sold14[i.id] || 0, b: soldPrev[i.id] || 0 }))
      .filter((x) => x.a >= 5 && x.a > x.b * 1.3)
      .sort((x, y) => y.a / Math.max(1, y.b) - x.a / Math.max(1, x.b)).slice(0, 4)

    // reorder urgency
    const usage = {}
    const cutoff = now - 7 * 864e5
    state.orders.forEach((o) => {
      if (!o.kotAt || o.kotAt < cutoff) return
      o.items.forEach((li) => {
        const item = state.items.find((x) => x.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => { usage[ingId] = (usage[ingId] || 0) + qty * li.qty })
      })
    })
    const reorder = state.ingredients
      .map((g) => ({ g, daysLeft: usage[g.id] ? g.stock / (usage[g.id] / 7) : Infinity }))
      .filter((x) => x.daysLeft < 4)
      .sort((a, b) => a.daysLeft - b.daysLeft)

    // slow hour
    const byHour = {}
    paid.forEach((o) => { const h = new Date(o.paidAt).getHours(); byHour[h] = (byHour[h] || 0) + 1 })
    let slowest = null
    for (let h = 12; h <= 20; h++) {
      const v = byHour[h] || 0
      if (!slowest || v < slowest.v) slowest = { h, v }
    }

    const waste30 = state.waste.reduce((s, w) => s + w.lossValue, 0)
    return { fc, dead, rising, reorder, slowest, waste30 }
  }, [state])

  const today = todayISO()
  const festivals = FESTIVALS_2026.filter((f) => f.date >= today).slice(0, 4)

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-black text-ink-900">✨ {t('ai')}</h1>
        <Badge color="purple">Built-in · no extra charge</Badge>
      </div>
      <p className="text-sm text-stone-500 mb-5">Your data, turned into decisions — runs on-device, free forever.</p>

      <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
        <h3 className="font-bold text-ink-900 mb-1">📈 Next 7 days — sales forecast</h3>
        <p className="text-xs text-stone-400 mb-3">Weekday-pattern model on your last 35 days · expect ~{inr0(insights.fc.reduce((s, f) => s + f.total, 0))} total</p>
        <Bars data={insights.fc.map((f) => ({ label: f.dow, value: f.total }))} color="#9333ea" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card title="🛒 Reorder now" sub="Will run out within 4 days — tap to purchase in Inventory">
          {insights.reorder.length === 0 && <p className="text-sm text-stone-400">Stock levels healthy ✓</p>}
          {insights.reorder.map(({ g, daysLeft }) => (
            <button key={g.id} onClick={() => goTo('inventory')} className="w-full flex items-center justify-between py-1.5 border-b border-stone-50 text-sm hover:bg-stone-50 rounded-lg px-1 -mx-1 transition-colors text-left">
              <span className="font-semibold">{g.name}</span>
              <span>{g.stock} {g.unit} left · <b className="text-red-600">{daysLeft.toFixed(1)} days</b> →</span>
            </button>
          ))}
        </Card>

        <Card title="🚀 Rising stars" sub="Selling 30%+ more than the previous fortnight — promote these">
          {insights.rising.length === 0 && <p className="text-sm text-stone-400">No breakout items yet</p>}
          {insights.rising.map(({ i, a, b }) => (
            <div key={i.id} className="flex items-center justify-between py-1.5 border-b border-stone-50 text-sm">
              <span className="font-semibold">{i.name}</span>
              <Badge color="green">{b ? `+${Math.round(((a - b) / b) * 100)}%` : 'NEW'} · {a} sold</Badge>
            </div>
          ))}
        </Card>

        <Card title="🧊 Dead items" sub="Zero sales in 14 days — fix, discount, or drop them">
          {insights.dead.length === 0 && <p className="text-sm text-stone-400">Everything on your menu is selling ✓</p>}
          {insights.dead.map((i) => (
            <div key={i.id} className="flex items-center justify-between py-1.5 border-b border-stone-50 text-sm">
              <span className="font-semibold">{i.name}</span>
              <span className="text-stone-400">{inr0(i.price)}</span>
            </div>
          ))}
        </Card>

        <Card title="🕒 Smart suggestions">
          <ul className="space-y-2.5 text-sm text-stone-600">
            {insights.slowest && (
              <li>💡 <b>{insights.slowest.h > 12 ? insights.slowest.h - 12 : insights.slowest.h}{insights.slowest.h >= 12 ? ' PM' : ' AM'}</b> is your slowest hour — a happy-hour combo here fills empty tables at near-zero cost.</li>
            )}
            <li>🗑️ You lost <b>{inr0(insights.waste30)}</b> to waste recently. Over-production of dal/gravies is the usual culprit — batch-cook in halves after 9 PM.</li>
            <li>💬 {state.customers.filter((c) => c.lastVisit && (Date.now() - c.lastVisit) / 864e5 > 14).length} regulars haven't visited in 2+ weeks — send them a WhatsApp offer from the Customers page.</li>
          </ul>
        </Card>
      </div>

      <div className="bg-gradient-to-r from-saffron-50 to-amber-50 rounded-2xl p-5 border border-saffron-200 mt-4">
        <h3 className="font-bold text-ink-900 mb-3">🪔 Festival demand radar</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {festivals.map((f) => (
            <div key={f.date} className="bg-white/70 rounded-xl p-3">
              <div className="font-bold text-sm">{f.name}</div>
              <div className="text-xs text-stone-400">{fmtDate(f.date)}</div>
              <p className="text-xs text-stone-600 mt-1">{f.tip}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const Card = ({ title, sub, children }) => (
  <div className="bg-white rounded-2xl p-5 border border-stone-100">
    <h3 className="font-bold text-ink-900">{title}</h3>
    {sub && <p className="text-xs text-stone-400 mb-2">{sub}</p>}
    <div className="mt-2">{children}</div>
  </div>
)
