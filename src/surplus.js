// Leftover food — the two completely different things a restaurant is left holding
// at the end of a service, and the rule that they must never be confused.
//
//  1. SURPLUS: fresh food, cooked today, plated for nobody. Legal to sell, and the
//     only question is whether it goes out at half price or into a bin.
//  2. PLATE WASTE: food that came back from a table. It is NOT food any more. It
//     can go to animals, to biogas, or to a bin — never to another guest.
//
// These are kept in two separate stores with NO code path between them. There is
// deliberately no "move this to surplus" on a plate-waste record and no way to
// build a listing out of one, because the day that shortcut exists is the day
// somebody uses it at 11pm to clear a tray, and that is a food-poisoning case and
// the end of the restaurant's licence.

// ---- where plate waste actually goes ----
export const DESTINATIONS = [
  ['gaushala', '🐄 Gaushala'],
  ['strays', '🐕 Street dogs / cats'],
  ['pigfarm', '🐖 Pig or poultry farm'],
  ['biogas', '♻️ Biogas / compost'],
  ['bin', '🗑️ Municipal bin'],
]
export const destinationLabel = (k) => DESTINATIONS.find(([c]) => c === k)?.[1] || k || '—'

// Anything that leaves the premises as feed should say who took it. This is what an
// FSSAI inspector asks for, and it is also what stops "it went to the gaushala"
// becoming the answer to every missing tray.
export const needsCollector = (dest) => dest === 'gaushala' || dest === 'strays' || dest === 'pigfarm'

// ---- surplus listings ----
// One array holds both shapes. A `bag` is the end-of-night fixed-price bag whose
// contents are whatever is left; an `item` is a specific tray marked down.
export const KINDS = { item: 'Marked-down dish', bag: 'Surprise bag' }

export const DEFAULT_BAG_PRICE = 99
// A sensible default sell-by: cooked food should not be sold on into the night.
// The owner can shorten it; the point is that it is never open-ended.
export const DEFAULT_SELL_HOURS = 4

/**
 * Live / sold out / expired is DERIVED, never stored.
 *
 * A stored flag would go stale the moment nobody had the page open: a listing whose
 * sell-by passed at 22:40 has to behave as expired at 22:41 whether or not anything
 * re-rendered. Everything that can sell a listing asks this function first.
 */
export function surplusStatus(l, now = Date.now()) {
  if (!l) return 'expired'
  const left = remaining(l)
  if (l.cancelled) return 'cancelled'
  // Sold-out is checked BEFORE the sell-by. An empty tray cannot hurt anybody, so
  // painting it as a hazard is noise — and a screen that cries hazard on trays with
  // nothing left is a screen whose real warnings stop being read.
  if (left <= 0) return 'sold-out'
  if (l.until && now > l.until) return 'expired'
  return 'live'
}
export const remaining = (l) => Math.max(0, Math.round((+l?.qty || 0) - (+l?.soldQty || 0)))
export const isSellable = (l, now = Date.now()) => surplusStatus(l, now) === 'live'
export const liveSurplus = (state, now = Date.now()) => (state?.surplus || []).filter((l) => isSellable(l, now))

export const STATUS_LABEL = {
  live: ['green', 'On sale'],
  'sold-out': ['blue', 'All gone'],
  expired: ['red', 'Past sell-by — do not sell'],
  cancelled: ['stone', 'Pulled'],
}

// How much of the menu price is being given up. Shown to the owner as a percentage
// because "₹120 instead of ₹260" is the sentence a guest understands but "54% off"
// is the one that tells the owner whether they are clearing food or giving it away.
export const discountPct = (l) =>
  l?.fullPrice > 0 ? Math.round(((l.fullPrice - l.price) / l.fullPrice) * 100) : 0

/**
 * What the surplus counter actually did for the business.
 *
 * `recovered` is real money taken for food that was otherwise going in a bin, so it
 * is NOT a discount and must never be reported as one — a cashier did not give this
 * away, the alternative was zero. `forgone` is the gap to menu price, kept separate
 * so the owner can see both numbers and decide whether the markdown is too deep.
 */
