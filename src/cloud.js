// KhaanaPeena cloud backend — Firebase Realtime Database sync.
//
// Data layout:  kp_restaurants/{code}
//   owner          owner uid (present once an account claims it → hardened rules)
//   members/{uid}  authorized devices/staff
//   counters       { billNo, kotNo } — allocated by atomic transactions (no dup invoices)
//   orders/{id}    one node per order — per-order LWW by updatedAt
//   meta
//     settings          the settings object + _u   (singleton, LWW)
//     col/{c}/{id}      one node per record, each carrying _u  (per-record LWW)
//     tomb/{c}/{id}     deletion tombstone = timestamp  (so a delete isn't resurrected)
//   public         world-readable menu snapshot for guest QR ordering
//
// Per-record meta sync (added 2026-08-06) replaces the old whole-`meta` blob, which
// was a single last-write-wins cell: two devices editing different collections in one
// debounce window silently clobbered each other. Now every record merges on its own
// _u, exactly like orders — so a reservation added on one terminal and a menu price
// changed on another both survive. mergeRemote/joinRemote still READ the old blob
// format (back-compat), and the owner device migrates it forward once.
//
// A restaurant with no `owner` is "legacy/demo": open rules, code = the capability.
// Once an account claims it (owner set), only the owner/members can touch meta &
// customer data; guests can still read `public` and create their own orders.
import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, get, set, update as dbUpdate, onValue, off, runTransaction } from 'firebase/database'

const CFG = {
  apiKey: 'AIzaSyA_CyEUErQ9I1Cs0gAGP6hPmhq9AUbo_R8',
  authDomain: 'nexuschat-ccb15.firebaseapp.com',
  projectId: 'nexuschat-ccb15',
  databaseURL: 'https://nexuschat-ccb15-default-rtdb.firebaseio.com',
  appId: '1:79966594070:web:1e122ae6db3764811b4137',
}

const db = () => getDatabase(getApps().length ? getApps()[0] : initializeApp(CFG))

export const CLOUD_KEY = 'khaanapeena_cloud'
export const loadCloudCfg = () => {
  try { return JSON.parse(localStorage.getItem(CLOUD_KEY)) || null } catch { return null }
}
export const saveCloudCfg = (cfg) => {
  if (cfg) localStorage.setItem(CLOUD_KEY, JSON.stringify(cfg))
  else localStorage.removeItem(CLOUD_KEY)
}

export const newCode = () => {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let c = 'KP'
  for (let i = 0; i < 8; i++) c += chars[Math.floor(Math.random() * chars.length)]
  return c
}

// ---- per-record meta sync helpers ----

// Every state slice EXCEPT these arrays-of-{id} is either orders (keyed already),
// a singleton (settings), or local-only (counters, v, _tomb).
export const COLLECTIONS = [
  'categories', 'items', 'ingredients', 'tables', 'customers',
  'staff', 'waste', 'feedback', 'reservations', 'shifts', 'voidLog',
]

const stripMeta = (o) => { const { _u, ...rest } = o || {}; return rest }

// settings fields that must NEVER leave the device via cloud sync:
//   sync.apiUrl  — sending it cloud-wide lets a member point the owner's device (and
//                  its Firebase token) at an attacker URL; printer — device-specific;
//                  managerPin — a cleartext void PIN readable by any member is worse
//                  than useless. These stay local; each device sets its own.
const DEVICE_LOCAL_SETTINGS = ['sync', 'printer', 'managerPin']
const syncableSettings = (s) => {
  if (!s) return s
  const out = { ...s }
  for (const k of DEVICE_LOCAL_SETTINGS) delete out[k]
  return out
}
const byId = (arr) => { const m = {}; (arr || []).forEach((r) => { if (r && r.id != null) m[r.id] = r }); return m }
const hasOldArrays = (meta) => COLLECTIONS.some((c) => Array.isArray(meta[c]))

// Stamp `_u` on records that changed vs prev, and record tombstones for deletions.
// Called from the store's stampChanges (draft is a structuredClone of prev, so a
// record's existing _u is preserved unless we bump it here).
export function stampMetaRecords(prev, draft, now = Date.now()) {
  if (draft.settings) {
    if (JSON.stringify(stripMeta(prev.settings || {})) !== JSON.stringify(stripMeta(draft.settings))) draft.settings._u = now
    else if (draft.settings._u == null) draft.settings._u = prev.settings?._u || now
  }
  draft._tomb = { ...(draft._tomb || {}) }
  for (const c of COLLECTIONS) {
    const prevById = byId(prev[c])
    const draftArr = draft[c] || []
    const draftIds = new Set()
    for (const rec of draftArr) {
      if (!rec || rec.id == null) continue
      draftIds.add(rec.id)
      const p = prevById[rec.id]
      if (!p) { if (rec._u == null) rec._u = now; continue }            // new record
      if (JSON.stringify(stripMeta(p)) !== JSON.stringify(stripMeta(rec))) rec._u = now // changed
    }
    for (const id of Object.keys(prevById)) if (!draftIds.has(id)) draft._tomb[c + '/' + id] = now // deleted
    for (const id of draftIds) if (draft._tomb[c + '/' + id]) delete draft._tomb[c + '/' + id]     // re-added
  }
}

