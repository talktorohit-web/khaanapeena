import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { VegDot } from '../components.jsx'
import { inr0, uid, upiLink, sentiment, billTotals } from '../utils.js'

// Customer-facing self-order page (#/qr?t=T5) — what guests see after scanning the table QR
export default function QRMenu({ hash }) {
  const { state, update, sendKot, settleOrder } = useStore()
  const tableId = new URLSearchParams(hash.split('?')[1] || '').get('t')
  const [cart, setCart] = useState({})
  const [placed, setPlaced] = useState(null)
  const [paid, setPaid] = useState(false)
  const [vegOnly, setVegOnly] = useState(false)
  const [fb, setFb] = useState({ rating: 0, text: '', sent: false })

  // guest self-pays via UPI — optimistically record it so the bill closes and
  // shows up in the owner's Reports/Dashboard (real UPI intent doesn't return a result)
  const payNow = () => {
    if (placed && !paid) settleOrder(placed.id, { method: 'upi' })
    setPaid(true)
  }

  const s = state.settings
  const items = state.items.filter((i) => i.available && (!vegOnly || i.veg))
  const count = Object.values(cart).reduce((a, b) => a + b, 0)
  const total = Object.entries(cart).reduce((sum, [id, qty]) => {
    const it = state.items.find((x) => x.id === id)
    return sum + (it ? it.price * qty : 0)
  }, 0)

  const add = (id, d) => setCart((c) => {
    const n = { ...c, [id]: Math.max(0, (c[id] || 0) + d) }
    if (!n[id]) delete n[id]
    return n
  })

  const placeOrder = () => {
    const id = uid('o')
    const lines = Object.entries(cart).map(([itemId, qty]) => {
      const it = state.items.find((x) => x.id === itemId)
      return { itemId, name: it.name, price: it.price, qty }
    })
    const totals = billTotals({ items: lines, payment: { discount: 0 } }, s)
    const payable = s.gstScheme === 'composition' ? Math.round(totals.taxable) : totals.total
    update((st) => {
      st.orders.push({
        id, billNo: null, type: 'qr', tableId, status: 'open',
        items: lines,
        createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
        payment: { method: null, discount: 0, amount: 0 }, source: 'qr',
      })
    })
    sendKot(id)
    setPlaced({ id, total: payable })
    setCart({})
  }

  const sendFeedback = () => {
    update((st) => st.feedback.push({ id: uid('f'), rating: fb.rating, text: fb.text, sentiment: sentiment(fb.text, fb.rating), date: Date.now() }))
    setFb((p) => ({ ...p, sent: true }))
  }

  return (
    <div className="min-h-screen bg-stone-100 max-w-md mx-auto flex flex-col">
      <header className="bg-ink-900 text-white p-5 sticky top-0 z-10">
        <div className="text-lg font-black">{s.name}</div>
        <div className="text-xs text-stone-400">{s.tagline} · FSSAI {s.fssai}</div>
        {tableId && <div className="mt-1 inline-block bg-saffron-600 text-white text-xs font-bold rounded-full px-3 py-0.5">Table {tableId}</div>}
      </header>

      {placed ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <h2 className="text-xl font-black text-ink-900">Order sent to kitchen!</h2>
          <p className="text-sm text-stone-500 mt-1 mb-4">Sit back — it's being prepared. Total (incl. GST): <b>{inr0(placed.total)}</b></p>
          {paid ? (
            <div className="bg-leaf-600 text-white font-bold rounded-xl px-5 py-3 text-sm mb-2 w-full">✅ Payment received — dhanyavaad!</div>
          ) : (
            <a href={upiLink(s, placed.total, `Table ${tableId || ''} self-order`)} onClick={payNow} className="bg-leaf-600 text-white font-bold rounded-xl px-5 py-3 text-sm mb-2 w-full">📲 Pay {inr0(placed.total)} via UPI</a>
          )}
          <p className="text-[11px] text-stone-400 mb-6">{paid ? 'Your bill is settled.' : 'or pay at the counter'}</p>

          <div className="bg-white rounded-2xl p-4 w-full">
            {fb.sent ? (
              <p className="text-sm font-bold text-leaf-600">🙏 Shukriya! Your feedback reached the owner.</p>
            ) : (
              <>
                <p className="text-sm font-bold text-ink-900 mb-2">How was it?</p>
                <div className="flex justify-center gap-1 mb-2">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button key={r} onClick={() => setFb({ ...fb, rating: r })} className={`text-2xl ${fb.rating >= r ? '' : 'grayscale opacity-40'}`}>⭐</button>
                  ))}
                </div>
                <textarea value={fb.text} onChange={(e) => setFb({ ...fb, text: e.target.value })} rows={2} placeholder="Tell us (optional)" className="w-full border border-stone-200 rounded-xl p-2 text-sm" />
                <button onClick={sendFeedback} disabled={!fb.rating} className="mt-2 bg-ink-900 text-white text-sm font-bold rounded-xl px-4 py-2 disabled:opacity-40 w-full">Send</button>
              </>
            )}
          </div>
          <button onClick={() => { setPlaced(null); setPaid(false) }} className="mt-4 text-saffron-700 text-sm font-bold">← Order more</button>
        </div>
      ) : (
        <>
          <div className="p-3 sticky top-[92px] z-10 bg-stone-100">
            <button onClick={() => setVegOnly(!vegOnly)} className={`text-xs font-bold rounded-full px-3 py-1.5 border ${vegOnly ? 'bg-green-600 text-white border-green-600' : 'bg-white border-stone-200 text-stone-600'}`}>🟢 Veg only</button>
          </div>
          <div className="flex-1 px-3 pb-28">
            {state.categories.map((c) => {
              const its = items.filter((i) => i.catId === c.id)
              if (!its.length) return null
              return (
                <div key={c.id} className="mb-4">
                  <h3 className="font-black text-stone-500 text-xs uppercase tracking-wider mb-2 px-1">{c.name}</h3>
                  <div className="bg-white rounded-2xl divide-y divide-stone-50">
                    {its.map((i) => (
                      <div key={i.id} className="flex items-center gap-3 p-3">
                        <VegDot veg={i.veg} />
                        <div className="flex-1 min-w-0">
                          <div className="font-semibold text-sm text-ink-900">{i.name}</div>
                          <div className="text-[11px] text-stone-400">{i.nameHi}</div>
                          <div className="text-sm font-bold text-saffron-700 mt-0.5">{inr0(i.price)}</div>
                        </div>
                        {cart[i.id] ? (
                          <div className="flex items-center gap-2 bg-saffron-50 rounded-xl px-2 py-1">
                            <button onClick={() => add(i.id, -1)} className="text-saffron-700 font-black w-5">−</button>
                            <b className="text-sm">{cart[i.id]}</b>
                            <button onClick={() => add(i.id, 1)} className="text-saffron-700 font-black w-5">＋</button>
                          </div>
                        ) : (
                          <button onClick={() => add(i.id, 1)} className="bg-saffron-600 text-white text-xs font-black rounded-xl px-4 py-2">ADD</button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          {count > 0 && (
            <div className="fixed bottom-0 inset-x-0 max-w-md mx-auto p-3">
              <button onClick={placeOrder} className="w-full bg-leaf-600 text-white font-black rounded-2xl py-4 shadow-xl flex items-center justify-between px-5">
                <span>{count} item{count > 1 ? 's' : ''} · {inr0(total)}</span>
                <span>Place Order →</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
