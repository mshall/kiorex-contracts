# Kiorex contracts: fixtures and dev defaults (DEV ONLY)

> **DEV ONLY / synthetic.** This repo **seeds nothing and runs no service**: it is the versioned contract package (`@kiorex/contracts` 1.6.0: OpenAPI, event JSON Schemas, flag catalogue, HMAC helpers, TS SDK). Its "demo data" is a set of example payloads and shared fixtures that the real seeds of the other repos must agree on. Workspace index: [../DEMO_DATA.md](../DEMO_DATA.md) · shared tables: [../TEST_DATA.md](../TEST_DATA.md) · repo note: [TEST_DATA.md](TEST_DATA.md).
> Checked on 21 Nov 2026: `npm test` passes (5 files, 116 tests).

## 1. What this demo is for

* A single source of truth for the demo cast and the demo marketplace bookings, so Kiorly Clinic and Kiorex mirror each other.
* Example event payloads and request bodies you can paste into a contract test, a mock server or `curl` to see what a producer emits and what a consumer must accept.
* The dev-only HMAC registrations the local stack uses between Kiorex and its partners.

## 2. Run

```bash
cd kiorex-contracts
npm install
npm test                 # vitest: schema validation, OpenAPI drift, fixtures, HMAC, flag evaluator (needs no stack)
npm run build            # generate events/flags/types + tsup (writes dist/; dist is git-ignored)
npm run pack:local       # tarball into dist-pack/ for the file: dependency used by the other repos
```
Nothing to seed and no reset. To see the fixtures live, run the workspace seeds (`scripts/seed-all.sh`), which read the copies of these files.

## 3. What is in `fixtures/` and `events/examples/`

| File | What it holds | Consumed by (byte-identical copies: edit all together) |
|---|---|---|
| `fixtures/demo-personas.json` | 35 shared personas = every account of the Passport seed (`+201000000001/2/99`, patients `+201000001001..1013`, org members `+201000002001..2005`, Nurse cast `+201000003001..3011`, ops `+201000009001..9003`), each with `phone`, `sub` (`01HZKXD...`), `nameEn`, `nameAr`, `gender`, `role`, `otp: "000000"` | seeds' persona lists; Passport `config/seed-users.json` is the source (same 35 users, same phones and subs) |
| `fixtures/demo-marketplace-bookings.json` | the **28** marketplace bookings `mk01..mk28` with doctor, patient phone, day offset, Kiorex and Kiorly status and deposit state: COMPLETED 11, CONFIRMED 10, CANCELLED 3, NO_SHOW 1, CHECKED_IN 1, PENDING_CLINIC 1, HELD 1; deposits PAID 8, NONE 8, RELEASED 7, REFUNDED 3, FORFEITED 1, REQUIRED 1 | clinics-management `apps/api/prisma/demo/` (as appointments `demo_mk_<key>`), kiorex-platform `apps/api/prisma/demo/` (as `demo_bk_<key>`) |
| `fixtures/demo-nurse-lab.json` | the KNLAB01 spec: 4 nurse-collected orders `demo_lo_nl1..4` (released / awaiting validation / in transit / refused by the lab) | clinics-management, kiorex-platform, kiorly-lab (`src/seed/`): four copies |
| `fixtures/marketplace-v1.2-home-visit.json` | request/response examples for providers, slots, hold with address, OUT_OF_COVERAGE 422, care-plan request | contract tests (`openapi-drift.test.ts`) |
| `fixtures/nurse-lab-handoff-v1.6.json` | a nurse -> lab hand-off envelope (eventId, type, aggregate, data, target) | contract tests |
| `fixtures/events-v2.3/*.json` | 8 events: CARE_PLAN_CONFIRMED, CARE_PLAN_ENDED, HOME_VISIT_ASSIGNED, HOME_VISIT_EN_ROUTE, HOME_VISIT_ABORTED_UNSAFE, SAFETY_ALERT_RAISED, MedicationOrderShared, ReferralIssued | `schemas.test.ts` |
| `events/examples/*.example.json` | 46 example payloads, one per event type (APPOINTMENT_CONFIRMED, CANCELLED_BY_*, NO_SHOW, WAITLIST_OFFER, LabResultReleased, OrderReady, flag.changed, guardian.link.changed, ...) | schema tests; handy for manual `curl` |

