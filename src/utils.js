export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9)

export const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const inr0 = (n) =>
  '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')

/**
 * The LOCAL calendar day as YYYY-MM-DD.
 *
 * `toISOString()` converts to UTC first, so in India (UTC+5:30) every bill,
 * expense or register entry between midnight and 05:29 was filed against the
 * previous day while being labelled with today's date. A restaurant closing at
 * 1am had its whole late-night trade land on the wrong row.
 */
const localDay = (d) => {
  const x = new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
export const todayISO = () => localDay(new Date())

export const dayKey = (ts) => localDay(ts)

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export const minsSince = (ts) => Math.floor((Date.now() - ts) / 60000)

// cash-register shift totals — sales during the shift window + drawer math.
// Used live for the X-report (open shift) and snapshotted into the Z-report on close.
// `expenses` and refunds both take real cash out of the drawer, so the expected
// figure has to know about them or every till will read short at closing time.
export function shiftTotals(shift, orders, expenses) {
  const from = shift.openedAt || 0
  const to = shift.closedAt || Date.now() + 1000
  const paid = (orders || []).filter((o) => o.status === 'paid' && o.paidAt >= from && o.paidAt < to)
  // via paymentSplit so a half-cash-half-UPI bill lands in both buckets, not one
  const mode = (m) => paid.reduce((s, o) => s + paidByMode(o, m), 0)
  const cash = mode('cash'), upi = mode('upi'), card = mode('card'), online = mode('online'), credit = mode('credit')
  const cashIn = (shift.cashMovements || []).filter((m) => m.type === 'in').reduce((s, m) => s + (m.amount || 0), 0)
  const cashOut = (shift.cashMovements || []).filter((m) => m.type === 'out').reduce((s, m) => s + (m.amount || 0), 0)
  const cashExpenses = (expenses || [])
    .filter((e) => e.paidFrom === 'cash' && e.at >= from && e.at < to)
    .reduce((s, e) => s + (e.amount || 0), 0)
  const cashRefunds = paid
    .filter((o) => o.refund && (o.refund.method || 'cash') === 'cash')
    .reduce((s, o) => s + (o.refund.amount || 0), 0)
  // an OLD udhaar bill collected in cash during this shift is cash in the drawer
  // now, even though its sale belongs to an earlier day
  const creditCollected = (orders || [])
    .filter((o) => o.creditPaid && o.creditPaid.at >= from && o.creditPaid.at < to && (o.creditPaid.method || 'cash') === 'cash')
    .reduce((s, o) => s + ((o.payment?.amount || 0) - (o.refund?.amount || 0)), 0)
  const openingFloat = shift.openingFloat || 0
  return {
    cash, upi, card, online, credit,
    gross: cash + upi + card + online + credit,
    bills: paid.length,
    discounts: paid.reduce((s, o) => s + (o.payment?.discount || 0), 0),
    cashIn, cashOut, cashExpenses, cashRefunds, creditCollected, openingFloat,
    // what should physically be in the drawer right now
    expectedCash: openingFloat + cash + creditCollected + cashIn - cashOut - cashExpenses - cashRefunds,
  }
}

// Expense heads a small Indian restaurant actually books money against. Kept as a
// fixed list so the expense report groups cleanly instead of collecting fifty
// spellings of "vegetables".
export const EXPENSE_REASONS = [
  'Salary / Wages', 'Rent', 'Electricity', 'Water', 'Gas / LPG',
  'Vegetables & Fruit', 'Milk & Dairy', 'Meat & Poultry', 'Groceries & Provisions',
  'Repairs & Maintenance', 'Cleaning & Housekeeping', 'Transport / Fuel',
  'Internet & Phone', 'Licence & Government Fees', 'Marketing & Promotion',
  'Staff Food', 'Crockery & Utensils', 'Petty Cash', 'Other',
]

export const PAID_FROM = [
  ['cash', 'From Cash'], ['bank', 'From Bank / UPI'], ['card', 'From Card'], ['owner', "Owner's pocket"],
]
export const paidFromLabel = (k) => PAID_FROM.find(([c]) => c === k)?.[1] || k

// manager authorization: matches the settings Manager PIN, or any staff member
// with a manager/admin/owner role whose PIN matches. Returns {name} or null.
export function verifyManagerPin(state, pin) {
  const p = String(pin || '').trim()
  if (!p) return null
  if (state.settings.managerPin && p === String(state.settings.managerPin)) return { name: 'Manager' }
  const st = (state.staff || []).find((s) => String(s.pin) === p && /manager|admin|owner/i.test(s.role || ''))
  return st ? { name: st.name } : null
}

// ---- report date ranges ----
const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x }

