import React, { useMemo } from 'react'
import { StatCard, Badge } from '../components.jsx'
import { Bars } from '../charts.jsx'
import { Card, DataTable, ExportBtn, NeedsData, Note, download, slug, mins, median, dur, channelOf, channelLabel } from './shared.jsx'

const SLA = 15 // minutes — the same threshold the Kitchen screen turns a ticket red at

// Kitchen speed. Prep time is KOT fired -> marked Ready on the Kitchen screen;
// pickup lag is Ready -> Served. Both come from timestamps the KDS started
// stamping in this version, so the report is empty for tickets closed before it.
export default function Kitchen({ state, range }) {
  const tickets = useMemo(() => (state.orders || [])
    .filter((o) => o.kotAt && o.readyAt && o.kotAt >= range.from && o.kotAt < range.to && o.readyAt > o.kotAt)
    .map((o) => ({
      o,
      prep: mins(o.readyAt - o.kotAt),
      pickup: o.servedAt && o.servedAt > o.readyAt ? mins(o.servedAt - o.readyAt) : null,
      hour: new Date(o.kotAt).getHours(),
      lines: o.items || [],
    }))
    .filter((t) => t.prep < 240), // a ticket left open overnight isn't a prep time
  [state.orders, range])

  const stationOf = (itemId) => (state.items || []).find((i) => i.id === itemId)?.station || 'kitchen'

  const byStation = useMemo(() => {
    const m = {}
    tickets.forEach((t) => {
      // a ticket touches every station its lines belong to — attribute its prep
      // time to each, since they cooked in parallel against the same clock
      new Set(t.lines.map((li) => stationOf(li.itemId))).forEach((st) => {
        (m[st] = m[st] || { station: st, times: [], tickets: 0, late: 0 })
        m[st].times.push(t.prep); m[st].tickets++
        if (t.prep > SLA) m[st].late++
      })
    })
    return Object.values(m).map((s) => ({ ...s, med: median(s.times), worst: Math.max(...s.times) })).sort((a, b) => b.med - a.med)
  }, [tickets, state.items])

  const byHour = useMemo(() => {
    const m = {}
    tickets.forEach((t) => { (m[t.hour] = m[t.hour] || []).push(t.prep) })
    return Object.entries(m).map(([h, times]) => ({ hour: +h, med: median(times), n: times.length })).sort((a, b) => a.hour - b.hour)
  }, [tickets])

  const byDish = useMemo(() => {
    const m = {}
    tickets.forEach((t) => t.lines.forEach((li) => {
      const a = (m[li.name] = m[li.name] || { name: li.name, times: [], qty: 0 })
      a.times.push(t.prep); a.qty += li.qty
    }))
    return Object.values(m).filter((d) => d.times.length >= 2).map((d) => ({ ...d, med: median(d.times) })).sort((a, b) => b.med - a.med)
  }, [tickets])

  const byChannel = useMemo(() => {
    const m = {}
    tickets.forEach((t) => {
      const k = channelOf(t.o)
      const a = (m[k] = m[k] || { k, times: [], late: 0 })
      a.times.push(t.prep); if (t.prep > SLA) a.late++
    })
    return Object.values(m).map((c) => ({ ...c, med: median(c.times), n: c.times.length })).sort((a, b) => b.med - a.med)
  }, [tickets])

  const prepTimes = tickets.map((t) => t.prep)
  const medPrep = median(prepTimes)
  const late = tickets.filter((t) => t.prep > SLA)
  const pickups = tickets.map((t) => t.pickup).filter((p) => p != null)

  const exportCsv = () => {
    const out = [['KITCHEN SPEED — ' + range.label], [],
      ['Tickets measured', tickets.length],
      ['Median prep time (min)', medPrep == null ? '' : medPrep.toFixed(1)],
      [`Over ${SLA} min`, late.length],
      [], ['BY STATION'], ['Station', 'Tickets', 'Median prep (min)', 'Slowest (min)', `Over ${SLA} min`]]
    byStation.forEach((s) => out.push([s.station, s.tickets, s.med.toFixed(1), s.worst.toFixed(0), s.late]))
    out.push([], ['BY HOUR'], ['Hour', 'Tickets', 'Median prep (min)'])
    byHour.forEach((h) => out.push([`${(h.hour % 12) || 12}${h.hour < 12 ? 'am' : 'pm'}`, h.n, h.med.toFixed(1)]))
    out.push([], ['SLOWEST DISHES'], ['Dish', 'Appearances', 'Plates', 'Median ticket prep (min)'])
    byDish.slice(0, 25).forEach((d) => out.push([d.name, d.times.length, d.qty, d.med.toFixed(1)]))
    out.push([], ['TICKET LOG'], ['KOT', 'Fired', 'Ready', 'Prep (min)', 'Served', 'Pickup lag (min)', 'Type', 'Items'])
    ;[...tickets].sort((a, b) => a.o.kotAt - b.o.kotAt).forEach((t) => out.push([
      t.o.kotNo || '', new Date(t.o.kotAt).toLocaleString('en-IN'), new Date(t.o.readyAt).toLocaleTimeString('en-IN'),
      t.prep.toFixed(1), t.o.servedAt ? new Date(t.o.servedAt).toLocaleTimeString('en-IN') : '',
      t.pickup == null ? '' : t.pickup.toFixed(1), t.o.type, t.lines.map((l) => `${l.qty}x ${l.name}`).join('; '),
    ]))
    download(`khaanapeena-kitchen-speed-${slug(range)}.csv`, out)
  }

  if (!tickets.length) {
    return (
      <NeedsData icon="⏱️" title="Kitchen timing hasn't been recorded yet">
        Prep time is measured from the moment a KOT is fired to the moment your kitchen taps
        <b> ✓ Ready</b> on the Kitchen screen. This version started recording those taps — settle a few
        tickets through the Kitchen screen and this report fills in. Older bills have no timing to show.
      </NeedsData>
    )
  }

  return (
    <>
      <div className="flex justify-end mb-3"><ExportBtn onClick={exportCsv} /></div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5">
        <StatCard label="Typical prep time" value={dur(medPrep)} sub={`${tickets.length} tickets measured`} icon="⏱️" accent={medPrep <= SLA ? 'green' : 'red'} />
        <StatCard label={`Tickets over ${SLA} min`} value={late.length} sub={`${Math.round((late.length / tickets.length) * 100)}% of tickets`} icon="🐢" accent={late.length / tickets.length > 0.2 ? 'red' : 'green'} />
        <StatCard label="Slowest ticket" value={dur(Math.max(...prepTimes))} icon="🔺" accent="red" />
        <StatCard label="Fastest ticket" value={dur(Math.min(...prepTimes))} icon="⚡" accent="green" />
        <StatCard label="Ready → served lag" value={pickups.length ? dur(median(pickups)) : '—'} sub={pickups.length ? `${pickups.length} tickets` : 'served not marked'} icon="🛎️" accent="blue" />
      </div>

      {late.length / tickets.length > 0.2 && (
        <Note tone="red">
          <b>{Math.round((late.length / tickets.length) * 100)}% of tickets took more than {SLA} minutes.</b> Check the hour chart below — if the delay clusters at one time of day it's a staffing problem, and if it clusters at one station it's a prep or equipment problem.
        </Note>
      )}

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" title="Prep time through the day" sub={`Median minutes per ticket · red line is your ${SLA}-minute target`}>
          <Bars data={byHour.map((h) => ({ label: `${(h.hour % 12) || 12}${h.hour < 12 ? 'a' : 'p'}`, value: +h.med.toFixed(1) }))} color="#dc2626" fmt={(v) => v + ' min'} />
        </Card>
        <Card className="!mb-0" flush title="By station" sub="Where the kitchen actually slows down">
          <DataTable
            rows={byStation}
            keyOf={(s) => s.station}
            cols={[
              { h: 'Station', cell: (s) => <span className="font-semibold capitalize">{s.station}</span> },
              { h: 'Tickets', num: true, cell: (s) => s.tickets },
              { h: 'Median', num: true, cell: (s) => <Badge color={s.med > SLA ? 'red' : s.med > SLA * 0.7 ? 'amber' : 'green'}>{dur(s.med)}</Badge> },
              { h: 'Slowest', num: true, cell: (s) => dur(s.worst) },
              { h: `Over ${SLA}m`, num: true, cell: (s) => s.late },
            ]}
          />
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-4">
        <Card className="!mb-0" flush title="Slowest dishes" sub="Median prep time of the tickets these appeared on">
          <DataTable
            scroll
            rows={byDish.slice(0, 15)}
            keyOf={(d) => d.name}
            empty="Not enough repeat dishes to compare yet"
            cols={[
              { h: 'Dish', cell: (d) => <span className="font-semibold">{d.name}</span> },
              { h: 'Tickets', num: true, cell: (d) => d.times.length },
              { h: 'Plates', num: true, cell: (d) => d.qty },
              { h: 'Median prep', num: true, cell: (d) => <Badge color={d.med > SLA ? 'red' : 'green'}>{dur(d.med)}</Badge> },
            ]}
          />
        </Card>
        <Card className="!mb-0" flush title="By order type" sub="Are delivery tickets jumping the queue — or stuck behind it?">
          <DataTable
            rows={byChannel}
            keyOf={(c) => c.k}
            cols={[
              { h: 'Type', cell: (c) => <span className="text-xs font-semibold">{channelLabel(c.k)}</span> },
              { h: 'Tickets', num: true, cell: (c) => c.n },
              { h: 'Median prep', num: true, cell: (c) => dur(c.med) },
              { h: `Over ${SLA}m`, num: true, cell: (c) => c.late },
            ]}
          />
        </Card>
      </div>

      <Card flush title="Ticket log" sub="Every measured KOT, slowest first">
        <DataTable
          scroll
          rows={[...tickets].sort((a, b) => b.prep - a.prep)}
          keyOf={(t) => t.o.id}
          cols={[
            { h: 'KOT', cell: (t) => <span className="font-bold">#{t.o.kotNo || '—'}</span> },
            { h: 'Fired', cell: (t) => new Date(t.o.kotAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) },
            { h: 'Type', cell: (t) => <span className="text-xs">{channelLabel(channelOf(t.o))}</span> },
            { h: 'Items', cell: (t) => <span className="text-stone-600">{t.lines.map((l) => `${l.qty}× ${l.name}`).join(', ')}</span> },
            { h: 'Prep', num: true, cell: (t) => <Badge color={t.prep > SLA ? 'red' : 'green'}>{dur(t.prep)}</Badge> },
            { h: 'Pickup lag', num: true, cell: (t) => t.pickup == null ? <span className="text-stone-300">—</span> : dur(t.pickup) },
          ]}
        />
      </Card>
    </>
  )
}
