import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { StoreProvider } from './store.jsx'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </React.StrictMode>
)

// register the PWA service worker in production builds (offline support + installable).
// Web only: Electron (file://) and Capacitor (native shell) must never run the SW —
// a SW intercepting file:// fetches bricks the app shell entirely.
const isWeb = (location.protocol === 'https:' || location.hostname === 'localhost') && !window.Capacitor
if ('serviceWorker' in navigator && import.meta.env.PROD && isWeb) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
} else if ('serviceWorker' in navigator) {
  // heal any environment where a SW was registered by an older build
  navigator.serviceWorker.getRegistrations?.().then((rs) => rs.forEach((r) => r.unregister())).catch(() => {})
}
