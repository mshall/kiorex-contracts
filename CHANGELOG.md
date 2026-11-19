# Changelog

Semver per contract (KX-09 §07). Additive = minor; removing/renaming a field, type string or path = major with 90-day dual support.

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