export function recovery(surplus, range) {
  const inRange = (t) => !range || (t >= range.from && t <= range.to)
  // the listings themselves are still dated by when they were put out
  const rows = (surplus || []).filter((l) => inRange(l.createdAt))
  let recovered = 0, fullValue = 0, portionsSold = 0, portionsLost = 0
  ;(surplus || []).forEach((l) => {
    if (Array.isArray(l.sales) && l.sales.length) {
      // Money is dated by the stamp on each portion, not by the tray. A tray put out
      // at 10pm and sold out after midnight took its money TODAY, and an owner
      // reading "recovered today" means the cash that came in today.
      l.sales.forEach((sale) => {
        if (!inRange(sale.at)) return
        const q = +sale.qty || 0            // negative when a punch was voided
        portionsSold += q
        recovered += q * (sale.price ?? l.price ?? 0)
        fullValue += q * (+l.fullPrice || 0)
      })
    } else if (inRange(l.createdAt)) {
      // listings from before portions were stamped (and the seeded demo rows) know
      // only a running total, so they fall back to the tray's own date
      const q = +l.soldQty || 0
      portionsSold += q
      recovered += q * (+l.price || 0)
      fullValue += q * (+l.fullPrice || 0)
    }
    // listed but never sold, and now past its sell-by — this is what still went out
    if (inRange(l.createdAt) && surplusStatus(l) === 'expired') portionsLost += remaining(l)
  })
  return {
    rows, recovered, fullValue, forgone: Math.max(0, fullValue - recovered),
    portionsSold, portionsLost,
    // of everything listed, what share actually found a buyer
    sellThrough: portionsSold + portionsLost > 0 ? portionsSold / (portionsSold + portionsLost) : null,
  }
}

/**
 * A cart line for a surplus listing.
 *
 * `deducted: true` is the important field and it is not a mistake. Stock is taken
 * off recipes when a KOT is fired, and this food was cooked hours ago — its
 * ingredients came out of stock then. Punching it as an ordinary line would deduct
 * the same dal and paneer a second time and quietly put the stock-variance report
 * out by exactly the amount of food we managed to rescue. Marking it already
 * deducted also keeps it off the kitchen ticket, which is correct: there is nothing
 * to cook.
 */
export function surplusLine(l) {
  return {
    itemId: l.itemId || null,
    name: l.kind === 'bag' ? l.name : `♻️ ${l.name} (surplus)`,
    price: Math.max(0, Math.round(+l.price || 0)),
    qty: 1,
    deducted: true,
    surplusId: l.id,
    // carried so a report can price the rescue against what it should have fetched
    fullPrice: +l.fullPrice || 0,
    taxClass: l.taxClass || 'gst',
  }
}

export const isSurplusLine = (li) => !!li?.surplusId

// ---- the offer, in words ----
// One builder for the QR menu, the counter and the WhatsApp message, so a guest
// cannot be told a different price by the phone than by the person at the till.
export function offerText(settings, listings, now = Date.now()) {
  const live = (listings || []).filter((l) => isSellable(l, now))
  if (!live.length) return null
  const lines = [
    `*${settings?.name || 'Our kitchen'}* — today's surplus 🌱`,
    '',
    ...live.map((l) => (l.kind === 'bag'
      ? `• *${l.name}* — ₹${l.price} (${remaining(l)} left)`
      : `• *${l.name}* — ₹${l.price} instead of ₹${l.fullPrice} (${remaining(l)} left)`)),
    '',
    'Fresh food cooked today that would otherwise be thrown away. First come, first served.',
  ]
  // the EARLIEST sell-by, not the latest. This is one sentence covering several
  // listings, so it has to be the promise that cannot be broken — telling a guest
  // "until 11pm" when the dal stops at 10 is how they arrive to be turned away.
  const untils = live.map((l) => l.until).filter(Boolean)
  const until = untils.length ? Math.min(...untils) : 0
  if (until) lines.push(`Available until ${new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}.`)
  if (settings?.phone) lines.push('', `${settings.phone}`)
  return lines.join('\n')
}

// Who is worth telling. Recent customers first — a blast to someone who came once
// last winter is how a restaurant teaches people to mute it.
export function blastAudience(customers, days = 45, limit = 40) {
  const from = Date.now() - days * 864e5
  return (customers || [])
    .filter((c) => c.phone && c.lastVisit && c.lastVisit >= from)
    .sort((a, b) => (b.lastVisit || 0) - (a.lastVisit || 0))
    .slice(0, limit)
}
