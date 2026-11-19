# @kiorex/contracts

> **QA / demo data:** synthetic Egyptian dataset, logins, URLs and reset instructions in [TEST_DATA.md](TEST_DATA.md) (DEV ONLY).

Single source of truth for everything that crosses a product boundary in Kiorex v2 (KX-09, ADR-023..025, NH-019):

| Path | What |
|---|---|
| `openapi/kiorly-marketplace.v1.openapi.json` | Kiorly Clinic marketplace API (copied from clinics-management; Kiorly stays the producer) |
| `consumer/kiorex-consumer-contract.json` | Kiorex's consumer-driven expectations of the Kiorly API |
| `openapi/kiorex-control-plane.v1.openapi.json` | Flag snapshot (`GET /control/v1/flags/snapshot`, HMAC, ETag/304), `flag.changed` push, universal `403 FEATURE_DISABLED {key,scope}` |
| `openapi/kiorex-webhooks.v1.openapi.json` | Kiorly -> Kiorex receiver `POST /api/v1/webhooks/kiorly`, PSP webhook shape, OIDC back-channel logout |
| `openapi/kiorly-pharmacy.v1.openapi.json`, `openapi/kiorly-lab.v1.openapi.json` | Kiorex -> Kiorly Pharmacy / Lab machine APIs (draft, reconciled against the running services in 1.4.0) |
| `events/*.schema.json` (+ `examples/`) | JSON Schema 2020-12: envelope + one schema per event |
| `fixtures/events-v2.3/*.json`, `fixtures/marketplace-v1.2-home-visit.json` | Example JSON for the Rev 2.3 events and marketplace additions (validated in tests; not shipped in the package) |
| `flags/catalogue.json`, `flags/safety-never-flags.json` | KX-08 §09 flag catalogue; ADR-025 never-a-flag list |
| `src/` | Types (openapi-typescript + generated event types), `validateEvent`, HMAC helpers, `evaluateFlag`, typed `FLAGS` |

See `CHANGELOG.md` for where Kiorly's code differs from KX-09 (the code wins).

## Use

```ts
import {
  signKiorlyRequest, verifyKiorlyRequest, signWebhook, verifyWebhook,
  validateEvent, evaluateFlag, featureDisabledBody, FLAGS,
} from "@kiorex/contracts";

// Kiorex -> Kiorly (path = full path incl. /api/v1; query ignored)
const { headers } = signKiorlyRequest({ clientKey, clientSecret, method: "POST", path: "/api/v1/marketplace/v1/holds", body: json });

// Kiorly -> Kiorex receiver: verify the RAW body, then de-duplicate on eventId
const ok = verifyWebhook({ secret, body: rawBody, timestamp: req.headers["x-kiorly-timestamp"], signature: req.headers["x-kiorly-signature"] });
const parsed = validateEvent(envelope.type, envelope); // unknown type => { valid:false } -> log + 2xx

// Flags: local, pure, no network. snapshot may be null (fail-static code defaults)
const d = evaluateFlag(snapshot, FLAGS.KIOREX_MARKETPLACE, { market: "EG", orgId });
if (!d.enabled) throw new ForbiddenException(featureDisabledBody(d)); // 403 FEATURE_DISABLED {key,scope}
```

Types from the OpenAPI files: `import type { KiorlyMarketplaceApi, ControlPlaneApi, WebhooksApi } from "@kiorex/contracts"`
(`KiorlyMarketplaceApi.paths`, `.components`, `.operations`). Raw files are importable as `@kiorex/contracts/openapi/<file>`,
`/events/<file>`, `/flags/<file>`, `/consumer/<file>`.

## Pinning and versions (producers and consumers)

- **Pin an exact version** (no `^`/`~`) in every repo: `"@kiorex/contracts": "1.0.0"`. Upgrades are an explicit PR that runs the
  repo's contract tests. Both producer and consumer CI fail on drift (KX-09 §01/§07).
- **Semver per contract.** Additive (new optional field, new event, new endpoint) = **minor**. Removing/renaming a field, event type,
  path or enum value, or tightening a schema = **major**. Docs-only/bugfix = patch.
- **90-day rule.** A major change keeps the old contract working in parallel for 90 days (producer emits both / accepts both),
  announced in the Kiorly Docs hub and the ops console banner. Consumers must tolerate unknown fields and unknown event types
  (log + 2xx); schemas never set `additionalProperties: false` on `data`.
- **Breaking a published contract needs a human decision** (CLAUDE.md "Stop and ask").
- Producers (Kiorly, Kiorex Pay, Account, control plane) validate outgoing payloads against `events/*.schema.json` in non-production;
  consumers validate on receipt.

### Consuming from GitHub Packages

```
# .npmrc in the consuming repo (token: a PAT/GITHUB_TOKEN with read:packages — never commit it)
@kiorex:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

### Consuming locally before anything is published (`file:`)

```
cd kiorex-contracts && npm run pack:local
# -> /Users/shall/Documents/Peraonal/Work/kiorex-v2/kiorex-contracts/dist-pack/kiorex-contracts-1.0.0.tgz
```

In another repo (adjust the relative path), either of:

```jsonc
"@kiorex/contracts": "file:../kiorex-contracts/dist-pack/kiorex-contracts-1.0.0.tgz"
// monorepo apps (e.g. kiorex-platform/apps/api): "file:../../../kiorex-contracts/dist-pack/kiorex-contracts-1.0.0.tgz"
```

then `npm install`. Re-run `pack:local` and `npm install` after contract changes. The tarball is gitignored; the version string stays
`1.0.0` until a release is cut, so reinstall with `npm install --force` if npm reports the lock as up to date.

## Develop

```
npm install
npm run generate   # events/ + flags TS + OpenAPI types (sources: scripts/event-defs.mjs, flags/catalogue.json, openapi/*.json)
npm run lint       # tsc --noEmit
npm test           # vitest: schemas, examples, HMAC vectors, flag rules, ADR-025, consumer-contract drift
npm run build      # generate + tsup (ESM + CJS + d.ts)
```

Edit event schemas **only** in `scripts/event-defs.mjs`, then `npm run generate`; CI fails if generated files are stale.
`openapi/kiorly-marketplace.v1.openapi.json` and the consumer contract are copies of Kiorly's files: change them in
clinics-management first, then re-copy and bump the version.

HMAC vectors (`test/hmac-vectors.json`) were produced by executing Kiorly's own `marketplace-hmac.ts` functions; when the sibling
repo is present the test also compares live.

## Releasing (not automated yet)

1. Update `CHANGELOG.md`, bump `package.json` version per the semver rule, tag `vX.Y.Z`.
2. Run the `publish` workflow (`workflow_dispatch`) with the tag. Publishing to GitHub Packages is immutable; the founder approves it.

Proprietary; see `LICENSE`.
