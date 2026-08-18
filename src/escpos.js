// ESC/POS command builder for 58mm / 80mm thermal receipt & KOT printers.
// Produces a raw Uint8Array that is sent to the printer over TCP (LAN, port 9100),
// USB (WebUSB), or Bluetooth. Pure JS — no platform dependency, fully testable.
//
// Basic thermal printers use single-byte code pages and cannot render the ₹ glyph
// or Devanagari, so we transliterate ₹ -> "Rs " and drop non-ASCII from names.

import { discountReasonLabel } from './utils.js'

// on screen modifiers read "A · B", but this printer drops non-ASCII, which would
// leave a confusing double space — use a comma on paper
const asciiMods = (mods) => (mods || []).map((m) => m.name).join(', ')

const ESC = 0x1b, GS = 0x1d

function sanitize(s) {
  return String(s == null ? '' : s)
    .replace(/₹/g, 'Rs ')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"').replace(/[‘’]/g, "'")
    // keep printable ASCII; replace anything else (e.g. Devanagari) with nothing
    .replace(/[^\x20-\x7e]/g, '')
}

class Esc {
  constructor(width = 48) {
    this.b = []
    this.width = width // chars per line: 48 for 80mm, 32 for 58mm
    this.push(ESC, 0x40) // initialize
  }
  push(...bytes) { for (const x of bytes) this.b.push(x & 0xff); return this }
  raw(arr) { for (const x of arr) this.b.push(x & 0xff); return this }
  text(s) {
    const clean = sanitize(s)
    for (let i = 0; i < clean.length; i++) this.b.push(clean.charCodeAt(i) & 0xff)
    return this
  }
  line(s = '') { return this.text(s).push(0x0a) }
  align(a) { return this.push(ESC, 0x61, a === 'center' ? 1 : a === 'right' ? 2 : 0) }
  bold(on) { return this.push(ESC, 0x45, on ? 1 : 0) }
  // size: n = width/height multiplier bits. big = double w+h
  size(big) { return this.push(GS, 0x21, big ? 0x11 : 0x00) }
  feed(n = 1) { for (let i = 0; i < n; i++) this.b.push(0x0a); return this }
  rule(ch = '-') { return this.line(ch.repeat(this.width)) }
  // left text + right text padded to full width
  row(left, right) {
    const l = sanitize(left), r = sanitize(right)
    const space = Math.max(1, this.width - l.length - r.length)
    return this.line(l + ' '.repeat(space) + r)
  }
  // item line: name (wrapped) ....... amount, with qty
  item(name, qty, amount) {
    const right = String(amount)
    const label = sanitize(`${name} x${qty}`)
    const maxLabel = this.width - right.length - 1
    if (label.length <= maxLabel) return this.row(label, right)
    // wrap the name, put amount on first line
    let first = label.slice(0, maxLabel)
    this.row(first, right)
    let rest = label.slice(maxLabel)
    while (rest.length) { this.line('  ' + rest.slice(0, this.width - 2)); rest = rest.slice(this.width - 2) }
    return this
  }
  cut() { return this.feed(3).push(GS, 0x56, 66, 0) } // partial cut with feed
  drawer() { return this.push(ESC, 0x70, 0, 25, 250) } // kick cash drawer pin 2
  done() { return new Uint8Array(this.b) }
}

const money = (n) => 'Rs ' + Math.round(Number(n || 0)).toLocaleString('en-IN')

