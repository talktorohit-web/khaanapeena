import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Badge, Modal, btnPrimary } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, tableName } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download } from './shared.jsx'

// Ageing buckets an Indian shopkeeper actually thinks in
const BUCKETS = [
  { key: 'new', label: '0–7 days', max: 7, tone: 'green' },
  { key: 'mid', label: '8–30 days', max: 30, tone: 'amber' },
  { key: 'old', label: '31–60 days', max: 60, tone: 'red' },
  { key: 'bad', label: '60+ days', max: Infinity, tone: 'red' },
]
const bucketOf = (days) => BUCKETS.find((b) => days <= b.max) || BUCKETS[3]

/**
 * Udhaar / credit ledger. A bill settled on credit is closed and numbered like any
 * other — the food went out, the invoice exists, the money didn't arrive. It stays
 * here until someone records the collection, which is the only reason this screen
 * needs a write action while every other report stays read-only.
 *
 * Deliberately NOT range-filtered: a debt from four months ago is exactly the one
 * you most need to see, and a date filter would hide it.
 */
export default function Udhaar() {
  const { state, collectDue } = useStore()
  const [collecting, setCollecting] = useState(null)
  const [showPaid, setShowPaid] = useState(false)

  const custOf = (id) => (state.customers || []).find((c) => c.id === id)

  const credits = useMemo(
    () => (state.orders || [])
      .filter((o) => o.status === 'paid' && o.payment?.method === 'credit')
      .map((o) => {
        const c = custOf(o.customerId)
        const outstanding = (o.payment?.amount || 0) - (o.refund?.amount || 0)
        return {
          o, outstanding,
          days: Math.floor((Date.now() - o.paidAt) / 864e5),
          name: c?.name || 'Unknown', phone: c?.phone || '',
          paid: !!o.creditPaid,
        }
      })
      .sort((a, b) => b.o.paidAt - a.o.paidAt),
    [state.orders, state.customers]
  )

  const open = credits.filter((r) => !r.paid && r.outstanding > 0)
  const settled = credits.filter((r) => r.paid)
  const totalDue = open.reduce((s, r) => s + r.outstanding, 0)
  const collected = settled.reduce((s, r) => s + r.outstanding, 0)

  // one row per customer — that's who you actually chase
  const byCustomer = useMemo(() => {
    const m = {}
    open.forEach((r) => {
      const k = r.o.customerId || 'unknown'
      const c = (m[k] = m[k] || { id: k, name: r.name, phone: r.phone, bills: 0, due: 0, oldest: 0 })
      c.bills++; c.due += r.outstanding; c.oldest = Math.max(c.oldest, r.days)
    })
    return Object.values(m).sort((a, b) => b.due - a.due)
  }, [open])

  const ageing = BUCKETS.map((b) => ({
    ...b,
    bills: open.filter((r) => bucketOf(r.days).key === b.key).length,
    value: open.filter((r) => bucketOf(r.days).key === b.key).reduce((s, r) => s + r.outstanding, 0),
  }))

  const exportCsv = () => {
    const out = [['UDHAAR / CREDIT LEDGER'],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Total outstanding ₹', Math.round(totalDue)], ['Open bills', open.length],
      [], ['BY CUSTOMER'], ['Customer', 'Phone', 'Bills', 'Outstanding ₹', 'Oldest (days)']]
    byCustomer.forEach((c) => out.push([c.name, c.phone, c.bills, Math.round(c.due), c.oldest]))
    out.push([], ['AGEING'], ['Bucket', 'Bills', 'Value ₹'])
    ageing.forEach((b) => out.push([b.label, b.bills, Math.round(b.value)]))
    out.push([], ['OPEN BILLS'], ['Bill No', 'Date', 'Customer', 'Phone', 'Table', 'Items', 'Outstanding ₹', 'Days old'])
    open.forEach((r) => out.push([
      r.o.billNo, new Date(r.o.paidAt).toLocaleDateString('en-IN'), r.name, r.phone,
      tableName(state.tables, r.o.tableId) || '',
      (r.o.items || []).map((i) => `${i.qty}x ${i.name}`).join('; '),
      Math.round(r.outstanding), r.days,
    ]))
    if (settled.length) {
      out.push([], ['ALREADY COLLECTED'], ['Bill No', 'Bill date', 'Customer', 'Amount ₹', 'Collected on', 'By', 'Mode'])
      settled.forEach((r) => out.push([
        r.o.billNo, new Date(r.o.paidAt).toLocaleDateString('en-IN'), r.name, Math.round(r.outstanding),
        new Date(r.o.creditPaid.at).toLocaleDateString('en-IN'), r.o.creditPaid.by, r.o.creditPaid.method,
      ]))
    }
    download('khaanapeena-udhaar-ledger.csv', out)
  }

  if (!credits.length) {
    return (
      <Card title="📒 Udhaar / credit" sub="Nothing on credit yet">
        <div className="text-sm text-stone-600 leading-relaxed max-w-2xl space-y-2">
          <p>
            When a regular says <i>"likh lo, baad mein de dunga"</i>, settle the bill with the
            <b> 📒 Udhaar</b> option in Billing instead of cash. The bill closes and keeps its
            invoice number, but the amount stays outstanding here against that customer.
          </p>
          <p>A customer's mobile number is required for an udhaar bill — you can't chase a debt with no name against it.</p>
        </div>
      </Card>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Money owed to you" value={inr0(totalDue)} sub={`${open.length} unpaid bill${open.length === 1 ? '' : 's'}`} icon="📒" accent={totalDue ? 'red' : 'green'} />
        <StatCard label="People who owe" value={byCustomer.length} sub={byCustomer[0] ? `most: ${byCustomer[0].name}` : ''} icon="👥" accent="saffron" />
        <StatCard label="Oldest debt" value={open.length ? `${Math.max(...open.map((r) => r.days))} days` : '—'} sub="since the bill was closed" icon="⏳" accent={open.some((r) => r.days > 30) ? 'red' : 'green'} />
        <StatCard label="Recovered so far" value={inr0(collected)} sub={`${settled.length} bill${settled.length === 1 ? '' : 's'} collected`} icon="✅" accent="green" />
      </div>

      {open.some((r) => r.days > 30) && (
        <Note tone="red">
          <b>{inr0(open.filter((r) => r.days > 30).reduce((s, r) => s + r.outstanding, 0))} has been owed for more than a month.</b>{' '}
          Udhaar that crosses 30 days rarely comes back on its own — a WhatsApp with the bill number usually does more than another reminder in person.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0 kp-card" flush title="Who owes you" sub="Chase the top of this list first">
          <DataTable
            rows={byCustomer}
            keyOf={(c) => c.id}
            cols={[
              { h: 'Customer', cell: (c) => <div><span className="font-semibold text-ink-900">{c.name}</span><div className="text-[11px] text-stone-400">{c.phone || 'no number'}</div></div>, foot: () => 'Total' },
              { h: 'Bills', num: true, cell: (c) => c.bills, foot: () => open.length },
              { h: 'Outstanding', num: true, cell: (c) => <b className="text-red-600">{inr0(c.due)}</b>, foot: () => inr0(totalDue) },
              { h: 'Oldest', num: true, cell: (c) => <Badge color={bucketOf(c.oldest).tone}>{c.oldest}d</Badge> },
              { h: '', cell: (c) => c.phone
                ? <a
                    className="text-xs font-bold text-leaf-600 kp-noprint"
                    href={`https://wa.me/91${c.phone}?text=${encodeURIComponent(`Namaste ${c.name}, aapka ${state.settings.name} par ₹${Math.round(c.due)} ka udhaar baaki hai (${c.bills} bill). Kripya jab suvidha ho, chuka dijiyega. Dhanyavaad 🙏`)}`}
                    target="_blank" rel="noreferrer"
                  >💬 Remind</a>
                : null },
            ]}
          />
        </Card>
        <Card className="!mb-0 kp-card" title="How old the debt is" sub="Every bucket past a month is money at risk">
          <HBars data={ageing.filter((b) => b.value > 0).map((b) => ({ label: b.label, value: Math.round(b.value) }))} color="#dc2626" />
          <div className="grid grid-cols-4 gap-2 mt-3">
            {ageing.map((b) => (
              <div key={b.key} className="text-center">
                <div className="text-[10px] text-stone-400">{b.label}</div>
                <div className={`text-sm font-bold ${b.value ? (b.tone === 'red' ? 'text-red-600' : b.tone === 'amber' ? 'text-amber-600' : 'text-leaf-600') : 'text-stone-300'}`}>{inr0(b.value)}</div>
                <div className="text-[10px] text-stone-400">{b.bills} bill{b.bills === 1 ? '' : 's'}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card
        flush
        className="kp-card"
        title="Unpaid bills"
        sub="Tap Collect when the money comes in — the bill keeps its original invoice number and date"
      >
        <DataTable
          scroll
          rows={open}
          keyOf={(r) => r.o.id}
          empty="Nothing outstanding 🎉"
          cols={[
            { h: 'Bill', cell: (r) => <span className="font-black">#{r.o.billNo}</span>, foot: () => `${open.length} bills` },
            { h: 'Date', cell: (r) => <div><div>{new Date(r.o.paidAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div><div className="text-[11px] text-stone-400">{r.days} days ago</div></div> },
            { h: 'Customer', cell: (r) => <div><span className="font-semibold">{r.name}</span><div className="text-[11px] text-stone-400">{r.phone}</div></div> },
            { h: 'Items', cell: (r) => <span className="text-xs text-stone-600">{(r.o.items || []).map((i) => `${i.qty}× ${i.name}`).join(', ')}</span> },
            { h: 'Age', num: true, cell: (r) => <Badge color={bucketOf(r.days).tone}>{bucketOf(r.days).label}</Badge> },
            { h: 'Outstanding', num: true, cell: (r) => <b className="text-red-600">{inr0(r.outstanding)}</b>, foot: () => inr0(totalDue) },
            { h: '', cell: (r) => (
              <button onClick={() => setCollecting(r)} className="text-xs font-bold bg-leaf-600 hover:bg-leaf-500 text-white rounded-lg px-3 py-1.5 kp-noprint whitespace-nowrap">✓ Collect</button>
            ) },
          ]}
        />
      </Card>

      {settled.length > 0 && (
        <Card flush className="kp-card" title="Already collected" sub="Udhaar that came back" right={
          <button onClick={() => setShowPaid((v) => !v)} className="text-xs font-bold text-saffron-700 kp-noprint">{showPaid ? 'Hide' : `Show ${settled.length}`}</button>
        }>
          {showPaid && (
            <DataTable
              scroll
              rows={settled}
              keyOf={(r) => r.o.id}
              cols={[
                { h: 'Bill', cell: (r) => <span className="font-black">#{r.o.billNo}</span> },
                { h: 'Customer', cell: (r) => r.name },
                { h: 'Bill date', cell: (r) => new Date(r.o.paidAt).toLocaleDateString('en-IN') },
                { h: 'Collected', cell: (r) => <div>{new Date(r.o.creditPaid.at).toLocaleDateString('en-IN')}<div className="text-[11px] text-stone-400">by {r.o.creditPaid.by} · {String(r.o.creditPaid.method).toUpperCase()}</div></div> },
                { h: 'Days taken', num: true, cell: (r) => Math.round((r.o.creditPaid.at - r.o.paidAt) / 864e5) },
                { h: 'Amount', num: true, cell: (r) => <b>{inr0(r.outstanding)}</b>, foot: () => inr0(collected) },
              ]}
            />
          )}
        </Card>
      )}

      {collecting && (
        <CollectModal
          row={collecting}
          onClose={() => setCollecting(null)}
          onDone={(method) => { collectDue(collecting.o.id, { method }); setCollecting(null) }}
        />
      )}
    </>
  )
}

function CollectModal({ row, onClose, onDone }) {
  const [method, setMethod] = useState('cash')
  return (
    <Modal open onClose={onClose} title={`Collect ${inr0(row.outstanding)} from ${row.name}`}>
      <p className="text-xs text-stone-500 mb-3">
        Bill <b>#{row.o.billNo}</b> from {new Date(row.o.paidAt).toLocaleDateString('en-IN')} — outstanding {row.days} days.
        The bill keeps its original invoice number and date; this only records that the money arrived.
      </p>
      <span className="text-xs font-semibold text-stone-500 block mb-1.5">How did they pay?</span>
      <div className="grid grid-cols-3 gap-2 mb-4">
        {[['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card']].map(([k, l]) => (
          <button key={k} onClick={() => setMethod(k)} className={`rounded-xl py-3 font-bold text-sm border-2 ${method === k ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-500'}`}>{l}</button>
        ))}
      </div>
      <button onClick={() => onDone(method)} className={btnPrimary + ' w-full'}>✓ Received {inr0(row.outstanding)}</button>
    </Modal>
  )
}
