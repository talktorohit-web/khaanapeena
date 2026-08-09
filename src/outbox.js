// Dual-write outbox — durable, offline-first mirror of settled bills to the
// Postgres invoice authority.
//
// Design goals (see Phase-1 plan):
//   • Durable      — entries persist in localStorage; survive reload/crash.
//   • Idempotent   — one entry per bill (keyed on the client order.id); the server
//                    settle_bill() also dedupes, so a resend never double-inserts.
//   • Poison-safe  — a permanently-rejected entry (4xx) is dead-lettered, never
//                    blocking the rest; a retryable failure (offline / 5xx / 429)
//                    is held and retried on the next flush.
//   • Dormant      — nothing enqueues until a sync endpoint is configured, so with
//                    no backend the live billing flow is completely unchanged.
//
// Tenant-scoped: each restaurant (cloud code) gets its own queue so two accounts
// on one device never mix invoices.

const KEY = (tenant) => `khaanapeena_outbox_${tenant || 'local'}`
const LOCK = (tenant) => `khaanapeena_outbox_lock_${tenant || 'local'}`
const MAX_KEEP = 2000 // bound the log; drop oldest done/dead beyond this

const rid = () => 'ob_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36)

function read(tenant) {
  try { return JSON.parse(localStorage.getItem(KEY(tenant))) || [] } catch { return [] }
}
function write(tenant, arr) {
  try { localStorage.setItem(KEY(tenant), JSON.stringify(arr)) } catch { /* quota — best effort */ }
}
// keep the queue bounded: drop the oldest settled/dead entries, never a pending one
function compact(arr) {
  const done = arr.filter((e) => e.status !== 'pending')
  const pending = arr.filter((e) => e.status === 'pending')
  const trimmedDone = done.length > MAX_KEEP ? done.slice(done.length - MAX_KEEP) : done
  return [...trimmedDone, ...pending].sort((a, b) => a.seq - b.seq)
}

let seqCounter = 0
const nextSeq = () => (seqCounter = Math.max(seqCounter + 1, Date.now()))

// Queue a bill for mirroring. Returns false if this bill is already queued/sent
// (dedupe on idemKey = order.id) so a re-settle or double-tap can't duplicate it.
export function enqueue(tenant, type, idemKey, payload) {
  const arr = read(tenant)
  if (arr.some((e) => e.key === idemKey)) return false
  arr.push({ id: rid(), seq: nextSeq(), type, key: idemKey, payload, createdAt: Date.now(), attempts: 0, status: 'pending', lastError: null })
  write(tenant, arr)
  return true
}

export function stats(tenant) {
  const a = read(tenant)
  return {
    pending: a.filter((e) => e.status === 'pending').length,
    dead: a.filter((e) => e.status === 'dead').length,
    total: a.length,
  }
}

// move dead-lettered entries back to pending so the next flush retries them
// (used by the Settings "Retry failed" control after the owner fixes the endpoint)
export function retryDead(tenant) {
  const arr = read(tenant)
  let n = 0
  arr.forEach((e) => { if (e.status === 'dead') { e.status = 'pending'; e.attempts = 0; e.lastError = null; n++ } })
  write(tenant, arr)
  return n
}

// single-flusher lock across tabs; short TTL so a crashed flush self-heals
function acquire(tenant) {
  const now = Date.now()
  const cur = +(localStorage.getItem(LOCK(tenant)) || 0)
  if (cur && now < cur) return false
  try { localStorage.setItem(LOCK(tenant), String(now + 15000)) } catch { /* ignore */ }
  return true
}
function release(tenant) {
  try { localStorage.removeItem(LOCK(tenant)) } catch { /* ignore */ }
}

// Drain all pending entries through `sink`. Invoices are independent + idempotent,
// so a single bad entry never blocks the others (no head-of-line stall).
//   sink(op) resolves on success; rejects with err.permanent === true for a
//   validation reject (dead-letter), otherwise the error is treated as retryable.
export async function flush(tenant, sink) {
  if (!acquire(tenant)) return { skipped: 'locked', sent: 0, dead: 0, failed: 0 }
  let sent = 0, dead = 0, failed = 0
  try {
    const arr = read(tenant)
    const pending = arr.filter((e) => e.status === 'pending')
    for (const op of pending) {
      try {
        await sink(op)
        op.status = 'done'
        sent++
      } catch (e) {
        op.attempts = (op.attempts || 0) + 1
        op.lastError = String(e?.message || e)
        if (e && e.permanent) { op.status = 'dead'; dead++ } else { failed++ }
      }
      write(tenant, compact(arr)) // persist progress after every entry
    }
  } finally {
    release(tenant)
  }
  return { sent, dead, failed }
}

// HTTP sink → POST the invoice to the dual-write API. 2xx = ok; 4xx (not 429) =
// permanent (dead-letter); everything else (offline / 5xx / 429) = retryable.
export function makeHttpSink(apiUrl, getToken) {
  const base = String(apiUrl || '').replace(/\/$/, '')
  // never send the Firebase token over cleartext — require https (localhost allowed for dev)
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(base)
  if (base && !base.startsWith('https://') && !isLocal) {
    return async () => { const e = new Error('sync endpoint must be https'); e.permanent = true; throw e }
  }
  return async (op) => {
    let token = ''
    try { token = (await getToken?.()) || '' } catch { /* unauth — server will 401 */ }
    const res = await fetch(base + '/settle-bill', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': op.key,
        ...(token ? { Authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify(op.payload),
    })
    if (res.ok) return
    if (res.status >= 400 && res.status < 500 && res.status !== 429) {
      const e = new Error('rejected ' + res.status)
      e.permanent = true
      throw e
    }
    throw new Error('server ' + res.status)
  }
}

// Indian financial year label for an epoch ms: Apr–Mar → e.g. "2026-27"
export function financialYear(ts) {
  const d = new Date(ts)
  const start = d.getMonth() >= 3 ? d.getFullYear() : d.getFullYear() - 1
  return start + '-' + String((start + 1) % 100).padStart(2, '0')
}
