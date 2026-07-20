import React from 'react'
import { useStore } from '../store.jsx'
import { Field, inputCls, Toggle, btnGhost } from '../components.jsx'
import { LANGS } from '../i18n.js'

export default function Settings() {
  const { state, t, update, resetDemo } = useStore()
  const s = state.settings
  const set = (k, v) => update((st) => { st.settings[k] = v })
  const setHH = (k, v) => update((st) => { st.settings.happyHour[k] = v })

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <h1 className="text-2xl font-black text-ink-900 mb-5">{t('settings')}</h1>

      <Section title="🏪 Restaurant profile">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Restaurant name"><input value={s.name} onChange={(e) => set('name', e.target.value)} className={inputCls} /></Field>
          <Field label="Phone"><input value={s.phone} onChange={(e) => set('phone', e.target.value)} className={inputCls} /></Field>
        </div>
        <Field label="Address (printed on bills)"><input value={s.address} onChange={(e) => set('address', e.target.value)} className={inputCls} /></Field>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="GSTIN"><input value={s.gstin} onChange={(e) => set('gstin', e.target.value)} className={inputCls} /></Field>
          <Field label="FSSAI licence no. (mandatory on bills)"><input value={s.fssai} onChange={(e) => set('fssai', e.target.value)} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="🧾 GST & billing">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="GST scheme">
            <select value={s.gstScheme} onChange={(e) => set('gstScheme', e.target.value)} className={inputCls}>
              <option value="regular">Regular — 5% (Tax Invoice, CGST+SGST shown)</option>
              <option value="composition">Composition — Bill of Supply (no GST on bill)</option>
            </select>
          </Field>
          <Field label="GST rate % (regular scheme)">
            <select value={s.gstRate} onChange={(e) => set('gstRate', +e.target.value)} className={inputCls}>
              <option value="5">5% (standalone restaurant, no ITC)</option>
              <option value="18">18% (hotel ≥₹7,500 tariff / catering)</option>
            </select>
          </Field>
        </div>
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="Service charge % (0 = off)"><input type="number" value={s.serviceCharge} onChange={(e) => set('serviceCharge', +e.target.value || 0)} className={inputCls} /></Field>
          <Field label="UPI ID (dynamic QR on bills)"><input value={s.upiId} onChange={(e) => set('upiId', e.target.value)} className={inputCls} /></Field>
        </div>
      </Section>

      <Section title="🕒 Happy hour automation">
        <div className="flex items-center gap-3 mb-3">
          <Toggle on={s.happyHour.enabled} onChange={(v) => setHH('enabled', v)} />
          <span className="text-sm text-stone-600">Auto-apply discount during slow hours</span>
        </div>
        {s.happyHour.enabled && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="From (hour)"><input type="number" min="0" max="23" value={s.happyHour.from} onChange={(e) => setHH('from', +e.target.value)} className={inputCls} /></Field>
            <Field label="To (hour)"><input type="number" min="0" max="23" value={s.happyHour.to} onChange={(e) => setHH('to', +e.target.value)} className={inputCls} /></Field>
            <Field label="Discount %"><input type="number" value={s.happyHour.discountPct} onChange={(e) => setHH('discountPct', +e.target.value)} className={inputCls} /></Field>
          </div>
        )}
      </Section>

      <Section title="🌐 Language & loyalty">
        <div className="grid sm:grid-cols-2 gap-x-4">
          <Field label="App language">
            <select value={s.lang} onChange={(e) => set('lang', e.target.value)} className={inputCls}>
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
            </select>
          </Field>
          <Field label="Points earned per ₹100">
            <input type="number" value={s.loyaltyEarnPer100} onChange={(e) => set('loyaltyEarnPer100', +e.target.value || 1)} className={inputCls} />
          </Field>
        </div>
      </Section>

      <Section title="🧹 Demo data">
        <p className="text-xs text-stone-400 mb-2">Everything is stored on this device (works fully offline). Reset restores the sample restaurant.</p>
        <button onClick={() => { if (confirm('Reset all data to the demo seed?')) resetDemo() }} className={btnGhost}>↺ Reset demo data</button>
      </Section>
    </div>
  )
}

const Section = ({ title, children }) => (
  <div className="bg-white rounded-2xl p-5 border border-stone-100 mb-4">
    <h3 className="font-bold text-ink-900 mb-3">{title}</h3>
    {children}
  </div>
)
