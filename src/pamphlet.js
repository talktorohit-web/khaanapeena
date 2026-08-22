// The printable party pamphlet — the leaflet an owner hands across the counter or
// sends on WhatsApp.
//
// Built with DOM calls rather than an HTML string, for the same reason the report
// PDF is: every value here is text a person typed (restaurant name, dish lines,
// terms) and textContent cannot be talked into becoming markup the way a template
// can. Opened with window.open inside the click, or the browser blocks it.

import { OCCASIONS, packagesOf, NONVEG_ADDON } from './party.js'

const CSS = `
  *{box-sizing:border-box}
  body{margin:0;background:#fff;color:#1c1917;
       font-family:"Segoe UI",-apple-system,system-ui,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .sheet{max-width:820px;margin:0 auto;padding:26px 30px 34px}
  .top{text-align:center;border-bottom:3px double #b45309;padding-bottom:14px;margin-bottom:6px}
  .top h1{margin:0;font-size:2.1rem;letter-spacing:-.02em;color:#7c2d12}
  .top .sub{color:#78716c;font-size:.86rem;margin-top:4px}
  .top .ph{margin-top:7px;font-size:1rem;font-weight:700;color:#b45309}
  .banner{text-align:center;margin:16px 0 4px}
  .banner .kick{font-size:.72rem;letter-spacing:.22em;text-transform:uppercase;color:#a8a29e}
  .banner h2{margin:4px 0 2px;font-size:1.5rem;color:#1c1917}
  .banner p{margin:0;color:#57534e;font-size:.9rem}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:16px}
  .pk{border:1.5px solid #e7e5e4;border-radius:12px;padding:12px 14px;break-inside:avoid}
  .pk.hero{grid-column:1/-1;border-color:#f59e0b;background:#fffbeb}
  .pk .hd{display:flex;align-items:baseline;gap:8px;border-bottom:1px dashed #d6d3d1;padding-bottom:7px;margin-bottom:8px}
  .pk .nm{font-size:1.15rem;font-weight:800;color:#7c2d12}
  .pk .tg{font-size:.72rem;color:#a8a29e;font-style:italic}
  .pk .rt{margin-left:auto;font-size:1.35rem;font-weight:800;color:#1c1917;white-space:nowrap}
  .pk .rt small{font-size:.62rem;font-weight:600;color:#78716c;display:block;text-align:right;letter-spacing:.04em}
  .pk ul{margin:0;padding-left:16px}
  .pk li{font-size:.82rem;line-height:1.5;margin:1px 0;color:#292524}
  .extras{margin-top:16px;border:1.5px solid #e7e5e4;border-radius:12px;padding:12px 14px;background:#fafaf9;break-inside:avoid}
  .extras h3{margin:0 0 6px;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#b45309}
  .extras ul{margin:0;padding-left:16px}
  .extras li{font-size:.84rem;line-height:1.55;color:#292524}
  .terms{margin-top:14px;border-top:2px solid #1c1917;padding-top:10px}
  .terms h3{margin:0 0 5px;font-size:.78rem;letter-spacing:.1em;text-transform:uppercase;color:#78716c}
  .terms li{font-size:.78rem;line-height:1.5;color:#57534e}
  .foot{margin-top:16px;text-align:center;border-top:1px dashed #d6d3d1;padding-top:12px}
  .foot .big{font-size:1.15rem;font-weight:800;color:#7c2d12}
  .foot .sm{font-size:.76rem;color:#a8a29e;margin-top:4px}
  @media print{ @page{size:A4;margin:11mm} .sheet{padding:0;max-width:none} }
`

