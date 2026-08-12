// Keyboard shortcuts. Single-key page navigation (active only when NOT typing in
// a field), function keys for billing actions, "?" for help, Esc to close.

// pageId -> nav key. Order matches the sidebar.
export const PAGE_KEYS = {
  dashboard: 'D',
  billing: 'B',
  tables: 'T',
  reservations: 'V',
  kds: 'K',
  online: 'O',
  menu: 'M',
  inventory: 'I',
  purchase: 'P',
  customers: 'C',
  reports: 'R',
  register: 'G',
  ai: 'A',
  waste: 'W',
  staff: 'S',
  settings: ',',
}

// reverse map: lowercased key -> pageId
export const KEY_TO_PAGE = Object.fromEntries(
  Object.entries(PAGE_KEYS).map(([page, k]) => [k.toLowerCase(), page])
)

export const BILLING_KEYS = {
  newOrder: 'F2',
  sendKot: 'F4',
  settle: 'F9',
}

// grouped list for the help overlay
export const SHORTCUT_GROUPS = [
  {
    title: 'Go to screen',
    items: [
      ['D', 'Dashboard'], ['B', 'Billing (POS)'], ['T', 'Tables'], ['V', 'Reservations'],
      ['K', 'Kitchen (KDS)'], ['O', 'Online Orders'], ['M', 'Menu'], ['I', 'Inventory'],
      ['P', 'Purchase & GRN'], ['C', 'Customers'], ['R', 'Reports'], ['G', 'Cash Register'], ['A', 'AI Insights'], ['W', 'Waste'], ['S', 'Staff'], [',', 'Settings'],
    ],
  },
  {
    title: 'Billing actions',
    items: [
      ['F2', 'New order'], ['F4', 'Send KOT'], ['F9', 'Settle / Pay'],
    ],
  },
  {
    title: 'General',
    items: [
      ['?', 'Show this shortcuts help'], ['Esc', 'Close dialog / help'],
    ],
  },
]

// true when the user is typing somewhere and shortcuts must be ignored
export function isTyping(el) {
  if (!el) return false
  const tag = el.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable
}
