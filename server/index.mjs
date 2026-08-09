// KhaanaPeena dual-write service — HTTP entrypoint.
// Runs the schema migration on boot (idempotent), then serves the invoice API.
import express from 'express'
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { makeSettleBill } from './settle-bill.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
// Connection security:
//   • Fly Postgres is reached over Fly's private, already-encrypted network
//     (appname.internal) — no DB-level TLS needed, so SSL is off by default.
//   • For an EXTERNAL Postgres that requires TLS, set PGSSL=require and provide the
//     provider's CA cert in PG_CA. We never disable certificate verification, so a
//     MITM can't present a forged cert.
const ssl = process.env.PGSSL === 'require'
  ? { rejectUnauthorized: true, ...(process.env.PG_CA ? { ca: process.env.PG_CA } : {}) }
  : false
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 8, ssl })

async function migrate() {
  const sql = readFileSync(join(__dirname, 'migrations', '001_core.sql'), 'utf8')
  const c = await pool.connect()
  try { await c.query(sql); console.log('[migrate] schema up to date') }
  finally { c.release() }
}

const app = express()
// CORS: the KhaanaPeena clients (web app, Capacitor webview, Electron) call this
// service cross-origin with Authorization + Idempotency-Key headers, which triggers
// a browser preflight. No cookies are used (bearer token only), so a wildcard origin
// is safe. Answer OPTIONS preflights and advertise the custom headers.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*')
  res.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Idempotency-Key')
  res.set('Access-Control-Max-Age', '86400')
  if (req.method === 'OPTIONS') return res.sendStatus(204)
  next()
})
app.use(express.json({ limit: '256kb' }))
app.get('/health', (_req, res) => res.json({ ok: true, service: 'khaanapeena-sync' }))
app.post('/settle-bill', makeSettleBill(pool))

const port = process.env.PORT || 8080
migrate()
  .then(() => app.listen(port, () => console.log(`[server] listening on :${port}`)))
  .catch((e) => { console.error('[migrate] failed:', e); process.exit(1) })
