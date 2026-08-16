// Sub-categories sit one level under a category — "Main Course › Paneer".
//
// Deliberately free text on `item.subCat` rather than a managed list: a rigid
// list is one more screen to maintain, and every restaurant slices its menu
// differently. Consistency comes from suggesting what the category already uses
// (plus the starters below) in a datalist, so the owner picks rather than retypes.

export const SUBCAT_SUGGESTIONS = {
  c_starters: ['Veg Tikka', 'Non-veg Tikka', 'Chinese Starters'],
  c_main: ['Paneer', 'Chicken', 'Dal', 'Veg'],
  c_breads: ['Tandoori', 'Tawa', 'Rice'],
  c_south: ['Dosa', 'Idli & Vada', 'Uttapam'],
  c_chinese: ['Noodles', 'Rice', 'Gravy'],
  c_bev: ['Hot', 'Cold', 'Packaged'],
  c_desserts: ['Indian Sweets', 'Ice Cream'],
}

export const subCatOf = (item) => String(item?.subCat || '').trim()

/** Suggestions for one category: what it already uses, plus our starters. */
export const subCatsFor = (items, catId) =>
  [...new Set([
    ...(items || []).filter((i) => i.catId === catId).map(subCatOf).filter(Boolean),
    ...(SUBCAT_SUGGESTIONS[catId] || []),
  ])].sort((a, b) => a.localeCompare(b))

/** [[subCat, items], …] for a category's list — unfiled items always land last. */
export function groupBySubCat(items) {
  const map = new Map()
  ;(items || []).forEach((i) => {
    const k = subCatOf(i)
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(i)
  })
  return [...map.entries()].sort(([a], [b]) => (a ? 0 : 1) - (b ? 0 : 1) || a.localeCompare(b))
}
