import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Modal, VegDot, Toggle, Field, inputCls, btnPrimary, btnGhost, Badge, Empty } from '../components.jsx'
import { inr0, inr, uid } from '../utils.js'
import { toHindi, toPunjabi } from '../translit.js'
import { subCatsFor, subCatOf, groupBySubCat } from '../subcategories.js'
import { normalizeStation, printersOf, printerKey } from '../stations.js'
import { PORTION_GID, portionPrices, buildPortionGroup } from '../portions.js'

export default function MenuPage() {
  const { state, t, update } = useStore()
  const [editItem, setEditItem] = useState(null)
  const [addOpen, setAddOpen] = useState(false)
  const [scanOpen, setScanOpen] = useState(false)
  const [q, setQ] = useState('')

  const ql = q.trim().toLowerCase()
  const match = (i) =>
    !ql ||
    i.name.toLowerCase().includes(ql) ||
    subCatOf(i).toLowerCase().includes(ql) ||
    (i.nameHi || '').includes(q.trim()) ||
    (i.namePa || '').includes(q.trim())
  const totalItems = state.items.length
  const shown = state.items.filter(match).length

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-5 flex-wrap gap-2">
        <h1 className="text-2xl font-black text-ink-900">{t('menu')} <span className="text-stone-300 text-lg font-bold">· {totalItems}</span></h1>
        <div className="flex gap-2">
          <button onClick={() => setScanOpen(true)} className={btnGhost}>📸 AI Photo → Menu</button>
          <button onClick={() => setAddOpen(true)} className={btnPrimary}>＋ {t('addItem')}</button>
        </div>
      </div>

      <div className="mb-4">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('searchItems')} className={inputCls + ' max-w-xs'} />
      </div>

      {state.categories.map((c) => {
        const items = state.items.filter((i) => i.catId === c.id && match(i))
        if (!items.length) return null
        // sub-category headings only earn their space once the category actually
        // uses them — a category with no sub-categories still reads as one list
        const groups = groupBySubCat(items)
        const showSubs = groups.some(([sub]) => sub)
        return (
          <div key={c.id} className="mb-6">
            <h3 className="font-bold text-stone-500 text-sm mb-2 uppercase tracking-wide">{c.name} <span className="text-stone-300">· {items.length}</span></h3>
            <div className="bg-white rounded-2xl border border-stone-100 overflow-hidden">
              {groups.map(([sub, list], gi) => (
                <div key={sub || '_'}>
                  {showSubs && (
                    <div className={'px-4 py-1.5 bg-stone-50/70 text-[10px] font-bold uppercase tracking-wide text-stone-400' + (gi ? ' border-t border-stone-100' : '')}>
                      {sub || 'Not sorted'}
                    </div>
                  )}
                  <div className="divide-y divide-stone-50">
                    {list.map((i) => {
                      const pp = portionPrices(i)
                      return (
                        <div key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                          <VegDot veg={i.veg} />
                          <div className="flex-1 min-w-0">
                            <div className="font-semibold text-sm text-ink-900">{i.name} {i.recipe?.length > 0 && <span title="Has recipe — food cost tracked" className="text-[10px]">🧪</span>}</div>
                            <div className="text-[11px] text-stone-400 truncate">{[i.nameHi, subCatOf(i), i.station].filter(Boolean).join(' · ')}</div>
                            {pp && <div className="text-[11px] font-semibold text-saffron-700">Half {inr0(pp.half)} · Full {inr0(pp.full)}</div>}
                          </div>
                          <span className="font-bold text-sm w-16 text-right">{inr0(i.price)}</span>
                          <button onClick={() => setEditItem(i)} className="text-xs text-stone-400 hover:text-saffron-600 font-bold px-2">✏️</button>
                          <Toggle on={i.available} onChange={(v) => update((s) => { const x = s.items.find((y) => y.id === i.id); if (x) x.available = v })} />
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )
      })}
      {ql && shown === 0 && <Empty icon="🔍" text={`No menu items match “${q.trim()}”`} />}

      {(addOpen || editItem) && (
        <ItemModal
          item={editItem}
          onClose={() => { setAddOpen(false); setEditItem(null) }}
        />
      )}
      {scanOpen && <ScanModal onClose={() => setScanOpen(false)} />}
    </div>
  )
}

function ItemModal({ item, onClose }) {
  const { state, update } = useStore()
  // the Portion group is edited by its own quick-setup below, so it's held out of
  // `f.modifiers` while the modal is open and rebuilt on save
  const [f, setF] = useState(() =>
    item
      ? { ...item, modifiers: (item.modifiers || []).filter((g) => g?.id !== PORTION_GID) }
      : { name: '', nameHi: '', namePa: '', price: '', catId: state.categories[0]?.id ?? '', subCat: '', veg: true, station: printerKey(printersOf(state.settings)[0]), available: true, recipe: [] })
  const set = (k, v) => setF((p) => ({ ...p, [k]: v }))

  // ---- Half / Full portions (a required single-choice modifier group) ----
  // The form holds the two ABSOLUTE prices a guest pays; the deltas are worked
  // out at save time against the base price. Editing an existing item reads them
  // back the same way, so a save → reopen shows exactly what was typed.
  const [portions, setPortions] = useState(() => {
    const pp = portionPrices(item)
    return pp ? { on: true, half: pp.half ?? '', full: pp.full ?? '' } : { on: false, half: '', full: '' }
  })
  const togglePortions = (on) => {
    if (!on) return setPortions((p) => ({ ...p, on: false }))
    const base = +f.price || 0
    setPortions((p) => ({
      on: true,
      // a sensible first guess: full = the price already typed, half ≈ 60% of it
      full: p.full === '' ? (base || '') : p.full,
      half: p.half === '' ? (base ? Math.round((base * 0.6) / 5) * 5 : '') : p.half,
    }))
  }
  // the item's own price IS the full-plate price, so the two move together
  const setPrice = (v) => { set('price', v); setPortions((p) => (p.on ? { ...p, full: v } : p)) }
  const setFull = (v) => { setPortions((p) => ({ ...p, full: v })); set('price', v) }
  const portionsReady = !portions.on || (+portions.half > 0 && +portions.full > 0)

  // ---- auto Hindi / Punjabi from the English name ----
  // Auto-fill stops the moment the owner types in the field themselves — their
  // spelling always wins over the machine's guess.
  const [autoHi, setAutoHi] = useState(!item?.nameHi)
  const [autoPa, setAutoPa] = useState(!item?.namePa)
  const setName = (v) => setF((p) => ({
    ...p, name: v,
    ...(autoHi ? { nameHi: toHindi(v) } : {}),
    ...(autoPa ? { namePa: toPunjabi(v) } : {}),
  }))

  // Categories and counters could only be PICKED, never created — and a category
  // could not be added anywhere in the app at all, so a new section of the menu was
  // impossible without one already existing. Both dropdowns now carry a "＋ New"
  // option; a non-empty name here is created on save and the dish assigned to it.
  const [newCat, setNewCat] = useState(null)      // null = not adding
  const [newPrinter, setNewPrinter] = useState(null)
  const NEW = '__kp_new'

  const subCats = subCatsFor(state.items, f.catId)
  // the printers actually set up in Settings — plus, when this dish is already
  // routed somewhere that isn't one of them, that route as well. Dropping it would
  // reassign the dish to whichever printer happened to be first in the list, and
  // food would start coming out at the wrong counter.
  const printers = printersOf(state.settings)
  const station = normalizeStation(f.station)
  const installed = printers.some((p) => printerKey(p) === station)

  const ings = state.ingredients || []
  const recipe = f.recipe || []
  const ingCost = (id) => ings.find((g) => g.id === id)?.costPerUnit || 0
  const ingUnit = (id) => ings.find((g) => g.id === id)?.unit || ''
  const plateCost = recipe.reduce((s, r) => s + (+r.qty || 0) * ingCost(r.ingId), 0)
  const foodCostPct = +f.price > 0 && recipe.length ? (plateCost / +f.price) * 100 : null

  const addLine = () => {
    const used = new Set(recipe.map((r) => r.ingId))
    const next = ings.find((g) => !used.has(g.id))
    if (next) set('recipe', [...recipe, { ingId: next.id, qty: 0 }])
  }
  const setLine = (idx, patch) => set('recipe', recipe.map((r, i) => (i === idx ? { ...r, ...patch } : r)))
  const rmLine = (idx) => set('recipe', recipe.filter((_, i) => i !== idx))

  // ---- modifier groups (spice level, add-ons) ----
  const groups = f.modifiers || []
  const setGroups = (g) => set('modifiers', g)
  const addGroup = () => setGroups([...groups, { id: uid('mg'), name: '', required: false, multi: true, options: [{ id: uid('mo'), name: '', price: 0 }] }])
  const setGroup = (gi, patch) => setGroups(groups.map((g, i) => (i === gi ? { ...g, ...patch } : g)))
  const rmGroup = (gi) => setGroups(groups.filter((_, i) => i !== gi))
  const addOpt = (gi) => setGroup(gi, { options: [...(groups[gi].options || []), { id: uid('mo'), name: '', price: 0 }] })
  const setOpt = (gi, oi, patch) => setGroup(gi, { options: groups[gi].options.map((o, i) => (i === oi ? { ...o, ...patch } : o)) })
  const rmOpt = (gi, oi) => setGroup(gi, { options: groups[gi].options.filter((_, i) => i !== oi) })

  const save = () => {
    // keep only complete recipe lines (ingredient + positive per-plate qty), and
    // MERGE duplicate lines for the same ingredient — two lines for one ingredient
    // would otherwise deduct its stock twice on KOT and double-count its plate cost
    const byIng = {}
    recipe.forEach((r) => { if (r.ingId && +r.qty > 0) byIng[r.ingId] = (byIng[r.ingId] || 0) + +r.qty })
    const cleanRecipe = Object.entries(byIng).map(([ingId, qty]) => ({ ingId, qty: +qty.toFixed(3) }))
    // drop half-typed modifier groups: a group needs a name and at least one named
    // option, or the till would show an unanswerable question
    const cleanMods = groups
      .map((g) => ({ ...g, name: (g.name || '').trim(), options: (g.options || []).filter((o) => (o.name || '').trim()).map((o) => ({ ...o, name: o.name.trim(), price: +o.price || 0 })) }))
      .filter((g) => g.name && g.options.length)
    // portions go first so the till asks the size before the add-ons
    const base = +f.price || 0
    if (portions.on && +portions.half > 0 && +portions.full > 0) {
      cleanMods.unshift(buildPortionGroup(base, portions.half, portions.full))
    }
    const fields = {
      ...f,
      price: base,
      nameHi: (f.nameHi || '').trim(),
      namePa: (f.namePa || '').trim(),
      subCat: (f.subCat || '').trim(),
      station: normalizeStation(f.station),
      recipe: cleanRecipe,
      modifiers: cleanMods,
    }
    const catName = (newCat || '').trim()
    const printerName = (newPrinter || '').trim()
    update((s) => {
      // created inside the same update as the dish, so a half-saved item can never
      // end up pointing at a category or counter that doesn't exist
      let catId = f.catId
      if (catName) {
        const existing = (s.categories || []).find((c) => (c.name || '').trim().toLowerCase() === catName.toLowerCase())
        if (existing) catId = existing.id
        else { catId = uid('c'); s.categories = [...(s.categories || []), { id: catId, name: catName }] }
      }
      let stationKey = fields.station
      if (printerName) {
        stationKey = normalizeStation(printerName)
        // typing a counter here INSTALLS it, which is what keeps the rule that a
        // dish can only ever point at a printer that exists
        if (!(s.settings.printers || []).some((p) => normalizeStation(p.name) === stationKey)) {
          s.settings.printers = [...(s.settings.printers || []), { name: printerName, ip: '' }]
        }
      }
      const final = { ...fields, catId, station: stationKey }
      if (item) {
        const x = s.items.find((y) => y.id === item.id)
        Object.assign(x, final)
      } else {
        s.items.push({ ...final, id: uid('i') })
      }
    })
    onClose()
  }
  const remove = () => {
    if (!item) return
    if (!confirm(`Remove “${item.name}” from the menu? Past bills keep this item; it just won't be orderable.`)) return
    update((s) => { s.items = s.items.filter((y) => y.id !== item.id) })
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={item ? 'Edit item' : 'Add item'}>
      <Field label="Name (English)"><input value={f.name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
      <Field label="Name (Hindi)">
        <div className="flex gap-1.5">
          <input value={f.nameHi || ''} onChange={(e) => { setAutoHi(!e.target.value); set('nameHi', e.target.value) }} className={inputCls} />
          <button onClick={() => { setAutoHi(true); set('nameHi', toHindi(f.name)) }} title="Fill again from the English name" className="shrink-0 px-2.5 rounded-lg border border-stone-200 text-xs font-bold text-stone-500 hover:bg-stone-50">↻ auto</button>
        </div>
      </Field>
      <Field label="Name (Punjabi)">
        <div className="flex gap-1.5">
          <input value={f.namePa || ''} onChange={(e) => { setAutoPa(!e.target.value); set('namePa', e.target.value) }} className={inputCls} />
          <button onClick={() => { setAutoPa(true); set('namePa', toPunjabi(f.name)) }} title="Fill again from the English name" className="shrink-0 px-2.5 rounded-lg border border-stone-200 text-xs font-bold text-stone-500 hover:bg-stone-50">↻ auto</button>
        </div>
        <span className="text-[10px] text-stone-400">Filled automatically as you type the English name — it's a guess, so please correct it.</span>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label={portions.on ? 'Price (₹) — full plate' : 'Price (₹)'}>
          <input type="number" min="0" value={f.price} onChange={(e) => setPrice(e.target.value)} className={inputCls} />
        </Field>
        <Field label="Category">
          <select
            value={newCat === null ? f.catId : NEW}
            onChange={(e) => { if (e.target.value === NEW) setNewCat(''); else { setNewCat(null); set('catId', e.target.value) } }}
            className={inputCls}
          >
            {state.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW}>＋ New category…</option>
          </select>
          {newCat !== null && (
            <input
              autoFocus value={newCat} onChange={(e) => setNewCat(e.target.value)}
              placeholder="e.g. Rolls & Wraps" className={inputCls + ' mt-1.5'}
            />
          )}
        </Field>
      </div>
      <Field label="Sub-category (optional)">
        <input list="kp-subcats" value={f.subCat || ''} onChange={(e) => set('subCat', e.target.value)} placeholder="e.g. Paneer, Chicken, Tandoori" className={inputCls} />
        <datalist id="kp-subcats">{subCats.map((s) => <option key={s} value={s} />)}</datalist>
        <span className="text-[10px] text-stone-400">Groups this dish inside its category on the menu screen. Pick one you already use, or type a new one.</span>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        {/* station = which counter's printer gets the ticket, picked from the
            printers installed in Settings rather than typed from memory */}
        <Field label="Which printer prints this?">
          <select
            value={newPrinter === null ? station : NEW}
            onChange={(e) => { if (e.target.value === NEW) setNewPrinter(''); else { setNewPrinter(null); set('station', e.target.value) } }}
            className={inputCls}
          >
            {!installed && <option value={station}>{station} — not in your printer list</option>}
            {printers.map((p) => (
              <option key={printerKey(p)} value={printerKey(p)}>{p.name}{p.ip ? ` · ${p.ip}` : ' · no IP set'}</option>
            ))}
            <option value={NEW}>＋ New counter…</option>
          </select>
          {newPrinter !== null && (
            <input
              autoFocus value={newPrinter} onChange={(e) => setNewPrinter(e.target.value)}
              placeholder="e.g. Sweets counter" className={inputCls + ' mt-1.5'}
            />
          )}
        </Field>
        <Field label="Type">
          <select value={f.veg ? 'veg' : 'nonveg'} onChange={(e) => set('veg', e.target.value === 'veg')} className={inputCls}>
            <option value="veg">🟢 Veg</option><option value="nonveg">🔴 Non-veg</option>
          </select>
        </Field>
      </div>
      {/* Alcohol is outside GST and carries state VAT instead, so a bar bill has to
          show both taxes. This is per dish rather than a shop-wide setting because a
          restaurant that serves both needs both on the same bill. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Taxed as">
          <select value={f.taxClass || 'gst'} onChange={(e) => set('taxClass', e.target.value)} className={inputCls}>
            <option value="gst">🍽️ Food &amp; drink — GST</option>
            <option value="vat">🍺 Liquor — VAT</option>
          </select>
          <span className="text-[10px] text-stone-400">
            {f.taxClass === 'vat'
              ? 'Alcohol is outside GST by law. Set your state VAT rate in Settings → GST & billing.'
              : 'Everything except alcohol. Soft drinks and mocktails are GST too.'}
          </span>
        </Field>
      </div>
      <p className="text-[10px] text-stone-400 -mt-1 mb-3">
        {installed
          ? <>Your counters, and the device behind each one, are set up once in <b>Settings → 🖨️ Thermal printer</b>.</>
          : <>This dish still prints at <b>“{station}”</b>, which isn't one of your printers — add it in <b>Settings → 🖨️ Thermal printer</b>, or pick another counter above.</>}
      </p>
      {/* Optional per-item HSN — only needed when this item isn't plain restaurant
          service (bottled water, sweets by weight). Blank uses the shop-wide code. */}
      <Field label="HSN / SAC code (optional)">
        <input value={f.hsn ?? ''} onChange={(e) => set('hsn', e.target.value)} placeholder={state.settings.hsnCode || '996331'} className={inputCls} />
        <span className="text-[10px] text-stone-400">Leave blank unless this is sold as goods, not restaurant service.</span>
      </Field>

      {/* Portions — a shortcut that writes the required "Portion" modifier group,
          so half plates flow through the till picker, KOT, bill and reports on
          the same rails as every other choice. The owner types the two prices a
          guest pays; the ± difference stored on each option is our problem. */}
      <div className="border border-stone-100 rounded-xl p-3 mb-3 bg-stone-50/50">
        <label className="flex items-center gap-2 text-xs font-semibold text-stone-600">
          <input type="checkbox" checked={portions.on} onChange={(e) => togglePortions(e.target.checked)} className="w-3.5 h-3.5 accent-saffron-600" />
          🍽️ This dish comes in Half and Full
        </label>
        {!portions.on && <p className="text-[11px] text-stone-400 mt-1.5">Tick this and the till will ask <b>Half or Full</b> every time the dish is punched, and print the size on the kitchen ticket.</p>}
        {portions.on && (
          <>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Field label="Half plate (₹)">
                <input type="number" min="0" value={portions.half} onChange={(e) => setPortions((p) => ({ ...p, half: e.target.value }))} className={inputCls} />
              </Field>
              <Field label="Full plate (₹)">
                <input type="number" min="0" value={portions.full} onChange={(e) => setFull(e.target.value)} className={inputCls} />
              </Field>
            </div>
            <p className="text-[11px] -mt-1">
              {portionsReady
                ? <span className="text-stone-500">Guest is asked: <b className="text-ink-900">Half {inr0(portions.half)} · Full {inr0(portions.full)}</b></span>
                : <span className="text-red-500 font-semibold">Enter both prices — what the guest pays for each size.</span>}
            </p>
            <p className="text-[10px] text-stone-400 mt-1">The full-plate price is this item's price, so changing one changes the other.</p>
          </>
        )}
      </div>

      {/* Recipe editor — powers auto stock-deduction on KOT and the Food Cost report */}
      <div className="border border-stone-100 rounded-xl p-3 mb-3 bg-stone-50/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-stone-500">🧪 Recipe (per plate)</span>
          {foodCostPct != null && (
            <span className="text-[11px] font-bold">
              Plate cost {inr(+plateCost.toFixed(2))} · <span className={foodCostPct <= 30 ? 'text-leaf-600' : foodCostPct <= 40 ? 'text-amber-600' : 'text-red-600'}>{foodCostPct.toFixed(0)}% food cost</span>
            </span>
          )}
        </div>
        {recipe.length === 0 && <p className="text-[11px] text-stone-400 mb-2">Add ingredients to auto-deduct stock on every KOT and track food-cost %.</p>}
        <div className="space-y-1.5">
          {recipe.map((r, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <select value={r.ingId} onChange={(e) => setLine(idx, { ingId: e.target.value })} className={inputCls + ' !py-1.5 flex-1'}>
                {ings.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input type="number" min="0" step="0.001" value={r.qty} onChange={(e) => setLine(idx, { qty: e.target.value })} className={inputCls + ' !py-1.5 !w-20'} />
              <span className="text-[11px] text-stone-400 w-8">{ingUnit(r.ingId)}</span>
              <button onClick={() => rmLine(idx)} className="text-stone-300 hover:text-red-500 text-sm px-1" title="Remove">✕</button>
            </div>
          ))}
        </div>
        {ings.length > recipe.length && (
          <button onClick={addLine} className="mt-2 text-xs font-bold text-saffron-700 hover:underline">＋ Add ingredient</button>
        )}
      </div>

      {/* Modifiers — the questions the till asks when this dish is punched.
          Priced options add to the line; ₹0 options are just choices. */}
      <div className="border border-stone-100 rounded-xl p-3 mb-3 bg-stone-50/50">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-stone-500">🧩 Choices &amp; add-ons</span>
          <button onClick={addGroup} className="text-xs font-bold text-saffron-700 hover:underline">＋ Add a question</button>
        </div>
        {groups.length === 0 && (
          <p className="text-[11px] text-stone-400">
            Ask the guest something when this dish is punched — <b>Spice level</b> (mild / medium / extra spicy, all ₹0) or
            <b> Add-ons</b> (extra cheese +₹40). Priced options add to the bill and print on the kitchen ticket.
          </p>
        )}
        <div className="space-y-3">
          {groups.map((g, gi) => (
            <div key={g.id} className="border border-stone-200 rounded-lg p-2.5 bg-white">
              <div className="flex items-center gap-1.5 mb-2">
                <input
                  value={g.name} onChange={(e) => setGroup(gi, { name: e.target.value })}
                  placeholder="Question, e.g. Spice level"
                  className={inputCls + ' !py-1.5 flex-1 font-semibold'}
                />
                <button onClick={() => rmGroup(gi)} className="text-stone-300 hover:text-red-500 text-sm px-1" title="Remove this question">✕</button>
              </div>
              <div className="flex items-center gap-3 mb-2 text-[11px] text-stone-500">
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!g.required} onChange={(e) => setGroup(gi, { required: e.target.checked })} className="w-3.5 h-3.5 accent-saffron-600" />
                  Must answer
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="checkbox" checked={!!g.multi} onChange={(e) => setGroup(gi, { multi: e.target.checked })} className="w-3.5 h-3.5 accent-saffron-600" />
                  Can pick more than one
                </label>
              </div>
              <div className="space-y-1.5">
                {(g.options || []).map((o, oi) => (
                  <div key={o.id} className="flex items-center gap-1.5">
                    <input
                      value={o.name} onChange={(e) => setOpt(gi, oi, { name: e.target.value })}
                      placeholder="Choice, e.g. Extra cheese"
                      className={inputCls + ' !py-1.5 flex-1'}
                    />
                    <span className="text-[11px] text-stone-400">+₹</span>
                    <input
                      type="number" min="0" value={o.price}
                      onChange={(e) => setOpt(gi, oi, { price: e.target.value })}
                      className={inputCls + ' !py-1.5 !w-16 text-right'}
                    />
                    <button onClick={() => rmOpt(gi, oi)} className="text-stone-300 hover:text-red-500 text-sm px-1" title="Remove">✕</button>
                  </div>
                ))}
              </div>
              <button onClick={() => addOpt(gi)} className="mt-1.5 text-[11px] font-bold text-saffron-700 hover:underline">＋ Add a choice</button>
            </div>
          ))}
        </div>
      </div>

      {/* a half-finished "＋ New" — the option picked, the name never typed — would
          otherwise file the dish under no category at all */}
      <button onClick={save} disabled={!f.name || !(+f.price > 0) || !portionsReady || newCat?.trim() === '' || newPrinter?.trim() === ''} className={btnPrimary + ' w-full'}>Save</button>
      {item && <button onClick={remove} className="w-full mt-2 text-xs font-bold text-red-500 hover:text-red-600 py-1.5">🗑 Remove from menu</button>}
    </Modal>
  )
}

// AI photo→menu onboarding (simulated extraction — production uses vision model)
const SCAN_RESULT = [
  { name: 'Amritsari Kulcha', nameHi: 'अमृतसरी कुलचा', price: 120, veg: true, station: 'tandoor', cat: 'c_breads', sub: 'Tandoori' },
  { name: 'Sarson Da Saag', nameHi: 'सरसों दा साग', price: 210, veg: true, station: 'kitchen', cat: 'c_main', sub: 'Veg' },
  { name: 'Makki Di Roti', nameHi: 'मक्की दी रोटी', price: 40, veg: true, station: 'tandoor', cat: 'c_breads', sub: 'Tawa' },
  { name: 'Patiala Lassi (Large)', nameHi: 'पटियाला लस्सी', price: 130, veg: true, station: 'beverage', cat: 'c_bev', sub: 'Cold' },
]

function ScanModal({ onClose }) {
  const { update } = useStore()
  const [step, setStep] = useState(0)
  const [picked, setPicked] = useState(SCAN_RESULT.map(() => true))
  const scan = () => { setStep(1); setTimeout(() => setStep(2), 1600) }
  const importItems = () => {
    update((s) => {
      SCAN_RESULT.forEach((r, i) => {
        if (picked[i] && !s.items.some((x) => x.name === r.name)) {
          s.items.push({ id: uid('i'), catId: r.cat, name: r.name, nameHi: r.nameHi, namePa: toPunjabi(r.name), price: r.price, veg: r.veg, station: r.station, subCat: r.sub || '', available: true, recipe: [] })
        }
      })
    })
    onClose()
  }
  return (
    <Modal open onClose={onClose} title="📸 AI Photo → Menu import">
      {step === 0 && (
        <div className="text-center py-4">
          <p className="text-sm text-stone-500 mb-4">Click a photo of your printed menu card — KhaanaPeena AI reads it and builds your digital menu in seconds. No typing.</p>
          <div className="border-2 border-dashed border-stone-300 rounded-2xl py-10 mb-4 text-stone-400">
            <div className="text-3xl mb-2">🖼️</div>
            <div className="text-xs">Drop menu photo here (demo uses a sample)</div>
          </div>
          <button onClick={scan} className={btnPrimary}>Scan sample menu photo</button>
        </div>
      )}
      {step === 1 && (
        <div className="text-center py-10">
          <div className="text-3xl mb-3 kp-pulse">✨</div>
          <p className="text-sm font-bold text-ink-900">Reading menu…</p>
          <p className="text-xs text-stone-400">Detecting items, prices & veg marks</p>
        </div>
      )}
      {step === 2 && (
        <div>
          <p className="text-sm text-stone-500 mb-3">Found <b>{SCAN_RESULT.length} items</b> — untick any you don't want:</p>
          {SCAN_RESULT.map((r, i) => (
            <label key={i} className="flex items-center gap-3 py-2 border-b border-stone-50 text-sm">
              <input type="checkbox" checked={picked[i]} onChange={(e) => setPicked((p) => p.map((x, j) => (j === i ? e.target.checked : x)))} />
              <VegDot veg={r.veg} />
              <span className="flex-1">{r.name} <span className="text-stone-400 text-xs">{r.nameHi}</span></span>
              <b>{inr0(r.price)}</b>
            </label>
          ))}
          <button onClick={importItems} className={btnPrimary + ' w-full mt-4'}>Import {picked.filter(Boolean).length} items</button>
        </div>
      )}
    </Modal>
  )
}