// build the new-format meta node from a full state
function metaOf(state) {
  const meta = { settings: state.settings, col: {} }
  for (const c of COLLECTIONS) {
    meta.col[c] = {}
    ;(state[c] || []).forEach((r) => { if (r && r.id != null) meta.col[c][r.id] = r })
  }
  return meta
}

// world-readable menu snapshot for guests (never includes customers/staff/inventory)
export function menuSnapshot(state) {
  const s = state.settings || {}
  return {
    // public menu — only what the guest UI renders. GSTIN/FSSAI are NOT exposed to
    // anyone holding the code; they belong on the printed bill, not the public node.
    settings: {
      name: s.name || '', tagline: s.tagline || '', address: s.address || '', phone: s.phone || '',
      upiId: s.upiId || '', gstScheme: s.gstScheme || 'regular',
      gstRate: s.gstRate ?? 5, serviceCharge: s.serviceCharge || 0, happyHour: s.happyHour || {}, lang: s.lang || 'en',
    },
    categories: state.categories || [],
    items: (state.items || []).filter((i) => i.available),
  }
}

// full adopt of a remote restaurant into a fresh local state (used on join/sign-in).
// Reads both the new per-record layout and the legacy whole-blob layout.
export function joinRemote(remote) {
  const rmeta = remote.meta || {}
  const orders = Object.values(remote.orders || {}).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))
  const settings = rmeta.settings || {}
  const cols = {}
  if (rmeta.col) {
    for (const c of COLLECTIONS) cols[c] = Object.values(rmeta.col[c] || {})
  } else {
    for (const c of COLLECTIONS) cols[c] = Array.isArray(rmeta[c]) ? rmeta[c] : []
  }
  const counters = remote.counters || rmeta.counters || { billNo: 1, kotNo: 1 }
  return { v: 1, settings, ...cols, orders, counters, _tomb: {} }
}

// merge remote into local: per-order LWW, per-record meta LWW, tombstone-aware
export function mergeRemote(local, remote) {
  // orders — per-id LWW by updatedAt
  const ordersById = {}
  ;(local.orders || []).forEach((o) => { ordersById[o.id] = o })
  Object.values(remote.orders || {}).forEach((r) => {
    const l = ordersById[r.id]
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) ordersById[r.id] = r
  })
  const orders = Object.values(ordersById).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))

  const rmeta = remote.meta || {}
  let remoteCol = rmeta.col
  let remoteSettings = rmeta.settings
  const remoteTomb = rmeta.tomb || {}
  // back-compat: legacy whole-blob meta → synthesize a per-record view stamped from metaUpdatedAt
  if (!remoteCol && hasOldArrays(rmeta)) {
    const u = rmeta.metaUpdatedAt || 1
    remoteCol = {}
    for (const c of COLLECTIONS) {
      if (!Array.isArray(rmeta[c])) continue
      remoteCol[c] = {}
      rmeta[c].forEach((r) => { if (r && r.id != null) remoteCol[c][r.id] = (r._u != null ? r : { ...r, _u: u }) })
    }
    if (remoteSettings && remoteSettings._u == null) remoteSettings = { ...remoteSettings, _u: u }
  }
  remoteCol = remoteCol || {}

  // settings — singleton LWW, but device-local fields are never overwritten by remote
  let settings = local.settings
  if (remoteSettings && (remoteSettings._u || 0) > (local.settings?._u || 0)) {
    settings = { ...remoteSettings }
    for (const k of DEVICE_LOCAL_SETTINGS) settings[k] = local.settings?.[k]
  }

  // tombstones — union local + remote (remote layout: tomb/{c}/{id} = ts)
  const mergedTomb = { ...(local._tomb || {}) }
  for (const c of Object.keys(remoteTomb)) {
    const t = remoteTomb[c] || {}
    for (const id of Object.keys(t)) {
      const key = c + '/' + id
      mergedTomb[key] = Math.max(mergedTomb[key] || 0, t[id] || 0)
    }
  }

  const cols = {}
  for (const c of COLLECTIONS) {
    const m = {}
    ;(local[c] || []).forEach((r) => { if (r && r.id != null) m[r.id] = r })
    const rc = remoteCol[c] || {}
    for (const id of Object.keys(rc)) {
      const r = rc[id]; const l = m[id]
      if (!l || (r._u || 0) > (l._u || 0)) m[id] = r
    }
    // apply tombstones: drop a record only if the delete is at least as new as the record
    for (const key of Object.keys(mergedTomb)) {
      if (!key.startsWith(c + '/')) continue
      const id = key.slice(c.length + 1)
      const rec = m[id]
      if (rec && (rec._u || 0) <= mergedTomb[key]) delete m[id]
    }
    cols[c] = Object.values(m)
  }

  return { ...local, settings, ...cols, _tomb: mergedTomb, orders }
}

