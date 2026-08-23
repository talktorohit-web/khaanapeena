// Party / function packages — the per-plate rate lists a restaurant quotes for a
// kitty party, a birthday or a conference.
//
// Rates are quoted PER PLATE and GST is added on top, never baked in: that is how
// every banquet quote in India reads, and a guest who is shown "₹600 + GST" and
// later billed ₹630 has been told the truth. `quote()` below is the only place the
// arithmetic happens, so the pamphlet, the screen and the WhatsApp message cannot
// disagree about what a party costs.

export const OCCASIONS = [
  {
    id: 'kitty',
    label: 'Kitty Party',
    icon: '🎀',
    blurb: 'Afternoon get-together, unhurried, with the table kept free for the whole session.',
    // what this occasion adds regardless of which package is chosen
    extras: [
      'Table reserved for the full session — no rushing you out',
      'Tambola / housie table and score sheets on request',
      'One reserved parking bay for the host',
    ],
    minGuests: 10,
  },
  {
    id: 'birthday',
    label: 'Birthday Party',
    icon: '🎂',
    blurb: 'Cake, decoration and a table set aside for gifts and photographs.',
    extras: [
      'Cake cutting table with knife, candles and plates',
      'Basic balloon and ribbon decoration on the cake table',
      '“Happy Birthday” announcement and music',
      'Outside cake allowed — no cakeage charge',
    ],
    minGuests: 10,
  },
  {
    id: 'conference',
    label: 'Conference / Meeting',
    icon: '💼',
    blurb: 'Working lunch with the room set for a meeting rather than a celebration.',
    extras: [
      'Projector screen and whiteboard',
      'Two tea / coffee breaks with biscuits',
      'Writing pads, pens and bottled water on the table',
      'Wi-Fi password and an extension board for laptops',
    ],
    minGuests: 15,
  },
]

// The five rate lists, basic → luxury. Content is deliberately written the way a
// restaurant says it out loud ("2 starters — no paneer"), because this text is read
// by a customer on a pamphlet, not by a programmer.
export const DEFAULT_PACKAGES = [
  {
    id: 'silver',
    name: 'Silver',
    tag: 'The everyday get-together',
    rate: 600,
    veg: true,
    includes: [
      '1 welcome drink (soft drink / jaljeera / nimbu paani)',
      '2 starters — veg, without paneer',
      '1 dal',
      '1 sabji',
      'Mixed breads — tandoori roti & naan, unlimited',
      'Plain rice',
      'Salad, papad, pickle & chutney',
    ],
  },
  {
    id: 'gold',
    name: 'Gold',
    tag: 'Most families pick this one',
    rate: 850,
    veg: true,
    includes: [
      '2 welcome drinks (1 mocktail included)',
      '3 starters — including 1 paneer',
      '1 dal (dal makhani or dal tadka)',
      '2 sabji — 1 paneer, 1 seasonal',
      'Mixed breads — roti, naan & laccha paratha, unlimited',
      'Jeera rice',
      '1 dessert (gulab jamun or ice cream)',
      'Salad, raita, papad, pickle & chutney',
    ],
  },
  {
    id: 'platinum',
    name: 'Platinum',
    tag: 'When you want a spread',
    rate: 1100,
    veg: true,
    includes: [
      'Unlimited mocktails & soft drinks',
      '4 starters — including paneer tikka and mushroom',
      'Soup of the day',
      'Dal makhani',
      '3 sabji — paneer, kofta & seasonal',
      'Assorted breads — roti, naan, kulcha, laccha paratha',
      'Veg pulao or jeera rice',
      '2 desserts (gulab jamun, ice cream)',
      'Salad bar, raita, papad, pickle & chutney',
    ],
  },
  {
    id: 'royal',
    name: 'Royal',
    tag: 'Live counters, proper occasion',
    rate: 1500,
    veg: true,
    includes: [
      'Unlimited mocktails, soft drinks & fresh lime',
      'Live chaat counter (gol gappe, tikki, papdi chaat)',
      '5 starters — paneer tikka, mushroom, hara bhara kebab & 2 more',
      'Soup of the day',
      'Dal makhani + 3 sabji including shahi paneer & malai kofta',
      'Assorted breads from the tandoor, unlimited',
      'Veg dum biryani',
      '3 desserts including ice cream counter',
      'Salad bar, raita, papad, pickle & chutney',
    ],
  },
  {
    id: 'maharaja',
    name: 'Maharaja',
    tag: 'Nothing held back',
    rate: 2100,
    veg: true,
    includes: [
      'Unlimited mocktails, fresh juices & welcome soup',
      'Live chaat counter + live tandoor counter',
      '6 starters — paneer tikka, mushroom, malai broccoli, spring roll, corn kebab, tikki',
      '5 mains — shahi paneer, malai kofta, dal makhani & 2 chef specials',
      'Assorted breads — naan, kulcha, missi roti, laccha paratha, unlimited',
      'Hyderabadi veg dum biryani',
      'Live jalebi & rabdi counter',
      '4 desserts including ice cream counter and dry fruits',
      'Salad bar, 2 raitas, papad, pickle & chutney',
      'Dedicated captain and separate service staff for your function',
    ],
  },
]

// Non-veg is priced as an add-on per plate rather than a separate ladder — one rate
// list is easier to sell and easier to keep honest than ten.
export const NONVEG_ADDON = 150

// Every package is quoted the same way. `guests` below is the plate count actually
// charged: banquets bill a minimum guarantee even if fewer people turn up, so the
// larger of (booked guests, package minimum) is what the customer pays for, and the
// quote says so rather than surprising them on the day.
export function quote(pkg, guests, opts = {}) {
  const gstRate = opts.gstRate ?? 5
  const minGuests = opts.minGuests ?? 0
  const nonVeg = !!opts.nonVeg
  const perPlate = (pkg?.rate || 0) + (nonVeg ? (opts.nonVegAddon ?? NONVEG_ADDON) : 0)
  const plates = Math.max(Math.max(0, Math.round(+guests || 0)), minGuests)
  const billedMinimum = plates > 0 && plates > Math.round(+guests || 0)
  const subtotal = perPlate * plates
  const advance = Math.round(subtotal * (opts.advancePct ?? 25) / 100)
  const gst = (subtotal * gstRate) / 100
  return {
    perPlate, plates, billedMinimum, subtotal,
    gstRate, gst, total: Math.round(subtotal + gst), advance,
  }
}

export const packagesOf = (settings) =>
  (settings?.partyPackages?.length ? settings.partyPackages : DEFAULT_PACKAGES)

export const occasionOf = (id) => OCCASIONS.find((o) => o.id === id) || OCCASIONS[0]

// ---- bookings ----
// A booking's money is the sum of what has actually been collected against it, not
// a running "advance" field that has to be kept in step with a payment list.
export const bookingPaid = (b) => (b?.payments || []).reduce((s, p) => s + (+p.amount || 0), 0)
export const bookingBalance = (b) => Math.max(0, Math.round((b?.quote?.total || 0) - bookingPaid(b)))

export const BOOKING_STATUS = {
  enquiry: ['stone', '📝 Enquiry — no money taken'],
  confirmed: ['green', '✅ Confirmed'],
  completed: ['blue', '🍽️ Done'],
  cancelled: ['red', '✖️ Cancelled'],
}

// Upcoming first, because a booking list is read to answer "what is coming".
export const sortBookings = (list) => [...(list || [])].sort((a, b) => {
  const rank = (x) => (x.status === 'cancelled' ? 2 : x.status === 'completed' ? 1 : 0)
  return rank(a) - rank(b) || String(a.date).localeCompare(String(b.date))
})
