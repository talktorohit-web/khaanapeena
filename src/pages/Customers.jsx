import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Badge, inputCls, StatCard, Modal, Field, btnPrimary, btnGhost } from '../components.jsx'
import { inr0, fmtDate, uid, waLink } from '../utils.js'
import { TIERS, tierOf, nextMemberId, isActive, daysLeft, memberTier, explainBenefits, membershipText, VALIDITY_DAYS } from '../membership.js'

export default function Customers() {
  const { state, t, update } = useStore()
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('all')
  const [addOpen, setAddOpen] = useState(false)
  const [memberFor, setMemberFor] = useState(null)

  const now = Date.now()
  const month = new Date().getMonth()
  const enrich = state.customers.map((c) => ({
    ...c,
    vip: c.totalSpend >= 5000,
    atRisk: c.lastVisit && (now - c.lastVisit) / 864e5 > 14,
    bday: c.birthday && new Date(c.birthday).getMonth() === month,
  }))
  const list = enrich
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
    .filter((c) => seg === 'all' || (seg === 'vip' && c.vip) || (seg === 'risk' && c.atRisk) || (seg === 'bday' && c.bday))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  const waMsg = (c) => {
    const msg = c.bday
      ? `Happy Birthday ${c.name.split(' ')[0]}! 🎂 ${state.settings.name} par aapke liye special 20% off is week. Aa jaiye!`
      : c.atRisk
      ? `${c.name.split(' ')[0]} ji, bahut din ho gaye! 😊 ${state.settings.name} mein aapka favourite khana yaad kar raha hai — is week 15% off!`
      : `Namaste ${c.name.split(' ')[0]} ji! ${state.settings.name} mein naya menu try karein — aapke ${c.points} loyalty points ready hain!`
    return `https://wa.me/91${c.phone}?text=${encodeURIComponent(msg)}`
  }

  const addCustomer = (f) => {
    update((s) => {
      s.customers = s.customers || []
      s.customers.push({ id: uid('cu'), name: f.name.trim(), phone: f.phone, birthday: f.birthday || null, points: 0, visits: 0, totalSpend: 0, lastVisit: null, tags: [] })
    })
    setAddOpen(false)
  }
  const dupPhone = (phone) => (state.customers || []).some((c) => c.phone === phone)

  // Enrolling stamps the card number and the expiry once, here. Working the expiry
  // out later from "joined + a year" would drift the day the validity period is ever
  // changed, and a member whose card quietly expires early is a refund argument.
  const enrol = (customer, tierId) => {
    update((s) => {
      const c = s.customers.find((x) => x.id === customer.id)
      if (!c) return
      const t = tierOf(tierId)
      const now = Date.now()
      // renewing an existing member keeps their number — the card in their wallet
      // has it printed on it
      const memberId = c.member?.memberId || nextMemberId(s)
      c.member = {
        memberId, tier: tierId, fee: t.fee,
        since: c.member?.since || now,
        // a renewal made before the old card lapses extends it rather than
        // throwing away the days already paid for
        expiresAt: Math.max(now, c.member?.expiresAt || 0) + VALIDITY_DAYS * 864e5,
        cancelled: false,
      }
    })
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-black text-ink-900">{t('customers')}</h1>
        <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ Add customer</button>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total customers" value={state.customers.length} icon="👥" accent="blue" />
        <StatCard label="VIP (₹5k+ spend)" value={enrich.filter((c) => c.vip).length} icon="⭐" accent="saffron" />
        <StatCard label="At-risk (14d+ away)" value={enrich.filter((c) => c.atRisk).length} icon="⚠️" accent="red" />
        <StatCard label="Birthdays this month" value={enrich.filter((c) => c.bday).length} icon="🎂" accent="purple" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone…" className={inputCls + ' max-w-xs'} />
        {[['all', 'All'], ['vip', '⭐ VIP'], ['risk', '⚠️ At-risk'], ['bday', '🎂 Birthday']].map(([k, l]) => (
          <button key={k} onClick={() => setSeg(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${seg === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="py-2.5 px-4">Customer</th><th>Member</th><th>Phone</th><th>{t('points')}</th><th>Visits</th><th>Spend</th><th>Last visit</th><th className="pr-4">Engage</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-stone-50">
                <td className="py-2.5 px-4 font-semibold">
                  {c.name} {c.vip && <Badge color="saffron">VIP</Badge>} {c.bday && '🎂'} {c.atRisk && <Badge color="red">at-risk</Badge>}
                </td>
                <td>
                  {c.member && !c.member.cancelled ? (
                    <button onClick={() => setMemberFor(c)} className="text-left">
                      <div className="font-bold text-ink-900 text-xs">{tierOf(c.member.tier)?.icon} {c.member.memberId}</div>
                      <div className={`text-[10px] ${isActive(c.member) ? 'text-stone-400' : 'text-red-500 font-semibold'}`}>
                        {isActive(c.member)
                          ? `${tierOf(c.member.tier)?.name} · ${daysLeft(c.member)}d left`
                          : 'expired — renew'}
                      </div>
                    </button>
                  ) : (
                    <button onClick={() => setMemberFor(c)} className="text-[11px] font-bold text-saffron-700 hover:underline">＋ Make member</button>
                  )}
                </td>
                <td className="text-stone-500">{c.phone}</td>
                <td className="font-bold text-saffron-700">{c.points}</td>
                <td>{c.visits}</td>
                <td className="font-semibold">{inr0(c.totalSpend)}</td>
                <td className="text-stone-400 text-xs">{c.lastVisit ? fmtDate(c.lastVisit) : '—'}</td>
                <td className="pr-4">
                  <a href={waMsg(c)} target="_blank" rel="noreferrer" className="text-xs font-bold text-green-600 hover:underline">💬 WhatsApp</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="py-10 text-center text-stone-400 text-sm">No customers match</div>}
      </div>

      {addOpen && <AddCustomerModal onClose={() => setAddOpen(false)} onSave={addCustomer} dupPhone={dupPhone} />}
      {memberFor && (
        <MembershipModal
          customer={state.customers.find((c) => c.id === memberFor.id) || memberFor}
          settings={state.settings}
          onEnrol={enrol}
          onClose={() => setMemberFor(null)}
        />
      )}
    </div>
  )
}

/**
 * Sell, explain and issue a membership.
 *
 * The pitch is worked out from what this customer already spends, so the number the
 * owner reads out is theirs and not a brochure claim — and when the card genuinely
 * wouldn't pay for itself yet, it says so. A membership sold to someone it doesn't
 * suit is a refund and a lost regular, not a sale.
 */
function MembershipModal({ customer, settings, onEnrol, onClose }) {
  const current = customer.member
  const live = isActive(current)
  const [tierId, setTierId] = useState(current?.tier || 'gold')
  // their real average, so the sums are about them; editable because the owner often
  // knows more than the till does
  const [spend, setSpend] = useState(() => (customer.visits ? Math.round(customer.totalSpend / Math.max(1, customer.visits / 2)) : 2000))
  const tier = tierOf(tierId)
  const pitch = explainBenefits(tier, { monthlySpend: spend })

  return (
    <Modal open onClose={onClose} wide title={`Membership — ${customer.name}`}>
      {current && (
        <div className={`rounded-xl border p-3 mb-3 ${live ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <div className="font-black text-ink-900">{tierOf(current.tier)?.icon} {current.memberId} · {tierOf(current.tier)?.name}</div>
          <div className="text-xs text-stone-600">
            {live
              ? `Active — ${daysLeft(current)} days left, valid till ${fmtDate(current.expiresAt)}`
              : `Expired on ${fmtDate(current.expiresAt)}. Renewing keeps the same card number.`}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-3 gap-2 mb-3">
        {TIERS.map((t) => (
          <button
            key={t.id} onClick={() => setTierId(t.id)}
            className={`rounded-xl border-2 p-3 text-left transition-colors ${tierId === t.id ? 'border-saffron-500 bg-saffron-50' : 'border-stone-200 hover:bg-stone-50'}`}
          >
            <div className="font-black text-ink-900">{t.icon} {t.name}</div>
            <div className="text-lg font-black text-ink-900">₹{t.fee}<span className="text-[10px] font-semibold text-stone-400">/year</span></div>
            <div className="text-[11px] text-stone-500">{t.discountPct}% off · {t.pointsX}× points</div>
          </button>
        ))}
      </div>

      <div className="bg-stone-50 border border-stone-200 rounded-xl p-3 mb-3">
        <div className="text-xs font-bold text-stone-500 mb-1.5">What {customer.name.split(' ')[0]} gets</div>
        <ul className="text-sm text-stone-700 space-y-1">
          {tier.benefits.map((b) => <li key={b}>✓ {b}</li>)}
        </ul>
      </div>

      <div className="bg-white border border-stone-200 rounded-xl p-3 mb-3">
        <div className="flex items-end gap-3 flex-wrap mb-2">
          <Field label="They spend about (₹/month)">
            <input type="number" min="0" value={spend} onChange={(e) => setSpend(e.target.value)} className={inputCls + ' !w-32 text-right tabular-nums'} />
          </Field>
          <div className="text-xs text-stone-400 pb-2">worked out from their own visits — change it if you know better</div>
        </div>
        <p className="text-sm font-semibold text-ink-900">{pitch.verdict}</p>
        <p className="text-[11px] text-stone-400 mt-1">
          Card ₹{tier.fee} · saves ~{inr0(pitch.saved)} a year at {tier.discountPct}% · pays for itself at
          about {inr0(pitch.breakEven)} of spending.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        <a
          href={waLink(customer.phone, membershipText(settings, customer, tier))}
          target="_blank" rel="noreferrer" className={btnGhost}
        >💬 Send the benefits</a>
        <button onClick={() => { onEnrol(customer, tierId); onClose() }} className={btnPrimary + ' flex-1'}>
          {live ? `Renew as ${tier.name} — ₹${tier.fee}` : `Issue ${tier.name} card — ₹${tier.fee}`}
        </button>
      </div>
      <p className="text-[10px] text-stone-400 mt-2">
        Collect the ₹{tier.fee} at the till as a normal sale. The card number is issued when you tap above, and the
        member's {tier.discountPct}% comes off their bills automatically until {fmtDate(Date.now() + VALIDITY_DAYS * 864e5)}.
      </p>
    </Modal>
  )
}

function AddCustomerModal({ onClose, onSave, dupPhone }) {
  const [f, setF] = useState({ name: '', phone: '', birthday: '' })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))
  const dup = f.phone.length === 10 && dupPhone(f.phone)
  const valid = f.name.trim() && f.phone.length === 10 && !dup
  return (
    <Modal open onClose={onClose} title="Add customer">
      <Field label="Name"><input value={f.name} onChange={(e) => set('name', e.target.value)} className={inputCls} autoFocus /></Field>
      <Field label="Mobile"><input value={f.phone} onChange={(e) => set('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit" className={inputCls} /></Field>
      <Field label="Birthday (optional — for birthday offers)"><input type="date" value={f.birthday} onChange={(e) => set('birthday', e.target.value)} className={inputCls} /></Field>
      {dup && <p className="text-[11px] text-red-600 mb-2">A customer with this mobile already exists.</p>}
      <button onClick={() => onSave(f)} disabled={!valid} className={btnPrimary + ' w-full'}>Save customer</button>
    </Modal>
  )
}