// returns { from, to (exclusive ms), label, bucket: 'hour'|'day'|'week' }
export function reportRange(key, custom) {
  const now = new Date()
  const todayStart = startOfDay(now).getTime()
  const DAY = 864e5
  switch (key) {
    case 'today': return { from: todayStart, to: now.getTime() + 1000, label: 'Today', bucket: 'hour' }
    case 'yesterday': return { from: todayStart - DAY, to: todayStart, label: 'Yesterday', bucket: 'hour' }
    case '7d': return { from: todayStart - 6 * DAY, to: now.getTime() + 1000, label: 'Last 7 days', bucket: 'day' }
    case 'week': {
      const dow = (now.getDay() + 6) % 7 // Monday = 0
      return { from: todayStart - dow * DAY, to: now.getTime() + 1000, label: 'This week', bucket: 'day' }
    }
    case '30d': return { from: todayStart - 29 * DAY, to: now.getTime() + 1000, label: 'Last 30 days', bucket: 'day' }
    case 'month': {
      const m = new Date(now.getFullYear(), now.getMonth(), 1).getTime()
      return { from: m, to: now.getTime() + 1000, label: 'This month', bucket: 'day' }
    }
    case 'all': return { from: 0, to: now.getTime() + 1000, label: 'All time', bucket: 'week' }
    case 'custom': {
      const from = custom?.from ? startOfDay(new Date(custom.from)).getTime() : todayStart
      const to = custom?.to ? startOfDay(new Date(custom.to)).getTime() + DAY : now.getTime() + 1000
      const span = (to - from) / DAY
      return { from, to, label: 'Custom', bucket: span <= 2 ? 'hour' : span <= 62 ? 'day' : 'week' }
    }
    default: return { from: todayStart - 6 * DAY, to: now.getTime() + 1000, label: 'Last 7 days', bucket: 'day' }
  }
}

// bucket a list of {ts, value} into ordered {label, value} points across [from,to)
export function bucketize(points, range) {
  const DAY = 864e5
  const out = []
  if (range.bucket === 'hour') {
    for (let h = 0; h < 24; h++) out.push({ key: h, label: `${((h % 12) || 12)}${h < 12 ? 'a' : 'p'}`, value: 0 })
    points.forEach((p) => { const h = new Date(p.ts).getHours(); out[h].value += p.value })
    // trim to the active span: start at the earliest hour with sales (never later
    // than 8am so a normal day still opens at 8) — keeps early breakfast/tiffin sales
    const firstActive = out.findIndex((b) => b.value > 0)
    return out.slice(firstActive === -1 ? 8 : Math.min(8, firstActive), 24)
  }
  if (range.bucket === 'day') {
    const start = new Date(range.from); start.setHours(0, 0, 0, 0)
    const end = Math.min(range.to, Date.now() + 1000)
    const map = {}
    for (let t = start.getTime(); t < end; t += DAY) {
      const k = localDay(t)
      map[k] = { key: k, label: new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: 0 }
    }
    points.forEach((p) => { const k = localDay(p.ts); if (map[k]) map[k].value += p.value })
    return Object.values(map)
  }
  // week buckets
  const map = {}
  points.forEach((p) => {
    const d = new Date(p.ts); const dow = (d.getDay() + 6) % 7
    const monday = new Date(d); monday.setDate(d.getDate() - dow); monday.setHours(0, 0, 0, 0)
    const k = localDay(monday)
    if (!map[k]) map[k] = { key: k, ts: monday.getTime(), label: 'w/o ' + monday.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), value: 0 }
    map[k].value += p.value
  })
  return Object.values(map).sort((a, b) => a.ts - b.ts)
}

// GST for restaurants (India): composition/regular non-AC default 5% (2.5 CGST + 2.5 SGST), no ITC
export function billTotals(order, settings) {
  // items can be absent when a cloud order round-trips through RTDB (empty arrays
  // are dropped by Firebase) — guard so bill math never throws on a partial payload
  const sub = (order.items || []).reduce((s, it) => s + it.price * it.qty, 0)
  const discount = order.payment?.discount || 0
  const taxable = Math.max(0, sub - discount)
  const gstRate = settings.gstRate ?? 5

  // Service charge is NOT a tax and is not compulsory — a guest may decline it
  // (CCPA guidelines, India). `svcWaived` on the order is that refusal.
  const svcRate = order.svcWaived ? 0 : (settings.serviceCharge || 0)
  const svc = (taxable * svcRate) / 100

  // GST is charged on food PLUS service charge. A service charge is part of the
  // value of supply, so taxing only the food under-declares the bill — the order
  // here is deliberate and must stay: svc is computed first, then taxed.
  const gstBase = taxable + svc
  const cgst = (gstBase * gstRate) / 200
  const sgst = (gstBase * gstRate) / 200

  const total = Math.round(taxable + svc + cgst + sgst)
  return { sub, discount, taxable, gstBase, cgst, sgst, svc, svcRate, gstRate, total, roundOff: total - (taxable + svc + cgst + sgst) }
}

