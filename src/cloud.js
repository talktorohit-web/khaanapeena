// KhaanaPeena cloud backend — Firebase Realtime Database sync.
//
// Data layout:  kp_restaurants/{code}
//   meta            everything except orders (settings, menu, inventory, CRM…) — LWW by metaUpdatedAt
//   orders/{id}     one node per order — LWW per order by updatedAt
//
// The restaurant code is the access capability (demo-grade auth). Devices join
// with the code; the POS that created the cloud is the "owner".
import { initializeApp, getApps } from 'firebase/app'
import { getDatabase, ref, get, set, update as dbUpdate, onValue, off } from 'firebase/database'

const CFG = {
  apiKey: 'AIzaSyANAlCju_w5uwc06IYqQYz_AHJ__iuGGEI',
  authDomain: 'nexuschat-ccb15.firebaseapp.com',
  projectId: 'nexuschat-ccb15',
  databaseURL: 'https://nexuschat-ccb15-default-rtdb.firebaseio.com',
  appId: '1:79966594070:web:c63a939a5a5b4a7e1b4137',
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

export async function createCloud(state) {
  const code = newCode()
  const { meta, ordersById } = splitState(state)
  await set(ref(db(), `kp_restaurants/${code}`), { meta, orders: ordersById })
  return code
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

// guest phone (QR menu) helpers — no local store adoption, direct cloud ops
export async function fetchMenu(code) {
  const snap = await get(ref(db(), `kp_restaurants/${code}/meta`))
  return snap.exists() ? snap.val() : null
}
export async function pushGuestOrder(code, order) {
  await set(ref(db(), `kp_restaurants/${code}/orders/${order.id}`), order)
}
export async function updateGuestOrder(code, orderId, fields) {
  await dbUpdate(ref(db(), `kp_restaurants/${code}/orders/${orderId}`), fields)
}
