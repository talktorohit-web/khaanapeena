import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Badge, Empty, Modal, inputCls, btnPrimary } from '../components.jsx'
import { inr0, billTotals, tableName, fmtTime, verifyManagerPin } from '../utils.js'
import { Card, DataTable, ExportBtn, download, paidIn, slug, amt, channelOf, channelLabel, coversOf } from './shared.jsx'
import { discountReasonLabel } from '../utils.js'

// The bill register: every settled bill, searchable, with the full line detail one
// tap away. This is the screen an owner opens when a customer calls back about a
// bill, or when the day's cash doesn't tally.
const REFUND_REASONS = [
  'Food quality complaint', 'Wrong order served', 'Too long a wait',
  'Guest changed their mind', 'Billed twice', 'Billed the wrong amount', 'Other',
]

/**
 * Refunding a settled bill. Manager-authorised, because it hands real money back.
 * The invoice keeps its number and date — a GST invoice is credited, never deleted
 * — and refunded food isn't resellable, so no stock comes back.
 */
function RefundModal({ order, state, onClose, onDone }) {
  const paidAmt = order.payment?.amount || 0
  const [full, setFull] = useState(true)
  const [amount, setAmount] = useState(String(paidAmt))
  const [reason, setReason] = useState('')
  const [method, setMethod] = useState(order.payment?.method === 'credit' ? 'cash' : (order.payment?.method || 'cash'))
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')

  const amt = full ? paidAmt : Math.max(0, Math.min(paidAmt, +amount || 0))
  const ready = amt > 0 && !!reason

  const submit = () => {
    if (!verifyManagerPin(state, pin)) { setErr('Wrong manager PIN'); setPin(''); return }
    onDone({ amount: amt, reason, method, by: verifyManagerPin(state, pin).name })
  }

  return (
    <Modal open onClose={onClose} title={`↩ Refund bill #${order.billNo}`}>
      <div className="bg-stone-50 rounded-xl p-3 mb-3 text-xs text-stone-600">
        <div className="flex justify-between"><span>Settled on</span><b>{new Date(order.paidAt).toLocaleString('en-IN')}</b></div>
        <div className="flex justify-between"><span>Paid by</span><b>{String(order.payment?.method || 'cash').toUpperCase()}</b></div>
        <div className="flex justify-between"><span>Bill amount</span><b className="text-ink-900">{inr0(paidAmt)}</b></div>
        <div className="mt-1 text-stone-500">{(order.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ')}</div>
      </div>

      <div className="flex gap-2 mb-3">
        {[[true, 'Full refund'], [false, 'Part refund']].map(([v, l]) => (
          <button key={String(v)} onClick={() => setFull(v)} className={`flex-1 rounded-xl py-2.5 font-bold text-sm border-2 ${full === v ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>{l}</button>
        ))}
      </div>
      {!full && (
        <label className="block mb-3">
          <span className="text-xs font-semibold text-stone-500 block mb-1">How much to give back (max {inr0(paidAmt)})</span>
          <input type="number" min="0" max={paidAmt} value={amount} onChange={(e) => setAmount(e.target.value)} className={inputCls + ' text-right tabular-nums'} />
        </label>
      )}

      <span className="text-xs font-semibold text-stone-500 block mb-1">Why? <span className="text-red-500">*</span></span>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {REFUND_REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={`text-[11px] font-semibold rounded-full px-2.5 py-1.5 border ${reason === r ? 'bg-ink-900 text-white border-ink-900' : 'bg-white border-stone-200 text-stone-600'}`}>{r}</button>
        ))}
      </div>

      <span className="text-xs font-semibold text-stone-500 block mb-1">Money given back as</span>
      <div className="grid grid-cols-3 gap-2 mb-3">
        {[['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card']].map(([k, l]) => (
          <button key={k} onClick={() => setMethod(k)} className={`rounded-xl py-2.5 font-bold text-xs border-2 ${method === k ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>{l}</button>
        ))}
      </div>

      <label className="block mb-1">
        <span className="text-xs font-semibold text-stone-500 block mb-1">Manager PIN</span>
        <input
          type="password" inputMode="numeric" value={pin}
          onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setErr('') }}
          onKeyDown={(e) => e.key === 'Enter' && ready && submit()}
          placeholder="••••" className={inputCls + ' text-center text-xl tracking-[0.4em] font-mono'}
        />
      </label>
      {err && <p className="text-xs text-red-600 mb-2">{err}</p>}

      <button onClick={submit} disabled={!ready || pin.length < 4} className={btnPrimary + ' w-full mt-2'}>
        ↩ Refund {inr0(amt)}
      </button>
      <p className="text-[10px] text-stone-400 mt-2 text-center">The bill keeps invoice #{order.billNo} and its original date. Stock is not returned.</p>
    </Modal>
  )
}

// A busy month is thousands of bills, and a cheap Android till chokes rendering
// them all. Show a page at a time — search and the mode filter narrow first, so
// the bill anyone is actually hunting for is nearly always in the first page.
const PAGE = 250

export default function Bills({ state, range }) {
  const { refundBill } = useStore()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState('all')
  const [open, setOpen] = useState(null)
  const [limit, setLimit] = useState(PAGE)
  const [refunding, setRefunding] = useState(null)

  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const cancelled = useMemo(
    () => (state.orders || []).filter((o) => o.status === 'cancelled' && (o.kotAt || o.createdAt) >= range.from && (o.kotAt || o.createdAt) < range.to),
    [state.orders, range]
  )

  const custName = (id) => (state.customers || []).find((c) => c.id === id)?.name || ''

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return paid
      .filter((o) => mode === 'all' || (o.payment?.method || 'cash') === mode)
      .filter((o) => {
        if (!needle) return true
        const hay = [
          o.billNo, o.kotNo, o.tableId, tableName(state.tables, o.tableId), o.type,
          custName(o.customerId), o.settledBy, o.takenBy,
          ...(o.items || []).map((li) => li.name),
        ].join(' ').toLowerCase()
        return hay.includes(needle)
      })
      .sort((a, b) => b.paidAt - a.paidAt)
  }, [paid, q, mode, state.tables, state.customers])

  const visible = rows.slice(0, limit)
  const shownGross = rows.reduce((s, o) => s + amt(o), 0)
  const shownDiscount = rows.reduce((s, o) => s + (o.payment?.discount || 0), 0)
  const shownTax = rows.reduce((s, o) => {
    const bt = billTotals(o, state.settings)
    return s + (state.settings.gstScheme === 'composition' ? 0 : bt.cgst + bt.sgst)
  }, 0)

  const exportCsv = () => {
    const out = [['BILL REGISTER — ' + range.label + (q ? ` (search: ${q})` : '')], [],
      ['Bill No', 'Date', 'Time', 'KOT', 'Type', 'Table', 'Guests', 'Customer', 'Items', 'Taken by', 'Settled by', 'Sub ₹', 'Discount ₹', 'Discount reason', 'Discount note', 'Taxable ₹', 'CGST ₹', 'SGST ₹', 'Mode', 'Total ₹', '₹ per guest']]
    ;[...rows].reverse().forEach((o) => {
      const bt = billTotals(o, state.settings)
      const comp = state.settings.gstScheme === 'composition'
      const g = coversOf(o)
      out.push([
        o.billNo, new Date(o.paidAt).toLocaleDateString('en-IN'), new Date(o.paidAt).toLocaleTimeString('en-IN'),
        o.kotNo || '', o.type, tableName(state.tables, o.tableId) || '', g || '', custName(o.customerId),
        (o.items || []).map((i) => `${i.qty}x ${i.name}${i.notes ? ` (${i.notes})` : ''}`).join('; '),
        o.takenBy || '', o.settledBy || '',
        Math.round(bt.sub), bt.discount,
        bt.discount > 0 && o.payment?.discountReason ? discountReasonLabel(o.payment.discountReason) : '',
        o.payment?.discountNote || '',
        Math.round(bt.taxable),
        comp ? 0 : Math.round(bt.cgst), comp ? 0 : Math.round(bt.sgst),
        o.payment?.method || '', amt(o), g ? Math.round(amt(o) / g) : '',
      ])
    })
    out.push([], ['TOTAL', '', '', '', '', '', '', '', '', '', '', Math.round(shownDiscount), '', '', '', '', Math.round(shownGross)])
    if (cancelled.length) {
      out.push([], ['CANCELLED ORDERS'], ['KOT', 'Date', 'Type', 'Table', 'Items'])
      cancelled.forEach((o) => out.push([o.kotNo || '', new Date(o.kotAt || o.createdAt).toLocaleString('en-IN'), o.type, o.tableId || '', (o.items || []).map((i) => `${i.qty}x ${i.name}`).join('; ')]))
    }
    download(`khaanapeena-bill-register-${slug(range)}.csv`, out)
  }

  if (!paid.length) {
    return <Card><Empty icon="🧾" text={`No settled bills in ${range.label.toLowerCase()}.`} /></Card>
  }

  return (
    <>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Bills in this period" value={paid.length} sub={range.label} icon="🧾" accent="saffron" />
        <StatCard label="Total collected" value={inr0(paid.reduce((s, o) => s + amt(o), 0))} icon="💰" accent="green" />
        <StatCard label="Discounts given" value={inr0(paid.reduce((s, o) => s + (o.payment?.discount || 0), 0))} icon="🏷️" accent="red" />
        <StatCard label="Cancelled orders" value={cancelled.length} sub={cancelled.length ? 'never billed' : 'none 🎉'} icon="🚫" accent={cancelled.length ? 'red' : 'green'} />
      </div>

      <Card
        flush
        title="Bill register"
        sub="Tap any bill to see what was on it"
        right={<ExportBtn onClick={exportCsv} />}
      >
        <div className="px-5 pb-3 flex flex-wrap items-center gap-2">
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setLimit(PAGE) }}
            placeholder="🔍 Search bill no, table, dish, customer or staff…"
            className="flex-1 min-w-[220px] border border-stone-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-saffron-300"
          />
          {[['all', 'All modes'], ['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card'], ['online', '🛵 Online']].map(([k, l]) => (
            <button key={k} onClick={() => { setMode(k); setLimit(PAGE) }} className={`px-3 py-1.5 rounded-full text-xs font-bold ${mode === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
          ))}
        </div>

        {rows.length !== paid.length && (
          <p className="px-5 pb-2 text-xs text-stone-400">Matching {rows.length} of {paid.length} bills · {inr0(shownGross)}</p>
        )}

        <DataTable
          scroll
          rows={visible}
          footLabel={`Total of all ${rows.length} matching`}
          keyOf={(o) => o.id}
          empty="No bill matches that search"
          onRow={(o) => setOpen(open === o.id ? null : o.id)}
          cols={[
            { h: 'Bill', cell: (o) => (
              <div>
                <div className="font-black text-ink-900">#{o.billNo}</div>
                {o.kotNo && <div className="text-[11px] text-stone-400">KOT {o.kotNo}</div>}
              </div>
            ) },
            { h: 'When', cell: (o) => (
              <div>
                <div>{new Date(o.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                <div className="text-[11px] text-stone-400">{fmtTime(o.paidAt)}</div>
              </div>
            ) },
            { h: 'Type', cell: (o) => (
              <div>
                <div className="text-xs">{channelLabel(channelOf(o))}</div>
                {o.tableId && <div className="text-[11px] text-stone-400">🪑 {tableName(state.tables, o.tableId)}{coversOf(o) ? ` · 👥 ${coversOf(o)}` : ''}</div>}
              </div>
            ) },
            { h: 'Items', cell: (o) => (
              <div className="max-w-[240px]">
                <div className="truncate text-stone-600">{(o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ') || '—'}</div>
                {open === o.id && (
                  <div className="mt-2 space-y-0.5 bg-stone-50 rounded-lg p-2">
                    {(o.items || []).map((li, i) => (
                      <div key={i}>
                        <div className="flex justify-between text-xs">
                          <span>{li.qty}× {li.name}</span>
                          <span className="tabular-nums">{inr0(li.price * li.qty)}</span>
                        </div>
                        {li.notes && <div className="text-[11px] text-saffron-700">↳ {li.notes}</div>}
                      </div>
                    ))}
                    {(() => {
                      const bt = billTotals(o, state.settings)
                      const comp = state.settings.gstScheme === 'composition'
                      return (
                        <div className="border-t border-stone-200 mt-1 pt-1 text-[11px] text-stone-500 space-y-0.5">
                          <div className="flex justify-between"><span>Sub-total</span><span className="tabular-nums">{inr0(bt.sub)}</span></div>
                          {bt.discount > 0 && (
                            <div className="flex justify-between text-red-600">
                              <span>Discount{o.payment?.discountReason ? ` · ${discountReasonLabel(o.payment.discountReason)}${o.payment.discountNote ? ` (${o.payment.discountNote})` : ''}` : ''}</span>
                              <span className="tabular-nums">−{inr0(bt.discount)}</span>
                            </div>
                          )}
                          {!comp && <div className="flex justify-between"><span>CGST + SGST</span><span className="tabular-nums">{inr0(bt.cgst + bt.sgst)}</span></div>}
                          {bt.svc > 0 && <div className="flex justify-between"><span>Service charge</span><span className="tabular-nums">{inr0(bt.svc)}</span></div>}
                          {(o.takenBy || o.settledBy) && (
                            <div className="flex justify-between text-stone-400">
                              <span>{o.takenBy ? `Order by ${o.takenBy}` : ''}</span>
                              <span>{o.settledBy ? `Settled by ${o.settledBy}` : ''}</span>
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            ) },
            { h: 'Guest', cell: (o) => custName(o.customerId) || <span className="text-stone-300">—</span> },
            { h: 'Discount', num: true, cell: (o) => o.payment?.discount ? <span className="text-red-600">−{inr0(o.payment.discount)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(shownDiscount) },
            { h: 'GST', num: true, cell: (o) => {
              const bt = billTotals(o, state.settings)
              return state.settings.gstScheme === 'composition' ? <span className="text-stone-300">—</span> : inr0(bt.cgst + bt.sgst)
            }, foot: () => inr0(shownTax) },
            { h: 'Mode', cell: (o) => <Badge color={{ cash: 'green', upi: 'blue', card: 'purple', online: 'saffron' }[o.payment?.method || 'cash'] || 'stone'}>{(o.payment?.method || 'cash').toUpperCase()}</Badge> },
            { h: 'Total', num: true, cell: (o) => (
              <div>
                <b className="text-ink-900">{inr0(amt(o))}</b>
                {o.refund && <div className="text-[11px] text-red-600">−{inr0(o.refund.amount)} refunded</div>}
              </div>
            ), foot: () => inr0(shownGross) },
            { h: '', cell: (o) => o.refund
              ? <Badge color="red">returned</Badge>
              : (
                <button
                  onClick={(e) => { e.stopPropagation(); setRefunding(o) }}
                  className="text-xs font-bold text-stone-500 hover:text-red-600 border border-stone-200 rounded-lg px-2 py-1 kp-noprint whitespace-nowrap"
                >↩ Refund</button>
              ) },
          ]}
        />
        {rows.length > visible.length && (
          <div className="px-5 py-4 flex items-center justify-center gap-3">
            <span className="text-xs text-stone-400">Showing {visible.length} of {rows.length} bills</span>
            <button onClick={() => setLimit((l) => l + PAGE)} className="border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2 text-xs">Show {Math.min(PAGE, rows.length - visible.length)} more</button>
            <button onClick={() => setLimit(rows.length)} className="text-xs font-bold text-saffron-700">Show all</button>
          </div>
        )}
      </Card>

      {refunding && (
        <RefundModal
          order={refunding}
          state={state}
          onClose={() => setRefunding(null)}
          onDone={(payload) => { refundBill(refunding.id, payload); setRefunding(null) }}
        />
      )}

      {cancelled.length > 0 && (
        <Card flush title="🚫 Cancelled orders" sub="Punched but never billed — food may still have been cooked">
          <DataTable
            rows={cancelled.sort((a, b) => (b.kotAt || b.createdAt) - (a.kotAt || a.createdAt))}
            keyOf={(o) => o.id}
            cols={[
              { h: 'KOT', cell: (o) => <span className="font-bold">{o.kotNo ? '#' + o.kotNo : '—'}</span> },
              { h: 'When', cell: (o) => new Date(o.kotAt || o.createdAt).toLocaleString('en-IN') },
              { h: 'Type', cell: (o) => channelLabel(channelOf(o)) },
              { h: 'Table', cell: (o) => o.tableId ? tableName(state.tables, o.tableId) : '—' },
              { h: 'Items', cell: (o) => (o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ') || '—' },
              { h: 'Value', num: true, cell: (o) => <span className="text-red-600 font-bold">{inr0((o.items || []).reduce((s, i) => s + i.price * i.qty, 0))}</span> },
            ]}
          />
        </Card>
      )}
    </>
  )
}