export function printPamphlet(settings, opts = {}) {
  const w = window.open('', '_blank')
  if (!w) { alert('Allow pop-ups for this site to print the pamphlet.'); return false }
  const d = w.document
  const el = (tag, cls, text) => {
    const n = d.createElement(tag)
    if (cls) n.className = cls
    if (text != null) n.textContent = String(text)
    return n
  }

  const packages = packagesOf(settings)
  const gstRate = settings.gstRate ?? 5
  const occasions = opts.occasionId ? OCCASIONS.filter((o) => o.id === opts.occasionId) : OCCASIONS

  d.title = `${settings.name || 'Party'} — party packages`
  const style = d.createElement('style'); style.textContent = CSS; d.head.appendChild(style)
  const sheet = el('div', 'sheet'); d.body.appendChild(sheet)

  // ---- letterhead ----
  const top = el('div', 'top')
  top.appendChild(el('h1', null, settings.name || 'Our Restaurant'))
  const sub = [settings.address, settings.gstin && `GSTIN ${settings.gstin}`, settings.fssai && `FSSAI ${settings.fssai}`]
    .filter(Boolean).join('  ·  ')
  if (sub) top.appendChild(el('div', 'sub', sub))
  if (settings.phone) top.appendChild(el('div', 'ph', `Bookings: ${settings.phone}`))
  sheet.appendChild(top)

  const banner = el('div', 'banner')
  banner.appendChild(el('div', 'kick', 'Party & Function Packages'))
  banner.appendChild(el('h2', null, occasions.length === 1 ? `${occasions[0].icon} ${occasions[0].label}` : '🎀 Kitty Parties  ·  🎂 Birthdays  ·  💼 Conferences'))
  banner.appendChild(el('p', null, occasions.length === 1 ? occasions[0].blurb : 'Five packages, per plate. Pick the one that suits the occasion.'))
  sheet.appendChild(banner)

  // ---- the five rate lists ----
  const grid = el('div', 'grid')
  packages.forEach((p, i) => {
    // the top package gets the full width — it has the most to say and reads badly
    // squeezed into a half column
    const card = el('div', 'pk' + (i === packages.length - 1 ? ' hero' : ''))
    const hd = el('div', 'hd')
    hd.appendChild(el('span', 'nm', p.name))
    if (p.tag) hd.appendChild(el('span', 'tg', p.tag))
    const rt = el('span', 'rt', `₹${p.rate}`)
    rt.appendChild(el('small', null, 'per plate + GST'))
    hd.appendChild(rt)
    card.appendChild(hd)
    const ul = el('ul')
    ;(p.includes || []).forEach((line) => ul.appendChild(el('li', null, line)))
    card.appendChild(ul)
    grid.appendChild(card)
  })
  sheet.appendChild(grid)

  // ---- what the occasion itself includes ----
  occasions.forEach((o) => {
    const box = el('div', 'extras')
    box.appendChild(el('h3', null, `${o.icon} ${o.label} — included with every package`))
    const ul = el('ul')
    o.extras.forEach((x) => ul.appendChild(el('li', null, x)))
    ul.appendChild(el('li', null, `Minimum ${o.minGuests} guests`))
    box.appendChild(ul)
    sheet.appendChild(box)
  })

  // ---- terms ----
  const terms = el('div', 'terms')
  terms.appendChild(el('h3', null, 'Please note'))
  const tl = el('ul')
  ;[
    `All rates are per plate. GST ${gstRate}% is charged extra, as required by law.`,
    `Non-vegetarian menu available on any package at ₹${opts.nonVegAddon ?? NONVEG_ADDON} extra per plate.`,
    'Billing is on the guaranteed minimum guests or the actual count, whichever is higher.',
    '25% advance confirms the booking; the balance is payable on the day of the function.',
    'Menu items may be swapped for anything of the same value — just ask.',
    'Please confirm the final guest count at least 24 hours in advance.',
  ].forEach((t) => tl.appendChild(el('li', null, t)))
  terms.appendChild(tl)
  sheet.appendChild(terms)

  const foot = el('div', 'foot')
  foot.appendChild(el('div', 'big', settings.phone ? `Book now: ${settings.phone}` : 'Ask at the counter to book'))
  foot.appendChild(el('div', 'sm', `${settings.name || ''} · prices valid until withdrawn`))
  sheet.appendChild(foot)

  w.setTimeout(() => { w.focus(); w.print() }, 250)
  return true
}

// The same offer as a WhatsApp message. Kept in one place with the pamphlet so the
// leaflet and the message can't quote different prices.
export function pamphletText(settings, occasionId, packages, gstRate) {
  const o = OCCASIONS.find((x) => x.id === occasionId)
  const lines = [
    `*${settings.name || 'Our Restaurant'}*`,
    o ? `${o.icon} *${o.label} Packages*` : '*Party Packages*',
    '',
  ]
  packages.forEach((p) => {
    lines.push(`*${p.name} — ₹${p.rate} per plate + GST*`)
    ;(p.includes || []).forEach((x) => lines.push(`• ${x}`))
    lines.push('')
  })
  if (o) {
    lines.push(`*Included with every ${o.label.toLowerCase()}:*`)
    o.extras.forEach((x) => lines.push(`• ${x}`))
    lines.push(`• Minimum ${o.minGuests} guests`, '')
  }
  lines.push(
    `GST ${gstRate ?? 5}% extra. Non-veg add ₹${NONVEG_ADDON}/plate.`,
    '25% advance confirms the booking.',
  )
  if (settings.phone) lines.push('', `Bookings: ${settings.phone}`)
  return lines.join('\n')
}
