import sharp from 'sharp'
import { readFileSync, mkdirSync } from 'fs'

const SAFFRON = '#f06008'
const DARK = '#12100e'
const icon = readFileSync('assets/icon.svg')
const fg = readFileSync('assets/icon-fg.svg')

for (const d of ['public/icons', 'resources', 'build', 'assets']) mkdirSync(d, { recursive: true })

const render = (svg, size) => sharp(svg, { density: 384 }).resize(size, size).png()

// ---- PWA icons ----
await render(icon, 192).toFile('public/icons/icon-192.png')
await render(icon, 512).toFile('public/icons/icon-512.png')
await render(icon, 512).flatten({ background: SAFFRON }).toFile('public/icons/icon-maskable-512.png')
await render(icon, 64).toFile('public/icons/favicon-64.png')

// ---- Electron window/installer icon ----
await render(icon, 512).toFile('build/icon.png')

// ---- Capacitor @capacitor/assets source set ----
// adaptive foreground (transparent, safe-zone), solid background, and splash screens
await render(fg, 1024).toFile('assets/icon-foreground.png')
await sharp({ create: { width: 1024, height: 1024, channels: 4, background: SAFFRON } }).png().toFile('assets/icon-background.png')
await render(icon, 1024).toFile('assets/icon-only.png')

const splash = async (bg, out) => {
  const logo = await render(icon, 900).toBuffer()
  await sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toFile(out)
}
await splash(SAFFRON, 'assets/splash.png')
await splash(DARK, 'assets/splash-dark.png')

console.log('assets generated ✓')
