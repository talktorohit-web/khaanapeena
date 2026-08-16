// Modifiers / add-ons — the choices made on a dish: spice level, size, extra cheese.
//
// Two rules keep the rest of the app safe to leave alone:
//
//  1. `li.price` is always the EFFECTIVE unit price (base + chosen add-ons), so
//     every existing `li.price * li.qty` in billing, GST, KOT and the reports
//     stays correct without knowing modifiers exist. `li.basePrice` keeps the
//     dish's own price for display and reporting.
//  2. Two lines of the same dish merge only when their chosen options match —
//     "Paneer Tikka, extra spicy" must never fold into a plain Paneer Tikka.

export const modGroups = (item) => (item?.modifiers || []).filter((g) => g && (g.options || []).length > 0)
export const hasModifiers = (item) => modGroups(item).length > 0

export const modsTotal = (mods) => (mods || []).reduce((s, m) => s + (+m.price || 0), 0)
export const effectivePrice = (item, mods) => (+item?.price || 0) + modsTotal(mods)

// stable signature of a line's chosen options — the merge / match key
export const modsKey = (mods) => (mods || []).map((m) => m.oid).sort().join(',')
export const lineKey = (li) => `${li.itemId}|${li.deducted ? 1 : 0}|${modsKey(li.mods)}`
export const sameLine = (a, b) => lineKey(a) === lineKey(b)

// "Extra spicy · Extra cheese" — for the cart, the ticket and the bill
export const modsLabel = (mods) => (mods || []).map((m) => m.name).join(' · ')

// names of required groups the user hasn't answered yet (blocks the add)
export const missingRequired = (item, mods) =>
  modGroups(item)
    .filter((g) => g.required && !(mods || []).some((m) => m.gid === g.id))
    .map((g) => g.name)

/**
 * SECURITY: rebuild a line's modifiers from the authoritative menu.
 *
 * A guest QR payload can claim any option name or price it likes, so every
 * option is looked up by id and re-priced from the menu — unknown groups and
 * options are dropped, duplicates collapse, and a single-choice group keeps
 * only its first selection. Returns the clean mods array.
 */
export function repriceMods(item, mods) {
  const groups = modGroups(item)
  const out = []
  const singleUsed = new Set()
  ;(mods || []).forEach((m) => {
    const g = groups.find((x) => x.id === m?.gid)
    const opt = g && (g.options || []).find((o) => o.id === m?.oid)
    if (!g || !opt) return
    if (!g.multi) {
      if (singleUsed.has(g.id)) return
      singleUsed.add(g.id)
    }
    if (out.some((x) => x.gid === g.id && x.oid === opt.id)) return
    out.push({ gid: g.id, oid: opt.id, name: opt.name, price: +opt.price || 0 })
  })
  return out
}

// re-price a whole order line against the menu (used by both guest sanitisers)
export function repriceLine(li, item) {
  const mods = repriceMods(item, li.mods)
  return { mods, price: effectivePrice(item, mods) }
}