/**
 * What a bill was actually paid with, as {mode: amount}.
 *
 * A guest can settle across several modes ("half cash, half UPI"), so anything
 * that buckets money by mode MUST go through this. Reading `payment.method`
 * directly would drop a split bill entirely into one bucket and every drawer and
 * payment-mix figure downstream would be wrong.
 */
export function paymentSplit(order) {
  const p = order?.payment || {}
  if (Array.isArray(p.splits) && p.splits.length) {
    const out = {}
    p.splits.forEach((s) => { out[s.method] = (out[s.method] || 0) + (+s.amount || 0) })
    return out
  }
  return { [p.method || 'cash']: p.amount || 0 }
}
export const paidByMode = (order, mode) => paymentSplit(order)[mode] || 0

export const PAY_MODES = [
  ['cash', '💵 Cash'], ['upi', '📲 UPI'], ['card', '💳 Card'],
  ['online', '🛵 Online'], ['credit', '📒 Udhaar'], ['nc', '🚫 Not chargeable'],
]
export const payModeLabel = (k) => PAY_MODES.find(([c]) => c === k)?.[1] || k

/**
 * Somebody else is paying. A host sends guests to the restaurant and settles the
 * bill from wherever they are — so the bill has to travel to them, and the receipt
 * has to travel back.
 *
 * WhatsApp carries text only, so the message has to work three ways: the plain
 * numbers for someone reading it, the UPI id for someone typing it into their own
 * app, and a tappable `upi://` link that opens GPay/PhonePe with the amount
 * already filled. The QR stays on the till screen for anyone who'd rather scan.
 */
export function buildPayRequest(order, settings, totals, tables) {
  const composition = settings.gstScheme === 'composition'
  const payable = composition ? Math.round(totals.taxable + totals.svc) : totals.total
  const where = order.tableId ? `Table ${tableName(tables, order.tableId)}` : (order.type || 'Order').toUpperCase()
  const lines = (order.items || []).map((li) => {
    const mods = li.mods?.length ? ` (${li.mods.map((m) => m.name).join(', ')})` : ''
    return `${li.qty}x ${li.name}${mods} - ${inr0(li.price * li.qty)}`
  })
  const out = [
    `*${settings.name}*`,
    `Bill for ${where}${order.covers ? ` · ${order.covers} guest${order.covers > 1 ? 's' : ''}` : ''}`,
    '',
    ...lines,
    '',
    `Sub-total: ${inr0(totals.sub)}`,
  ]
  if (totals.discount > 0) out.push(`Discount: -${inr0(totals.discount)}`)
  if (!composition) out.push(`GST: ${inr0(totals.cgst + totals.sgst)}`)
  if (totals.svc > 0) out.push(`Service charge: ${inr0(totals.svc)}`)
  out.push(
    `*TOTAL: ${inr0(payable)}*`,
    '',
    `Pay by UPI to: ${settings.upiId || ''}`,
    `Tap to pay: ${upiLink(settings, payable, `${settings.name} · ${where}`)}`,
    '',
    'Thank you 🙏',
    settings.phone ? `${settings.name} · ${settings.phone}` : settings.name,
  )
  return out.join('\n')
}

// Sent once the money is in and the bill is closed — the sponsor's proof of payment.
export function buildPayReceipt(order, settings, tables) {
  const where = order.tableId ? `Table ${tableName(tables, order.tableId)}` : (order.type || 'Order').toUpperCase()
  const mode = order.payment?.splits?.length > 1
    ? order.payment.splits.map((s) => `${String(s.method).toUpperCase()} ${inr0(s.amount)}`).join(' + ')
    : String(order.payment?.method || 'cash').toUpperCase()
  const out = [
    '✅ *Payment received — thank you!*',
    '',
    `*${settings.name}*`,
    `Bill No: ${order.billNo}`,
    `${where}${order.covers ? ` · ${order.covers} guest${order.covers > 1 ? 's' : ''}` : ''}`,
    `Amount paid: *${inr0(order.payment?.amount || 0)}*`,
    `Paid by: ${mode}`,
    new Date(order.paidAt || Date.now()).toLocaleString('en-IN'),
  ]
  if (settings.gstin) out.push(`GSTIN: ${settings.gstin}`)
  out.push('', 'Your guests were looked after 🙏', `${settings.name}${settings.phone ? ` · ${settings.phone}` : ''}`)
  return out.join('\n')
}

// wa.me needs the country code and no punctuation
export const waLink = (phone, text) => `https://wa.me/91${String(phone).replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(text)}`

