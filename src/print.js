// Printer transport: sends ESC/POS bytes to a thermal printer over the best
// channel available for the current platform.
//   network  -> TCP :9100 (LAN/USB-to-LAN) — Electron desktop only (raw sockets)
//   usb      -> WebUSB — Chrome/Electron
//   bluetooth-> Web Bluetooth (BLE) — best-effort, device-dependent
//   browser  -> caller falls back to the printable HTML receipt
//
// Returns { ok:true } on success, or { ok:false, reason } so the caller can
// fall back to window.print().

export const DEFAULT_PRINTER = { enabled: false, mode: 'browser', ip: '', port: 9100, width: 48, kitchenIp: '' }

export const inElectron = () => typeof window !== 'undefined' && !!window.kpPrint

let usbDevice = null

async function printTCP(bytes, ip, port) {
  if (!window.kpPrint?.tcp) return { ok: false, reason: 'Network printing needs the desktop app' }
  if (!ip) return { ok: false, reason: 'No printer IP set' }
  try {
    const res = await window.kpPrint.tcp(ip, Number(port) || 9100, Array.from(bytes))
    return res?.ok ? { ok: true } : { ok: false, reason: res?.error || 'Printer did not respond' }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

async function getUsb() {
  if (!('usb' in navigator)) throw new Error('WebUSB not supported here')
  if (usbDevice && usbDevice.opened) return usbDevice
  const dev = usbDevice || (await navigator.usb.requestDevice({ filters: [{ classCode: 7 }, {}] }))
  await dev.open()
  if (dev.configuration === null) await dev.selectConfiguration(1)
  // find an interface with a bulk OUT endpoint
  let iface = null, epOut = null
  for (const cfg of dev.configurations) {
    for (const it of cfg.interfaces) {
      const alt = it.alternate
      const out = alt.endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
      if (out) { iface = it.interfaceNumber; epOut = out.endpointNumber; break }
    }
    if (iface !== null) break
  }
  if (iface === null) throw new Error('No printable USB interface found')
  try { await dev.claimInterface(iface) } catch { /* already claimed */ }
  dev._epOut = epOut
  usbDevice = dev
  return dev
}

async function printUSB(bytes) {
  try {
    const dev = await getUsb()
    // chunk the transfer for small printer buffers
    const chunk = 4096
    for (let i = 0; i < bytes.length; i += chunk) await dev.transferOut(dev._epOut, bytes.slice(i, i + chunk))
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

async function printBLE(bytes) {
  try {
    if (!('bluetooth' in navigator)) throw new Error('Web Bluetooth not supported here')
    const dev = await navigator.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [0x18f0, '000018f0-0000-1000-8000-00805f9b34fb', '49535343-fe7d-4ae5-8fa9-9fafd205e455'],
    })
    const server = await dev.gatt.connect()
    const services = await server.getPrimaryServices()
    let ch = null
    for (const s of services) {
      for (const c of await s.getCharacteristics()) {
        if (c.properties.write || c.properties.writeWithoutResponse) { ch = c; break }
      }
      if (ch) break
    }
    if (!ch) throw new Error('No writable characteristic on this printer')
    const chunk = 180
    for (let i = 0; i < bytes.length; i += chunk) await ch.writeValueWithoutResponse(bytes.slice(i, i + chunk))
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: String(e?.message || e) }
  }
}

// dispatch based on config; `override` lets KOT use the kitchen printer IP
export async function sendToPrinter(bytes, cfg, override = {}) {
  const mode = override.mode || cfg.mode
  if (mode === 'network') return printTCP(bytes, override.ip || cfg.ip, override.port || cfg.port)
  if (mode === 'usb') return printUSB(bytes)
  if (mode === 'bluetooth') return printBLE(bytes)
  return { ok: false, reason: 'browser' }
}

// ---- high-level helpers used by the app ----
import { buildBill, buildKOT, buildShiftReport } from './escpos.js'

const cfgOf = (settings) => settings.printer || DEFAULT_PRINTER

export async function printBill(order, settings, totals) {
  const cfg = cfgOf(settings)
  if (!cfg.enabled || cfg.mode === 'browser') return { ok: false, reason: 'browser' }
  return sendToPrinter(buildBill(order, settings, totals, cfg.width || 48), cfg)
}

export async function printKOT(order, settings) {
  const cfg = cfgOf(settings)
  if (!cfg.enabled || cfg.mode === 'browser') return { ok: false, reason: 'browser' }
  const override = cfg.mode === 'network' && cfg.kitchenIp ? { ip: cfg.kitchenIp } : {}
  return sendToPrinter(buildKOT(order, cfg.width || 48), cfg, override)
}

export async function printShiftReport(shift, tot, settings, isX = false) {
  const cfg = cfgOf(settings)
  if (!cfg.enabled || cfg.mode === 'browser') return { ok: false, reason: 'browser' }
  return sendToPrinter(buildShiftReport(shift, tot, settings, cfg.width || 48, isX), cfg)
}

// a tiny test receipt for the Settings "Test print" button
export async function printTest(settings) {
  const cfg = cfgOf(settings)
  const order = {
    billNo: 'TEST', type: 'takeaway', createdAt: Date.now(), paidAt: Date.now(),
    items: [{ name: 'Test Item', qty: 1, price: 100 }], payment: { method: 'upi' },
  }
  const totals = { sub: 100, discount: 0, taxable: 100, cgst: 2.5, sgst: 2.5, gstRate: 5, total: 105 }
  if (cfg.mode === 'browser') return { ok: false, reason: 'browser' }
  return sendToPrinter(buildBill(order, settings, totals, cfg.width || 48), cfg)
}
