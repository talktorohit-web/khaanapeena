import React, { useState } from 'react'
import { useStore } from '../store.jsx'
import { Badge, inputCls, StatCard } from '../components.jsx'
import { inr0, fmtDate } from '../utils.js'

export default function Customers() {
  const { state, t } = useStore()
  const [q, setQ] = useState('')
  const [seg, setSeg] = useState('all')

  const now = Date.now()
  const month = new Date().getMonth()
  const enrich = state.customers.map((c) => ({
    ...c,
    vip: c.totalSpend >= 5000,
    atRisk: c.lastVisit && (now - c.lastVisit) / 864e5 > 14,
    bday: c.birthday && new Date(c.birthday).getMonth() === month,
  }))
  const list = enrich
    .filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase()) || c.phone.includes(q))
    .filter((c) => seg === 'all' || (seg === 'vip' && c.vip) || (seg === 'risk' && c.atRisk) || (seg === 'bday' && c.bday))
    .sort((a, b) => b.totalSpend - a.totalSpend)

  const waMsg = (c) => {
    const msg = c.bday
      ? `Happy Birthday ${c.name.split(' ')[0]}! 🎂 ${state.settings.name} par aapke liye special 20% off is week. Aa jaiye!`
      : c.atRisk
      ? `${c.name.split(' ')[0]} ji, bahut din ho gaye! 😊 ${state.settings.name} mein aapka favourite khana yaad kar raha hai — is week 15% off!`
      : `Namaste ${c.name.split(' ')[0]} ji! ${state.settings.name} mein naya menu try karein — aapke ${c.points} loyalty points ready hain!`
    return `https://wa.me/91${c.phone}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-5">{t('customers')}</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total customers" value={state.customers.length} icon="👥" accent="blue" />
        <StatCard label="VIP (₹5k+ spend)" value={enrich.filter((c) => c.vip).length} icon="⭐" accent="saffron" />
        <StatCard label="At-risk (14d+ away)" value={enrich.filter((c) => c.atRisk).length} icon="⚠️" accent="red" />
        <StatCard label="Birthdays this month" value={enrich.filter((c) => c.bday).length} icon="🎂" accent="purple" />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name / phone…" className={inputCls + ' max-w-xs'} />
        {[['all', 'All'], ['vip', '⭐ VIP'], ['risk', '⚠️ At-risk'], ['bday', '🎂 Birthday']].map(([k, l]) => (
          <button key={k} onClick={() => setSeg(k)} className={`px-3 py-1.5 rounded-full text-xs font-bold ${seg === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-stone-100 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-stone-400 border-b border-stone-100">
              <th className="py-2.5 px-4">Customer</th><th>Phone</th><th>{t('points')}</th><th>Visits</th><th>Spend</th><th>Last visit</th><th className="pr-4">Engage</th>
            </tr>
          </thead>
          <tbody>
            {list.map((c) => (
              <tr key={c.id} className="border-b border-stone-50">
                <td className="py-2.5 px-4 font-semibold">
                  {c.name} {c.vip && <Badge color="saffron">VIP</Badge>} {c.bday && '🎂'} {c.atRisk && <Badge color="red">at-risk</Badge>}
                </td>
                <td className="text-stone-500">{c.phone}</td>
                <td className="font-bold text-saffron-700">{c.points}</td>
                <td>{c.visits}</td>
                <td className="font-semibold">{inr0(c.totalSpend)}</td>
                <td className="text-stone-400 text-xs">{c.lastVisit ? fmtDate(c.lastVisit) : '—'}</td>
                <td className="pr-4">
                  <a href={waMsg(c)} target="_blank" rel="noreferrer" className="text-xs font-bold text-green-600 hover:underline">💬 WhatsApp</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <div className="py-10 text-center text-stone-400 text-sm">No customers match</div>}
      </div>
    </div>
  )
}
