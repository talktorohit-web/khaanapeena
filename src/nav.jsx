import { createContext, useContext } from 'react'

// App-wide navigation so any page can jump to another page and hand off a
// selected order (e.g. Tables -> Billing for a specific table's order).
export const NavContext = createContext({
  page: 'dashboard',
  goTo: () => {},
  focusOrderId: null,
  clearFocus: () => {},
})

export const useNav = () => useContext(NavContext)
