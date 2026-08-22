import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, inputCls, btnPrimary, btnGhost, Badge, StatCard } from '../components.jsx'
import { inr0, waLink } from '../utils.js'
import { OCCASIONS, DEFAULT_PACKAGES, NONVEG_ADDON, quote, packagesOf, occasionOf } from '../party.js'
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
  const { state, update } = useStore()
  const settings = state.settings
  const packages = packagesOf(settings)
  const gstRate = settings.gstRate ?? 5

  const [occId, setOccId] = useState('kitty')
  const [guests, setGuests] = useState(25)
  const [nonVeg, setNonVeg] = useState(false)
  const [picked, setPicked] = useState(packages[1]?.id || packages[0]?.id)
  const [editing, setEditing] = useState(null)
  const [sendTo, setSendTo] = useState('')

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
        </div>
      </div>

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
