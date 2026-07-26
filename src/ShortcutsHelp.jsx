import React from 'react'
import { Modal, Kbd } from './components.jsx'
import { SHORTCUT_GROUPS } from './shortcuts.js'

export default function ShortcutsHelp({ open, onClose }) {
  return (
    <Modal open={open} onClose={onClose} title="⌨️ Keyboard shortcuts" wide>
      <p className="text-xs text-stone-400 mb-4">Single-key shortcuts work anywhere except while you're typing in a box. Press <Kbd>?</Kbd> any time to reopen this.</p>
      <div className="grid sm:grid-cols-3 gap-5">
        {SHORTCUT_GROUPS.map((g) => (
          <div key={g.title}>
            <h4 className="text-xs font-black uppercase tracking-wide text-stone-500 mb-2">{g.title}</h4>
            <div className="space-y-1.5">
              {g.items.map(([key, label]) => (
                <div key={key} className="flex items-center justify-between gap-3">
                  <span className="text-sm text-stone-700">{label}</span>
                  <Kbd>{key}</Kbd>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}
