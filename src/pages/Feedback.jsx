import React, { useMemo, useState } from 'react'
import { useStore } from '../store.jsx'
import { StatCard, Badge, Empty, btnPrimary, btnGhost } from '../components.jsx'
import { Bars } from '../charts.jsx'

const SENTIMENT = {
  positive: { color: 'green', icon: '😊', label: 'Happy' },
  neutral: { color: 'amber', icon: '😐', label: 'Neutral' },
  negative: { color: 'red', icon: '😞', label: 'Unhappy' },
}
const SOURCE_LABEL = { 'qr-guest': '📱 QR (phone)', qr: '📱 QR', pos: '🧾 Counter', counter: '🧾 Counter' }

const Stars = ({ n }) => (
  <span className="text-sm tracking-tight" aria-label={`${n} out of 5`}>
    {[1, 2, 3, 4, 5].map((i) => <span key={i} className={i <= n ? '' : 'grayscale opacity-30'}>⭐</span>)}
  </span>
)

// neutralize CSV formula injection: a leading = + - @ (or tab/CR) makes Excel/Sheets
// evaluate the cell as a formula. Guest review text reaches this export, so prefix
// a quote to force it to plain text.
const csvCell = (c) => {
  let v = String(c ?? '')
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v
  return `"${v.replace(/"/g, '""')}"`
}
function download(name, rows) {
  const csv = rows.map((r) => r.map(csvCell).join(',')).join('\n')
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }))
  a.download = name
  a.click()
}

