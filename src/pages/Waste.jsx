import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Field, Modal, Badge, Empty, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, uid, todayISO, dayKey, fmtDate, fmtTime, waLink, reportRange } from '../utils.js'
import {
  DESTINATIONS, destinationLabel, needsCollector,
  DEFAULT_BAG_PRICE, DEFAULT_SELL_HOURS,
  surplusStatus, remaining, discountPct, STATUS_LABEL,
  liveSurplus, recovery, offerText, blastAudience,
} from '../surplus.js'

// The write-off reasons. Unchanged: the Food-cost and Stock-variance reports group
// on these exact strings, so renaming one silently re-buckets history.
const REASONS = ['Over-production', 'Spoilage', 'Customer return', 'Kitchen error', 'Expired stock']

/**
 * A value for <input type="datetime-local">, built from LOCAL date parts.
 *
 * `toISOString().slice(0,16)` would pre-fill the box 5h30m behind in India — a
 * sell-by typed at 9pm would be saved as 3:30pm and the listing would be born
 * expired. dayKey() gives the local calendar day; the clock comes off the same
 * Date. (Reading the value back is safe: a date-TIME string with no offset is
 * parsed as local time.)
 */
const dtLocal = (ts) => {
  const d = new Date(ts)
  return `${dayKey(ts)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
const defaultSellBy = () => dtLocal(Date.now() + DEFAULT_SELL_HOURS * 3600e3)

// Markdown prices are read off a chalkboard and taken in cash — ₹5 steps keep the
// change simple. Never rounds a real price down to zero.
const to5 = (n) => (n > 0 ? Math.max(5, Math.round(n / 5) * 5) : 0)

// "38 min left". Returns null once the sell-by has passed — the caller shows the
// dead treatment instead, so this never counts down into negatives.
function timeLeft(until, now) {
  const ms = (until || 0) - now
  if (!until || ms <= 0) return null
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'less than a minute left'
  if (mins < 60) return `${mins} min left`
  const h = Math.floor(mins / 60), m = mins % 60
  return m ? `${h} h ${m} min left` : `${h} h left`
}

// Live first. Expired comes SECOND, not last, on purpose: an expired tray is the one
// thing on this screen that can hurt somebody, and burying it under the sold-out
// rows is how it gets sold at 11pm.
const RANK = { live: 0, expired: 1, 'sold-out': 2, cancelled: 3 }

export default function Waste() {
  const { state, t, update, listSurplus, pullSurplus, logPlateWaste, deletePlateWaste } = useStore()
  const [tab, setTab] = useState('surplus')

  /**
   * A ticking clock, not a stored status.
   *
   * surplusStatus() is asked again on every render with this `now`, so a sell-by
   * that passes while the screen sits open flips the card to "do not sell" by
   * itself. Nothing live/expired is ever written to state — see src/surplus.js.
   */
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000)
    return () => clearInterval(id)
  }, [])

  // An install created before these two slices existed has no key for them at all
  // (localStorage wins over the seed), so every read is guarded.
  const surplus = state.surplus || []
  const plateWaste = state.plateWaste || []
  const waste = state.waste || []

  // ---- header numbers ----
  const today = reportRange('today')
  const month = reportRange('month')
  const rec = recovery(surplus, today)
  const feedKgMonth = plateWaste
    .filter((w) => w.at >= month.from && needsCollector(w.destination)) // the three animal destinations
    .reduce((s, w) => s + (+w.kg || 0), 0)
  const writtenOffToday = waste
    .filter((w) => w.date === todayISO())
    .reduce((s, w) => s + (+w.lossValue || 0), 0)

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-1">🍲 {t('waste')}</h1>
      <p className="text-sm text-stone-500 mb-5">
        Three different things, kept apart: food you can still sell cheap, food that came back from a table, and food that was simply thrown.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard
          label="Recovered today" value={inr0(rec.recovered)} icon="♻️" accent="green"
          sub="money taken for food that would otherwise have been binned — not a discount"
        />
        <StatCard
          label="Portions rescued today" value={rec.portionsSold} icon="🍲" accent="blue"
          sub={rec.portionsLost > 0 ? `${rec.portionsLost} went past sell-by unsold` : 'listed and sold'}
        />
        <StatCard
          label="To animals this month" value={`${feedKgMonth.toFixed(1)} kg`} icon="🐄" accent="purple"
          sub="plate waste given as feed"
        />
        <StatCard
          label="Written off today" value={inr0(writtenOffToday)} icon="🗑️" accent="red"
          sub="thrown away — nothing came back"
        />
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
        {[['surplus', '♻️ Sell surplus'], ['plate', '🐄 Plate waste → animals'], ['writeoff', '🗑️ Written off']].map(([k, l]) => (
          <button
            key={k} onClick={() => setTab(k)}
            className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap ${tab === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}
          >{l}</button>
        ))}
      </div>

      {tab === 'surplus' && <SellSurplus state={state} now={now} listSurplus={listSurplus} pullSurplus={pullSurplus} />}
      {tab === 'plate' && <PlateWaste rows={plateWaste} month={month} logPlateWaste={logPlateWaste} deletePlateWaste={deletePlateWaste} />}
      {tab === 'writeoff' && <WrittenOff waste={waste} update={update} />}
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * TAB 1 — sell surplus
 * ------------------------------------------------------------------ */
function SellSurplus({ state, now, listSurplus, pullSurplus }) {
  const [mdOpen, setMdOpen] = useState(false)
  const [bagOpen, setBagOpen] = useState(false)

  const rows = [...(state.surplus || [])].sort((a, b) => {
    const d = RANK[surplusStatus(a, now)] - RANK[surplusStatus(b, now)]
    if (d) return d
    // inside a group: the one running out of time first, then newest
    if (a.until && b.until && a.until !== b.until) return a.until - b.until
    return (b.createdAt || 0) - (a.createdAt || 0)
  })

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button onClick={() => setMdOpen(true)} className={btnPrimary}>＋ Mark down a dish</button>
        <button onClick={() => setBagOpen(true)} className={btnGhost}>＋ Add a surprise bag</button>
        <span className="text-xs text-stone-400 ml-auto">Fresh food cooked today. Sold at the till like anything else — the stock was already taken when it was cooked.</span>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-stone-100">
          <Empty icon="♻️" text="Nothing on the surplus counter. Mark a tray down before it becomes a write-off." />
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-3">
          {rows.map((l) => <SurplusCard key={l.id} l={l} now={now} onPull={pullSurplus} />)}
        </div>
      )}

      <Blast state={state} now={now} />

      <MarkdownModal open={mdOpen} onClose={() => setMdOpen(false)} state={state} listSurplus={listSurplus} />
      <BagModal open={bagOpen} onClose={() => setBagOpen(false)} listSurplus={listSurplus} />
    </div>
  )
}

function SurplusCard({ l, now, onPull }) {
  // DERIVED, every render, from the ticking clock. Never read off the record.
  const status = surplusStatus(l, now)
  const [color, label] = STATUS_LABEL[status] || ['stone', status]
  const dead = status === 'expired'
  const left = remaining(l)
  const sold = +l.soldQty || 0
  const mins = timeLeft(l.until, now)
  const urgent = l.until && l.until - now < 30 * 60e3

  const pull = () => {
    if (confirm(`Pull "${l.name}" off the surplus counter? ${left} portion${left === 1 ? '' : 's'} will stop being sellable. This does not record what happened to the food.`)) onPull(l.id)
  }

  return (
    <div className={`relative overflow-hidden rounded-2xl p-4 ${dead ? 'border-2 border-red-500 bg-red-50' : 'border border-stone-100 bg-white'}`}>
      {/* hazard stripes: this card has to read as dead from across the kitchen */}
      {dead && (
        <div
          className="absolute inset-0 pointer-events-none opacity-[0.08]"
          style={{ background: 'repeating-linear-gradient(45deg,#dc2626 0 10px,transparent 10px 20px)' }}
        />
      )}
      <div className="relative">
        {dead && (
          <div className="bg-red-600 text-white rounded-lg px-3 py-2 mb-3 text-xs font-black leading-snug">
            🚫 PAST SELL-BY — DO NOT SELL<br />
            <span className="font-semibold opacity-90">Take it off the counter. It cannot go back on sale at any price.</span>
          </div>
        )}

        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className={`font-bold truncate ${dead ? 'text-red-900' : 'text-ink-900'}`}>{l.name}</div>
            <div className="text-[11px] text-stone-500 mt-0.5">
              {l.kind === 'bag' ? 'Surprise bag' : 'Marked-down dish'}
              {l.by ? ` · listed by ${l.by}` : ''}
              {l.createdAt ? ` · ${fmtTime(l.createdAt)}` : ''}
            </div>
          </div>
          <Badge color={color}>{label}</Badge>
        </div>

        <div className="flex items-baseline gap-2 mt-2">
          <span className={`text-xl font-black ${dead ? 'text-stone-400 line-through' : 'text-leaf-600'}`}>{inr0(l.price)}</span>
          {l.fullPrice > 0 && (
            <>
              <span className="text-sm text-stone-400 line-through">{inr0(l.fullPrice)}</span>
              <span className={`text-[11px] font-bold ${dead ? 'text-stone-400' : 'text-saffron-700'}`}>{discountPct(l)}% off</span>
            </>
          )}
        </div>

        <div className="text-xs text-stone-600 mt-1.5 tabular-nums">
          <b className={dead ? 'text-red-700' : ''}>{left}</b> of {l.qty} portions left · {sold} sold
        </div>

        {status === 'live' && (
          <div className="text-xs mt-1.5">
            {l.until ? (
              <span className={urgent ? 'font-bold text-red-600' : 'text-stone-500'}>
                ⏱️ {mins || 'sell-by passed'} · until {fmtTime(l.until)}
              </span>
            ) : (
              <span className="font-semibold text-amber-600">⚠️ No sell-by set — cooked food should never be open-ended</span>
            )}
          </div>
        )}
        {dead && l.until && <div className="text-xs text-red-700 mt-1.5">Sell-by was {fmtTime(l.until)}, {fmtDate(l.until)}</div>}

        {l.note && <div className="text-[11px] text-stone-500 mt-2 italic">{l.note}</div>}

        {status !== 'cancelled' && (
          <button onClick={pull} className="mt-3 text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-lg px-3 py-1.5">
            Pull it
          </button>
        )}
      </div>
    </div>
  )
}

/* ---- WhatsApp blast -------------------------------------------------
 * There is no bulk-send for a restaurant's own contact list, and pretending
 * otherwise would mean writing a "Send to all" button that quietly did nothing.
 * So: one message, written once, and one tap per person — with a local tick so
 * the owner can work down the list without losing their place.
 * ------------------------------------------------------------------ */
function Blast({ state, now }) {
  const [sent, setSent] = useState({}) // view-only progress, never persisted
  const [copied, setCopied] = useState(false)

  const live = liveSurplus(state, now)
  const msg = offerText(state.settings, live, now)
  const audience = blastAudience(state.customers)
  const off = !msg

  const copy = () => {
    if (!msg) return
    navigator.clipboard?.writeText(msg)
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <div className={`rounded-2xl border p-5 ${off ? 'border-stone-200 bg-stone-50' : 'border-stone-100 bg-white'}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <h3 className="font-bold text-ink-900">📣 Tell today's regulars</h3>
        {!off && <button onClick={copy} className="text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-lg px-3 py-1.5">{copied ? '✓ Copied' : 'Copy message'}</button>}
      </div>

      {off ? (
        <p className="text-sm text-stone-500">
          Nothing is on sale right now, so there is no message to send. Mark a dish down or add a surprise bag and the message writes itself.
        </p>
      ) : (
        <>
          <p className="text-xs text-stone-500 mb-3">
            Same words as the QR menu and the till, so nobody is quoted two different prices. Read it before you send it.
          </p>
          <pre className="whitespace-pre-wrap text-xs bg-stone-50 border border-stone-200 rounded-xl p-3 text-stone-700 font-sans max-h-52 overflow-y-auto">{msg}</pre>

          <div className="mt-4">
            <div className="flex items-baseline justify-between gap-2">
              <h4 className="text-sm font-bold text-ink-900">{audience.length} to tell</h4>
              <span className="text-[11px] text-stone-400">{Object.keys(sent).length} of {audience.length} opened</span>
            </div>
            <p className="text-[11px] text-stone-500 mt-0.5 mb-2">
              WhatsApp has no bulk send for your own contacts — it is one tap each. Each tap opens WhatsApp with the message ready; you still press send there.
            </p>
            {audience.length === 0 ? (
              <p className="text-sm text-stone-400">No customer with a phone number has been in during the last 45 days. A blast to someone who came once last winter is how people learn to mute you.</p>
            ) : (
              <div className="divide-y divide-stone-50 max-h-72 overflow-y-auto">
                {audience.map((c) => (
                  <div key={c.id || c.phone} className="flex items-center gap-2 py-1.5 text-sm">
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-ink-900">{c.name || c.phone}</span>
                      <span className="text-[11px] text-stone-400 ml-2 tabular-nums">{c.phone} · last in {fmtDate(c.lastVisit)}</span>
                    </div>
                    <a
                      href={waLink(c.phone, msg)} target="_blank" rel="noreferrer"
                      onClick={() => setSent((s) => ({ ...s, [c.phone]: true }))}
                      className={`text-xs font-bold rounded-lg px-3 py-1.5 shrink-0 ${sent[c.phone] ? 'bg-stone-100 text-stone-500' : 'bg-leaf-500 hover:bg-leaf-600 text-white'}`}
                    >{sent[c.phone] ? '✓ Opened' : 'WhatsApp'}</a>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

/* ---- modals ---- */
function MarkdownModal({ open, onClose, state, listSurplus }) {
  const blank = () => ({ itemId: '', name: '', fullPrice: '', price: '', qty: '4', taxClass: 'gst', until: defaultSellBy(), note: '' })
  const [f, setF] = useState(blank)
  // a fresh sell-by every time the modal is opened, not one frozen at page load
  useEffect(() => { if (open) setF(blank()) }, [open])

  const items = state.items || []
  const cats = state.categories || []
  const catIds = new Set(cats.map((c) => c.id))
  const orphans = items.filter((i) => !catIds.has(i.catId))

  // picking off the menu is what fills in name, full price and tax class — typed
  // by hand they drift, and a liquor line taxed as food is a wrong return
  const pick = (id) => {
    const it = items.find((x) => x.id === id)
    if (!it) return setF({ ...f, itemId: '' })
    setF({
      ...f, itemId: id, name: it.name,
      fullPrice: String(it.price || 0),
      price: String(to5((+it.price || 0) * 0.5)),
      taxClass: it.taxClass || 'gst',
    })
  }

  const untilTs = f.until ? new Date(f.until).getTime() : 0
  const err = !f.name.trim() ? 'Pick a dish off the menu.'
    : !(+f.qty >= 1) ? 'How many portions are left?'
    : !(+f.price > 0) ? 'Set the marked-down price.'
    : !(+f.fullPrice > 0) ? 'The full menu price is needed to show what is being given up.'
    : +f.price >= +f.fullPrice ? 'A markdown has to be below the menu price.'
    : !untilTs ? 'Set a sell-by time — cooked food is never open-ended.'
    : untilTs <= Date.now() ? 'That sell-by has already passed, so the listing would be born unsellable.'
    : null

  const save = () => {
    if (err) return
    listSurplus({
      kind: 'item', itemId: f.itemId || null, name: f.name.trim(),
      fullPrice: +f.fullPrice, price: +f.price, qty: +f.qty,
      taxClass: f.taxClass, note: f.note, until: untilTs,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Mark down a dish">
      <Field label="Which dish? (fills in the menu price and tax)">
        <select value={f.itemId} onChange={(e) => pick(e.target.value)} className={inputCls}>
          <option value="">— pick from the menu —</option>
          {cats.map((c) => {
            const mine = items.filter((i) => i.catId === c.id)
            if (!mine.length) return null
            return (
              <optgroup key={c.id} label={c.name}>
                {mine.map((i) => <option key={i.id} value={i.id}>{i.name} · {inr0(i.price)}</option>)}
              </optgroup>
            )
          })}
          {orphans.length > 0 && (
            <optgroup label="Other">
              {orphans.map((i) => <option key={i.id} value={i.id}>{i.name} · {inr0(i.price)}</option>)}
            </optgroup>
          )}
        </select>
      </Field>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Portions left">
          <input type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Menu price (₹)">
          <input type="number" min="0" value={f.fullPrice} onChange={(e) => setF({ ...f, fullPrice: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Sell it for (₹)">
          <input type="number" min="0" step="5" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputCls} />
        </Field>
      </div>
      {+f.fullPrice > 0 && +f.price > 0 && +f.price < +f.fullPrice && (
        <p className="text-xs text-stone-500 -mt-1 mb-3">
          {/* same function the card and the reports use, so the draft can't preview a different number */}
          {discountPct({ fullPrice: +f.fullPrice, price: +f.price })}% off · {inr0(+f.price * (+f.qty || 0))} if the whole tray goes
        </p>
      )}

      <Field label="Sell by">
        <input type="datetime-local" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Note (optional)">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Cooked for a booking that shrank" className={inputCls} />
      </Field>

      {err && <p className="text-xs font-semibold text-red-600 mb-3">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!!err} className={btnPrimary + ' flex-1'}>Put it on the counter</button>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
      </div>
    </Modal>
  )
}

function BagModal({ open, onClose, listSurplus }) {
  const blank = () => ({
    name: 'Surprise bag — whatever is left', price: String(DEFAULT_BAG_PRICE), qty: '5',
    fullPrice: '', until: defaultSellBy(), note: '',
  })
  const [f, setF] = useState(blank)
  useEffect(() => { if (open) setF(blank()) }, [open])

  const untilTs = f.until ? new Date(f.until).getTime() : 0
  const err = !f.name.trim() ? 'Give the bag a name.'
    : !(+f.price > 0) ? 'Set a price for the bag.'
    : !(+f.qty >= 1) ? 'How many bags can you make up?'
    : !untilTs ? 'Set a sell-by time — cooked food is never open-ended.'
    : untilTs <= Date.now() ? 'That sell-by has already passed, so the bags would be born unsellable.'
    : null

  const save = () => {
    if (err) return
    listSurplus({
      kind: 'bag', name: f.name.trim(), price: +f.price, qty: +f.qty,
      fullPrice: +f.fullPrice || 0, note: f.note, until: untilTs,
    })
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Add a surprise bag">
      <p className="text-xs text-stone-500 mb-3">
        One fixed price, contents whatever the kitchen still has at closing. Fresh food only — nothing that came back from a table goes in a bag.
      </p>
      <Field label="What to call it">
        <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Price (₹)">
          <input type="number" min="0" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} className={inputCls} />
        </Field>
        <Field label="How many bags">
          <input type="number" min="1" value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} className={inputCls} />
        </Field>
        <Field label="Worth about (₹)">
          <input type="number" min="0" value={f.fullPrice} onChange={(e) => setF({ ...f, fullPrice: e.target.value })} placeholder="optional" className={inputCls} />
        </Field>
      </div>
      <Field label="Sell by">
        <input type="datetime-local" value={f.until} onChange={(e) => setF({ ...f, until: e.target.value })} className={inputCls} />
      </Field>
      <Field label="Likely contents (goes out with the offer)">
        <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Mixed sabji, dal and 4 rotis" className={inputCls} />
      </Field>

      {err && <p className="text-xs font-semibold text-red-600 mb-3">{err}</p>}
      <div className="flex gap-2">
        <button onClick={save} disabled={!!err} className={btnPrimary + ' flex-1'}>List the bags</button>
        <button onClick={onClose} className={btnGhost}>Cancel</button>
      </div>
    </Modal>
  )
}

/* ------------------------------------------------------------------ *
 * TAB 2 — plate waste → animals
 * ------------------------------------------------------------------ */
function PlateWaste({ rows, month, logPlateWaste, deletePlateWaste }) {
  const [f, setF] = useState({ kg: '', destination: DESTINATIONS[0][0], name: '', phone: '', dishes: '', note: '' })

  const mustName = needsCollector(f.destination)
  const err = !(+f.kg > 0) ? 'Weigh it — kilos is how this is recorded.'
    : mustName && !f.name.trim() ? `Food leaving the premises as feed needs a record of who took it. Enter the collector's name for ${destinationLabel(f.destination)}.`
    : null

  const save = () => {
    if (err) return
    logPlateWaste({
      kg: +f.kg, destination: f.destination,
      collector: { name: f.name, phone: f.phone },
      dishes: f.dishes, note: f.note,
    })
    setF({ kg: '', destination: f.destination, name: '', phone: '', dishes: '', note: '' })
  }

  const kgMonth = rows.filter((w) => w.at >= month.from).reduce((s, w) => s + (+w.kg || 0), 0)
  const byDest = DESTINATIONS
    .map(([code, label]) => ({ label, value: rows.filter((w) => w.destination === code).reduce((s, w) => s + (+w.kg || 0), 0) }))
    .filter((x) => x.value > 0)
  const history = [...rows].sort((a, b) => (b.at || 0) - (a.at || 0))

  return (
    <div className="space-y-4">
      <div className="bg-stone-50 border border-stone-200 rounded-2xl p-4 text-sm text-stone-600">
        <b className="text-ink-900">Plate waste is not food.</b> Anything that has been to a table is only ever given as animal feed,
        sent to biogas or binned. It is never sold and never re-served — not at a discount, and not inside a surprise bag.
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Log a pickup</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Weight (kg)">
              <input type="number" min="0" step="0.1" value={f.kg} onChange={(e) => setF({ ...f, kg: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Where it went">
              <select value={f.destination} onChange={(e) => setF({ ...f, destination: e.target.value })} className={inputCls}>
                {DESTINATIONS.map(([c, l]) => <option key={c} value={c}>{l}</option>)}
              </select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={mustName ? 'Collector name (required)' : 'Collector name (optional)'}>
              <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Shri Krishna Gaushala" className={inputCls} />
            </Field>
            <Field label="Collector phone">
              <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="98155 77001" className={inputCls} />
            </Field>
          </div>
          <Field label="What came back">
            <input value={f.dishes} onChange={(e) => setF({ ...f, dishes: e.target.value })} placeholder="e.g. Mixed plate scraps, rice, roti" className={inputCls} />
          </Field>
          <Field label="Note (optional)">
            <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. Evening pickup" className={inputCls} />
          </Field>
          {err && <p className="text-xs font-semibold text-red-600 mb-3">{err}</p>}
          <button onClick={save} disabled={!!err} className={btnPrimary + ' w-full'}>Log it</button>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-stone-100">
            <h3 className="font-bold text-ink-900">This month</h3>
            <div className="text-3xl font-black text-ink-900 tabular-nums mt-1">{kgMonth.toFixed(1)} <span className="text-base font-bold text-stone-400">kg</span></div>
            <p className="text-[11px] text-stone-400">off plates, since the 1st</p>
          </div>
          <div className="bg-white rounded-2xl p-5 border border-stone-100">
            <h3 className="font-bold text-ink-900 mb-3">Where it has gone <span className="font-normal text-xs text-stone-400">(all logged pickups)</span></h3>
            {byDest.length
              ? <HBars data={byDest} color="#7c3aed" fmt={(v) => `${v.toFixed(1)} kg`} />
              : <p className="text-sm text-stone-400">Nothing logged yet</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl p-5 border border-stone-100">
        <h3 className="font-bold text-ink-900 mb-2">Pickup history</h3>
        {history.length === 0 && <p className="text-sm text-stone-400">Nothing logged yet</p>}
        <div className="divide-y divide-stone-50">
          {history.map((w) => (
            <div key={w.id} className="group flex items-start justify-between gap-2 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-black text-ink-900 tabular-nums">{(+w.kg || 0).toFixed(1)} kg</span>
                <span className="ml-2 font-semibold text-stone-700">{destinationLabel(w.destination)}</span>
                <div className="text-[11px] text-stone-500 mt-0.5">
                  {w.collector?.name
                    ? <>Taken by <b className="text-stone-600">{w.collector.name}</b>{w.collector.phone ? ` · ${w.collector.phone}` : ''}</>
                    : <span className="text-stone-400">No collector recorded</span>}
                </div>
                {w.dishes && <div className="text-[11px] text-stone-500">{w.dishes}</div>}
                {w.note && <div className="text-[11px] text-stone-400 italic">{w.note}</div>}
                <div className="text-[11px] text-stone-400 mt-0.5">
                  {fmtDate(w.at)} {fmtTime(w.at)}{w.by ? ` · logged by ${w.by}` : ''}
                </div>
              </div>
              <button
                onClick={() => { if (confirm(`Delete this ${(+w.kg || 0).toFixed(1)} kg ${destinationLabel(w.destination)} pickup from the record?`)) deletePlateWaste(w.id) }}
                className="text-stone-300 hover:text-red-500 text-xs shrink-0 md:opacity-0 md:group-hover:opacity-100"
                title="Delete entry"
              >✕</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ *
 * TAB 3 — written off (the original waste log, unchanged in behaviour)
 * ------------------------------------------------------------------ */
function WrittenOff({ waste, update }) {
  const [f, setF] = useState({ itemName: '', qty: '', reason: REASONS[0], lossValue: '' })

  const totalLoss = waste.reduce((s, w) => s + (+w.lossValue || 0), 0)
  const byReason = REASONS.map((r) => ({
    label: r,
    value: waste.filter((w) => w.reason === r).reduce((s, w) => s + (+w.lossValue || 0), 0),
  })).filter((x) => x.value > 0)

  const add = () => {
    update((s) => { s.waste = s.waste || []; s.waste.push({ id: uid('w'), date: todayISO(), itemName: f.itemName, qty: f.qty, reason: f.reason, lossValue: +f.lossValue || 0 }) })
    setF({ itemName: '', qty: '', reason: REASONS[0], lossValue: '' })
  }

  // annualize from the ACTUAL span of logged entries, not an arbitrary multiplier
  const wDates = waste.map((w) => w.date).filter(Boolean).sort()
  const spanDays = wDates.length ? Math.max(1, Math.round((new Date(wDates[wDates.length - 1]) - new Date(wDates[0])) / 864e5) + 1) : 1
  const yearlyLoss = Math.round((totalLoss / spanDays) * 365)

  return (
    <div className="space-y-4">
      <p className="text-sm text-stone-500">
        Food that was neither sold nor given away. Every rupee here is profit in the bin — and it is what the Food-cost and Stock-variance reports read.
      </p>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <StatCard label="Loss logged" value={inr0(totalLoss)} icon="💸" accent="red" />
        <StatCard label="Entries" value={waste.length} icon="📋" accent="blue" />
        <StatCard label="At this pace, per year" value={inr0(yearlyLoss)} sub="based on what you've logged" icon="⚠️" accent="red" />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-stone-100">
          <h3 className="font-bold text-ink-900 mb-3">Log waste</h3>
          <Field label="What was wasted?"><input value={f.itemName} onChange={(e) => setF({ ...f, itemName: e.target.value })} placeholder="e.g. Dal Makhani leftover" className={inputCls} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Quantity"><input value={f.qty} onChange={(e) => setF({ ...f, qty: e.target.value })} placeholder="2 kg" className={inputCls} /></Field>
            <Field label="Loss value (₹)"><input type="number" min="0" value={f.lossValue} onChange={(e) => setF({ ...f, lossValue: e.target.value })} className={inputCls} /></Field>
          </div>
          <Field label="Reason">
            <select value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} className={inputCls}>
              {REASONS.map((r) => <option key={r}>{r}</option>)}
            </select>
          </Field>
          <button onClick={add} disabled={!f.itemName || !(+f.lossValue > 0)} className={btnPrimary + ' w-full'}>Log it</button>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-stone-100">
            <h3 className="font-bold text-ink-900 mb-3">Loss by reason</h3>
            {byReason.length ? <HBars data={byReason} color="#dc2626" /> : <p className="text-sm text-stone-400">Nothing logged yet</p>}
          </div>
          <div className="bg-white rounded-2xl p-5 border border-stone-100 max-h-64 overflow-y-auto">
            <h3 className="font-bold text-ink-900 mb-2">Recent entries</h3>
            {waste.length === 0 && <p className="text-sm text-stone-400">Nothing logged yet 🎉</p>}
            {[...waste].reverse().map((w) => (
              <div key={w.id} className="group flex items-center justify-between py-1.5 border-b border-stone-50 text-sm">
                <div className="min-w-0">
                  <span className="font-semibold">{w.itemName}</span>
                  <span className="text-xs text-stone-400 ml-2">{w.qty} · {w.reason} · {w.date}</span>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <b className="text-red-600">−{inr0(w.lossValue)}</b>
                  <button onClick={() => update((s) => { s.waste = (s.waste || []).filter((x) => x.id !== w.id) })} className="text-stone-300 hover:text-red-500 text-xs md:opacity-0 md:group-hover:opacity-100" title="Delete entry">✕</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
