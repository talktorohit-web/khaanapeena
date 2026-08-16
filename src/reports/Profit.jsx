import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Empty, Toggle } from '../components.jsx'
import { inr0, billTotals } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, pct, amt, isAggregator, spanDays, earliestOf } from './shared.jsx'

// Aggregator take-rates, same figures the Online Orders payout screen reconciles with
const COMMISSION = { zomato: 23, swiggy: 25, whatsapp: 0 }

const OVERHEADS = [
  ['rent', '🏠 Rent', 'Shop rent for a full month'],
  ['salaries', '👨‍🍳 Salaries', 'Cooks, waiters, helpers — total monthly'],
  ['electricity', '💡 Electricity & water', 'Average monthly bill'],
  ['gas', '🔥 Gas & fuel', 'LPG cylinders per month'],
  ['other', '📦 Other', 'Licences, internet, repairs, marketing'],
]

/**
 * A real profit-and-loss, not just a food-cost percentage.
 *
 * Everything above the overheads line comes from actual bills. The overheads are
 * typed in once by the owner as monthly figures and prorated across whatever date
 * range is selected — that's the only honest way to get to a net number, because a
 * POS never sees rent or salaries.
 */
export default function Profit({ state, range }) {
  const { update } = useStore()
  const [editing, setEditing] = useState(false)
  const ov = state.settings.overheads || {}
  const [draft, setDraft] = useState(ov)
  const [extrapolate, setExtrapolate] = useState(true)

  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  // overheads are prorated across this figure, so an unclamped "all time" would
  // charge the business rent since 1970
  const days = spanDays(range, earliestOf(paid, (o) => o.paidAt))
  const settings = state.settings

  const ings = state.ingredients || []
  const ingCost = (id) => ings.find((g) => g.id === id)?.costPerUnit || 0
  const plateCostOf = (itemId) => {
    const it = (state.items || []).find((i) => i.id === itemId)
    if (!it?.recipe?.length) return null
    return it.recipe.reduce((s, r) => s + r.qty * ingCost(r.ingId), 0)
  }

  // ---- revenue ----
  const own = paid.filter((o) => !isAggregator(o))
  const eco = paid.filter(isAggregator)

  // your own sales, net of the GST you merely collect on the government's behalf
  const ownNet = own.reduce((s, o) => {
    const bt = billTotals(o, settings)
    return s + bt.taxable + bt.svc
  }, 0)

  // aggregator money is what actually lands in the bank, not what the customer paid
  const ecoRows = ['zomato', 'swiggy'].map((ch) => {
    const os = eco.filter((o) => o.type === ch)
    const gross = os.reduce((s, o) => s + amt(o), 0)
    const comm = (gross * (COMMISSION[ch] || 0)) / 100
    const gstOnComm = comm * 0.18
    const tds = gross * 0.01
    return { ch, orders: os.length, gross, comm, gstOnComm, tds, net: gross - comm - gstOnComm - tds }
  }).filter((r) => r.orders > 0)
  const ecoGross = ecoRows.reduce((s, r) => s + r.gross, 0)
  const ecoNet = ecoRows.reduce((s, r) => s + r.net, 0)
  const ecoKept = ecoGross - ecoNet

  const netRevenue = ownNet + ecoNet

  // ---- cost of ingredients ----
  const cogs = useMemo(() => {
    let costed = 0, costedRev = 0, uncostedRev = 0
    paid.forEach((o) => (o.items || []).forEach((li) => {
      const pc = plateCostOf(li.itemId)
      const rev = li.price * li.qty
      if (pc == null) { uncostedRev += rev; return }
      costed += pc * li.qty
      costedRev += rev
    }))
    return { costed, costedRev, uncostedRev, coverage: costedRev + uncostedRev > 0 ? costedRev / (costedRev + uncostedRev) : 0 }
  }, [paid, state.items, ings])

  // dishes without a recipe are invisible to the cost side; assume they run at the
  // same food-cost ratio as the ones we can measure, or the bottom line flatters
  const costRatio = cogs.costedRev > 0 ? cogs.costed / cogs.costedRev : 0
  const estimatedExtra = extrapolate ? cogs.uncostedRev * costRatio : 0
  const totalCogs = cogs.costed + estimatedExtra

  // ---- other real costs ----
  const waste = (state.waste || []).filter((w) => {
    const ts = new Date(w.date).getTime()
    return ts >= range.from && ts < range.to
  })
  const wasteValue = waste.reduce((s, w) => s + (w.lossValue || 0), 0)

  const takesInRange = (state.stockTakes || []).filter((t) => t.at >= range.from && t.at < range.to)
  const shrinkage = takesInRange.reduce((s, t) => {
    const loss = t.lines.reduce((a, l) => {
      const d = (l.counted - l.system) * (l.cost || 0)
      return a + (d < 0 ? d : 0)
    }, 0)
    return s + Math.abs(loss)
  }, 0)

  const discounts = paid.reduce((s, o) => s + (o.payment?.discount || 0), 0)

  const monthlyOverheads = OVERHEADS.reduce((s, [k]) => s + (+ov[k] || 0), 0)
  const overheadsForPeriod = (monthlyOverheads / 30) * days

  const grossProfit = netRevenue - totalCogs - wasteValue - shrinkage
  const netProfit = grossProfit - overheadsForPeriod
  const hasOverheads = monthlyOverheads > 0

  const saveOverheads = () => {
    update((s) => {
      s.settings.overheads = OVERHEADS.reduce((a, [k]) => { a[k] = +draft[k] || 0; return a }, {})
    })
    setEditing(false)
  }

  const exportCsv = () => {
    const out = [['PROFIT & LOSS — ' + range.label],
      ['Period', `${new Date(range.from).toLocaleDateString('en-IN')} to ${new Date(Math.min(range.to, Date.now())).toLocaleDateString('en-IN')} (${days.toFixed(0)} days)`], [],
      ['REVENUE'],
      ['Your own sales (net of GST) ₹', Math.round(ownNet)],
      ['Aggregator customers paid ₹', Math.round(ecoGross)],
      ['Aggregator kept (commission + GST + TDS) ₹', -Math.round(ecoKept)],
      ['Aggregator money received ₹', Math.round(ecoNet)],
      ['NET REVENUE ₹', Math.round(netRevenue)], [],
      ['COSTS'],
      ['Ingredients (costed dishes) ₹', -Math.round(cogs.costed)],
      ...(extrapolate && estimatedExtra > 0 ? [['Ingredients (estimated, dishes without recipes) ₹', -Math.round(estimatedExtra)]] : []),
      ['Wastage logged ₹', -Math.round(wasteValue)],
      ['Stock shortage found on counting ₹', -Math.round(shrinkage)],
      ['GROSS PROFIT (before running costs) ₹', Math.round(grossProfit)],
      ['Gross margin %', pct(grossProfit, netRevenue)], [],
      ['RUNNING COSTS (monthly figures prorated over ' + days.toFixed(0) + ' days)'],
      ...OVERHEADS.map(([k, label]) => [label.replace(/^\S+\s/, '') + ' ₹', -Math.round(((+ov[k] || 0) / 30) * days)]),
      ['Total running costs ₹', -Math.round(overheadsForPeriod)], [],
      ['NET PROFIT ₹', Math.round(netProfit)],
      ['Net margin %', pct(netProfit, netRevenue)],
      ['Profit per day ₹', Math.round(netProfit / days)],
      [], ['Discounts given (already excluded from revenue) ₹', Math.round(discounts)],
      ['Recipe coverage %', Math.round(cogs.coverage * 100)]]
    download(`khaanapeena-profit-loss-${slug(range)}.csv`, out)
  }

  if (!paid.length) {
    return <Card><Empty icon="📈" text={`No settled bills in ${range.label.toLowerCase()}.`} /></Card>
  }

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} label="⬇️ Export P&L" /></div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Net revenue" value={inr0(netRevenue)} sub="what you actually received" icon="💰" accent="saffron" />
        <StatCard label="Gross profit" value={inr0(grossProfit)} sub={`${pct(grossProfit, netRevenue)}% after food costs`} icon="🍲" accent={grossProfit > 0 ? 'green' : 'red'} />
        <StatCard
          label={hasOverheads ? 'Net profit' : 'Net profit (incomplete)'}
          value={hasOverheads ? inr0(netProfit) : '—'}
          sub={hasOverheads ? `${pct(netProfit, netRevenue)}% margin · ${inr0(netProfit / days)}/day` : 'add your running costs below'}
          icon="📈"
          accent={!hasOverheads ? 'stone' : netProfit > 0 ? 'green' : 'red'}
        />
        <StatCard label="Recipe coverage" value={Math.round(cogs.coverage * 100) + '%'} sub={cogs.coverage >= 0.95 ? 'costs are accurate ✓' : 'add recipes for a truer figure'} icon="📋" accent={cogs.coverage >= 0.7 ? 'green' : 'red'} />
      </div>

      {!hasOverheads && (
        <Note>
          <b>Add your monthly running costs below</b> — rent, salaries, electricity, gas. Until then this page can only
          show profit <i>before</i> those costs, which always looks better than reality.
        </Note>
      )}

      {cogs.coverage < 0.95 && cogs.uncostedRev > 0 && (
        <Card className="!mb-4">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="max-w-xl">
              <h3 className="font-bold text-ink-900 text-sm">Estimate cost for dishes without a recipe</h3>
              <p className="text-xs text-stone-500 mt-1 leading-relaxed">
                {inr0(cogs.uncostedRev)} of your sales came from dishes with no recipe, so their ingredient cost is unknown.
                With this on, they're assumed to cost the same {(costRatio * 100).toFixed(0)}% of their price as your costed dishes —
                which keeps the bottom line honest instead of flattering. Add recipes in <b>Menu</b> to replace the estimate with real numbers.
              </p>
            </div>
            <Toggle on={extrapolate} onChange={setExtrapolate} />
          </div>
        </Card>
      )}

      {/* THE P&L */}
      <Card title={`Profit & loss — ${range.label}`} sub={`${days.toFixed(0)} days · read it top to bottom`}>
        <div className="max-w-2xl">
          <Group>Revenue</Group>
          <L l="Your own sales (dine-in, takeaway, QR)" note="net of the GST you collect for the government" v={ownNet} />
          {ecoRows.length > 0 && <>
            <L l="Zomato / Swiggy — customers paid" v={ecoGross} />
            <L l="Less what the aggregators kept" note="commission, GST on commission and TDS" v={-ecoKept} neg />
          </>}
          <Total l="Net revenue" v={netRevenue} />

          <Group>Cost of food</Group>
          <L l="Ingredients used (dishes with a recipe)" note={`${inr0(cogs.costedRev)} of sales`} v={-cogs.costed} neg />
          {extrapolate && estimatedExtra > 0 && (
            <L l="Ingredients used (estimated)" note={`${inr0(cogs.uncostedRev)} of sales from dishes with no recipe`} v={-estimatedExtra} neg dim />
          )}
          {wasteValue > 0 && <L l="Wastage you logged" v={-wasteValue} neg />}
          {shrinkage > 0 && <L l="Stock missing at the last count" note="found by counting the godown" v={-shrinkage} neg />}
          <Total l="Gross profit" v={grossProfit} sub={`${pct(grossProfit, netRevenue)}% of revenue`} />

          <Group>
            <div className="flex items-center justify-between">
              <span>Running costs</span>
              <button onClick={() => { setDraft(ov); setEditing((e) => !e) }} className="text-xs font-bold text-saffron-700 normal-case tracking-normal">
                {editing ? 'Cancel' : hasOverheads ? '✏️ Edit' : '➕ Add yours'}
              </button>
            </div>
          </Group>

          {editing ? (
            <div className="bg-stone-50 rounded-xl p-4 my-2">
              <p className="text-xs text-stone-500 mb-3">Enter what you pay <b>per month</b>. We'll spread it across whatever dates you're looking at.</p>
              <div className="grid sm:grid-cols-2 gap-3">
                {OVERHEADS.map(([k, label, hint]) => (
                  <label key={k} className="block">
                    <span className="text-xs font-semibold text-stone-600 block mb-1">{label}</span>
                    <input
                      type="number" min="0" inputMode="numeric"
                      value={draft[k] ?? ''}
                      onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))}
                      placeholder="0"
                      className="w-full border border-stone-200 rounded-lg px-3 py-2 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-saffron-300 bg-white"
                    />
                    <span className="text-[10px] text-stone-400">{hint}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-2 mt-4">
                <button onClick={() => setEditing(false)} className="border border-stone-200 hover:bg-white text-stone-700 font-semibold rounded-xl px-4 py-2 text-sm">Cancel</button>
                <button onClick={saveOverheads} className="bg-saffron-600 hover:bg-saffron-700 text-white font-semibold rounded-xl px-4 py-2 text-sm">Save running costs</button>
              </div>
            </div>
          ) : hasOverheads ? (
            <>
              {OVERHEADS.filter(([k]) => +ov[k] > 0).map(([k, label]) => (
                <L key={k} l={label} note={`${inr0(+ov[k])} a month`} v={-((+ov[k] / 30) * days)} neg />
              ))}
              <Total l="Net profit" v={netProfit} sub={`${pct(netProfit, netRevenue)}% margin · ${inr0(netProfit / days)} a day`} big />
            </>
          ) : (
            <p className="text-sm text-stone-400 py-3">Not entered yet — the figure above is profit <i>before</i> rent, salaries and bills.</p>
          )}
        </div>
      </Card>

      {ecoRows.length > 0 && (
        <Card flush title="What the aggregators kept" sub="The gap between what your customer paid and what reaches your bank">
          <DataTable
            rows={ecoRows}
            keyOf={(r) => r.ch}
            cols={[
              { h: 'Channel', cell: (r) => <span className="font-semibold capitalize">{r.ch} <span className="text-[10px] text-stone-400">@{COMMISSION[r.ch]}%</span></span>, foot: () => 'Total' },
              { h: 'Orders', num: true, cell: (r) => r.orders, foot: () => eco.length },
              { h: 'Customers paid', num: true, cell: (r) => inr0(r.gross), foot: () => inr0(ecoGross) },
              { h: 'less commission', num: true, cell: (r) => <span className="text-red-500">−{inr0(r.comm)}</span>, foot: () => inr0(ecoRows.reduce((s, r) => s + r.comm, 0)) },
              { h: 'less GST on it', num: true, cell: (r) => <span className="text-red-500">−{inr0(r.gstOnComm)}</span> },
              { h: 'less TDS', num: true, cell: (r) => <span className="text-red-500">−{inr0(r.tds)}</span> },
              { h: 'You receive', num: true, cell: (r) => <b className="text-leaf-600">{inr0(r.net)}</b>, foot: () => inr0(ecoNet) },
            ]}
          />
        </Card>
      )}

      <Card title="What this does and doesn't count">
        <div className="grid sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-bold text-leaf-600 mb-1">✓ Counted</div>
            <ul className="text-stone-600 space-y-1 text-xs leading-relaxed">
              <li>Every settled bill, net of the GST you pass on</li>
              <li>Aggregator commission, GST on it, and TDS</li>
              <li>Discounts (already taken off revenue)</li>
              <li>Ingredient cost from your recipes at latest buying rates</li>
              <li>Wastage you logged and stock missing at a count</li>
              <li>Running costs you entered, prorated by days</li>
            </ul>
          </div>
          <div>
            <div className="font-bold text-stone-400 mb-1">✕ Not counted</div>
            <ul className="text-stone-600 space-y-1 text-xs leading-relaxed">
              <li>Anything you paid in cash and never recorded</li>
              <li>Loan EMIs, deposits and one-off equipment purchases</li>
              <li>Your own drawings from the business</li>
              <li>Income tax (this is a business P&amp;L, not a tax return)</li>
              {cogs.coverage < 0.95 && <li>Real cost of dishes without a recipe {extrapolate ? '(estimated above)' : '(excluded — turn the estimate on)'}</li>}
            </ul>
          </div>
        </div>
        <p className="text-[11px] text-stone-400 mt-3">Treat this as a close working estimate for running the business day to day, not as audited accounts.</p>
      </Card>
    </>
  )
}

