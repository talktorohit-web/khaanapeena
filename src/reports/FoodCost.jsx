import React, { useMemo, useState } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, inr } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug } from './shared.jsx'

export default function FoodCost({ state, range }) {
  const [sort, setSort] = useState('pct') // pct | margin | sold | name
  const ings = state.ingredients || []
  const cats = state.categories || []
  const ingCost = (id) => ings.find((g) => g.id === id)?.costPerUnit || 0
  const catName = (id) => cats.find((c) => c.id === id)?.name || '—'

  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const soldQty = useMemo(() => {
    const m = {}
    paid.forEach((o) => (o.items || []).forEach((li) => { m[li.itemId] = (m[li.itemId] || 0) + li.qty }))
    return m
  }, [paid])

  const rows = (state.items || []).map((it) => {
    const recipe = it.recipe || []
    const hasRecipe = recipe.length > 0
    const plateCost = recipe.reduce((s, r) => s + r.qty * ingCost(r.ingId), 0)
    const pct = hasRecipe && it.price > 0 ? (plateCost / it.price) * 100 : null
    const sold = soldQty[it.id] || 0
    return {
      id: it.id, name: it.name, cat: catName(it.catId), price: it.price, plateCost, pct,
      margin: it.price - plateCost, sold, periodCost: plateCost * sold, periodRev: it.price * sold, hasRecipe,
    }
  })

  const costed = rows.filter((r) => r.hasRecipe)
  const totCost = costed.reduce((s, r) => s + r.periodCost, 0)
  const totRev = costed.reduce((s, r) => s + r.periodRev, 0)
  const overallPct = totRev > 0 ? (totCost / totRev) * 100 : null
  const allRev = rows.reduce((s, r) => s + r.periodRev, 0)
  const coveredPct = allRev > 0 ? Math.round((totRev / allRev) * 100) : 0

  const pctColor = (p) => (p == null ? 'stone' : p <= 30 ? 'green' : p <= 40 ? 'amber' : 'red')
  const overallColor = overallPct == null ? 'text-stone-400' : overallPct <= 30 ? 'text-leaf-600' : overallPct <= 40 ? 'text-amber-600' : 'text-red-600'

  const sorted = [...rows].sort((a, b) => {
    if (sort === 'name') return a.name.localeCompare(b.name)
    if (sort === 'margin') return b.margin - a.margin
    if (sort === 'sold') return b.sold - a.sold
    if (a.pct == null && b.pct == null) return 0
    if (a.pct == null) return 1
    if (b.pct == null) return -1
    return b.pct - a.pct
  })
  const leaks = costed.filter((r) => r.sold > 0).sort((a, b) => b.periodCost - a.periodCost).slice(0, 6)

  const exportCsv = () => {
    const out = [['FOOD COST — ' + range.label], [],
      ['Item', 'Category', 'Price ₹', 'Plate cost ₹', 'Food cost %', 'Margin ₹', 'Sold', 'Period cost ₹', 'Period revenue ₹']]
    sorted.forEach((r) => out.push([
      r.name, r.cat, r.price, +r.plateCost.toFixed(2), r.pct == null ? '' : r.pct.toFixed(1),
      +r.margin.toFixed(2), r.sold, Math.round(r.periodCost), Math.round(r.periodRev),
    ]))
    out.push([], ['Overall food cost %', overallPct == null ? '' : overallPct.toFixed(1)],
      ['Ingredient cost of dishes sold ₹', Math.round(totCost)],
      ['Revenue from costed dishes ₹', Math.round(totRev)],
      ['Recipe coverage %', coveredPct])
    download(`khaanapeena-food-cost-${slug(range)}.csv`, out)
  }

  if (!(state.items || []).length) return <Card><Empty icon="🍲" text="No menu items yet." /></Card>

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <div className="text-xs text-stone-500 font-medium">Overall food cost %</div>
          <div className={`text-2xl font-bold ${overallColor} tabular-nums`}>{overallPct == null ? '—' : overallPct.toFixed(1) + '%'}</div>
          <div className="text-[11px] text-stone-400">{range.label} · costed dishes sold</div>
        </div>
        <StatCard label="Ingredient cost of dishes sold" value={inr0(totCost)} sub={`on ${inr0(totRev)} of sales`} icon="🧮" accent="saffron" />
        <StatCard label="Profit after ingredients" value={overallPct == null ? '—' : (100 - overallPct).toFixed(0) + '%'} sub={inr0(totRev - totCost)} icon="📈" accent="green" />
        <StatCard label="Recipe coverage" value={`${costed.length}/${rows.length}`} sub={`${coveredPct}% of sales have recipes`} icon="📋" accent={coveredPct >= 70 ? 'green' : 'red'} />
      </div>

      {overallPct != null && overallPct > 35 && (
        <Note tone="red">
          🔻 Overall food cost is <b>{overallPct.toFixed(1)}%</b> — above the healthy 25–35% range. Re-check pricing or supplier rates on the high-cost dishes below.
        </Note>
      )}
      {coveredPct < 70 && costed.length > 0 && (
        <Note>
          Only <b>{coveredPct}%</b> of your sales revenue is recipe-costed. Add recipes to more menu items (in Menu) for the full picture.
        </Note>
      )}

      {leaks.length > 0 && (
        <Card title="Biggest margin leaks" sub="Dishes eating the most into profit this period (food cost × volume)">
          <HBars data={leaks.map((r) => ({ label: `${r.name} (${r.pct.toFixed(0)}%)`, value: Math.round(r.periodCost) }))} color="#dc2626" />
        </Card>
      )}

      <Card
        flush
        title="Per-dish food cost"
        right={
          <div className="flex items-center gap-1 text-xs">
            <span className="text-stone-400">Sort:</span>
            {[['pct', 'Cost %'], ['margin', 'Margin'], ['sold', 'Sold'], ['name', 'A–Z']].map(([k, l]) => (
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
            { h: 'Dish', cell: (r) => <div><div className="font-semibold text-ink-900">{r.name}</div><div className="text-[11px] text-stone-400">{r.cat}</div></div> },
            { h: 'Price', num: true, cell: (r) => inr0(r.price) },
            { h: 'Plate cost', num: true, cell: (r) => r.hasRecipe ? inr(+r.plateCost.toFixed(2)) : <span className="text-stone-300">—</span> },
            { h: 'Food cost %', num: true, cell: (r) => r.pct == null ? <span className="text-[11px] text-stone-400">no recipe</span> : <Badge color={pctColor(r.pct)}>{r.pct.toFixed(0)}%</Badge> },
            { h: 'Margin', num: true, cell: (r) => r.hasRecipe ? inr0(r.margin) : <span className="text-stone-300">—</span> },
            { h: 'Sold', num: true, cell: (r) => r.sold || <span className="text-stone-300">0</span> },
            { h: 'Cost this period', num: true, cell: (r) => r.hasRecipe && r.sold ? inr0(r.periodCost) : <span className="text-stone-300">—</span> },
          ]}
        />
      </Card>

      <p className="text-[11px] text-stone-400">Plate cost uses each ingredient's latest average buying price — updated automatically when you receive stock in Purchases &amp; Receipts.</p>
    </>
  )
}
