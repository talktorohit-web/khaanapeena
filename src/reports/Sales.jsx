import React, { useMemo } from 'react'
import { StatCard, Empty } from '../components.jsx'
import { Bars, Donut, HBars } from '../charts.jsx'
import { inr0, bucketize, billTotals } from '../utils.js'
import { Card, DataTable, ExportBtn, download, paidIn, slug, pct, amt, channelOf, CHANNELS, isAggregator } from './shared.jsx'

const MODES = [
  { key: 'cash', label: 'Cash', icon: '💵', color: '#16a34a' },
  { key: 'upi', label: 'UPI', icon: '📲', color: '#2563eb' },
  { key: 'card', label: 'Card', icon: '💳', color: '#9333ea' },
  { key: 'online', label: 'Online (Zomato/Swiggy)', icon: '🛵', color: '#f06008' },
]

export default function Sales({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])

  const scheme = state.settings.gstScheme || 'regular'
  const gstRate = state.settings.gstRate ?? 5
  const gross = paid.reduce((s, o) => s + amt(o), 0)
  const discount = paid.reduce((s, o) => s + (o.payment?.discount || 0), 0)
  const bills = paid.length
  const avg = bills ? Math.round(gross / bills) : 0
  // taxable value computed from each bill (not gross/1.05) — correct for composition
  // (no GST), service charge, and non-5% GST rates
  const netTaxable = Math.round(paid.reduce((s, o) => s + billTotals(o, state.settings).taxable, 0))

  const modeRows = MODES.map((m) => {
    const os = paid.filter((o) => (o.payment?.method || 'cash') === m.key)
    const amount = os.reduce((s, o) => s + amt(o), 0)
    return { ...m, amount, count: os.length, pct: pct(amount, gross) }
  })

  const trend = useMemo(
    () => bucketize(paid.map((o) => ({ ts: o.paidAt, value: amt(o) })), range),
    [paid, range]
  )
  const trendLabelEvery = trend.length > 16 ? 3 : trend.length > 9 ? 2 : 1

  // channel mix — by revenue and average bill, not just bill count
  const channelRows = CHANNELS.map(([key, label]) => {
    const os = paid.filter((o) => channelOf(o) === key)
    const rev = os.reduce((s, o) => s + amt(o), 0)
    return { key, label, bills: os.length, rev, avg: os.length ? Math.round(rev / os.length) : 0, share: pct(rev, gross) }
  }).filter((c) => c.bills > 0).sort((a, b) => b.rev - a.rev)

  // day-wise register — one row per day, the sheet owners reconcile a month with
  const dayRows = useMemo(() => {
    const map = {}
    paid.forEach((o) => {
      const k = new Date(o.paidAt).toISOString().slice(0, 10)
      const d = (map[k] = map[k] || { k, bills: 0, gross: 0, discount: 0, taxable: 0, tax: 0, cash: 0, digital: 0 })
      const bt = billTotals(o, state.settings)
      d.bills++
      d.gross += amt(o)
      d.discount += o.payment?.discount || 0
      d.taxable += bt.taxable
      if (scheme !== 'composition') d.tax += bt.cgst + bt.sgst
      if ((o.payment?.method || 'cash') === 'cash') d.cash += amt(o); else d.digital += amt(o)
    })
    return Object.values(map).sort((a, b) => b.k.localeCompare(a.k))
  }, [paid, state.settings, scheme])

  const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((label) => ({ label, value: 0 }))
  paid.forEach((o) => { const i = (new Date(o.paidAt).getDay() + 6) % 7; dow[i].value += amt(o) })

  // GST — own channel vs aggregator (Sec 9(5) sales are deposited by the platform)
  const own = paid.filter((o) => !isAggregator(o))
  const eco = paid.filter(isAggregator)
  const ownGross = own.reduce((s, o) => s + amt(o), 0)
  const ecoGross = eco.reduce((s, o) => s + amt(o), 0)
  const ownAgg = own.reduce((a, o) => {
    const bt = billTotals(o, state.settings)
    a.taxable += bt.taxable
    if (scheme !== 'composition') { a.cgst += bt.cgst; a.sgst += bt.sgst }
    return a
  }, { taxable: 0, cgst: 0, sgst: 0 })

  const exportCsv = () => {
    const rows = [['DAY-WISE SALES — ' + range.label], [],
      ['Date', 'Bills', 'Gross ₹', 'Discount ₹', 'Taxable ₹', 'GST ₹', 'Cash ₹', 'Digital ₹', 'Avg bill ₹']]
    ;[...dayRows].reverse().forEach((d) => rows.push([
      new Date(d.k).toLocaleDateString('en-IN'), d.bills, Math.round(d.gross), Math.round(d.discount),
      Math.round(d.taxable), Math.round(d.tax), Math.round(d.cash), Math.round(d.digital),
      d.bills ? Math.round(d.gross / d.bills) : 0,
    ]))
    rows.push([], ['PAYMENT MODES'], ['Mode', 'Bills', 'Amount ₹', 'Share %'])
    modeRows.forEach((m) => rows.push([m.label, m.count, Math.round(m.amount), m.pct]))
    rows.push([], ['CHANNELS'], ['Channel', 'Bills', 'Revenue ₹', 'Avg bill ₹', 'Share %'])
    channelRows.forEach((c) => rows.push([c.label, c.bills, Math.round(c.rev), c.avg, c.share]))
    rows.push([], ['TOTAL', bills, Math.round(gross)])
    download(`khaanapeena-sales-${slug(range)}.csv`, rows)
  }

  if (!bills) {
    return <Card><Empty icon="🧾" text={`No settled bills in ${range.label.toLowerCase()}. Settle some orders in Billing, then they'll appear here.`} /></Card>
  }

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Total earnings" value={inr0(gross)} sub={range.label} icon="💰" accent="saffron" />
        <StatCard label="Sales before GST" value={inr0(netTaxable)} sub="before tax is added" icon="🧮" accent="blue" />
        <StatCard label="Bills" value={bills} icon="🧾" accent="green" />
        <StatCard label="Avg. bill" value={inr0(avg)} icon="📊" accent="purple" />
        <StatCard label="Discounts given" value={inr0(discount)} icon="🏷️" accent="red" />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card
          className="lg:col-span-2 !mb-0"
          title="Earnings by payment mode"
          sub="How much came in as cash vs UPI vs card vs online"
        >
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
                <th className="py-2">Mode</th><th>Bills</th><th>Amount</th><th className="w-1/3">Share</th>
              </tr>
            </thead>
            <tbody>
              {modeRows.map((m) => (
                <tr key={m.key} className="border-b border-stone-50">
                  <td className="py-2.5 font-semibold">{m.icon} {m.label}</td>
                  <td className="tabular-nums">{m.count}</td>
                  <td className="font-bold tabular-nums">{inr0(m.amount)}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-stone-100 rounded-full h-2.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${m.pct}%`, background: m.color }} />
                      </div>
                      <span className="text-xs font-bold w-9 text-right tabular-nums">{m.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
              <tr>
                <td className="py-2.5 font-black">Total</td><td className="font-black tabular-nums">{bills}</td>
                <td className="font-black text-saffron-700 tabular-nums">{inr0(gross)}</td><td></td>
              </tr>
            </tbody>
          </table>
        </Card>
        <Card className="!mb-0" title="Cash vs digital" sub="By amount">
          <Donut data={modeRows.filter((m) => m.amount > 0).map((m) => ({ label: m.label.split(' ')[0], value: m.amount }))} />
        </Card>
      </div>

      <Card title="Earnings trend" sub={`₹ per ${range.bucket === 'hour' ? 'hour' : range.bucket === 'week' ? 'week' : 'day'} · ${range.label}`}>
        <Bars data={trend} labelEvery={trendLabelEvery} />
      </Card>

      {/* DAY-WISE REGISTER — the row-per-day sheet for monthly reconciliation */}
      <Card
        flush
        title="Day-wise sales register"
        sub="One row per day — reconcile the month, hand it to your CA"
      >
        <DataTable
          scroll
          rows={dayRows}
          keyOf={(d) => d.k}
          cols={[
            { h: 'Date', cell: (d) => (
              <div>
                <div className="font-semibold text-ink-900">{new Date(d.k).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
                <div className="text-[11px] text-stone-400">{new Date(d.k).toLocaleDateString('en-IN', { weekday: 'short' })}</div>
              </div>
            ), foot: () => 'Total' },
            { h: 'Bills', num: true, cell: (d) => d.bills, foot: () => bills },
            { h: 'Gross', num: true, cell: (d) => <b>{inr0(d.gross)}</b>, foot: () => inr0(gross) },
            { h: 'Avg bill', num: true, cell: (d) => inr0(d.bills ? d.gross / d.bills : 0), foot: () => inr0(avg) },
            { h: 'Discount', num: true, cell: (d) => d.discount ? <span className="text-red-600">{inr0(d.discount)}</span> : <span className="text-stone-300">—</span>, foot: () => inr0(discount) },
            { h: 'Taxable', num: true, cell: (d) => inr0(d.taxable), foot: () => inr0(dayRows.reduce((s, d) => s + d.taxable, 0)) },
            { h: 'GST', num: true, cell: (d) => inr0(d.tax), foot: () => inr0(dayRows.reduce((s, d) => s + d.tax, 0)) },
            { h: 'Cash', num: true, cell: (d) => inr0(d.cash), foot: () => inr0(dayRows.reduce((s, d) => s + d.cash, 0)) },
            { h: 'Digital', num: true, cell: (d) => inr0(d.digital), foot: () => inr0(dayRows.reduce((s, d) => s + d.digital, 0)) },
          ]}
        />
      </Card>

      {/* CHANNEL — now by revenue + average bill, not just bill count */}
      <Card flush title="Sales by order type" sub="Which channel earns most — and what each guest spends there">
        <DataTable
          rows={channelRows}
          keyOf={(c) => c.key}
          cols={[
            { h: 'Channel', cell: (c) => <span className="font-semibold">{c.label}</span>, foot: () => 'All channels' },
            { h: 'Bills', num: true, cell: (c) => c.bills, foot: () => bills },
            { h: 'Revenue', num: true, cell: (c) => <b>{inr0(c.rev)}</b>, foot: () => inr0(gross) },
            { h: 'Avg bill', num: true, cell: (c) => inr0(c.avg), foot: () => inr0(avg) },
            { h: 'Share of sales', num: true, cell: (c) => c.share + '%', foot: () => '100%' },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="!mb-0" title="By day of week" sub="Total ₹ earned">
          <Bars data={dow} color="#9333ea" />
        </Card>
        <Card className="!mb-0" title="Revenue by channel" sub="Same data, at a glance">
          {channelRows.length ? <HBars data={channelRows.map((c) => ({ label: c.label, value: Math.round(c.rev) }))} color="#16a34a" /> : <Empty text="No orders" />}
        </Card>
        <Card className="!mb-0" title="GST summary">
          {scheme === 'composition' ? (
            <>
              <Row l="Your own sales (dine-in / takeaway)" v={inr0(ownGross)} />
              <Row l="GST charged" v="₹0 (not collected)" />
              <p className="text-[10px] text-stone-400 mt-1">Composition scheme — no GST is charged to customers; you pay a fixed composition levy on turnover instead.</p>
            </>
          ) : (
            <>
              <Row l="Your own sales (dine-in / takeaway)" v={inr0(ownGross)} />
              <Row l="Taxable value" v={inr0(ownAgg.taxable)} />
              <Row l={`CGST @${gstRate / 2}%`} v={inr0(ownAgg.cgst)} />
              <Row l={`SGST @${gstRate / 2}%`} v={inr0(ownAgg.sgst)} />
            </>
          )}
          <div className="border-t border-stone-100 my-2" />
          <Row l="Via Zomato/Swiggy" v={inr0(ecoGross)} />
          <p className="text-[10px] text-stone-400 mt-1">Aggregator deposits GST on their sales under Sec 9(5) — not payable by you. Full rate-wise + HSN breakdown is on the <b>GST &amp; HSN</b> tab.</p>
        </Card>
      </div>
    </>
  )
}

const Row = ({ l, v }) => <div className="flex justify-between py-0.5 text-stone-600 text-sm"><span>{l}</span><b className="text-ink-900 tabular-nums">{v}</b></div>
