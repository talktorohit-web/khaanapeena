import React, { useMemo, useState } from 'react'
import { StatCard, Empty, Badge } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, inr, billTotals } from '../utils.js'
import { Card, DataTable, Exports, Note, paidIn, slug, pct, amt } from './shared.jsx'

// Menu engineering: every dish lands in one of four boxes depending on whether it
// sells above/below average and earns above/below average margin per plate. This
// is the classic Kasavana–Smith matrix — it turns a price list into a to-do list.
const QUADRANTS = {
  star: { label: '⭐ Stars', tone: 'green', hint: 'Popular AND high margin — feature these, never discount them.' },
  horse: { label: '🐎 Workhorses', tone: 'blue', hint: 'Popular but thin margin — nudge the price up ₹10–20 or trim the recipe cost.' },
  puzzle: { label: '🧩 Puzzles', tone: 'amber', hint: 'Good margin, few takers — push them: staff upsell, photo on the menu, combo them.' },
  dog: { label: '🐕 Dogs', tone: 'red', hint: 'Slow AND thin — reprice, rework, or take them off the menu.' },
}

export default function Items({ state, range }) {
  const [sort, setSort] = useState('rev')
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const gross = paid.reduce((s, o) => s + amt(o), 0)

  const cats = state.categories || []
  const ings = state.ingredients || []
  const ingCost = (id) => ings.find((g) => g.id === id)?.costPerUnit || 0
  const catName = (id) => cats.find((c) => c.id === id)?.name || 'Uncategorised'

  // aggregate every sold line by itemId. Lines carry their own name/price so a
  // dish deleted from the menu since still shows up honestly in history.
  const sold = useMemo(() => {
    const m = {}
    paid.forEach((o) => (o.items || []).forEach((li) => {
      const a = (m[li.itemId] = m[li.itemId] || { itemId: li.itemId, name: li.name, qty: 0, rev: 0 })
      a.qty += li.qty
      a.rev += li.price * li.qty
      a.name = li.name
    }))
    return m
  }, [paid])

  const rows = useMemo(() => (state.items || []).map((it) => {
    const s = sold[it.id] || { qty: 0, rev: 0 }
    const recipe = it.recipe || []
    const hasRecipe = recipe.length > 0
    const plateCost = recipe.reduce((a, r) => a + r.qty * ingCost(r.ingId), 0)
    const margin = hasRecipe ? it.price - plateCost : null
    return {
      id: it.id, name: it.name, cat: catName(it.catId), catId: it.catId, price: it.price,
      qty: s.qty, rev: s.rev, hasRecipe, plateCost,
      margin, marginPct: hasRecipe && it.price > 0 ? ((it.price - plateCost) / it.price) * 100 : null,
      totalMargin: hasRecipe ? (it.price - plateCost) * s.qty : null,
      share: pct(s.rev, gross),
    }
  }), [state.items, sold, gross, cats, ings])

  // dishes sold that are no longer on the menu (renamed/removed) — still real money
  const orphans = Object.values(sold).filter((s) => !(state.items || []).some((i) => i.id === s.itemId))

  const totalPlates = rows.reduce((s, r) => s + r.qty, 0) + orphans.reduce((s, o) => s + o.qty, 0)
  const soldRows = rows.filter((r) => r.qty > 0)
  const nonMoving = rows.filter((r) => r.qty === 0)

  // categories
  const catRows = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const c = (m[r.catId] = m[r.catId] || { id: r.catId, name: r.cat, qty: 0, rev: 0, items: 0, sellingItems: 0 })
      c.qty += r.qty; c.rev += r.rev; c.items++
      if (r.qty > 0) c.sellingItems++
    })
    return Object.values(m).filter((c) => c.items > 0).sort((a, b) => b.rev - a.rev)
  }, [rows])

  /**
   * Group report — category → item with the accounting columns:
   * qty, gross before discount, discount, net, tax, and total sales.
   *
   * A bill's discount and tax are apportioned down to each line by its share of
   * the bill's value, which is the only way a mixed bill's ₹100 off can be split
   * fairly across the dishes on it. Matches the column set a Petpooja "Group
   * Report" prints, so an owner can reconcile the two side by side.
   */
  const groupReport = useMemo(() => {
    const composition = state.settings.gstScheme === 'composition'
    const byCat = {}
    paid.forEach((o) => {
      const bt = billTotals(o, state.settings)
      if (!bt.sub) return
      const billTax = composition ? 0 : bt.cgst + bt.sgst
      ;(o.items || []).forEach((li) => {
        const item = (state.items || []).find((i) => i.id === li.itemId)
        const catId = item?.catId || '__none'
        const cat = (byCat[catId] = byCat[catId] || { id: catId, name: catName(catId), items: {} })
        const row = (cat.items[li.itemId + '|' + li.name] = cat.items[li.itemId + '|' + li.name]
          || { name: li.name, qty: 0, gross: 0, discount: 0, tax: 0 })
        const lineValue = li.price * li.qty
        const share = lineValue / bt.sub
        row.qty += li.qty
        row.gross += lineValue
        row.discount += bt.discount * share
        row.tax += billTax * share
      })
    })
    return Object.values(byCat)
      .map((c) => {
        const items = Object.values(c.items)
          .map((r) => ({ ...r, net: r.gross - r.discount, total: r.gross - r.discount + r.tax }))
          .sort((a, b) => b.total - a.total)
        const sum = (k) => items.reduce((s, r) => s + r[k], 0)
        return { ...c, items, sub: { qty: sum('qty'), gross: sum('gross'), discount: sum('discount'), net: sum('net'), tax: sum('tax'), total: sum('total') } }
      })
      .filter((c) => c.items.length)
      .sort((a, b) => b.sub.total - a.sub.total)
  }, [paid, state.items, state.settings, cats])

  const grand = groupReport.reduce((a, c) => ({
    qty: a.qty + c.sub.qty, gross: a.gross + c.sub.gross, discount: a.discount + c.sub.discount,
    net: a.net + c.sub.net, tax: a.tax + c.sub.tax, total: a.total + c.sub.total,
  }), { qty: 0, gross: 0, discount: 0, net: 0, tax: 0, total: 0 })

  // add-ons: what guests choose on top, and how often. Attach rate is measured
  // against that dish's own plates — "40% of Paneer Tikka went out extra spicy"
  // is actionable; "40 extra-spicy" on its own isn't.
  const modRows = useMemo(() => {
    const m = {}
    paid.forEach((o) => (o.items || []).forEach((li) => {
      ;(li.mods || []).forEach((md) => {
        const key = li.itemId + '|' + md.oid
        const a = (m[key] = m[key] || { key, itemId: li.itemId, name: md.name, dish: li.name, qty: 0, revenue: 0 })
        a.qty += li.qty
        a.revenue += (+md.price || 0) * li.qty
      })
    }))
    return Object.values(m)
      .map((r) => {
        const dishQty = sold[r.itemId]?.qty || 0
        return { ...r, dishQty, attach: dishQty ? (r.qty / dishQty) * 100 : null }
      })
      .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
  }, [paid, sold])

  const addOnRevenue = modRows.reduce((s, r) => s + r.revenue, 0)
  const platesWithMods = paid.reduce((s, o) => s + (o.items || []).reduce((a, li) => a + (li.mods?.length ? li.qty : 0), 0), 0)

  // menu engineering — only meaningful for costed dishes that actually sold
  const engineered = soldRows.filter((r) => r.hasRecipe)
  const avgQty = engineered.length ? engineered.reduce((s, r) => s + r.qty, 0) / engineered.length : 0
  const avgMargin = engineered.length ? engineered.reduce((s, r) => s + r.margin, 0) / engineered.length : 0
  const quadOf = (r) => {
    const popular = r.qty >= avgQty
    const rich = r.margin >= avgMargin
    return popular && rich ? 'star' : popular ? 'horse' : rich ? 'puzzle' : 'dog'
  }
  const quads = { star: [], horse: [], puzzle: [], dog: [] }
  engineered.forEach((r) => quads[quadOf(r)].push(r))
  Object.values(quads).forEach((list) => list.sort((a, b) => b.rev - a.rev))

  const sorted = useMemo(() => {
    const list = [...rows, ...orphans.map((o) => ({ id: o.itemId, name: o.name + ' (off menu)', cat: '—', price: o.qty ? o.rev / o.qty : 0, qty: o.qty, rev: o.rev, hasRecipe: false, margin: null, marginPct: null, totalMargin: null, share: pct(o.rev, gross) }))]
    const by = {
      rev: (a, b) => b.rev - a.rev,
      qty: (a, b) => b.qty - a.qty,
      margin: (a, b) => (b.totalMargin ?? -1) - (a.totalMargin ?? -1),
      name: (a, b) => a.name.localeCompare(b.name),
    }[sort]
    return list.sort(by)
  }, [rows, orphans, sort, gross])

  const buildRows = () => {
    const out = [['ITEM-WISE SALES — ' + range.label], [],
      ['Item', 'Category', 'Price ₹', 'Qty sold', 'Revenue ₹', 'Plate cost ₹', 'Margin/plate ₹', 'Margin %', 'Total margin ₹', 'Share of sales %']]
    sorted.forEach((r) => out.push([
      r.name, r.cat, r.price, r.qty, Math.round(r.rev),
      r.hasRecipe ? +r.plateCost.toFixed(2) : '', r.margin == null ? '' : +r.margin.toFixed(2),
      r.marginPct == null ? '' : r.marginPct.toFixed(1), r.totalMargin == null ? '' : Math.round(r.totalMargin), r.share,
    ]))
    out.push([], ['CATEGORY-WISE'], ['Category', 'Dishes selling', 'Plates', 'Revenue ₹', 'Share %', 'Avg per plate ₹'])
    catRows.forEach((c) => out.push([c.name, `${c.sellingItems}/${c.items}`, c.qty, Math.round(c.rev), pct(c.rev, gross), c.qty ? Math.round(c.rev / c.qty) : 0]))
    if (groupReport.length) {
      out.push([], ['GROUP REPORT'], ['Group', 'Item', 'Qty', 'Gross ₹', 'Discount ₹', 'Net ₹', 'Tax ₹', 'Total sales ₹'])
      out.push(['Total', '-', grand.qty, Math.round(grand.gross), Math.round(grand.discount), Math.round(grand.net), Math.round(grand.tax), Math.round(grand.total)])
      groupReport.forEach((c) => {
        c.items.forEach((r) => out.push([c.name, r.name, r.qty, Math.round(r.gross), Math.round(r.discount), Math.round(r.net), Math.round(r.tax), Math.round(r.total)]))
        out.push(['Sub Total — ' + c.name, '', c.sub.qty, Math.round(c.sub.gross), Math.round(c.sub.discount), Math.round(c.sub.net), Math.round(c.sub.tax), Math.round(c.sub.total)])
      })
    }
    if (modRows.length) {
      out.push([], ['CHOICES & ADD-ONS'], ['Choice', 'On dish', 'Times chosen', 'Dish plates', 'Attach rate %', 'Add-on revenue ₹'])
      modRows.forEach((r) => out.push([r.name, r.dish, r.qty, r.dishQty, r.attach == null ? '' : r.attach.toFixed(1), Math.round(r.revenue)]))
    }
    if (nonMoving.length) {
      out.push([], ['NOT SOLD IN THIS PERIOD'], ['Item', 'Category', 'Price ₹'])
      nonMoving.forEach((r) => out.push([r.name, r.cat, r.price]))
    }
    return out
  }

  if (!paid.length) {
    return <Card><Empty icon="🍽️" text={`No settled bills in ${range.label.toLowerCase()} — item sales appear once you start billing.`} /></Card>
  }

  const top = soldRows.slice().sort((a, b) => b.rev - a.rev)[0]
  const topCat = catRows[0]

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint">
        <Exports
          build={buildRows}
          name={`khaanapeena-items-${slug(range)}`}
          title="Item-wise sales"
          period={range.label}
          settings={state.settings}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Plates served" value={totalPlates} sub={range.label} icon="🍽️" accent="saffron" />
        <StatCard label="Dishes that sold" value={`${soldRows.length}/${rows.length}`} sub={nonMoving.length ? `${nonMoving.length} never ordered` : 'every dish sold ✓'} icon="📋" accent={nonMoving.length > rows.length / 3 ? 'red' : 'green'} />
        <StatCard label="Best seller" value={top ? top.name : '—'} sub={top ? `${top.qty} plates · ${inr0(top.rev)}` : ''} icon="🏆" accent="green" />
        <StatCard label="Top category" value={topCat ? topCat.name : '—'} sub={topCat ? `${pct(topCat.rev, gross)}% of sales` : ''} icon="📊" accent="purple" />
      </div>

      {/* CATEGORY-WISE */}
      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" flush title="Category-wise sales" sub="Where the money actually comes from">
          <DataTable
            rows={catRows}
            keyOf={(c) => c.id}
            cols={[
              { h: 'Category', cell: (c) => <div><span className="font-semibold">{c.name}</span><div className="text-[11px] text-stone-400">{c.sellingItems} of {c.items} dishes selling</div></div>, foot: () => 'Total' },
              { h: 'Plates', num: true, cell: (c) => c.qty, foot: () => catRows.reduce((s, c) => s + c.qty, 0) },
              { h: 'Revenue', num: true, cell: (c) => <b>{inr0(c.rev)}</b>, foot: () => inr0(catRows.reduce((s, c) => s + c.rev, 0)) },
              { h: 'Avg/plate', num: true, cell: (c) => inr0(c.qty ? c.rev / c.qty : 0) },
              { h: 'Share', num: true, cell: (c) => pct(c.rev, gross) + '%' },
            ]}
          />
        </Card>
        <Card className="!mb-0" title="Revenue by category" sub="Same numbers, ranked">
          {catRows.length ? <HBars data={catRows.filter((c) => c.rev > 0).slice(0, 8).map((c) => ({ label: c.name, value: Math.round(c.rev) }))} /> : <Empty text="No sales" />}
        </Card>
      </div>

      {/* MENU ENGINEERING */}
      {engineered.length >= 4 && (
        <Card
          title="Menu engineering — what to promote, reprice or drop"
          sub={`Each costed dish compared against the average (${avgQty.toFixed(0)} plates, ${inr(Math.round(avgMargin))} margin per plate) for ${range.label.toLowerCase()}`}
        >
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(QUADRANTS).map(([key, q]) => (
              <div key={key} className="border border-stone-100 rounded-xl p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm text-ink-900">{q.label}</span>
                  <Badge color={q.tone}>{quads[key].length}</Badge>
                </div>
                <p className="text-[11px] text-stone-400 leading-snug mb-2">{q.hint}</p>
                <div className="space-y-1">
                  {quads[key].slice(0, 6).map((r) => (
                    <div key={r.id} className="flex justify-between text-xs gap-2">
                      <span className="truncate text-stone-600">{r.name}</span>
                      <span className="tabular-nums text-stone-400 shrink-0">{r.qty}×</span>
                    </div>
                  ))}
                  {!quads[key].length && <div className="text-xs text-stone-300">none</div>}
                  {quads[key].length > 6 && <div className="text-[11px] text-stone-400">+{quads[key].length - 6} more</div>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-stone-400 mt-3">Only dishes with a recipe can be placed — {engineered.length} of {soldRows.length} sold dishes qualify. Add recipes in Menu to include the rest.</p>
        </Card>
      )}

      {/* GROUP REPORT */}
      {groupReport.length > 0 && (
        <Card
          flush
          className="kp-card"
          title="Group report — category → item"
          sub="Each bill's discount and tax split across its lines by value. Same columns a Petpooja group report prints."
        >
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="text-xs text-stone-400 border-b border-stone-100">
                  <th className="py-2 px-4 text-left font-medium">Group / Item</th>
                  <th className="py-2 px-2 text-right font-medium">Qty</th>
                  <th className="py-2 px-2 text-right font-medium">Gross</th>
                  <th className="py-2 px-2 text-right font-medium">Discount</th>
                  <th className="py-2 px-2 text-right font-medium">Net</th>
                  <th className="py-2 px-2 text-right font-medium">Tax</th>
                  <th className="py-2 px-2 text-right font-medium">Total sales</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b-2 border-stone-200 bg-stone-50 font-black text-ink-900">
                  <td className="py-2.5 px-4">Total — all groups</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{grand.qty}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{inr0(grand.gross)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-red-600">{grand.discount >= 1 ? '−' + inr0(grand.discount) : '—'}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{inr0(grand.net)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums">{inr0(grand.tax)}</td>
                  <td className="py-2.5 px-2 text-right tabular-nums text-saffron-700">{inr0(grand.total)}</td>
                </tr>
                {groupReport.map((c) => (
                  <React.Fragment key={c.id}>
                    <tr className="bg-stone-50/60">
                      <td colSpan={7} className="py-2 px-4 font-black text-xs uppercase tracking-wider text-stone-500">{c.name}</td>
                    </tr>
                    {c.items.map((r, i) => (
                      <tr key={i} className="border-b border-stone-50">
                        <td className="py-2 px-4 pl-8 text-stone-700">{r.name}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.qty}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{inr0(r.gross)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{r.discount >= 1 ? <span className="text-red-600">−{inr0(r.discount)}</span> : <span className="text-stone-300">—</span>}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{inr0(r.net)}</td>
                        <td className="py-2 px-2 text-right tabular-nums">{inr0(r.tax)}</td>
                        <td className="py-2 px-2 text-right tabular-nums font-bold">{inr0(r.total)}</td>
                      </tr>
                    ))}
                    <tr className="border-b border-stone-200 font-bold text-ink-900">
                      <td className="py-2 px-4 text-xs">Sub-total · {c.name}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.sub.qty}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{inr0(c.sub.gross)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{c.sub.discount >= 1 ? '−' + inr0(c.sub.discount) : '—'}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{inr0(c.sub.net)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{inr0(c.sub.tax)}</td>
                      <td className="py-2 px-2 text-right tabular-nums">{inr0(c.sub.total)}</td>
                    </tr>
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
          <p className="px-4 py-3 text-[11px] text-stone-400">
            Gross is what the dishes rang up to before any discount. Net = gross − discount. Total sales = net + tax.
            {state.settings.gstScheme === 'composition' && ' Composition scheme — no tax is charged, so the tax column is zero.'}
          </p>
        </Card>
      )}

      {/* ADD-ONS */}
      {modRows.length > 0 && (
        <div className="grid lg:grid-cols-3 gap-4 mb-4">
          <Card
            className="!mb-0 lg:col-span-2"
            flush
            title="Choices &amp; add-ons"
            sub="What guests ask for on top — attach rate is against that dish's own plates"
          >
            <DataTable
              scroll
              rows={modRows}
              keyOf={(r) => r.key}
              cols={[
                { h: 'Choice', cell: (r) => <div><span className="font-semibold text-ink-900">{r.name}</span><div className="text-[11px] text-stone-400">on {r.dish}</div></div>, foot: () => 'Total' },
                { h: 'Times chosen', num: true, cell: (r) => r.qty, foot: () => modRows.reduce((s, r) => s + r.qty, 0) },
                { h: 'Attach rate', num: true, cell: (r) => r.attach == null
                  ? <span className="text-stone-300">—</span>
                  : <Badge color={r.attach >= 50 ? 'green' : r.attach >= 20 ? 'amber' : 'stone'}>{r.attach.toFixed(0)}%</Badge> },
                { h: 'Extra earned', num: true, cell: (r) => r.revenue ? <b>{inr0(r.revenue)}</b> : <span className="text-stone-300">free choice</span>, foot: () => inr0(addOnRevenue) },
              ]}
            />
          </Card>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
            <StatCard label="Earned from add-ons" value={inr0(addOnRevenue)} sub={`${pct(addOnRevenue, gross)}% of sales · pure margin on most`} icon="🧩" accent="green" />
            <StatCard label="Plates with a choice" value={platesWithMods} sub={totalPlates ? `${pct(platesWithMods, totalPlates)}% of everything served` : ''} icon="✨" accent="blue" />
          </div>
        </div>
      )}

      {/* FULL ITEM REGISTER */}
      <Card
        flush
        title="Item-wise sales register"
        sub="Every dish, not just the top few"
        right={
          <div className="flex items-center gap-1 text-xs">
            <span className="text-stone-400">Sort:</span>
            {[['rev', 'Revenue'], ['qty', 'Plates'], ['margin', 'Margin'], ['name', 'A–Z']].map(([k, l]) => (
              <button key={k} onClick={() => setSort(k)} className={`px-2 py-1 rounded-lg font-bold ${sort === k ? 'bg-ink-900 text-white' : 'bg-stone-100 text-stone-600'}`}>{l}</button>
            ))}
          </div>
        }
      >
        <DataTable
          scroll
          rows={sorted}
          keyOf={(r) => r.id}
          cols={[
            { h: 'Dish', cell: (r) => <div><div className="font-semibold text-ink-900">{r.name}</div><div className="text-[11px] text-stone-400">{r.cat}</div></div>, foot: () => 'Total' },
            { h: 'Price', num: true, cell: (r) => inr0(r.price) },
            { h: 'Plates', num: true, cell: (r) => r.qty || <span className="text-stone-300">0</span>, foot: () => totalPlates },
            { h: 'Revenue', num: true, cell: (r) => r.rev ? <b>{inr0(r.rev)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(sorted.reduce((s, r) => s + r.rev, 0)) },
            { h: 'Margin/plate', num: true, cell: (r) => r.margin == null ? <span className="text-[11px] text-stone-400">no recipe</span> : inr0(r.margin) },
            { h: 'Margin %', num: true, cell: (r) => r.marginPct == null ? <span className="text-stone-300">—</span> : <Badge color={r.marginPct >= 70 ? 'green' : r.marginPct >= 60 ? 'amber' : 'red'}>{r.marginPct.toFixed(0)}%</Badge> },
            { h: 'Total margin', num: true, cell: (r) => r.totalMargin == null ? <span className="text-stone-300">—</span> : inr0(r.totalMargin), foot: () => inr0(sorted.reduce((s, r) => s + (r.totalMargin || 0), 0)) },
            { h: 'Share', num: true, cell: (r) => r.share ? r.share + '%' : <span className="text-stone-300">—</span> },
          ]}
        />
      </Card>

      {/* NON-MOVING */}
      {nonMoving.length > 0 && (
        <Card
          flush
          title={`🥶 Not sold once in ${range.label.toLowerCase()}`}
          sub="Dead weight on the menu — every extra line slows a customer's decision and ties up stock"
        >
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {nonMoving.map((r) => (
              <span key={r.id} className="text-xs bg-stone-100 text-stone-600 rounded-full px-3 py-1">
                {r.name} <span className="text-stone-400">· {inr0(r.price)}</span>
              </span>
            ))}
          </div>
        </Card>
      )}

      {orphans.length > 0 && (
        <Note tone="blue">
          {orphans.length} dish{orphans.length > 1 ? 'es' : ''} sold in this period {orphans.length > 1 ? 'are' : 'is'} no longer on your menu — they're listed as "(off menu)" so the revenue still adds up.
        </Note>
      )}
    </>
  )
}