// ---- Customer bill / tax invoice ----
export function buildBill(order, settings, totals, width = 48) {
  const e = new Esc(width)
  const isComposition = settings.gstScheme === 'composition'
  const payable = isComposition ? Math.round(totals.taxable + totals.svc) : totals.total

  e.align('center').size(true).bold(true).line(settings.name).size(false)
  if (settings.tagline) e.line(settings.tagline)
  if (settings.address) e.line(settings.address)
  if (settings.phone) e.line('Ph: ' + settings.phone)
  if (settings.gstin) e.line('GSTIN: ' + settings.gstin)
  if (settings.fssai) e.line('FSSAI: ' + settings.fssai)
  e.bold(true).line(isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE').bold(false)
  e.align('left').rule()
  e.line(`Bill: ${order.billNo || 'DRAFT'}   ${order.tableId ? 'Table ' + order.tableId : (order.type || '').toUpperCase()}`)
  if (order.covers) e.line(`Guests: ${order.covers}`)
  if (order.waiterName) e.line(`Served by: ${order.waiterName}`)
  if (order.payer?.phone) e.line(`Paid by: ${order.payer.name || order.payer.phone}`)
  e.line(new Date(order.paidAt || order.createdAt || Date.now()).toLocaleString('en-IN'))
  if (order.party?.type === 'firm') {
    e.rule().line(`Billed to: ${order.party.name || ''}`).line(`GSTIN: ${order.party.gstin || ''}`)
  }
  e.rule()
  ;(order.items || []).forEach((li) => {
    // a priced add-on gets its own rupee line — the guest should see what the
    // extra chicken cost, not just a larger number against the dish
    const base = li.basePrice ?? li.price
    const priced = (li.mods || []).filter((m) => +m.price > 0)
    const free = (li.mods || []).filter((m) => !(+m.price > 0))
    e.item(li.name, li.qty, money(base * li.qty))
    if (free.length) e.line('   (' + asciiMods(free) + ')')
    priced.forEach((m) => e.item('  + ' + m.name, li.qty, money(m.price * li.qty)))
  })
  e.rule()
  e.row('Subtotal', money(totals.sub))
  if (totals.discount > 0) {
    e.row('Discount' + (order.payment?.discountPct ? ` (${order.payment.discountPct}%)` : ''), '-' + money(totals.discount))
    // the reason belongs on the printed slip too — it's the owner's audit trail
    // for a comped or heavily-discounted bill long after the shift has gone home
    const r = order.payment?.discountReason
    if (r) e.line('  (' + discountReasonLabel(r).replace(/^\S+\s/, '') + (order.payment.discountNote ? ' - ' + order.payment.discountNote : '') + ')')
  }
  // service charge prints above the tax lines because GST is charged on it
  // "(optional)" is printed on the bill because a service charge is voluntary in
  // India — the guest is entitled to see that on the slip, not just be told.
  // A 58mm roll is 32 columns, so the label is shortened there rather than wrapped.
  if (totals.svc > 0) {
    const label = width >= 48
      ? `Service charge ${totals.svcRate}% (optional)`
      : `Service chg ${totals.svcRate}% (optional)`
    e.row(label, money(totals.svc))
  } else if (order.svcWaived && settings.serviceCharge > 0) {
    e.line("Service charge waived at guest's request")
  }
  if (!isComposition) {
    e.row(`CGST ${totals.gstRate / 2}%`, money(totals.cgst))
    e.row(`SGST ${totals.gstRate / 2}%`, money(totals.sgst))
  }
  e.size(true).bold(true).row('TOTAL', money(payable)).bold(false).size(false)
  if (order.payment?.splits?.length > 1) {
    e.line('Paid: ' + order.payment.splits.map((s) => `${String(s.method).toUpperCase()} ${s.amount}`).join(' + '))
  } else if (order.payment?.method) {
    e.line('Paid by: ' + String(order.payment.method).toUpperCase())
  }
  if (order.payment?.nc) {
    e.rule().bold(true).line('NOT CHARGEABLE - Rs 0 collected').bold(false)
    e.line('Ref: ' + (order.payment.nc.reference || ''))
    e.line(order.payment.nc.explanation || '')
    e.line('Approved by: ' + (order.payment.nc.by || ''))
  }
  if (isComposition) e.rule().line('Composition taxable person, not').line('eligible to collect tax on supplies')
  // the guest's slip carries the RESTAURANT's identity, never ours — the emoji the
  // screen preview shows is left off here because sanitize would drop it and leave
  // the centred line padded with stray spaces
  e.rule().align('center').line('THANKS! Visit again')
  e.line('Powered by ' + settings.name)
  if (settings.phone) e.line('Contact: ' + settings.phone)
  e.feed(1)
  return e.cut().done()
}

// ---- Kitchen order ticket (KOT) ----
export function buildKOT(order, width = 48) {
  const e = new Esc(width)
  e.align('center').size(true).bold(true).line('*** KOT ***').size(false)
  e.line(`#${order.kotNo ?? ''}  ${order.tableId ? 'TABLE ' + order.tableId : (order.type || '').toUpperCase()}`)
  e.size(false).align('left').line(new Date(order.kotAt || Date.now()).toLocaleTimeString('en-IN')).rule()
  ;(order.items || []).forEach((li) => {
    e.size(true).bold(true).line(`${li.qty} x ${li.name}`).size(false).bold(false)
    // choices print BIG too — a cook skimming a ticket must not miss "no onion"
    if (li.mods?.length) e.bold(true).line('   > ' + asciiMods(li.mods)).bold(false)
    if (li.notes) e.line('   * ' + li.notes)
  })
  e.rule()
  return e.cut().done()
}

// ---- X-report (mid-shift peek) / Z-report (shift close) ----
export function buildShiftReport(shift, tot, settings, width = 48, isX = false) {
  const e = new Esc(width)
  e.align('center').size(true).bold(true).line(settings.name).size(false)
  e.bold(true).line(isX ? 'X-REPORT (mid-shift)' : 'Z-REPORT (shift close)').bold(false)
  e.align('left').rule()
  e.line('Opened: ' + new Date(shift.openedAt).toLocaleString('en-IN'))
  if (shift.openedBy) e.line('Cashier: ' + shift.openedBy)
  if (!isX && shift.closedAt) e.line('Closed: ' + new Date(shift.closedAt).toLocaleString('en-IN'))
  e.rule()
  e.bold(true).line('SALES').bold(false)
  e.row('Cash', money(tot.cash))
  e.row('UPI', money(tot.upi))
  e.row('Card', money(tot.card))
  e.row('Online', money(tot.online))
  e.bold(true).row('Gross sales', money(tot.gross)).bold(false)
  e.row('Bills', String(tot.bills))
  e.row('Discounts', money(tot.discounts))
  e.rule()
  e.bold(true).line('CASH DRAWER').bold(false)
  e.row('Opening float', money(tot.openingFloat))
  e.row('+ Cash sales', money(tot.cash))
  e.row('+ Cash in', money(tot.cashIn))
  e.row('- Cash out', money(tot.cashOut))
  e.bold(true).row('Expected in drawer', money(tot.expectedCash)).bold(false)
  if (!isX) {
    e.row('Counted', money(tot.countedCash))
    e.size(true).bold(true).row(tot.variance >= 0 ? 'OVER' : 'SHORT', money(Math.abs(tot.variance))).bold(false).size(false)
  }
  e.rule().align('center').line('Powered by KhaanaPeena').feed(1)
  return e.cut().done()
}

export { sanitize }
