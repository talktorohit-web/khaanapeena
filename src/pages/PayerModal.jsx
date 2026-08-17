import React, { useEffect, useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Field, inputCls, btnPrimary, btnGhost, Badge } from '../components.jsx'
import { inr0, billTotals, upiLink, buildPayRequest, buildPayReceipt, waLink, fmtTime } from '../utils.js'
import QRCode from 'qrcode'

/**
 * "Send the bill to whoever is paying."
 *
 * A host sends guests to the restaurant and settles it himself from elsewhere.
 * Two moments, one screen:
 *   BILL     — before settling: send him the amount and a tappable UPI link.
 *   RECEIPT  — after settling: send him proof the money landed.
 *
 * WhatsApp only carries text, so the message has to stand on its own; the QR
 * stays here on the till for anyone who'd rather scan it off the screen.
 */
export default function PayerModal({ order, mode = 'bill', onClose }) {
  const { state, setOrderPayer, markPayerSent } = useStore()
  const [name, setName] = useState(order.payer?.name || '')
  const [phone, setPhone] = useState(order.payer?.phone || '')
  const [qr, setQr] = useState(null)

  const totals = billTotals(order, state.settings)
  const payable = state.settings.gstScheme === 'composition'
    ? Math.round(totals.taxable + totals.svc)
    : totals.total

  const isReceipt = mode === 'receipt'
  const text = isReceipt
    ? buildPayReceipt(order, state.settings, state.tables)
    : buildPayRequest(order, state.settings, totals, state.tables)

  useEffect(() => {
    if (isReceipt) return
    QRCode.toDataURL(upiLink(state.settings, payable, `${state.settings.name} · bill`), { width: 240, margin: 1 })
      .then(setQr).catch(() => setQr(null))
  }, [payable, isReceipt])

  const ready = phone.length === 10

  const send = () => {
    setOrderPayer(order.id, { name, phone })
    markPayerSent(order.id, isReceipt ? 'receipt' : 'request')
    window.open(waLink(phone, text), '_blank', 'noopener')
  }

  const copy = () => { navigator.clipboard?.writeText(text) }

  return (
    <Modal open onClose={onClose} title={isReceipt ? '📤 Send the receipt' : '📤 Send this bill to whoever is paying'} wide>
      {!isReceipt && (
        <p className="text-xs text-stone-500 mb-3">
          For when someone sends guests in and settles it himself — a host, an office, a family member.
          He gets the itemised bill and a link that opens his UPI app with <b>{inr0(payable)}</b> already filled in.
        </p>
      )}
      {isReceipt && (
        <p className="text-xs text-stone-500 mb-3">
          Bill <b>#{order.billNo}</b> is settled. Send {order.payer?.name || 'the payer'} confirmation that the money landed.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Their mobile number">
          <input
            value={phone} autoFocus inputMode="numeric"
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
            placeholder="10-digit mobile" className={inputCls}
          />
        </Field>
        <Field label="Their name (optional)">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mr Sharma" className={inputCls} />
        </Field>
      </div>

      {order.payer?.requestedAt && (
        <p className="text-[11px] text-stone-500 -mt-1 mb-2">
          <Badge color="green">bill sent</Badge> <span className="ml-1">{fmtTime(order.payer.requestedAt)}</span>
          {order.payer.receiptSentAt && <> · <Badge color="blue">receipt sent</Badge> <span className="ml-1">{fmtTime(order.payer.receiptSentAt)}</span></>}
        </p>
      )}

      <div className="grid md:grid-cols-[1fr_auto] gap-4 items-start mt-1">
        <div>
          <span className="text-xs font-semibold text-stone-500 block mb-1">What they'll receive</span>
          <pre className="bg-stone-50 border border-stone-200 rounded-xl p-3 text-[11px] leading-relaxed whitespace-pre-wrap max-h-56 overflow-y-auto font-sans text-stone-700">{text}</pre>
        </div>
        {!isReceipt && qr && (
          <div className="text-center">
            <img src={qr} alt="Pay QR" className="w-36 h-36 mx-auto rounded-lg border border-stone-200 bg-white p-1" />
            <div className="text-[10px] text-stone-400 mt-1 max-w-[9rem]">Or let them scan this off your screen</div>
          </div>
        )}
      </div>

      <div className="flex gap-2 mt-4">
        <button onClick={copy} className={btnGhost}>📋 Copy text</button>
        <button onClick={send} disabled={!ready} className={btnPrimary + ' flex-1'}>
          💬 {isReceipt ? 'Send receipt on WhatsApp' : `Send bill (${inr0(payable)}) on WhatsApp`}
        </button>
      </div>
      {!ready && <p className="text-[11px] text-stone-400 mt-2 text-center">Enter a 10-digit mobile number to send.</p>}
      {!isReceipt && (
        <p className="text-[11px] text-stone-400 mt-2 text-center">
          Settle the bill as usual once the money arrives — you'll be offered the receipt to send back.
        </p>
      )}
    </Modal>
  )
}
