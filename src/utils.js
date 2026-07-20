export const uid = (p = '') => p + Math.random().toString(36).slice(2, 9)

export const inr = (n) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })

export const inr0 = (n) =>
  '₹' + Math.round(Number(n || 0)).toLocaleString('en-IN')

export const todayISO = () => new Date().toISOString().slice(0, 10)

export const dayKey = (ts) => new Date(ts).toISOString().slice(0, 10)

export const fmtTime = (ts) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

export const fmtDate = (ts) =>
  new Date(ts).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })

export const minsSince = (ts) => Math.floor((Date.now() - ts) / 60000)

// GST for restaurants (India): composition/regular non-AC default 5% (2.5 CGST + 2.5 SGST), no ITC
export function billTotals(order, settings) {
  const sub = order.items.reduce((s, it) => s + it.price * it.qty, 0)
  const discount = order.payment?.discount || 0
  const taxable = Math.max(0, sub - discount)
  const gstRate = settings.gstRate ?? 5
  const cgst = (taxable * gstRate) / 200
  const sgst = (taxable * gstRate) / 200
  const svc = settings.serviceCharge ? (taxable * settings.serviceCharge) / 100 : 0
  const total = Math.round(taxable + cgst + sgst + svc)
  return { sub, discount, taxable, cgst, sgst, svc, gstRate, total, roundOff: total - (taxable + cgst + sgst + svc) }
}

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
