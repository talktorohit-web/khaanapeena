const { contextBridge, ipcRenderer } = require('electron')

// safe bridge for raw ESC/POS network printing from the renderer
contextBridge.exposeInMainWorld('kpPrint', {
  tcp: (ip, port, bytes) => ipcRenderer.invoke('kp:print-tcp', { ip, port, bytes }),
})