export default function Feedback() {
  const { state, replyFeedback, resolveFeedback, deleteFeedback, addFeedback } = useStore()
  const [filter, setFilter] = useState('all')       // all | unresolved | negative | 5..1
  const [replyId, setReplyId] = useState(null)
  const [replyText, setReplyText] = useState('')
  const [showAdd, setShowAdd] = useState(false)

  const all = state.feedback || []
  const tableName = (id) => (state.tables || []).find((t) => t.id === id)?.name || (id ? `Table ${id}` : '')

  const stats = useMemo(() => {
    const n = all.length
    const avg = n ? all.reduce((s, f) => s + (+f.rating || 0), 0) / n : 0
    const weekAgo = Date.now() - 7 * 864e5
    const week = all.filter((f) => (f.date || 0) >= weekAgo).length
    const counts = { positive: 0, neutral: 0, negative: 0 }
    all.forEach((f) => { counts[f.sentiment || 'neutral'] = (counts[f.sentiment || 'neutral'] || 0) + 1 })
    const dist = [5, 4, 3, 2, 1].map((r) => ({ r, c: all.filter((f) => +f.rating === r).length }))
    // NPS-style promoters(5)/detractors(≤3) — a familiar CX health number
    const promoters = all.filter((f) => +f.rating === 5).length
    const detractors = all.filter((f) => +f.rating <= 3).length
    const nps = n ? Math.round(((promoters - detractors) / n) * 100) : 0
    const needsReply = all.filter((f) => +f.rating <= 3 && !f.resolved && !f.reply).length
    return { n, avg, week, counts, dist, nps, needsReply }
  }, [all])

  // 14-day average-rating trend
  const trend = useMemo(() => {
    const days = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i)
      const from = d.getTime(), to = from + 864e5
      const day = all.filter((f) => (f.date || 0) >= from && (f.date || 0) < to)
      const v = day.length ? day.reduce((s, f) => s + (+f.rating || 0), 0) / day.length : 0
      days.push({ label: d.toLocaleDateString('en-IN', { day: 'numeric' }), value: +v.toFixed(2) })
    }
    return days
  }, [all])

  const list = useMemo(() => {
    let f = [...all].sort((a, b) => (b.date || 0) - (a.date || 0))
    if (filter === 'unresolved') f = f.filter((x) => +x.rating <= 3 && !x.resolved && !x.reply)
    else if (filter === 'negative') f = f.filter((x) => x.sentiment === 'negative')
    else if (/^[1-5]$/.test(filter)) f = f.filter((x) => +x.rating === +filter)
    return f
  }, [all, filter])

  const exportCsv = () => {
    const rows = [['Date', 'Rating', 'Sentiment', 'Source', 'Table', 'Review', 'Reply', 'Resolved']]
    ;[...all].sort((a, b) => (b.date || 0) - (a.date || 0)).forEach((f) => rows.push([
      new Date(f.date || 0).toLocaleString('en-IN'), f.rating, f.sentiment || '',
      SOURCE_LABEL[f.source] || f.source || '', tableName(f.tableId), f.text || '',
      f.reply?.text || '', f.resolved ? 'yes' : 'no',
    ]))
    download(`khaanapeena-reviews-${new Date().toISOString().slice(0, 10)}.csv`, rows)
  }

  const saveReply = (id) => { if (replyText.trim()) replyFeedback(id, replyText.trim()); setReplyId(null); setReplyText('') }

  const FILTERS = [
    ['all', `All ${stats.n ? `(${stats.n})` : ''}`],
    ['unresolved', `⚠️ Needs reply ${stats.needsReply ? `(${stats.needsReply})` : ''}`],
    ['negative', '😞 Unhappy'],
    ['5', '⭐5'], ['4', '⭐4'], ['3', '⭐3'], ['2', '⭐2'], ['1', '⭐1'],
  ]

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-ink-900">💬 Feedback &amp; Reviews</h1>
          <p className="text-xs text-stone-400">What your guests are saying — reply, resolve, and track your rating over time</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAdd(true)} className={btnGhost}>＋ Log a review</button>
          <button onClick={exportCsv} disabled={!stats.n} className={btnGhost}>⬇ Export CSV</button>
        </div>
      </div>

      {/* ---- KPI cards ---- */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <StatCard icon="⭐" accent="saffron" label="Average rating" value={stats.n ? stats.avg.toFixed(1) : '—'} sub={`${stats.n} review${stats.n === 1 ? '' : 's'}`} />
        <StatCard icon="📅" accent="blue" label="This week" value={stats.week} sub="reviews in 7 days" />
        <StatCard icon="😊" accent="green" label="Happy guests" value={`${stats.n ? Math.round((stats.counts.positive / stats.n) * 100) : 0}%`} sub={`${stats.counts.negative} unhappy`} />
        <StatCard icon="📈" accent={stats.nps >= 0 ? 'purple' : 'red'} label="Happiness score" value={stats.n ? stats.nps : '—'} sub="happy minus unhappy guests" />
      </div>

      {stats.needsReply > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-3 mb-4 flex items-center gap-3">
          <span className="text-xl">⚠️</span>
          <div className="text-sm text-red-800 flex-1"><b>{stats.needsReply}</b> unhappy review{stats.needsReply === 1 ? '' : 's'} waiting for a reply — a quick response wins the guest back.</div>
          <button onClick={() => setFilter('unresolved')} className="text-xs font-bold text-red-700 underline shrink-0">Show</button>
        </div>
      )}

      {/* ---- trend + distribution ---- */}
      {stats.n > 0 && (
        <div className="grid md:grid-cols-2 gap-3 mb-5">
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <h3 className="font-bold text-ink-900 text-sm mb-2">Rating trend · last 14 days</h3>
            <Bars data={trend} color="#f06008" fmt={(v) => (v ? v.toFixed(1) + '⭐' : '—')} labelEvery={2} height={120} />
          </div>
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
            <h3 className="font-bold text-ink-900 text-sm mb-3">How ratings break down</h3>
            <div className="space-y-1.5">
              {stats.dist.map(({ r, c }) => (
                <div key={r} className="flex items-center gap-2">
                  <span className="text-xs w-8 shrink-0 font-bold text-stone-600">{r}⭐</span>
                  <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                    <div className={`h-full rounded-full ${r >= 4 ? 'bg-green-500' : r === 3 ? 'bg-amber-500' : 'bg-red-500'}`} style={{ width: `${stats.n ? (c / stats.n) * 100 : 0}%` }} />
                  </div>
                  <span className="text-xs w-8 text-right text-stone-500">{c}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ---- filters ---- */}
      <div className="flex gap-2 mb-3 flex-wrap">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} className={`px-3 py-1.5 rounded-xl text-xs font-bold ${filter === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      {/* ---- review list ---- */}
      {list.length === 0 ? (
        <Empty icon="💬" text={all.length ? 'No reviews match this filter' : 'No reviews yet — they’ll appear here as guests rate you from the QR menu'} />
      ) : (
        <div className="space-y-3">
          {list.map((f) => {
            const sen = SENTIMENT[f.sentiment || 'neutral']
            return (
              <div key={f.id} className={`bg-white rounded-2xl p-4 shadow-sm border ${!f.resolved && +f.rating <= 3 && !f.reply ? 'border-red-200' : 'border-stone-100'}`}>
                <div className="flex items-start gap-3">
                  <div className="text-2xl shrink-0" title={sen.label}>{sen.icon}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Stars n={+f.rating} />
                      <Badge color={sen.color}>{sen.label}</Badge>
                      {f.source && <span className="text-[11px] text-stone-400">{SOURCE_LABEL[f.source] || f.source}</span>}
                      {f.tableId && <span className="text-[11px] text-stone-400">· {tableName(f.tableId)}</span>}
                      <span className="text-[11px] text-stone-400 ml-auto">{new Date(f.date || 0).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    {f.text && <p className="text-sm text-ink-900 mt-1.5 whitespace-pre-wrap break-words">{f.text}</p>}

                    {f.reply && (
                      <div className="mt-2 bg-stone-50 border-l-2 border-saffron-500 rounded-r-lg p-2">
                        <div className="text-[11px] font-bold text-saffron-700">↳ Your reply</div>
                        <p className="text-xs text-stone-600 whitespace-pre-wrap break-words">{f.reply.text}</p>
                      </div>
                    )}

                    {replyId === f.id ? (
                      <div className="mt-2">
                        <textarea autoFocus value={replyText} onChange={(e) => setReplyText(e.target.value)} rows={2} placeholder="Write a reply to this guest…" className="w-full border border-stone-200 rounded-xl p-2 text-sm" />
                        <div className="flex gap-2 mt-1.5">
                          <button onClick={() => saveReply(f.id)} disabled={!replyText.trim()} className={btnPrimary + ' !py-1.5 !px-3 text-xs'}>Save reply</button>
                          <button onClick={() => { setReplyId(null); setReplyText('') }} className={btnGhost + ' !py-1.5 !px-3 text-xs'}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-3 mt-2 text-xs font-bold">
                        {!f.reply && <button onClick={() => { setReplyId(f.id); setReplyText('') }} className="text-saffron-700">↳ Reply</button>}
                        <button onClick={() => resolveFeedback(f.id, !f.resolved)} className={f.resolved ? 'text-stone-400' : 'text-green-600'}>{f.resolved ? '✓ Resolved — reopen' : '✓ Mark resolved'}</button>
                        <button onClick={() => { if (confirm('Delete this review?')) deleteFeedback(f.id) }} className="text-stone-300 hover:text-red-500 ml-auto">Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showAdd && <AddReviewModal state={state} addFeedback={addFeedback} onClose={() => setShowAdd(false)} />}
    </div>
  )
}

// counter-staff logging a walk-in guest's verbal feedback (post-bill capture)
function AddReviewModal({ state, addFeedback, onClose }) {
  const [rating, setRating] = useState(0)
  const [text, setText] = useState('')
  const [tableId, setTableId] = useState('')
  const save = () => { if (rating) { addFeedback({ rating, text, tableId: tableId || null, source: 'pos' }); onClose() } }
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <h3 className="font-black text-ink-900 text-lg mb-3">Log a guest review</h3>
        <div className="flex justify-center gap-1 mb-3">
          {[1, 2, 3, 4, 5].map((r) => (
            <button key={r} onClick={() => setRating(r)} className={`text-3xl ${rating >= r ? '' : 'grayscale opacity-30'}`}>⭐</button>
          ))}
        </div>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="What did they say? (optional)" className="w-full border border-stone-200 rounded-xl p-2 text-sm mb-2" />
        <select value={tableId} onChange={(e) => setTableId(e.target.value)} className="w-full border border-stone-200 rounded-xl p-2 text-sm mb-3">
          <option value="">No table</option>
          {(state.tables || []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <div className="flex gap-2">
          <button onClick={save} disabled={!rating} className={btnPrimary + ' flex-1'}>Save review</button>
          <button onClick={onClose} className={btnGhost}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
