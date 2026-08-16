// Role-based access control (RBAC). OFF by default (settings.rbac.enabled) so
// existing installs are unchanged. When on, staff operate the till under a role
// whose page + action permissions the owner configures; the OWNER (whoever holds
// the Manager PIN) is always super-admin with full access.
//
// Policy (role -> permissions) lives in SYNCED settings.rbac.matrix so every
// device agrees. The active session (who's at this till) is DEVICE-LOCAL — see
// App.jsx / khaanapeena_session — and never syncs.

// gate-able screens — ids MUST match App.jsx NAV ids
export const PAGES = [
  ['dashboard', 'Dashboard'], ['billing', 'Billing (POS)'], ['tables', 'Tables'],
  ['reservations', 'Reservations'], ['kds', 'Kitchen (KDS)'], ['online', 'Online orders'],
  ['menu', 'Menu'], ['inventory', 'Inventory'], ['purchase', 'Purchase & Receipts'],
  ['customers', 'Customers'], ['feedback', 'Feedback'], ['reports', 'Reports'],
  ['register', 'Cash register'], ['expenses', 'Expenses'], ['ai', 'AI insights'], ['waste', 'Waste'],
  ['staff', 'Staff'], ['settings', 'Settings'],
]

// sensitive in-page actions (gated even when the page itself is visible)
export const ACTIONS = [
  ['discount', 'Give discounts'],
  ['void', 'Void / edit punched items'],
  ['settle', 'Settle & take payment'],
  ['openRegister', 'Open / close cash register'],
]

// the staff roles the Staff screen assigns (must match seed/Staff role strings)
export const ROLES = ['Manager', 'Cashier', 'Head Chef', 'Cook', 'Waiter', 'Delivery']

// sensible starting permissions per role (owner-editable). Owner/Admin is implicit-all.
export const DEFAULT_PERMS = {
  Manager: {
    pages: ['dashboard', 'billing', 'tables', 'reservations', 'kds', 'online', 'menu', 'inventory', 'purchase', 'customers', 'feedback', 'reports', 'register', 'expenses', 'ai', 'waste', 'staff'],
    actions: ['discount', 'void', 'settle', 'openRegister'],
  },
  Cashier: {
    pages: ['dashboard', 'billing', 'tables', 'reservations', 'kds', 'online', 'customers', 'register'],
    actions: ['settle'],
  },
  Waiter: { pages: ['billing', 'tables', 'reservations', 'kds'], actions: [] },
  'Head Chef': { pages: ['kds', 'inventory'], actions: [] },
  Cook: { pages: ['kds'], actions: [] },
  Delivery: { pages: ['online'], actions: [] },
}

const emptyRole = { pages: [], actions: [] }

// merge the owner's saved matrix over the defaults (per-role full override)
export function resolvePerms(settings) {
  const custom = settings?.rbac?.matrix || {}
  const out = {}
  for (const r of ROLES) out[r] = { ...(DEFAULT_PERMS[r] || emptyRole), ...(custom[r] || {}) }
  return out
}

// null/empty/owner/admin role = full access (the account owner)
export const isOwnerRole = (role) => !role || /owner|admin/i.test(role)

export function canPage(settings, role, pageId) {
  if (isOwnerRole(role)) return true
  return (resolvePerms(settings)[role]?.pages || []).includes(pageId)
}
export function canAction(settings, role, action) {
  if (isOwnerRole(role)) return true
  return (resolvePerms(settings)[role]?.actions || []).includes(action)
}

// resolve a typed PIN to a session. Manager PIN => full owner access; else the
// staff member who owns that PIN (with their role). Returns a session or null.
export function resolveSession(state, pin) {
  const p = String(pin || '').trim()
  if (!p) return null
  if (state.settings?.managerPin && p === String(state.settings.managerPin)) {
    return { staffId: null, name: 'Owner', role: 'Owner' }
  }
  const st = (state.staff || []).find((s) => s.pin && String(s.pin) === p)
  return st ? { staffId: st.id, name: st.name, role: st.role || 'Cashier' } : null
}

// the first screen a role is allowed to see (for redirects after a switch)
export function firstAllowedPage(settings, role) {
  if (isOwnerRole(role)) return 'dashboard'
  const allowed = resolvePerms(settings)[role]?.pages || []
  return allowed[0] || 'billing'
}
