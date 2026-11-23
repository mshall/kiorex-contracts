# Kiorex contracts test guide (DEV ONLY)

> **DEV ONLY / synthetic.** All names, phones, e-mails, passwords, OTPs and TOTP seeds below are fake values for the local stack; they are refused when `NODE_ENV=production` and the sign-in quick-pick ("Test users (dev only)") is not in production builds. Providers are mocked (dev inbox / logs, PSP `sandbox-fake`, video `mock`). No tax-authority integration.
> This guide is the repo's slice of the workspace guide `TEST_GUIDE.md` (parent folder `kiorex-v2/`, not part of this repository). Facts verified against the seeds and dev databases on 23 Nov 2026.

This repo seeds nothing and has no sign-in screen, so there is no quick-pick panel here. It holds the shared synthetic cast the other products seed from.

## Run the checks

```bash
cd kiorex-contracts
npm install
npm test                  # vitest: schema validation, OpenAPI drift, fixtures, HMAC, flag evaluator (needs no stack); 116 tests on 21 Nov 2026
npm run build             # generate events/flags/types + tsup
npm run pack:local        # tarball into dist-pack/ for the file: dependency used by the other repos
```

## Test users and data it carries

* `fixtures/demo-personas.json`: the 35 Passport personas (phones `+201000000001/2/99`, patients `+201000001001..1013`, org members `+201000002001..2005`, Nurse cast `+2010000030xx`, ops `+201000009001..3`); the same phones and subs as `kiorex-account/config/seed-users.json`. Passport OTP for all: `000000`.
* `fixtures/demo-marketplace-bookings.json`: the 28 marketplace bookings `mk01..mk28` (which patient, doctor, state, deposit state) behind the booking flows in the workspace guide.
* `fixtures/demo-nurse-lab.json`: the KNLAB01 nurse-sample orders `demo_lo_nl1..4` (released, awaiting validation, in transit, refused).
* Dev HMAC registrations for the local stack are in `DEMO_DATA.md`.

## How to test it against the live stack

1. Bring the stack up and seed it (above).
2. Signed marketplace call: `GET http://localhost:3010/marketplace/v1/providers` signed with the dev key from `DEMO_DATA.md` returns 200 (the path is `/marketplace/v1/...`; the `/api/v1/marketplace/...` form is 404).
3. Paste an example from `events/examples/` into a consumer contract test, or `curl` it, to see what a producer emits and a consumer must accept.
4. After changing a schema run `npm test` here, then each consumer's contract tests (Clinic, Kiorex platform).

For the product flows (booking, deposits, reschedule, cancel, lab, pharmacy, telemedicine, records, family, reviews, ops flags, onboarding import, staff app, Passport sign-in/out, Arabic/RTL) with every user and credential, see the workspace `TEST_GUIDE.md` and the guides in the product repos.