const Group = ({ children }) => (
  <div className="text-[11px] font-black uppercase tracking-wider text-stone-400 mt-5 mb-1 pb-1 border-b border-stone-100">{children}</div>
)

const L = ({ l, note, v, neg, dim }) => (
  <div className={`flex justify-between items-start py-1.5 gap-4 ${dim ? 'opacity-70' : ''}`}>
    <div className="min-w-0">
      <div className="text-sm text-stone-700">{l}</div>
      {note && <div className="text-[11px] text-stone-400">{note}</div>}
    </div>
    <div className={`text-sm tabular-nums shrink-0 ${neg ? 'text-red-600' : 'text-ink-900'}`}>
      {neg ? '−' : ''}{inr0(Math.abs(v))}
    </div>
  </div>
)

const Total = ({ l, v, sub, big }) => (
  <div className={`flex justify-between items-center border-t-2 border-stone-200 mt-2 pt-2 ${big ? 'mb-1' : ''}`}>
    <div>
      <div className={`font-black text-ink-900 ${big ? 'text-lg' : ''}`}>{l}</div>
      {sub && <div className="text-[11px] text-stone-400">{sub}</div>}
    </div>
    <div className={`font-black tabular-nums ${big ? 'text-2xl' : 'text-lg'} ${v < 0 ? 'text-red-600' : 'text-leaf-600'}`}>
      {v < 0 ? '−' : ''}{inr0(Math.abs(v))}
    </div>
  </div>
)