**Dev-only registrations** (`PARTNER_DEV_DEFAULTS` in `src/hmac.ts`, also in `../INTEGRATION.md`; used by `e2e/src/env.ts`; never valid in production): marketplace client `kx_dev_client` / `kx_dev_secret_change_me`, webhook secret `kx_dev_webhook_secret`, flag product secret `ff_dev_secret_change_me`; pharmacy `kx_dev_pharmacy_client` / `kx_dev_pharmacy_secret_change_me` (webhook `kx_dev_pharmacy_webhook_secret`); lab `kl_dev_kiorex` / `dev_kiorex_secret_change_me` (webhook `kx_dev_lab_webhook_secret`) and the nurse client `kl_dev_nurse` / `dev_nurse_secret_change_me`. Passport OTP for the personas: `000000` (local dev IdP only).

## 4. Manual test scripts

**CT1. Contract tests.** `cd kiorex-contracts && npm test`. *Expected:* 116 tests pass (schemas, OpenAPI drift, flags, HMAC, fixtures).

**CT2. Validate an example event.** After `npm run build`: `node -e "import('./dist/index.js').then(m=>{const e=require('./events/examples/APPOINTMENT_CONFIRMED.example.json');console.log(m.validateEvent(e.type,e).valid)})"`. *Expected:* `true` (verified 21 Nov 2026). Remove a required field from the JSON and rerun: `valid: false` plus the validation errors.

**CT3. Sign a request and send it to the running Kiorly API.** In Node: `signKiorlyRequest({clientKey:'kx_dev_client', clientSecret:'kx_dev_secret_change_me', method:'GET', path:'/marketplace/v1/providers', body:''})`, then `fetch('http://localhost:3010/marketplace/v1/providers', {headers})`. *Expected:* **200** with the provider list (verified 21 Nov 2026; note the marketplace API is at `/marketplace/v1`, not under `/api/v1`). A tampered path, body or timestamp is refused (401).

**CT4. Fixture parity with the seeds.** Compare the bookings file with the seeded data: Kiorex `demo_bk_mk01..mk28` vs Kiorly `demo_mk_mk01..mk28` (same doctor, day offset, status). *Expected:* identical keys; the only known difference is `mk28` (HELD in the fixture, EXPIRED after the hold time in the live DB).

**CT5. Flag evaluation.** `evaluateFlag(snapshot, FLAGS.KIOREX_MARKETPLACE, {market:'EG', orgId})` with a snapshot where the flag is OFF -> `featureDisabledBody` gives `403 FEATURE_DISABLED {key, scope}`; with `null` snapshot the code default applies (fail-static). Safety controls are never flags (`flags/safety-never-flags.json`).

## 5. Who should see what

This package has no users or roles. Only ever put the dev secrets above in local code; any real credential belongs in secret stores, never in fixtures.

## 6. Known limitations and inconsistencies found

* Fixed 21 Nov 2026: `demo-personas.json` listed 20 personas against 35 in the Passport seed; it now has all 35 (the Nurse cast, Nabila, the ops super admin and the e2e fixtures added). nameEn / nameAr / gender are display values taken from the Kiorly seeds; role labels for the Nurse cast (`org:nurse`, ...) are descriptive, the Passport accounts themselves carry the role `patient`.
* `docs/USAGE.md` used to say the signed path includes `/api/v1`; fixed: the marketplace API is at `/marketplace/v1/...` and that is the path to sign.
* No PHI and no tax-authority anything in the fixtures (a repo test must fail on ETA references).
* The `dist/` and `dist-pack/` folders are build output, not demo data.

---
Verified: 2026-11-21 (`npm test`: 116 passed; the 35 personas match `kiorex-account/config/seed-users.json` on phone and sub; a signed `GET :3010/marketplace/v1/providers` returned 200 and the same request signed under `/api/v1/marketplace/v1/providers` returned 404).
