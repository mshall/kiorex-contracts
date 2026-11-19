# Changelog

Semver per contract (KX-09 §07). Additive = minor; removing/renaming a field, type string or path = major with 90-day dual support.

## 1.5.0

Additive minor (no field, type string, path or flag removed or renamed). Rev 2.3 contracts (KX-09 v2.3 §03/§04/§08, backlog item 1 of `_docs/CHANGES_2.2_to_2.3.md`; Kiorly Nurse is an edition of Kiorly Clinic, KX-23 / ADR-031, so there is no new repository, client or endpoint set). No tax-authority fields anywhere. Consumers pin 1.5.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.5.0.tgz`).

### OpenAPI `openapi/kiorly-marketplace.v1.openapi.json` 1.1.0 -> 1.2.0 (KX-09 §03)
- `GET /providers` (KX-09 §03): documented response adds optional `profession` (PHYSICIAN | DENTIST | PHYSIOTHERAPIST | NURSE, ADR-029), `edition` (CLINIC | NURSE), `serviceLocations[]` (IN_CLINIC | HOME), `coverageDistricts[]`, `verification.register`, `assignsClinician` (agencies). New `components.schemas`: `Profession`, `Edition`, `ServiceLocation`, `ProviderV23Fields`, `ProviderVerification`, `ProviderList`.
- `GET /clinics/{clinicId}/slots` (KX-09 §03): optional query `serviceLocation`, `district`, `lat`, `lng`; slots now carry `serviceLocation` + `district` (schema `Slot`); documented 404 (listing not LIVE) and **422 `OUT_OF_COVERAGE`**.
- `POST /holds` (KX-09 §03, KX-05 HVBK): request body schema `SlotHoldRequest` with optional `visitAddress {district, line1, building, floor, flat, landmark, lat, lng}` (`VisitAddress`; only `district` is required inside it; the address is mandatory in practice for HOME visit types, which the schema cannot express because visit type is looked up server-side); documented 409 `SLOT_TAKEN` and 422 `OUT_OF_COVERAGE`.
- `POST /bookings` (KX-09 §03/§08): documented **422 `OUT_OF_COVERAGE`** (zone change after hold: release the hold, show in-zone alternatives); the address is carried from the hold.
- `POST /care-plan-requests` (KX-09 §03, **P3, draft**): `marketplaceCreateCarePlanRequest`, `x-status: draft`, `x-phase: P3`, idempotent on `requestRef`, 422 when the provider offers no care plans. Not added to `consumer/kiorex-consumer-contract.json` (not required until P3 ships).
- Generated SDK types regenerated (`KiorlyMarketplaceApi`).

### Events (all `producer: kiorly-clinic`, `x-status: v2-draft`; schemas + examples + generated types; example copies in `fixtures/events-v2.3/`)
- `HOME_VISIT_ASSIGNED` (KX-09 §04, KX-23 KNKX01): assignee `displayName`, `photoUrl`, `badge`, `profession`; **phone/mobile/email forbidden**; no address.
- `HOME_VISIT_EN_ROUTE` (KX-09 §04): `enRouteAt`, optional coarse `etaMinutes`; no coordinates/address.
- `HOME_VISIT_ABORTED_UNSAFE` (KX-09 §04, KX-05 BR61): `noShow` const `false`, `depositAction` const `HOLD_FOR_REVIEW` (never auto-forfeit), category-only reason, optional `district`.
- `SAFETY_ALERT_RAISED` (KX-09 §04/§08, KX-05 HVSAF): `kind` TIMER_EXPIRED | SOS | UNSAFE_ABORT, `deliverTo` ORG_SAFETY_CONTACT | KIOREX_OPS, `deliverWithinSeconds` const 60, optional `district`; no free text.
- `CARE_PLAN_CONFIRMED` / `CARE_PLAN_ENDED` (KX-09 §04, P3 draft, Nurse edition, KX-23 KNCP): schedule with appointment IDs / end reason and counts; no clinical content.
- `ReferralIssued` (KX-09 §04, KX-05 PT04): consent token required; secure link and ids only (no diagnosis/notes).
- `MedicationOrderShared` (KX-09 §04, KX-23 KNMAR/BR57): consent token, signed `orderVersion` and `expiresAt` required; secure link only (no medicine lines).
- Across home-visit/safety/care-plan events `visitAddress`, `address`, `line1`, `lat`, `lng`, `latitude`, `longitude`, `geostamp`, `phone` are schema-forbidden (KX-09 §04, KX-08 §07 geostamp retention; analytics are district-level only). `SLOTS_CHANGED`, `COMPLETED` etc. unchanged (their optional `serviceLocation`/arrival time from KX-09 §04 remain tolerated additive fields).

### Flags (KX-08 §10 Rev 2.3, KX-23 §09, KX-05 §11): 15 new keys, catalogue now 57 entries
- `clinic.profession.physiotherapy`, `clinic.home_visits` (launch-locked, GHV1 + GHV2), `clinic.home_route_view` and `clinic.home_dispatch` (both depend on `clinic.home_visits`).
- `nurse.edition`, `nurse.individual_tenants` (dep `nurse.edition`), `nurse.care_plans` and `nurse.mar` (launch-locked, GKN1), `nurse.private_duty_shifts` (dep `nurse.edition`), `nurse.family_updates` (Integration, dep `whatsapp_reminders`), `nurse.individual_kiorex_listing` (launch-locked, GKN2, dep `kiorex.home_visits`).
- `kiorex.home_visits` (launch-locked, GHV1 + GHV2, dep `clinic.home_visits`), `kiorex.category.physiotherapy` (launch-locked, GPR1), `kiorex.category.nursing` (deps `kiorex.home_visits`, `nurse.edition`), `kiorex.visit_tracking` (dep `kiorex.home_visits`).
- `clinic.specialty_templates.<code>`: gate text extended with `physio: GPR2` (KX-05 §07). Additive catalogue fields `gateIds[]` (GHV1, GHV2, GPR1, GPR2, GKN1, GKN2, NH010) and `edition: "NURSE"` (nurse.* keys); `FlagProduct` gains `"kiorly-nurse"`; generated `FLAGS.*` constants for the new keys.
- `flags/safety-never-flags.json` (ADR-025): 4 new never-a-flag controls: `scope_of_practice_enforcement`, `profession_verification`, `home_visit_safety` (safety timer, SOS, unsafe-abort, address masking), `mar_safety_checks` (allergy/duplicate checks, doctor-order requirement).

### Tests / fixtures
- Tests: schema validity and examples for the 8 events, PHI/address/phone exclusion, BR61 no-penalty constants, 60 s safety delivery; flag catalogue vs ADR-025, per-key class/scopes/dependencies/gates, acyclic dependency graph; OpenAPI additions; drift test now asserts the pinned spec is an additive **superset** of the Kiorly OpenAPI file instead of byte-equal (see below).
- `fixtures/events-v2.3/*.json` (envelope examples) and `fixtures/marketplace-v1.2-home-visit.json` (provider sync, HOME slots, hold with address, OUT_OF_COVERAGE, care-plan request), validated in tests.

### Kiorly side must implement (NOT done here; `clinics-management/apps/api/openapi/marketplace.openapi.json` is untouched)
The Kiorly OpenAPI file still equals the 1.1.0 text. Until Kiorly implements the following and re-exports the file, `kiorly-marketplace.v1.openapi.json` is intentionally a superset of it (the drift test enforces "superset, nothing removed or changed"):
1. Provider sync: emit `profession`, `edition`, `serviceLocations[]`, `coverageDistricts[]`, `verification.register`, `assignsClinician`.
2. Slots: accept `serviceLocation`, `district`, `lat`, `lng`; return `serviceLocation` and `district` on slots; 422 `OUT_OF_COVERAGE`.
3. Holds: accept and validate `visitAddress`; require it for HOME visit types; 422 `OUT_OF_COVERAGE` on hold and on book; address carried from hold to booking, encrypted, masked after 24 h.
4. `POST /marketplace/v1/care-plan-requests` (P3).
5. Outbox emitters for the 8 events above.
When Kiorly re-exports, copy the file back over `openapi/kiorly-marketplace.v1.openapi.json` (or re-apply the diff) and the drift test can return to strict equality.

### Assumptions (documents ambiguous; narrowest additive shape chosen)
- Marketplace spec had no `components`; schemas were added as `components.schemas` and the file re-serialised (`JSON.stringify` 2-space), so the diff is larger than the semantic change. OpenAPI stays 3.0.3 (`nullable`, single-value `enum` instead of 3.1 `const`).
- Error code for "provider does not offer care plans" is not named in KX-09: `CARE_PLANS_NOT_OFFERED`. Care-plan request body (`requestRef`, `clinicId`, `clinicianId?`, `typeId?`, `preferredStartDate?`, `notes?`, `visitAddress?`, `patient`) and the ack are my minimal draft; 200 on first and replayed request.
- `OUT_OF_COVERAGE` body shape (`statusCode`, `code`, `message`, `district?`, `alternatives?[]`) is assumed; Kiorly may return only code + message.
- Event payloads: KX-09 lists only guarantees, not fields. Fields beyond those guarantees (e.g. `reasonCategory` values, `kind` values for alerts, care-plan `reason` values, `etaMinutes`, `orderVersion`) are minimal assumptions. `HOME_VISIT_ASSIGNED` carries no district. Aggregate types: `Appointment` (home-visit events), `SafetyAlert`, `CarePlan`, `Referral`, `DoctorOrder` (from KX-08 §07 entity names). `ReferralIssued` / `MedicationOrderShared` carry a secure link and ids but no clinical content (same pattern as `LabResultReleased`); receiver fetches content with the consent token.
- Status `v2-draft` for all 8 events until the producers ratify (same convention as the Lab drafts); `consumers` for ReferralIssued/MedicationOrderShared are other Kiorly tenants via Kiorex, so the envelope keeps `target: KIOREX` like other Kiorly Clinic events.
- Nurse flags use `product: "kiorly-nurse"` (KX-08 lists the product "Kiorly Nurse") but Nurse runs inside the Clinic runtime, so the control-plane snapshot `product` enum is unchanged and platform should serve `nurse.*` in the `kiorly-clinic` snapshot. The edition rule ("nurse.* evaluate only for NURSE-edition orgs", KX-08 §08) is encoded as catalogue metadata only; `evaluateFlag` is NOT changed (follow-up if platform wants it in the evaluator).
- Gate evidence ids are placeholders (`gateIds` are labels, no gate is recorded satisfied, per CLAUDE.md NEEDS_HUMAN). `clinic.profession.physiotherapy` is a plain Module flag as in KX-08; the physio template launch lock (GPR2) lives on the existing `clinic.specialty_templates.<code>` pattern key.
- `package-lock.json` version string (stale at 1.3.0) not touched.

## 1.4.1

Patch (loosening, additive). Record-share events (`VISIT_SUMMARY_SHARED`, `PRESCRIPTION_SHARED`, `RECORD_SHARE_REVOKED`) now also accept `aggregateType: "Record"` (the vault-record naming used by Kiorex tooling); Kiorly Clinic keeps emitting `Encounter` / `Patient`, which stay the canonical values.

## 1.4.0

Additive minor (no field removed or renamed). Reconciliation of Kiorex <-> Kiorly Pharmacy / Kiorly Lab against the RUNNING services (first real HTTP integration; before this only fake partner servers existed).

- **Partner addressing (resolves NH-PH-024).** There is NO `X-Kiorex-Org-Id` header. The partner integration **client key** (`X-Kiorly-Client-Key`, already part of the request scheme) is bound to exactly one partner organisation on the partner side, so the HMAC credentials address the tenant; the branch/lab is addressed by id in the path/body (`pharmacyId` = branch id, `labId`).
- **Webhook scheme extension.** `WEBHOOK_HEADERS.clientKey` / `signWebhook({ clientKey })`: partners add `X-Kiorly-Client-Key` to outbox events so Kiorex picks the per-partner webhook secret (Kiorly Clinic keeps the single global secret and does not send it).
- **Constants.** `PARTNER_API_PATH` (`/marketplace/v1` for pharmacy, `/api/v1/integration/v1` for lab), `PARTNER_WEBHOOK_PATH` (`/api/v1/webhooks/pharmacy|lab` on Kiorex), `PARTNER_DEV_DEFAULTS` (dev keys, local only).
- **OpenAPI** `openapi/kiorly-pharmacy.v1.openapi.json` (new, draft): `GET /pharmacies`, `GET /catalogue`, `POST /catalogue/quote`, `POST /orders` (idempotent on orderId), `POST /prescriptions/validate`, `POST /orders/{orderId}/cancel`, `GET /availability`. `openapi/kiorly-lab.v1.openapi.json` 0.2.0: `GET /labs`, `GET /tests`, `POST /tests/quote`, `GET /labs/{labId}/slots`. `openapi/kiorex-webhooks.v1.openapi.json` 1.1.0: `POST /webhooks/pharmacy`, `POST /webhooks/lab`.
- Events: no schema change. `OrderReady`/`DispenseCompleted`/`OrderRejected`/`LabResultReleased` stay `v2-draft` until the owners ratify (NEEDS_HUMAN #23).

## 1.3.0

Additive minor (no field removed or renamed). Kiorly Lab draft contracts (kiorly-lab NH-LB-025), all `x-status: v2-draft` / `draft`.

- **Events** (producer `kiorly-lab`, mirroring its outbox emitters; envelope `target: KIOREX`): `LabOrderCreated`, `LabOrderStatusChanged`,
  `LabCriticalEscalated`, `LabReportCorrected`, `LabInvoiceIssued`, `LabPaymentRecorded`. Ids, statuses and amounts only; never result
  values (`values`/`results` are forbidden on the critical and report events). Money in these two events is a decimal in major units
  (that is what Kiorly Lab emits today), unlike Kiorex's integer minor units.
- **OpenAPI** `openapi/kiorly-lab.v1.openapi.json` (`x-status: draft`): inbound `POST /integration/v1/orders` (`labCreateOrder`, idempotent on
  `sourceRef`), plus `GET /integration/v1/orders/{sourceRef}`, `POST .../cancel`, `GET /integration/v1/reports/{reportId}/pdf`. Same HMAC
  scheme as the marketplace API. Not frozen until NH-LB-023 is approved.
- Examples for `kiorly-lab` events now include `target: "KIOREX"` (as Kiorly Lab sends); `LabResultReleased` is unchanged.
- Kiorly Pharmacy: not checked in this release (no emitters yet).

## 1.2.0

Additive minor (no field removed or renamed). Kiorex Passport (kiorex-account) identity work KA-06/08/09/10/11.

- **Events** (producer `kiorex-account`, status `v2-draft`): `guardian.link.changed` (KA06), `membership.changed` (KA09),
  `account.merged` (KA08). Identifiers and relationship facts only, no clinical data (ADR-013).
- **Access-token claims** (documented here because they are the identity contract; no schema file exists for tokens). All additive,
  all optional, none clinical: `acr` (`urn:kiorex:acr:basic` | `urn:kiorex:acr:mfa`) and `amr` (RFC 8176 values plus `totp`, `fed`)
  and `auth_time` as the step-up signal (KA10); `kx_orgs: [{org_id, role_hint}]` only when scope `kx_org` is requested (KA09);
  `act: {sub}` (RFC 8693 actor) on guardian acting-as tokens where `sub` is the dependant and `scope` is a subset of
  `dependant:profile dependant:booking dependant:consent` (KA06). Products must keep ignoring unknown claims.
- OpenAPI: no change. Flags: no change in the catalogue (`account.provider_sso` is a kiorex-account IdP flag, registered by the control plane later).

## 1.1.0

Additive minor (no field removed or renamed).

- **Marketplace OpenAPI** (also in clinics-management `apps/api/openapi`, kept identical): `GET /analytics/slot-capacity`
  (`marketplaceSlotCapacity`, HMAC, counts of open marketplace slots per clinician per clinic-local day, for Kiorex liquidity
  "slots/day"); waitlist: `POST /waitlist` (`marketplaceJoinWaitlist`, idempotent on `externalRef`), `GET|DELETE /waitlist/{externalRef}`
  (`marketplaceGetWaitlist`, `marketplaceLeaveWaitlist`), `POST /waitlist/offers/{offerId}/accept|decline`
  (`marketplaceAcceptWaitlistOffer`, `marketplaceDeclineWaitlistOffer`). Added to the consumer contract.
- **Events**: new `WAITLIST_OFFER` (Kiorly -> Kiorex; a cancelled slot offered to a Kiorex-sourced waitlist entry) and
  `LabOrderPlaced` (Kiorly Clinic -> Kiorly Lab via Kiorex, KCV204, consent token required).
  `PrescriptionIssued` now has a producer (KCV203): status `v2-draft` -> `emitted`; optional `aggregateType/aggregateId` added
  to `data`; Kiorly sends `quantity: 1` per item (no pack count in the clinic Rx).
- `PRESCRIPTION_SHARED` gains an optional `pdf: { url, expiresAt }` (signed expiring link to the Rx PDF, KX-11 "Rx PDF").
- Flags: no change.

## 1.0.0

Initial release (NH-019, KX-09 §07). Contents: Kiorly marketplace OpenAPI + Kiorex consumer contract (copied unchanged from
clinics-management `apps/api/openapi/`), control-plane and webhook OpenAPI, event JSON Schemas, flag catalogue, HMAC helpers,
`validateEvent`, `evaluateFlag`.

### Where Kiorly's code differs from KX-09 (the code wins; schemas follow the code)

1. **Webhook signature scheme.** KX-09 §02 and INTEGRATION.md say `X-Kiorly-Signature` is an HMAC "over the body". Kiorly's
   `OutboxDeliveryService` actually sends `X-Kiorly-Timestamp` (unix seconds), `X-Kiorly-Event`, `X-Kiorly-Event-Id` and
   `X-Kiorly-Signature: sha256=<hex>` where hex = HMAC-SHA256(secret, `${timestamp}.${rawBody}`). `signWebhook`/`verifyWebhook`
   implement this. (The *request* scheme Kiorex -> Kiorly matches KX-09 exactly.) Kiorex's receiver must verify with
   `verifyWebhook`, not a body-only HMAC.
2. **Envelope.** Kiorly's body is `{eventId,type,aggregateType,aggregateId,target,occurredAt,data}`; it includes `target` ("KIOREX")
   which KX-09 omits. `eventId` is the outbox row id (cuid), not a ULID. `data` also repeats `aggregateType`/`aggregateId`.
3. **Reschedule type string.** KX-09 calls it `APPOINTMENT_RESCHEDULED`; Kiorly emits `RESCHEDULED`. Schema accepts both
   (`validateEvent` aliases); producers should keep emitting `RESCHEDULED` until a major version changes it.
4. **Appointment payload.** KX-09's example shows `externalReference, clinicId, clinicianId, startsAt, endsAt, bookingSource,
   isNewPatientAtBooking, version`. Kiorly emits `appointmentId, clinicId, previousStatus, nextStatus, bookingSource` (+ metadata:
   `externalReference`, `cancelledBy`, `cancellationReason`, `depositRefundable`, `source`). `clinicianId`, `startsAt`, `endsAt`,
   `isNewPatientAtBooking`, `version` are NOT emitted today and are declared optional. Only `RESCHEDULED` carries `startsAt`.
5. **Cancellation metadata is not universal.** KX-09 says CANCELLED_* "carries reason and depositRefundable". Kiorly attaches
   `cancelledBy/cancellationReason/depositRefundable` for clinic cancellations (staff status change, system confirm-timeout) and for
   marketplace patient cancellations, but the staff "cancel" path (appointments.service cancel) and some patient paths emit none.
   Fields are optional; Kiorex must fall back to its own policy when `depositRefundable` is absent.
   `CANCELLED_BY_CLINIC` can also be `cancelledBy: "SYSTEM"` (marketplace confirm timeout).
6. **Aggregates.** `SLOTS_CHANGED` uses aggregateType `Clinic`, aggregateId = clinicianId. `COMMISSION_CHARGE_*` use aggregateType
   `Appointment`, aggregateId = appointmentId (inferred by the outbox helper), not the charge id. `PROVIDER_PROFILE_UPDATED` is
   aggregateType `MarketplaceListing`.
7. **Events emitted by Kiorly but absent from KX-09 §04** (schemas added, `x-status: kiorly-extra`): `MARKETPLACE_BOOKING_CONFIRM_TIMEOUT`,
   `VISIT_SUMMARY_SHARED`, `PRESCRIPTION_SHARED`, `RECORD_SHARE_REVOKED`.
8. **v2 events have no producer yet** (`x-status: v2-draft`): `PrescriptionIssued`, `OrderReady`, `DispenseCompleted`,
   `OrderRejected`, `LabResultReleased`, `subject.deleted`, `session.revoked`, `flag.changed`. Their payloads are designed from
   KX-06/07/04/08 requirements (KPRX01/06, KPMKT05, KLCRIT03, KA05/07) and are the part most likely to need a minor bump once built.
9. **Marketplace spec paths.** The OpenAPI server base is `/marketplace/v1` and that is also the deployed URL: Kiorly excludes it from the
   Nest global prefix (`/marketplace/v1/...`, NOT `/api/v1/marketplace/v1`). HMAC signing uses the path as requested (`/marketplace/v1/...`).

### Decisions made where documents were silent (needs human confirmation)
- Control-plane request auth reuses the marketplace canonical string but identifies the product with `X-Kiorex-Product-Key` and does
  not send the secret as a header. INTEGRATION.md says only "same scheme as marketplace HMAC".
- `flag.changed` push is signed with the webhook scheme (item 1). Snapshot `signature` = base64url HMAC-SHA256 over sorted-key JSON of
  the snapshot without `signature` (`signSnapshot`/`verifySnapshot`).
- PSP webhook: a normalised body + `sandbox-fake` signature are defined; real Paymob/Fawry/InstaPay payloads are adapter-owned.
- Plan entitlement (rule 4) is not in the snapshot; `evaluateFlag` accepts `ctx.entitled` supplied by `@RequiresEntitlement`.
