import React, { useState } from 'react'
import { inr0 } from './utils.js'

// Categorical palette (validated: CVD-safe on light surface, fixed order — never cycled)
export const CAT = ['#f06008', '#2563eb', '#16a34a', '#9333ea']

// Single-series bar chart: one hue (magnitude), thin marks, rounded data-ends, hover tooltip
export function Bars({ data, height = 140, color = '#f06008', labelEvery = 1, fmt = inr0 }) {
  const [hov, setHov] = useState(null)
  const max = Math.max(1, ...data.map((d) => d.value))
  const n = data.length
  return (
    <div className="relative">
      {hov !== null && (
        <div className="absolute -top-1 left-1/2 -translate-x-1/2 bg-ink-900 text-white text-[11px] px-2 py-1 rounded-lg pointer-events-none z-10 whitespace-nowrap">
          {data[hov].label}: <b>{fmt(data[hov].value)}</b>
        </div>
      )}
      <svg viewBox={`0 0 ${n * 30} ${height + 18}`} className="w-full" style={{ maxHeight: height + 24 }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1="0" x2={n * 30} y1={height * g} y2={height * g} stroke="#e7e5e4" strokeWidth="1" />
        ))}
        {data.map((d, i) => {
          const h = Math.max(3, (d.value / max) * (height - 8))
          return (
            <g key={i} onMouseEnter={() => setHov(i)} onMouseLeave={() => setHov(null)}>
              <rect x={i * 30} y={0} width={28} height={height + 18} fill="transparent" />
              <rect
                x={i * 30 + 7} y={height - h} width={16} height={h} rx={4}
                fill={color} opacity={hov === null || hov === i ? 1 : 0.35}
              />
              {i % labelEvery === 0 && (
                <text x={i * 30 + 15} y={height + 13} textAnchor="middle" fontSize="9" fill="#78716c">{d.label}</text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function Donut({ data, size = 130 }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1
  let acc = 0
  const r = 44, cx = 60, cy = 60
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 120 120" style={{ width: size, height: size }}>
        {data.map((d, i) => {
          const a0 = (acc / total) * 2 * Math.PI - Math.PI / 2
          acc += d.value
          const a1 = (acc / total) * 2 * Math.PI - Math.PI / 2
          const large = a1 - a0 > Math.PI ? 1 : 0
          const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0)
          const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1)
          if (d.value === 0) return null
          return (
            <path
              key={i}
              d={`M ${x0} ${y0} A ${r} ${r} 0 ${large} 1 ${x1} ${y1}`}
              fill="none" stroke={CAT[i % CAT.length]} strokeWidth="16" strokeLinecap="butt"
            />
          )
        })}
        <circle cx={cx} cy={cy} r={r - 12} fill="white" />
      </svg>
      <div className="space-y-1.5">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: CAT[i % CAT.length] }} />
            <span className="text-stone-600">{d.label}</span>
            <span className="font-bold text-ink-900 ml-auto pl-3">{Math.round((d.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function HBars({ data, fmt = inr0, color = '#f06008' }) {
  const max = Math.max(1, ...data.map((d) => d.value))
  return (
    <div className="space-y-2">
      {data.map((d, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-32 truncate text-stone-600 shrink-0">{d.label}</span>
          <div className="flex-1 bg-stone-100 rounded-full h-4 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <span className="font-bold text-ink-900 w-16 text-right shrink-0">{fmt(d.value)}</span>
        </div>
      ))}
    </div>
  )
}