export function upiLink(settings, amount, note) {
  const p = new URLSearchParams({
    pa: settings.upiId || 'khaanapeena@upi',
    pn: settings.name || 'KhaanaPeena',
    am: String(amount),
    cu: 'INR',
    tn: note || 'Bill payment',
  })
  return 'upi://pay?' + p.toString()
}

// resolve a table's current display name from its id (orders key on the id, which
// never changes, so displays must look up the name or a rename won't show through)
export const tableName = (tables, id) => (tables || []).find((t) => t.id === id)?.name || id

// Why a discount was given. Recording the reason is what turns "we gave away
// ₹12,000 last month" into something an owner can act on. A fixed list keeps the
// report groupable; 'other' carries a free-text note alongside it. 'loyalty' is
// stamped automatically when points are redeemed, so it isn't offered at the till.
export const DISCOUNT_REASONS = [
  ['happy-hour', '🕒 Happy hour'],
  ['regular', '🙏 Regular customer'],
  ['complaint', '😞 Complaint — made good'],
  ['staff', '👨‍🍳 Staff / family meal'],
  ['comp', '🎁 On the house (free)'],
  ['party', '🎉 Bulk / party order'],
  ['negotiated', '🤝 Price agreed with guest'],
  ['other', '✏️ Other'],
]
export const AUTO_REASONS = [['loyalty', '🎟️ Loyalty points redeemed']]

// Why an item was pulled off a bill after the kitchen already had it. Without a
// reason the cancellation report can only count events, not explain them.
export const VOID_REASONS = [
  'Out of stock / 86', 'Punched by mistake', 'Guest changed their mind',
  'Taking too long', 'Wrong item made', 'Quality not right', 'Duplicate punch', 'Other',
]
export const discountReasonLabel = (k) =>
  [...DISCOUNT_REASONS, ...AUTO_REASONS].find(([c]) => c === k)?.[1] || (k ? '✏️ ' + k : 'Not recorded')

// naive sentiment for feedback (offline, rule-based)
const NEG = ['bad', 'worst', 'cold', 'late', 'slow', 'stale', 'rude', 'dirty', 'गंदा', 'खराब', 'ठंडा', 'बुरा']
const POS = ['good', 'great', 'tasty', 'amazing', 'best', 'fresh', 'love', 'बढ़िया', 'स्वादिष्ट', 'अच्छा', 'वधीਆ']
export function sentiment(text, rating) {
  const t = (text || '').toLowerCase()
  let score = rating >= 4 ? 1 : rating <= 2 ? -1 : 0
  POS.forEach((w) => t.includes(w) && score++)
  NEG.forEach((w) => t.includes(w) && score--)
  return score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral'
}

// Simple forecast: weekday-factor moving average over past sales
export function forecastNext7(daily) {
  // daily: [{date, total}] sorted asc
  if (daily.length < 7) return []
  const byDow = Array.from({ length: 7 }, () => [])
  daily.forEach((d) => byDow[new Date(d.date).getDay()].push(d.total))
  const overall = daily.reduce((s, d) => s + d.total, 0) / daily.length
  const recent = daily.slice(-14)
  const recentAvg = recent.reduce((s, d) => s + d.total, 0) / recent.length
  const trend = overall ? recentAvg / overall : 1
  const out = []
  for (let i = 1; i <= 7; i++) {
    const dt = new Date()
    dt.setDate(dt.getDate() + i)
    const dowVals = byDow[dt.getDay()]
    const dowAvg = dowVals.length ? dowVals.reduce((a, b) => a + b, 0) / dowVals.length : overall
    out.push({ date: dt.toISOString().slice(0, 10), dow: dt.toLocaleDateString('en-IN', { weekday: 'short' }), total: Math.round(dowAvg * trend) })
  }
  return out
}

export const FESTIVALS_2026 = [
  { date: '2026-08-15', name: 'Independence Day', tip: 'Tricolor specials & family combos sell well' },
  { date: '2026-08-28', name: 'Raksha Bandhan', tip: 'Sweets & family thali demand spikes' },
  { date: '2026-09-04', name: 'Janmashtami', tip: 'Vrat/faral menu — sabudana, makhana items' },
  { date: '2026-09-14', name: 'Ganesh Chaturthi', tip: 'Modak & maharashtrian specials' },
  { date: '2026-10-11', name: 'Navratri begins', tip: 'Vrat thali — 9 days of no onion-garlic demand' },
  { date: '2026-10-20', name: 'Dussehra', tip: 'Family dining rush in evening' },
  { date: '2026-11-08', name: 'Diwali', tip: 'Highest order volume of the year; stock up 3 days prior' },
  { date: '2026-12-25', name: 'Christmas', tip: 'Cakes, party platters, late-evening rush' },
  { date: '2026-12-31', name: 'New Year Eve', tip: 'Table bookings + party menu; extend hours' },
]
