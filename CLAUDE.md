# KhaanaPeena

Restaurant POS for India (React 18 + Vite 6 + Tailwind v4). Persists to localStorage,
syncs via Firebase RTDB. Ships as a web app, an Electron PC app, and a Capacitor
Android APK — so anything platform-specific has to work in all three.

```
npm run dev        # vite dev server
npm run build      # must pass before anything is committed
npm run docs       # re-render the sales collateral in docs/ to the Desktop folder
npm run apk        # Capacitor Android build
```

## Styling: never append a bare width utility to `inputCls`

`inputCls` (src/components.jsx) bakes in **`w-full`**. Appending a narrower width
does nothing — both are plain `.w-*` utilities of equal specificity, and `w-full`
wins in Tailwind's generated order.

```jsx
inputCls + ' w-20'    // ✗ silently renders at 100%, not 80px
inputCls + ' !w-20'   // ✓
```

This fails **silently**: no error, no warning, green build. The layout just ignores
what the code asked for. It stays invisible until a squeezed sibling needs the space
— which is how a `flex-1` `<select>` next to two of these collapsed to 26px (pure
dropdown arrow, negative room for text) and made the ingredient picker look like it
was losing the selection.

The prefix `!` form is correct here. Tailwind v4 moved the important modifier to a
suffix (`w-20!`), but this project's setup still honours the prefix, and the codebase
uses it throughout (`!py-2`, `!py-1.5`, `!mb-0`). Verified live: `!py-1.5` overrides
`py-2` (6px vs 8px).

Do **not** "fix" this by removing `w-full` from `inputCls`. 137 call sites across 18
files rely on the full-width default; only a handful want to be narrow.

## Other things that compile clean and are still wrong

**Seed defaults never reach existing installs.** Adding a field to `src/seed.js` does
nothing for anyone who already has data — localStorage wins. It needs a migration in
`load()` in `src/store.jsx`. See the `svcConfigured` / `supportPhone` migrations there
for the pattern.

**Bucket days locally, never with `toISOString()`.** `toISOString().slice(0,10)` is
UTC, so it files 00:00–05:29 IST to the *previous day* — a late dinner service lands
in yesterday's takings. Use `todayISO()` / `dayKey(ts)` from `src/utils.js`, which
build the key from local date parts. (`toISOString` is fine for export filenames and
seed data, where no bucketing is implied.)

**Money by payment mode comes from `paymentSplit(order)`.** Reading
`order.payment.method` misses split bills entirely, silently under-reporting every
mode. Never bucket cash/UPI/card any other way.

**GST is charged on the service charge, and the order in `billTotals` is deliberate.**
`gstBase = taxable + svc` — service charge is part of the value of supply in India.
Don't "simplify" it to tax the food alone.

**The service charge is voluntary.** It must stay waivable, and it must print with the
word `(optional)` on the slip — that wording is what keeps a complaint from becoming a
dispute. `src/escpos.js` shortens the label on a 58mm roll rather than letting it wrap.

**A bill line's identity is `lineKey`, not `itemId`.** `lineKey = itemId|deducted|mods`
(src/modifiers.js). Matching on `itemId` alone edits or voids the wrong line as soon as
the same dish appears twice on one bill with different modifiers.

**`li.price` is the effective unit price**, already including modifiers. That is why
adding add-ons didn't require touching ~20 call sites — keep it that way.

**RTDB drops empty arrays.** An order whose `items` is `[]` comes back with the key
missing, not empty. Normalize on read; don't assume the shape you wrote is the shape
you get.

**Receipt widths are fixed.** 58mm = 32 columns, 80mm = 48. A label that fits one
wraps ugly on the other; check both when touching `src/escpos.js`.

**`item.station` is lower-cased by `normalizeStation`** so "Tandoor" and "tandoor"
can't become two stations and split the Kitchen-performance report in half.

## docs/

The four HTML files in `docs/` are the source of truth for the owner packet, demo
script and flyers. The PDFs and PNG are build output — edit the HTML and run
`npm run docs`, never edit a delivered PDF. These documents make specific claims about
billing, tax and reports; when that behaviour changes, the claims go stale with nothing
to catch it. See `docs/README.md`.
