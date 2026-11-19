# Changelog

Semver per contract (KX-09 §07). Additive = minor; removing/renaming a field, type string or path = major with 90-day dual support.

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
9. **Marketplace spec paths.** The OpenAPI server base is `/marketplace/v1`; the deployed URL also has the Nest global prefix
   (`/api/v1/marketplace/v1/...`). HMAC signing uses the full path including `/api/v1`.
10. **Marketplace OpenAPI** contains `/patients/{id}/consents`, not listed in the consumer contract or KX-09 §03 (left untouched).

### Decisions made where documents were silent (needs human confirmation)
- Control-plane request auth reuses the marketplace canonical string but identifies the product with `X-Kiorex-Product-Key` and does
  not send the secret as a header. INTEGRATION.md says only "same scheme as marketplace HMAC".
- `flag.changed` push is signed with the webhook scheme (item 1). Snapshot `signature` = base64url HMAC-SHA256 over sorted-key JSON of
  the snapshot without `signature` (`signSnapshot`/`verifySnapshot`).
- PSP webhook: a normalised body + `sandbox-fake` signature are defined; real Paymob/Fawry/InstaPay payloads are adapter-owned.
- Plan entitlement (rule 4) is not in the snapshot; `evaluateFlag` accepts `ctx.entitled` supplied by `@RequiresEntitlement`.
