# Test data — Kiorex contracts (fixtures only) (DEV ONLY)

> **DEV ONLY / synthetic.** Fictional names, phones `+20100000xxxx`, e-mails `@demo.kiorex.test`. Passwords and OTPs here are local dev values, blocked in production.
> No tax-authority integration; VAT is a plain configurable line. Messaging/PSP/video are mocked. Cross-product index: `TEST_DATA.md` in the workspace root (`kiorex-v2/`).

This repo seeds nothing. `fixtures/` ships **example payloads** as JSON (all synthetic):
- `fixtures/demo-personas.json` — the shared persona list (phones `+20100000xxxx`, subs, AR+EN names, roles) used by every product's demo seed.
- `fixtures/demo-marketplace-bookings.json` — the 28 marketplace bookings that the Kiorly Clinic seed (as appointments `demo_mk_<key>`) and the Kiorex seed (as `demo_bk_<key>`) must agree on.
Use them in contract tests or to craft requests; run the real seeds with `scripts/seed-all.sh` from the workspace root. Dev-only values: OTP `000000`, dev partner/webhook secrets are in `INTEGRATION.md` (PARTNER_DEV_DEFAULTS).

## Q10: new fixture
`fixtures/demo-nurse-lab.json` is the KNLAB01 demo hand-off spec (4 nurse-collected orders: released / awaiting validation / in transit / refused by the lab). Byte-identical copies live in clinics-management (`apps/api/prisma/demo/`), kiorex-platform (`apps/api/prisma/demo/`) and kiorly-lab (`apps/api/src/seed/`): edit all four together. No staging seeding happens from this repo (fixtures only).
