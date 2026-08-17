# Sales collateral

The four HTML files here are the **source of truth** for everything handed to a
restaurant owner. The PDFs and the PNG on the Desktop are build output — edit the
HTML here and re-render, never edit a delivered PDF.

| Source | Delivered as | Audience |
|---|---|---|
| `owner-packet.html` | `KhaanaPeena Owner Packet.pdf` (15 pp) | the owner, after the demo — how every screen works |
| `demo-script.html` | `KhaanaPeena Demo Script.pdf` (3 pp) | whoever runs the demo — the beats, in order |
| `pricing-flyer.html` | `KhaanaPeena Pricing Flyer.pdf` (1 p) | leave-behind that closes the price conversation |
| `whatsapp-flyer.html` | `KhaanaPeena WhatsApp Flyer.png` (1080×1080) | forwarded on WhatsApp, so it must read on a phone |

## Re-rendering

```
npm run docs
```

Renders all four to `%USERPROFILE%\OneDrive\Desktop\KhaanaPeena\`. Pass a directory
to render somewhere else first if you want to check a change before it lands in the
folder the owner actually opens:

```
npm run docs -- ./tmp
```

## Things that will bite you

- **Desktop is OneDrive-redirected on the build machine.** `C:\Users\<user>\Desktop`
  exists but is not the folder the owner sees; the script targets the OneDrive path
  deliberately.
- **The flyer needs old headless Chrome.** New headless pads the screenshot to a
  viewport, so `--window-size=1080,1080` stops producing a 1080×1080 file and the
  square arrives on WhatsApp cropped. The script pins `--headless=old`.
- **The packet is paginated by hand-tuned print CSS.** Adding a paragraph can spill
  it to 16 pages, usually leaving a nearly-empty last page. After any edit, check the
  page count and tighten the print rules rather than cutting content:

  ```
  npm run docs -- ./tmp
  ```

- **Every file is self-contained** — no external CSS, fonts, or images. Keep it that
  way, or a PDF rendered on a machine without the asset will silently lose it.

## Keeping it honest

These documents make specific claims about how the app behaves — the bill maths, the
`(optional)` service charge, what each report shows. When that behaviour changes in
`src/`, the claim here goes stale with nothing to catch it. Re-read the affected
section whenever you change billing, tax, or reports.
