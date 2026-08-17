import React, { useEffect, useMemo, useState } from 'react'
import { StatCard, Badge, Empty } from '../components.jsx'
import { HBars } from '../charts.jsx'
import { inr0, billTotals, tableName, fmtTime, minsSince, todayISO } from '../utils.js'
import { Card, DataTable, Exports, Note, amt, coversOf, dur, channelOf, channelLabel } from './shared.jsx'

const RUNNING = ['open', 'kot', 'ready', 'served']
const STATUS = {
  open: ['stone', '📝 Ordering'],
  kot: ['amber', '🔥 In the kitchen'],
  ready: ['green', '🛎️ Ready to serve'],
  served: ['blue', '🍽️ Eating'],
}

// how far back the "what a table normally spends" estimate looks. Long enough to
// smooth a quiet Tuesday, short enough that last winter's prices don't set today's.
const LOOKBACK_DAYS = 30

/**
 * The running floor, right now — deliberately outside the report date range,
 * because "how much is sitting on my tables at this moment" has no date.
 *
 * The projection is the part to be careful with: running tables have a real bill
 * value, but a table that has been seated and hasn't ordered yet has nothing to add
 * up. That gap is filled with what a table normally spends here, and it is labelled
 * as an estimate everywhere it appears — never blended silently into a real total.
 */
