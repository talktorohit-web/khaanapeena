import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, VegDot, Empty, Field, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { inr, inr0, billTotals, upiLink, fmtTime } from '../utils.js'
import QRCode from 'qrcode'

const NUM_WORDS = { ek: 1, one: 1, do: 2, two: 2, teen: 3, three: 3, char: 4, four: 4, chaar: 4, paanch: 5, panch: 5, five: 5, che: 6, six: 6, saat: 7, seven: 7, aath: 8, eight: 8 }

export default function Billing() {
  const { state, t, update, newOrder, sendKot, settleOrder } = useStore()
  const [orderId, setOrderId] = useState(null)
  const [cat, setCat] = useState('all')
  const [q, setQ] = useState('')
  const [vegOnly, setVegOnly] = useState(false)
  const [settleOpen, setSettleOpen] = useState(false)
  const [printOrder, setPrintOrder] = useState(null)
  const [listening, setListening] = useState(false)
  const [voiceMsg, setVoiceMsg] = useState('')
  const recRef = useRef(null)

  const activeOrders = state.orders.filter((o) => ['open', 'kot', 'ready', 'served'].includes(o.status))
  const order = state.orders.find((o) => o.id === orderId && o.status !== 'paid')

  const hour = new Date().getHours()
  const hh = state.settings.happyHour
  const happyHourNow = hh?.enabled && hour >= hh.from && hour < hh.to

  const items = useMemo(() => {
    const ql = q.toLowerCase()
    return state.items.filter(
      (i) =>
        i.available &&
        (cat === 'all' || i.catId === cat) &&
        (!vegOnly || i.veg) &&
        (!ql || i.name.toLowerCase().includes(ql) || (i.nameHi || '').includes(q))
    )
  }, [state.items, cat, q, vegOnly])

  const addItem = (item) => {
    let id = orderId
    if (!order) {
      id = newOrder({ type: 'takeaway' })
      setOrderId(id)
    }
    update((s) => {
      const o = s.orders.find((x) => x.id === id)
      if (!o) return
      const li = o.items.find((x) => x.itemId === item.id && !x.deducted)
      if (li) li.qty++
      else o.items.push({ itemId: item.id, name: item.name, price: item.price, qty: 1 })
    })
  }

  const changeQty = (li, d) =>
    update((s) => {
      const o = s.orders.find((x) => x.id === orderId)
      const line = o?.items.find((x) => x.itemId === li.itemId && x.deducted === li.deducted)
      if (!line) return
      line.qty += d
      if (line.qty <= 0) o.items = o.items.filter((x) => x !== line)
    })

  // ---- Voice ordering (Hindi/English, Web Speech API) ----
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setVoiceMsg('Voice not supported in this browser — use Chrome/Edge'); return }
    if (listening) { recRef.current?.stop(); return }
    const rec = new SR()
    rec.lang = state.settings.lang === 'hi' ? 'hi-IN' : 'en-IN'
    rec.interimResults = false
    rec.onresult = (e) => {
      const text = e.results[0][0].transcript
      const added = parseVoice(text)
      setVoiceMsg(added.length ? `Heard: “${text}” → added ${added.join(', ')}` : `Heard: “${text}” — no matching item`)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => { setListening(false); setVoiceMsg('Mic error — check permission') }
    recRef.current = rec
    setVoiceMsg('')
    setListening(true)
    rec.start()
  }

  const parseVoice = (text) => {
    const words = text.toLowerCase().split(/[\s,]+/)
    const added = []
    let qty = 1
    let i = 0
    while (i < words.length) {
      const w = words[i]
      if (/^\d+$/.test(w)) { qty = parseInt(w); i++; continue }
      if (NUM_WORDS[w]) { qty = NUM_WORDS[w]; i++; continue }
      // try to match longest item name starting at i
      let best = null
      for (const item of state.items) {
        const names = [item.name.toLowerCase(), (item.nameHi || '')]
        for (const nm of names) {
          if (!nm) continue
          const first = nm.split(/[\s(]+/)[0]
          if (first && (w.includes(first) || first.includes(w)) && w.length > 2) {
            const rest = text.toLowerCase()
            if (rest.includes(first)) best = item
          }
        }
        if (best) break
      }
      if (best) {
        for (let k = 0; k < qty; k++) addItem(best)
        added.push(`${qty}× ${best.name}`)
        qty = 1
      }
      i++
    }
    return added
  }

  const totals = order ? billTotals(order, state.settings) : null

  return (
    <div className="flex h-full">
      {/* LEFT: menu grid */}
      <div className="flex-1 flex flex-col p-4 min-w-0">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchItems')} className={inputCls + ' max-w-xs'} />
          <button onClick={() => setVegOnly(!vegOnly)} className={`${btnGhost} ${vegOnly ? '!bg-green-50 !border-green-300 !text-green-700' : ''}`}>🟢 {t('veg')}</button>
          <button onClick={toggleVoice} className={`${btnGhost} ${listening ? '!bg-red-50 !border-red-300 !text-red-600 kp-pulse' : ''}`}>
            🎙️ {listening ? t('listening') : t('voiceOrder')}
          </button>
          {happyHourNow && <Badge color="amber">🕒 Happy Hour −{hh.discountPct}%</Badge>}
        </div>
        {voiceMsg && <div className="text-xs text-stone-500 mb-2 bg-stone-100 rounded-lg px-3 py-1.5">{voiceMsg}</div>}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          <CatChip active={cat === 'all'} onClick={() => setCat('all')}>All</CatChip>
          {state.categories.map((c) => (
            <CatChip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {state.settings.lang === 'hi' ? c.nameHi : state.settings.lang === 'pa' ? c.namePa : c.name}
            </CatChip>
          ))}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 overflow-y-auto content-start flex-1">
          {items.map((i) => (
            <button
              key={i.id}
              onClick={() => addItem(i)}
              className="bg-white rounded-xl border border-stone-100 shadow-sm p-3 text-left hover:border-saffron-400 hover:shadow transition-all active:scale-95"
            >
              <div className="flex items-start justify-between gap-1">
                <VegDot veg={i.veg} />
                <span className="text-[10px] text-stone-400 uppercase">{i.station}</span>
              </div>
              <div className="font-semibold text-[13px] text-ink-900 mt-1 leading-tight">{i.name}</div>
              {state.settings.lang !== 'en' && <div className="text-[11px] text-stone-400">{i.nameHi}</div>}
              <div className="text-saffron-700 font-bold text-sm mt-1">{inr0(i.price)}</div>
            </button>
          ))}
        </div>
      </div>

      {/* RIGHT: order panel */}
      <div className="w-[340px] shrink-0 bg-white border-l border-stone-100 flex flex-col">
        <div className="p-3 border-b border-stone-100">
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <button onClick={() => setOrderId(newOrder({ type: 'takeaway' }))} className="shrink-0 bg-saffron-600 text-white text-xs font-bold rounded-lg px-3 py-1.5">＋ {t('newOrder')}</button>
            {activeOrders.map((o) => (
              <button
                key={o.id}
                onClick={() => setOrderId(o.id)}
                className={`shrink-0 text-xs font-semibold rounded-lg px-2.5 py-1.5 border ${o.id === orderId ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}
              >
                {o.tableId ? `🪑 ${o.tableId}` : o.type === 'qr' ? '📱 QR' : '🛍️'} {o.items.reduce((s, i) => s + i.qty, 0)}
              </button>
            ))}
          </div>
          {order && (
            <div className="flex items-center gap-2 mt-2">
              <select
                value={order.type}
                onChange={(e) => update((s) => { const o = s.orders.find((x) => x.id === orderId); if (o) { o.type = e.target.value; if (e.target.value !== 'dine') o.tableId = null } })}
                className="text-xs border border-stone-200 rounded-lg px-2 py-1"
              >
                <option value="dine">{t('dineIn')}</option>
                <option value="takeaway">{t('takeaway')}</option>
                <option value="delivery">{t('delivery')}</option>
              </select>
              {order.type === 'dine' && (
                <select
                  value={order.tableId || ''}
                  onChange={(e) => update((s) => { const o = s.orders.find((x) => x.id === orderId); if (o) o.tableId = e.target.value || null })}
                  className="text-xs border border-stone-200 rounded-lg px-2 py-1"
                >
                  <option value="">Table…</option>
                  {state.tables.map((tb) => <option key={tb.id} value={tb.id}>{tb.name} ({tb.area})</option>)}
                </select>
              )}
              <Badge color={order.status === 'kot' ? 'amber' : order.status === 'ready' ? 'green' : 'blue'}>{order.status.toUpperCase()}</Badge>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!order || order.items.length === 0 ? (
            <Empty icon="🛒" text="Tap items to add" />
          ) : (
            order.items.map((li, idx) => (
              <div key={idx} className="flex items-center gap-2 py-2 border-b border-stone-50">
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-semibold text-ink-900 truncate">{li.name} {li.deducted && <span className="text-[9px] text-amber-600 font-bold">KOT✓</span>}</div>
                  <div className="text-[11px] text-stone-400">{inr0(li.price)} × {li.qty}</div>
                </div>
                <div className="flex items-center gap-1">
                  <QtyBtn onClick={() => changeQty(li, -1)}>−</QtyBtn>
                  <span className="w-6 text-center text-sm font-bold">{li.qty}</span>
                  <QtyBtn onClick={() => changeQty(li, 1)}>＋</QtyBtn>
                </div>
                <div className="w-14 text-right text-[13px] font-bold">{inr0(li.price * li.qty)}</div>
              </div>
            ))
          )}
        </div>

        {order && totals && (
          <div className="border-t border-stone-100 p-3 space-y-1 text-sm">
            <Row l={t('subtotal')} v={inr(totals.sub)} />
            {totals.discount > 0 && <Row l={t('discount')} v={'−' + inr(totals.discount)} cls="text-green-600" />}
            {state.settings.gstScheme === 'regular' ? (
              <>
                <Row l={`CGST ${totals.gstRate / 2}%`} v={inr(totals.cgst)} muted />
                <Row l={`SGST ${totals.gstRate / 2}%`} v={inr(totals.sgst)} muted />
              </>
            ) : (
              <Row l="Composition scheme — no GST on bill" v="" muted />
            )}
            <div className="flex justify-between font-black text-lg text-ink-900 pt-1 border-t border-stone-100">
              <span>{t('total')}</span><span>{inr0(state.settings.gstScheme === 'regular' ? totals.total : Math.round(totals.taxable))}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-2">
              <button onClick={() => sendKot(orderId)} disabled={!order.items.some((i) => !i.deducted)} className="bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-xs">🔥 {t('sendKot')}</button>
              <button onClick={() => setPrintOrder(order)} className="bg-stone-700 hover:bg-stone-800 text-white font-bold rounded-xl py-2.5 text-xs">🖨️ {t('printBill')}</button>
              <button onClick={() => setSettleOpen(true)} disabled={!order.items.length} className="bg-leaf-600 hover:bg-leaf-500 disabled:opacity-40 text-white font-bold rounded-xl py-2.5 text-xs">💳 {t('settle')}</button>
            </div>
          </div>
        )}
      </div>

      {settleOpen && order && (
        <SettleModal
          order={order} totals={totals} onClose={() => setSettleOpen(false)}
          onDone={(payload) => {
            settleOrder(orderId, payload)
            setSettleOpen(false)
            setOrderId(null)
          }}
          happyHourNow={happyHourNow}
        />
      )}
      {printOrder && <BillPrint order={printOrder} onClose={() => setPrintOrder(null)} />}
    </div>
  )
}

const CatChip = ({ active, onClick, children }) => (
  <button onClick={onClick} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${active ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'}`}>{children}</button>
)
const QtyBtn = ({ onClick, children }) => (
  <button onClick={onClick} className="w-6 h-6 rounded-md bg-stone-100 hover:bg-stone-200 text-stone-700 font-bold text-sm leading-none">{children}</button>
)
const Row = ({ l, v, muted, cls = '' }) => (
  <div className={`flex justify-between ${muted ? 'text-stone-400 text-xs' : 'text-stone-600'} ${cls}`}><span>{l}</span><span>{v}</span></div>
)

function SettleModal({ order, totals, onClose, onDone, happyHourNow }) {
  const { state, t, update } = useStore()
  const hh = state.settings.happyHour
  const [method, setMethod] = useState('upi')
  const [discount, setDiscount] = useState(happyHourNow ? Math.round((totals.sub * hh.discountPct) / 100) : 0)
  const [phone, setPhone] = useState('')
  const [custName, setCustName] = useState('')
  const [redeem, setRedeem] = useState(0)
  const [qr, setQr] = useState(null)

  const cust = state.customers.find((c) => c.phone === phone)
  const effTotals = billTotals({ ...order, payment: { discount: discount + redeem } }, state.settings)
  const payable = state.settings.gstScheme === 'regular' ? effTotals.total : Math.round(effTotals.taxable)

  useEffect(() => {
    if (method === 'upi') {
      QRCode.toDataURL(upiLink(state.settings, payable, `Bill ${order.id.slice(-4)}`), { width: 200, margin: 1 })
        .then(setQr).catch(() => setQr(null))
    }
  }, [method, payable])

  const finish = () => {
    let customerId = cust?.id || null
    if (!cust && phone.length === 10) {
      customerId = 'cu' + Math.random().toString(36).slice(2, 8)
      update((s) => s.customers.push({ id: customerId, name: custName || 'Guest', phone, birthday: null, points: 0, visits: 0, totalSpend: 0, lastVisit: null, tags: [] }))
    }
    onDone({ method, discount: discount + redeem, customerId, redeemPoints: redeem })
  }

  return (
    <Modal open onClose={onClose} title={`${t('settle')} — ${inr0(payable)}`}>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {['upi', 'cash', 'card'].map((m) => (
          <button key={m} onClick={() => setMethod(m)} className={`rounded-xl py-3 font-bold text-sm border-2 transition-colors ${method === m ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>
            {m === 'upi' ? '📲 UPI' : m === 'cash' ? `💵 ${t('cash')}` : `💳 ${t('card')}`}
          </button>
        ))}
      </div>

      {method === 'upi' && qr && (
        <div className="flex flex-col items-center mb-4 bg-stone-50 rounded-xl p-3">
          <img src={qr} alt="UPI QR" className="w-40 h-40" />
          <div className="text-xs text-stone-500 mt-1">Dynamic QR · {state.settings.upiId} · {inr0(payable)}</div>
        </div>
      )}

      <Field label={`${t('discount')} (₹)`}>
        <input type="number" value={discount} min="0" onChange={(e) => setDiscount(Math.max(0, +e.target.value || 0))} className={inputCls} />
        {happyHourNow && <span className="text-[11px] text-amber-600">Happy hour −{hh.discountPct}% auto-applied</span>}
      </Field>

      <Field label="Customer mobile (loyalty)">
        <input value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile" className={inputCls} />
      </Field>
      {cust ? (
        <div className="bg-green-50 rounded-xl p-3 mb-3 text-sm">
          <b>{cust.name}</b> · {cust.points} {t('points')} · {cust.visits} visits
          {cust.points >= 50 && (
            <div className="mt-1">
              <label className="text-xs flex items-center gap-2">
                <input type="checkbox" checked={redeem > 0} onChange={(e) => setRedeem(e.target.checked ? Math.min(cust.points, Math.floor(totals.sub / 2)) : 0)} />
                Redeem {Math.min(cust.points, Math.floor(totals.sub / 2))} points (₹{Math.min(cust.points, Math.floor(totals.sub / 2))} off)
              </label>
            </div>
          )}
        </div>
      ) : phone.length === 10 ? (
        <Field label="New customer name">
          <input value={custName} onChange={(e) => setCustName(e.target.value)} placeholder="Name (optional)" className={inputCls} />
        </Field>
      ) : null}

      <button onClick={finish} className={btnPrimary + ' w-full'}>✓ Collect {inr0(payable)} & Close Bill</button>
    </Modal>
  )
}

export function BillPrint({ order, onClose }) {
  const { state } = useStore()
  const s = state.settings
  const totals = billTotals(order, s)
  const isComposition = s.gstScheme === 'composition'
  const payable = isComposition ? Math.round(totals.taxable) : totals.total
  useEffect(() => {
    const id = setTimeout(() => window.print(), 300)
    return () => clearTimeout(id)
  }, [])
  return (
    <Modal open onClose={onClose} title="Bill preview">
      <div id="kp-print" className="mx-auto bg-white border border-dashed border-stone-300 p-4 text-[12px] font-mono w-[280px] text-ink-900">
        <div className="text-center">
          <div className="font-black text-sm">{s.name}</div>
          <div>{s.address}</div>
          <div>Ph: {s.phone}</div>
          <div>GSTIN: {s.gstin}</div>
          <div>FSSAI: {s.fssai}</div>
          <div className="font-bold mt-1">{isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE'}</div>
        </div>
        <div className="border-t border-dashed border-stone-400 my-1" />
        <div>Bill No: {order.billNo || 'DRAFT'} · {order.tableId ? `Table ${order.tableId}` : order.type}</div>
        <div>{new Date(order.createdAt).toLocaleString('en-IN')}</div>
        <div className="border-t border-dashed border-stone-400 my-1" />
        {order.items.map((li, i) => (
          <div key={i} className="flex justify-between">
            <span>{li.name} × {li.qty}</span><span>{(li.price * li.qty).toFixed(2)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-stone-400 my-1" />
        <div className="flex justify-between"><span>Subtotal</span><span>{totals.sub.toFixed(2)}</span></div>
        {totals.discount > 0 && <div className="flex justify-between"><span>Discount</span><span>-{totals.discount.toFixed(2)}</span></div>}
        {!isComposition && (
          <>
            <div className="flex justify-between"><span>CGST @{totals.gstRate / 2}%</span><span>{totals.cgst.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>SGST @{totals.gstRate / 2}%</span><span>{totals.sgst.toFixed(2)}</span></div>
          </>
        )}
        <div className="flex justify-between font-black text-sm border-t border-dashed border-stone-400 mt-1 pt-1">
          <span>TOTAL</span><span>₹{payable}</span>
        </div>
        {isComposition && <div className="mt-1 text-[10px]">Composition taxable person, not eligible to collect tax on supplies</div>}
        <div className="text-center mt-2">🙏 Dhanyavaad! Visit again 🙏<br />Powered by KhaanaPeena</div>
      </div>
    </Modal>
  )
}
