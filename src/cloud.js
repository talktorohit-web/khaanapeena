// KhaanaPeena cloud backend — Firebase Realtime Database sync.
//
// Data layout:  kp_restaurants/{code}
//   owner          owner uid (present once an account claims it → hardened rules)
//   members/{uid}  authorized devices/staff
//   counters       { billNo, kotNo } — allocated by atomic transactions (no dup invoices)
//   meta           everything except orders (settings, menu, inventory, CRM…) — owner-only
//   orders/{id}    one node per order — members full access; guests may create qr-guest orders
//   public         world-readable menu snapshot for guest QR ordering
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

// split app state into {meta, orders} for the wire
export function splitState(state) {
  const { orders, ...meta } = state
  const ordersById = {}
  orders.forEach((o) => { ordersById[o.id] = o })
  return { meta, ordersById }
}

export function joinRemote(remote) {
  const meta = remote.meta || {}
  const orders = Object.values(remote.orders || {}).sort((a, b) => a.createdAt - b.createdAt)
  return { ...meta, orders }
}

// merge remote into local: per-order LWW, whole-meta LWW
export function mergeRemote(local, remote) {
  const remoteOrders = remote.orders || {}
  const byId = {}
  local.orders.forEach((o) => { byId[o.id] = o })
  Object.values(remoteOrders).forEach((r) => {
    const l = byId[r.id]
    if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) byId[r.id] = r
  })
  const orders = Object.values(byId).sort((a, b) => a.createdAt - b.createdAt)
  const remoteMeta = remote.meta
  const useRemoteMeta = remoteMeta && (remoteMeta.metaUpdatedAt || 0) > (local.metaUpdatedAt || 0)
  const base = useRemoteMeta ? { ...local, ...remoteMeta } : local
  return { ...base, orders }
}

// world-readable menu snapshot for guests (never includes customers/staff/inventory)
export function menuSnapshot(state) {
  const s = state.settings || {}
  return {
    settings: {
      name: s.name || '', tagline: s.tagline || '', address: s.address || '', phone: s.phone || '',
      fssai: s.fssai || '', gstin: s.gstin || '', upiId: s.upiId || '', gstScheme: s.gstScheme || 'regular',
      gstRate: s.gstRate ?? 5, serviceCharge: s.serviceCharge || 0, happyHour: s.happyHour || {}, lang: s.lang || 'en',
    },
    categories: state.categories || [],
    items: (state.items || []).filter((i) => i.available),
  }
}

export async function createCloud(state, ownerUid) {
  const code = newCode()
  const { meta, ordersById } = splitState(state)
  const node = {
    meta,
    orders: ordersById,
    counters: { billNo: state.counters?.billNo || 1, kotNo: state.counters?.kotNo || 1 },
    public: menuSnapshot(state),
  }
  if (ownerUid) { node.owner = ownerUid; node.members = { [ownerUid]: true } }
  await set(ref(db(), `kp_restaurants/${code}`), node)
  return code
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

// push only what changed since lastPush (per-order granularity, atomic multi-path update)
export async function pushChanges(code, state, lastPush) {
  const { meta, ordersById } = splitState(state)
  const patch = {}
  Object.values(ordersById).forEach((o) => {
    if ((o.updatedAt || 0) > lastPush) patch[`orders/${o.id}`] = o
  })
  if ((meta.metaUpdatedAt || 0) > lastPush) patch['meta'] = meta
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
