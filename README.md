# 🍛 KhaanaPeena — Restaurant OS for India

A complete restaurant management platform (Petpooja-class) built for the Indian market — **with the features Petpooja charges extra for, or doesn't have at all, bundled free**.

## Run it

```bash
npm install
npm run dev        # http://localhost:5190
```

Demo restaurant: **Sharma Ji Da Dhaba, Jalandhar** — seeded with 35 days of realistic sales history, menu, inventory, customers and staff. All data lives in `localStorage` (fully offline-capable). Reset anytime from **Settings → Reset demo data**.

## Modules (Petpooja parity)

| Module | What it does |
|---|---|
| **Billing (POS)** | 3-click billing, KOT, dine-in/takeaway/delivery, discounts, split-by-method, table assignment |
| **Tables** | Live floor view (Main Hall / Family / Outdoor), running bill per table, per-table QR |
| **Kitchen (KDS)** | Live KOT tickets, elapsed-time alerts (red after 15 min), mark ready → served |
| **Online Orders** | Zomato/Swiggy order inbox (accept/reject → auto-KOT), order simulation for demos |
| **Menu** | Categories, veg marks, stations, availability toggles, add/edit items |
| **Inventory** | Recipe-based **auto-deduction on every KOT**, low-stock alerts, days-left prediction, purchases |
| **CRM** | Loyalty points (earn/redeem at billing), VIP / at-risk / birthday segments |
| **Reports** | Daily sales, channel mix, top items, peak hours, CSV export |
| **Staff** | Roles, POS PINs, on-shift toggle |

## 🚀 Features Petpooja does NOT have (our sell)

1. **✨ AI Insights — built-in, free** — 7-day sales forecast (weekday-pattern model), dead-item detection, rising stars, smart reorder alerts, slow-hour happy-hour suggestions. Petpooja sells "dynamic reports" as a paid add-on and has no forecasting.
2. **🎙️ Voice billing (Hindi + English)** — cashier says *"do butter chicken char garlic naan"*, the bill fills itself (Web Speech API).
3. **📱 QR self-ordering + dynamic UPI QR** — per-table QR → guest orders from their phone → lands straight in KDS → pays via UPI deep-link with amount pre-filled. Bundled, not an add-on.
4. **💬 WhatsApp order bot** — paste (or in production, receive) a customer's WhatsApp message; the order parses itself.
5. **🧮 Aggregator payout reconciliation** — know exactly what Zomato/Swiggy owe you: commission, 18% GST on commission, 1% TDS → net payout. Petpooja sells recon as an add-on.
6. **🧾 Composition-scheme-aware billing** — one switch flips every bill between *Tax Invoice* (CGST/SGST shown) and *Bill of Supply* with the mandatory composition-dealer line. FSSAI number on every bill (mandatory since Oct 2021). Sec 9(5) ECO sales separated in the GST report.
7. **📸 AI Photo→Menu onboarding** — photograph a printed menu card, get a digital menu (simulated in demo; vision-model in production).
8. **🗑️ Food-waste tracker** — every wasted kilo logged with ₹ loss, yearly run-rate, reason analysis.
9. **🪔 Festival demand radar** — Indian festival calendar with stocking/menu advice per festival.
10. **🌐 Trilingual UI** — English / हिंदी / ਪੰਜਾਬੀ, switchable live.
11. **📴 Offline-first** — billing never stops when the internet does; state persists locally.

## Tech

Vite + React 18 + Tailwind CSS v4 + `qrcode`. No backend needed for the demo; production path is Supabase/Postgres + WhatsApp Business API + UPI PSP + ONDC/aggregator APIs.

## Structure

```
src/
  store.jsx        # localStorage-backed global store (orders, menu, inventory, CRM…)
  seed.js          # demo restaurant + 35 days of generated sales history
  utils.js         # GST math, UPI links, forecast model, festival calendar
  i18n.js          # EN/HI/PA dictionary
  charts.jsx       # CVD-safe SVG chart primitives
  pages/           # 14 screens (Dashboard, Billing, KDS, QRMenu customer view, …)
```

`#/qr?t=T5` is the customer-facing self-order route (what the table QR points to).
