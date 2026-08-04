const { app, BrowserWindow, shell, Menu, session, ipcMain } = require('electron')
const path = require('path')
const net = require('net')

// Raw ESC/POS printing to a LAN/USB-to-LAN thermal printer over TCP :9100.
ipcMain.handle('kp:print-tcp', (_e, { ip, port, bytes }) => new Promise((resolve) => {
  const sock = new net.Socket()
  let done = false
  const finish = (r) => { if (!done) { done = true; try { sock.destroy() } catch { /* already gone */ } resolve(r) } }
  sock.setTimeout(5000)
  sock.once('error', (err) => finish({ ok: false, error: err.message }))
  sock.once('timeout', () => finish({ ok: false, error: 'Printer did not respond (check IP / power)' }))
  sock.connect(Number(port) || 9100, String(ip), () => {
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
