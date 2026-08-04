// ESC/POS command builder for 58mm / 80mm thermal receipt & KOT printers.
// Produces a raw Uint8Array that is sent to the printer over TCP (LAN, port 9100),
// USB (WebUSB), or Bluetooth. Pure JS — no platform dependency, fully testable.
//
// Basic thermal printers use single-byte code pages and cannot render the ₹ glyph
// or Devanagari, so we transliterate ₹ -> "Rs " and drop non-ASCII from names.

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
  const payable = isComposition ? Math.round(totals.taxable) : totals.total

  e.align('center').size(true).bold(true).line(settings.name).size(false)
  if (settings.tagline) e.line(settings.tagline)
  if (settings.address) e.line(settings.address)
  if (settings.phone) e.line('Ph: ' + settings.phone)
  if (settings.gstin) e.line('GSTIN: ' + settings.gstin)
  if (settings.fssai) e.line('FSSAI: ' + settings.fssai)
  e.bold(true).line(isComposition ? 'BILL OF SUPPLY' : 'TAX INVOICE').bold(false)
  e.align('left').rule()
  e.line(`Bill: ${order.billNo || 'DRAFT'}   ${order.tableId ? 'Table ' + order.tableId : (order.type || '').toUpperCase()}`)
  e.line(new Date(order.paidAt || order.createdAt || Date.now()).toLocaleString('en-IN'))
  e.rule()
  ;(order.items || []).forEach((li) => e.item(li.name, li.qty, money(li.price * li.qty)))
  e.rule()
  e.row('Subtotal', money(totals.sub))
  if (totals.discount > 0) e.row('Discount', '-' + money(totals.discount))
  if (!isComposition) {
    e.row(`CGST ${totals.gstRate / 2}%`, money(totals.cgst))
    e.row(`SGST ${totals.gstRate / 2}%`, money(totals.sgst))
  }
  e.size(true).bold(true).row('TOTAL', money(payable)).bold(false).size(false)
  if (order.payment?.method) e.line('Paid by: ' + String(order.payment.method).toUpperCase())
  if (isComposition) e.rule().line('Composition taxable person, not').line('eligible to collect tax on supplies')
  e.rule().align('center').line('Dhanyavaad! Visit again').line('Powered by KhaanaPeena').feed(1)
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
    if (li.notes) e.line('   * ' + li.notes)
  })
  e.rule()
  return e.cut().done()
}

export { sanitize }
