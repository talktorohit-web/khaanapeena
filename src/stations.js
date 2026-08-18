// Kitchen stations = kitchen printers. `item.station` routes a dish to the ticket
// that prints at that counter, so the list has to be the restaurant's, not ours —
// a place with a sweets counter or a bar needs its own route. These four ship as
// defaults because every existing menu already uses them; the owner's real list —
// names and IPs — is `settings.printers` below, which the Menu editor picks from.
const DEFAULT_STATIONS = ['kitchen', 'tandoor', 'chinese', 'beverage']

export default DEFAULT_STATIONS

// Stored lower-case so "Tandoor" and "tandoor" can't become two stations and
// split the Kitchen-performance report in half.
export const normalizeStation = (s) => String(s || '').trim().toLowerCase() || 'kitchen'

// defaults first, then whatever the menu has grown
export const stationsInUse = (items) => [
  ...new Set([...DEFAULT_STATIONS, ...(items || []).map((i) => normalizeStation(i.station))]),
]

// ---- the printers the owner has actually installed (settings.printers) ----
// A printer's NAME is its station key, normalised exactly the way `item.station`
// is, so "Tandoor" typed in Settings and "tandoor" already saved on a dish are the
// same counter. That also means renaming a printer MOVES it: dishes keep the old
// name and Settings calls them out, rather than a dish quietly rerouting to a
// counter nobody sent it to.
export const printerKey = (p) => normalizeStation(p?.name)

export const printersOf = (settings) => {
  const seen = new Set()
  return (settings?.printers || []).filter((p) => {
    // a blank name normalises to "kitchen" and would silently become a second
    // kitchen route — a half-typed row isn't a printer yet
    if (!String(p?.name || '').trim()) return false
    const k = printerKey(p)
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

// what a new install — and an install migrating up from free-text stations — starts
// with: one printer per station the menu already routes to, so no existing dish is
// left pointing at a counter that isn't in the list
export const seedPrinters = (items) => stationsInUse(items).map((name) => ({ name, ip: '' }))

// The counter a dish belongs to. The order line only carries `itemId`, so the
// station is read from the menu — and a dish that has since been deleted from the
// menu still resolves (to the default counter) rather than vanishing off the
// ticket. A line nobody prints is food nobody cooks.
export const stationOfLine = (line, menuById) => normalizeStation(menuById.get(line?.itemId)?.station)

// The device a counter's ticket goes to, or null when that counter has no printer
// of its own and should fall back to the main kitchen printer.
export const printerFor = (settings, station) => {
  const key = normalizeStation(station)
  return printersOf(settings).find((p) => printerKey(p) === key) || null
}
