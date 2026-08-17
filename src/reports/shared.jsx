// Shared plumbing for every report tab: CSV export, the range-filtered bill list,
// and the small set of layout primitives the report screens are built from.
// Keeping these here is what lets each report file stay short and readable.
import React from 'react'
import { inr0 } from '../utils.js'
import { Empty } from '../components.jsx'

// guard against CSV formula injection (a leading = + - @ is executed by Excel/Sheets);
// customer/item names can carry such text, so prefix a quote to keep it literal
const csvCell = (c) => {
  let v = String(c ?? '')
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v
  return `"${v.replace(/"/g, '""')}"`
}

export function download(name, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

// ---- data selectors every report shares ----

// settled bills inside the selected range — the base of nearly every report
export const paidIn = (state, range) =>
  (state.orders || []).filter((o) => o.status === 'paid' && o.paidAt >= range.from && o.paidAt < range.to)

export const slug = (range) => range.label.replace(/\s+/g, '-').toLowerCase()
export const pct = (part, whole) => (whole ? Math.round((part / whole) * 100) : 0)
export const amt = (o) => o.payment?.amount || 0
export const mins = (ms) => ms / 60000

/**
 * How many days the range actually covers — never 0, never into the future.
 *
 * "All time" starts at the epoch, so anything divided by it would be spread over
 * fifty years of nothing (a ₹9,360 purchase bill reads as ₹0 a day). Pass the
 * earliest real record and the window is clamped to when trading actually began.
 */
export const spanDays = (range, earliest) => {
  const from = range.from > 0 ? range.from : (earliest || range.from)
  return Math.max(1, (Math.min(range.to, Date.now()) - from) / 864e5)
}

// smallest timestamp in a list, or 0 when there's nothing to go on
export const earliestOf = (list, pick) => (list.length ? Math.min(...list.map(pick)) : 0)

// guests on a bill (dine-in cover count). 0 when the till never recorded it —
// per-guest figures must exclude those bills, not treat them as a table of nobody
export const coversOf = (o) => +o.covers || 0

export const AGGREGATORS = ['zomato', 'swiggy']
export const isAggregator = (o) => AGGREGATORS.includes(o.type)

// QR guests arrive with type 'qr' but older/cloud rows carry source 'qr-guest'
export const channelOf = (o) => (o.source === 'qr-guest' ? 'qr' : o.type || 'dine')
export const CHANNELS = [
  ['dine', '🍽️ Dine-in'], ['takeaway', '🥡 Takeaway'], ['qr', '📱 QR self-order'],
  ['delivery', '🛵 Own delivery'], ['zomato', '🔴 Zomato'], ['swiggy', '🟠 Swiggy'],
  ['whatsapp', '💬 WhatsApp'],
]
export const channelLabel = (k) => CHANNELS.find(([c]) => c === k)?.[1] || k

// a friendly duration: 4.2m / 1h 12m
export const dur = (minutes) => {
  if (minutes == null || !isFinite(minutes)) return '—'
  if (minutes < 60) return minutes.toFixed(minutes < 10 ? 1 : 0) + 'm'
  return Math.floor(minutes / 60) + 'h ' + Math.round(minutes % 60) + 'm'
}

// median is the honest average for durations — one 3-hour forgotten ticket
// would drag a mean far away from what the kitchen actually feels
export const median = (arr) => {
  if (!arr.length) return null
  const a = [...arr].sort((x, y) => x - y)
  const m = a.length >> 1
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2
}

// ---- layout primitives ----

export function Card({ title, sub, right, children, flush, className = '' }) {
  return (
    <div className={`bg-white rounded-2xl border border-stone-100 mb-4 ${flush ? '' : 'p-5'} ${className}`}>
      {(title || right) && (
        <div className={`flex items-start justify-between gap-3 flex-wrap ${flush ? 'p-5 pb-2' : 'mb-3'}`}>
          <div className="min-w-0">
            {title && <h3 className="font-bold text-ink-900">{title}</h3>}
            {sub && <p className="text-xs text-stone-400 mt-0.5">{sub}</p>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  )
}

// right-align anything that reads as a number, a rupee amount or a percentage
const looksNumeric = (v) => typeof v === 'number' || /^[₹+-]?[\d,]+(\.\d+)?%?$/.test(String(v ?? '').trim())

const PDF_CSS = `
  *{box-sizing:border-box}
  body{font:12px/1.45 "Segoe UI","Nirmala UI",system-ui,Arial,sans-serif;color:#26211d;margin:0;padding:14mm}
  .lh{border-bottom:2px solid #26211d;padding-bottom:8px;margin-bottom:12px}
  .lh h1{font-size:17px;margin:0;letter-spacing:-.01em}
  .lh .sub{font-size:10px;color:#6f665c;margin-top:2px}
  .lh .row{display:flex;justify-content:space-between;align-items:baseline;margin-top:7px;gap:12px}
  .lh .rep{font-size:14px;font-weight:700}
  .lh .per{font-size:10px;color:#6f665c}
  .gen{font-size:9px;color:#9a9083;margin-top:2px}
  table{width:100%;border-collapse:collapse}
  td,th{padding:4px 7px;border-bottom:1px solid #eee7db;text-align:left;vertical-align:top;font-size:10.5px}
  th{background:#f6f2ea;font-weight:700;font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:#6f665c;border-bottom:1.5px solid #ddd3c4}
  td.n{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  tr.sec td{background:#26211d;color:#fff;font-weight:700;font-size:10px;text-transform:uppercase;letter-spacing:.06em;padding:5px 7px;border:0}
  tr.sp td{border:0;height:9px}
  tr{break-inside:avoid;page-break-inside:avoid}
  @page{size:A4 portrait;margin:10mm}
  @media print{body{padding:0}}
`

/**
 * The same rows the CSV gets, as a printable PDF.
 *
 * Built from the export rows rather than from the screen, so the two exports can
 * never disagree — and so the PDF carries the full table even where the screen
 * paginates or scrolls. (The page-level "Save as PDF" is the other thing: that
 * one captures the report visually, charts and all.)
 *
 * Row conventions, matching the CSV builders: an empty array is a spacer, a
 * single-cell row is a section heading, and the first row after either is the
 * column header.
 */
export function downloadPdf(name, rows, meta = {}) {
  // must be opened synchronously inside the click or the browser blocks it
  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups for this site to export a PDF.'); return }

  const d = w.document
  // Built with DOM calls, not an HTML string: every value here is restaurant data
  // (dish names, customer names, expense notes) that a person typed, and
  // textContent can't be talked into becoming markup the way a template can.
  const el = (tag, cls, text) => {
    const n = d.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = String(text)
    return n
  }

  d.title = meta.title || name
  const style = d.createElement('style')
  style.textContent = PDF_CSS
  d.head.appendChild(style)

  const s = meta.settings || {}
  const lh = el('div', 'lh')
  lh.appendChild(el('h1', null, s.name || 'KhaanaPeena'))
  lh.appendChild(el('div', 'sub', [s.address, s.gstin && `GSTIN ${s.gstin}`, s.fssai && `FSSAI ${s.fssai}`].filter(Boolean).join(' · ')))
  const row = el('div', 'row')
  row.appendChild(el('span', 'rep', meta.title || name))
  row.appendChild(el('span', 'per', meta.period || ''))
  lh.appendChild(row)
  lh.appendChild(el('div', 'gen', `Generated ${new Date().toLocaleString('en-IN')} · KhaanaPeena`))
  d.body.appendChild(lh)

  const table = d.createElement('table')
  const widest = rows.reduce((m, r) => Math.max(m, r?.length || 0), 1)
  let headerPending = true
  rows.forEach((r) => {
    const tr = d.createElement('tr')
    if (!r || !r.length) {                       // blank row → spacer
      tr.className = 'sp'
      const td = el('td'); td.colSpan = widest; tr.appendChild(td)
    } else if (r.length === 1) {                 // single cell → section heading
      tr.className = 'sec'
      const td = el('td', null, r[0]); td.colSpan = widest; tr.appendChild(td)
      headerPending = true
    } else {
      const isHeader = headerPending && r.every((c) => !looksNumeric(c))
      r.forEach((c) => {
        const cell = el(isHeader ? 'th' : 'td', !isHeader && looksNumeric(c) ? 'n' : null, c)
        tr.appendChild(cell)
      })
      headerPending = false
    }
    table.appendChild(tr)
  })
  d.body.appendChild(table)
  d.close()

  // let layout settle before the print dialog takes the thread
  setTimeout(() => { try { w.focus(); w.print() } catch { /* user closed it */ } }, 350)
}

/**
 * The export pair every report shows. `build` returns the same row array both
 * formats consume, so CSV and PDF can never drift apart.
 */
export function Exports({ build, name, title, period, settings, className = '' }) {
  const btn = 'border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-3 py-1.5 text-xs transition-colors shrink-0'
  return (
    <div className={`flex gap-2 kp-noprint ${className}`}>
      <button onClick={() => download(`${name}.csv`, build())} className={btn}>⬇️ CSV</button>
      <button onClick={() => downloadPdf(name, build(), { title, period, settings })} className={btn}>📄 PDF</button>
    </div>
  )
}

const TONES = {
  amber: 'bg-amber-50 border-amber-200 text-amber-800',
  blue: 'bg-blue-50 border-blue-200 text-blue-800',
  red: 'bg-red-50 border-red-200 text-red-800',
  green: 'bg-green-50 border-green-200 text-green-800',
}
export const Note = ({ children, tone = 'amber' }) => (
  <div className={`border rounded-2xl px-4 py-3 mb-4 text-sm ${TONES[tone]}`}>{children}</div>
)

/**
 * Table renderer used by every report.
 * cols: [{ h, cell, num?, w?, foot? }] — `num` right-aligns and uses tabular
 * figures so columns of rupees line up; `foot` supplies the totals-row cell.
 */
export function DataTable({ cols, rows, keyOf, empty = 'Nothing to show', scroll, footLabel = 'Total', onRow }) {
  if (!rows.length) return <div className="py-2"><Empty icon="📄" text={empty} /></div>
  const hasFoot = cols.some((c) => c.foot)
  const cls = (c, i) => `${i === 0 ? 'px-4' : 'px-2'} ${c.num ? 'text-right tabular-nums' : 'text-left'}`
  return (
    <div className={`overflow-x-auto ${scroll ? 'max-h-[30rem] overflow-y-auto' : ''}`}>
      <table className="w-full text-sm">
        <thead className={scroll ? 'sticky top-0 bg-white z-10' : ''}>
          <tr className="text-xs text-stone-400 border-b border-stone-100">
            {cols.map((c, i) => <th key={i} className={`py-2 font-medium ${cls(c, i)}`} style={c.w ? { width: c.w } : undefined}>{c.h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr
              key={keyOf ? keyOf(r, ri) : ri}
              onClick={onRow ? () => onRow(r) : undefined}
              className={`border-b border-stone-50 ${onRow ? 'cursor-pointer hover:bg-stone-50' : ''}`}
            >
              {cols.map((c, i) => <td key={i} className={`py-2.5 ${cls(c, i)}`}>{c.cell(r, ri)}</td>)}
            </tr>
          ))}
        </tbody>
        {hasFoot && (
          <tfoot>
            <tr className="border-t-2 border-stone-100 font-black text-ink-900">
              {cols.map((c, i) => (
                <td key={i} className={`py-2.5 ${cls(c, i)}`}>{c.foot ? c.foot() : i === 0 ? footLabel : ''}</td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  )
}

// a compact share bar for "% of sales" columns
export const ShareBar = ({ value, max, color = '#f06008' }) => (
  <div className="flex items-center gap-2 min-w-[90px]">
    <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${max ? (value / max) * 100 : 0}%`, background: color }} />
    </div>
  </div>
)

export const Money = ({ v, bold }) => <span className={bold ? 'font-bold' : ''}>{inr0(v)}</span>

// "no data captured yet" panel for the reports that depend on the new stamps
export const NeedsData = ({ icon = '⏳', title, children }) => (
  <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center">
    <div className="text-4xl mb-2">{icon}</div>
    <p className="font-bold text-ink-900 mb-1">{title}</p>
    <p className="text-sm text-stone-500 max-w-md mx-auto leading-relaxed">{children}</p>
  </div>
)
