import React, { useMemo, useState } from 'react'
import { StatCard, Empty, Badge } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, inr } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, pct, amt } from './shared.jsx'

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

  const exportCsv = () => {
    const out = [['ITEM-WISE SALES — ' + range.label], [],
      ['Item', 'Category', 'Price ₹', 'Qty sold', 'Revenue ₹', 'Plate cost ₹', 'Margin/plate ₹', 'Margin %', 'Total margin ₹', 'Share of sales %']]
    sorted.forEach((r) => out.push([
      r.name, r.cat, r.price, r.qty, Math.round(r.rev),
      r.hasRecipe ? +r.plateCost.toFixed(2) : '', r.margin == null ? '' : +r.margin.toFixed(2),
      r.marginPct == null ? '' : r.marginPct.toFixed(1), r.totalMargin == null ? '' : Math.round(r.totalMargin), r.share,
    ]))
    out.push([], ['CATEGORY-WISE'], ['Category', 'Dishes selling', 'Plates', 'Revenue ₹', 'Share %', 'Avg per plate ₹'])
    catRows.forEach((c) => out.push([c.name, `${c.sellingItems}/${c.items}`, c.qty, Math.round(c.rev), pct(c.rev, gross), c.qty ? Math.round(c.rev / c.qty) : 0]))
    if (nonMoving.length) {
      out.push([], ['NOT SOLD IN THIS PERIOD'], ['Item', 'Category', 'Price ₹'])
      nonMoving.forEach((r) => out.push([r.name, r.cat, r.price]))
    }
    download(`khaanapeena-items-${slug(range)}.csv`, out)
  }

  if (!paid.length) {
    return <Card><Empty icon="🍽️" text={`No settled bills in ${range.label.toLowerCase()} — item sales appear once you start billing.`} /></Card>
  }

  const top = soldRows.slice().sort((a, b) => b.rev - a.rev)[0]
  const topCat = catRows[0]

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

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
