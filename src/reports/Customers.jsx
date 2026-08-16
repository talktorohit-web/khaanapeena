import React, { useMemo } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars, Donut } from '../charts.jsx'
import { inr0 } from '../utils.js'
import { Card, DataTable, ExportBtn, Note, download, paidIn, slug, pct, amt } from './shared.jsx'

// birthdays are stored either as YYYY-MM-DD or MM-DD — take the month either way
const monthOf = (b) => {
  if (!b) return null
  const parts = String(b).split('-')
  return parts.length >= 3 ? +parts[1] : parts.length === 2 ? +parts[0] : null
}

export default function Customers({ state, range }) {
  const paid = useMemo(() => paidIn(state, range), [state.orders, range])
  const customers = state.customers || []

  // first-ever paid bill per customer, so "new" means new to the business —
  // not merely their first bill inside the selected window
  const firstBill = useMemo(() => {
    const m = {}
    ;(state.orders || []).forEach((o) => {
      if (o.status !== 'paid' || !o.customerId) return
      if (!m[o.customerId] || o.paidAt < m[o.customerId]) m[o.customerId] = o.paidAt
    })
    return m
  }, [state.orders])

  const identified = paid.filter((o) => o.customerId)
  const idRevenue = identified.reduce((s, o) => s + amt(o), 0)

  const seenInRange = [...new Set(identified.map((o) => o.customerId))]
  const newIds = seenInRange.filter((id) => firstBill[id] >= range.from)
  const repeatIds = seenInRange.filter((id) => firstBill[id] < range.from)

  // per-customer activity INSIDE the range (customers[] totals are lifetime)
  const rangeRows = useMemo(() => {
    const m = {}
    identified.forEach((o) => {
      const r = (m[o.customerId] = m[o.customerId] || { id: o.customerId, visits: 0, spend: 0, last: 0 })
      r.visits++; r.spend += amt(o); r.last = Math.max(r.last, o.paidAt)
    })
    return Object.values(m).map((r) => {
      const c = customers.find((x) => x.id === r.id) || {}
      return { ...r, name: c.name || 'Guest', phone: c.phone || '', points: c.points || 0, lifetimeSpend: c.totalSpend || 0, lifetimeVisits: c.visits || 0, isNew: firstBill[r.id] >= range.from }
    }).sort((a, b) => b.spend - a.spend)
  }, [identified, customers, firstBill, range])

  const topLifetime = [...customers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0)).slice(0, 12)
  const pointsOut = customers.reduce((s, c) => s + (c.points || 0), 0)
  const pointValue = pointsOut * (state.settings.loyaltyRedeemValue || 1)

  const thisMonth = new Date().getMonth() + 1
  const birthdays = customers.filter((c) => monthOf(c.birthday) === thisMonth)

  const LAPSE_DAYS = 45
  const lapsed = customers
    .filter((c) => c.lastVisit && Date.now() - c.lastVisit > LAPSE_DAYS * 864e5 && (c.visits || 0) >= 2)
    .sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0))

  const exportCsv = () => {
    const out = [['CUSTOMER REPORT — ' + range.label], [],
      ['Bills with a customer attached', identified.length, 'of', paid.length],
      ['Revenue from known customers ₹', Math.round(idRevenue)],
      ['New customers', newIds.length],
      ['Returning customers', repeatIds.length],
      ['Loyalty points outstanding', pointsOut],
      ['Points liability ₹', Math.round(pointValue)],
      [], ['ACTIVITY IN THIS PERIOD'], ['Customer', 'Phone', 'Visits', 'Spend ₹', 'Avg bill ₹', 'New?', 'Lifetime visits', 'Lifetime spend ₹', 'Points']]
    rangeRows.forEach((r) => out.push([
      r.name, r.phone, r.visits, Math.round(r.spend), Math.round(r.spend / r.visits), r.isNew ? 'NEW' : '',
      r.lifetimeVisits, Math.round(r.lifetimeSpend), r.points,
    ]))
    out.push([], ['ALL CUSTOMERS (lifetime)'], ['Customer', 'Phone', 'Visits', 'Total spend ₹', 'Avg bill ₹', 'Points', 'Last visit', 'Birthday'])
    ;[...customers].sort((a, b) => (b.totalSpend || 0) - (a.totalSpend || 0)).forEach((c) => out.push([
      c.name, c.phone || '', c.visits || 0, Math.round(c.totalSpend || 0),
      c.visits ? Math.round((c.totalSpend || 0) / c.visits) : 0, c.points || 0,
      c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('en-IN') : '', c.birthday || '',
    ]))
    if (birthdays.length) {
      out.push([], ['BIRTHDAYS THIS MONTH'], ['Customer', 'Phone', 'Birthday'])
      birthdays.forEach((c) => out.push([c.name, c.phone || '', c.birthday]))
    }
    if (lapsed.length) {
      out.push([], [`NOT SEEN IN ${LAPSE_DAYS}+ DAYS`], ['Customer', 'Phone', 'Visits', 'Total spend ₹', 'Last visit'])
      lapsed.forEach((c) => out.push([c.name, c.phone || '', c.visits, Math.round(c.totalSpend || 0), new Date(c.lastVisit).toLocaleDateString('en-IN')]))
    }
    download(`khaanapeena-customers-${slug(range)}.csv`, out)
  }

  if (!customers.length) {
    return <Card><Empty icon="👥" text="No customers saved yet. Attach a phone number while settling a bill and they'll build up here." /></Card>
  }

  const idRate = pct(identified.length, paid.length)

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Customers on file" value={customers.length} sub="all time" icon="👥" accent="saffron" />
        <StatCard label="New this period" value={newIds.length} sub={range.label} icon="✨" accent="green" />
        <StatCard label="Came back" value={repeatIds.length} sub={seenInRange.length ? `${pct(repeatIds.length, seenInRange.length)}% of visitors` : ''} icon="🔁" accent="blue" />
        <StatCard label="Bills with a name" value={idRate + '%'} sub={`${identified.length} of ${paid.length} bills`} icon="📇" accent={idRate < 30 ? 'red' : 'green'} />
        <StatCard label="Points you owe" value={inr0(pointValue)} sub={`${pointsOut} points outstanding`} icon="🎟️" accent="purple" />
      </div>

      {idRate < 30 && paid.length > 5 && (
        <Note>
          Only <b>{idRate}%</b> of bills have a customer attached, so most of this report is blind to who's actually eating with you. Ask for a phone number at the counter — it takes three seconds and turns every one of these bills into a customer you can bring back.
        </Note>
      )}

      <div className="grid lg:grid-cols-3 gap-4 mb-4">
        <Card className="!mb-0" title="New vs returning" sub={`Customers who visited in ${range.label.toLowerCase()}`}>
          {seenInRange.length ? (
            <Donut data={[{ label: 'Returning', value: repeatIds.length }, { label: 'New', value: newIds.length }]} />
          ) : <Empty text="No identified visits" />}
        </Card>
        <Card className="!mb-0 lg:col-span-2" title="Top customers by lifetime spend" sub="The people worth protecting">
          {topLifetime.length ? <HBars data={topLifetime.slice(0, 8).map((c) => ({ label: c.name, value: Math.round(c.totalSpend || 0) }))} /> : <Empty text="No spend recorded" />}
        </Card>
      </div>

      <Card flush title="Who came in this period" sub="Visits and spend inside the selected dates — lifetime figures shown alongside">
        <DataTable
          scroll
          rows={rangeRows}
          keyOf={(r) => r.id}
          empty="No bills in this period had a customer attached"
          cols={[
            { h: 'Customer', cell: (r) => <div><span className="font-semibold text-ink-900">{r.name}</span>{r.isNew && <span className="ml-1"><Badge color="green">new</Badge></span>}<div className="text-[11px] text-stone-400">{r.phone}</div></div>, foot: () => 'Total' },
            { h: 'Visits', num: true, cell: (r) => r.visits, foot: () => identified.length },
            { h: 'Spend', num: true, cell: (r) => <b>{inr0(r.spend)}</b>, foot: () => inr0(idRevenue) },
            { h: 'Avg bill', num: true, cell: (r) => inr0(r.spend / r.visits) },
            { h: 'Lifetime visits', num: true, cell: (r) => r.lifetimeVisits },
            { h: 'Lifetime spend', num: true, cell: (r) => inr0(r.lifetimeSpend) },
            { h: 'Points', num: true, cell: (r) => r.points || <span className="text-stone-300">0</span> },
          ]}
        />
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="!mb-0" flush title="🎂 Birthdays this month" sub="A ₹0 message that reliably brings a table back">
          <DataTable
            rows={birthdays}
            keyOf={(c) => c.id}
            empty="No birthdays on file this month"
            cols={[
              { h: 'Customer', cell: (c) => <span className="font-semibold">{c.name}</span> },
              { h: 'Phone', cell: (c) => c.phone || '—' },
              { h: 'Date', cell: (c) => c.birthday },
              { h: 'Lifetime spend', num: true, cell: (c) => inr0(c.totalSpend || 0) },
            ]}
          />
        </Card>
        <Card className="!mb-0" flush title={`😴 Regulars not seen in ${LAPSE_DAYS}+ days`} sub="They used to come at least twice — win them back before they forget you">
          <DataTable
            scroll
            rows={lapsed.slice(0, 25)}
            keyOf={(c) => c.id}
            empty="No lapsed regulars 🎉"
            cols={[
              { h: 'Customer', cell: (c) => <div><span className="font-semibold">{c.name}</span><div className="text-[11px] text-stone-400">{c.phone}</div></div> },
              { h: 'Visits', num: true, cell: (c) => c.visits },
              { h: 'Spent', num: true, cell: (c) => inr0(c.totalSpend || 0) },
              { h: 'Last seen', num: true, cell: (c) => <span className="text-stone-500">{Math.round((Date.now() - c.lastVisit) / 864e5)}d ago</span> },
            ]}
          />
        </Card>
      </div>
    </>
  )
}
