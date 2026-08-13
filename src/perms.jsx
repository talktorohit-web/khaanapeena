import { createContext, useContext } from 'react'

// Active-session permission context, provided by App. `role` is the active user's
// role ('Owner' when RBAC is off or the owner is signed in); `can(action)` gates
// sensitive in-page actions; `lock()` returns the till to the PIN screen.
export const PermContext = createContext({
  role: 'Owner',
  rbacOn: false,
  can: () => true,
  lock: () => {},
  session: null,
})

export const usePerms = () => useContext(PermContext)