export default function Live({ state }) {
  // same 15s heartbeat the kitchen screen runs on, so waiting times stay honest
  const [, tick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => tick((x) => x + 1), 15000)
    return () => clearInterval(id)
  }, [])

  const settings = state.settings
  const tables = state.tables || []

  const running = useMemo(
    () => (state.orders || []).filter((o) => RUNNING.includes(o.status) && !o.mergedInto).sort((a, b) => a.createdAt - b.createdAt),
    [state.orders]
  )

  const rows = useMemo(() => running.map((o) => {
    const lines = (o.items || []).reduce((s, li) => s + li.qty, 0)
    return {
      o,
      table: o.tableId ? tableName(tables, o.tableId) : null,
      waiter: o.waiterName || o.takenBy || null,
      guests: coversOf(o),
      lines,
      value: lines ? billTotals(o, settings).total : 0,
      openedFor: minsSince(o.createdAt),
      kotFor: o.kotAt ? minsSince(o.kotAt) : null,
    }
  }), [running, tables, settings])

  const occupiedIds = useMemo(() => new Set(rows.filter((r) => r.o.tableId).map((r) => r.o.tableId)), [rows])
  const freeTables = tables.filter((t) => !occupiedIds.has(t.id))
  const seatedGuests = rows.reduce((s, r) => s + r.guests, 0)
  const countedTables = rows.filter((r) => r.guests > 0).length

  // seated but nothing punched in yet — the tables the projection has to guess for
  const notOrdered = rows.filter((r) => !r.lines)
  const runningValue = rows.reduce((s, r) => s + r.value, 0)

  const kots = rows.filter((r) => r.o.status === 'kot').sort((a, b) => b.kotFor - a.kotFor)
  const readyWaiting = rows.filter((r) => r.o.status === 'ready')

  // ---- what a table normally spends, from real settled bills ----
  const lookbackFrom = Date.now() - LOOKBACK_DAYS * 864e5
  const recent = useMemo(
    () => (state.orders || []).filter((o) => o.status === 'paid' && o.paidAt >= lookbackFrom && o.tableId),
    [state.orders, lookbackFrom]
  )
  const avgPerTable = recent.length ? recent.reduce((s, o) => s + amt(o), 0) / recent.length : null
  const estimate = avgPerTable == null ? 0 : notOrdered.length * avgPerTable
  const projection = runningValue + estimate

  const todayFrom = new Date(todayISO() + 'T00:00:00').getTime()
  const settledToday = useMemo(
    () => (state.orders || []).filter((o) => o.status === 'paid' && o.paidAt >= todayFrom),
    [state.orders, todayFrom]
  )
  const earnedToday = settledToday.reduce((s, o) => s + amt(o), 0)

  const byWaiter = useMemo(() => {
    const m = {}
    rows.forEach((r) => {
      const k = r.waiter || 'Unassigned'
      const w = (m[k] = m[k] || { name: k, tables: 0, guests: 0, value: 0 })
      w.tables++; w.guests += r.guests; w.value += r.value
    })
    return Object.values(m).sort((a, b) => b.value - a.value)
  }, [rows])

  const buildRows = () => {
    const out = [['RUNNING NOW'], ['Snapshot taken', new Date().toLocaleString('en-IN')], [],
      ['Tables occupied', occupiedIds.size], ['Tables free', freeTables.length], ['Tables in the room', tables.length],
      ['Guests seated', seatedGuests || '—'],
      ['Running orders', rows.length],
      ['Value on running tables ₹', Math.round(runningValue)],
      ['Tables seated but not yet ordered', notOrdered.length],
      ['Average bill per table (last ' + LOOKBACK_DAYS + ' days) ₹', avgPerTable == null ? '—' : Math.round(avgPerTable)],
      ['Estimate for tables not yet ordered ₹', avgPerTable == null ? '—' : Math.round(estimate)],
      ['Projected still to come ₹', Math.round(projection)],
      ['Settled today so far ₹', Math.round(earnedToday)],
      ['Earned + expected ₹', Math.round(earnedToday + projection)],
      [], ['RUNNING TABLES'],
      ['Table', 'Type', 'Waiter', 'Guests', 'Items', 'Current bill ₹', 'Status', 'Open for (min)', 'KOT waiting (min)']]
    rows.forEach((r) => out.push([
      r.table || '—', channelLabel(channelOf(r.o)), r.waiter || '—', r.guests || '—', r.lines,
      Math.round(r.value), STATUS[r.o.status]?.[1] || r.o.status, r.openedFor, r.kotFor == null ? '—' : r.kotFor,
    ]))
    if (kots.length) {
      out.push([], ['KOTS PENDING IN THE KITCHEN'], ['KOT No', 'Table', 'Items', 'Fired at', 'Waiting (min)'])
      kots.forEach((r) => out.push([
        r.o.kotNo == null ? '—' : r.o.kotNo, r.table || channelLabel(channelOf(r.o)),
        (r.o.items || []).map((li) => `${li.qty}x ${li.name}`).join('; '),
        r.o.kotAt ? fmtTime(r.o.kotAt) : '—', r.kotFor == null ? '—' : r.kotFor,
      ]))
    }
    if (byWaiter.length) {
      out.push([], ['BY WAITER, RIGHT NOW'], ['Waiter', 'Tables', 'Guests', 'Running value ₹'])
      byWaiter.forEach((w) => out.push([w.name, w.tables, w.guests || '—', Math.round(w.value)]))
    }
    out.push([], ['FREE TABLES'], ['Table', 'Section', 'Seats'])
    freeTables.forEach((t) => out.push([t.name, t.area || '—', t.seats || '—']))
    return out
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span className="w-2 h-2 rounded-full bg-red-500 kp-pulse" />
          Live · refreshes every 15 seconds · read at {fmtTime(Date.now())}
        </div>
        <Exports
          build={buildRows}
          name={`khaanapeena-running-now-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}`}
          title="Running now"
          settings={state.settings}
        />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mb-5">
        <StatCard label="Tables occupied" value={`${occupiedIds.size}/${tables.length}`} sub={`${freeTables.length} free`} icon="🪑" accent={occupiedIds.size ? 'saffron' : 'stone'} />
        <StatCard label="Guests seated" value={seatedGuests || '—'} sub={seatedGuests ? `across ${countedTables} table${countedTables === 1 ? '' : 's'}` : 'guest counts not entered'} icon="👥" accent={seatedGuests ? 'green' : 'stone'} />
        <StatCard label="On the tables" value={inr0(runningValue)} sub={`${rows.length} running order${rows.length === 1 ? '' : 's'}`} icon="🧾" accent="blue" />
        <StatCard label="In the kitchen" value={kots.length} sub={kots.length ? `oldest waiting ${dur(kots[0].kotFor)}` : 'nothing pending'} icon="🔥" accent={kots.some((r) => r.kotFor > 15) ? 'red' : kots.length ? 'saffron' : 'green'} />
        <StatCard label="Settled today" value={inr0(earnedToday)} sub={`${settledToday.length} bill${settledToday.length === 1 ? '' : 's'} so far`} icon="💰" accent="green" />
        <StatCard label="Earned + expected" value={inr0(earnedToday + projection)} sub={`${inr0(earnedToday)} in hand + ~${inr0(projection)} still to come`} icon="📈" accent="purple" />
      </div>

      {!rows.length ? (
        <Card className="kp-card">
          <Empty icon="😌" text="Nothing running — every table is free and the kitchen is clear." />
        </Card>
      ) : (
        <>
          {kots.some((r) => r.kotFor > 15) && (
            <Note tone="red">
              <b>{kots.filter((r) => r.kotFor > 15).length} KOT{kots.filter((r) => r.kotFor > 15).length === 1 ? ' has' : 's have'} been in the kitchen more than 15 minutes.</b>{' '}
              The longest is {dur(kots[0].kotFor)} on {kots[0].table || channelLabel(channelOf(kots[0].o))}.
            </Note>
          )}

          <Card
            flush
            className="kp-card"
            title="What's on the floor"
            sub="Every order that hasn't been paid for yet, oldest table first"
          >
            <DataTable
              scroll
              rows={rows}
              keyOf={(r) => r.o.id}
              cols={[
                { h: 'Table', cell: (r) => (
                  <div>
                    <span className="font-black text-ink-900">{r.table ? `🪑 ${r.table}` : channelLabel(channelOf(r.o))}</span>
                    <div className="text-[11px] text-stone-400">{r.waiter ? `👤 ${r.waiter}` : 'no waiter assigned'}</div>
                  </div>
                ), foot: () => 'Total' },
                { h: 'Status', cell: (r) => <Badge color={STATUS[r.o.status]?.[0] || 'stone'}>{STATUS[r.o.status]?.[1] || r.o.status}</Badge> },
                { h: 'Guests', num: true, cell: (r) => r.guests || <span className="text-stone-300">—</span>, foot: () => seatedGuests || '—' },
                { h: 'What they ordered', cell: (r) => r.lines
                  ? <span className="text-xs text-stone-600">{(r.o.items || []).map((li) => `${li.qty}× ${li.name}`).join(', ')}</span>
                  : <span className="text-xs text-stone-400 italic">nothing punched in yet</span> },
                { h: 'Items', num: true, cell: (r) => r.lines || <span className="text-stone-300">0</span>, foot: () => rows.reduce((s, r) => s + r.lines, 0) },
                { h: 'Open for', num: true, cell: (r) => <span className={r.openedFor > 90 ? 'text-red-600 font-semibold' : ''}>{dur(r.openedFor)}</span> },
                { h: 'Bill so far', num: true, cell: (r) => r.value ? <b>{inr0(r.value)}</b> : <span className="text-stone-300">—</span>, foot: () => inr0(runningValue) },
              ]}
            />
          </Card>

          <div className="grid lg:grid-cols-2 gap-4 mb-4">
            <Card className="!mb-0 kp-card" flush title="🔥 Pending in the kitchen" sub="KOTs fired and not yet marked ready — longest wait first">
              <DataTable
                rows={kots}
                keyOf={(r) => r.o.id}
                empty="Kitchen is clear 🎉"
                cols={[
                  { h: 'KOT', cell: (r) => (
                    <div>
                      <span className="font-black">#{r.o.kotNo ?? '—'}</span>
                      <div className="text-[11px] text-stone-400">{r.table ? `🪑 ${r.table}` : channelLabel(channelOf(r.o))}</div>
                    </div>
                  ) },
                  { h: 'Items', cell: (r) => <span className="text-xs text-stone-600">{(r.o.items || []).map((li) => `${li.qty}× ${li.name}`).join(', ')}</span> },
                  { h: 'Fired', cell: (r) => <span className="tabular-nums text-xs">{r.o.kotAt ? fmtTime(r.o.kotAt) : '—'}</span> },
                  { h: 'Waiting', num: true, cell: (r) => <Badge color={r.kotFor > 15 ? 'red' : r.kotFor > 8 ? 'amber' : 'green'}>{dur(r.kotFor)}</Badge> },
                ]}
              />
              {readyWaiting.length > 0 && (
                <div className="px-4 pb-4 pt-1 text-[11px] text-stone-500">
                  🛎️ {readyWaiting.length} more {readyWaiting.length === 1 ? 'ticket is' : 'tickets are'} cooked and waiting to be carried out
                  ({readyWaiting.map((r) => r.table || channelLabel(channelOf(r.o))).join(', ')}).
                </div>
              )}
            </Card>

            <Card className="!mb-0 kp-card" title="Running value by waiter" sub="Who is holding how much of the floor right now">
              {byWaiter.some((w) => w.value > 0)
                ? <HBars data={byWaiter.map((w) => ({ label: w.name, value: Math.round(w.value) }))} color="#9333ea" />
                : <Empty icon="👤" text="Nothing billed on the running tables yet" />}
            </Card>
          </div>
        </>
      )}

      {/* PROJECTION — spelled out, because a guess presented as a total is a lie */}
      <Card
        className="kp-card"
        title="💵 Money still to come"
        sub="An estimate, not a total — here is exactly how it is worked out"
      >
        <div className="space-y-1">
          <Leg
            label="Bills already running on the tables"
            sub={`${rows.filter((r) => r.lines).length} table${rows.filter((r) => r.lines).length === 1 ? '' : 's'} with items punched in — this part is real, not estimated`}
            v={runningValue}
          />
          <Leg
            label={`Estimate for ${notOrdered.length} table${notOrdered.length === 1 ? '' : 's'} seated but not yet ordered`}
            sub={avgPerTable == null
              ? 'no settled table bills in the last ' + LOOKBACK_DAYS + ' days to estimate from — counted as nothing'
              : `${notOrdered.length} × ${inr0(avgPerTable)}, the average table bill from ${recent.length} bills settled in the last ${LOOKBACK_DAYS} days`}
            v={estimate}
            est
          />
          <div className="flex items-center gap-3 pt-3 border-t border-stone-100">
            <div className="flex-1">
              <div className="font-black text-ink-900">Projected still to come</div>
              <div className="text-[11px] text-stone-400">Plus {inr0(earnedToday)} already settled today = {inr0(earnedToday + projection)} for the day so far</div>
            </div>
            <div className="text-2xl font-black tabular-nums text-ink-900">~{inr0(projection)}</div>
          </div>
        </div>
      </Card>

      {avgPerTable == null && notOrdered.length > 0 && (
        <Note>
          {notOrdered.length} table{notOrdered.length === 1 ? ' is' : 's are'} seated with nothing ordered, but there are no settled table bills in the
          last {LOOKBACK_DAYS} days to estimate from — so they add <b>nothing</b> to the projection rather than a made-up figure.
        </Note>
      )}

      {seatedGuests === 0 && rows.length > 0 && (
        <Note>
          No guest count has been entered on any running table, so “guests seated” reads <b>—</b>. Tap the <b>👥</b> counter beside the table picker
          in Billing when you seat a party and this fills in live.
        </Note>
      )}

      <Card className="kp-card" flush title="🈳 Free right now" sub="Tables you can seat this minute">
        {freeTables.length ? (
          <div className="px-5 pb-5 flex flex-wrap gap-2">
            {freeTables.map((t) => (
              <span key={t.id} className="px-3 py-1.5 rounded-xl bg-stone-50 border border-stone-100 text-xs">
                <b className="text-ink-900">{t.name}</b>
                <span className="text-stone-400"> · {t.area || '—'} · {t.seats || '?'} seats</span>
              </span>
            ))}
          </div>
        ) : (
          <div className="px-5 pb-5"><Empty icon="🔥" text="Full house — every table is taken" /></div>
        )}
      </Card>
    </>
  )
}

const Leg = ({ label, sub, v, est }) => (
  <div className="flex items-center gap-3 py-2 border-b border-stone-50">
    <div className="min-w-0 flex-1">
      <div className="font-semibold text-sm text-ink-900">{label}</div>
      <div className="text-[11px] text-stone-400">{sub}</div>
    </div>
    <div className={`font-bold tabular-nums w-28 text-right shrink-0 ${v ? 'text-ink-900' : 'text-stone-300'}`}>
      {v ? (est ? '~' : '') + inr0(v) : '—'}
    </div>
  </div>
)
