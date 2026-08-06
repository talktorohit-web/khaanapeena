// Dual-write API — POST /settle-bill
//
// The one endpoint the client outbox talks to. Deploy-ready reference handler
// (Cloud Run / Fastify / Vercel function — adapt the wrapper). It:
//   1. verifies the Firebase ID token from `Authorization: Bearer …`
//   2. checks the caller is a member of the target outlet
//   3. sets the per-request RLS identity (`app.user_id`)
//   4. calls settle_bill() — atomic, gapless, idempotent (see db/migrations/001_core.sql)
//
// Idempotency: the outbox sends `Idempotency-Key: <order.id>` and the same id as
// body.sourceOrderId. settle_bill() dedupes on (outlet_id, source_order_id), so a
// retried delivery returns the original bill_no and writes nothing new.
//
// Requires: firebase-admin, pg. Env: DATABASE_URL, FIREBASE_PROJECT_ID.

import admin from 'firebase-admin'
import pg from 'pg'

if (!admin.apps.length) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 10 })

export async function settleBill(req, res) {
  try {
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    if (!token) return res.status(401).json({ error: 'missing token' })

    let uid
    try { uid = (await admin.auth().verifyIdToken(token)).uid }
    catch { return res.status(401).json({ error: 'invalid token' }) }

    const b = req.body || {}
    // permanent (4xx) validation → the outbox dead-letters instead of retrying
    if (!b.sourceOrderId || !b.fy || b.billNo == null || b.amount == null || !b.outletCode) {
      return res.status(400).json({ error: 'malformed invoice' })
    }

    const client = await pool.connect()
    try {
      // bind this request's identity so RLS + the membership check share one truth
      await client.query('select set_config($1, $2, true)', ['app.user_id', uid])

      const outlet = await client.query(
        `select o.id from outlets o
           join memberships m on m.outlet_id = o.id
          where o.code = $1 and m.user_id = $2`,
        [b.outletCode, uid],
      )
      if (!outlet.rowCount) return res.status(403).json({ error: 'not a member of this outlet' })
      const outletId = outlet.rows[0].id

      const r = await client.query(
        `select settle_bill($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) as bill_no`,
        [outletId, b.sourceOrderId, b.fy, b.amount, b.method || null, b.gstScheme || 'regular',
          b.taxable ?? null, b.cgst ?? null, b.sgst ?? null, b.settledAt, JSON.stringify(b.lines || [])],
      )
      return res.status(200).json({ ok: true, billNo: Number(r.rows[0].bill_no) })
    } finally {
      client.release()
    }
  } catch (e) {
    // unexpected → 5xx so the outbox retries (does NOT dead-letter)
    return res.status(500).json({ error: String(e?.message || e) })
  }
}