export async function createCloud(state, ownerUid) {
  const code = newCode()
  const ordersById = {}
  ;(state.orders || []).forEach((o) => { ordersById[o.id] = o })
  const node = {
    meta: metaOf(state),
    orders: ordersById,
    counters: { billNo: state.counters?.billNo || 1, kotNo: state.counters?.kotNo || 1 },
    public: menuSnapshot(state),
  }
  if (ownerUid) { node.owner = ownerUid; node.members = { [ownerUid]: true } }
  await set(ref(db(), `kp_restaurants/${code}`), node)
  return code
}

// one-time upgrade of a legacy whole-blob restaurant to the per-record layout:
// write settings + col/*, and null out the old arrays + metaUpdatedAt + meta.counters
export async function migrateCloudFormat(code, state) {
  const now = Date.now()
  const patch = {
    'meta/settings': { ...state.settings, _u: state.settings?._u || now },
    'meta/metaUpdatedAt': null,
    'meta/counters': null,
  }
  for (const c of COLLECTIONS) {
    patch['meta/' + c] = null
    const m = {}
    ;(state[c] || []).forEach((r) => { if (r && r.id != null) m[r.id] = (r._u != null ? r : { ...r, _u: now }) })
    patch['meta/col/' + c] = m
  }
  await dbUpdate(ref(db(), `kp_restaurants/${code}`), patch)
}

// true when a remote node is still in the legacy whole-blob layout
export const isLegacyFormat = (remote) => {
  const m = remote?.meta
  return !!m && !m.col && hasOldArrays(m)
}

// claim a legacy restaurant for an owner account (sets owner+member if unset)
export async function claimRestaurant(code, ownerUid) {
  if (!ownerUid || !code) return
  const snap = await get(ref(db(), `kp_restaurants/${code}/owner`))
  if (!snap.exists()) {
    await dbUpdate(ref(db(), `kp_restaurants/${code}`), { owner: ownerUid, [`members/${ownerUid}`]: true })
  }
}

// atomic, server-authoritative counter — eliminates duplicate bill/KOT numbers
export async function nextCounter(code, name) {
  const r = ref(db(), `kp_restaurants/${code}/counters/${name}`)
  const res = await runTransaction(r, (cur) => (typeof cur === 'number' ? cur : 0) + 1)
  return res.snapshot.val()
}

export async function publishPublic(code, state) {
  await set(ref(db(), `kp_restaurants/${code}/public`), menuSnapshot(state))
}

export async function fetchCloud(code) {
  const snap = await get(ref(db(), `kp_restaurants/${code}`))
  return snap.exists() ? snap.val() : null
}

export function subscribeCloud(code, cb) {
  const r = ref(db(), `kp_restaurants/${code}`)
  onValue(r, (snap) => { if (snap.exists()) cb(snap.val()) })
  return () => off(r)
}

// pure: the multi-path patch of everything changed since lastPush
// (per-order + per-record meta + tombstones). Exported so it's unit-testable.
export function buildPushPatch(state, lastPush) {
  const patch = {}
  ;(state.orders || []).forEach((o) => { if ((o.updatedAt || 0) > lastPush) patch[`orders/${o.id}`] = o })
  if (state.settings && (state.settings._u || 0) > lastPush) patch['meta/settings'] = syncableSettings(state.settings)
  for (const c of COLLECTIONS) {
    for (const rec of (state[c] || [])) {
      if (rec && (rec._u || 0) > lastPush) patch[`meta/col/${c}/${rec.id}`] = rec
    }
  }
  for (const [key, ts] of Object.entries(state._tomb || {})) {
    if ((ts || 0) > lastPush) { patch[`meta/tomb/${key}`] = ts; patch[`meta/col/${key}`] = null }
  }
  return patch
}

// push only what changed since lastPush
export async function pushChanges(code, state, lastPush) {
  const patch = buildPushPatch(state, lastPush)
  if (Object.keys(patch).length === 0) return false
  await dbUpdate(ref(db(), `kp_restaurants/${code}`), patch)
  return true
}

// guest phone (QR menu) helpers — no local store adoption, direct cloud ops.
// Reads the world-readable `public` snapshot; falls back to `meta` for legacy
// restaurants that predate the public node.
export async function fetchMenu(code) {
  const pub = await get(ref(db(), `kp_restaurants/${code}/public`))
  if (pub.exists()) return pub.val()
  const meta = await get(ref(db(), `kp_restaurants/${code}/meta`))
  return meta.exists() ? meta.val() : null
}
export async function pushGuestOrder(code, order) {
  // must carry source:'qr-guest' — the security rules only let guests create these
  await set(ref(db(), `kp_restaurants/${code}/orders/${order.id}`), { ...order, source: 'qr-guest' })
}
export async function updateGuestOrder(code, orderId, fields) {
  await dbUpdate(ref(db(), `kp_restaurants/${code}/orders/${orderId}`), fields)
}
