// Dual-write API — the settle-bill handler.
//
//   1. verifies the Firebase ID token (Authorization: Bearer …)
//   2. authorizes the caller for this restaurant code. Steady state: a fast Postgres
//      membership check (no external call). First bill for a code, or an unknown
//      caller: prove ownership/membership against the trusted Firebase RTDB plane
//      using the caller's OWN token — the code is NOT a secret (it's on table QRs),
//      so ownership is PROVEN, not granted to the first POSTer (stops claim-jacking).
//   3. one transaction: provision the outlet bound to the real RTDB owner, ensure the
//      caller's membership, then call the atomic idempotent settle_bill().
//
// Idempotency: the outbox sends the client order.id as sourceOrderId; settle_bill()
// dedupes on (outlet_id, source_order_id).
//
// Failure modes matter for the outbox: 4xx = permanent (dead-letter), 5xx = retry.
// A genuine "not your outlet" is 403 (permanent). An RTDB check that can't complete
// (network/5xx) is 503 (retry) — a transient blip must never drop a real bill.
import admin from 'firebase-admin'

const RTDB = `https://${process.env.FIREBASE_PROJECT_ID || 'nexuschat-ccb15'}-default-rtdb.firebaseio.com`
const DEV_UID = process.env.NODE_ENV !== 'production' ? process.env.KP_DEV_TRUST_UID : null

let adminReady = false
function ensureAdmin() {
  if (adminReady) return
  if (!admin.apps.length) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID })
  adminReady = true
}

async function authIdentity(req) {
  if (DEV_UID) return { uid: DEV_UID, token: null, dev: true }
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  if (!token) return null
  ensureAdmin()
  try { return { uid: (await admin.auth().verifyIdToken(token)).uid, token, dev: false } }
  catch { return null }
}

async function rtdbJson(path, token) {
  const res = await fetch(`${RTDB}${path}?auth=${encodeURIComponent(token)}`)
  if (res.status === 401 || res.status === 403) return { denied: true }     // rules denied → not authorized
  if (!res.ok) throw new Error('rtdb read failed ' + res.status)            // 5xx → let caller retry
  return { value: await res.json() }
}

// Prove authorization in the trusted RTDB plane. Returns { ownerUid, role } when the
// caller is owner/member, null on a genuine denial. THROWS on a network/5xx failure
// (so the handler returns a retryable 503, not a permanent 403).
async function rtdbCheck(code, uid, token) {
  const o = await rtdbJson(`/kp_restaurants/${encodeURIComponent(code)}/owner.json`, token)
  if (o.denied) return null
  const ownerUid = o.value
  if (!ownerUid || typeof ownerUid !== 'string') return null   // require an owner-bound restaurant
  if (ownerUid === uid) return { ownerUid, role: 'owner' }
  const m = await rtdbJson(`/kp_restaurants/${encodeURIComponent(code)}/members/${encodeURIComponent(uid)}.json`, token)
  if (!m.denied && m.value === true) return { ownerUid, role: 'member' }
  return null
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v)
function validate(b) {
  const e = []
  if (!b.sourceOrderId || typeof b.sourceOrderId !== 'string' || b.sourceOrderId.length > 64) e.push('sourceOrderId')
  if (!b.outletCode || typeof b.outletCode !== 'string' || !/^KP[A-Z0-9]{4,24}$/.test(b.outletCode)) e.push('outletCode')
  if (!/^\d{4}-\d{2}$/.test(b.fy || '')) e.push('fy')
  if (!Number.isInteger(b.billNo) || b.billNo <= 0 || b.billNo > 1e12) e.push('billNo')
  if (!isNum(b.amount) || b.amount < 0 || b.amount > 1e9) e.push('amount')
  for (const k of ['taxable', 'cgst', 'sgst']) if (b[k] != null && (!isNum(b[k]) || b[k] < 0 || b[k] > 1e9)) e.push(k)
  if (!b.settledAt || isNaN(Date.parse(b.settledAt))) e.push('settledAt')
  if (b.lines != null) {
    if (!Array.isArray(b.lines) || b.lines.length > 200) e.push('lines')
    else for (const l of b.lines) { if (typeof l?.name !== 'string' || l.name.length > 120 || !isNum(l?.qty) || l.qty < 0 || !isNum(l?.price) || l.price < 0) { e.push('line'); break } }
  }
  return e
}

export function makeSettleBill(pool) {
  return async function settleBill(req, res) {
    const ident = await authIdentity(req)
    if (!ident) return res.status(401).json({ error: 'unauthorized' })
    const { uid, token, dev } = ident

    const b = req.body || {}
    const bad = validate(b)
    if (bad.length) return res.status(400).json({ error: 'invalid invoice', fields: bad }) // permanent

    const client = await pool.connect()
    try {
      await client.query('begin')
      await client.query('select set_config($1,$2,true)', ['app.user_id', uid]) // RLS identity

      // fast path (RLS-filtered to the caller's own outlets/memberships)
      const pre = await client.query(
        `select o.id, exists(select 1 from memberships m where m.outlet_id=o.id and m.user_id=$2) as mem
           from outlets o where o.code=$1`, [b.outletCode, uid])
      let outletId = pre.rows[0]?.id || null
      const known = !!outletId && pre.rows[0].mem

      if (!known) {
        // unknown caller for this code → prove ownership/membership against RTDB
        let rtdb = { ownerUid: uid, role: 'owner' }
        if (!dev) {
          try { rtdb = await rtdbCheck(b.outletCode, uid, token) }
          catch (e) { await client.query('rollback'); console.error('[settle-bill] rtdb check failed:', e?.message || e); return res.status(503).json({ error: 'ownership check unavailable' }) }
          if (!rtdb) { await client.query('rollback'); return res.status(403).json({ error: 'not authorized for this outlet' }) }
        }
        // provision via definer (safe cross-tenant writes under FORCE RLS)
        const p = await client.query('select provision_outlet($1,$2,$3,$4,$5) as id',
          [b.outletCode, b.outletName || null, rtdb.ownerUid, uid, rtdb.role])
        outletId = p.rows[0].id
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
      console.error('[settle-bill] error:', e?.message || e)
      return res.status(500).json({ error: 'internal error' })   // retry
    } finally {
      client.release()
    }
  }
}
