import React, { useMemo } from 'react'
import { StatCard, Empty } from '../components.jsx'
import { inr0 } from '../utils.js'
import { billTotals } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, amt, isAggregator } from './shared.jsx'

// Restaurant service under GST is HSN/SAC 996331. Owners selling packaged goods
// (bottled water, cigarettes, sweets by weight) can override it per item.
export const DEFAULT_HSN = '996331'

/**
 * The sheet the CA actually asks for. Everything here is rebuilt from each bill
 * rather than divided out of the gross, so composition, service charge and any
 * non-5% rate all stay correct. Tax is apportioned down to line level by value,
 * which is what makes an HSN-wise split possible at all.
 */
export default function Tax({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const settings = state.settings
  const scheme = settings.gstScheme || 'regular'
  const composition = scheme === 'composition'
  const defaultHsn = settings.hsnCode || DEFAULT_HSN
  const defaultRate = settings.gstRate ?? 5

  const itemOf = (id) => (state.items || []).find((i) => i.id === id)

  // own-channel bills only: Sec 9(5) puts the aggregator on the hook for GST on
  // Zomato/Swiggy sales, so including them here would overstate what you owe
  const own = useMemo(() => paid.filter((o) => !isAggregator(o)), [paid])
  const eco = useMemo(() => paid.filter(isAggregator), [paid])

  const totals = useMemo(() => own.reduce((a, o) => {
    const bt = billTotals(o, settings)
    a.sub += bt.sub; a.discount += bt.discount; a.taxable += bt.taxable
    a.svc += bt.svc; a.roundOff += bt.roundOff; a.gross += amt(o)
    if (!composition) { a.cgst += bt.cgst; a.sgst += bt.sgst }
    return a
  }, { sub: 0, discount: 0, taxable: 0, cgst: 0, sgst: 0, svc: 0, roundOff: 0, gross: 0 }), [own, settings, composition])

  const ecoGross = eco.reduce((s, o) => s + amt(o), 0)

  // HSN-wise: push each bill's taxable value down to its lines by value share,
  // then group. A bill's discount therefore reduces every line proportionally,
  // which is how a discount on a mixed bill is meant to be apportioned.
  const hsnRows = useMemo(() => {
    const m = {}
    own.forEach((o) => {
      const bt = billTotals(o, settings)
      if (!bt.sub) return
      ;(o.items || []).forEach((li) => {
        const it = itemOf(li.itemId)
        const hsn = it?.hsn || defaultHsn
        const rate = it?.gstRate ?? defaultRate
        const key = `${hsn}|${rate}`
        const lineValue = li.price * li.qty
        const share = lineValue / bt.sub
        const taxable = bt.taxable * share
        const row = (m[key] = m[key] || { hsn, rate, desc: it?.name || li.name, qty: 0, value: 0, taxable: 0, cgst: 0, sgst: 0, items: new Set() })
        row.qty += li.qty
        row.value += lineValue
        row.taxable += taxable
        if (!composition) { row.cgst += (taxable * rate) / 200; row.sgst += (taxable * rate) / 200 }
        row.items.add(it?.name || li.name)
      })
    })
    return Object.values(m).map((r) => ({ ...r, itemCount: r.items.size })).sort((a, b) => b.taxable - a.taxable)
  }, [own, settings, defaultHsn, defaultRate, composition])

  // rate slabs (identical to HSN today unless items carry their own rate)
  const rateRows = useMemo(() => {
    const m = {}
    hsnRows.forEach((r) => {
      const k = r.rate
      const row = (m[k] = m[k] || { rate: k, taxable: 0, cgst: 0, sgst: 0, qty: 0 })
      row.taxable += r.taxable; row.cgst += r.cgst; row.sgst += r.sgst; row.qty += r.qty
    })
    return Object.values(m).sort((a, b) => a.rate - b.rate)
  }, [hsnRows])

  // month-wise, because GST is filed monthly
  const monthRows = useMemo(() => {
    const m = {}
    own.forEach((o) => {
      const d = new Date(o.paidAt)
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const bt = billTotals(o, settings)
      const r = (m[k] = m[k] || { k, label: d.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }), bills: 0, taxable: 0, cgst: 0, sgst: 0, gross: 0 })
      r.bills++; r.taxable += bt.taxable; r.gross += amt(o)
      if (!composition) { r.cgst += bt.cgst; r.sgst += bt.sgst }
    })
    return Object.values(m).sort((a, b) => b.k.localeCompare(a.k))
  }, [own, settings, composition])

  const exportCsv = () => {
    const out = [['GST SUMMARY — ' + range.label],
      ['Business', settings.name || ''], ['GSTIN', settings.gstin || ''],
      ['Scheme', composition ? 'Composition' : `Regular @ ${defaultRate}%`],
      ['Period', `${new Date(range.from).toLocaleDateString('en-IN')} to ${new Date(Math.min(range.to, Date.now())).toLocaleDateString('en-IN')}`],
      [],
      ['YOUR OWN SALES (you deposit the GST)'],
      ['Gross collected ₹', Math.round(totals.gross)],
      ['Sub-total before discount ₹', Math.round(totals.sub)],
      ['Discounts ₹', Math.round(totals.discount)],
      ['Taxable value ₹', Math.round(totals.taxable)],
      ['CGST ₹', Math.round(totals.cgst)],
      ['SGST ₹', Math.round(totals.sgst)],
      ['Total GST ₹', Math.round(totals.cgst + totals.sgst)],
      ['Service charge ₹', Math.round(totals.svc)],
      ['Round-off ₹', +totals.roundOff.toFixed(2)],
      [],
      ['SEC 9(5) — AGGREGATOR SALES (platform deposits the GST)'],
      ['Zomato / Swiggy gross ₹', Math.round(ecoGross)], ['Orders', eco.length],
      [],
      ['HSN / SAC SUMMARY'], ['HSN / SAC', 'Description', 'Rate %', 'Qty', 'Taxable value ₹', 'CGST ₹', 'SGST ₹', 'Total tax ₹']]
    hsnRows.forEach((r) => out.push([
      r.hsn, r.itemCount > 1 ? `Restaurant service (${r.itemCount} items)` : r.desc, r.rate, r.qty,
      Math.round(r.taxable), Math.round(r.cgst), Math.round(r.sgst), Math.round(r.cgst + r.sgst),
    ]))
    out.push([], ['RATE-WISE'], ['Rate %', 'Taxable ₹', 'CGST ₹', 'SGST ₹'])
    rateRows.forEach((r) => out.push([r.rate, Math.round(r.taxable), Math.round(r.cgst), Math.round(r.sgst)]))
    out.push([], ['MONTH-WISE'], ['Month', 'Bills', 'Taxable ₹', 'CGST ₹', 'SGST ₹', 'Gross ₹'])
    monthRows.forEach((r) => out.push([r.label, r.bills, Math.round(r.taxable), Math.round(r.cgst), Math.round(r.sgst), Math.round(r.gross)]))
    download(`khaanapeena-gst-${slug(range)}.csv`, out)
  }

  if (!paid.length) {
    return <Card><Empty icon="🧾" text={`No settled bills in ${range.label.toLowerCase()}.`} /></Card>
  }

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} label="⬇️ Export for CA" /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Your own sales" value={inr0(totals.gross)} sub={`${own.length} bills · you deposit GST`} icon="🏪" accent="saffron" />
        <StatCard label="Taxable value" value={inr0(totals.taxable)} sub="after discounts, before tax" icon="🧮" accent="blue" />
        <StatCard label={composition ? 'GST charged' : 'GST payable'} value={composition ? '₹0' : inr0(totals.cgst + totals.sgst)} sub={composition ? 'composition — not collected' : `CGST ${inr0(totals.cgst)} + SGST ${inr0(totals.sgst)}`} icon="🧾" accent={composition ? 'stone' : 'red'} />
        <StatCard label="Via Zomato / Swiggy" value={inr0(ecoGross)} sub="Sec 9(5) — platform pays GST" icon="🛵" accent="purple" />
        <StatCard label="Round-off" value={(totals.roundOff > 0 ? '+' : '') + inr0(totals.roundOff)} sub="from rounding bills" icon="🔢" accent="green" />
      </div>

      {composition && (
        <Note tone="blue">
          You're on the <b>composition scheme</b>, so no GST is charged to customers and none of these bills carry tax.
          You pay a flat composition levy on turnover instead — the taxable value below is the turnover figure your CA needs.
        </Note>
      )}

      {!settings.gstin && (
        <Note>
          No GSTIN is set in Settings, so this sheet will print without one. Add it in <b>Settings → Business details</b> before handing anything to your CA.
        </Note>
      )}

      <Card flush title="HSN / SAC summary" sub="The table GSTR-1 asks for. Restaurant service is 996331 — set a different code on any item you sell as goods, in Menu.">
        <DataTable
          rows={hsnRows}
          keyOf={(r) => r.hsn + r.rate}
          cols={[
            { h: 'HSN / SAC', cell: (r) => <span className="font-black text-ink-900">{r.hsn}</span>, foot: () => 'Total' },
            { h: 'Description', cell: (r) => <span className="text-stone-600">{r.itemCount > 1 ? `Restaurant service — ${r.itemCount} items` : r.desc}</span> },
            { h: 'Rate', num: true, cell: (r) => r.rate + '%' },
            { h: 'Qty', num: true, cell: (r) => r.qty, foot: () => hsnRows.reduce((s, r) => s + r.qty, 0) },
            { h: 'Taxable value', num: true, cell: (r) => <b>{inr0(r.taxable)}</b>, foot: () => inr0(totals.taxable) },
            { h: 'CGST', num: true, cell: (r) => inr0(r.cgst), foot: () => inr0(totals.cgst) },
            { h: 'SGST', num: true, cell: (r) => inr0(r.sgst), foot: () => inr0(totals.sgst) },
            { h: 'Total tax', num: true, cell: (r) => <b>{inr0(r.cgst + r.sgst)}</b>, foot: () => inr0(totals.cgst + totals.sgst) },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" flush title="Rate-wise" sub="Taxable value grouped by GST slab">
          <DataTable
            rows={rateRows}
            keyOf={(r) => r.rate}
            cols={[
              { h: 'Slab', cell: (r) => <span className="font-semibold">{r.rate}% GST</span>, foot: () => 'Total' },
              { h: 'Taxable', num: true, cell: (r) => <b>{inr0(r.taxable)}</b>, foot: () => inr0(totals.taxable) },
              { h: `CGST`, num: true, cell: (r) => inr0(r.cgst), foot: () => inr0(totals.cgst) },
              { h: `SGST`, num: true, cell: (r) => inr0(r.sgst), foot: () => inr0(totals.sgst) },
            ]}
          />
        </Card>
        <Card className="!mb-0" flush title="Month-wise" sub="GST is filed monthly — these are your return figures">
          <DataTable
            rows={monthRows}
            keyOf={(r) => r.k}
            cols={[
              { h: 'Month', cell: (r) => <span className="font-semibold">{r.label}</span>, foot: () => 'Total' },
              { h: 'Bills', num: true, cell: (r) => r.bills, foot: () => own.length },
              { h: 'Taxable', num: true, cell: (r) => inr0(r.taxable), foot: () => inr0(totals.taxable) },
              { h: 'CGST+SGST', num: true, cell: (r) => <b>{inr0(r.cgst + r.sgst)}</b>, foot: () => inr0(totals.cgst + totals.sgst) },
            ]}
          />
        </Card>
      </div>

      <Card title="What you actually owe" sub="Read top to bottom — this is the arithmetic your CA will do">
        <div className="max-w-lg space-y-1 text-sm">
          <L l="Sub-total of all own-channel bills" v={inr0(totals.sub)} />
          <L l="Less discounts given" v={'−' + inr0(totals.discount)} red />
          <L l="Taxable value" v={inr0(totals.taxable)} bold />
          {!composition && <>
            <L l={`CGST @ ${defaultRate / 2}%`} v={inr0(totals.cgst)} />
            <L l={`SGST @ ${defaultRate / 2}%`} v={inr0(totals.sgst)} />
            <div className="border-t border-stone-200 my-2" />
            <L l="GST payable by you" v={inr0(totals.cgst + totals.sgst)} bold />
          </>}
          {totals.svc > 0 && <L l="Service charge collected (not a tax)" v={inr0(totals.svc)} />}
          <div className="border-t border-stone-200 my-2" />
          <L l="Zomato / Swiggy sales — GST paid by them" v={inr0(ecoGross)} />
        </div>
        <p className="text-[11px] text-stone-400 mt-3 max-w-lg leading-relaxed">
          Restaurant GST is charged without input tax credit, so nothing here is offset against what you paid your suppliers.
          Aggregator sales are excluded from your liability under Section 9(5) — the platform deposits that tax itself.
        </p>
      </Card>
    </>
  )
}

const L = ({ l, v, bold, red }) => (
  <div className={`flex justify-between py-1 ${bold ? 'text-ink-900 font-bold' : 'text-stone-600'}`}>
    <span>{l}</span>
    <span className={`tabular-nums ${red ? 'text-red-600' : ''}`}>{v}</span>
  </div>
)
