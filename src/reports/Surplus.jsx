import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, dayKey } from '../utils.js'
import { Card, DataTable, Exports, Note, NeedsData, slug, pct } from './shared.jsx'
import {
  KINDS, recovery, remaining, surplusStatus, STATUS_LABEL, discountPct,
  destinationLabel, needsCollector,
} from '../surplus.js'

/**
 * Is the surplus counter worth running?
 *
 * Two halves that must never read as one number. The top half is MONEY: cash taken
 * for food that was otherwise going in a bin. It is not a discount and is never shown
 * as one — nobody gave anything away here, the alternative to each of these sales was
 * zero (see recovery() in src/surplus.js). The bottom half is DISPOSAL: plate waste,
 * which is not food any more and can never be sold. Kilos, not rupees.
 *
 * The number the owner should act on is neither of those, though. It is "which dishes
 * come back every night" — a dish that is listed as surplus five nights out of six is
 * being over-produced, and the fix for that is in the kitchen's prep sheet, not in how
 * deep the markdown goes.
 */
export default function Surplus({ state, range }) {
  const listings = state.surplus || []
  const plate = state.plateWaste || []

  const rec = useMemo(() => recovery(listings, range), [listings, range])

  /**
   * Per-listing figures, built with recovery()'s own rules so the table and its totals
   * row can never disagree.
   *
   * The subtlety is that the two halves of a listing are dated differently, and that
   * is deliberate in the model: MONEY is dated by the stamp on each portion sold
   * (l.sales), because a tray put out at 10pm and sold out after midnight took its
   * cash today; the TRAY itself is dated by when it was put out. So a listing from
   * last night can legitimately appear here for the money it took this morning, and
   * its portions are not counted as "listed" in this period. `sold` can also be
   * NEGATIVE inside a range that contains a void of an earlier sale — the sales
   * ledger is append-only, so a reversal is a negative entry rather than a deletion.
   */
  const rows = useMemo(() => {
    const inRange = (t) => t >= range.from && t <= range.to // exactly recovery()'s test
    return listings.map((l) => {
      const status = surplusStatus(l)
      const listedInRange = inRange(l.createdAt || 0)
      let sold = 0, recovered = 0
      if (Array.isArray(l.sales) && l.sales.length) {
        l.sales.forEach((sale) => {
          if (!inRange(sale.at)) return
          const q = +sale.qty || 0
          sold += q
          recovered += q * (sale.price ?? l.price ?? 0)
        })
      } else if (listedInRange) {
        // listings from before portions were stamped (and the seeded demo rows)
        sold = +l.soldQty || 0
        recovered = sold * (+l.price || 0)
      }
      return {
        id: l.id, name: l.name, kind: l.kind, status, listedInRange,
        fullPrice: +l.fullPrice || 0, price: +l.price || 0, off: discountPct(l),
        qty: listedInRange ? +l.qty || 0 : 0,
        sold, recovered,
        // what actually still went out: portions left on a tray past its sell-by. A
        // tray the owner PULLED reads 'cancelled', so pulling early is not food lost.
        expired: listedInRange && status === 'expired' ? remaining(l) : 0,
        createdAt: l.createdAt || 0,
      }
    })
      // keep a listing that was put out in this period, or that took money in it
      .filter((r) => r.listedInRange || r.sold !== 0)
      .sort((a, b) => b.createdAt - a.createdAt)
  }, [listings, range])

  const listedRows = rows.filter((r) => r.listedInRange)
  const carriedOver = rows.filter((r) => !r.listedInRange)

  // THE insight: a dish on the counter night after night is an over-production
  // problem, not a pricing one. Nights are counted with dayKey (local day parts) —
  // toISOString would file a 1am listing to the previous night.
  const repeats = useMemo(() => {
    const m = {}
    // only trays actually PUT OUT in this period — the signal is how many nights the
    // kitchen had this dish over, not which nights its money happened to land
    rows.filter((r) => r.listedInRange).forEach((r) => {
      const g = (m[r.name] = m[r.name] || { name: r.name, kind: r.kind, times: 0, portions: 0, sold: 0, expired: 0, recovered: 0, nights: new Set() })
      g.times++
      g.portions += r.qty
      g.sold += r.sold
      g.expired += r.expired
      g.recovered += r.recovered
      if (r.createdAt) g.nights.add(dayKey(r.createdAt))
    })
    return Object.values(m)
      .map((g) => ({ ...g, nights: g.nights.size }))
      .sort((a, b) => b.nights - a.nights || b.times - a.times || b.portions - a.portions)
  }, [rows])

  const habitual = repeats.filter((g) => g.nights >= 3)

  // ---- the feed / disposal side. Kilos and destinations, deliberately no rupees ----
  const waste = useMemo(() => plate.filter((w) => (w.at || 0) >= range.from && (w.at || 0) < range.to), [plate, range])
  const wasteKg = waste.reduce((s, w) => s + (+w.kg || 0), 0)

  const byDest = useMemo(() => {
    const m = {}
    waste.forEach((w) => {
      const k = w.destination || 'bin'
      const d = (m[k] = m[k] || { key: k, label: destinationLabel(k), kg: 0, pickups: 0, feed: needsCollector(k) })
      d.kg += +w.kg || 0
      d.pickups++
    })
    return Object.values(m).sort((a, b) => b.kg - a.kg)
  }, [waste])

  const collectors = useMemo(() => {
    const m = {}
    waste.forEach((w) => {
      const nm = w.collector?.name
      if (!nm) return
      const c = (m[nm] = m[nm] || { name: nm, phone: w.collector.phone || '', pickups: 0, kg: 0, dests: new Set() })
      c.pickups++
      c.kg += +w.kg || 0
      c.dests.add(destinationLabel(w.destination))
    })
    return Object.values(m)
      .map((c) => ({ ...c, dests: [...c.dests].join(', ') }))
      .sort((a, b) => b.pickups - a.pickups || b.kg - a.kg)
  }, [waste])

  // kilos that left as feed vs kilos that went to a bin or biogas
  const fedKg = byDest.filter((d) => d.feed).reduce((s, d) => s + d.kg, 0)

  const sellThroughText = rec.sellThrough == null ? '—' : Math.round(rec.sellThrough * 100) + '%'

  const buildRows = () => {
    const out = [['SURPLUS COUNTER — ' + range.label], [],
      ['Recovered ₹ (money taken for food that was going in a bin)', Math.round(rec.recovered)],
      ['Forgone against menu price ₹', Math.round(rec.forgone)],
      ['Would have fetched at menu price ₹', Math.round(rec.fullValue)],
      ['Portions sold', rec.portionsSold],
      ['Portions that still expired', rec.portionsLost],
      ['Sell-through %', rec.sellThrough == null ? 'n/a — nothing listed has been sold or expired yet' : Math.round(rec.sellThrough * 100)],
      ['Listings put out in this period', listedRows.length],
      ['Earlier listings that took money in this period', carriedOver.length],
      [], ['LISTINGS'],
      ['Dish', 'Kind', 'Status', 'Menu price ₹', 'Sale price ₹', 'Discount %', 'Listed', 'Sold', 'Expired', 'Recovered ₹', 'Put out in this period']]
    rows.forEach((r) => out.push([
      r.name, KINDS[r.kind] || r.kind, STATUS_LABEL[r.status]?.[1] || r.status,
      r.fullPrice, r.price, r.off, r.listedInRange ? r.qty : '', r.sold, r.expired, Math.round(r.recovered),
      r.listedInRange ? 'Yes' : 'No — money only',
    ]))

    if (repeats.length) {
      out.push([], ['DISHES THAT COME BACK AS SURPLUS'], ['Dish', 'Nights listed', 'Times listed', 'Portions listed', 'Sold', 'Expired', 'Recovered ₹'])
      repeats.forEach((g) => out.push([g.name, g.nights, g.times, g.portions, g.sold, g.expired, Math.round(g.recovered)]))
    }

    out.push([], ['PLATE WASTE — DISPOSAL, NOT REVENUE'],
      ['Plate waste is food returned from tables. It is never sold to anyone.'], [],
      ['Destination', 'Kg', 'Pickups', 'Leaves as feed'])
    byDest.forEach((d) => out.push([d.label, +d.kg.toFixed(2), d.pickups, d.feed ? 'Yes' : 'No']))
    out.push([], ['Total kg', +wasteKg.toFixed(2)], ['Kg that left as animal feed', +fedKg.toFixed(2)])

    if (collectors.length) {
      out.push([], ['COLLECTORS'], ['Collector', 'Phone', 'Pickups', 'Kg', 'Destination'])
      collectors.forEach((c) => out.push([c.name, c.phone || '—', c.pickups, +c.kg.toFixed(2), c.dests]))
    }
    return out
  }

  if (!listings.length && !plate.length) {
    return (
      <NeedsData icon="♻️" title="Nothing listed and nothing weighed yet">
        List a tray on the surplus counter, or weigh a plate-waste pickup, in <b>Leftovers &amp; waste</b>.
        This report then answers whether the counter is paying for itself — and keeps the money side
        and the disposal side apart, because they are two different things.
      </NeedsData>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3 kp-noprint">
        <Exports build={buildRows} name={`khaanapeena-surplus-${slug(range)}`} title="Surplus & plate waste" period={range.label} settings={state.settings} />
      </div>

      {/* ---------- MONEY ---------- */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Recovered" value={inr0(rec.recovered)} sub={`${rec.portionsSold} portion${rec.portionsSold === 1 ? '' : 's'} sold`} icon="♻️" accent="green" />
        <StatCard label="Forgone vs menu price" value={inr0(rec.forgone)} sub={`menu value ${inr0(rec.fullValue)}`} icon="🏷️" accent="saffron" />
        <StatCard label="Portions sold" value={rec.portionsSold} sub={`${listedRows.length} tray${listedRows.length === 1 ? '' : 's'} put out`} icon="🍱" accent="blue" />
        <StatCard label="Still expired" value={rec.portionsLost} sub={rec.portionsLost ? 'went out unsold' : 'nothing lost'} icon="🗑️" accent={rec.portionsLost ? 'red' : 'green'} />
        {/* sell-through can be genuinely undefined; an em dash is the honest answer,
            because rendering 0% would read as "we sold none of it" */}
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <div className="text-xs text-stone-500 font-medium">Sell-through</div>
          <div className={`text-2xl font-bold tabular-nums ${rec.sellThrough == null ? 'text-stone-400' : rec.sellThrough >= 0.8 ? 'text-leaf-600' : rec.sellThrough >= 0.5 ? 'text-amber-600' : 'text-red-600'}`}>
            {sellThroughText}
          </div>
          <div className="text-[11px] text-stone-400 leading-tight">
            {rec.sellThrough == null
              ? 'nothing listed has sold or expired yet — there is nothing to divide by'
              : `${rec.portionsSold} sold of ${rec.portionsSold + rec.portionsLost} that found an answer`}
          </div>
        </div>
      </div>

      <Note tone="green">
        <b>{inr0(rec.recovered)} recovered is revenue, not a discount given.</b> Every rupee here was taken for food whose
        only other destination was a bin, so it is never counted against the discount report. The {inr0(rec.forgone)} gap
        to menu price sits beside it so you can judge whether the markdown is too deep — not so it can be written off as a loss.
      </Note>

      {habitual.length > 0 && (
        <Note tone="amber">
          <b>{habitual.length === 1 ? `${habitual[0].name} has` : `${habitual.length} dishes have`} come back as surplus on {habitual.length === 1 ? `${habitual[0].nights} separate nights` : '3 or more nights'}.</b>{' '}
          That is an over-production signal, and the markdown is not the fix — cut the prep quantity for
          {habitual.length === 1 ? ' it' : ' them'} instead: {habitual.slice(0, 4).map((g) => `${g.name} (${g.nights} nights)`).join(', ')}
          {habitual.length > 4 ? `, +${habitual.length - 4} more` : ''}.
        </Note>
      )}

      {rec.portionsLost > 0 && (
        <Note tone="red">
          <b>{rec.portionsLost} portion{rec.portionsLost === 1 ? '' : 's'} still went out past the sell-by.</b>{' '}
          Either they were listed too late in the service to find a buyer, or the price was not low enough to move them —
          {rec.sellThrough != null ? ` sell-through was ${sellThroughText}.` : ' there is not enough history yet to say which.'}
        </Note>
      )}

      {carriedOver.length > 0 && (
        <Note tone="blue">
          {carriedOver.length === 1 ? 'One tray was' : `${carriedOver.length} trays were`} put out before this period and took
          money inside it — {carriedOver.map((r) => r.name).slice(0, 3).join(', ')}
          {carriedOver.length > 3 ? `, +${carriedOver.length - 3} more` : ''}. {carriedOver.length === 1 ? 'It is' : 'They are'} listed
          below for that cash, with <b>—</b> in the Listed column: the portions belong to the night the tray went out, the money
          belongs to the day it came in. A late tray sold out after midnight is exactly this case.
        </Note>
      )}

      <Card
        flush
        title="Listings in this period"
        sub="Newest first. Sale price IS the price on the bill — nothing here runs through the bill's discount fields."
      >
        <DataTable
          scroll
          rows={rows}
          keyOf={(r) => r.id}
          empty="Nothing was listed on the surplus counter in this period."
          cols={[
            { h: 'Dish', cell: (r) => (
              <div>
                <div className="font-semibold text-ink-900">{r.name}</div>
                <div className="text-[11px] text-stone-400">{KINDS[r.kind] || r.kind}</div>
              </div>
            ), foot: () => 'Total' },
            { h: 'Status', cell: (r) => <Badge color={STATUS_LABEL[r.status]?.[0] || 'stone'}>{STATUS_LABEL[r.status]?.[1] || r.status}</Badge> },
            { h: 'Menu price', num: true, cell: (r) => r.fullPrice ? <span className="text-stone-400 line-through">{inr0(r.fullPrice)}</span> : <span className="text-stone-300">—</span> },
            { h: 'Sale price', num: true, cell: (r) => <b className="text-leaf-600">{inr0(r.price)}</b> },
            { h: 'Off', num: true, cell: (r) => r.off > 0 ? <Badge color={r.off >= 60 ? 'red' : r.off >= 40 ? 'amber' : 'green'}>−{r.off}%</Badge> : <span className="text-stone-300">—</span> },
            // a tray listed before this period shows an em dash rather than a count it
            // would then be double-counted for in the period it was actually put out
            { h: 'Listed', num: true, cell: (r) => r.listedInRange ? r.qty : <span className="text-stone-300" title="Put out before this period">—</span>, foot: () => listedRows.reduce((s, r) => s + r.qty, 0) },
            { h: 'Sold', num: true, cell: (r) => r.sold || <span className="text-stone-300">0</span>, foot: () => rec.portionsSold },
            { h: 'Expired', num: true, cell: (r) => r.expired ? <span className="text-red-600 font-semibold">{r.expired}</span> : <span className="text-stone-300">0</span>, foot: () => rec.portionsLost },
            { h: 'Recovered', num: true, cell: (r) => r.recovered ? <b>{inr0(r.recovered)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(rec.recovered) },
          ]}
        />
      </Card>

      <Card
        flush
        title="Which dishes keep coming back"
        sub="The number that matters here is nights, not rupees — a dish on the counter most nights is being over-produced upstream"
      >
        <DataTable
          scroll
          rows={repeats}
          keyOf={(r) => r.name}
          empty="Nothing listed yet in this period."
          cols={[
            { h: 'Dish', cell: (r) => (
              <div>
                <div className="font-semibold text-ink-900">{r.name}</div>
                <div className="text-[11px] text-stone-400">{KINDS[r.kind] || r.kind}</div>
              </div>
            ), foot: () => 'Total' },
            { h: 'Nights listed', num: true, cell: (r) => <Badge color={r.nights >= 3 ? 'red' : r.nights === 2 ? 'amber' : 'stone'}>{r.nights}</Badge> },
            { h: 'Times listed', num: true, cell: (r) => r.times, foot: () => repeats.reduce((s, r) => s + r.times, 0) },
            { h: 'Portions listed', num: true, cell: (r) => r.portions, foot: () => repeats.reduce((s, r) => s + r.portions, 0) },
            { h: 'Sold', num: true, cell: (r) => r.sold, foot: () => repeats.reduce((s, r) => s + r.sold, 0) },
            { h: 'Expired', num: true, cell: (r) => r.expired || <span className="text-stone-300">0</span>, foot: () => repeats.reduce((s, r) => s + r.expired, 0) },
            { h: 'Sell-through', num: true, cell: (r) => (r.sold + r.expired) > 0 ? pct(r.sold, r.sold + r.expired) + '%' : <span className="text-stone-300">—</span> },
            { h: 'Recovered', num: true, cell: (r) => inr0(r.recovered), foot: () => inr0(repeats.reduce((s, r) => s + r.recovered, 0)) },
          ]}
        />
      </Card>

      {/* ---------- DISPOSAL. Its own band, its own unit, no rupees anywhere ----------
          Plate waste came back from a table. It is not food any more and there is no
          code path in this app that can turn it into something sellable — and this
          report must not become the first place that reads as if there were. */}
      <div className="mt-8 mb-3 pt-5 border-t-4 border-stone-200">
        <h2 className="text-lg font-black text-ink-900">🐄 Plate waste — where it went</h2>
        <p className="text-xs text-stone-400">
          Food returned from tables, weighed at the back door. Measured in kilos and never in rupees:
          this is disposal, not revenue, and none of it can be sold to anyone.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatCard label="Plate waste weighed" value={`${wasteKg.toFixed(1)} kg`} sub={`${waste.length} pickup${waste.length === 1 ? '' : 's'}`} icon="⚖️" accent="purple" />
        <StatCard label="Left as animal feed" value={`${fedKg.toFixed(1)} kg`} sub={wasteKg ? `${pct(fedKg, wasteKg)}% of the total` : 'nothing weighed'} icon="🐄" accent="green" />
        <StatCard label="Destinations used" value={byDest.length} sub={byDest.length ? byDest[0].label : '—'} icon="🚚" accent="blue" />
        <StatCard label="Collectors" value={collectors.length} sub={collectors.length ? `${collectors[0].name} most often` : 'none recorded'} icon="🤝" accent="saffron" />
      </div>

      {waste.length === 0 ? (
        <Card className="kp-card"><Empty icon="⚖️" text="No plate waste weighed in this period." /></Card>
      ) : (
        <>
          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="Kg by destination" sub="Where the trays actually went">
              <DataTable
                rows={byDest}
                keyOf={(d) => d.key}
                cols={[
                  { h: 'Destination', cell: (d) => (
                    <div>
                      <div className="font-semibold text-ink-900">{d.label}</div>
                      <div className="text-[11px] text-stone-400">{d.feed ? 'leaves as feed — a collector is recorded' : 'disposal'}</div>
                    </div>
                  ), foot: () => 'Total' },
                  { h: 'Kg', num: true, cell: (d) => d.kg.toFixed(1), foot: () => wasteKg.toFixed(1) },
                  { h: 'Pickups', num: true, cell: (d) => d.pickups, foot: () => waste.length },
                  { h: 'Share', num: true, cell: (d) => pct(d.kg, wasteKg) + '%' },
                ]}
              />
            </Card>

            <Card className="!mb-0 kp-card" title="Kilos by destination" sub="Same figures as a bar, for the FSSAI file">
              {wasteKg > 0
                ? <HBars data={byDest.map((d) => ({ label: d.label, value: +d.kg.toFixed(1) }))} color="#9333ea" fmt={(v) => `${v} kg`} />
                : <Empty icon="⚖️" text="Nothing weighed yet" />}
            </Card>
          </div>

          <Card
            flush
            className="kp-card"
            title="Collectors"
            sub="Who took food off the premises, and how often — this is the record an inspector asks for"
          >
            <DataTable
              rows={collectors}
              keyOf={(c) => c.name}
              empty="No collector was named on any pickup in this period."
              cols={[
                { h: 'Collector', cell: (c) => (
                  <div>
                    <div className="font-semibold text-ink-900">{c.name}</div>
                    <div className="text-[11px] text-stone-400">{c.phone || 'no phone recorded'}</div>
                  </div>
                ), foot: () => 'Total' },
                { h: 'Taken for', cell: (c) => <span className="text-xs text-stone-600">{c.dests}</span> },
                { h: 'Pickups', num: true, cell: (c) => c.pickups, foot: () => collectors.reduce((s, c) => s + c.pickups, 0) },
                { h: 'Kg', num: true, cell: (c) => c.kg.toFixed(1), foot: () => collectors.reduce((s, c) => s + c.kg, 0).toFixed(1) },
              ]}
            />
          </Card>

          {byDest.some((d) => d.feed) && collectors.length === 0 && (
            <Note tone="red">
              Food left the premises as feed with <b>no collector named</b> on any pickup. That is the one line an FSSAI
              inspector asks for, and without it "it went to the gaushala" is the answer to every missing tray.
            </Note>
          )}
        </>
      )}

      <p className="text-[11px] text-stone-400">
        Surplus is live food, sellable until its sell-by; plate waste is not food and is never sellable. The two are
        held in separate stores with no path between them, which is why they are added up separately here.
      </p>
    </>
  )
}
