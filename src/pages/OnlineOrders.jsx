import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Badge, Empty, btnPrimary, btnGhost, inputCls } from '../components.jsx'
import { inr0, uid, minsSince } from '../utils.js'

const CHANNELS = {
  zomato: { label: 'Zomato', color: 'red', commission: 23 },
  swiggy: { label: 'Swiggy', color: 'amber', commission: 25 },
  whatsapp: { label: 'WhatsApp', color: 'green', commission: 0 },
}

const SAMPLE_ITEMS = [
  ['Butter Chicken', 360], ['Dal Makhani', 220], ['Garlic Naan', 70], ['Paneer Tikka', 260],
  ['Veg Biryani', 220], ['Chicken Biryani', 290], ['Masala Chai', 40], ['Veg Hakka Noodles', 180],
]

export default function OnlineOrders() {
  const { state, t, update, sendKot } = useStore()
  const [tab, setTab] = useState('live')
  const [wa, setWa] = useState('')
  const [waMsg, setWaMsg] = useState('')

  const live = state.orders.filter((o) => ['zomato', 'swiggy', 'whatsapp'].includes(o.type) && ['new', 'kot', 'ready'].includes(o.status))

  const simulate = (ch) => update((s) => {
    const n = 1 + Math.floor(Math.random() * 3)
    const items = []
    for (let i = 0; i < n; i++) {
      const [name, price] = SAMPLE_ITEMS[Math.floor(Math.random() * SAMPLE_ITEMS.length)]
      const src = s.items.find((x) => x.name === name)
      const ex = items.find((x) => x.name === name)
      if (ex) ex.qty++
      else items.push({ itemId: src?.id, name, price, qty: 1 })
    }
    s.orders.push({
      id: uid('o'), billNo: null, type: ch, tableId: null, items, status: 'new',
      createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
      payment: { method: 'online', discount: 0, amount: 0 }, source: ch,
      extId: ch.toUpperCase().slice(0, 3) + '-' + Math.floor(1000 + Math.random() * 9000),
    })
  })

  const accept = (o) => {
    update((s) => {
      const x = s.orders.find((y) => y.id === o.id)
      if (x) x.status = 'open'
    })
    sendKot(o.id)
  }
  const reject = (o) => update((s) => { const x = s.orders.find((y) => y.id === o.id); if (x) x.status = 'cancelled' })
  const complete = (o) => update((s) => {
    const x = s.orders.find((y) => y.id === o.id)
    if (!x) return
    const sub = x.items.reduce((a, b) => a + b.price * b.qty, 0)
    x.status = 'paid'; x.paidAt = Date.now(); x.billNo = s.counters.billNo++
    x.payment = { method: 'online', discount: 0, amount: Math.round(sub * 1.05) }
  })

  // WhatsApp bot: parse pasted message into an order
  const parseWa = () => {
    const lines = wa.toLowerCase()
    const found = []
    state.items.forEach((it) => {
      const nm = it.name.toLowerCase()
      const idx = lines.indexOf(nm.split(' (')[0])
      if (idx >= 0) {
        const before = lines.slice(Math.max(0, idx - 6), idx)
        const m = before.match(/(\d+)\s*$/)
        found.push({ itemId: it.id, name: it.name, price: it.price, qty: m ? +m[1] : 1 })
      }
    })
    if (!found.length) { setWaMsg('❌ No menu items recognised in the message'); return }
    update((s) => {
      s.orders.push({
        id: uid('o'), billNo: null, type: 'whatsapp', tableId: null, items: found, status: 'new',
        createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
        payment: { method: 'online', discount: 0, amount: 0 }, source: 'whatsapp', extId: 'WA-' + Math.floor(1000 + Math.random() * 9000),
      })
    })
    setWaMsg(`✅ Order created: ${found.map((f) => `${f.qty}× ${f.name}`).join(', ')} — accept it in the Live tab`)
    setWa('')
  }

  // Reconciliation: aggregator sales → commission → net payout
  const paidAgg = state.orders.filter((o) => ['zomato', 'swiggy'].includes(o.type) && o.status === 'paid')
  const last7 = paidAgg.filter((o) => (Date.now() - o.paidAt) / 864e5 <= 7)
  const recon = ['zomato', 'swiggy'].map((ch) => {
    const os = last7.filter((o) => o.type === ch)
    const gross = os.reduce((s, o) => s + (o.payment?.amount || 0), 0)
    const comm = Math.round((gross * CHANNELS[ch].commission) / 100)
    const gstOnComm = Math.round(comm * 0.18)
    const tds = Math.round(gross * 0.01)
    return { ch, orders: os.length, gross, comm, gstOnComm, tds, net: gross - comm - gstOnComm - tds }
  })

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('online')}</h1>
        <div className="flex gap-2">
          <button onClick={() => simulate('zomato')} className={btnGhost}>⚡ Simulate Zomato</button>
          <button onClick={() => simulate('swiggy')} className={btnGhost}>⚡ Simulate Swiggy</button>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        {[['live', '🔴 Live'], ['recon', '🧮 Payout Recon'], ['wa', '💬 WhatsApp Bot']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'live' && (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-3">
          {live.length === 0 && <div className="col-span-full"><Empty icon="🛵" text="No live online orders — simulate one above or use the WhatsApp bot" /></div>}
          {live.map((o) => {
            const ch = CHANNELS[o.type]
            const sub = o.items.reduce((s, i) => s + i.price * i.qty, 0)
            return (
              <div key={o.id} className={`bg-white rounded-2xl border-2 p-4 ${o.status === 'new' ? 'border-red-300' : 'border-stone-100'}`}>
                <div className="flex items-center justify-between mb-2">
                  <Badge color={ch.color}>{ch.label}</Badge>
                  <span className="text-xs text-stone-400">{o.extId} · {minsSince(o.createdAt)}m ago</span>
                </div>
                {o.items.map((li, i) => (
                  <div key={i} className="flex justify-between text-sm py-0.5">
                    <span>{li.name}</span><b>× {li.qty}</b>
                  </div>
                ))}
                <div className="flex justify-between font-black border-t border-stone-100 mt-2 pt-2">
                  <span>Total</span><span>{inr0(sub * 1.05)}</span>
                </div>
                <div className="flex gap-2 mt-3">
                  {o.status === 'new' ? (
                    <>
                      <button onClick={() => accept(o)} className="flex-1 bg-leaf-600 text-white font-bold rounded-xl py-2 text-xs">✓ {t('accept')}</button>
                      <button onClick={() => reject(o)} className="flex-1 bg-red-100 text-red-600 font-bold rounded-xl py-2 text-xs">✕ {t('reject')}</button>
                    </>
                  ) : o.status === 'kot' ? (
                    <Badge color="amber">🔥 In kitchen — mark ready from KDS</Badge>
                  ) : (
                    <button onClick={() => complete(o)} className="flex-1 bg-ink-900 text-white font-bold rounded-xl py-2 text-xs">🛵 Handed to rider · Complete</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {tab === 'recon' && (
        <div className="bg-white rounded-2xl border border-stone-100 p-5">
          <h3 className="font-bold text-ink-900 mb-1">Aggregator payout reconciliation — last 7 days</h3>
          <p className="text-xs text-stone-400 mb-4">Know exactly what Zomato/Swiggy owe you. GST on these sales is deposited by the aggregator under Sec 9(5) — not your liability.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                  <th className="py-2">Channel</th><th>Orders</th><th>Gross sales</th><th>Commission</th><th>GST on comm. (18%)</th><th>TDS (1%)</th><th className="text-right">Net payout due</th>
                </tr>
              </thead>
              <tbody>
                {recon.map((r) => (
                  <tr key={r.ch} className="border-b border-stone-50">
                    <td className="py-2.5 font-bold">{CHANNELS[r.ch].label} <span className="text-[10px] text-stone-400">@{CHANNELS[r.ch].commission}%</span></td>
                    <td>{r.orders}</td>
                    <td>{inr0(r.gross)}</td>
                    <td className="text-red-500">−{inr0(r.comm)}</td>
                    <td className="text-red-500">−{inr0(r.gstOnComm)}</td>
                    <td className="text-red-500">−{inr0(r.tds)}</td>
                    <td className="text-right font-black text-leaf-600">{inr0(r.net)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'wa' && (
        <div className="bg-white rounded-2xl border border-stone-100 p-5 max-w-xl">
          <h3 className="font-bold text-ink-900 mb-1">💬 WhatsApp order bot</h3>
          <p className="text-xs text-stone-400 mb-3">Paste a customer's WhatsApp message — KhaanaPeena reads it and creates the order automatically. (In production this connects to WhatsApp Business API.)</p>
          <textarea value={wa} onChange={(e) => setWa(e.target.value)} rows={4} className={inputCls} placeholder="e.g. Bhaiya please send 2 butter chicken 4 garlic naan and 1 dal makhani to H.No 45 Model Town" />
          <div className="flex gap-2 mt-3">
            <button onClick={parseWa} className={btnPrimary}>🤖 Parse & Create Order</button>
            <button onClick={() => setWa('Bhaiya 2 Butter Chicken 4 Garlic Naan 1 Dal Makhani bhej do Model Town')} className={btnGhost}>Use sample</button>
          </div>
          {waMsg && <div className="mt-3 text-sm bg-stone-50 rounded-xl p-3">{waMsg}</div>}
        </div>
      )}
    </div>
  )
}
