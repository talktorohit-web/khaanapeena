import React, { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { VegDot } from '../components.jsx'
import { inr0, uid, upiLink, sentiment, billTotals } from '../utils.js'
import { hasModifiers, effectivePrice, modsKey, modsLabel, modsTotal, repriceMods } from '../modifiers.js'
import ModifierPicker from '../ModifierPicker.jsx'
import { fetchMenu, pushGuestOrder, updateGuestOrder, pushGuestFeedback } from '../cloud.js'
import { signInAnon } from '../auth.js'

// Customer-facing self-order page (#/qr?t=T5&c=KPXXXXXXXX)
// - with &c= (cloud code): GUEST MODE — menu loads from the restaurant's cloud
//   and orders sync straight into its kitchen, from any phone anywhere
// - without: local mode (same device/tab as the POS)
export default function QRMenu({ hash }) {
  const store = useStore()
  const params = new URLSearchParams(hash.split('?')[1] || '')
  const tableId = params.get('t')
  const code = params.get('c')

  const [remoteMeta, setRemoteMeta] = useState(null)
  const [remoteErr, setRemoteErr] = useState(false)
  useEffect(() => {
    if (!code) return
    fetchMenu(code)
      .then((m) => (m ? setRemoteMeta(m) : setRemoteErr(true)))
      .catch(() => setRemoteErr(true))
  }, [code])

  // The cart is a list of LINES, not a qty-per-dish map: the same dish ordered
  // twice with different choices ("extra spicy" vs plain) has to stay two lines.
  const [cart, setCart] = useState([]) // [{ key, itemId, mods, qty }]
  const [notes, setNotes] = useState({}) // itemId -> cooking instruction for the kitchen
  const [modItem, setModItem] = useState(null)
  const [placed, setPlaced] = useState(null)
  const [paid, setPaid] = useState(false)
  const [vegOnly, setVegOnly] = useState(false)
  const [fb, setFb] = useState({ rating: 0, text: '', sent: false })

  // data source: cloud meta in guest mode, local store otherwise
  const src = code ? remoteMeta : store.state
  const s = src?.settings
  const allItems = src?.items || []
  const categories = src?.categories || []

  const items = allItems.filter((i) => i.available && (!vegOnly || i.veg))
  const count = cart.reduce((a, l) => a + l.qty, 0)
  const total = useMemo(() => cart.reduce((sum, l) => {
    const it = allItems.find((x) => x.id === l.itemId)
    return sum + (it ? effectivePrice(it, l.mods) * l.qty : 0)
  }, 0), [cart, allItems])

  const linesOf = (id) => cart.filter((l) => l.itemId === id)
  const plainQty = (id) => cart.find((l) => l.key === id + '|')?.qty || 0

  // step a line up or down by its key; dropping to zero removes it
  const bump = (key, d) => setCart((c) => {
    const i = c.findIndex((l) => l.key === key)
    if (i < 0) return c
    const qty = c[i].qty + d
    return qty <= 0 ? c.filter((_, j) => j !== i) : c.map((l, j) => (j === i ? { ...l, qty } : l))
  })

  const addLine = (item, mods, qty = 1) => setCart((c) => {
    const key = item.id + '|' + modsKey(mods)
    const i = c.findIndex((l) => l.key === key)
    if (i >= 0) return c.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l))
    return [...c, { key, itemId: item.id, mods, qty }]
  })

  // a dish with choices always opens the sheet — tapping ADD twice may mean two
  // different orders, not two of the same thing
  const onAdd = (item) => (hasModifiers(item) ? setModItem(item) : addLine(item, [], 1))

  const placeOrder = async () => {
    const id = uid('o')
    const lines = cart.map((l) => {
      const it = allItems.find((x) => x.id === l.itemId)
      // an item pulled from the menu (or marked unavailable) while it sat in the
      // guest's cart would otherwise crash on it.name — skip it
      if (!it) return null
      // price the add-ons off the menu we hold; the owner device re-prices them
      // again on arrival, so a tampered payload never reaches a bill
      const mods = repriceMods(it, l.mods)
      const note = (notes[l.itemId] || '').trim().slice(0, 80)
      return {
        itemId: l.itemId, name: it.name, price: effectivePrice(it, mods), qty: l.qty,
        ...(mods.length ? { mods, basePrice: it.price } : {}),
        ...(note ? { notes: note } : {}),
      }
    }).filter(Boolean)
    if (!lines.length) { alert('Those items are no longer available — please refresh the menu'); return }
    const totals = billTotals({ items: lines, payment: { discount: 0 } }, s)
    const payable = s.gstScheme === 'composition' ? Math.round(totals.taxable) : totals.total

    if (code) {
      // guest mode: sign in anonymously (rules require auth) then write the order as
      // an already-fired KOT
      try { await signInAnon() } catch { alert('Could not start ordering — please order at the counter'); return }
      const order = {
        id, billNo: null, type: 'qr', tableId, status: 'kot', items: lines,
        createdAt: Date.now(), kotAt: Date.now(), updatedAt: Date.now(),
        paidAt: null, customerId: null,
        payment: { method: null, discount: 0, amount: 0 }, source: 'qr-guest', kotNo: null,
      }
      try { await pushGuestOrder(code, order) } catch { alert('Could not reach the restaurant — please order at the counter'); return }
    } else {
      store.update((st) => {
        st.orders.push({
          id, billNo: null, type: 'qr', tableId, status: 'open', items: lines,
          createdAt: Date.now(), kotAt: null, paidAt: null, customerId: null,
          payment: { method: null, discount: 0, amount: 0 }, source: 'qr',
        })
      })
      store.sendKot(id)
    }
    setPlaced({ id, total: payable })
    setCart([])
    setNotes({})
  }

  const payNow = () => {
    if (placed && !paid) {
      if (code) {
        updateGuestOrder(code, placed.id, {
          status: 'paid', paidAt: Date.now(), updatedAt: Date.now(),
          payment: { method: 'upi', discount: 0, amount: placed.total },
        }).catch(() => {})
      } else {
        store.settleOrder(placed.id, { method: 'upi' })
      }
    }
    setPaid(true)
  }

  const sendFeedback = async () => {
    const rec = { id: uid('f'), rating: fb.rating, text: fb.text, tableId: tableId || null }
    if (code) {
      // remote guest: sign in anonymously (rules require auth) and push to cloud;
      // the owner device recomputes sentiment and can reply/resolve.
      try { await signInAnon(); await pushGuestFeedback(code, rec) } catch { /* best-effort */ }
    } else {
      store.update((st) => { st.feedback = st.feedback || []; st.feedback.push({ ...rec, source: 'qr', sentiment: sentiment(fb.text, fb.rating), date: Date.now() }) })
    }
    setFb((p) => ({ ...p, sent: true }))
  }

  if (code && remoteErr) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-3">😕</div>
          <p className="font-bold text-ink-900">Restaurant not found</p>
          <p className="text-sm text-stone-500 mt-1">This QR code isn't active. Please order at the counter.</p>
        </div>
      </div>
    )
  }
  if (!src) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center p-8 text-center">
        <div>
          <div className="text-4xl mb-3 kp-pulse">🍛</div>
          <p className="font-bold text-ink-900">Loading menu…</p>
        </div>
      </div>
    )
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
            {categories.map((c) => {
              const its = items.filter((i) => i.catId === c.id)
              if (!its.length) return null
              return (
                <div key={c.id} className="mb-4">
                  <h3 className="font-black text-stone-500 text-xs uppercase tracking-wider mb-2 px-1">{c.name}</h3>
                  <div className="bg-white rounded-2xl divide-y divide-stone-50">
                    {its.map((i) => {
                      const lines = linesOf(i.id)
                      const withMods = hasModifiers(i)
                      return (
                        <div key={i.id} className="p-3">
                          <div className="flex items-center gap-3">
                            <VegDot veg={i.veg} />
                            <div className="flex-1 min-w-0">
                              <div className="font-semibold text-sm text-ink-900">{i.name}</div>
                              <div className="text-[11px] text-stone-400">{i.nameHi}</div>
                              <div className="text-sm font-bold text-saffron-700 mt-0.5">
                                {inr0(i.price)}
                                {withMods && <span className="text-[11px] text-blue-600 font-semibold ml-1.5">🧩 choices</span>}
                              </div>
                            </div>
                            {/* a dish with choices always re-opens the sheet, so a second
                                order of it can be a different one */}
                            {!withMods && plainQty(i.id) > 0 ? (
                              <div className="flex items-center gap-2 bg-saffron-50 rounded-xl px-2 py-1">
                                <button onClick={() => bump(i.id + '|', -1)} className="text-saffron-700 font-black w-5">−</button>
                                <b className="text-sm">{plainQty(i.id)}</b>
                                <button onClick={() => bump(i.id + '|', 1)} className="text-saffron-700 font-black w-5">＋</button>
                              </div>
                            ) : (
                              <button onClick={() => onAdd(i)} className="bg-saffron-600 text-white text-xs font-black rounded-xl px-4 py-2">ADD</button>
                            )}
                          </div>

                          {/* each variant already in the cart, so a guest can see and
                              adjust "one extra spicy, one plain" separately */}
                          {withMods && lines.length > 0 && (
                            <div className="mt-2 space-y-1.5">
                              {lines.map((l) => (
                                <div key={l.key} className="flex items-center gap-2 bg-stone-50 rounded-lg px-2.5 py-1.5">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[11px] text-ink-900 font-semibold break-words">{modsLabel(l.mods) || 'No extras'}</div>
                                    <div className="text-[10px] text-stone-400">{inr0(effectivePrice(i, l.mods))} each{modsTotal(l.mods) > 0 ? ` · +${inr0(modsTotal(l.mods))} add-ons` : ''}</div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0">
                                    <button onClick={() => bump(l.key, -1)} className="text-saffron-700 font-black w-5">−</button>
                                    <b className="text-sm">{l.qty}</b>
                                    <button onClick={() => bump(l.key, 1)} className="text-saffron-700 font-black w-5">＋</button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {lines.length > 0 && (
                            <input
                              value={notes[i.id] || ''} maxLength={80}
                              onChange={(e) => setNotes((n) => ({ ...n, [i.id]: e.target.value }))}
                              placeholder="Note for kitchen (optional) — e.g. kam mirchi / less spicy"
                              className="w-full mt-2 text-xs border border-stone-200 rounded-lg px-2.5 py-1.5"
                            />
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
          {modItem && (
            <ModifierPicker
              item={modItem}
              onClose={() => setModItem(null)}
              onAdd={(mods, qty) => { addLine(modItem, mods, qty); setModItem(null) }}
              addLabel="Add"
            />
          )}
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
