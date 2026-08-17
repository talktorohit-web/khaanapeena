// Renders the sales collateral in this folder to the owner's Desktop delivery folder.
// The HTML here is the source of truth; the PDFs and PNG are build output and are
// deliberately not committed — regenerate them instead of editing them.
//
//   npm run docs            -> renders to the Desktop delivery folder
//   npm run docs -- <dir>   -> renders somewhere else (used to verify a change)

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

// Desktop is OneDrive-redirected on this machine — the plain C:\Users\<u>\Desktop
// path exists but is NOT the folder the owner sees.
const DEFAULT_OUT = path.join(
  process.env.USERPROFILE || '',
  'OneDrive', 'Desktop', 'KhaanaPeena',
)

const CHROME = [
  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
].find((p) => existsSync(p))

// Output names carry the product name and spaces because they are handed to a
// restaurant owner over WhatsApp, not read by a build tool.
const DOCS = [
  { src: 'owner-packet.html',   out: 'KhaanaPeena Owner Packet.pdf',    kind: 'pdf' },
  { src: 'demo-script.html',    out: 'KhaanaPeena Demo Script.pdf',     kind: 'pdf' },
  { src: 'pricing-flyer.html',  out: 'KhaanaPeena Pricing Flyer.pdf',   kind: 'pdf' },
  { src: 'whatsapp-flyer.html', out: 'KhaanaPeena WhatsApp Flyer.png',  kind: 'png', size: 1080 },
]

function render(doc, outDir, profile) {
  const src = path.join(HERE, doc.src)
  const out = path.join(outDir, doc.out)
  const url = pathToFileURL(src).href
  const common = [
    `--user-data-dir=${profile}`, // never touch the owner's real Chrome profile
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
  ]
  const args = doc.kind === 'pdf'
    ? ['--headless', ...common, '--no-pdf-header-footer', `--print-to-pdf=${out}`, url]
    // old headless honours --window-size exactly; the new one pads to a viewport
    // and the flyer comes out at the wrong size for a WhatsApp square.
    : ['--headless=old', ...common, `--screenshot=${out}`, `--window-size=${doc.size},${doc.size}`, url]

  execFileSync(CHROME, args, { stdio: 'ignore' })
  if (!existsSync(out)) throw new Error(`Chrome produced no file for ${doc.src}`)
  return out
}

if (!CHROME) {
  console.error('Chrome not found — install Google Chrome or edit the CHROME list in docs/render.mjs')
  process.exit(1)
}

const outDir = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_OUT
mkdirSync(outDir, { recursive: true })
const profile = mkdtempSync(path.join(tmpdir(), 'kp-render-'))

try {
  for (const doc of DOCS) {
    const out = render(doc, outDir, profile)
    console.log(`${doc.out.padEnd(34)} ${(statSync(out).size / 1024).toFixed(0)} KB`)
  }
  console.log(`\nRendered ${DOCS.length} documents to ${outDir}`)
} finally {
  rmSync(profile, { recursive: true, force: true })
}
