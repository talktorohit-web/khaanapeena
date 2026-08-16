// Kitchen stations = kitchen printers. `item.station` routes a dish to the ticket
// that prints at that counter, so the list has to be the restaurant's, not ours —
// a place with a sweets counter or a bar needs its own route. These four ship as
// defaults because every existing menu already uses them; anything else the owner
// types is kept as-is. The printer IP behind each station lives in Settings.
const DEFAULT_STATIONS = ['kitchen', 'tandoor', 'chinese', 'beverage']

export default DEFAULT_STATIONS

// Stored lower-case so "Tandoor" and "tandoor" can't become two stations and
// split the Kitchen-performance report in half.
export const normalizeStation = (s) => String(s || '').trim().toLowerCase() || 'kitchen'

// defaults first, then whatever the menu has grown — feeds the editor's datalist
export const stationsInUse = (items) => [
  ...new Set([...DEFAULT_STATIONS, ...(items || []).map((i) => normalizeStation(i.station))]),
]
