import React from 'react'

export function Modal({ open, onClose, title, children, wide }) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`bg-white rounded-2xl shadow-2xl w-full ${wide ? 'max-w-3xl' : 'max-w-md'} max-h-[90vh] overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
          <h3 className="font-bold text-lg text-ink-900">{title}</h3>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 text-xl leading-none">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

export function StatCard({ label, value, sub, icon, accent = 'saffron' }) {
  const bg = { saffron: 'bg-saffron-50 text-saffron-700', green: 'bg-green-50 text-leaf-600', blue: 'bg-blue-50 text-blue-600', red: 'bg-red-50 text-red-600', purple: 'bg-purple-50 text-purple-600' }[accent]
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex items-start gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${bg}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-xs text-stone-500 font-medium">{label}</div>
        <div className="text-xl font-bold text-ink-900 truncate">{value}</div>
        {sub && <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>}
      </div>
    </div>
  )
}

export function Badge({ children, color = 'stone' }) {
  const c = {
    stone: 'bg-stone-100 text-stone-600', green: 'bg-green-100 text-green-700',
    red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-700',
    blue: 'bg-blue-100 text-blue-700', purple: 'bg-purple-100 text-purple-700',
    saffron: 'bg-saffron-100 text-saffron-800',
  }[color]
  return <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-semibold ${c}`}>{children}</span>
}

export function VegDot({ veg }) {
  return (
    <span className={`inline-flex w-4 h-4 border-2 items-center justify-center rounded-sm shrink-0 ${veg ? 'border-green-600' : 'border-red-600'}`}>
      <span className={`w-2 h-2 rounded-full ${veg ? 'bg-green-600' : 'bg-red-600'}`} />
    </span>
  )
}

export function Empty({ icon = '🍽️', text }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-stone-400">
      <div className="text-4xl mb-2">{icon}</div>
      <div className="text-sm">{text}</div>
    </div>
  )
}

export function Toggle({ on, onChange }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full transition-colors relative ${on ? 'bg-leaf-500' : 'bg-stone-300'}`}
    >
      <span className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

export function Field({ label, children }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-semibold text-stone-500 block mb-1">{label}</span>
      {children}
    </label>
  )
}

export const inputCls = 'w-full border border-stone-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-saffron-300 bg-white'
export const btnPrimary = 'bg-saffron-600 hover:bg-saffron-700 text-white font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
export const btnGhost = 'border border-stone-200 hover:bg-stone-50 text-stone-700 font-semibold rounded-xl px-4 py-2.5 text-sm transition-colors'
