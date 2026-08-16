import React, { useState } from 'react'
import { Modal, btnPrimary } from './components.jsx'
import { inr0 } from './utils.js'
import { modGroups, effectivePrice, modsTotal, missingRequired } from './modifiers.js'

/**
 * The question sheet shown when a dish with choices is punched — at the till and
 * on the guest's phone alike, so both sides ask exactly the same thing.
 *
 * Required single-choice groups pre-select their first option, because the common
 * case ("Spice level: Medium") should cost one tap, not two.
 */
export default function ModifierPicker({ item, onClose, onAdd, addLabel = 'Add to order', initialQty = 1, queued = 0 }) {
  const groups = modGroups(item)
  const [sel, setSel] = useState(() =>
    groups
      .filter((g) => g.required && !g.multi && g.options[0])
      .map((g) => ({ gid: g.id, oid: g.options[0].id, name: g.options[0].name, price: +g.options[0].price || 0 }))
  )
  const [qty, setQty] = useState(initialQty)

  const picked = (g, o) => sel.some((m) => m.gid === g.id && m.oid === o.id)
  const toggle = (g, o) => setSel((cur) => {
    const has = picked(g, o)
    const entry = { gid: g.id, oid: o.id, name: o.name, price: +o.price || 0 }
    if (g.multi) return has ? cur.filter((m) => !(m.gid === g.id && m.oid === o.id)) : [...cur, entry]
    // single choice: replace this group's pick. Tapping the chosen one again
    // clears it, but only when the question is optional.
    const without = cur.filter((m) => m.gid !== g.id)
    return has && !g.required ? without : [...without, entry]
  })

  const missing = missingRequired(item, sel)
  const unit = effectivePrice(item, sel)
  const extra = modsTotal(sel)

  return (
    <Modal open onClose={onClose} title={item.name}>
      {queued > 0 && (
        <p className="text-[11px] text-stone-400 mb-2">{queued} more dish{queued > 1 ? 'es' : ''} still to choose for after this one.</p>
      )}
      <div className="space-y-4 mb-4">
        {groups.map((g) => (
          <div key={g.id}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-sm font-bold text-ink-900">{g.name}</span>
              <span className="text-[11px] text-stone-400">
                {g.required ? 'must choose' : 'optional'}{g.multi ? ' · pick any' : ' · pick one'}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {g.options.map((o) => (
                <button
                  key={o.id}
                  onClick={() => toggle(g, o)}
                  className={`text-xs font-semibold rounded-xl px-3 py-2 border-2 transition-colors ${
                    picked(g, o) ? 'border-saffron-500 bg-saffron-50 text-saffron-800' : 'border-stone-200 text-stone-600 hover:bg-stone-50'
                  }`}
                >
                  {o.name}{+o.price > 0 ? <span className="text-stone-400 font-normal"> +{inr0(o.price)}</span> : null}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between border-t border-stone-100 pt-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-stone-500">Quantity</span>
          <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="w-8 h-8 rounded-lg bg-stone-100 font-bold">−</button>
          <span className="w-6 text-center font-bold tabular-nums">{qty}</span>
          <button onClick={() => setQty((q) => Math.min(50, q + 1))} className="w-8 h-8 rounded-lg bg-stone-100 font-bold">＋</button>
        </div>
        <div className="text-right">
          <div className="font-black text-lg text-ink-900">{inr0(unit * qty)}</div>
          {extra > 0 && <div className="text-[11px] text-stone-400">{inr0(item.price)} + {inr0(extra)} add-ons</div>}
        </div>
      </div>

      {missing.length > 0 && (
        <p className="text-[11px] text-red-500 mb-2">Choose {missing.join(' and ')} to continue.</p>
      )}
      <button
        onClick={() => onAdd(sel, qty)}
        disabled={missing.length > 0}
        className={btnPrimary + ' w-full'}
      >{addLabel} · {inr0(unit * qty)}</button>
    </Modal>
  )
}
