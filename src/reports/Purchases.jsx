import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, inr } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, slug, pct, spanDays, earliestOf } from './shared.jsx'

// Purchase register built on GRNs — goods actually RECEIVED, not merely ordered.
// A PO is an intention; a GRN is money owed. Owners reconcile against GRNs.
export default function Purchases({ state, range }) {
  const vendors = state.vendors || []
  const ings = state.ingredients || []
  const vendorName = (id) => vendors.find((v) => v.id === id)?.name || 'Unknown vendor'
  const ingOf = (id) => ings.find((g) => g.id === id)

  const allGrns = useMemo(() => [...(state.grns || [])].sort((a, b) => a.date - b.date), [state.grns])
  const grns = useMemo(() => allGrns.filter((g) => g.date >= range.from && g.date < range.to).sort((a, b) => b.date - a.date), [allGrns, range])

  const valueOf = (g) => (g.lines || []).reduce((s, l) => s + (+l.qty || 0) * (+l.rate || 0), 0)
  const total = grns.reduce((s, g) => s + valueOf(g), 0)

  const byVendor = useMemo(() => {
    const m = {}
    grns.forEach((g) => {
      const v = (m[g.vendorId] = m[g.vendorId] || { id: g.vendorId, name: vendorName(g.vendorId), grns: 0, value: 0, lines: 0 })
      v.grns++; v.value += valueOf(g); v.lines += (g.lines || []).length
    })
    return Object.values(m).map((v) => ({ ...v, gstin: vendors.find((x) => x.id === v.id)?.gstin || '' })).sort((a, b) => b.value - a.value)
  }, [grns, vendors])

  const byIng = useMemo(() => {
    const m = {}
    grns.forEach((g) => (g.lines || []).forEach((l) => {
      const a = (m[l.ingId] = m[l.ingId] || { ingId: l.ingId, qty: 0, value: 0 })
      a.qty += +l.qty || 0
      a.value += (+l.qty || 0) * (+l.rate || 0)
    }))
    return Object.values(m).map((a) => {
      const g = ingOf(a.ingId)
      return { ...a, name: g?.name || a.ingId, unit: g?.unit || '', avgRate: a.qty ? a.value / a.qty : 0 }
    }).sort((a, b) => b.value - a.value)
  }, [grns, ings])

  // rate movement across the whole history — the "your supplier quietly raised
  // the price" report. Compares each ingredient's two most recent distinct rates.
  const priceMoves = useMemo(() => {
    const hist = {}
    allGrns.forEach((g) => (g.lines || []).forEach((l) => {
      const rate = +l.rate || 0
      if (!rate) return
      const h = (hist[l.ingId] = hist[l.ingId] || [])
      if (!h.length || h[h.length - 1].rate !== rate) h.push({ rate, date: g.date, vendorId: g.vendorId })
    }))
    return Object.entries(hist)
      .filter(([, h]) => h.length >= 2)
      .map(([ingId, h]) => {
        const now = h[h.length - 1], prev = h[h.length - 2]
        const g = ingOf(ingId)
        return {
          ingId, name: g?.name || ingId, unit: g?.unit || '',
          from: prev.rate, to: now.rate, at: now.date,
          vendor: vendorName(now.vendorId),
          changePct: ((now.rate - prev.rate) / prev.rate) * 100,
        }
      })
      .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
  }, [allGrns, ings, vendors])

  const openPOs = (state.purchaseOrders || []).filter((p) => ['sent', 'partial'].includes(p.status))
  const openValue = openPOs.reduce((s, p) => s + (p.lines || []).reduce((a, l) => a + (+l.qty || 0) * (+l.rate || 0), 0), 0)
  const days = spanDays(range, earliestOf(grns, (g) => g.date))

  const exportCsv = () => {
    const out = [['PURCHASE REGISTER — ' + range.label], [],
      ['Total received ₹', Math.round(total)], ['GRNs', grns.length], ['Vendors used', byVendor.length],
      [], ['VENDOR-WISE'], ['Vendor', 'GSTIN', 'GRNs', 'Line items', 'Purchase value ₹', 'Share %']]
    byVendor.forEach((v) => out.push([v.name, v.gstin, v.grns, v.lines, Math.round(v.value), pct(v.value, total)]))
    out.push([], ['INGREDIENT-WISE'], ['Ingredient', 'Unit', 'Qty received', 'Avg rate ₹', 'Value ₹'])
    byIng.forEach((i) => out.push([i.name, i.unit, +i.qty.toFixed(3), +i.avgRate.toFixed(2), Math.round(i.value)]))
    out.push([], ['GRN REGISTER'], ['GRN No', 'Date', 'Vendor', 'Supplier bill no', 'Items', 'Value ₹'])
    ;[...grns].reverse().forEach((g) => out.push([
      g.grnNo, new Date(g.date).toLocaleDateString('en-IN'), vendorName(g.vendorId), g.supplierBillNo || '',
      (g.lines || []).map((l) => `${l.qty} ${ingOf(l.ingId)?.unit || ''} ${ingOf(l.ingId)?.name || l.ingId} @ ₹${l.rate}`).join('; '),
      Math.round(valueOf(g)),
    ]))
    if (priceMoves.length) {
      out.push([], ['RATE CHANGES'], ['Ingredient', 'Unit', 'Was ₹', 'Now ₹', 'Change %', 'Vendor', 'When'])
      priceMoves.forEach((p) => out.push([p.name, p.unit, p.from, p.to, p.changePct.toFixed(1), p.vendor, new Date(p.at).toLocaleDateString('en-IN')]))
    }
    if (openPOs.length) {
      out.push([], ['OPEN PURCHASE ORDERS'], ['PO No', 'Date', 'Vendor', 'Status', 'Value ₹'])
      openPOs.forEach((p) => out.push([p.poNo, new Date(p.date).toLocaleDateString('en-IN'), vendorName(p.vendorId), p.status, Math.round((p.lines || []).reduce((a, l) => a + l.qty * l.rate, 0))]))
    }
    download(`khaanapeena-purchases-${slug(range)}.csv`, out)
  }

  if (!grns.length && !openPOs.length) {
    return <Card><Empty icon="🛒" text={`No goods received in ${range.label.toLowerCase()}. Record deliveries in Purchase & Receipts and they'll be reported here.`} /></Card>
  }

  const risers = priceMoves.filter((p) => p.changePct > 5)

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Raw material bought" value={inr0(total)} sub={range.label} icon="🛒" accent="saffron" />
        <StatCard label="Deliveries received" value={grns.length} sub={`${(grns.length / days).toFixed(1)} per day`} icon="📦" accent="blue" />
        <StatCard label="Suppliers used" value={byVendor.length} sub={byVendor[0] ? `top: ${byVendor[0].name}` : ''} icon="🏪" accent="green" />
        <StatCard label="Spend per day" value={inr0(total / days)} icon="📅" accent="purple" />
        <StatCard label="On order (not yet in)" value={inr0(openValue)} sub={`${openPOs.length} open PO${openPOs.length === 1 ? '' : 's'}`} icon="🚚" accent={openPOs.length ? 'red' : 'green'} />
      </div>

      {risers.length > 0 && (
        <Note tone="red">
          <b>{risers.length} ingredient{risers.length > 1 ? 's have' : ' has'} gone up in price.</b>{' '}
          {risers.slice(0, 3).map((p) => `${p.name} +${p.changePct.toFixed(0)}%`).join(', ')}
          {risers.length > 3 ? ` and ${risers.length - 3} more` : ''}. Every dish using them just lost margin — check the Food Cost tab and reprice if needed.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" flush title="Vendor-wise purchases" sub="Who you owe, and how much of your buying they hold">
          <DataTable
            rows={byVendor}
            keyOf={(v) => v.id}
            cols={[
              { h: 'Vendor', cell: (v) => <div><span className="font-semibold text-ink-900">{v.name}</span>{v.gstin && <div className="text-[11px] text-stone-400">{v.gstin}</div>}</div>, foot: () => 'Total' },
              { h: 'Deliveries', num: true, cell: (v) => v.grns, foot: () => grns.length },
              { h: 'Value', num: true, cell: (v) => <b>{inr0(v.value)}</b>, foot: () => inr0(total) },
              { h: 'Share', num: true, cell: (v) => pct(v.value, total) + '%', foot: () => '100%' },
            ]}
          />
        </Card>
        <Card className="!mb-0" title="Spend by supplier" sub="Concentration risk at a glance">
          <HBars data={byVendor.slice(0, 8).map((v) => ({ label: v.name, value: Math.round(v.value) }))} />
        </Card>
      </div>

      <Card flush title="What you bought" sub="Every ingredient received in this period, with the average rate you paid">
        <DataTable
          scroll
          rows={byIng}
          keyOf={(i) => i.ingId}
          cols={[
            { h: 'Ingredient', cell: (i) => <span className="font-semibold">{i.name}</span>, foot: () => 'Total' },
            { h: 'Qty received', num: true, cell: (i) => `${+i.qty.toFixed(2)} ${i.unit}` },
            { h: 'Avg rate', num: true, cell: (i) => inr(+i.avgRate.toFixed(2)) + '/' + i.unit },
            { h: 'Value', num: true, cell: (i) => <b>{inr0(i.value)}</b>, foot: () => inr0(total) },
            { h: 'Share', num: true, cell: (i) => pct(i.value, total) + '%' },
          ]}
        />
      </Card>

      {priceMoves.length > 0 && (
        <Card flush title="📈 Rate changes" sub="What your suppliers changed, most recent price against the one before it — across all time, not just this period">
          <DataTable
            scroll
            rows={priceMoves}
            keyOf={(p) => p.ingId}
            cols={[
              { h: 'Ingredient', cell: (p) => <span className="font-semibold">{p.name}</span> },
              { h: 'Was', num: true, cell: (p) => inr(p.from) + '/' + p.unit },
              { h: 'Now', num: true, cell: (p) => <b>{inr(p.to)}/{p.unit}</b> },
              { h: 'Change', num: true, cell: (p) => <Badge color={p.changePct > 5 ? 'red' : p.changePct < -5 ? 'green' : 'stone'}>{p.changePct > 0 ? '+' : ''}{p.changePct.toFixed(1)}%</Badge> },
              { h: 'Vendor', cell: (p) => <span className="text-stone-500">{p.vendor}</span> },
              { h: 'Changed on', num: true, cell: (p) => new Date(p.at).toLocaleDateString('en-IN') },
            ]}
          />
        </Card>
      )}

      <Card flush title="Delivery register (GRN)" sub="Match these against your supplier's bills">
        <DataTable
          scroll
          rows={grns}
          keyOf={(g) => g.id}
          cols={[
            { h: 'GRN', cell: (g) => <span className="font-black">#{g.grnNo}</span>, foot: () => `${grns.length} deliveries` },
            { h: 'Date', cell: (g) => new Date(g.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
            { h: 'Vendor', cell: (g) => <span className="font-semibold">{vendorName(g.vendorId)}</span> },
            { h: 'Supplier bill', cell: (g) => g.supplierBillNo || <span className="text-stone-300">—</span> },
            { h: 'Items', cell: (g) => <span className="text-xs text-stone-600">{(g.lines || []).map((l) => `${l.qty}${ingOf(l.ingId)?.unit || ''} ${ingOf(l.ingId)?.name || l.ingId}`).join(', ')}</span> },
            { h: 'Value', num: true, cell: (g) => <b>{inr0(valueOf(g))}</b>, foot: () => inr0(total) },
          ]}
        />
      </Card>

      {openPOs.length > 0 && (
        <Card flush title="🚚 Still on order" sub="Placed but not fully received — chase these before you run out">
          <DataTable
            rows={openPOs.sort((a, b) => a.date - b.date)}
            keyOf={(p) => p.id}
            cols={[
              { h: 'PO', cell: (p) => <span className="font-black">#{p.poNo}</span> },
              { h: 'Placed', cell: (p) => new Date(p.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) },
              { h: 'Vendor', cell: (p) => <span className="font-semibold">{vendorName(p.vendorId)}</span> },
              { h: 'Status', cell: (p) => <Badge color={p.status === 'partial' ? 'amber' : 'blue'}>{p.status === 'partial' ? 'part received' : 'sent'}</Badge> },
              { h: 'Value', num: true, cell: (p) => inr0((p.lines || []).reduce((a, l) => a + l.qty * l.rate, 0)), foot: () => inr0(openValue) },
            ]}
          />
        </Card>
      )}
    </>
  )
}
