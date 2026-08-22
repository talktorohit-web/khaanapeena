import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, inputCls, btnPrimary } from '../components.jsx'
import { inr, inr0, billTotals, upiLink, verifyManagerPin, payModeLabel, DISCOUNT_REASONS } from '../utils.js'
import { memberTier } from '../membership.js'
import QRCode from 'qrcode'

const PAY = [['upi', '📲 UPI'], ['cash', '💵 Cash'], ['card', '💳 Card'], ['credit', '📒 Udhaar'], ['nc', '🚫 Not chargeable']]
const SPLITTABLE = [['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card']]

/**
 * Settling a bill. Everything that has to be decided at the moment money changes
 * hands lives here, in the order a cashier actually works through it:
 * who the bill is for → service charge → discount → customer → how they paid.
 */
export default function SettleModal({ order, totals, onClose, onDone, happyHourNow, allowDiscount = true }) {
  const { state, t, update } = useStore()
  const hh = state.settings.happyHour
  const svcRate = state.settings.serviceCharge || 0
  const needsPinForDiscount = state.settings.discountNeedsPin !== false && !!state.settings.managerPin

  // Happy hour is decided by the clock, not by a person, so its percentage arrives
  // pre-filled and pre-approved — but it still sits behind the lock below, or a
  // cashier could quietly nudge "10% off" up to 40% with no manager in sight.
  const autoPct = allowDiscount && happyHourNow ? hh.discountPct : ''

  const [method, setMethod] = useState('upi')
  const [splitOn, setSplitOn] = useState(false)
  const [splits, setSplits] = useState([{ method: 'cash', amount: '' }, { method: 'upi', amount: '' }])
  const [svcWaived, setSvcWaived] = useState(!!order.svcWaived)
  // A discount is given two ways in real life — "₹100 off" and "10% off" — and a
  // cashier shouldn't have to do the arithmetic on a ₹1,847 bill. Happy hour is a
  // percentage by definition, so it opens in that mode.
  const [discMode, setDiscMode] = useState(autoPct ? 'pct' : 'amt')
  const [discAmt, setDiscAmt] = useState('')
  const [discPct, setDiscPct] = useState(autoPct)
  const [reason, setReason] = useState(autoPct ? 'happy-hour' : '')
  const [reasonNote, setReasonNote] = useState('')
  const [discPin, setDiscPin] = useState('')
  const [discUnlocked, setDiscUnlocked] = useState(false)
  const [discBy, setDiscBy] = useState(autoPct ? { name: 'Happy hour (automatic)' } : null)
  const [discErr, setDiscErr] = useState('')
  const [partyType, setPartyType] = useState(order.party?.type || 'individual')
  const [firmName, setFirmName] = useState(order.party?.name || '')
  const [gstin, setGstin] = useState(order.party?.gstin || '')
  const [ncRef, setNcRef] = useState('')
  const [ncWhy, setNcWhy] = useState('')
  const [ncPin, setNcPin] = useState('')
  const [ncBy, setNcBy] = useState(null)
  const [ncErr, setNcErr] = useState('')
  const [phone, setPhone] = useState('')
  const [custName, setCustName] = useState('')
  const [redeem, setRedeem] = useState(0)
  const [qr, setQr] = useState(null)

  const cust = state.customers.find((c) => c.phone === phone)

  // A membership rate is a CONTRACT the guest already paid for, not a favour a
  // waiter is handing out, so it applies on its own exactly the way happy hour does
  // — the manager PIN guards discretion, and there is none here. The card number
  // goes on the bill as the approver, which is a better audit trail than a name.
  const memberT = allowDiscount ? memberTier(cust) : null
  const memberPct = memberT?.discountPct || 0
  const hhPct = allowDiscount && happyHourNow ? (hh.discountPct || 0) : 0
  // both can apply on the same bill; the guest gets the better one, never both. On a
  // tie happy hour keeps it, so the member's card is not "spent" on a discount they
  // would have got anyway — and the badge below says which one actually applied
  // rather than claiming credit for the member rate either way.
  const memberApplied = memberPct > hhPct
  useEffect(() => {
    if (!memberApplied) return
    setDiscMode('pct')
    setDiscPct(memberPct)
    setReason('membership')
    setDiscBy({ name: `Membership ${cust.member.memberId}` })
  }, [cust?.id, memberApplied, memberPct])

  // A discount must NEVER survive into the next guest's bill. Billing unmounts this
  // modal today so the state would die anyway, but that is Billing's decision to
  // change — and if it ever kept the modal mounted, a stale "₹200 off" riding onto
  // the following table is money out of the till. So the reset is explicit here.
  useEffect(() => {
    setDiscMode(autoPct ? 'pct' : 'amt')
    setDiscAmt('')
    setDiscPct(autoPct)
    setReason(autoPct ? 'happy-hour' : '')
    setReasonNote('')
    setDiscPin('')
    setDiscErr('')
    setDiscUnlocked(false)
    setDiscBy(autoPct ? { name: 'Happy hour (automatic)' } : null)
  }, [order.id])

  // never let a discount exceed the bill, whichever way it was entered
  const pctVal = Math.max(0, Math.min(100, +discPct || 0))
  const discount = discMode === 'pct'
    ? Math.round((totals.sub * pctVal) / 100)
    : Math.min(totals.sub, Math.max(0, Math.round(+discAmt || 0)))

  // the live bill, recomputed as the cashier changes things
  const effTotals = billTotals({ ...order, svcWaived, payment: { discount: discount + redeem } }, state.settings)
  const payable = state.settings.gstScheme === 'regular' ? effTotals.total : Math.round(effTotals.taxable + effTotals.svc)

  useEffect(() => {
    if (method === 'upi' && !splitOn) {
      QRCode.toDataURL(upiLink(state.settings, payable, `Bill ${order.id.slice(-4)}`), { width: 200, margin: 1 })
        .then(setQr).catch(() => setQr(null))
    }
  }, [method, payable, splitOn])

  // ---- split payment ----
  const splitRows = splits.map((s) => ({ ...s, amount: +s.amount || 0 }))
  const splitTotal = splitRows.reduce((s, r) => s + r.amount, 0)
  const splitLeft = payable - splitTotal
  const setSplit = (i, patch) => setSplits((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  const addSplit = () => setSplits((rows) => [...rows, { method: 'card', amount: '' }])
  const rmSplit = (i) => setSplits((rows) => (rows.length > 2 ? rows.filter((_, j) => j !== i) : rows))
  // typing one side should fill the other — that's the whole point of "half and half"
  const fillRest = (i) => setSplit(i, { amount: String(Math.max(0, payable - splitRows.filter((_, j) => j !== i).reduce((s, r) => s + r.amount, 0))) })
  // a read-back in words, because "✓ adds up" only proves the arithmetic — it doesn't
  // tell the cashier which modes they are about to record against this bill
  const splitSummary = splitRows.filter((r) => r.amount > 0)
    .map((r) => `${payModeLabel(r.method).replace(/^\S+\s/, '')} ${inr0(r.amount)}`).join(' + ')

  const unlockDiscount = () => {
    const m = verifyManagerPin(state, discPin)
    // whoever unlocks now owns the number, even if happy hour had put one there
    if (m) { setDiscBy(m); setDiscUnlocked(true); setDiscErr(''); setDiscPin('') }
    else { setDiscErr('Wrong manager PIN'); setDiscPin('') }
  }
  const unlockNc = () => {
    const m = verifyManagerPin(state, ncPin)
    if (m) { setNcBy(m); setNcErr(''); setNcPin('') }
    else { setNcErr('Wrong manager PIN'); setNcPin('') }
  }

  // the PIN guards the KEYPAD, not just a number already typed — a cashier can't
  // key ₹500 off and then decide whether to fetch a manager. A role that isn't
  // allowed discounts at all stays shut whatever PIN is known.
  const discLocked = needsPinForDiscount && !discUnlocked
  const discEditable = allowDiscount && !discLocked
  // belt and braces: nothing should reach a discount without an approver now, but
  // this is the till, so the close button still checks before the money moves
  const discountUnapproved = discount > 0 && needsPinForDiscount && !discBy
  const needsReason = discount > 0 && !reason
  const creditOk = !!cust || phone.length === 10
  const ncOk = method !== 'nc' || (ncRef.trim() && ncWhy.trim().length >= 5 && ncBy)
  const splitOk = !splitOn || Math.abs(splitLeft) < 1
  const gstinOk = partyType !== 'firm' || /^[0-9A-Z]{15}$/.test(gstin.toUpperCase())
  const blocked = needsReason || discountUnapproved || !ncOk || !splitOk || !gstinOk || (method === 'credit' && !creditOk)

  const finish = () => {
    let customerId = cust?.id || null
    if (!cust && phone.length === 10) {
      customerId = 'cu' + Math.random().toString(36).slice(2, 8)
      update((s) => s.customers.push({ id: customerId, name: custName || 'Guest', phone, birthday: null, points: 0, visits: 0, totalSpend: 0, lastVisit: null, tags: [] }))
    }
    if (svcWaived !== !!order.svcWaived) update((s) => { const o = s.orders.find((x) => x.id === order.id); if (o) o.svcWaived = svcWaived || undefined })

    const total = discount + redeem
    const finalReason = discount > 0 ? reason : (redeem > 0 ? 'loyalty' : null)
    onDone({
      method: splitOn ? 'split' : method,
      discount: total, customerId, redeemPoints: redeem,
      // kept so the bill and the discount report can say "10% off" rather than
      // leaving anyone to reverse-engineer it from the rupees
      discountPct: discMode === 'pct' && pctVal > 0 ? pctVal : null,
      discountReason: total > 0 ? finalReason : null,
      discountNote: finalReason === 'other' ? reasonNote.trim() : null,
      splits: splitOn ? splitRows.filter((r) => r.amount > 0) : null,
      nc: method === 'nc' ? { reference: ncRef.trim(), explanation: ncWhy.trim(), by: ncBy?.name } : null,
      party: partyType === 'firm' ? { type: 'firm', name: firmName.trim(), gstin: gstin.toUpperCase().trim() } : null,
    })
  }

  return (
    <Modal open onClose={onClose} title={`${t('settle')} — ${inr0(payable)}`} wide>
      {/* WHO THE BILL IS FOR — a firm needs its GSTIN to claim input credit */}
      <div className="mb-4">
        <span className="text-xs font-semibold text-stone-500 block mb-1.5">Bill to</span>
        <div className="grid grid-cols-2 gap-2 mb-2">
          {[['individual', '🙋 Individual'], ['firm', '🏢 Firm / company']].map(([k, l]) => (
            <button key={k} onClick={() => setPartyType(k)} className={`rounded-xl py-2.5 font-bold text-sm border-2 ${partyType === k ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>{l}</button>
          ))}
        </div>
        {partyType === 'firm' && (
          <div className="grid sm:grid-cols-2 gap-2">
            <input value={firmName} onChange={(e) => setFirmName(e.target.value)} placeholder="Firm / company name" className={inputCls} />
            <div>
              <input value={gstin} onChange={(e) => setGstin(e.target.value.toUpperCase().slice(0, 15))} placeholder="GSTIN (15 characters)" className={inputCls + (gstin && !gstinOk ? ' !border-red-300' : '')} />
              <span className="text-[11px] text-stone-400">Printed on the invoice so they can claim input credit.{gstin && !gstinOk ? ' A GSTIN is exactly 15 characters.' : ''}</span>
            </div>
          </div>
        )}
      </div>

      {/* SERVICE CHARGE — the guest is allowed to say no */}
      {svcRate > 0 && (
        <div className={`rounded-xl px-3 py-2.5 mb-4 border ${svcWaived ? 'bg-stone-50 border-stone-200' : 'bg-blue-50 border-blue-200'}`}>
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-bold text-ink-900">Service charge {svcRate}% · {svcWaived ? '—' : inr0(effTotals.svc)}</div>
              <div className="text-[11px] text-stone-500 leading-snug">
                {svcWaived
                  ? 'Waived — the guest declined it. It will not appear on the bill.'
                  : 'Not a tax and not compulsory. If the guest declines, waive it here.'}
              </div>
            </div>
            <button
              onClick={() => setSvcWaived((v) => !v)}
              className={`shrink-0 text-xs font-bold rounded-lg px-3 py-2 border ${svcWaived ? 'border-stone-300 text-stone-600 bg-white' : 'border-blue-300 text-blue-700 bg-white'}`}
            >{svcWaived ? '↩ Add it back' : 'Guest declined — waive'}</button>
          </div>
        </div>
      )}

      {/* DISCOUNT — flat rupees or a percentage of the bill, locked until approved */}
      <div className="mb-3">
        <span className="text-xs font-semibold text-stone-500 block mb-1">{t('discount')}</span>
        {allowDiscount && discLocked && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-2">
            <div className="text-xs font-bold text-amber-800 mb-1.5">🔒 A manager has to approve {autoPct ? 'any change to this discount' : 'this discount'}</div>
            <div className="flex gap-2">
              {/* no autoFocus — unlike the NC panel this one is on screen the moment
                  the modal opens, and most bills are settled without a discount */}
              <input
                type="password" inputMode="numeric" value={discPin}
                onChange={(e) => { setDiscPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setDiscErr('') }}
                onKeyDown={(e) => e.key === 'Enter' && unlockDiscount()}
                placeholder="Manager PIN" className={inputCls + ' text-center tracking-[0.3em] font-mono'}
              />
              <button onClick={unlockDiscount} disabled={discPin.length < 4} className="bg-ink-900 text-white text-xs font-bold rounded-xl px-4 disabled:opacity-40">Unlock</button>
            </div>
            {discErr && <p className="text-[11px] text-red-600 mt-1">{discErr}</p>}
            <p className="text-[10px] text-stone-500 mt-1">Only the Manager PIN, or a staff member with a manager/admin role, can approve. The name is recorded on the bill.</p>
          </div>
        )}
        <div className="flex gap-2">
          <div className="flex rounded-xl border border-stone-200 overflow-hidden shrink-0">
            {[['amt', '₹ Amount'], ['pct', '% of bill']].map(([k, l]) => (
              <button
                key={k} disabled={!discEditable}
                onClick={() => { setDiscMode(k); setDiscErr('') }}
                className={`px-3 py-2 text-xs font-bold transition-colors ${discMode === k ? 'bg-ink-900 text-white' : 'bg-white text-stone-500 hover:bg-stone-50'} ${discEditable ? '' : 'opacity-50 cursor-not-allowed'}`}
              >{l}</button>
            ))}
          </div>
          {discMode === 'amt' ? (
            <input
              type="number" min="0" value={discAmt} disabled={!discEditable} placeholder="0"
              onChange={(e) => { setDiscAmt(e.target.value); setDiscErr('') }}
              className={inputCls + ' text-right tabular-nums' + (discEditable ? '' : ' opacity-50 cursor-not-allowed')}
            />
          ) : (
            <input
              type="number" min="0" max="100" value={discPct} disabled={!discEditable} placeholder="0"
              onChange={(e) => { setDiscPct(e.target.value); setDiscErr('') }}
              className={inputCls + ' text-right tabular-nums' + (discEditable ? '' : ' opacity-50 cursor-not-allowed')}
            />
          )}
        </div>
        {!allowDiscount && <span className="text-[11px] text-stone-400">Discounts aren't allowed for your role</span>}
        {allowDiscount && discMode === 'pct' && discount > 0 && (
          <span className="text-[11px] text-stone-500">{pctVal}% of {inr0(totals.sub)} = <b>{inr0(discount)}</b> off</span>
        )}
        {allowDiscount && discMode === 'amt' && discount > 0 && totals.sub > 0 && (
          <span className="text-[11px] text-stone-500">{inr0(discount)} off — that's {((discount / totals.sub) * 100).toFixed(1)}% of the bill</span>
        )}
        {allowDiscount && happyHourNow && <span className="text-[11px] text-amber-600 block">Happy hour −{hh.discountPct}% auto-applied</span>}
        {memberT && (
          <span className="text-[11px] text-leaf-600 block font-semibold">
            {memberT.icon} {memberT.name} member {cust.member.memberId} — {memberApplied
              ? `${memberPct}% member rate applied`
              : `${memberPct}% member rate, but happy hour −${hhPct}% is as good, so that applied instead`}
          </span>
        )}
      </div>

      {discount > 0 && discBy && (
        <p className="text-[11px] text-leaf-600 font-semibold mb-2">✓ Discount approved by {discBy.name}</p>
      )}

      {discount > 0 && (
        <div className="mb-3">
          <span className="text-xs font-semibold text-stone-500 block mb-1">Why this discount? <span className="text-red-500">*</span></span>
          <div className="flex flex-wrap gap-1.5">
            {DISCOUNT_REASONS.map(([k, label]) => (
              <button key={k} onClick={() => setReason(k)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 border ${reason === k ? 'bg-ink-900 text-white border-ink-900' : 'bg-white border-stone-200 text-stone-600'}`}>{label}</button>
            ))}
          </div>
          {reason === 'other' && (
            <input value={reasonNote} maxLength={60} onChange={(e) => setReasonNote(e.target.value)} placeholder="Say why in a few words" className={inputCls + ' mt-2 text-sm'} />
          )}
          {!reason && <span className="text-[11px] text-red-500 block mt-1">Pick a reason to close this bill.</span>}
        </div>
      )}

      {/* CUSTOMER */}
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

      {/* HOW THEY PAID */}
      <div className="border-t border-stone-100 pt-3 mt-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-stone-500">How did they pay?</span>
          <label className="flex items-center gap-1.5 text-xs font-semibold text-stone-600">
            <input type="checkbox" checked={splitOn} onChange={(e) => setSplitOn(e.target.checked)} className="w-3.5 h-3.5 accent-saffron-600" />
            Split across modes
          </label>
        </div>

        {!splitOn ? (
          <div className="grid grid-cols-5 gap-2 mb-3">
            {PAY.map(([m, label]) => (
              <button key={m} onClick={() => setMethod(m)} className={`rounded-xl py-3 font-bold text-[11px] border-2 ${method === m ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>{label}</button>
            ))}
          </div>
        ) : (
          <div className="mb-3">
            <p className="text-[11px] text-stone-500 mb-2">Enter what came in through each mode. Tap <b>rest</b> to fill the remainder.</p>
            {/* chips, not a <select>: the same pattern as the single-mode grid above,
                and a native dropdown on the Android WebView shows the cashier nothing
                once it closes — the chosen mode has to stay on screen */}
            <div className="space-y-2">
              {splits.map((s, i) => (
                <div key={i} className="rounded-xl border border-stone-200 p-2">
                  <div className="grid grid-cols-3 gap-1">
                    {SPLITTABLE.map(([k, l]) => (
                      <button
                        key={k} onClick={() => setSplit(i, { method: k })}
                        className={`rounded-lg py-1.5 font-bold text-[11px] border-2 ${s.method === k ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}
                      >{l}</button>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <input type="number" min="0" value={s.amount} onChange={(e) => setSplit(i, { amount: e.target.value })} placeholder="0" className={inputCls + ' !py-2 !w-28 text-right tabular-nums'} />
                    <button onClick={() => fillRest(i)} className="text-[11px] font-bold text-saffron-700 px-1 shrink-0">rest</button>
                    <button onClick={() => rmSplit(i)} className="text-stone-300 hover:text-red-500 px-1 shrink-0 ml-auto">✕</button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex items-center justify-between mt-2">
              <button onClick={addSplit} className="text-xs font-bold text-saffron-700">＋ Add another mode</button>
              <span className={`text-xs font-bold ${Math.abs(splitLeft) < 1 ? 'text-leaf-600' : 'text-red-600'}`}>
                {Math.abs(splitLeft) < 1 ? '✓ Adds up to ' + inr0(payable) : (splitLeft > 0 ? `${inr0(splitLeft)} still to allocate` : `${inr0(-splitLeft)} over the bill`)}
              </span>
            </div>
            {splitSummary && <p className="text-[11px] text-stone-600 mt-1">Recording <b>{splitSummary}</b> against this bill.</p>}
          </div>
        )}

        {method === 'upi' && !splitOn && qr && (
          <div className="flex flex-col items-center mb-3 bg-stone-50 rounded-xl p-3">
            <img src={qr} alt="UPI QR" className="w-36 h-36" />
            <div className="text-xs text-stone-500 mt-1">Scan to pay · {state.settings.upiId} · {inr0(payable)}</div>
          </div>
        )}

        {method === 'credit' && !splitOn && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-800">
            <b>Udhaar — money not received yet.</b> The bill closes and keeps its invoice number; the amount stays
            outstanding against this customer until you record the payment in <b>Reports → Udhaar</b>.
            {!creditOk && <div className="mt-1 font-bold">Add the customer's mobile above — you can't chase a debt with no name against it.</div>}
          </div>
        )}

        {/* NOT CHARGEABLE */}
        {method === 'nc' && !splitOn && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3">
            <div className="text-xs font-bold text-red-800 mb-1">🚫 Not chargeable — nothing will be collected</div>
            <p className="text-[11px] text-red-700 mb-2">
              The food went out free. The bill is still numbered and kept so the {inr0(payable)} written off is auditable.
              A reference and a full explanation are required.
            </p>
            <input value={ncRef} maxLength={40} onChange={(e) => setNcRef(e.target.value)} placeholder="Reference — e.g. owner's guest, staff meal, promo #12" className={inputCls + ' mb-2'} />
            <textarea value={ncWhy} maxLength={200} rows={2} onChange={(e) => setNcWhy(e.target.value)} placeholder="Explain in full who authorised it and why (at least a few words)" className={inputCls + ' mb-2'} />
            {!ncBy ? (
              <div className="flex gap-2">
                <input
                  type="password" inputMode="numeric" value={ncPin}
                  onChange={(e) => { setNcPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setNcErr('') }}
                  onKeyDown={(e) => e.key === 'Enter' && unlockNc()}
                  placeholder="Manager PIN" className={inputCls + ' text-center tracking-[0.3em] font-mono'}
                />
                <button onClick={unlockNc} disabled={ncPin.length < 4} className="bg-ink-900 text-white text-xs font-bold rounded-xl px-4 disabled:opacity-40">Approve</button>
              </div>
            ) : (
              <p className="text-[11px] text-leaf-600 font-semibold">✓ Approved by {ncBy.name}</p>
            )}
            {ncErr && <p className="text-[11px] text-red-600 mt-1">{ncErr}</p>}
          </div>
        )}
      </div>

      {/* SUMMARY */}
      <div className="bg-stone-50 rounded-xl p-3 mb-3 text-sm">
        <Line l="Sub-total" v={inr(effTotals.sub)} />
        {effTotals.discount > 0 && <Line l={`Discount${discMode === 'pct' && pctVal ? ` (${pctVal}%)` : ''}`} v={'−' + inr(effTotals.discount)} red />}
        {svcRate > 0 && (
          svcWaived
            ? <Line l={`Service charge ${svcRate}% (optional)`} v="waived" dim />
            : <Line l={`Service charge ${svcRate}% (optional)`} v={inr(effTotals.svc)} dim />
        )}
        {state.settings.gstScheme === 'regular' && <>
          <Line l={`CGST ${effTotals.gstRate / 2}%`} v={inr(effTotals.cgst)} dim />
          <Line l={`SGST ${effTotals.gstRate / 2}%`} v={inr(effTotals.sgst)} dim />
        </>}
        <div className="flex justify-between font-black text-base text-ink-900 pt-1.5 mt-1 border-t border-stone-200">
          <span>{method === 'nc' && !splitOn ? 'Written off' : 'To collect'}</span>
          <span>{inr0(payable)}</span>
        </div>
      </div>

      <button onClick={finish} disabled={blocked} className={btnPrimary + ' w-full'}>
        {method === 'nc' && !splitOn ? `🚫 Close as not chargeable (${inr0(payable)})`
          : method === 'credit' && !splitOn ? `📒 Put ${inr0(payable)} on udhaar & Close Bill`
            : `✓ Collect ${inr0(payable)} & Close Bill`}
      </button>
      {partyType === 'firm' && gstinOk && <p className="text-[11px] text-stone-400 mt-2 text-center">Invoice will carry {firmName || 'the firm'} · {gstin}</p>}
    </Modal>
  )
}

const Line = ({ l, v, dim, red }) => (
  <div className={`flex justify-between ${dim ? 'text-stone-400 text-xs' : 'text-stone-600'}`}>
    <span>{l}</span><span className={red ? 'text-red-600' : ''}>{v}</span>
  </div>
)
