const { app, BrowserWindow, shell, Menu, session, ipcMain } = require('electron')
const path = require('path')
const net = require('net')

// Only allow connections to private/LAN addresses on real printer ports. This is a
// raw connect-anywhere + send-arbitrary-bytes primitive exposed to the renderer;
// clamping it means a future renderer compromise (XSS, bad dep) can't turn it into
// an internal port scanner / SSRF tool hitting loopback, cloud-metadata, or the WAN.
const PRINTER_PORTS = new Set([9100, 9101, 9102, 9103, 515, 631])
const MAX_PRINT_BYTES = 200 * 1024
function isPrivateLan(ip) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(ip || '').trim())
  if (!m) return false
  const [a, b] = [Number(m[1]), Number(m[2])]
  if ([a, Number(m[3]), Number(m[4])].concat(b).some((n) => n > 255)) return false
  if (a === 10) return true                       // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true          // 192.168.0.0/16
  return false // rejects loopback (127.x), link-local/metadata (169.254.x), and all public IPs
}

// Raw ESC/POS printing to a LAN/USB-to-LAN thermal printer over TCP :9100.
ipcMain.handle('kp:print-tcp', (_e, { ip, port, bytes }) => new Promise((resolve) => {
  const p = Number(port) || 9100
  if (!isPrivateLan(ip)) return resolve({ ok: false, error: 'Printer IP must be a LAN address (10.x, 172.16–31.x, 192.168.x)' })
  if (!PRINTER_PORTS.has(p)) return resolve({ ok: false, error: 'Port not allowed — use a printer port (9100 etc.)' })
  if (!Array.isArray(bytes) || bytes.length > MAX_PRINT_BYTES) return resolve({ ok: false, error: 'Invalid or oversized print job' })
  const sock = new net.Socket()
  let done = false
  const finish = (r) => { if (!done) { done = true; try { sock.destroy() } catch { /* already gone */ } resolve(r) } }
  sock.setTimeout(5000)
  sock.once('error', (err) => finish({ ok: false, error: err.message }))
  sock.once('timeout', () => finish({ ok: false, error: 'Printer did not respond (check IP / power)' }))
  sock.connect(p, String(ip), () => {
    sock.write(Buffer.from(bytes), (err) => {
      if (err) return finish({ ok: false, error: err.message })
      setTimeout(() => finish({ ok: true }), 300) // let the buffer drain before closing
    })
  })
}))

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: '#12100e',
    title: 'KhaanaPeena — Restaurant OS',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  })

  Menu.setApplicationMenu(null) // clean kiosk-like chrome for restaurant counters
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))

  // open UPI / external links in the system browser, not inside the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(async () => {
  // a service worker registered on file:// (by older builds) intercepts and can
  // brick every page load — always clear SW state before opening the window
  try {
    await session.defaultSession.clearStorageData({ storages: ['serviceworkers', 'cachestorage'] })
  } catch { /* nothing to clear */ }
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
