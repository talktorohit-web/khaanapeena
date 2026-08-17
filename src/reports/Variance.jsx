import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Badge, Empty, btnPrimary } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, Exports, Note, pct } from './shared.jsx'

/**
 * Theoretical vs actual stock — the report that finds the money nobody can explain.
 *
 * The till already knows what the recipes SHOULD have consumed (stock is deducted
 * on every KOT) and what came in (every GRN adds to it). So the system figure is
 * the theoretical one. The only number it cannot know is what is physically on the
 * shelf — that needs a human with a weighing scale. The difference between the two
 * is over-portioning, spoilage that was never logged, or theft.
 *
 * With two counts we do better still: expected closing = last count + everything
 * received since − everything the recipes say was cooked since. That baseline
 * resets at each count, so a single bad reading never poisons every later report.
 */
export default function Variance() {
  const { state, recordStockTake } = useStore()
  const [counting, setCounting] = useState(false)
  const [counts, setCounts] = useState({})
  const [correct, setCorrect] = useState(true)

  const ings = state.ingredients || []
  const takes = useMemo(() => [...(state.stockTakes || [])].sort((a, b) => b.at - a.at), [state.stockTakes])
  const latest = takes[0]
  const previous = takes[1]

  const ingOf = (id) => ings.find((g) => g.id === id)

  // recipe-driven consumption between two moments (same rule the till uses to
  // deduct stock: a KOT'd order consumes its recipes)
  const usageBetween = (from, to) => {
    const u = {}
    ;(state.orders || []).forEach((o) => {
      if (!o.kotAt || o.kotAt <= from || o.kotAt > to || o.status === 'cancelled') return
      ;(o.items || []).forEach((li) => {
        const item = (state.items || []).find((i) => i.id === li.itemId)
        item?.recipe?.forEach(({ ingId, qty }) => { u[ingId] = (u[ingId] || 0) + qty * li.qty })
      })
    })
    return u
  }
  const receiptsBetween = (from, to) => {
    const r = {}
    ;(state.grns || []).forEach((g) => {
      if (g.date <= from || g.date > to) return
      ;(g.lines || []).forEach((l) => { r[l.ingId] = (r[l.ingId] || 0) + (+l.qty || 0) })
    })
    return r
  }
  const wasteBetween = (from, to) => {
    // logged waste is an explained loss — subtract it so it doesn't read as theft
    const w = {}
    ;(state.waste || []).forEach((x) => {
      const ts = new Date(x.date).getTime()
      if (!(ts > from && ts <= to)) return
      const g = ings.find((i) => x.itemName && x.itemName.toLowerCase().includes(i.name.toLowerCase()))
      if (!g) return
      const qty = parseFloat(String(x.qty)) || 0
      w[g.id] = (w[g.id] || 0) + qty
    })
    return w
  }

  const rows = useMemo(() => {
    if (!latest) return []
    const from = previous?.at ?? 0
    const usage = previous ? usageBetween(from, latest.at) : {}
    const recv = previous ? receiptsBetween(from, latest.at) : {}
    const wasted = previous ? wasteBetween(from, latest.at) : {}
    const prevCount = {}
    previous?.lines?.forEach((l) => { prevCount[l.ingId] = l.counted })

    return latest.lines.map((l) => {
      const g = ingOf(l.ingId)
      // with a prior count we rebuild the expected balance from first principles;
      // without one the till's own running figure is the theoretical number
      const expected = previous && prevCount[l.ingId] != null
        ? prevCount[l.ingId] + (recv[l.ingId] || 0) - (usage[l.ingId] || 0) - (wasted[l.ingId] || 0)
        : l.system
      const varQty = l.counted - expected
      return {
        ingId: l.ingId, name: g?.name || l.ingId, unit: g?.unit || '',
        counted: l.counted, expected, system: l.system,
        received: recv[l.ingId] || 0, used: usage[l.ingId] || 0, wasted: wasted[l.ingId] || 0,
        varQty, varValue: varQty * (l.cost || g?.costPerUnit || 0),
        varPct: expected > 0 ? (varQty / expected) * 100 : null,
      }
    }).sort((a, b) => a.varValue - b.varValue)
  }, [latest, previous, state.orders, state.grns, state.waste, ings])

  const shortage = rows.filter((r) => r.varQty < -0.001)
  const surplus = rows.filter((r) => r.varQty > 0.001)
  const lossValue = Math.abs(shortage.reduce((s, r) => s + r.varValue, 0))
  const gainValue = surplus.reduce((s, r) => s + r.varValue, 0)
  const netValue = rows.reduce((s, r) => s + r.varValue, 0)
  const countedValue = rows.reduce((s, r) => s + r.counted * (ingOf(r.ingId)?.costPerUnit || 0), 0)

  const startCount = () => {
    const seed = {}
    ings.forEach((g) => { seed[g.id] = '' })
    setCounts(seed)
    setCounting(true)
  }
  const save = () => {
    const lines = ings
      .filter((g) => counts[g.id] !== '' && counts[g.id] != null)
      .map((g) => ({ ingId: g.id, system: g.stock, counted: +counts[g.id] || 0, cost: g.costPerUnit }))
    if (!lines.length) return
    recordStockTake(lines, { correct })
    setCounting(false)
    setCounts({})
  }

  const buildRows = () => {
    const out = [['STOCK VARIANCE'],
      ['Counted on', latest ? new Date(latest.at).toLocaleString('en-IN') : ''],
      ['Counted by', latest?.by || ''],
      ['Compared against', previous ? `previous count of ${new Date(previous.at).toLocaleString('en-IN')}` : 'the till\'s running stock figure'],
      [], ['Shortage value ₹', Math.round(lossValue)], ['Surplus value ₹', Math.round(gainValue)], ['Net ₹', Math.round(netValue)],
      [], ['Ingredient', 'Unit', 'Expected', 'Counted', 'Difference', 'Difference %', 'Value ₹', 'Received since', 'Recipes used', 'Waste logged']]
    rows.forEach((r) => out.push([
      r.name, r.unit, +r.expected.toFixed(3), +r.counted.toFixed(3), +r.varQty.toFixed(3),
      r.varPct == null ? '' : r.varPct.toFixed(1), Math.round(r.varValue),
      +r.received.toFixed(3), +r.used.toFixed(3), +r.wasted.toFixed(3),
    ]))
    return out
  }

  // ---- counting sheet ----
  if (counting) {
    return (
      <Card flush title="📋 Stock take — count what's actually there" sub="Weigh or count each item and type the real number. Leave a row blank to skip it.">
        <div className="px-5 pb-3 flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input type="checkbox" checked={correct} onChange={(e) => setCorrect(e.target.checked)} className="w-4 h-4 accent-saffron-600" />
            Correct the system stock to what I counted
          </label>
          <div className="flex-1" />
          <button onClick={() => setCounting(false)} className="border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} className={btnPrimary}>Save count</button>
        </div>
        <DataTable
          scroll
          rows={ings}
          keyOf={(g) => g.id}
          cols={[
            { h: 'Ingredient', cell: (g) => <span className="font-semibold">{g.name}</span> },
            { h: 'Till says', num: true, cell: (g) => <span className="text-stone-500">{g.stock} {g.unit}</span> },
            { h: 'You counted', num: true, cell: (g) => (
              <input
                type="number" step="0.001" min="0" inputMode="decimal"
                value={counts[g.id] ?? ''}
                onChange={(e) => setCounts((c) => ({ ...c, [g.id]: e.target.value }))}
                placeholder={String(g.stock)}
                className="w-28 border border-stone-200 rounded-lg px-2 py-1.5 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-saffron-300"
              />
            ) },
            { h: 'Unit', cell: (g) => <span className="text-stone-400 text-xs">{g.unit}</span> },
            { h: 'Difference', num: true, cell: (g) => {
              const v = counts[g.id]
              if (v === '' || v == null) return <span className="text-stone-300">—</span>
              const d = (+v || 0) - g.stock
              if (Math.abs(d) < 0.001) return <Badge color="green">tallies</Badge>
              return <Badge color={d < 0 ? 'red' : 'blue'}>{d > 0 ? '+' : ''}{+d.toFixed(3)} {g.unit}</Badge>
            } },
            { h: 'Value', num: true, cell: (g) => {
              const v = counts[g.id]
              if (v === '' || v == null) return <span className="text-stone-300">—</span>
              const d = ((+v || 0) - g.stock) * g.costPerUnit
              return <span className={d < 0 ? 'text-red-600 font-bold' : 'text-stone-500'}>{d > 0 ? '+' : ''}{inr0(d)}</span>
            } },
          ]}
        />
        <div className="px-5 py-4 flex justify-end gap-2">
          <button onClick={() => setCounting(false)} className="border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2 text-sm">Cancel</button>
          <button onClick={save} className={btnPrimary}>Save count</button>
        </div>
      </Card>
    )
  }

  // ---- never counted ----
  if (!latest) {
    return (
      <>
        <Card title="⚖️ Where is your food actually going?" sub="The one report that finds losses nothing else can see">
          <div className="text-sm text-stone-600 space-y-3 leading-relaxed max-w-2xl">
            <p>
              Your till already knows what your recipes <b>should</b> have used — it deducts ingredients from stock
              every time a KOT is fired, and adds them back every time you receive a delivery.
            </p>
            <p>
              What it cannot know is what's <b>actually</b> on your shelf. The gap between the two is the money that
              disappears quietly: over-generous portions, spoilage nobody logged, and staff taking stock home.
            </p>
            <p className="font-semibold text-ink-900">
              Count your godown once and this report tells you, in rupees, exactly where the gap is.
            </p>
          </div>
          <button onClick={startCount} className={btnPrimary + ' mt-4'}>📋 Start a stock take</button>
        </Card>
        <Note tone="blue">
          Do this on a quiet morning before service, and repeat it weekly or monthly. From the second count onwards the
          report gets sharper — it compares against your last count plus everything received minus everything cooked,
          so it isolates exactly what went missing in between.
        </Note>
      </>
    )
  }

  return (
    <>
      <div className="flex justify-end gap-2 mb-3">
        <Exports
          build={buildRows}
          name={`khaanapeena-stock-variance-${new Date(latest.at).toISOString().slice(0, 10)}`}
          title="Stock variance"
          settings={state.settings}
        />
        <button onClick={startCount} className={btnPrimary + ' !py-1.5 !px-3 !text-xs'}>📋 New stock take</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Missing stock" value={inr0(lossValue)} sub={`${shortage.length} ingredient${shortage.length === 1 ? '' : 's'} short`} icon="📉" accent={lossValue > 0 ? 'red' : 'green'} />
        <StatCard label="More than expected" value={inr0(gainValue)} sub={`${surplus.length} over`} icon="📈" accent="blue" />
        <StatCard label="Net variance" value={(netValue > 0 ? '+' : '') + inr0(netValue)} sub={countedValue ? `${pct(Math.abs(netValue), countedValue)}% of stock value` : ''} icon="⚖️" accent={Math.abs(netValue) > countedValue * 0.03 ? 'red' : 'green'} />
        <StatCard label="Counted stock value" value={inr0(countedValue)} sub={`${latest.lines.length} ingredients counted`} icon="📦" accent="saffron" />
        <StatCard label="Last counted" value={new Date(latest.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} sub={`by ${latest.by}`} icon="🗓️" accent="purple" />
      </div>

      {!previous && (
        <Note tone="blue">
          This is your <b>first count</b>, so it's measured against the till's own running stock figure. Count again next
          week and the report becomes far sharper — it will then compare against your last count plus deliveries minus
          what the recipes say you cooked, isolating exactly what went missing in between.
        </Note>
      )}

      {lossValue > countedValue * 0.03 && countedValue > 0 && (
        <Note tone="red">
          <b>{inr0(lossValue)} of stock is unaccounted for</b> — that's {pct(lossValue, countedValue)}% of everything on your shelf.
          Anything over 2–3% is worth investigating. Start with the biggest rupee gaps below, not the biggest quantity gaps.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" title="Biggest losses by value" sub="Rupees, not kilos — this is where to look first">
          {shortage.length ? (
            <HBars data={shortage.slice(0, 8).map((r) => ({ label: r.name, value: Math.round(Math.abs(r.varValue)) }))} color="#dc2626" />
          ) : <Empty icon="✅" text="Nothing short — everything tallies" />}
        </Card>
        <Card className="!mb-0" title="How this was calculated">
          <div className="text-sm text-stone-600 space-y-2 leading-relaxed">
            {previous ? (
              <>
                <p>Compared against your count on <b>{new Date(previous.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long' })}</b>:</p>
                <div className="bg-stone-50 rounded-xl p-3 text-xs font-mono text-stone-600 leading-relaxed">
                  expected = last count<br />
                  &nbsp;&nbsp;+ received (deliveries)<br />
                  &nbsp;&nbsp;− used (recipes × dishes sold)<br />
                  &nbsp;&nbsp;− waste you logged<br />
                  <span className="text-ink-900 font-bold">difference = counted − expected</span>
                </div>
                <p className="text-xs text-stone-400">Logged waste is subtracted so an explained loss never reads as theft.</p>
              </>
            ) : (
              <p>Compared against the till's running stock figure, which is itself built from recipe deductions and deliveries.</p>
            )}
          </div>
        </Card>
      </div>

      <Card flush title="Ingredient-by-ingredient" sub="Shortages first — a negative number means less was there than there should have been">
        <DataTable
          scroll
          rows={rows}
          keyOf={(r) => r.ingId}
          cols={[
            { h: 'Ingredient', cell: (r) => <span className="font-semibold text-ink-900">{r.name}</span>, foot: () => 'Net' },
            { h: 'Expected', num: true, cell: (r) => `${+r.expected.toFixed(2)} ${r.unit}` },
            { h: 'Counted', num: true, cell: (r) => <b>{+r.counted.toFixed(2)} {r.unit}</b> },
            { h: 'Difference', num: true, cell: (r) => Math.abs(r.varQty) < 0.001
              ? <Badge color="green">tallies</Badge>
              : <Badge color={r.varQty < 0 ? 'red' : 'blue'}>{r.varQty > 0 ? '+' : ''}{+r.varQty.toFixed(2)} {r.unit}</Badge> },
            { h: '%', num: true, cell: (r) => r.varPct == null ? <span className="text-stone-300">—</span> : (r.varPct > 0 ? '+' : '') + r.varPct.toFixed(1) + '%' },
            { h: 'Value', num: true, cell: (r) => <span className={r.varValue < -0.5 ? 'text-red-600 font-bold' : r.varValue > 0.5 ? 'text-blue-600' : 'text-stone-400'}>{r.varValue > 0 ? '+' : ''}{inr0(r.varValue)}</span>, foot: () => inr0(netValue) },
            ...(previous ? [
              { h: 'Received', num: true, cell: (r) => r.received ? `+${+r.received.toFixed(2)}` : <span className="text-stone-300">—</span> },
              { h: 'Cooked', num: true, cell: (r) => r.used ? `−${+r.used.toFixed(2)}` : <span className="text-stone-300">—</span> },
            ] : []),
          ]}
        />
      </Card>

      {takes.length > 1 && (
        <Card flush title="Stock take history">
          <DataTable
            rows={takes}
            keyOf={(t) => t.id}
            cols={[
              { h: 'Counted on', cell: (t) => <span className="font-semibold">{new Date(t.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span> },
              { h: 'By', cell: (t) => t.by },
              { h: 'Ingredients', num: true, cell: (t) => t.lines.length },
              { h: 'Counted value', num: true, cell: (t) => inr0(t.lines.reduce((s, l) => s + l.counted * (l.cost || 0), 0)) },
              { h: 'Stock corrected', cell: (t) => t.corrected ? <Badge color="green">yes</Badge> : <Badge color="stone">no</Badge> },
            ]}
          />
        </Card>
      )}
    </>
  )
}
