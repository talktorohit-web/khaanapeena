import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, Empty, StatCard, Field, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { inr0, inr, shiftTotals, fmtTime, fmtDate } from '../utils.js'
import { printShiftReport } from '../print.js'

export default function Register() {
  const { state, t, openShift, addCashMovement, closeShift } = useStore()
  const shifts = state.shifts || []
  const open = shifts.find((s) => s.status === 'open')
  const history = shifts.filter((s) => s.status === 'closed').sort((a, b) => b.closedAt - a.closedAt)

  const [moveModal, setMoveModal] = useState(null) // 'in' | 'out'
  const [closeOpen, setCloseOpen] = useState(false)
  const [viewZ, setViewZ] = useState(null)

  const tot = useMemo(() => (open ? shiftTotals(open, state.orders) : null), [open, state.orders])

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">💵 Cash Register</h1>
        {open && <Badge color="green">● OPEN · since {fmtTime(open.openedAt)}{open.openedBy ? ` · ${open.openedBy}` : ''}</Badge>}
      </div>

      {!open ? (
        <OpenCard staff={state.staff} onOpen={(float, by) => openShift(float, by)} />
      ) : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <StatCard label="Gross sales (shift)" value={inr0(tot.gross)} sub={`${tot.bills} bills`} icon="💰" accent="saffron" />
            <StatCard label="Cash collected" value={inr0(tot.cash)} icon="💵" accent="green" />
            <StatCard label="Digital (UPI+Card)" value={inr0(tot.upi + tot.card)} icon="📲" accent="blue" />
            <StatCard label="Expected in drawer" value={inr0(tot.expectedCash)} sub="open float + cash − payouts" icon="🧮" accent="purple" />
          </div>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <div className="bg-white rounded-2xl p-5 border border-stone-100">
              <h3 className="font-bold text-ink-900 mb-3">Sales by mode</h3>
              <Row l="💵 Cash" v={inr0(tot.cash)} />
              <Row l="📲 UPI" v={inr0(tot.upi)} />
              <Row l="💳 Card" v={inr0(tot.card)} />
              <Row l="🛵 Online" v={inr0(tot.online)} />
              <div className="border-t border-stone-100 mt-1 pt-1"><Row l="Gross" v={inr0(tot.gross)} bold /></div>
              <Row l="Discounts given" v={inr0(tot.discounts)} muted />
            </div>
            <div className="bg-white rounded-2xl p-5 border border-stone-100">
              <h3 className="font-bold text-ink-900 mb-3">Cash drawer</h3>
              <Row l="Opening float" v={inr0(tot.openingFloat)} />
              <Row l="+ Cash sales" v={inr0(tot.cash)} />
              <Row l="+ Cash in (pay-ins)" v={inr0(tot.cashIn)} />
              <Row l="− Cash out (payouts)" v={'−' + inr0(tot.cashOut)} />
              <div className="border-t border-stone-100 mt-1 pt-1"><Row l="Expected in drawer" v={inr0(tot.expectedCash)} bold /></div>
              <div className="flex gap-2 mt-3">
                <button onClick={() => setMoveModal('in')} className={btnGhost + ' flex-1'}>＋ Cash In</button>
                <button onClick={() => setMoveModal('out')} className={btnGhost + ' flex-1'}>－ Cash Out</button>
              </div>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            <button onClick={() => printShiftReport(open, tot, state.settings, true).then((r) => { if (!r.ok && r.reason !== 'browser') alert('Print failed: ' + r.reason) })} className={btnGhost}>🧾 Print X-report (peek)</button>
            <button onClick={() => setCloseOpen(true)} className={btnPrimary}>🔒 Close register (Z-report)</button>
          </div>

          {(open.cashMovements || []).length > 0 && (
            <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
              <h3 className="font-bold text-ink-900 mb-2">Cash movements this shift</h3>
              {[...open.cashMovements].reverse().map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm py-1.5 border-b border-stone-50 last:border-0">
                  <span>{m.type === 'in' ? '➕' : '➖'} {m.reason || (m.type === 'in' ? 'Cash in' : 'Cash out')} <span className="text-xs text-stone-400">· {fmtTime(m.at)}{m.by ? ` · ${m.by}` : ''}</span></span>
                  <b className={m.type === 'in' ? 'text-leaf-600' : 'text-red-600'}>{m.type === 'in' ? '+' : '−'}{inr0(m.amount)}</b>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* past Z-reports */}
      <div className="bg-white rounded-2xl border border-stone-100 mt-2">
        <div className="p-4 pb-2"><h3 className="font-bold text-ink-900">Closed shifts (Z-reports)</h3></div>
        {history.length === 0 ? (
          <Empty icon="🗒️" text="No closed shifts yet" />
        ) : (
          <div className="divide-y divide-stone-50">
            {history.map((s) => (
              <button key={s.id} onClick={() => setViewZ(s)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 text-left">
                <div>
                  <div className="font-semibold text-sm text-ink-900">{fmtDate(s.openedAt)} · {fmtTime(s.openedAt)}–{fmtTime(s.closedAt)}</div>
                  <div className="text-xs text-stone-400">{s.openedBy || 'Cashier'} · {s.z?.bills || 0} bills · gross {inr0(s.z?.gross)}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-ink-900 text-sm">{inr0(s.z?.gross)}</div>
                  <Badge color={(s.z?.variance || 0) === 0 ? 'green' : Math.abs(s.z?.variance) <= 50 ? 'amber' : 'red'}>
                    {(s.z?.variance || 0) === 0 ? 'Balanced' : (s.z?.variance > 0 ? 'Over ' : 'Short ') + inr0(Math.abs(s.z?.variance || 0))}
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {moveModal && <MoveModal type={moveModal} staff={state.staff} onClose={() => setMoveModal(null)} onSave={(amt, reason, by) => { addCashMovement(moveModal, amt, reason, by); setMoveModal(null) }} />}
      {closeOpen && open && <CloseModal shift={open} tot={tot} settings={state.settings} staff={state.staff} onClose={() => setCloseOpen(false)} onCommit={(counted, by) => closeShift(counted, by, tot)} />}
      {viewZ && <ZReportModal shift={viewZ} settings={state.settings} onClose={() => setViewZ(null)} />}
    </div>
  )
}

function OpenCard({ staff, onOpen }) {
  const [float, setFloat] = useState('')
  const [by, setBy] = useState('')
  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-6 max-w-md mx-auto text-center">
      <div className="text-4xl mb-2">💵</div>
      <h2 className="font-black text-lg text-ink-900">Open the register</h2>
      <p className="text-sm text-stone-500 mb-4">Count the cash in the drawer to start the shift. All sales &amp; payouts are tracked until you close it with a Z-report.</p>
      <Field label="Opening cash float (₹)"><input type="number" min="0" value={float} onChange={(e) => setFloat(e.target.value)} placeholder="2000" className={inputCls + ' text-center text-xl font-bold'} autoFocus /></Field>
      <Field label="Cashier (optional)">
        <select value={by} onChange={(e) => setBy(e.target.value)} className={inputCls}>
          <option value="">Select cashier…</option>
          {(staff || []).map((s) => <option key={s.id} value={s.name}>{s.name} ({s.role})</option>)}
        </select>
      </Field>
      <button onClick={() => onOpen(float, by)} disabled={float === '' || +float < 0} className={btnPrimary + ' w-full mt-2'}>Open register</button>
    </div>
  )
}

function MoveModal({ type, staff, onClose, onSave }) {
  const [amt, setAmt] = useState('')
  const [reason, setReason] = useState('')
  const [by, setBy] = useState('')
  return (
    <Modal open onClose={onClose} title={type === 'in' ? '➕ Cash In (pay-in)' : '➖ Cash Out (payout)'}>
      <Field label="Amount (₹)"><input type="number" min="0" value={amt} onChange={(e) => setAmt(e.target.value)} className={inputCls} autoFocus /></Field>
      <Field label="Reason"><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'in' ? 'e.g. Change added' : 'e.g. Vegetable purchase, petty cash'} className={inputCls} /></Field>
      <Field label="By (optional)">
        <select value={by} onChange={(e) => setBy(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {(staff || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </Field>
      <button onClick={() => onSave(amt, reason, by)} disabled={!(+amt > 0)} className={btnPrimary + ' w-full'}>Record</button>
    </Modal>
  )
}

function CloseModal({ shift, tot, settings, staff, onClose, onCommit }) {
  const [counted, setCounted] = useState('')
  const [by, setBy] = useState(shift.openedBy || '')
  const [done, setDone] = useState(false)
  const variance = (+counted || 0) - tot.expectedCash
  const finalTot = { ...tot, countedCash: +counted || 0, variance }

  const commit = () => { onCommit(counted, by); setDone(true) }

  if (done) {
    return (
      <Modal open onClose={onClose} title="✅ Register closed — Z-report">
        <ZBody shift={{ ...shift, closedAt: Date.now(), closedBy: by }} z={finalTot} />
        <div className="flex gap-2 mt-4">
          <button onClick={() => printShiftReport({ ...shift, closedAt: Date.now(), closedBy: by }, finalTot, settings, false).then((r) => { if (!r.ok && r.reason !== 'browser') alert('Print failed: ' + r.reason) })} className={btnGhost + ' flex-1'}>🖨️ Print Z-report</button>
          <button onClick={onClose} className={btnPrimary + ' flex-1'}>Done</button>
        </div>
      </Modal>
    )
  }
  return (
    <Modal open onClose={onClose} title="🔒 Close register">
      <div className="bg-stone-50 rounded-xl p-3 mb-3 text-sm">
        <Row l="Expected cash in drawer" v={inr(tot.expectedCash)} bold />
      </div>
      <Field label="Count the drawer — actual cash (₹)"><input type="number" min="0" value={counted} onChange={(e) => setCounted(e.target.value)} className={inputCls + ' text-center text-xl font-bold'} autoFocus /></Field>
      {counted !== '' && (
        <div className={`rounded-xl p-3 mb-3 text-sm font-bold ${variance === 0 ? 'bg-green-50 text-green-700' : Math.abs(variance) <= 50 ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'}`}>
          {variance === 0 ? '✓ Drawer balanced' : variance > 0 ? `▲ Over by ${inr(variance)} (extra cash)` : `▼ Short by ${inr(Math.abs(variance))}`}
        </div>
      )}
      <Field label="Closed by">
        <select value={by} onChange={(e) => setBy(e.target.value)} className={inputCls}>
          <option value="">—</option>
          {(staff || []).map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </Field>
      <button onClick={commit} disabled={counted === ''} className={btnPrimary + ' w-full'}>Confirm &amp; close shift</button>
    </Modal>
  )
}

function ZReportModal({ shift, settings, onClose }) {
  return (
    <Modal open onClose={onClose} title="Z-report">
      <ZBody shift={shift} z={shift.z || {}} />
      <button onClick={() => printShiftReport(shift, shift.z || {}, settings, false).then((r) => { if (!r.ok && r.reason !== 'browser') alert('Print failed: ' + r.reason) })} className={btnGhost + ' w-full mt-4'}>🖨️ Print Z-report</button>
    </Modal>
  )
}

function ZBody({ shift, z }) {
  return (
    <div className="text-sm">
      <div className="text-xs text-stone-400 mb-2">{new Date(shift.openedAt).toLocaleString('en-IN')} → {shift.closedAt ? new Date(shift.closedAt).toLocaleString('en-IN') : 'now'}{shift.closedBy ? ` · ${shift.closedBy}` : ''}</div>
      <div className="font-bold text-ink-900 mb-1">Sales</div>
      <Row l="Cash" v={inr0(z.cash)} /><Row l="UPI" v={inr0(z.upi)} /><Row l="Card" v={inr0(z.card)} /><Row l="Online" v={inr0(z.online)} />
      <Row l="Gross" v={inr0(z.gross)} bold /><Row l="Bills" v={String(z.bills || 0)} muted /><Row l="Discounts" v={inr0(z.discounts)} muted />
      <div className="font-bold text-ink-900 mt-3 mb-1">Cash drawer</div>
      <Row l="Opening float" v={inr0(z.openingFloat)} /><Row l="+ Cash sales" v={inr0(z.cash)} />
      <Row l="+ Cash in" v={inr0(z.cashIn)} /><Row l="− Cash out" v={'−' + inr0(z.cashOut)} />
      <Row l="Expected" v={inr0(z.expectedCash)} bold /><Row l="Counted" v={inr0(z.countedCash)} />
      <div className={`mt-1 font-black ${(z.variance || 0) === 0 ? 'text-green-600' : (z.variance || 0) > 0 ? 'text-amber-600' : 'text-red-600'}`}>
        <Row l={(z.variance || 0) === 0 ? 'Balanced' : (z.variance > 0 ? 'Over' : 'Short')} v={inr0(Math.abs(z.variance || 0))} />
      </div>
    </div>
  )
}

const Row = ({ l, v, bold, muted }) => (
  <div className={`flex justify-between py-0.5 ${muted ? 'text-stone-400 text-xs' : bold ? 'text-ink-900 font-bold' : 'text-stone-600'}`}><span>{l}</span><span>{v}</span></div>
)
