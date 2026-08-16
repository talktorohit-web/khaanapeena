// Half / Full portions.
//
// A portion is NOT a second mechanism — it is an ordinary required, single-choice
// modifier group with fixed ids. That way the till picker, the guest QR screen,
// the KOT, the bill line and the add-on report all handle portions the day this
// ships, without one line of new plumbing.
//
// The catch modifiers.js documents: option `price` is a DELTA on the item's base
// price (`li.price` = base + deltas). The Menu editor keeps the item's base price
// equal to the Full price, so Full is +0 and Half carries a negative delta. The
// owner never sees a delta — buildPortionGroup/portionPrices convert both ways.

export const PORTION_GID = 'mg_portion'
export const HALF_OID = 'mo_half'
export const FULL_OID = 'mo_full'

export const portionGroup = (item) => (item?.modifiers || []).find((g) => g?.id === PORTION_GID) || null

export const hasPortions = (item) => !!portionGroup(item)

/** The two absolute rupee prices a guest actually pays, or null. */
export function portionPrices(item) {
  const g = portionGroup(item)
  if (!g) return null
  const base = +item.price || 0
  const at = (oid) => {
    const o = (g.options || []).find((x) => x.id === oid)
    return o ? base + (+o.price || 0) : null
  }
  return { half: at(HALF_OID), full: at(FULL_OID) }
}

const round2 = (n) => Math.round(n * 100) / 100

/** Build the group from what the owner typed: two absolute prices. */
export const buildPortionGroup = (base, half, full) => ({
  id: PORTION_GID,
  name: 'Portion',
  required: true,
  multi: false,
  options: [
    { id: HALF_OID, name: 'Half', price: round2(+half - +base) },
    { id: FULL_OID, name: 'Full', price: round2(+full - +base) },
  ],
})
