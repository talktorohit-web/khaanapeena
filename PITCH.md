# KhaanaPeena — Go-to-Market Playbook (India)

## Positioning
**"Petpooja ka kaam, aadhe daam, AI ke saath."**
Full restaurant OS where everything Petpooja sells as add-ons (KDS, QR ordering, loyalty, recon, WhatsApp, insights) is **bundled in one transparent price**.

## Why restaurants will switch (from real Petpooja complaints)
| Petpooja pain | KhaanaPeena answer |
|---|---|
| Sales-quote-only, opaque pricing; renewal creep | Public self-serve pricing, sign up online in 10 minutes |
| Everything is a paid add-on (KDS ₹, loyalty ₹, recon ₹, website ₹) | One plan, everything included |
| Slow support, no late-night help | 24×7 WhatsApp support (restaurants run nights) |
| Dated, cluttered UI; long staff training | Modern UI; a waiter learns it in 15 minutes; Hindi/Punjabi UI |
| No AI: no forecasting, no predictive inventory | Forecasting, reorder alerts, dead-item detection built in |
| Hardware bundling pressure | BYOD — runs on any phone, tablet, or PC in a browser |

## Pricing (suggested, +18% GST)
- **Free** — 1 outlet, 50 bills/month (hook for new dhabas/cloud kitchens)
- **Standard ₹6,999/yr** — unlimited billing, KDS, QR ordering, inventory, CRM, reports
- **Pro ₹14,999/yr** — AI insights, WhatsApp bot, payout recon, multi-terminal, priority support
- **Chain ₹34,999/yr** — up to 5 outlets, central menu, consolidated reports
- vs Petpooja: ₹10k base + ₹16–28k/outlet/yr in add-ons. We undercut the *real* total by ~50%.

## Beachhead
Tier-2/3 Punjab & North India (Jalandhar, Ludhiana, Amritsar, Chandigarh) — dhabas, cafes, cloud kitchens doing 30–300 bills/day. Distribution: local POS hardware dealers (give them 20% recurring), restaurant-supply WhatsApp groups, Zomato/Swiggy restaurant-partner communities.

## Compliance checklist already built in
- 5% GST regular (CGST 2.5 + SGST 2.5) and 18% hotel mode
- Composition scheme → Bill of Supply + mandatory declaration line
- FSSAI licence number on every bill (mandatory since Oct 2021)
- Sec 9(5): aggregator-liable GST separated in reports (GSTR-1 Table 8)
- Zero-MDR dynamic UPI QR per bill

## Production roadmap (from this prototype)
1. **v1 (4–6 wks):** Supabase backend (multi-tenant orgs like JackFades model), auth + roles, real thermal-printer (ESC/POS) support, PWA install
2. **v1.5:** WhatsApp Business API intake, UPI PSP webhooks (auto-recon), Zomato/Swiggy partner APIs via UrbanPiper-style middleware
3. **v2:** photo→menu via vision model, voice billing tuned on Indian accents, ONDC seller integration, attendance/payroll add-on (reuse the attendance product engine)
