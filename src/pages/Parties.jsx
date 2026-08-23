import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, inputCls, btnPrimary, btnGhost, Badge, StatCard, Empty } from '../components.jsx'
import { inr0, waLink, fmtDate, todayISO } from '../utils.js'
import {
  OCCASIONS, DEFAULT_PACKAGES, NONVEG_ADDON, quote, packagesOf, occasionOf,
  bookingPaid, bookingBalance, BOOKING_STATUS, sortBookings,
} from '../party.js'
import { printPamphlet, pamphletText } from '../pamphlet.js'

/**
 * Party & function packages — the per-plate rate lists an owner quotes for a kitty
 * party, a birthday or a conference, plus the pamphlet that goes across the counter.
 *
 * Every rupee on this screen comes from `quote()` in party.js, and the pamphlet and
 * the WhatsApp message read the same packages, so the leaflet in a customer's hand
 * cannot quote a different price from the one on the owner's screen.
 */
export default function Parties() {
  const { state, update, createBooking, addBookingPayment, setBookingStatus } = useStore()
  const settings = state.settings
  const packages = packagesOf(settings)
  const gstRate = settings.gstRate ?? 5

  const [occId, setOccId] = useState('kitty')
  const [guests, setGuests] = useState(25)
  const [nonVeg, setNonVeg] = useState(false)
  const [picked, setPicked] = useState(packages[1]?.id || packages[0]?.id)
  const [editing, setEditing] = useState(null)
  const [sendTo, setSendTo] = useState('')
  const [booking, setBooking] = useState(null)     // the "take a booking" form
  const [payFor, setPayFor] = useState(null)       // collecting money against one

  const bookings = sortBookings(state.bookings || [])
  const upcoming = bookings.filter((b) => b.status === 'confirmed' || b.status === 'enquiry')
  const dueTotal = upcoming.reduce((s, b) => s + bookingBalance(b), 0)

  const occ = occasionOf(occId)
  const pkg = packages.find((p) => p.id === picked) || packages[0]
  const q = quote(pkg, guests, { gstRate, minGuests: occ.minGuests, nonVeg })

  const shareText = pamphletText(settings, occId, packages, gstRate)

  return (
    <div className="p-3 sm:p-5 max-w-6xl mx-auto pb-24">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <h1 className="text-xl font-black text-ink-900">🎉 Party & function packages</h1>
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => printPamphlet(settings, { occasionId: occId })} className={btnGhost}>🖨️ Print pamphlet</button>
          <button onClick={() => printPamphlet(settings, {})} className={btnGhost}>📄 All occasions</button>
        </div>
      </div>
      <p className="text-xs text-stone-400 mb-4">
        Rates are per plate and GST is added on top — that's how a banquet quote reads in India, and a guest shown
        “₹{pkg?.rate} + GST” who is later billed {inr0(Math.round((pkg?.rate || 0) * (1 + gstRate / 100)))} has been told the truth.
      </p>

      {/* ---- occasion ---- */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {OCCASIONS.map((o) => (
          <button
            key={o.id} onClick={() => setOccId(o.id)}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold border-2 transition-colors ${
              occId === o.id ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 bg-white text-stone-500 hover:bg-stone-50'}`}
          >{o.icon} {o.label}</button>
        ))}
      </div>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-5">
        <p className="text-sm text-stone-700 font-semibold mb-1">{occ.icon} {occ.blurb}</p>
        <ul className="text-xs text-stone-500 space-y-0.5">
          {occ.extras.map((x) => <li key={x}>• {x}</li>)}
          <li>• Minimum {occ.minGuests} guests</li>
        </ul>
      </div>

      {/* ---- the five rate lists ---- */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
        {packages.map((p) => (
          <div
            key={p.id}
            onClick={() => setPicked(p.id)}
            className={`rounded-2xl border-2 p-4 cursor-pointer transition-colors bg-white ${
              picked === p.id ? 'border-saffron-500 shadow-md' : 'border-stone-200 hover:border-stone-300'}`}
          >
            <div className="flex items-baseline gap-2 mb-1">
              <span className="text-base font-black text-ink-900">{p.name}</span>
              {picked === p.id && <Badge color="saffron">Quoting</Badge>}
              <span className="ml-auto text-xl font-black text-ink-900">₹{p.rate}</span>
            </div>
            <div className="text-[11px] text-stone-400 italic mb-2">{p.tag} · per plate + GST</div>
            <ul className="text-xs text-stone-600 space-y-0.5 mb-3">
              {(p.includes || []).map((x) => <li key={x}>• {x}</li>)}
            </ul>
            <button
              onClick={(e) => { e.stopPropagation(); setEditing(p) }}
              className="text-[11px] font-bold text-saffron-700 hover:underline"
            >✏️ Edit this package</button>
          </div>
        ))}
      </div>

      {/* ---- the quote ---- */}
      <div className="bg-white border border-stone-200 rounded-2xl p-4 mb-4">
        <h2 className="text-sm font-black text-ink-900 mb-3">Quote for {occ.label.toLowerCase()} — {pkg?.name}</h2>
        <div className="flex gap-3 flex-wrap items-end mb-4">
          <Field label="Guests">
            <input type="number" min="0" value={guests} onChange={(e) => setGuests(e.target.value)} className={inputCls + ' !w-28 text-right tabular-nums'} />
          </Field>
          <label className="flex items-center gap-2 text-sm font-semibold text-stone-700 pb-2 cursor-pointer">
            <input type="checkbox" checked={nonVeg} onChange={(e) => setNonVeg(e.target.checked)} className="w-4 h-4 accent-saffron-600" />
            Non-veg menu (+₹{NONVEG_ADDON}/plate)
          </label>
        </div>

        {q.billedMinimum && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 text-xs text-amber-800 mb-3">
            Billed for the <b>{occ.minGuests}-guest minimum</b> for a {occ.label.toLowerCase()}, not {Math.round(+guests || 0)} —
            say this at the time of booking, not on the day.
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <StatCard label="Per plate" value={inr0(q.perPlate)} sub={nonVeg ? 'incl. non-veg' : 'vegetarian'} icon="🍽️" accent="stone" />
          <StatCard label="Plates" value={q.plates} sub={q.billedMinimum ? 'minimum guarantee' : 'as booked'} icon="👥" accent="stone" />
          <StatCard label="Food total" value={inr0(q.subtotal)} sub="before GST" icon="🧾" accent="blue" />
          <StatCard label={`GST ${gstRate}%`} value={inr0(q.gst)} sub="charged extra" icon="🏛️" accent="stone" />
          <StatCard label="Payable" value={inr0(q.total)} sub={`advance ${inr0(q.advance)}`} icon="💰" accent="green" />
        </div>

        <div className="flex gap-2 flex-wrap items-end">
          <Field label="Send this quote on WhatsApp">
            <input
              value={sendTo} onChange={(e) => setSendTo(e.target.value.replace(/\D/g, '').slice(0, 10))}
              placeholder="10-digit number" className={inputCls + ' !w-44 tabular-nums'}
            />
          </Field>
          <a
            href={sendTo.length === 10 ? waLink(sendTo, quoteText(settings, occ, pkg, q, nonVeg)) : undefined}
            target="_blank" rel="noreferrer"
            className={btnPrimary + (sendTo.length === 10 ? '' : ' pointer-events-none opacity-40')}
          >💬 Send quote</a>
          <a
            href={sendTo.length === 10 ? waLink(sendTo, shareText) : undefined}
            target="_blank" rel="noreferrer"
            className={btnGhost + (sendTo.length === 10 ? '' : ' pointer-events-none opacity-40')}
          >📋 Send full rate list</a>
          <button
            onClick={() => setBooking({ occ, pkg, q, nonVeg, guests: Math.round(+guests || 0), phone: sendTo })}
            className={btnPrimary + ' ml-auto'}
          >📅 Take this booking</button>
        </div>
      </div>

      {/* ---- the diary ---- */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-2">
        <h2 className="text-lg font-black text-ink-900">📅 Party bookings</h2>
        {!!dueTotal && (
          <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
            {inr0(dueTotal)} still to collect across {upcoming.length} booking{upcoming.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      {!bookings.length ? (
        <div className="bg-white border border-stone-200 rounded-2xl">
          <Empty icon="🎉" text="No party bookings yet. Quote a package above, then tap “Take this booking”." />
        </div>
      ) : (
        <div className="bg-white border border-stone-200 rounded-2xl overflow-x-auto mb-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                <th className="py-2.5 px-4">Booking</th><th>When</th><th>Package</th>
                <th className="text-right">Quoted</th><th className="text-right">Paid</th><th className="text-right">Balance</th>
                <th>Status</th><th className="pr-4">Do</th>
              </tr>
            </thead>
            <tbody>
              {bookings.map((b) => {
                const paid = bookingPaid(b)
                const bal = bookingBalance(b)
                const dead = b.status === 'cancelled' || b.status === 'completed'
                return (
                  <tr key={b.id} className={`border-b border-stone-50 ${dead ? 'opacity-55' : ''}`}>
                    <td className="py-2.5 px-4">
                      <div className="font-bold text-ink-900">{b.name}</div>
                      <div className="text-[11px] text-stone-400">{b.code} · {b.phone}</div>
                    </td>
                    <td className="text-xs">
                      <div className="font-semibold">{b.date ? fmtDate(new Date(b.date).getTime()) : '—'}</div>
                      <div className="text-stone-400">{b.time || ''} · {occasionOf(b.occasionId).label}</div>
                    </td>
                    <td className="text-xs">
                      <div className="font-semibold">{b.packageName}</div>
                      {/* the rate is shown from the SNAPSHOT, so an old booking keeps
                          the price it was sold at even after the package is re-priced */}
                      <div className="text-stone-400">{b.plates} plates × {inr0(b.perPlate)}{b.nonVeg ? ' · non-veg' : ''}</div>
                    </td>
                    <td className="text-right font-semibold tabular-nums">{inr0(b.quote?.total || 0)}</td>
                    <td className="text-right tabular-nums text-leaf-600 font-semibold">{paid ? inr0(paid) : '—'}</td>
                    <td className={`text-right tabular-nums font-bold ${bal ? 'text-amber-700' : 'text-stone-300'}`}>{bal ? inr0(bal) : '—'}</td>
                    <td><Badge color={BOOKING_STATUS[b.status]?.[0]}>{BOOKING_STATUS[b.status]?.[1]}</Badge></td>
                    <td className="pr-4 whitespace-nowrap">
                      {!dead && (
                        <>
                          {bal > 0 && <button onClick={() => setPayFor(b)} className="text-xs font-bold text-saffron-700 hover:underline mr-2">💰 Take payment</button>}
                          <button onClick={() => setBookingStatus(b.id, 'completed')} className="text-xs font-bold text-blue-600 hover:underline mr-2">Done</button>
                          <button
                            onClick={() => { if (confirm(`Cancel booking ${b.code} for ${b.name}? Money already taken is not refunded automatically — settle that at the till.`)) setBookingStatus(b.id, 'cancelled') }}
                            className="text-xs font-bold text-stone-400 hover:text-red-600"
                          >Cancel</button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {booking && (
        <BookingModal
          draft={booking}
          settings={settings}
          onClose={() => setBooking(null)}
          onSave={(f) => {
            const b = createBooking({
              name: f.name, phone: f.phone, occasionId: booking.occ.id,
              packageId: booking.pkg.id, packageName: booking.pkg.name,
              perPlate: booking.q.perPlate, nonVeg: booking.nonVeg,
              guests: booking.guests, plates: booking.q.plates,
              date: f.date, time: f.time, notes: f.notes,
              // the snapshot: what this party costs is settled here, not re-derived
              quote: { ...booking.q },
            })
            setBooking(null)
            // straight into taking the advance — a booking with no money on it is
            // an enquiry, and the whole point of the diary is knowing which is which
            if (b) setPayFor(b)
          }}
        />
      )}

      {payFor && (
        <PaymentModal
          booking={state.bookings?.find((b) => b.id === payFor.id) || payFor}
          registerOpen={(state.shifts || []).some((x) => x.status === 'open')}
          onClose={() => setPayFor(null)}
          onTake={(amount, method) => { addBookingPayment(payFor.id, { amount, method }); setPayFor(null) }}
        />
      )}

      {editing && (
        <PackageEditor
          pkg={editing}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            update((s) => {
              const list = (s.settings.partyPackages?.length ? s.settings.partyPackages : DEFAULT_PACKAGES).map((p) => ({ ...p }))
              const i = list.findIndex((p) => p.id === next.id)
              if (i >= 0) list[i] = next
              s.settings.partyPackages = list
            })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

// one quote, in words — the same numbers the screen shows
function quoteText(settings, occ, pkg, q, nonVeg) {
  return [
    `*${settings.name || 'Our Restaurant'}*`,
    `${occ.icon} *${occ.label} — ${pkg.name} package*`,
    '',
    ...(pkg.includes || []).map((x) => `• ${x}`),
    ...(nonVeg ? ['• Non-veg menu included'] : []),
    '',
    `${q.plates} plates × ₹${q.perPlate} = ₹${q.subtotal.toLocaleString('en-IN')}`,
    `GST ${q.gstRate}% = ₹${Math.round(q.gst).toLocaleString('en-IN')}`,
    `*Total payable ₹${q.total.toLocaleString('en-IN')}*`,
    '',
    `Advance to confirm: ₹${q.advance.toLocaleString('en-IN')} (25%)`,
    ...(q.billedMinimum ? [`Note: billed on the ${occ.minGuests}-guest minimum for a ${occ.label.toLowerCase()}.`] : []),
    ...(settings.phone ? ['', `Bookings: ${settings.phone}`] : []),
  ].join('\n')
}

function PackageEditor({ pkg, onClose, onSave }) {
  const [name, setName] = useState(pkg.name)
  const [tag, setTag] = useState(pkg.tag || '')
  const [rate, setRate] = useState(pkg.rate)
  // one inclusion per line — an owner editing a menu thinks in lines, not in commas
  const [lines, setLines] = useState((pkg.includes || []).join('\n'))

  return (
    <Modal open onClose={onClose} title={`Edit “${pkg.name}” package`}>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Package name"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
        <Field label="Rate per plate (₹)"><input type="number" min="0" value={rate} onChange={(e) => setRate(e.target.value)} className={inputCls + ' text-right tabular-nums'} /></Field>
      </div>
      <Field label="Sub-line (optional)">
        <input value={tag} onChange={(e) => setTag(e.target.value)} placeholder="e.g. Most families pick this one" className={inputCls} />
      </Field>
      <Field label="What's included — one per line">
        <textarea
          value={lines} onChange={(e) => setLines(e.target.value)} rows={10}
          className={inputCls + ' font-mono !text-xs leading-relaxed'}
        />
        <span className="text-[10px] text-stone-400">This text is printed on the pamphlet exactly as typed, so write it the way you say it to a customer.</span>
      </Field>
      <div className="flex gap-2 mt-3">
        <button onClick={onClose} className={btnGhost + ' flex-1'}>Cancel</button>
        <button
          disabled={!name.trim() || !(+rate > 0)}
          onClick={() => onSave({
            ...pkg, name: name.trim(), tag: tag.trim(), rate: Math.round(+rate) || 0,
            includes: lines.split('\n').map((l) => l.trim()).filter(Boolean),
          })}
          className={btnPrimary + ' flex-1'}
        >Save package</button>
      </div>
    </Modal>
  )
}

// Take the booking. The quote is already decided by the time this opens — this
// screen only collects who, when and any special instruction, so the price cannot
// drift between the conversation and the diary entry.
function BookingModal({ draft, settings, onClose, onSave }) {
  const [f, setF] = useState({
    name: '', phone: draft.phone || '', date: todayISO(), time: '20:00', notes: '',
  })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const valid = f.name.trim() && f.phone.length === 10 && f.date

  return (
    <Modal open onClose={onClose} title={`${draft.occ.icon} Book ${draft.pkg.name} — ${draft.occ.label}`}>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-3 text-sm">
        <div className="font-bold text-ink-900">
          {draft.q.plates} plates × {inr0(draft.q.perPlate)}{draft.nonVeg ? ' (non-veg)' : ''} = {inr0(draft.q.subtotal)}
        </div>
        <div className="text-xs text-stone-500">
          + GST {draft.q.gstRate}% {inr0(draft.q.gst)} → <b className="text-ink-900">{inr0(draft.q.total)}</b> ·
          advance {inr0(draft.q.advance)}
        </div>
        {draft.q.billedMinimum && (
          <div className="text-[11px] text-amber-700 mt-1">
            Billed on the {draft.occ.minGuests}-guest minimum, not {draft.guests} — make sure they've been told.
          </div>
        )}
        <div className="text-[10px] text-stone-400 mt-1">
          This price is locked onto the booking. Re-pricing the package later won't change what they owe.
        </div>
      </div>

      <Field label="Booked by"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus placeholder="Name" /></Field>
      <Field label="Mobile">
        <input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit" className={inputCls + ' tabular-nums'} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Date"><input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} className={inputCls} /></Field>
        <Field label="Time"><input type="time" value={f.time} onChange={(e) => set('time', e.target.value)} className={inputCls} /></Field>
      </div>
      <Field label="Anything to remember?">
        <input value={f.notes} onChange={(e) => set('notes', e.target.value)} placeholder="e.g. Jain food for 4, cake at 9pm, no onion garlic" className={inputCls} />
      </Field>
      <button onClick={() => onSave(f)} disabled={!valid} className={btnPrimary + ' w-full mt-1'}>
        Save booking &amp; take advance
      </button>
      {!valid && <p className="text-[11px] text-stone-400 mt-2 text-center">Need a name, a 10-digit mobile and a date.</p>}
    </Modal>
  )
}

// Money against a booking. Cash goes into the open shift too, so the drawer still
// tallies at close — see addBookingPayment in the store.
function PaymentModal({ booking, registerOpen, onClose, onTake }) {
  const bal = bookingBalance(booking)
  const paid = bookingPaid(booking)
  const suggested = paid ? bal : Math.min(bal, booking.quote?.advance || 0)
  const [amount, setAmount] = useState(suggested)
  const [method, setMethod] = useState('cash')
  const amt = Math.max(0, Math.round(+amount || 0))

  return (
    <Modal open onClose={onClose} title={`Take payment — ${booking.code}`}>
      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-3 text-sm">
        <div className="flex justify-between"><span className="text-stone-500">Quoted</span><b className="tabular-nums">{inr0(booking.quote?.total || 0)}</b></div>
        <div className="flex justify-between"><span className="text-stone-500">Already paid</span><b className="tabular-nums text-leaf-600">{inr0(paid)}</b></div>
        <div className="flex justify-between border-t border-stone-200 mt-1 pt-1"><span className="font-semibold">Balance</span><b className="tabular-nums text-amber-700">{inr0(bal)}</b></div>
      </div>
      <Field label="Taking now (₹)">
        <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + ' text-right tabular-nums'} autoFocus />
      </Field>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card']].map(([k, l]) => (
          <button
            key={k} onClick={() => setMethod(k)}
            className={`rounded-lg py-2 font-bold text-xs border-2 ${method === k ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}
          >{l}</button>
        ))}
      </div>
      {amt > bal && (
        <p className="text-[11px] text-amber-700 mb-2">
          That's {inr0(amt - bal)} more than the balance — take it only if they're paying for something extra.
        </p>
      )}
      <button onClick={() => onTake(amt, method)} disabled={!amt} className={btnPrimary + ' w-full'}>
        Record {inr0(amt)} {method === 'cash' ? 'in cash' : `by ${method.toUpperCase()}`}
      </button>
      {/* The store only pushes a cash movement when a register is actually open. Say
          which of those is happening rather than promising the drawer will tally,
          or a cashier reconciles at close against money the till never heard about. */}
      {method === 'cash' && (
        registerOpen ? (
          <p className="text-[10px] text-stone-400 mt-2">
            Cash is added to the open register, so the drawer still tallies at close.
          </p>
        ) : (
          <p className="text-[11px] text-amber-700 mt-2 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1.5">
            <b>No register is open</b>, so this cash is recorded against the booking but not in any drawer.
            Open the register first if you want it to show up in tonight's cash count.
          </p>
        )
      )}
    </Modal>
  )
}
