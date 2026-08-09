// Dual-write API — the settle-bill handler.
//
//   1. verifies the Firebase ID token (Authorization: Bearer …)  [or trusts
//      KP_DEV_TRUST_UID in local dev only]
//   2. inside ONE transaction: binds the RLS identity (app.user_id), resolves the
//      outlet by its KP cloud code, AUTO-PROVISIONS org+outlet+membership on first
//      touch (trust-on-first-use: the first authenticated caller claims the code),
//      then calls the atomic, idempotent settle_bill()
//
// Idempotency: the outbox sends `Idempotency-Key: <order.id>` and the same value as
// body.sourceOrderId. settle_bill() dedupes on (outlet_id, source_order_id) — a
// retried delivery returns the original bill_no and writes nothing new.
import admin from 'firebase-admin'

let adminReady = false
function ensureAdmin() {
  if (adminReady) return
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
  adminReady = true
}

async function verifyUid(req) {
  // local-dev shortcut so the handler can be exercised without a real token
  if (process.env.KP_DEV_TRUST_UID) return process.env.KP_DEV_TRUST_UID
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  ensureAdmin()
  try { return (await admin.auth().verifyIdToken(token)).uid } catch { return null }
}

export function makeSettleBill(pool) {
  return async function settleBill(req, res) {
    const uid = await verifyUid(req)
    if (!uid) return res.status(401).json({ error: 'unauthorized' })

    const b = req.body || {}
    // permanent (4xx) validation → the outbox dead-letters instead of retrying
    if (!b.sourceOrderId || !b.fy || b.billNo == null || b.amount == null || !b.outletCode) {
      return res.status(400).json({ error: 'malformed invoice' })
    }

    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select set_config($1,$2,true)', ['app.user_id', uid])

      // resolve or claim the outlet (trust-on-first-use for a verified owner)
      let r = await client.query('select id from outlets where code=$1', [b.outletCode])
      let outletId
      if (r.rowCount === 0) {
        const org = await client.query('insert into orgs(name) values($1) returning id', [b.outletName || 'KhaanaPeena'])
        const ot = await client.query('insert into outlets(org_id,code,name) values($1,$2,$3) returning id',
          [org.rows[0].id, b.outletCode, b.outletName || 'KhaanaPeena'])
        outletId = ot.rows[0].id
        await client.query('insert into memberships(user_id,outlet_id,role) values($1,$2,$3)', [uid, outletId, 'owner'])
      } else {
        outletId = r.rows[0].id
        const mem = await client.query('select 1 from memberships where user_id=$1 and outlet_id=$2', [uid, outletId])
        if (mem.rowCount === 0) { await client.query('rollback'); return res.status(403).json({ error: 'not a member of this outlet' }) }
      }

      const out = await client.query(
        'select settle_bill($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) as bill_no',
        [outletId, b.sourceOrderId, b.billNo, b.fy, b.amount, b.method || null, b.gstScheme || 'regular',
          b.taxable ?? null, b.cgst ?? null, b.sgst ?? null, b.settledAt, JSON.stringify(b.lines || [])],
      )
      await client.query('commit')
      return res.status(200).json({ ok: true, billNo: Number(out.rows[0].bill_no) })
    } catch (e) {
      try { await client.query('rollback') } catch { /* already gone */ }
      // unexpected → 5xx so the outbox retries (does NOT dead-letter)
      return res.status(500).json({ error: String(e?.message || e) })
    } finally {
      client.release()
    }
  }
}
