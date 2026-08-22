// Paid membership — a customer ID card the regulars buy once a year.
//
// This is a CONTRACT, not a discretionary discount: the customer paid for the rate,
// so the till applies it on its own rather than sending a waiter to find a manager.
// That is the same reasoning as happy hour, and the reason the member's rate is
// stamped on the bill with their member number is so the discount report can always
// answer "who authorised this" with something better than a name.

// One year. Kept as a constant rather than sprinkled through the code, because the
// renewal date printed on the card and the date the till checks must be the same.
export const VALIDITY_DAYS = 365

export const TIERS = [
  {
    id: 'silver',
    name: 'Silver',
    icon: '🥈',
    fee: 499,
    discountPct: 5,
    pointsX: 2,
    partyPct: 0,
    benefits: [
      '5% off every food bill, all year',
      'Double loyalty points on every visit',
      'Free dessert on your birthday',
      'Priority table on weekends',
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    icon: '🥇',
    fee: 999,
    discountPct: 10,
    pointsX: 3,
    partyPct: 5,
    benefits: [
      '10% off every food bill, all year',
      'Triple loyalty points on every visit',
      'Free birthday cake (500g) booked in advance',
      '5% off any party or function package',
      'Free home delivery within 5 km',
      'Table held for 20 minutes — no waiting on a full night',
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    icon: '💎',
    fee: 1999,
    discountPct: 15,
    pointsX: 5,
    partyPct: 10,
    benefits: [
      '15% off every food bill, all year',
      '5× loyalty points on every visit',
      'One complimentary starter every month',
      'Free birthday cake (1kg) and a reserved table',
      '10% off any party or function package',
      'Free home delivery, no distance limit',
      'Guaranteed table with 2 hours notice, even on a festival night',
      'A direct number that reaches the owner, not the counter',
    ],
  },
]

export const tierOf = (id) => TIERS.find((t) => t.id === id) || null

// Human-readable card number. Sequential per restaurant, zero-padded, with a prefix
// taken from the restaurant's own name — a member reads this number out on the
// phone, so it has to be short and say who issued it.
export function nextMemberId(state) {
  const prefix = String(state?.settings?.name || 'KP')
    .replace(/[^A-Za-z ]/g, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'KP'
  const used = (state?.customers || [])
    .map((c) => c.member?.memberId)
    .filter(Boolean)
    .map((id) => parseInt(String(id).split('-').pop(), 10))
    .filter((n) => Number.isFinite(n))
  const next = (used.length ? Math.max(...used) : 0) + 1
  return `${prefix}-${String(next).padStart(4, '0')}`
}

// A membership that has run out is NOT deleted — the record is what proves they were
// once a member, and an expired card that silently vanished would look to the
// customer like the restaurant lost their money.
export const isActive = (m, now = Date.now()) => !!m && !m.cancelled && m.expiresAt > now
export const daysLeft = (m, now = Date.now()) => (m ? Math.ceil((m.expiresAt - now) / 864e5) : 0)

export const memberOf = (customer) => (isActive(customer?.member) ? customer.member : null)
export const memberTier = (customer) => { const m = memberOf(customer); return m ? tierOf(m.tier) : null }

// What the member's rate takes off THIS bill. Returns 0 for a lapsed card, which is
// what makes an expired membership fail closed rather than quietly keep paying out.
export function memberDiscount(customer, taxableAmount) {
  const t = memberTier(customer)
  if (!t) return 0
  return Math.round((Math.max(0, taxableAmount) * t.discountPct) / 100)
}

// The pitch, in the words an owner would actually use at the counter. `spendPerMonth`
// makes it concrete: a membership only sells when the customer can see it paying for
// itself, and an honest break-even is more persuasive than a bigger promise.
export function explainBenefits(tier, opts = {}) {
  const spend = Math.max(0, Math.round(+opts.monthlySpend || 0))
  const yearly = spend * 12
  const saved = Math.round((yearly * tier.discountPct) / 100)
  const net = saved - tier.fee
  const breakEven = tier.discountPct ? Math.ceil(tier.fee / (tier.discountPct / 100)) : 0
  return {
    tier, yearly, saved, net, breakEven,
    // the sentence that closes it, or admits it doesn't
    verdict: !spend
      ? `Spend about ₹${breakEven.toLocaleString('en-IN')} with us in a year and the card has paid for itself.`
      : net > 0
        ? `On ₹${spend.toLocaleString('en-IN')} a month you'd save about ₹${saved.toLocaleString('en-IN')} a year — ₹${net.toLocaleString('en-IN')} more than the card costs.`
        : `On ₹${spend.toLocaleString('en-IN')} a month this card wouldn't pay for itself yet — you'd need about ₹${Math.ceil(breakEven / 12).toLocaleString('en-IN')} a month. Worth taking when you eat with us more often.`,
  }
}

// The membership card / benefits sheet as a WhatsApp message.
export function membershipText(settings, customer, tier) {
  const m = customer?.member
  return [
    `*${settings.name || 'Our Restaurant'}*`,
    `${tier.icon} *${tier.name} Membership*`,
    '',
    ...(m ? [`Member: *${customer.name}*`, `Card no: *${m.memberId}*`, `Valid till: *${new Date(m.expiresAt).toLocaleDateString('en-IN')}*`, ''] : []),
    '*Your benefits:*',
    ...tier.benefits.map((b) => `• ${b}`),
    '',
    `Membership fee ₹${tier.fee}/year.`,
    ...(settings.phone ? [`Questions? ${settings.phone}`] : []),
  ].join('\n')
}
