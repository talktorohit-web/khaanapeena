import React, { useState, useMemo } from 'react'
import { useStore } from '../store.jsx'
import { Modal, Badge, Empty, Field, inputCls, btnPrimary, btnGhost } from '../components.jsx'
import { inr0, fmtDate, todayISO } from '../utils.js'

const STATUS = {
  sent: { label: 'Awaiting delivery', color: 'blue' },
  partial: { label: 'Partially received', color: 'amber' },
  received: { label: 'Received', color: 'green' },
  cancelled: { label: 'Cancelled', color: 'stone' },
}
const today = () => todayISO()

export default function Purchase() {
  const { state, addVendor, updateVendor, deleteVendor, createPO, cancelPO, receiveGRN } = useStore()
  const [tab, setTab] = useState('orders')
  const [poOpen, setPoOpen] = useState(false)
  const [venModal, setVenModal] = useState(null)   // null | {} (new) | vendor
  const [receivePo, setReceivePo] = useState(null) // PO being received against
  const [prefill, setPrefill] = useState(null)     // lines to prefill a new PO

  const vendors = state.vendors || []
  const pos = state.purchaseOrders || []
  const grns = state.grns || []
  const ings = state.ingredients || []
  const vName = (id) => vendors.find((v) => v.id === id)?.name || '— no vendor —'
  const gName = (id) => ings.find((g) => g.id === id)?.name || id
  const gUnit = (id) => ings.find((g) => g.id === id)?.unit || ''
  const poTotal = (po) => po.lines.reduce((s, l) => s + l.qty * l.rate, 0)
  const receivedMap = (po) => {
    const m = {}
    grns.filter((g) => g.poId === po.id).forEach((g) => g.lines.forEach((l) => { m[l.ingId] = (m[l.ingId] || 0) + l.qty }))
    return m
  }

  const openPos = pos.filter((p) => p.status === 'sent' || p.status === 'partial')
  const onOrderValue = openPos.reduce((s, p) => {
    const rm = receivedMap(p)
    return s + p.lines.reduce((a, l) => a + Math.max(0, l.qty - (rm[l.ingId] || 0)) * l.rate, 0)
  }, 0)
  const monthStart = (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d.getTime() })()
  const receivedThisMonth = grns.filter((g) => g.date >= monthStart).reduce((s, g) => s + g.lines.reduce((a, l) => a + l.qty * l.rate, 0), 0)
  const lowStock = ings.filter((g) => g.stock <= g.minStock)

  const suggestFromLowStock = () => {
    setPrefill(lowStock.map((g) => ({ ingId: g.id, qty: Math.max(1, Math.ceil(g.minStock * 2 - g.stock)), rate: g.costPerUnit })))
    setPoOpen(true)
  }
  const openNewPo = () => { setPrefill(null); setPoOpen(true) }

  const sortedPos = [...pos].sort((a, b) => (b.date || 0) - (a.date || 0))
  const sortedGrns = [...grns].sort((a, b) => (b.date || 0) - (a.date || 0))

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h1 className="text-2xl font-black text-ink-900">Purchases &amp; Receipts</h1>
          <p className="text-xs text-stone-400">Raise purchase orders to suppliers, then receive stock against them</p>
        </div>
        <button onClick={openNewPo} className={btnPrimary}>+ New Purchase Order</button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard icon="📋" label="Open orders" value={openPos.length} accent="blue" />
        <KpiCard icon="🚚" label="Value on order" value={inr0(onOrderValue)} accent="saffron" />
        <KpiCard icon="📥" label="Received this month" value={inr0(receivedThisMonth)} accent="green" />
        <KpiCard icon="🏪" label="Vendors" value={vendors.length} accent="purple" />
      </div>

      {lowStock.length > 0 && tab === 'orders' && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 mb-4 flex items-center justify-between gap-3 flex-wrap">
          <div className="text-sm text-amber-800">
            ⚠️ <b>{lowStock.length}</b> ingredient{lowStock.length > 1 ? 's are' : ' is'} at or below reorder level: {lowStock.slice(0, 4).map((g) => g.name).join(', ')}{lowStock.length > 4 ? '…' : ''}
          </div>
          <button onClick={suggestFromLowStock} className="text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white rounded-lg px-3 py-1.5">Draft a PO for these</button>
        </div>
      )}

      {/* tabs */}
      <div className="flex gap-2 mb-4">
        {[['orders', '📋 Orders'], ['vendors', '🏪 Vendors'], ['receipts', '📥 Receipts']].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === k ? 'bg-ink-900 text-white' : 'bg-white border border-stone-200 text-stone-600'}`}>{l}</button>
        ))}
      </div>

      {tab === 'orders' && (
        sortedPos.length === 0
          ? <div className="bg-white rounded-2xl border border-stone-100"><Empty icon="📋" text="No purchase orders yet. Raise one to order stock from a supplier." /></div>
          : <div className="space-y-3">
            {sortedPos.map((po) => {
              const rm = receivedMap(po); const st = STATUS[po.status] || STATUS.sent
              const canReceive = po.status === 'sent' || po.status === 'partial'
              return (
                <div key={po.id} className="bg-white rounded-2xl border border-stone-100 p-4">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-black text-ink-900">PO #{po.poNo}</span>
                        <Badge color={st.color}>{st.label}</Badge>
                      </div>
                      <div className="text-sm text-stone-500 mt-0.5">{vName(po.vendorId)} · {fmtDate(po.date)}{po.expectedDate ? ` · expected ${fmtDate(po.expectedDate)}` : ''}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-black text-ink-900">{inr0(poTotal(po))}</div>
                      <div className="text-[11px] text-stone-400">{po.lines.length} item{po.lines.length > 1 ? 's' : ''}</div>
                    </div>
                  </div>
                  <div className="mt-3 border-t border-stone-100 pt-2 space-y-1">
                    {po.lines.map((l, i) => {
                      const got = rm[l.ingId] || 0
                      return (
                        <div key={i} className="flex items-center justify-between text-sm">
                          <span className="text-stone-700">{gName(l.ingId)}</span>
                          <span className="text-stone-500 tabular-nums">
                            {got > 0 && got < l.qty && <span className="text-amber-600 mr-1">{got}/</span>}
                            {got >= l.qty && <span className="text-green-600 mr-1">✓ </span>}
                            {l.qty} {gUnit(l.ingId)} × {inr0(l.rate)}
                          </span>
                        </div>
                      )
                    })}
                  </div>
                  {(canReceive) && (
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => setReceivePo(po)} className="text-xs font-bold bg-leaf-600 hover:bg-leaf-500 text-white rounded-lg px-3 py-1.5">📥 Receive goods</button>
                      <button onClick={() => { if (confirm(`Cancel PO #${po.poNo}?`)) cancelPO(po.id) }} className="text-xs font-bold border border-stone-200 hover:bg-stone-50 text-stone-600 rounded-lg px-3 py-1.5">Cancel</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
      )}

      {tab === 'vendors' && (
        <div>
          <div className="flex justify-end mb-3"><button onClick={() => setVenModal({})} className={btnGhost}>+ Add vendor</button></div>
          {vendors.length === 0
            ? <div className="bg-white rounded-2xl border border-stone-100"><Empty icon="🏪" text="No vendors yet. Add your suppliers to raise POs." /></div>
            : <div className="grid sm:grid-cols-2 gap-3">
              {vendors.map((v) => (
                <div key={v.id} className="bg-white rounded-2xl border border-stone-100 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-ink-900">{v.name}</div>
                      <div className="text-sm text-stone-500">{v.phone || 'no phone'}{v.gstin ? ` · ${v.gstin}` : ''}</div>
                      {v.address && <div className="text-xs text-stone-400 mt-0.5">{v.address}</div>}
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setVenModal(v)} className="text-xs text-stone-400 hover:text-saffron-600">✏️</button>
                      <button onClick={() => { if (confirm(`Remove ${v.name}?`)) deleteVendor(v.id) }} className="text-xs text-stone-400 hover:text-red-600">🗑️</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>}
        </div>
      )}

      {tab === 'receipts' && (
        sortedGrns.length === 0
          ? <div className="bg-white rounded-2xl border border-stone-100"><Empty icon="📥" text="No goods received yet. Receive against an order to log a receipt." /></div>
          : <div className="space-y-3">
            {sortedGrns.map((g) => (
              <div key={g.id} className="bg-white rounded-2xl border border-stone-100 p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-black text-ink-900">Receipt #{g.grnNo} {g.poId && <span className="text-xs font-normal text-stone-400">· against order #{pos.find((p) => p.id === g.poId)?.poNo ?? '?'}</span>}</div>
                    <div className="text-sm text-stone-500">{vName(g.vendorId)} · {fmtDate(g.date)}{g.supplierBillNo ? ` · bill ${g.supplierBillNo}` : ''}</div>
                  </div>
                  <div className="font-black text-ink-900">{inr0(g.lines.reduce((s, l) => s + l.qty * l.rate, 0))}</div>
                </div>
                <div className="mt-2 border-t border-stone-100 pt-2 space-y-1">
                  {g.lines.map((l, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-stone-700">{gName(l.ingId)}</span>
                      <span className="text-stone-500 tabular-nums">+{l.qty} {gUnit(l.ingId)} × {inr0(l.rate)}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
      )}

      <PoModal open={poOpen} onClose={() => setPoOpen(false)} vendors={vendors} ings={ings} prefill={prefill} onSave={(p) => { createPO(p); setPoOpen(false) }} onAddVendor={() => setVenModal({})} />
      <ReceiveModal po={receivePo} onClose={() => setReceivePo(null)} gName={gName} gUnit={gUnit} received={receivePo ? receivedMap(receivePo) : {}} onSave={(g) => { receiveGRN(g); setReceivePo(null) }} />
      <VendorModal vendor={venModal} onClose={() => setVenModal(null)} onSave={(v) => { if (v.id) updateVendor(v.id, v); else addVendor(v); setVenModal(null) }} />
    </div>
  )
}

function KpiCard({ icon, label, value, accent }) {
  const bg = { saffron: 'bg-saffron-50 text-saffron-700', green: 'bg-green-50 text-leaf-600', blue: 'bg-blue-50 text-blue-600', purple: 'bg-purple-50 text-purple-600' }[accent]
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-stone-100 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${bg}`}>{icon}</div>
      <div className="min-w-0"><div className="text-xs text-stone-500 font-medium">{label}</div><div className="text-xl font-bold text-ink-900 truncate tabular-nums">{value}</div></div>
    </div>
  )
}

function PoModal({ open, onClose, vendors, ings, prefill, onSave, onAddVendor }) {
  const [vendorId, setVendorId] = useState('')
  const [expected, setExpected] = useState('')
  const [notes, setNotes] = useState('')
  const [lines, setLines] = useState([{ ingId: '', qty: '', rate: '' }])

  React.useEffect(() => {
    if (!open) return
    setVendorId(vendors[0]?.id || '')
    setExpected('')
    setNotes('')
    setLines(prefill && prefill.length ? prefill.map((l) => ({ ingId: l.ingId, qty: String(l.qty), rate: String(l.rate) })) : [{ ingId: '', qty: '', rate: '' }])
  }, [open])

  const setLine = (i, k, v) => setLines((ls) => ls.map((l, j) => {
    if (j !== i) return l
    const nl = { ...l, [k]: v }
    if (k === 'ingId') { const g = ings.find((x) => x.id === v); if (g && !nl.rate) nl.rate = String(g.costPerUnit) }
    return nl
  }))
  const total = lines.reduce((s, l) => s + (+l.qty || 0) * (+l.rate || 0), 0)
  const valid = lines.some((l) => l.ingId && +l.qty > 0)

  return (
    <Modal open={open} onClose={onClose} title="New Purchase Order" wide>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Vendor">
          <div className="flex gap-2">
            <select value={vendorId} onChange={(e) => setVendorId(e.target.value)} className={inputCls}>
              <option value="">— select —</option>
              {vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <button onClick={onAddVendor} title="Add vendor" className="border border-stone-200 rounded-lg px-3 text-stone-500 hover:bg-stone-50">+</button>
          </div>
        </Field>
        <Field label="Expected delivery"><input type="date" value={expected} min={today()} onChange={(e) => setExpected(e.target.value)} className={inputCls} /></Field>
      </div>

      <div className="text-xs font-semibold text-stone-500 mb-1">Items</div>
      <div className="space-y-2 mb-2">
        {lines.map((l, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={l.ingId} onChange={(e) => setLine(i, 'ingId', e.target.value)} className={inputCls + ' flex-1'}>
              <option value="">— ingredient —</option>
              {ings.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.unit})</option>)}
            </select>
            <input type="number" min="0" placeholder="qty" value={l.qty} onChange={(e) => setLine(i, 'qty', e.target.value)} className={inputCls + ' w-20'} />
            <input type="number" min="0" placeholder="rate" value={l.rate} onChange={(e) => setLine(i, 'rate', e.target.value)} className={inputCls + ' w-24'} />
            <button onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} className="text-stone-300 hover:text-red-500 text-lg px-1">✕</button>
          </div>
        ))}
      </div>
      <button onClick={() => setLines((ls) => [...ls, { ingId: '', qty: '', rate: '' }])} className="text-xs font-bold text-saffron-600 mb-3">+ Add item</button>

      <Field label="Notes"><input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. deliver before 10am" className={inputCls} /></Field>

      <div className="flex items-center justify-between border-t border-stone-100 pt-3 mt-2">
        <div className="text-sm text-stone-500">Order total <span className="font-black text-ink-900 ml-1">{inr0(total)}</span></div>
        <div className="flex gap-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={!valid} onClick={() => onSave({ vendorId, expectedDate: expected ? new Date(expected).getTime() : null, notes, lines: lines.map((l) => ({ ingId: l.ingId, qty: +l.qty, rate: +l.rate })) })} className={btnPrimary}>Send order to supplier</button>
        </div>
      </div>
    </Modal>
  )
}

function ReceiveModal({ po, onClose, gName, gUnit, received, onSave }) {
  const [rows, setRows] = useState([])
  const [bill, setBill] = useState('')
  React.useEffect(() => {
    if (!po) return
    setBill('')
    setRows(po.lines.map((l) => {
      const remaining = Math.max(0, l.qty - (received[l.ingId] || 0))
      return { ingId: l.ingId, qty: String(remaining), rate: String(l.rate), ordered: l.qty, got: received[l.ingId] || 0 }
    }))
  }, [po])
  if (!po) return null
  const setRow = (i, k, v) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)))
  const valid = rows.some((r) => +r.qty > 0)

  return (
    <Modal open={!!po} onClose={onClose} title={`Receive goods — PO #${po.poNo}`} wide>
      <p className="text-xs text-stone-400 mb-3">Enter the quantity actually received for each item. Stock is added and the average cost updated automatically.</p>
      <div className="space-y-2 mb-3">
        <div className="grid grid-cols-[1fr,auto,auto] gap-2 text-[11px] font-semibold text-stone-400 px-1">
          <span>Item</span><span className="w-24 text-center">Receive qty</span><span className="w-24 text-center">Rate</span>
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[1fr,auto,auto] gap-2 items-center">
            <div>
              <div className="text-sm font-semibold text-ink-900">{gName(r.ingId)}</div>
              <div className="text-[11px] text-stone-400">ordered {r.ordered} {gUnit(r.ingId)}{r.got > 0 ? ` · already got ${r.got}` : ''}</div>
            </div>
            <input type="number" min="0" value={r.qty} onChange={(e) => setRow(i, 'qty', e.target.value)} className={inputCls + ' w-24 text-center'} />
            <input type="number" min="0" value={r.rate} onChange={(e) => setRow(i, 'rate', e.target.value)} className={inputCls + ' w-24 text-center'} />
          </div>
        ))}
      </div>
      <Field label="Supplier bill / invoice no."><input value={bill} onChange={(e) => setBill(e.target.value)} placeholder="optional" className={inputCls} /></Field>
      <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!valid} onClick={() => onSave({ poId: po.id, vendorId: po.vendorId, supplierBillNo: bill, lines: rows.map((r) => ({ ingId: r.ingId, qty: +r.qty, rate: +r.rate })).filter((l) => l.qty > 0) })} className={btnPrimary}>📥 Receive &amp; add to stock</button>
      </div>
    </Modal>
  )
}

function VendorModal({ vendor, onClose, onSave }) {
  const [f, setF] = useState({ name: '', phone: '', gstin: '', address: '' })
  React.useEffect(() => { if (vendor) setF({ name: vendor.name || '', phone: vendor.phone || '', gstin: vendor.gstin || '', address: vendor.address || '' }) }, [vendor])
  if (!vendor) return null
  return (
    <Modal open={!!vendor} onClose={onClose} title={vendor.id ? 'Edit vendor' : 'Add vendor'}>
      <Field label="Name"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className={inputCls} /></Field>
      <div className="grid sm:grid-cols-2 gap-x-4">
        <Field label="Phone"><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={inputCls} /></Field>
        <Field label="GSTIN"><input value={f.gstin} onChange={(e) => setF({ ...f, gstin: e.target.value })} className={inputCls} /></Field>
      </div>
      <Field label="Address"><input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} className={inputCls} /></Field>
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className={btnGhost}>Cancel</button>
        <button disabled={!f.name.trim()} onClick={() => onSave({ ...(vendor.id ? { id: vendor.id } : {}), ...f })} className={btnPrimary}>Save</button>
      </div>
    </Modal>
  )
}
