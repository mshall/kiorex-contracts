// Source of truth for events/*.schema.json and events/examples/*.example.json.
// Run `npm run generate` after editing. Payload fields mirror what Kiorly Clinic emits today
// (clinics-management/apps/api/src/messaging/*, marketplace/*, kiorex/*); where KX-09 differs, the code wins (see CHANGELOG).

const S = { type: "string" };
const ID = { type: "string", minLength: 1 };
const TS = { type: "string", format: "date-time" };
const NSTR = { type: ["string", "null"] };
const APPT_STATUS = { enum: ["SCHEDULED", "CONFIRMED", "CHECKED_IN", "COMPLETED", "CANCELLED", "NO_SHOW"] };
const BOOKING_SOURCE = {
  enum: ["FRONT_DESK", "PHONE", "WALK_IN", "CLINIC_LINK", "KIOREX_MARKETPLACE", "KIOREX_WHATSAPP", "INTEGRATION", "IMPORT"],
};
const LISTING_STATUS = { enum: ["DRAFT", "PENDING_VERIFICATION", "LIVE", "PAUSED"] };
const LAB_SOURCE = { enum: ["KIOREX_BOOKING", "KIORLY_CLINIC"] };
// 1.6.0: Kiorly Nurse is an EDITION of Kiorly Clinic (ADR-031), so nurse-collected orders keep source KIORLY_CLINIC and add this optional marker.
const LAB_ORIGIN_EDITION = { enum: ["NURSE"], description: "Present when the order was collected by Kiorly Nurse (KIORLY_NURSE inbound client); source stays KIORLY_CLINIC (ADR-031). Additive in 1.6.0." };
const ORIGIN_EDITION = { enum: ["CLINIC", "NURSE"], description: "Edition that produced the hand-off (ADR-031). Additive in 1.6.0." };
const LAB_ORDER_STATUS = { enum: ["DRAFT", "AWAITING_COLLECTION", "COLLECTED", "IN_LAB", "PARTIALLY_RESULTED", "AWAITING_VALIDATION", "VALIDATED", "RELEASED", "CANCELLED"] };
const PROFESSION = { enum: ["PHYSICIAN", "DENTIST", "PHYSIOTHERAPIST", "NURSE"], description: "ADR-029. Market packs may extend the list in a later additive minor." };
const SERVICE_LOCATION = { enum: ["IN_CLINIC", "HOME"] };
// Rev 2.3: addresses, coordinates and phone numbers never travel in home-visit/safety/care-plan events (KX-09 §04, KX-08 §07 geostamp retention, ADR-013).
const NO_LOCATION = { visitAddress: false, address: false, line1: false, lat: false, lng: false, latitude: false, longitude: false, geostamp: false, phone: false };
// 1.10.0 growth engine (additive). Commission-relevant origin of a booking (ARCH section 6.1); see src/growth.ts.
const ACQ_ORIGIN = { enum: ["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED"], description: "Commission-relevant acquisition origin decided by the Kiorex attribution function (additive in 1.10.0). Absent = UNATTRIBUTED and today's rules apply." };
const ACQ_DECISION_REF = { type: "string", minLength: 1, description: "Id of the Kiorex AttributionDecision (or the Clinic CommissionDecision) that explains the outcome. Additive in 1.10.0." };
const LINK_ORG_REF = { type: "string", minLength: 1, description: "Organisation (tenant) reference that owns the link code; the same value the signed `lt` carries as `o`. Additive in 1.11.0 on ReferralLinkCreated (optional there); required on ReferralLinkRevoked." };
const ACQ_POLICY_VERSION = { type: "string", minLength: 1, maxLength: 64, description: "Version id of the ATTRIBUTION_POLICY config that was ACTIVE at decision time. Additive in 1.10.0." };
// 1.12.0 (additive). Product discriminator for the partner link registry and acquisition facts (Phase 4). Absent = CLINIC.
const PRODUCT = { enum: ["CLINIC", "PHARMACY", "LAB", "NURSE"], description: "Product the link or fact belongs to. Absent means CLINIC (1.11.0 behaviour). Additive in 1.12.0." };
const REASON_CODE = { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,63}$" };
const MARKET = { type: "string", pattern: "^[A-Z]{2}$" };
const CAMPAIGN_STATUS = { enum: ["DRAFT", "PENDING_APPROVAL", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] };
const AGG = {
  aggregateType: { type: "string", description: "Injected by the Kiorly outbox; mirrors the envelope field." },
  aggregateId: { type: "string", description: "Injected by the Kiorly outbox; mirrors the envelope field." },
};

const apptBase = (nextStatus, extra = {}, required = []) => ({
  properties: {
    appointmentId: ID,
    clinicId: ID,
    previousStatus: APPT_STATUS,
    nextStatus: nextStatus ? { const: nextStatus } : APPT_STATUS,
    bookingSource: BOOKING_SOURCE,
    externalReference: { ...NSTR, description: "Kiorex booking reference (kx_bk_...) for marketplace bookings." },
    source: { type: "string", description: "e.g. waitlist_autofill" },
    // KX-09 §04 fields not emitted by Kiorly today (kept optional so producers may add them additively):
    clinicianId: { type: "string" },
    startsAt: TS,
    endsAt: TS,
    isNewPatientAtBooking: { type: "boolean" },
    version: { type: "integer", minimum: 0 },
    acquisitionOrigin: ACQ_ORIGIN,
    ...AGG,
    ...extra,
  },
  required: ["appointmentId", "clinicId", "previousStatus", "nextStatus", "bookingSource", ...required],
});

const apptExample = (next, prev, extra = {}) => ({
  appointmentId: "apt_01JF3Z8Q0K",
  clinicId: "clinic_01JF3Z7ZZZ",
  previousStatus: prev,
  nextStatus: next,
  bookingSource: "KIOREX_MARKETPLACE",
  externalReference: "kx_bk_01JF3Z8P2M",
  aggregateType: "Appointment",
  aggregateId: "apt_01JF3Z8Q0K",
  ...extra,
});

const cancelProps = (by) => ({
  cancelledBy: { enum: by },
  cancellationReason: { ...NSTR, description: "Shown to the patient. Required (min 3 chars) by Kiorly for clinic cancellations of Kiorex bookings." },
  depositRefundable: { type: ["boolean", "null"], description: "Kiorex Pay refunds automatically when true (KXMPAY02)." },
});

const chargeProps = {
  chargeId: ID,
  appointmentId: ID,
  amount: { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal string, 2 dp." },
  currency: { type: "string", minLength: 3, maxLength: 3 },
  status: { enum: ["PENDING", "CONFIRMED", "DISPUTED", "REVERSED", "WAIVED", "BILLED"] },
  attendedAt: TS,
  // 1.10.0 (additive): why the charge exists, from the append-only CommissionDecision (CommissionAttributed in the founder's naming).
  decisionRef: ACQ_DECISION_REF,
  origin: ACQ_ORIGIN,
  policyVersion: ACQ_POLICY_VERSION,
  // 1.12.0 (additive, Rev 2.6): reproducible fee basis. A provider-sponsored discount never changes chargeability or attribution.
  feeBasisMinor: { type: "integer", minimum: 0, description: "Fee the Kiorex fee was computed on, before any sponsored discount (additive, 1.12.0; policy SPONSORED_PROMOTION_POLICY.commissionBasis)." },
  sponsoredDiscountMinor: { type: "integer", minimum: 0, description: "Provider-sponsored discount on the booking, informational (additive, 1.12.0)." },
  basisPolicyVersion: { type: "string", minLength: 1, maxLength: 64, description: "Version id of the policy that fixed the basis (additive, 1.12.0)." },
};

/** Each def: type, aliases?, producer, aggregateType, status ('emitted'|'v2-draft'|'kiorly-extra'), description, data schema, example (data + aggregateId), kxNote? */
export const EVENTS = [
  {
    type: "APPOINTMENT_CONFIRMED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Appointment became CONFIRMED (auto-confirm, staff confirm, WhatsApp confirm, waitlist autofill). Ordered per appointment aggregate.",
    data: apptBase("CONFIRMED"),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("CONFIRMED", "SCHEDULED") },
  },
  {
    type: "RESCHEDULED", aliases: ["APPOINTMENT_RESCHEDULED"], file: "APPOINTMENT_RESCHEDULED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Appointment start time changed. Kiorly emits the type string RESCHEDULED (KX-09 names it APPOINTMENT_RESCHEDULED; both are accepted by validateEvent).",
    data: {
      properties: { appointmentId: ID, clinicId: ID, startsAt: TS, ...AGG, endsAt: TS, externalReference: NSTR },
      required: ["appointmentId", "clinicId", "startsAt"],
    },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { appointmentId: "apt_01JF3Z8Q0K", clinicId: "clinic_01JF3Z7ZZZ", startsAt: "2027-03-05T10:30:00.000Z", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "CANCELLED_BY_CLINIC", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Appointment CANCELLED by clinic staff or by the system (e.g. MARKETPLACE_BOOKING_CONFIRM_TIMEOUT; cancelledBy=SYSTEM). Reason/refund metadata are present for clinic-initiated cancellations.",
    data: apptBase("CANCELLED", cancelProps(["CLINIC", "SYSTEM"])),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("CANCELLED", "CONFIRMED", { cancelledBy: "CLINIC", cancellationReason: "Doctor unavailable", depositRefundable: true }) },
  },
  {
    type: "CANCELLED_BY_PATIENT", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Appointment CANCELLED by the patient (Kiorex or Kiorly). depositRefundable reflects the cancellation-window policy.",
    data: apptBase("CANCELLED", cancelProps(["PATIENT"])),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("CANCELLED", "CONFIRMED", { cancelledBy: "PATIENT", cancellationReason: "Cannot attend", depositRefundable: false }) },
  },
  {
    type: "CHECKED_IN", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Patient checked in at the clinic. Drives commission charge PENDING (Kiorly-side).",
    data: apptBase("CHECKED_IN"),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("CHECKED_IN", "CONFIRMED") },
  },
  {
    type: "CHECK_IN_REVERTED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Check-in undone (previous status CHECKED_IN, next status neither CHECKED_IN nor COMPLETED).",
    data: (() => {
      const d = apptBase(null);
      d.properties.previousStatus = { const: "CHECKED_IN" };
      d.properties.nextStatus = { enum: ["SCHEDULED", "CONFIRMED", "CANCELLED", "NO_SHOW"] };
      return d;
    })(),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("CONFIRMED", "CHECKED_IN") },
  },
  {
    type: "COMPLETED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Visit completed. Drives commission confirmation and review eligibility.",
    data: apptBase("COMPLETED"),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("COMPLETED", "CHECKED_IN") },
  },
  {
    type: "NO_SHOW", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Patient did not attend. Kiorex forfeits the deposit per policy.",
    data: apptBase("NO_SHOW"),
    example: { aggregateId: "apt_01JF3Z8Q0K", data: apptExample("NO_SHOW", "CONFIRMED") },
  },
  {
    type: "SLOTS_CHANGED", producer: "kiorly-clinic", aggregateType: "Clinic", status: "emitted",
    description: "Slot availability changed for a clinician. Cache invalidation only. Kiorly sets aggregateType=Clinic and aggregateId=clinicianId.",
    data: { properties: { clinicId: ID, clinicianId: ID, reason: S, at: TS, ...AGG }, required: ["clinicId", "clinicianId", "reason", "at"] },
    example: { aggregateType: "Clinic", aggregateId: "clin_01JF3Z7AAA", data: { clinicId: "clinic_01JF3Z7ZZZ", clinicianId: "clin_01JF3Z7AAA", reason: "appointment_created", at: "2027-03-04T09:12:44.000Z" } },
  },
  {
    type: "PROVIDER_PROFILE_UPDATED", producer: "kiorly-clinic", aggregateType: "MarketplaceListing", status: "emitted",
    description: "Published provider profile changed. Kiorex reindexes search.",
    data: {
      properties: {
        listingId: ID, clinicId: ID, clinicianId: ID, status: LISTING_STATUS,
        completenessPercent: { type: "number", minimum: 0, maximum: 100 }, updatedAt: TS,
        provider: { type: "object", description: "Published provider profile (see provider-profile-schema in Kiorly)." },
        clinic: { type: "object", description: "Published clinic profile." },
        widgetOrigins: { type: "array", maxItems: 10, uniqueItems: true, items: { type: "string", pattern: "^https://[a-z0-9.-]+(:[0-9]{1,5})?$", maxLength: 255 }, description: "Exact https origins the organisation allows to embed the Kiorex booking widget (no wildcard, at most 10). Additive in 1.10.0; absent = none." }, ...AGG,
      },
      required: ["listingId", "clinicId", "clinicianId", "status", "completenessPercent", "updatedAt", "provider", "clinic"],
    },
    example: { aggregateId: "lst_01JF3Z7BBB", data: { listingId: "lst_01JF3Z7BBB", clinicId: "clinic_01JF3Z7ZZZ", clinicianId: "clin_01JF3Z7AAA", status: "LIVE", completenessPercent: 92, updatedAt: "2027-03-04T09:00:00.000Z", provider: { displayName: "Dr. Amira Hassan" }, clinic: { name: "Nile Clinic" }, aggregateType: "MarketplaceListing", aggregateId: "lst_01JF3Z7BBB" } },
  },
  {
    type: "LISTING_STATUS_CHANGED", producer: "kiorly-clinic", aggregateType: "MarketplaceListing", status: "emitted",
    description: "Listing moved between DRAFT / PENDING_VERIFICATION / LIVE / PAUSED. Kiorex hides listings that are not LIVE.",
    data: { properties: { listingId: ID, clinicId: ID, clinicianId: ID, previousStatus: LISTING_STATUS, nextStatus: LISTING_STATUS, ...AGG }, required: ["listingId", "clinicId", "clinicianId", "previousStatus", "nextStatus"] },
    example: { aggregateId: "lst_01JF3Z7BBB", data: { listingId: "lst_01JF3Z7BBB", clinicId: "clinic_01JF3Z7ZZZ", clinicianId: "clin_01JF3Z7AAA", previousStatus: "LIVE", nextStatus: "PAUSED", aggregateType: "MarketplaceListing", aggregateId: "lst_01JF3Z7BBB" } },
  },
  {
    type: "COMMISSION_CHARGE_CREATED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Commission charge created for an attended Kiorex-channel visit. Reporting only (Kiorly decides attendance). Aggregate is the appointment (unique per appointment).",
    data: { properties: { ...chargeProps, ...AGG }, required: ["chargeId", "appointmentId", "amount", "currency", "status", "attendedAt"] },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { chargeId: "chg_01JF3Z9AAA", appointmentId: "apt_01JF3Z8Q0K", amount: "75.00", currency: "EGP", status: "PENDING", attendedAt: "2027-03-05T10:45:00.000Z", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "COMMISSION_CHARGE_REVERSED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Commission charge reversed (check-in reverted, dispute upheld, etc.).",
    data: { properties: { ...chargeProps, reason: S, ...AGG }, required: ["chargeId", "appointmentId", "amount", "currency", "status", "attendedAt", "reason"] },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { chargeId: "chg_01JF3Z9AAA", appointmentId: "apt_01JF3Z8Q0K", amount: "75.00", currency: "EGP", status: "REVERSED", attendedAt: "2027-03-05T10:45:00.000Z", reason: "check_in_reverted", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "REVIEW_INVITATION_ELIGIBLE", producer: "kiorly-clinic", aggregateType: "Appointment", status: "emitted",
    description: "Completed Kiorex-channel visit is eligible for a verified-review invitation.",
    data: { properties: { appointmentId: ID, clinicId: ID, bookingSource: BOOKING_SOURCE, ...AGG }, required: ["appointmentId", "clinicId", "bookingSource"] },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { appointmentId: "apt_01JF3Z8Q0K", clinicId: "clinic_01JF3Z7ZZZ", bookingSource: "KIOREX_MARKETPLACE", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "REVIEW_REPLY_POSTED", producer: "kiorly-clinic", aggregateType: "KiorexReview", status: "emitted",
    description: "Clinic replied to a verified review.",
    data: { properties: { kiorexReviewId: ID, clinicId: ID, replyText: S, repliedAt: TS, ...AGG }, required: ["kiorexReviewId", "clinicId", "replyText", "repliedAt"] },
    example: { aggregateId: "rv_01JF3ZAAAA", data: { kiorexReviewId: "kx_rv_01JF3ZABCD", clinicId: "clinic_01JF3Z7ZZZ", replyText: "Thank you for your feedback.", repliedAt: "2027-03-08T12:00:00.000Z", aggregateType: "KiorexReview", aggregateId: "rv_01JF3ZAAAA" } },
  },
  // ---- Emitted by Kiorly today but absent from KX-09 §04 ----
  {
    type: "MARKETPLACE_BOOKING_CONFIRM_TIMEOUT", producer: "kiorly-clinic", aggregateType: "Appointment", status: "kiorly-extra",
    description: "A PENDING marketplace booking was not confirmed by the clinic in time and was auto-cancelled (KXMBK06). Emitted in addition to CANCELLED_BY_CLINIC. Not in KX-09 §04.",
    data: { properties: { appointmentId: ID, clinicId: ID, externalReference: NSTR, platformIntegrationClientId: { type: ["string", "null"] }, ...AGG }, required: ["appointmentId", "clinicId"] },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { appointmentId: "apt_01JF3Z8Q0K", clinicId: "clinic_01JF3Z7ZZZ", externalReference: "kx_bk_01JF3Z8P2M", platformIntegrationClientId: "pic_01", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "VISIT_SUMMARY_SHARED", producer: "kiorly-clinic", aggregateType: "Encounter", aggregateTypeAlt: ["Record"], status: "kiorly-extra",
    description: "Signed visit summary pushed to the Kiorex record vault after patient consent (KX-11). Not in KX-09 §04. Contains clinical content: never log it.",
    data: {
      properties: {
        patientId: ID, scope: { const: "VISIT_SUMMARY" },
        summary: { type: "object", properties: { encounterId: ID, clinicId: ID, signedAt: TS, soap: { type: "object", properties: { chiefComplaint: NSTR, subjective: NSTR, objective: NSTR, assessment: NSTR, plan: NSTR } } }, required: ["encounterId", "clinicId", "signedAt", "soap"] },
        signature: { type: "string", description: "hex HMAC-SHA256 over JSON.stringify(summary) with KIOREX_RECORD_SHARE_HMAC_SECRET." },
        followUp: { type: "object", description: "Optional follow-up hint (additive, 1.12.0), beside `summary` so the signature over `summary` is unchanged. The interval only; never a diagnosis.", properties: { intervalDays: { type: "integer", minimum: 1, maximum: 730 } }, required: ["intervalDays"] }, ...AGG,
      },
      required: ["patientId", "scope", "summary", "signature"],
    },
    example: { aggregateId: "enc_01JF3ZB000", data: { patientId: "pat_01JF3Z0000", scope: "VISIT_SUMMARY", summary: { encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", signedAt: "2027-03-05T11:10:00.000Z", soap: { chiefComplaint: "Cough", subjective: null, objective: null, assessment: null, plan: null } }, signature: "0".repeat(64), aggregateType: "Encounter", aggregateId: "enc_01JF3ZB000" } },
  },
  {
    type: "PRESCRIPTION_SHARED", producer: "kiorly-clinic", aggregateType: "Encounter", aggregateTypeAlt: ["Record"], status: "kiorly-extra",
    description: "Prescription of a signed encounter shared with the patient app after consent. Not in KX-09 §04.",
    data: { properties: { patientId: ID, scope: { const: "PRESCRIPTIONS" }, encounterId: ID, clinicId: ID, signedAt: TS, items: { type: "array", maxItems: 50, description: "Optional structured Rx lines (additive, 1.12.0); the signed PDF stays the legal document.", items: { type: "object", properties: { name: { type: "string", maxLength: 200 }, dose: { type: "string", maxLength: 100 }, frequency: { type: "string", maxLength: 100 }, durationDays: { type: "integer", minimum: 1, maximum: 3650 } }, required: ["name"] } }, pdf: { type: "object", description: "Signed expiring public link to the Rx PDF (additive, 1.1.0); fetch it into the patient vault before expiresAt.", properties: { url: { type: "string", format: "uri" }, expiresAt: TS }, required: ["url", "expiresAt"] }, ...AGG }, required: ["patientId", "scope", "encounterId", "clinicId", "signedAt"] },
    example: { aggregateId: "enc_01JF3ZB000", data: { patientId: "pat_01JF3Z0000", scope: "PRESCRIPTIONS", encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", signedAt: "2027-03-05T11:10:00.000Z", pdf: { url: "https://app.kiorly.com/api/v1/public/rx/verify/abc123/pdf", expiresAt: "2027-03-19T11:10:00.000Z" }, aggregateType: "Encounter", aggregateId: "enc_01JF3ZB000" } },
  },
  {
    type: "RECORD_SHARE_REVOKED", producer: "kiorly-clinic", aggregateType: "Patient", aggregateTypeAlt: ["Record"], status: "kiorly-extra",
    description: "Patient revoked a record-share scope; Kiorex must delete the shared copies. Not in KX-09 §04.",
    data: { properties: { patientId: ID, scope: { enum: ["VISIT_SUMMARY", "PRESCRIPTIONS", "LAB_RESULTS", "SHARE_WITH_OTHER_CLINICS"] }, action: { const: "DELETE_REQUESTED" }, ...AGG }, required: ["patientId", "scope", "action"] },
    example: { aggregateId: "pat_01JF3Z0000", data: { patientId: "pat_01JF3Z0000", scope: "VISIT_SUMMARY", action: "DELETE_REQUESTED", aggregateType: "Patient", aggregateId: "pat_01JF3Z0000" } },
  },
  {
    type: "WAITLIST_OFFER", producer: "kiorly-clinic", aggregateType: "WaitlistOffer", status: "emitted",
    description: "A slot opened (cancellation) and Kiorly's FS-03 auto-fill offers it to a Kiorex-sourced waitlist entry. Kiorex notifies the patient, who accepts/declines via POST /waitlist/offers/{offerId}/accept|decline before expiresAt. Additive in 1.1.0.",
    data: {
      properties: {
        offerId: ID, waitlistRef: { type: "string", description: "The externalRef the patient joined with." }, clinicId: ID, clinicianId: ID, typeId: ID,
        startsAt: TS, endsAt: TS, expiresAt: TS, feeAmount: { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal string." }, ...AGG,
      },
      required: ["offerId", "waitlistRef", "clinicId", "clinicianId", "startsAt", "expiresAt"],
    },
    example: { aggregateId: "wlo_01JF3ZG000", data: { offerId: "wlo_01JF3ZG000", waitlistRef: "kx_wl_01JF3ZG111", clinicId: "clinic_01JF3Z7ZZZ", clinicianId: "clin_01JF3Z7AAA", typeId: "type_01JF3Z8000", startsAt: "2027-03-06T09:00:00.000Z", endsAt: "2027-03-06T09:30:00.000Z", expiresAt: "2027-03-05T14:15:00.000Z", feeAmount: "300.00", aggregateType: "WaitlistOffer", aggregateId: "wlo_01JF3ZG000" } },
  },
  // ---- v2 events (not yet emitted by any product; drafts for Pharmacy M9 / Lab M15) ----
  {
    type: "PrescriptionIssued", producer: "kiorly-clinic", aggregateType: "Prescription", status: "emitted",
    description: "Kiorly Clinic issued an e-prescription for hand-off to Kiorly Pharmacy via Kiorex. A patient consent token is required (KPRX01). Emitted by Kiorly Clinic (KCV203, clinic.eprescription_handoff) when staff hand off a signed Rx; one event per encounter (prescriptionId = encounterId). Kiorly has no pack count, so item quantity is 1 and Pharmacy confirms at dispensing.",
    data: {
      properties: {
        prescriptionId: ID, encounterId: ID, clinicId: ID, patientRef: { type: "string", description: "Kiorex subject or Kiorly patient reference; never a national ID." },
        prescriberId: ID, consentToken: { type: "string", minLength: 1, description: "Opaque token derived from the patient's active PRESCRIPTIONS record-share grant (rsc_...)." }, issuedAt: TS, ...AGG,
        items: { type: "array", minItems: 1, items: { type: "object", properties: { activeIngredient: S, drugName: S, strength: S, dose: S, quantity: { type: "number", exclusiveMinimum: 0 }, controlled: { type: "boolean" } }, required: ["activeIngredient", "quantity"] } },
      },
      required: ["prescriptionId", "clinicId", "patientRef", "prescriberId", "consentToken", "issuedAt", "items"],
    },
    example: { aggregateId: "rx_01JF3ZC000", data: { prescriptionId: "rx_01JF3ZC000", encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", patientRef: "sub_01JF3Z0001", prescriberId: "clin_01JF3Z7AAA", consentToken: "ct_01JF3ZC111", issuedAt: "2027-03-05T11:12:00.000Z", items: [{ activeIngredient: "amoxicillin", strength: "500 mg", quantity: 21 }] } },
  },
  {
    type: "LabOrderPlaced", producer: "kiorly-clinic", aggregateType: "LabOrder", status: "emitted",
    description: "Kiorly Clinic handed a lab order to Kiorly Lab via Kiorex (KCV204, clinic.lab_order_handoff). A patient consent token (LAB_RESULTS record-share grant) is required. One event per order. Additive in 1.1.0; 1.6.0 adds the optional Nurse-edition fields (originEdition, prescriberName, identifiersChecked, patient, nurseCollection).",
    data: {
      properties: {
        orderId: ID, encounterId: ID, clinicId: ID, patientRef: { type: "string", minLength: 1, description: "Kiorly patient reference; never a national ID." },
        orderingClinicianId: ID, consentToken: { type: "string", minLength: 1 }, orderedAt: TS,
        items: { type: "array", minItems: 1, items: { type: "object", properties: { code: S, nameEn: { type: "string", minLength: 1 }, nameAr: S }, required: ["nameEn"] } },
        notes: S, preferredLabId: ID, ...AGG,
        // 1.6.0 (KNLAB01 / KLORD05, ratified optional fields): nurse-collected samples. Present only for originEdition NURSE.
        originEdition: ORIGIN_EDITION,
        prescriberName: { type: "string", description: "Doctor who requested the tests (nurse transcribes a doctor's order); relayed as referringDoctor.name." },
        identifiersChecked: { type: "array", minItems: 2, items: { enum: ["fullName", "dateOfBirth", "phone", "nationalId", "externalId"] }, description: "Kinds of the >= 2 DISTINCT identifiers the nurse verified against the patient record at collection (the Lab's vocabulary, plus fullName for nurse intake). Kinds only, never values." },
        patient: {
          type: "object", description: "Minimum demographics the lab needs to accession a nurse-collected sample, sent only under the consent token. Kiorex relays it to the lab and does not store it (receipt payload is redacted). Never a national id.",
          properties: { fullName: { type: "string", minLength: 2 }, dateOfBirth: S, sex: { enum: ["M", "F", "OTHER", "UNKNOWN"] }, phone: S, preferredLocale: { enum: ["ar", "en"] } }, required: ["fullName"],
        },
        nurseCollection: {
          type: "object", description: "The collection facts recorded by the nurse (tube labels become specimen barcodes; chain of custody starts at collectedAt).",
          properties: {
            visitRef: ID, collectorRef: { type: "string", minLength: 1, description: "Opaque collector reference; never a phone number or national id." }, collectorName: S,
            collectedAt: TS, handedOverAt: TS, temperatureC: { type: "number", minimum: -40, maximum: 60 },
            samples: { type: "array", minItems: 1, maxItems: 20, items: { type: "object", properties: { label: { type: "string", pattern: "^[\\x21-\\x7e]{3,40}$" }, specimenType: { type: "string", minLength: 2 }, container: S }, required: ["label", "specimenType"] } },
          },
          required: ["visitRef", "collectorRef", "collectedAt", "samples"],
        },
      },
      required: ["orderId", "clinicId", "patientRef", "consentToken", "orderedAt", "items"],
    },
    example: { aggregateId: "lord_01JF3ZF000", data: { orderId: "lord_01JF3ZF000", encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", patientRef: "pat_01JF3Z0000", orderingClinicianId: "clin_01JF3Z7AAA", consentToken: "rsc_0123456789abcdef0123456789abcdef", orderedAt: "2027-03-05T11:15:00.000Z", items: [{ code: "CBC", nameEn: "Complete blood count" }], aggregateType: "LabOrder", aggregateId: "lord_01JF3ZF000" } },
  },
  {
    type: "OrderReady", producer: "kiorly-pharmacy", aggregateType: "PharmacyOrder", status: "v2-draft",
    description: "Pharmacy order is ready for pickup/delivery. Pharmacist sign-off must be present.",
    data: { properties: { orderId: ID, pharmacyId: ID, branchId: ID, readyAt: TS, pharmacistSignoff: { type: "object", properties: { userId: ID, signedAt: TS }, required: ["userId", "signedAt"] } }, required: ["orderId", "pharmacyId", "readyAt", "pharmacistSignoff"] },
    example: { aggregateId: "ord_01JF3ZD000", data: { orderId: "ord_01JF3ZD000", pharmacyId: "ph_01", branchId: "br_01", readyAt: "2027-03-05T12:00:00.000Z", pharmacistSignoff: { userId: "usr_01", signedAt: "2027-03-05T11:59:00.000Z" } } },
  },
  {
    type: "OrderOutForDelivery", producer: "kiorly-pharmacy", aggregateType: "PharmacyOrder", status: "v2-draft",
    description: "Pharmacy handed a READY DELIVERY order to the courier (1.8.0, additive). Sits between OrderReady and DispenseCompleted; Kiorex mirrors it as OUT_FOR_DELIVERY and notifies the patient. Only for deliveryMethod DELIVERY. Carries no address and no courier contact (no PHI).",
    data: { properties: { orderId: ID, pharmacyId: ID, branchId: ID, outForDeliveryAt: TS, estimatedDeliveryMinutes: { type: "integer", minimum: 1, maximum: 1440, description: "Optional courier ETA in minutes from outForDeliveryAt." }, dispatchedBy: { type: "object", properties: { userId: ID }, required: ["userId"], description: "Pharmacy staff user who dispatched the order." } }, required: ["orderId", "pharmacyId", "outForDeliveryAt"] },
    example: { aggregateId: "ord_01JF3ZD000", data: { orderId: "ord_01JF3ZD000", pharmacyId: "ph_01", branchId: "br_01", outForDeliveryAt: "2027-03-05T12:10:00.000Z", estimatedDeliveryMinutes: 45, dispatchedBy: { userId: "usr_01" } } },
  },
  {
    type: "DispenseCompleted", producer: "kiorly-pharmacy", aggregateType: "PharmacyOrder", status: "v2-draft",
    description: "Order dispensed to the patient. Pharmacist sign-off must be present (KPRX06).",
    data: {
      properties: {
        orderId: ID, pharmacyId: ID, branchId: ID, dispensedAt: TS, pharmacistSignoff: { type: "object", properties: { userId: ID, signedAt: TS }, required: ["userId", "signedAt"] }, partial: { type: "boolean" },
        // 1.8.0 (additive, optional): per-line fulfilment so Kiorex can refund the rejected/unavailable lines pro-rata (partial-fulfilment policy). Absent => Kiorex parks the order in PARTIAL_REVIEW (ops decides).
        lines: { type: "array", description: "Per-line fulfilment (1.8.0). `sku` = the catalogue sku of the order line; `quantityDispensed` <= `quantityRequested`.", items: { type: "object", properties: { sku: ID, quantityRequested: { type: "integer", minimum: 1 }, quantityDispensed: { type: "integer", minimum: 0 } }, required: ["sku", "quantityRequested", "quantityDispensed"] } },
        deliveryMade: { type: "boolean", description: "1.8.0: DELIVERY orders only. false = the pharmacy did not deliver (Kiorex refunds the delivery fee per the market policy). Absent = delivered / not applicable." },
      },
      required: ["orderId", "pharmacyId", "dispensedAt", "pharmacistSignoff"],
    },
    example: { aggregateId: "ord_01JF3ZD000", data: { orderId: "ord_01JF3ZD000", pharmacyId: "ph_01", dispensedAt: "2027-03-05T12:30:00.000Z", pharmacistSignoff: { userId: "usr_01", signedAt: "2027-03-05T12:29:00.000Z" } } },
  },
  {
    type: "OrderRejected", producer: "kiorly-pharmacy", aggregateType: "PharmacyOrder", status: "v2-draft",
    description: "Pharmacy rejected the order (KPMKT02). Kiorex refunds per policy.",
    data: { properties: { orderId: ID, pharmacyId: ID, rejectedAt: TS, reason: { type: "string", minLength: 1 }, reasonCode: S }, required: ["orderId", "pharmacyId", "rejectedAt", "reason"] },
    example: { aggregateId: "ord_01JF3ZD000", data: { orderId: "ord_01JF3ZD000", pharmacyId: "ph_01", rejectedAt: "2027-03-05T11:00:00.000Z", reason: "Out of stock", reasonCode: "OUT_OF_STOCK" } },
  },
  {
    type: "LabResultReleased", producer: "kiorly-lab", aggregateType: "LabReport", status: "v2-draft",
    description: "Authorized lab report released. Carries the signed report version and a secure link only, never raw result values (KLCRIT03).",
    data: { properties: { reportId: ID, orderId: ID, labId: ID, patientRef: ID, reportVersion: { type: "integer", minimum: 1 }, signedAt: TS, secureLink: { type: "string", format: "uri" }, channels: { type: "array", items: { enum: ["PATIENT_LINK", "KIOREX_VAULT", "KIORLY_CLINIC", "PRINTED"] } }, values: false, results: false }, required: ["reportId", "orderId", "labId", "patientRef", "reportVersion", "signedAt", "secureLink"] },
    example: { aggregateId: "rep_01JF3ZE000", data: { reportId: "rep_01JF3ZE000", orderId: "lab_ord_01", labId: "lab_01", patientRef: "sub_01JF3Z0001", reportVersion: 1, signedAt: "2027-03-05T15:00:00.000Z", secureLink: "https://lab.kiorly.com/r/abc123", channels: ["KIOREX_VAULT"] } },
  },
  // ---- Kiorly Lab local drafts (NH-LB-025; mirror kiorly-lab apps/api outbox emitters; additive in 1.3.0) ----
  {
    type: "LabOrderCreated", producer: "kiorly-lab", aggregateType: "LabOrder", status: "v2-draft",
    description: "Kiorly Lab created an order that came from Kiorex (KIOREX_BOOKING) or Kiorly Clinic (KIORLY_CLINIC). Not emitted for walk-in or referring-doctor orders. Draft (NH-LB-025).",
    data: { properties: { orderId: ID, orderNumber: ID, source: LAB_SOURCE, originEdition: LAB_ORIGIN_EDITION, sourceRef: { type: ["string", "null"], description: "Caller's idempotency reference from POST /integration/v1/orders." }, labId: ID }, required: ["orderId", "orderNumber", "source", "labId"] },
    example: { aggregateId: "lord_01JF3ZF000", data: { orderId: "lord_01JF3ZF000", orderNumber: "LAB-2027-000123", source: "KIOREX_BOOKING", sourceRef: "bk_01JF3ZG000", labId: "lab_01JF3Z8AAA" } },
  },
  {
    type: "LabOrderStatusChanged", producer: "kiorly-lab", aggregateType: "LabOrder", status: "v2-draft",
    description: "Derived order status moved (only for KIOREX_BOOKING / KIORLY_CLINIC orders). Event id is deterministic per (order, nextStatus). Draft (NH-LB-025).",
    data: { properties: { orderId: ID, orderNumber: ID, source: LAB_SOURCE, originEdition: LAB_ORIGIN_EDITION, sourceRef: { type: ["string", "null"] }, previousStatus: LAB_ORDER_STATUS, nextStatus: LAB_ORDER_STATUS }, required: ["orderId", "orderNumber", "source", "previousStatus", "nextStatus"] },
    example: { aggregateId: "lord_01JF3ZF000", data: { orderId: "lord_01JF3ZF000", orderNumber: "LAB-2027-000123", source: "KIOREX_BOOKING", sourceRef: "bk_01JF3ZG000", previousStatus: "AWAITING_COLLECTION", nextStatus: "COLLECTED" } },
  },
  {
    type: "LabCriticalEscalated", producer: "kiorly-lab", aggregateType: "CriticalAlert", status: "v2-draft",
    description: "A critical-value alert passed its acknowledgement deadline and escalated one level (KLCRIT). Carries ids and the level only, never result values.",
    data: { properties: { alertId: ID, orderId: { type: ["string", "null"] }, level: { type: "integer", minimum: 1, description: "New escalation level (1 = lab director, 2 = owner)." }, values: false, results: false }, required: ["alertId", "level"] },
    example: { aggregateId: "calert_01JF3ZH000", data: { alertId: "calert_01JF3ZH000", orderId: "lord_01JF3ZF000", level: 1 } },
  },
  {
    type: "LabReportCorrected", producer: "kiorly-lab", aggregateType: "LabReport", status: "v2-draft",
    description: "A corrected report (version > 1) was released. Ids and version only; the patient fetches the new version via the secure link / vault. Never raw result values.",
    data: { properties: { reportId: ID, orderId: ID, reportVersion: { type: "integer", minimum: 2 }, values: false, results: false }, required: ["reportId", "orderId", "reportVersion"] },
    example: { aggregateId: "rep_01JF3ZE001", data: { reportId: "rep_01JF3ZE001", orderId: "lord_01JF3ZF000", reportVersion: 2 } },
  },
  {
    type: "LabInvoiceIssued", producer: "kiorly-lab", aggregateType: "Invoice", status: "v2-draft",
    description: "Lab invoice issued for a KIOREX_BOOKING order. Total is a decimal in major units of `currency`, VAT is a configurable line on the lab's own invoice (no tax-authority reporting).",
    data: { properties: { invoiceId: ID, orderId: ID, sourceRef: { type: ["string", "null"] }, currency: { type: "string", minLength: 3, maxLength: 3 }, total: { type: "number", minimum: 0 } }, required: ["invoiceId", "orderId", "currency", "total"] },
    example: { aggregateId: "inv_01JF3ZJ000", data: { invoiceId: "inv_01JF3ZJ000", orderId: "lord_01JF3ZF000", sourceRef: "bk_01JF3ZG000", currency: "EGP", total: 450 } },
  },
  {
    type: "LabPaymentRecorded", producer: "kiorly-lab", aggregateType: "Payment", status: "v2-draft",
    description: "A payment was recorded at the lab against a KIOREX_BOOKING order invoice (cash or card). Amount is a decimal in major units. Lab-side ledger only; never commingled with Kiorex Pay.",
    data: { properties: { paymentId: ID, invoiceId: ID, sourceRef: { type: ["string", "null"] }, method: { enum: ["CASH", "CARD"] }, amount: { type: "number", exclusiveMinimum: 0 }, currency: { type: "string", minLength: 3, maxLength: 3 } }, required: ["paymentId", "invoiceId", "method", "amount", "currency"] },
    example: { aggregateId: "pay_01JF3ZK000", data: { paymentId: "pay_01JF3ZK000", invoiceId: "inv_01JF3ZJ000", sourceRef: "bk_01JF3ZG000", method: "CASH", amount: 450, currency: "EGP" } },
  },
  // ---- Identity (Kiorex Account, KX-04 KA05/KA07) ----
  {
    type: "subject.deleted", producer: "kiorex-account", aggregateType: "Subject", status: "v2-draft",
    description: "Subject account deleted (KA07). Products must delete or anonymise non-legally-required data; legal records are retained.",
    data: { properties: { sub: ID, deletedAt: TS, requestedBy: { enum: ["subject", "operator", "guardian"] }, retainLegalRecords: { type: "boolean" } }, required: ["sub", "deletedAt"] },
    example: { aggregateId: "sub_01JF3Z0001", data: { sub: "sub_01JF3Z0001", deletedAt: "2027-04-01T08:00:00.000Z", requestedBy: "subject" } },
  },
  {
    type: "session.revoked", producer: "kiorex-account", aggregateType: "Session", status: "v2-draft",
    description: "Back-channel logout (KA05): revoke the product sessions bound to this sub and/or sid.",
    data: { properties: { sub: ID, sid: ID, revokedAt: TS, reason: { enum: ["logout", "remote_revoke", "reuse_detected", "password_or_credential_change", "admin"] } }, required: ["sub", "revokedAt"]},
    example: { aggregateId: "sid_01JF3ZF000", data: { sub: "sub_01JF3Z0001", sid: "sid_01JF3ZF000", revokedAt: "2027-04-01T08:00:00.000Z", reason: "remote_revoke" } },
  },
  {
    type: "guardian.link.changed", producer: "kiorex-account", aggregateType: "GuardianLink", status: "v2-draft",
    description: "A guardian <-> dependant link was created, activated (co-guardian accepted), revoked or expired at the age of majority (KA06). Identifiers and relationship facts only; no clinical data (ADR-013). Additive in 1.2.0.",
    data: {
      properties: {
        linkId: ID, guardianSub: ID, dependantSub: ID,
        change: { enum: ["created", "activated", "revoked", "expired"] },
        relationship: { enum: ["parent", "legal_guardian", "grandparent", "other_relative"] },
        evidenceType: { enum: ["self_declared", "birth_certificate_ref", "court_order_ref", "provider_attested"] },
        reason: { type: "string", description: "For revoked/expired, e.g. age_of_majority, revoked_by_guardian, guardian_deleted." },
        expiresAt: { ...TS, description: "Age-of-majority expiry of the link." },
        effectiveAt: TS,
      },
      required: ["linkId", "guardianSub", "dependantSub", "change", "effectiveAt"],
    },
    example: { aggregateId: "gl_01JF3ZG000", data: { linkId: "gl_01JF3ZG000", guardianSub: "sub_01JF3Z0001", dependantSub: "sub_01JF3Z0002", change: "created", relationship: "parent", evidenceType: "self_declared", expiresAt: "2044-05-01T00:00:00.000Z", effectiveAt: "2026-11-19T08:00:00.000Z" } },
  },
  {
    type: "membership.changed", producer: "kiorex-account", aggregateType: "Membership", status: "v2-draft",
    description: "An organisation membership hint was added, changed or removed (KA09). Hint only: the product decides permissions. No clinical data. Additive in 1.2.0.",
    data: {
      properties: {
        orgId: ID, sub: ID, roleHint: { type: "string", description: "Role hint, e.g. owner, admin, doctor, nurse, receptionist, finance, pharmacist, lab_technician, staff." },
        change: { enum: ["added", "removed", "role_changed"] }, at: TS,
      },
      required: ["orgId", "sub", "roleHint", "change", "at"],
    },
    example: { aggregateId: "org_01JF3ZH000:sub_01JF3Z0001", data: { orgId: "org_01JF3ZH000", sub: "sub_01JF3Z0001", roleHint: "doctor", change: "added", at: "2026-11-19T08:00:00.000Z" } },
  },
  {
    type: "account.merged", producer: "kiorex-account", aggregateType: "Account", status: "v2-draft",
    description: "Two Passports were merged after operator review, or a merge was reversed (KA08). Products merge or split their OWN patient links separately and with review; this event never implies a clinical merge. Additive in 1.2.0.",
    data: {
      properties: {
        linkId: ID, primarySub: ID, mergedSub: ID, change: { enum: ["merged", "reversed"] }, reversible: { type: "boolean" }, at: TS,
      },
      required: ["linkId", "primarySub", "mergedSub", "change", "at"],
    },
    example: { aggregateId: "sub_01JF3Z0001", data: { linkId: "lk_01JF3ZJ000", primarySub: "sub_01JF3Z0001", mergedSub: "sub_01JF3Z0003", change: "merged", reversible: true, at: "2026-11-19T08:00:00.000Z" } },
  },
  // ---- Feature-flag control plane ----
  {
    type: "flag.changed", producer: "kiorex-control-plane", aggregateType: "Flag", status: "v2-draft",
    description: "A flag changed in the control plane. Products refresh their snapshot immediately (delivered to POST /api/v1/feature-flags/kiorex/changed, HMAC).",
    data: {
      properties: {
        product: { enum: ["kiorly-clinic", "kiorex", "kiorex-account", "kiorly-pharmacy", "kiorly-lab"] },
        key: ID, scope: { enum: ["global", "market", "org"] }, scopeId: { type: ["string", "null"], description: "Market code or org id; null for global." },
        previousValue: { enum: ["ON", "OFF", "INHERIT"] }, newValue: { enum: ["ON", "OFF", "INHERIT"] },
        snapshotVersion: { type: "integer", minimum: 0 }, changedAt: TS, reason: S, actor: S, expiresAt: { ...TS, description: "Optional auto-revert time for an OFF." },
      },
      required: ["product", "key", "scope", "newValue", "snapshotVersion", "changedAt"],
    },
    example: { aggregateId: "kiorex.marketplace", data: { product: "kiorly-clinic", key: "kiorex.marketplace", scope: "market", scopeId: "EG", previousValue: "INHERIT", newValue: "OFF", snapshotVersion: 42, changedAt: "2027-05-01T09:00:00.000Z", reason: "PSP incident", actor: "ops@kiorex.com" } },
  },

  // ---- Rev 2.3 home visits, safety, care plans, cross-tenant sharing (KX-09 §04 v2.3, KX-05 §08, KX-23; additive in 1.5.0) ----
  {
    type: "HOME_VISIT_ASSIGNED", producer: "kiorly-clinic", aggregateType: "Appointment", status: "v2-draft", group: "rev23",
    description: "A clinician was assigned to a HOME visit (Clinic or Nurse edition; for agencies this is the dispatcher's assignment, shown to the patient before arrival, KNKX01). Carries the assignee's display name, photo URL and verification badge only. Never a phone number, address or coordinates (KX-09 §04). Ordered per appointment aggregate.",
    data: {
      properties: {
        appointmentId: ID, clinicId: ID,
        externalReference: { ...NSTR, description: "Kiorex booking reference (kx_bk_...) for marketplace bookings." },
        serviceLocation: { const: "HOME" },
        assignee: {
          type: "object",
          properties: {
            clinicianId: ID, displayName: ID,
            photoUrl: { type: ["string", "null"], format: "uri" },
            badge: { ...NSTR, description: "Profession badge text, e.g. 'Verified nurse' (PRVER02)." },
            profession: PROFESSION,
            phone: false, mobile: false, email: false,
          },
          required: ["clinicianId", "displayName"],
        },
        assignedAt: TS,
        ...NO_LOCATION, ...AGG,
      },
      required: ["appointmentId", "clinicId", "serviceLocation", "assignee", "assignedAt"],
    },
    example: { aggregateId: "apt_01JF3ZH001", data: { appointmentId: "apt_01JF3ZH001", clinicId: "clinic_01JF3Z7ZZZ", externalReference: "kx_bk_01JF3ZH000", serviceLocation: "HOME", assignee: { clinicianId: "clin_01JF3ZN001", displayName: "Nurse Mona Adel", photoUrl: "https://cdn.kiorly.com/p/clin_01JF3ZN001.jpg", badge: "Verified nurse", profession: "NURSE" }, assignedAt: "2027-03-05T07:30:00.000Z", aggregateType: "Appointment", aggregateId: "apt_01JF3ZH001" } },
  },
  {
    type: "HOME_VISIT_EN_ROUTE", producer: "kiorly-clinic", aggregateType: "Appointment", status: "v2-draft", group: "rev23",
    description: "The assigned clinician tapped 'On my way' (address is revealed to them at this point; it is never in this event). Ordered per appointment aggregate. Optional coarse ETA only: no coordinates, no address, no phone.",
    data: {
      properties: {
        appointmentId: ID, clinicId: ID,
        externalReference: { ...NSTR, description: "Kiorex booking reference (kx_bk_...) for marketplace bookings." },
        serviceLocation: { const: "HOME" },
        enRouteAt: TS,
        etaMinutes: { type: "integer", minimum: 0, maximum: 480, description: "Optional coarse ETA in minutes from enRouteAt." },
        ...NO_LOCATION, ...AGG,
      },
      required: ["appointmentId", "clinicId", "serviceLocation", "enRouteAt"],
    },
    example: { aggregateId: "apt_01JF3ZH001", data: { appointmentId: "apt_01JF3ZH001", clinicId: "clinic_01JF3Z7ZZZ", externalReference: "kx_bk_01JF3ZH000", serviceLocation: "HOME", enRouteAt: "2027-03-05T09:40:00.000Z", etaMinutes: 25, aggregateType: "Appointment", aggregateId: "apt_01JF3ZH001" } },
  },
  {
    type: "HOME_VISIT_ABORTED_UNSAFE", producer: "kiorly-clinic", aggregateType: "Appointment", status: "v2-draft", group: "rev23",
    description: "The clinician used 'Leave visit - unsafe' (BR61). Goes to Kiorex ops. It is never a no-show and never forfeits the deposit without human review: noShow is const false and depositAction is const HOLD_FOR_REVIEW (KX-09 §09 hold-for-review ledger state). Reason is a category only (no free text), location at district level only.",
    data: {
      properties: {
        appointmentId: ID, clinicId: ID,
        externalReference: { ...NSTR, description: "Kiorex booking reference (kx_bk_...) for marketplace bookings." },
        serviceLocation: { const: "HOME" },
        abortedAt: TS,
        reasonCategory: { enum: ["THREAT_OR_VIOLENCE", "UNSAFE_ENVIRONMENT", "PATIENT_IMPAIRED_OR_AGGRESSIVE", "OTHER"], description: "Assumption: narrowest category set; no free text (may contain PHI/address)." },
        noShow: { const: false },
        depositAction: { const: "HOLD_FOR_REVIEW" },
        district: { type: "string", description: "District code only." },
        reason: false,
        ...NO_LOCATION, ...AGG,
      },
      required: ["appointmentId", "clinicId", "serviceLocation", "abortedAt", "reasonCategory", "noShow", "depositAction"],
    },
    example: { aggregateId: "apt_01JF3ZH001", data: { appointmentId: "apt_01JF3ZH001", clinicId: "clinic_01JF3Z7ZZZ", externalReference: "kx_bk_01JF3ZH000", serviceLocation: "HOME", abortedAt: "2027-03-05T10:05:00.000Z", reasonCategory: "UNSAFE_ENVIRONMENT", noShow: false, depositAction: "HOLD_FOR_REVIEW", district: "nasr-city", aggregateType: "Appointment", aggregateId: "apt_01JF3ZH001" } },
  },
  {
    type: "SAFETY_ALERT_RAISED", producer: "kiorly-clinic", aggregateType: "SafetyAlert", status: "v2-draft", group: "rev23",
    description: "A home-visit safety alert (safety-timer expiry, SOS or unsafe abort; never a flag, ADR-025). Delivered to the organization's safety contact and, for Kiorex bookings, Kiorex ops within 60 s; the producer raises an on-call alarm if undelivered, and escalates to Kiorex ops on-call / org owner after 10 min without acknowledgement (KX-09 §08). No address, coordinates, phone or free text.",
    data: {
      properties: {
        alertId: ID, clinicId: ID,
        appointmentId: ID,
        externalReference: { ...NSTR, description: "Kiorex booking reference (kx_bk_...) when the visit came from Kiorex." },
        kind: { enum: ["TIMER_EXPIRED", "SOS", "UNSAFE_ABORT"] },
        raisedAt: TS,
        deliverTo: { type: "array", minItems: 1, uniqueItems: true, items: { enum: ["ORG_SAFETY_CONTACT", "KIOREX_OPS"] } },
        deliverWithinSeconds: { const: 60 },
        district: { type: "string", description: "District code only." },
        message: false,
        ...NO_LOCATION, ...AGG,
      },
      required: ["alertId", "clinicId", "kind", "raisedAt", "deliverTo", "deliverWithinSeconds"],
    },
    example: { aggregateId: "alert_01JF3ZS001", data: { alertId: "alert_01JF3ZS001", clinicId: "clinic_01JF3Z7ZZZ", appointmentId: "apt_01JF3ZH001", externalReference: "kx_bk_01JF3ZH000", kind: "SOS", raisedAt: "2027-03-05T09:58:00.000Z", deliverTo: ["ORG_SAFETY_CONTACT", "KIOREX_OPS"], deliverWithinSeconds: 60, district: "nasr-city", aggregateType: "SafetyAlert", aggregateId: "alert_01JF3ZS001" } },
  },
  {
    type: "CARE_PLAN_CONFIRMED", producer: "kiorly-clinic", aggregateType: "CarePlan", status: "v2-draft", group: "rev23",
    description: "DRAFT (phase P3, Nurse edition, nurse.care_plans / gate GKN1): the provider confirmed a care plan requested through POST /marketplace/v1/care-plan-requests. Carries the schedule with appointment IDs only; no clinical content, no address.",
    data: {
      properties: {
        carePlanId: ID, clinicId: ID,
        requestRef: { ...NSTR, description: "requestRef of the Kiorex care-plan request, when it originated there." },
        edition: { const: "NURSE" },
        confirmedAt: TS,
        visits: {
          type: "array", minItems: 1,
          items: { type: "object", properties: { appointmentId: ID, startsAt: TS, endsAt: TS, serviceLocation: SERVICE_LOCATION }, required: ["appointmentId", "startsAt"] },
        },
        ...NO_LOCATION, ...AGG,
      },
      required: ["carePlanId", "clinicId", "confirmedAt", "visits"],
    },
    example: { aggregateId: "cp_01JF3ZP001", data: { carePlanId: "cp_01JF3ZP001", clinicId: "clinic_01JF3Z7ZZZ", requestRef: "kx_cpr_01JF3ZP000", edition: "NURSE", confirmedAt: "2027-03-05T08:00:00.000Z", visits: [{ appointmentId: "apt_01JF3ZH101", startsAt: "2027-03-06T09:00:00.000Z", endsAt: "2027-03-06T09:45:00.000Z", serviceLocation: "HOME" }, { appointmentId: "apt_01JF3ZH102", startsAt: "2027-03-07T09:00:00.000Z", endsAt: "2027-03-07T09:45:00.000Z", serviceLocation: "HOME" }], aggregateType: "CarePlan", aggregateId: "cp_01JF3ZP001" } },
  },
  {
    type: "CARE_PLAN_ENDED", producer: "kiorly-clinic", aggregateType: "CarePlan", status: "v2-draft", group: "rev23",
    description: "DRAFT (phase P3, Nurse edition): a confirmed care plan ended. Follow-up visits of a care plan are never charged a Kiorex fee (KX-23). IDs and counts only.",
    data: {
      properties: {
        carePlanId: ID, clinicId: ID,
        requestRef: { ...NSTR, description: "requestRef of the Kiorex care-plan request, when it originated there." },
        endedAt: TS,
        reason: { enum: ["COMPLETED", "CANCELLED_BY_PATIENT", "CANCELLED_BY_PROVIDER", "EXPIRED"], description: "Assumption: narrowest set; no clinical reason." },
        visitsCompleted: { type: "integer", minimum: 0 },
        cancelledAppointmentIds: { type: "array", items: ID },
        ...NO_LOCATION, ...AGG,
      },
      required: ["carePlanId", "clinicId", "endedAt", "reason"],
    },
    example: { aggregateId: "cp_01JF3ZP001", data: { carePlanId: "cp_01JF3ZP001", clinicId: "clinic_01JF3Z7ZZZ", requestRef: "kx_cpr_01JF3ZP000", endedAt: "2027-03-12T10:00:00.000Z", reason: "COMPLETED", visitsCompleted: 7, cancelledAppointmentIds: [], aggregateType: "CarePlan", aggregateId: "cp_01JF3ZP001" } },
  },
  {
    type: "ReferralIssued", producer: "kiorly-clinic", aggregateType: "Referral", status: "v2-draft", group: "rev23",
    description: "A clinic issued a referral to a clinic of another tenant (e.g. physiotherapy, PT04) through Kiorex. A patient consent token is required (KX-09 §04). Carries a secure link and ids only; the referral content is fetched by the receiver with the consent token, never embedded here.",
    data: {
      properties: {
        referralId: ID, fromClinicId: ID,
        toClinicId: { type: "string", minLength: 1, description: "Receiving clinic when the patient chose one; otherwise the receiver is resolved by Kiorex." },
        toProfession: PROFESSION,
        patientRef: { type: "string", minLength: 1, description: "Kiorex subject or Kiorly patient reference; never a national ID." },
        referrerId: ID,
        consentToken: { type: "string", minLength: 1, description: "Opaque token derived from the patient's active record-share grant (rsc_...)." },
        issuedAt: TS,
        expiresAt: TS,
        secureLink: { type: "string", format: "uri" },
        diagnosis: false, notes: false, content: false,
        ...AGG,
      },
      required: ["referralId", "fromClinicId", "patientRef", "referrerId", "consentToken", "issuedAt"],
    },
    example: { aggregateId: "ref_01JF3ZR001", data: { referralId: "ref_01JF3ZR001", fromClinicId: "clinic_01JF3Z7ZZZ", toProfession: "PHYSIOTHERAPIST", patientRef: "sub_01JF3Z0001", referrerId: "clin_01JF3Z7AAA", consentToken: "ct_01JF3ZR111", issuedAt: "2027-03-05T11:12:00.000Z", expiresAt: "2027-06-05T11:12:00.000Z", secureLink: "https://app.kiorly.com/r/ref_abc123", aggregateType: "Referral", aggregateId: "ref_01JF3ZR001" } },
  },
  {
    type: "MedicationOrderShared", producer: "kiorly-clinic", aggregateType: "DoctorOrder", status: "v2-draft", group: "rev23",
    description: "A doctor's signed medication order was shared with a Nurse-edition tenant through Kiorex consent (a nurse may only administer against a doctor's order, BR57; MAR checks are never a flag). Carries the signed order version, expiry and a secure link only: medicine lines, doses and clinical text are never embedded.",
    data: {
      properties: {
        orderId: ID, fromClinicId: ID,
        toClinicId: { type: "string", minLength: 1, description: "Receiving Nurse-edition tenant (organization of one for a solo nurse)." },
        patientRef: { type: "string", minLength: 1, description: "Kiorex subject or Kiorly patient reference; never a national ID." },
        prescriberId: ID,
        orderVersion: { type: "integer", minimum: 1 },
        signedAt: TS,
        expiresAt: TS,
        consentToken: { type: "string", minLength: 1, description: "Opaque token derived from the patient's active record-share grant (rsc_...)." },
        secureLink: { type: "string", format: "uri" },
        items: false, medications: false, lines: false,
        ...AGG,
      },
      required: ["orderId", "fromClinicId", "patientRef", "prescriberId", "orderVersion", "signedAt", "expiresAt", "consentToken"],
    },
    example: { aggregateId: "ord_01JF3ZO001", data: { orderId: "ord_01JF3ZO001", fromClinicId: "clinic_01JF3Z7ZZZ", toClinicId: "clinic_01JF3ZNNNN", patientRef: "sub_01JF3Z0001", prescriberId: "clin_01JF3Z7AAA", orderVersion: 2, signedAt: "2027-03-05T11:00:00.000Z", expiresAt: "2027-03-19T11:00:00.000Z", consentToken: "ct_01JF3ZO111", secureLink: "https://app.kiorly.com/o/ord_abc123", aggregateType: "DoctorOrder", aggregateId: "ord_01JF3ZO001" } },
  },

  // ---- Growth engine (additive in 1.10.0; ARCH section 8). Cross-product: CommissionAdjusted, PatientConsentUpdated. Internal (same names on the internal outbox, never delivered to partners): AttributionAssigned, PatientAcquisitionRecorded, ReferralLinkCreated. ----
  {
    type: "CommissionAdjusted", producer: "kiorly-clinic", aggregateType: "Appointment", status: "v2-draft", group: "growth",
    description: "A commission charge amount was waived or changed (for example a PROVIDER_LED_EVIDENCE dispute was approved). A full reversal stays COMMISSION_CHARGE_REVERSED. Carries the decision that explains it. No patient data.",
    data: {
      properties: {
        chargeId: ID, appointmentId: ID,
        previousAmount: { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal string, 2 dp." },
        adjustedAmount: { type: "string", pattern: "^-?\\d+(\\.\\d{1,2})?$", description: "Decimal string, 2 dp; 0.00 when waived." },
        currency: { type: "string", minLength: 3, maxLength: 3 },
        reason: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,63}$", description: "Machine reason, e.g. PROVIDER_LED_EVIDENCE, GOODWILL_WAIVER, POLICY_CORRECTION." },
        feeBasisMinor: { type: "integer", minimum: 0, description: "Fee the Kiorex fee was computed on, before any sponsored discount (additive, 1.12.0; policy SPONSORED_PROMOTION_POLICY.commissionBasis)." }, sponsoredDiscountMinor: { type: "integer", minimum: 0, description: "Provider-sponsored discount on the booking, informational: it never changes chargeability or attribution (additive, 1.12.0)." }, basisPolicyVersion: { type: "string", minLength: 1, maxLength: 64, description: "Version id of the policy that fixed the basis (additive, 1.12.0)." }, decisionRef: ACQ_DECISION_REF, origin: ACQ_ORIGIN, policyVersion: ACQ_POLICY_VERSION, adjustedAt: TS, ...AGG,
      },
      required: ["chargeId", "appointmentId", "previousAmount", "adjustedAmount", "currency", "reason", "adjustedAt"],
    },
    example: { aggregateId: "apt_01JF3Z8Q0K", data: { chargeId: "chg_01JF3Z9AAA", appointmentId: "apt_01JF3Z8Q0K", previousAmount: "40.00", adjustedAmount: "0.00", currency: "EGP", reason: "PROVIDER_LED_EVIDENCE", decisionRef: "cdc_01JF3ZA000", origin: "PROVIDER_LED", policyVersion: "agp_01JF3Z0000", adjustedAt: "2027-03-12T10:00:00.000Z", aggregateType: "Appointment", aggregateId: "apt_01JF3Z8Q0K" } },
  },
  {
    type: "PatientConsentUpdated", producer: "kiorex", aggregateType: "PatientConsent", status: "v2-draft", group: "growth",
    description: "A patient or visitor granted or withdrew a consent purpose. The payload carries an opaque subject reference only: no name, phone, email or health data. Append-only history; the latest row wins; withdrawal is effective for the send gate within 60 seconds.",
    data: {
      properties: {
        subRef: { type: "string", minLength: 1, description: "Opaque reference to the subject used internally; never the Passport sub of a partner-visible patient." },
        purpose: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,48}$", description: "ANALYTICS_MEASUREMENT, MARKETING_WHATSAPP, MARKETING_SMS, MARKETING_EMAIL, MARKETING_PUSH or a purpose added later." },
        channel: { type: "string", pattern: "^[A-Z][A-Z0-9_]{1,24}$", description: "Optional channel when the purpose is channel-specific." },
        granted: { type: "boolean" },
        textVersion: { type: "string", minLength: 1, maxLength: 64, description: "Id of the exact approved wording (AR and EN) shown to the person. Placeholder until counsel approves." },
        source: { enum: ["web", "app", "whatsapp", "widget", "ops-import"] },
        at: TS, ...AGG,
      },
      required: ["subRef", "purpose", "granted", "textVersion", "source", "at"],
    },
    example: { aggregateId: "cns_01JF3ZB000", data: { subRef: "sref_01JF3ZB111", purpose: "MARKETING_WHATSAPP", channel: "WHATSAPP", granted: false, textVersion: "TODO_NEEDS_HUMAN_v0", source: "app", at: "2027-03-12T10:00:00.000Z", aggregateType: "PatientConsent", aggregateId: "cns_01JF3ZB000" } },
  },
  {
    type: "AttributionAssigned", producer: "kiorex", aggregateType: "BookingIntent", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only, not delivered to partners). The deterministic attribution function produced a decision for a booking. One per booking and policy version.",
    data: { properties: { bookingId: ID, decisionId: ID, origin: ACQ_ORIGIN, reason: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,63}$" }, policyVersion: ACQ_POLICY_VERSION, market: { type: "string", pattern: "^[A-Z]{2}$" }, decidedAt: TS, ...AGG }, required: ["bookingId", "decisionId", "origin", "reason", "policyVersion"] },
    example: { aggregateId: "bk_01JF3ZC000", data: { bookingId: "bk_01JF3ZC000", decisionId: "atd_01JF3ZC111", origin: "PROVIDER_LED", reason: "EXPLICIT_PROVIDER_CHANNEL", policyVersion: "agp_01JF3Z0000", market: "EG", decidedAt: "2027-03-04T09:12:44.000Z", aggregateType: "BookingIntent", aggregateId: "bk_01JF3ZC000" } },
  },
  {
    type: "PatientAcquisitionRecorded", producer: "kiorex", aggregateType: "PatientProfile", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only). The first time a subject receives an acquisition origin (registration or first booking). Origin, source kind and market only: no identifiers beyond the aggregate.",
    data: { properties: { origin: ACQ_ORIGIN, sourceKind: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,32}$" }, market: { type: "string", pattern: "^[A-Z]{2}$" }, product: { ...PRODUCT, description: "Aggregate rollup dimension (1.13.0, optional). Absent = CLINIC." }, recordedAt: TS, ...AGG }, required: ["origin", "sourceKind", "market"] },
    example: { aggregateId: "pp_01JF3ZD000", data: { origin: "MARKETPLACE", sourceKind: "ORGANIC_SEARCH", market: "EG", recordedAt: "2027-03-04T09:12:44.000Z", aggregateType: "PatientProfile", aggregateId: "pp_01JF3ZD000" } },
  },
  {
    type: "ReferralLinkCreated", producer: "kiorly-clinic", aggregateType: "ProviderReferralLink", status: "v2-draft", group: "growth",
    description: "A provider created a referral link or QR. Since 1.11.0 the Clinic delivers it to Kiorex through its outbox with the organisation reference (`orgRef`), so the link registry knows a code before its first signed token. Link code, scope, channel and organisation reference only: never patient data.",
    data: { properties: { linkCode: { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{8}$", description: "8 Crockford base32 characters (no I, L, O, U); ARCH section 4.2." }, ownerScope: { enum: ["ORG", "CLINIC", "BRANCH", "DOCTOR", "DESK"] }, channelKind: { enum: ["WEB_LINK", "QR_POSTER", "QR_DESK", "SOCIAL", "SMS", "WHATSAPP_SHARE", "EMAIL_SIG", "GOOGLE_PROFILE"] }, orgRef: LINK_ORG_REF, clinicRef: { type: ["string", "null"], description: "Clinic the link belongs to, when scoped to one. Additive in 1.11.0." }, product: PRODUCT, createdAt: TS, ...AGG }, required: ["linkCode", "ownerScope", "channelKind"] },
    example: { aggregateId: "prl_01JF3ZE000", data: { linkCode: "7K2M9X4Q", ownerScope: "DOCTOR", channelKind: "QR_DESK", orgRef: "ten_01JF3Z0000", clinicRef: "clinic_01JF3Z7ZZZ", createdAt: "2027-03-04T09:12:44.000Z", aggregateType: "ProviderReferralLink", aggregateId: "prl_01JF3ZE000" } },
  },
  {
    type: "ReferralLinkRevoked", producer: "kiorly-clinic", aggregateType: "ProviderReferralLink", status: "v2-draft", group: "growth",
    description: "A provider revoked a referral link or QR (1.11.0, additive). Delivered to Kiorex through the Clinic outbox so the link registry stops treating the code as provider-led for NEW bookings; a still-valid signed `lt` of this code no longer decides PROVIDER_LED. Revocation can only remove a fee, never add one. Link code and organisation reference only: never patient data.",
    data: { properties: { linkCode: { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{8}$", description: "8 Crockford base32 characters (ARCH section 4.2)." }, orgRef: LINK_ORG_REF, clinicRef: { type: ["string", "null"] }, revokedAt: TS, reason: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,63}$", description: "Optional machine reason, e.g. PROVIDER_REQUEST, ABUSE, REPLACED." }, product: PRODUCT, ...AGG }, required: ["linkCode", "orgRef", "revokedAt"] },
    example: { aggregateId: "prl_01JF3ZE000", data: { linkCode: "7K2M9X4Q", orgRef: "ten_01JF3Z0000", clinicRef: "clinic_01JF3Z7ZZZ", revokedAt: "2027-03-20T08:00:00.000Z", reason: "PROVIDER_REQUEST", aggregateType: "ProviderReferralLink", aggregateId: "prl_01JF3ZE000" } },
  },
  // ===================== 1.12.0 (additive): growth Phase 2 =====================
  {
    type: "CampaignCreated", producer: "kiorex", aggregateType: "GrowthCampaign", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only). An ops user created a campaign plan (never an ad-platform object). Ids, market, channel labels and budget figures only: no patient data (1.12.0).",
    data: { properties: { campaignId: ID, market: MARKET, key: { type: "string", pattern: "^[a-z0-9][a-z0-9-]{1,47}$" }, objective: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,31}$" }, channels: { type: "array", items: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,31}$" }, maxItems: 12 }, budgetTotalMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, createdAt: TS, ...AGG }, required: ["campaignId", "market", "key", "objective", "budgetTotalMinor", "currency"] },
    example: { aggregateId: "cmp_01JF3ZF000", data: { campaignId: "cmp_01JF3ZF000", market: "EG", key: "ramadan-checkup", objective: "AWARENESS", channels: ["ORGANIC_SEARCH", "EMAIL"], budgetTotalMinor: 5000000, currency: "EGP", createdAt: "2027-03-04T09:12:44.000Z", aggregateType: "GrowthCampaign", aggregateId: "cmp_01JF3ZF000" } },
  },
  {
    type: "CampaignStatusChanged", producer: "kiorex", aggregateType: "GrowthCampaign", status: "v2-draft", group: "growth",
    description: "INTERNAL. A campaign moved between states (DRAFT, PENDING_APPROVAL, SCHEDULED, ACTIVE, PAUSED, COMPLETED, ARCHIVED). One event per transition, idempotent on (campaignId, to, at). Reason code only, never free text about people (1.12.0).",
    data: { properties: { campaignId: ID, market: MARKET, from: CAMPAIGN_STATUS, to: CAMPAIGN_STATUS, reasonCode: REASON_CODE, actorKind: { enum: ["USER", "SYSTEM"] }, at: TS, ...AGG }, required: ["campaignId", "from", "to", "reasonCode", "at"] },
    example: { aggregateId: "cmp_01JF3ZF000", data: { campaignId: "cmp_01JF3ZF000", market: "EG", from: "ACTIVE", to: "PAUSED", reasonCode: "BUDGET", actorKind: "SYSTEM", at: "2027-03-12T10:00:00.000Z", aggregateType: "GrowthCampaign", aggregateId: "cmp_01JF3ZF000" } },
  },
  {
    type: "CampaignBudgetThresholdReached", producer: "kiorex", aggregateType: "GrowthCampaign", status: "v2-draft", group: "growth",
    description: "INTERNAL. Approved spend crossed a budget alert threshold (50, 80 or 100 percent of the total budget). Emitted once per threshold per campaign (1.12.0).",
    data: { properties: { campaignId: ID, market: MARKET, thresholdBp: { enum: [5000, 8000, 10000] }, utilisationBp: { type: "integer", minimum: 0 }, spentMinor: { type: "integer", minimum: 0 }, budgetTotalMinor: { type: "integer", minimum: 1 }, at: TS, ...AGG }, required: ["campaignId", "thresholdBp", "utilisationBp", "at"] },
    example: { aggregateId: "cmp_01JF3ZF000", data: { campaignId: "cmp_01JF3ZF000", market: "EG", thresholdBp: 8000, utilisationBp: 8120, spentMinor: 4060000, budgetTotalMinor: 5000000, at: "2027-03-12T10:00:00.000Z", aggregateType: "GrowthCampaign", aggregateId: "cmp_01JF3ZF000" } },
  },
  {
    type: "CampaignApprovalDecided", producer: "kiorex", aggregateType: "GrowthCampaign", status: "v2-draft", group: "growth",
    description: "INTERNAL. A second ops user approved or rejected a campaign activation, budget increase or reactivation (maker-checker). The decider is never the requester (1.12.0).",
    data: { properties: { campaignId: ID, approvalId: ID, kind: { enum: ["ACTIVATE", "BUDGET_INCREASE", "REACTIVATE"] }, decision: { enum: ["APPROVED", "REJECTED"] }, snapshotHash: { type: "string", pattern: "^[0-9a-f]{64}$" }, decidedAt: TS, ...AGG }, required: ["campaignId", "approvalId", "kind", "decision", "decidedAt"] },
    example: { aggregateId: "cmp_01JF3ZF000", data: { campaignId: "cmp_01JF3ZF000", approvalId: "cma_01JF3ZF111", kind: "ACTIVATE", decision: "APPROVED", snapshotHash: "a".repeat(64), decidedAt: "2027-03-05T09:00:00.000Z", aggregateType: "GrowthCampaign", aggregateId: "cmp_01JF3ZF000" } },
  },
  {
    type: "ReferralCodeIssued", producer: "kiorex", aggregateType: "ReferralCode", status: "v2-draft", group: "growth",
    description: "INTERNAL. A patient referral code was issued (8 Crockford base32 characters). Opaque references only: no name, phone or email (1.12.0).",
    data: { properties: { codeRef: ID, market: MARKET, code: { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{8}$" }, issuedAt: TS, ...AGG }, required: ["codeRef", "code", "issuedAt"] },
    example: { aggregateId: "rfc_01JF3ZG000", data: { codeRef: "rfc_01JF3ZG000", market: "EG", code: "7K2M9X4Q", issuedAt: "2027-03-04T09:12:44.000Z", aggregateType: "ReferralCode", aggregateId: "rfc_01JF3ZG000" } },
  },
  {
    type: "ReferralRelationshipCreated", producer: "kiorex", aggregateType: "ReferralRelationship", status: "v2-draft", group: "growth",
    description: "INTERNAL. An invited person claimed a patient referral code and a relationship was recorded. Opaque references only (1.12.0).",
    data: { properties: { relationshipRef: ID, market: MARKET, ruleVersion: { type: "string", minLength: 1, maxLength: 64 }, createdAt: TS, ...AGG }, required: ["relationshipRef", "createdAt"] },
    example: { aggregateId: "rfr_01JF3ZG111", data: { relationshipRef: "rfr_01JF3ZG111", market: "EG", ruleVersion: "rrv_01JF3Z0000", createdAt: "2027-03-04T09:12:44.000Z", aggregateType: "ReferralRelationship", aggregateId: "rfr_01JF3ZG111" } },
  },
  {
    type: "ReferralQualified", producer: "kiorex", aggregateType: "ReferralRelationship", status: "v2-draft", group: "growth",
    description: "INTERNAL. A referral met the qualification rules (attended, hold days passed, checks passed). Never changes an attribution decision or a commission (1.12.0).",
    data: { properties: { relationshipRef: ID, market: MARKET, ruleVersion: { type: "string", minLength: 1, maxLength: 64 }, qualifiedAt: TS, ...AGG }, required: ["relationshipRef", "qualifiedAt"] },
    example: { aggregateId: "rfr_01JF3ZG111", data: { relationshipRef: "rfr_01JF3ZG111", market: "EG", ruleVersion: "rrv_01JF3Z0000", qualifiedAt: "2027-03-20T09:12:44.000Z", aggregateType: "ReferralRelationship", aggregateId: "rfr_01JF3ZG111" } },
  },
  {
    type: "ReferralRejected", producer: "kiorex", aggregateType: "ReferralRelationship", status: "v2-draft", group: "growth",
    description: "INTERNAL. A referral failed a check or expired. Machine reason code only (1.12.0).",
    data: { properties: { relationshipRef: ID, market: MARKET, reasonCode: REASON_CODE, rejectedAt: TS, ...AGG }, required: ["relationshipRef", "reasonCode", "rejectedAt"] },
    example: { aggregateId: "rfr_01JF3ZG111", data: { relationshipRef: "rfr_01JF3ZG111", market: "EG", reasonCode: "SELF_REFERRAL", rejectedAt: "2027-03-05T09:12:44.000Z", aggregateType: "ReferralRelationship", aggregateId: "rfr_01JF3ZG111" } },
  },
  ...["RewardIssued", "RewardRedeemed", "RewardReversed", "RewardExpired", "RewardHeld"].map((t) => ({
    type: t, producer: "kiorex", aggregateType: "RewardLot", status: "v2-draft", group: "growth",
    description: `INTERNAL. Reward ledger event ${t} (append-only ledger; rewards are funded by the platform marketing budget, never charged to providers, never change an attribution decision). Opaque lot reference, mode and amount only (1.12.0).`,
    data: { properties: { lotRef: ID, market: MARKET, mode: { enum: ["CREDIT", "COUPON"] }, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, reasonCode: REASON_CODE, idempotencyKey: { type: "string", pattern: "^rwd:[a-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,64}$", description: "Format rwd:<entry type lower case>:<opaque id>." }, at: TS, ...AGG }, required: ["lotRef", "mode", "amountMinor", "currency", "reasonCode", "idempotencyKey", "at"] },
    example: { aggregateId: "rwl_01JF3ZH000", data: { lotRef: "rwl_01JF3ZH000", market: "EG", mode: "COUPON", amountMinor: 5000, currency: "EGP", reasonCode: "REFERRER_QUALIFIED", idempotencyKey: `rwd:${t.slice(6).toLowerCase()}:rfr_01JF3ZG111`, at: "2027-03-20T09:12:44.000Z", aggregateType: "RewardLot", aggregateId: "rwl_01JF3ZH000" } },
  })),
  {
    type: "AssistantConversationEscalated", producer: "kiorex", aggregateType: "AssistantSession", status: "v2-draft", group: "growth",
    description: "INTERNAL. The WhatsApp assistant handed a conversation to a human (emergency wording, repeated misunderstanding, patient request or budget breaker). Reason code only: no message text, no phone number (1.12.0).",
    data: { properties: { sessionRef: ID, market: MARKET, reasonCode: REASON_CODE, slaDueAt: TS, at: TS, ...AGG }, required: ["sessionRef", "reasonCode", "at"] },
    example: { aggregateId: "ass_01JF3ZI000", data: { sessionRef: "ass_01JF3ZI000", market: "EG", reasonCode: "PATIENT_REQUEST", slaDueAt: "2027-03-04T09:42:44.000Z", at: "2027-03-04T09:12:44.000Z", aggregateType: "AssistantSession", aggregateId: "ass_01JF3ZI000" } },
  },
  {
    type: "AssistantBudgetBreakerTripped", producer: "kiorex", aggregateType: "AssistantUsageDaily", status: "v2-draft", group: "growth",
    description: "INTERNAL. The per-market daily cost or token cap of the assistant was reached; the router answers DETERMINISTIC until the next market-local midnight or a manual reset (1.12.0).",
    data: { properties: { market: MARKET, day: { type: "string", format: "date" }, capKind: { enum: ["TOKENS", "COST"] }, usedMinor: { type: "integer", minimum: 0 }, capMinor: { type: "integer", minimum: 0 }, at: TS, ...AGG }, required: ["market", "day", "capKind", "at"] },
    example: { aggregateId: "asu_01JF3ZI111", data: { market: "EG", day: "2027-03-04", capKind: "COST", usedMinor: 200000, capMinor: 200000, at: "2027-03-04T09:12:44.000Z", aggregateType: "AssistantUsageDaily", aggregateId: "asu_01JF3ZI111" } },
  },
  {
    type: "LifecycleDecisionRecorded", producer: "kiorex", aggregateType: "LifecycleJourney", status: "v2-draft", group: "growth",
    description: "INTERNAL. Aggregate counters of lifecycle send decisions for one journey step and day: counts only, never a person, a phone number, a message body or any health data (1.12.0).",
    data: { properties: { market: MARKET, journeyKey: { type: "string", pattern: "^[a-z0-9][a-z0-9_-]{1,47}$" }, step: { type: "integer", minimum: 0 }, messageClass: { enum: ["TRANSACTIONAL", "SECURITY", "CLINICAL", "MARKETING"] }, day: { type: "string", format: "date" }, sent: { type: "integer", minimum: 0 }, skipped: { type: "integer", minimum: 0 }, ...AGG }, required: ["journeyKey", "step", "messageClass", "day", "sent", "skipped"] },
    example: { aggregateId: "ljn_01JF3ZJ000", data: { market: "EG", journeyKey: "welcome", step: 1, messageClass: "TRANSACTIONAL", day: "2027-03-04", sent: 120, skipped: 14, aggregateType: "LifecycleJourney", aggregateId: "ljn_01JF3ZJ000" } },
  },
  {
    type: "IntegrationRunFailed", producer: "kiorex", aggregateType: "GrowthIntegrationRun", status: "v2-draft", group: "growth",
    description: "INTERNAL. A read-only marketing integration pull failed (the circuit counts consecutive failures). Kind, mode and a machine error code only; never credentials or response bodies (1.12.0).",
    data: { properties: { kind: { type: "string", pattern: "^[a-z][a-z0-9_]{1,31}$" }, market: MARKET, mode: { enum: ["mock", "real"] }, errorCode: REASON_CODE, consecutiveFailures: { type: "integer", minimum: 1 }, at: TS, ...AGG }, required: ["kind", "mode", "errorCode", "at"] },
    example: { aggregateId: "gir_01JF3ZK000", data: { kind: "googleads", market: "EG", mode: "mock", errorCode: "UPSTREAM_TIMEOUT", consecutiveFailures: 2, at: "2027-03-04T09:12:44.000Z", aggregateType: "GrowthIntegrationRun", aggregateId: "gir_01JF3ZK000" } },
  },
  {
    type: "ProductAcquisitionFact", producer: "kiorex", aggregateType: "ProductAcquisition", status: "v2-draft", group: "growth",
    description: "Kiorex tells a partner product (Pharmacy, Lab, Nurse) how an order or booking that Kiorex took on its public page was acquired (1.12.0; used by Phase 4 package P4-B). Mirror of the Clinic acquisition block: origin, reason, decision and policy references, evidence hash. It can only remove a fee, never add one; today pharmacy and lab take rates are 0. Never patient data.",
    data: { properties: { factId: ID, product: { enum: ["PHARMACY", "LAB", "NURSE"] }, orgRef: LINK_ORG_REF, orderRef: { type: "string", minLength: 1, description: "The partner's own reference of the order or booking (opaque)." }, origin: ACQ_ORIGIN, reason: REASON_CODE, decisionId: ACQ_DECISION_REF, policyVersion: ACQ_POLICY_VERSION, evidenceHash: { type: "string", pattern: "^[0-9a-f]{64}$" }, linkCode: { type: "string", pattern: "^[0-9A-HJKMNP-TV-Z]{8}$" }, outcome: { enum: ["ORDERED", "COMPLETED", "CANCELLED"] }, occurredAt: TS, ...AGG }, required: ["factId", "product", "orgRef", "orderRef", "origin", "reason", "decisionId", "policyVersion", "evidenceHash", "outcome", "occurredAt"] },
    example: { aggregateId: "paf_01JF3ZL000", data: { factId: "paf_01JF3ZL000", product: "PHARMACY", orgRef: "ten_01JF3Z0000", orderRef: "ord_01JF3ZL111", origin: "PROVIDER_LED", reason: "EXPLICIT_PROVIDER_CHANNEL", decisionId: "atd_01JF3ZC111", policyVersion: "agp_01JF3Z0000", evidenceHash: "b".repeat(64), linkCode: "7K2M9X4Q", outcome: "ORDERED", occurredAt: "2027-03-04T09:12:44.000Z", aggregateType: "ProductAcquisition", aggregateId: "paf_01JF3ZL000" } },
  },
  {
    type: "ProviderVerificationUpdateRequested", producer: "kiorly-clinic", aggregateType: "ProviderVerificationUpdate", status: "v2-draft", group: "growth",
    description: "A provider asked to change a verified listing field (licence number, specialty, address, display name, photo or a document). The Clinic sends the reference, the field and evidence file references; the new value itself travels in the signed request body of the marketplace call, never in the event (1.12.0).",
    data: { properties: { requestRef: ID, orgRef: LINK_ORG_REF, clinicId: ID, field: { enum: ["LICENSE_NUMBER", "SPECIALTY", "ADDRESS", "DISPLAY_NAME", "PHOTO", "DOCUMENT"] }, evidenceCount: { type: "integer", minimum: 0, maximum: 10 }, requestedAt: TS, ...AGG }, required: ["requestRef", "orgRef", "clinicId", "field", "requestedAt"] },
    example: { aggregateId: "pvu_01JF3ZM000", data: { requestRef: "pvu_01JF3ZM000", orgRef: "ten_01JF3Z0000", clinicId: "clinic_01JF3Z7ZZZ", field: "LICENSE_NUMBER", evidenceCount: 2, requestedAt: "2027-03-04T09:12:44.000Z", aggregateType: "ProviderVerificationUpdate", aggregateId: "pvu_01JF3ZM000" } },
  },
  {
    type: "ProviderVerificationDecided", producer: "kiorex", aggregateType: "ProviderVerificationUpdate", status: "v2-draft", group: "growth",
    description: "Kiorex ops decided a provider verification update request (approved, rejected or needs more information). Delivered to the Clinic so the provider sees the outcome; the decision note is short and never contains a person's data (1.12.0).",
    data: { properties: { requestRef: ID, kiorexRef: ID, orgRef: LINK_ORG_REF, clinicId: ID, decision: { enum: ["APPROVED", "REJECTED", "NEEDS_INFO"] }, note: { type: "string", maxLength: 300 }, decidedAt: TS, ...AGG }, required: ["requestRef", "orgRef", "clinicId", "decision", "decidedAt"] },
    example: { aggregateId: "pvu_01JF3ZM000", data: { requestRef: "pvu_01JF3ZM000", kiorexRef: "kvr_01JF3ZM111", orgRef: "ten_01JF3Z0000", clinicId: "clinic_01JF3Z7ZZZ", decision: "NEEDS_INFO", note: "Please upload a clearer licence scan.", decidedAt: "2027-03-05T09:12:44.000Z", aggregateType: "ProviderVerificationUpdate", aggregateId: "pvu_01JF3ZM000" } },
  },
  {
    type: "WAITLIST_OFFER_CREATED", producer: "kiorly-clinic", aggregateType: "WaitlistOffer", status: "v2-draft", group: "growth",
    description: "Kiorly FS-03 created an offer for a Kiorex-sourced waitlist entry (1.12.0). Same payload as WAITLIST_OFFER, which stays the delivered event; this name is the explicit, symmetric counterpart of WAITLIST_OFFER_EXPIRED so Kiorly stays the single system of record.",
    data: { properties: { offerId: ID, waitlistRef: ID, clinicId: ID, clinicianId: ID, startsAt: TS, expiresAt: TS, ...AGG }, required: ["offerId", "waitlistRef", "clinicId", "clinicianId", "startsAt", "expiresAt"] },
    example: { aggregateId: "wo_01JF3ZN000", data: { offerId: "wo_01JF3ZN000", waitlistRef: "kx_wl_01JF3ZN111", clinicId: "clinic_01JF3Z7ZZZ", clinicianId: "cln_01JF3Z8000", startsAt: "2027-03-05T10:00:00.000Z", expiresAt: "2027-03-05T09:30:00.000Z", aggregateType: "WaitlistOffer", aggregateId: "wo_01JF3ZN000" } },
  },
  {
    type: "WAITLIST_OFFER_EXPIRED", producer: "kiorly-clinic", aggregateType: "WaitlistOffer", status: "v2-draft", group: "growth",
    description: "A waitlist offer expired or was withdrawn without a booking (1.12.0).",
    data: { properties: { offerId: ID, waitlistRef: ID, clinicId: ID, reason: { enum: ["EXPIRED", "WITHDRAWN", "SLOT_TAKEN"] }, at: TS, ...AGG }, required: ["offerId", "waitlistRef", "clinicId", "reason", "at"] },
    example: { aggregateId: "wo_01JF3ZN000", data: { offerId: "wo_01JF3ZN000", waitlistRef: "kx_wl_01JF3ZN111", clinicId: "clinic_01JF3Z7ZZZ", reason: "EXPIRED", at: "2027-03-05T09:31:00.000Z", aggregateType: "WaitlistOffer", aggregateId: "wo_01JF3ZN000" } },
  },
  // ===================== 1.12.0 (additive), Rev 2.6 amendment: two separate credit systems and sponsored promotions =====================
  // Patient credit events (Kiorex, internal) NEVER reach a clinic; provider credit events (Clinic) NEVER reach a patient surface.
  {
    type: "RefundDestinationChosen", producer: "kiorex", aggregateType: "RefundDestinationChoice", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only, never delivered to a clinic). The patient chose where a refund of card money goes: the original payment method (default) or Kiorex credit (an option, never forced). Immutable once the refund executed. Opaque references, no identity (1.12.0).",
    data: { properties: { choiceRef: ID, market: MARKET, refundRef: ID, choice: { enum: ["ORIGINAL", "CREDIT"] }, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, source: { enum: ["PATIENT_CANCEL", "PATIENT_REFUND_REQUEST"] }, chosenAt: TS, ...AGG }, required: ["choiceRef", "refundRef", "choice", "amountMinor", "currency", "chosenAt"] },
    example: { aggregateId: "rdc_01JF3ZP000", data: { choiceRef: "rdc_01JF3ZP000", market: "EG", refundRef: "rfd_01JF3ZP111", choice: "ORIGINAL", amountMinor: 25000, currency: "EGP", source: "PATIENT_CANCEL", chosenAt: "2027-03-04T09:12:44.000Z", aggregateType: "RefundDestinationChoice", aggregateId: "rdc_01JF3ZP000" } },
  },
  {
    type: "RewardRestored", producer: "kiorex", aggregateType: "RewardLot", status: "v2-draft", group: "growth",
    description: "INTERNAL. Credit used on a booking was given back because the booking was refunded or cancelled: to the same lot when it is still unexpired, otherwise to a new restored lot (1.12.0).",
    data: { properties: { lotRef: ID, restoredLotRef: ID, market: MARKET, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, reasonCode: REASON_CODE, at: TS, ...AGG }, required: ["lotRef", "amountMinor", "currency", "reasonCode", "at"] },
    example: { aggregateId: "rwl_01JF3ZH000", data: { lotRef: "rwl_01JF3ZH000", market: "EG", amountMinor: 15000, currency: "EGP", reasonCode: "BOOKING_CANCELLED", at: "2027-03-04T09:12:44.000Z", aggregateType: "RewardLot", aggregateId: "rwl_01JF3ZH000" } },
  },
  {
    type: "GoodwillGranted", producer: "kiorex", aggregateType: "GoodwillGrant", status: "v2-draft", group: "growth",
    description: "INTERNAL. Support granted a service-recovery coupon or credit. Reason code from a closed list; no patient identity (1.12.0).",
    data: { properties: { grantRef: ID, lotRef: ID, market: MARKET, reason: { enum: ["PROVIDER_LATE_CANCEL", "LONG_WAIT", "FAILED_BOOKING", "PAYMENT_ISSUE", "OTHER_APPROVED"] }, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, secondApproval: { type: "boolean" }, at: TS, ...AGG }, required: ["grantRef", "lotRef", "reason", "amountMinor", "currency", "at"] },
    example: { aggregateId: "gwg_01JF3ZQ000", data: { grantRef: "gwg_01JF3ZQ000", lotRef: "rwl_01JF3ZH111", market: "EG", reason: "LONG_WAIT", amountMinor: 5000, currency: "EGP", secondApproval: false, at: "2027-03-04T09:12:44.000Z", aggregateType: "GoodwillGrant", aggregateId: "gwg_01JF3ZQ000" } },
  },
  ...["ProviderCreditGranted", "ProviderCreditConsumed", "ProviderCreditExpired"].map((t) => ({
    type: t, producer: "kiorly-clinic", aggregateType: "CreditWallet", status: "v2-draft", group: "growth",
    description: `INTERNAL to the Clinic (aggregate-only toward Kiorex ops). Provider credit wallet event ${t} (the existing CR-05 wallet: fee offsets, waivers, dispute-win credit, promotion credit). Tenant reference, category and amount only; it is a different ledger from the patient credit and never carries a patient identity (1.12.0).`,
    data: { properties: { walletRef: ID, orgRef: LINK_ORG_REF, category: { type: "string", pattern: "^[A-Z][A-Z0-9_]{2,40}$" }, reason: REASON_CODE, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, at: TS, ...AGG }, required: ["walletRef", "orgRef", "category", "amountMinor", "currency", "at"] },
    example: { aggregateId: "cwl_01JF3ZR000", data: { walletRef: "cwl_01JF3ZR000", orgRef: "ten_01JF3Z0000", category: "FEE_OFFSET", reason: t === "ProviderCreditGranted" ? "DISPUTE_WON" : t === "ProviderCreditConsumed" ? "COMMISSION_DRAWDOWN" : "EXPIRED", amountMinor: 4000, currency: "EGP", at: "2027-03-04T09:12:44.000Z", aggregateType: "CreditWallet", aggregateId: "cwl_01JF3ZR000" } },
  })),
  {
    type: "PROVIDER_PROMOTION_UPDATED", producer: "kiorly-clinic", aggregateType: "SponsoredPromotion", status: "v2-draft", group: "growth",
    description: "A clinic created, changed, paused or ended a provider-sponsored promotion; Kiorex keeps a projection of the ACTIVE ones to show 'Discount sponsored by <clinic>' and to quote (1.12.0, work package P2-S). The patient copy is public advertising text, reviewed before activation; never clinical content.",
    data: { properties: { promotionId: ID, version: { type: "integer", minimum: 1 }, orgRef: LINK_ORG_REF, clinicId: ID, status: { enum: ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "EXHAUSTED", "EXPIRED", "REJECTED", "ARCHIVED"] }, discount: { type: "object", properties: { kind: { enum: ["FIXED_MINOR", "PERCENT_BP"] }, value: { type: "integer", minimum: 1 }, maxPerBookingMinor: { type: "integer", minimum: 1 } }, required: ["kind", "value"] }, scope: { type: "object", properties: { doctorIds: { type: "array", items: ID, maxItems: 200 }, appointmentTypeIds: { type: "array", items: ID, maxItems: 200 }, careTypes: { type: "array", items: { enum: ["IN_CLINIC", "VIDEO", "HOME_VISIT"] } } } }, startsAt: TS, endsAt: TS, patientCopy: { type: "object", properties: { ar: { type: "string", maxLength: 300 }, en: { type: "string", maxLength: 300 } } }, contentHash: { type: "string", pattern: "^[0-9a-f]{64}$" }, name: { type: "object", properties: { ar: { type: "string", maxLength: 120 }, en: { type: "string", maxLength: 120 } }, description: "Promotion name in both languages (1.13.0, optional)." }, budgetCapMinor: { type: "integer", minimum: 0, description: "Funding ceiling in minor units (1.13.0, optional)." }, perPatientLimit: { type: "integer", minimum: 1, description: "Redemptions per patient (1.13.0, optional)." }, eligibility: { type: "object", description: "Non-clinical eligibility rules the Kiorex quote evaluates (1.13.0, optional)." }, fundingMode: { enum: ["WALLET_ONLY", "WALLET_THEN_INVOICE"], description: "1.13.0, optional." }, reviewKinds: { type: "array", items: { type: "string", pattern: "^[A-Z][A-Z_]{2,40}$" }, maxItems: 10, description: "Why the review was required (1.13.0, optional)." }, at: TS, ...AGG }, required: ["promotionId", "version", "orgRef", "status", "at"] },
    example: { aggregateId: "spr_01JF3ZS000", data: { promotionId: "spr_01JF3ZS000", version: 2, orgRef: "ten_01JF3Z0000", clinicId: "clinic_01JF3Z7ZZZ", status: "ACTIVE", discount: { kind: "FIXED_MINOR", value: 10000, maxPerBookingMinor: 10000 }, scope: { careTypes: ["IN_CLINIC"] }, startsAt: "2027-03-10T00:00:00.000Z", endsAt: "2027-04-10T00:00:00.000Z", patientCopy: { ar: "خصم برعاية العيادة", en: "Discount sponsored by the clinic" }, contentHash: "c".repeat(64), at: "2027-03-04T09:12:44.000Z", aggregateType: "SponsoredPromotion", aggregateId: "spr_01JF3ZS000" } },
  },
  {
    type: "PromotionReviewDecided", producer: "kiorex", aggregateType: "SponsoredPromotion", status: "v2-draft", group: "growth",
    description: "Kiorex ops decided the advertising and compliance review of a promotion version (content, scope or high value; high value needs a second approver). Delivered to the Clinic that owns the promotion (1.12.0, work package P2-S).",
    data: { properties: { promotionId: ID, version: { type: "integer", minimum: 1 }, orgRef: LINK_ORG_REF, reviewKind: { enum: ["CONTENT", "SCOPE", "HIGH_VALUE"] }, decision: { enum: ["APPROVED", "REJECTED", "NEEDS_CHANGES"] }, note: { type: "string", maxLength: 300 }, decidedAt: TS, ...AGG }, required: ["promotionId", "version", "orgRef", "reviewKind", "decision", "decidedAt"] },
    example: { aggregateId: "spr_01JF3ZS000", data: { promotionId: "spr_01JF3ZS000", version: 2, orgRef: "ten_01JF3Z0000", reviewKind: "CONTENT", decision: "APPROVED", decidedAt: "2027-03-05T09:12:44.000Z", aggregateType: "SponsoredPromotion", aggregateId: "spr_01JF3ZS000" } },
  },
  ...["SponsoredDiscountReserved", "SponsoredDiscountDebited", "SponsoredDiscountReleased", "SponsoredDiscountReversed"].map((t) => ({
    type: t, producer: "kiorly-clinic", aggregateType: "SponsoredPromotion", status: "v2-draft", group: "growth",
    description: `The Clinic tells Kiorex the state of the budget entry of a sponsored discount for one booking: ${t}. Opaque booking and reservation references and amounts only; never a patient identity (1.12.0, work package P2-S). Kiorex keeps one BookingSponsoredDiscount per booking and compares it with the Clinic ledger every day.`,
    data: { properties: { promotionId: ID, version: { type: "integer", minimum: 1 }, reservationRef: ID, bookingRef: ID, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, reason: REASON_CODE, at: TS, ...AGG }, required: ["promotionId", "version", "reservationRef", "bookingRef", "amountMinor", "currency", "at"] },
    example: { aggregateId: "spr_01JF3ZS000", data: { promotionId: "spr_01JF3ZS000", version: 2, reservationRef: "rsv_01JF3ZT000", bookingRef: "kx_bk_01JF3Z8P2M", amountMinor: 10000, currency: "EGP", reason: t === "SponsoredDiscountReserved" ? "HELD" : t === "SponsoredDiscountDebited" ? "VISIT_COMPLETED" : t === "SponsoredDiscountReleased" ? "CANCELLED" : "REFUNDED", at: "2027-03-12T10:00:00.000Z", aggregateType: "SponsoredPromotion", aggregateId: "spr_01JF3ZS000" } },
  })),
  // ── Phase 4 corporate programme (GRW-P4-C; additive, work package order 1.14.0, still unreleased: see CHANGELOG "Unreleased")
  {
    type: "CorporateAccountCreated", producer: "kiorex", aggregateType: "CorporateAccount", status: "v2-draft", group: "growth",
    description: "INTERNAL. A corporate account was opened by Kiorex ops (status LEAD). Opaque account reference, market and funding mode only: no company contact, no contract text, no member data (work package P4-C).",
    data: { properties: { accountRef: ID, market: MARKET, fundingMode: { enum: ["SPONSOR_CREDIT", "PLATFORM_PROMO"] }, createdAt: TS, ...AGG }, required: ["accountRef", "fundingMode", "createdAt"] },
    example: { aggregateId: "cac_01JF3ZC000", data: { accountRef: "cac_01JF3ZC000", market: "EG", fundingMode: "SPONSOR_CREDIT", createdAt: "2027-03-04T09:12:44.000Z", aggregateType: "CorporateAccount", aggregateId: "cac_01JF3ZC000" } },
  },
  {
    type: "CorporateCodeRedeemed", producer: "kiorex", aggregateType: "CorporateAccount", status: "v2-draft", group: "growth",
    description: "INTERNAL. A verified patient joined a corporate programme with a code, an e-mail domain or an HR list. The employer never receives this event: it carries the verification method and an opaque member reference only, never the person, the code or any booking (work package P4-C).",
    data: { properties: { accountRef: ID, memberRef: ID, market: MARKET, verifiedBy: { enum: ["CODE", "DOMAIN_EMAIL", "HR_LIST"] }, at: TS, ...AGG }, required: ["accountRef", "memberRef", "verifiedBy", "at"] },
    example: { aggregateId: "cac_01JF3ZC000", data: { accountRef: "cac_01JF3ZC000", memberRef: "cmb_01JF3ZC111", market: "EG", verifiedBy: "CODE", at: "2027-03-04T09:12:44.000Z", aggregateType: "CorporateAccount", aggregateId: "cac_01JF3ZC000" } },
  },
  {
    type: "CorporateLeadReferred", producer: "kiorly-clinic", aggregateType: "ProviderB2BReferral", status: "v2-draft", group: "growth",
    description: "A provider referred a company to Kiorex as an enterprise lead (Clinic to Kiorex). Company name, an optional size bucket and an opaque contact reference only: never a staff member's name, phone or e-mail, never a patient datum. No fee share or reward is created by this event (work package P4-C; any fee share is counsel and CEO gated).",
    data: { properties: { referralId: ID, orgRef: LINK_ORG_REF, clinicId: ID, companyName: { type: "string", minLength: 2, maxLength: 120 }, sizeBucket: { enum: ["1_49", "50_199", "200_999", "1000_PLUS", "UNKNOWN"] }, contactRef: { type: "string", maxLength: 80, description: "Opaque reference held by the referring provider; Kiorex ops asks the provider for the contact. Never a name, phone or e-mail." }, referredAt: TS, ...AGG }, required: ["referralId", "orgRef", "companyName", "referredAt"] },
    example: { aggregateId: "b2b_01JF3ZC222", data: { referralId: "b2b_01JF3ZC222", orgRef: "ten_01JF3Z0000", clinicId: "clinic_01JF3Z7ZZZ", companyName: "Nile Logistics", sizeBucket: "200_999", contactRef: "ref-hr-1", referredAt: "2027-03-04T09:12:44.000Z", aggregateType: "ProviderB2BReferral", aggregateId: "b2b_01JF3ZC222" } },
  },
  // ── 1.13.0 consolidated additive set (wave 7 to 9 lanes; see CHANGELOG "1.13.0"). Kiorex-internal growth events: aggregate references and counters only, never a person.
  ...[
    ["ExperimentStarted", "GrowthExperiment", "An experiment moved to RUNNING."],
    ["ExperimentStopped", "GrowthExperiment", "An experiment was stopped by a person or by the kill switch (reason is a short operator text, never a person)."],
    ["ExperimentConcluded", "GrowthExperiment", "An experiment reached a verdict."],
    ["ExperimentSrmDetected", "GrowthExperiment", "The sample-ratio-mismatch check failed; results are hidden until a person looks."],
    ["ExperimentShipRequested", "GrowthExperiment", "A winner was proposed for shipping; a human turns the flag on through the maker-checker (ship-winner never flips a flag)."],
  ].map(([t, agg, d]) => ({
    type: t, producer: "kiorex", aggregateType: agg, status: "v2-draft", group: "growth",
    description: `INTERNAL (Kiorex outbox only). ${d} Experiment id, market and key; never a visitor, a person or a health datum (1.13.0).`,
    data: { properties: { experimentId: ID, market: MARKET, key: { type: "string", minLength: 1, maxLength: 80 }, surface: { type: "string", maxLength: 120 }, reason: { type: "string", maxLength: 200 }, by: { enum: ["HUMAN", "SYSTEM", "KILL_SWITCH"] }, verdict: { type: "string", pattern: "^[A-Z][A-Z_]{2,32}$" }, pValue: { type: "number", minimum: 0, maximum: 1 }, at: TS, ...AGG }, required: ["experimentId", "market", "at"] },
    example: { aggregateId: "exp_01JF3ZE000", data: { experimentId: "exp_01JF3ZE000", market: "EG", key: "winback-subject-a-b", at: "2027-03-04T09:12:44.000Z", aggregateType: agg, aggregateId: "exp_01JF3ZE000" } },
  })),
  ...["FraudCaseOpened", "FraudCaseResolved"].map((t) => ({
    type: t, producer: "kiorex", aggregateType: "FraudCase", status: "v2-draft", group: "growth",
    description: `INTERNAL (Kiorex outbox only). ${t === "FraudCaseOpened" ? "A fraud case was opened (shadow or enforced)" : "A fraud case was resolved by a person or expired"}. Case id, surface, band and rule ids only: never an identity, a phone, a device id or a reward holder (identity lookup is a separate audited action). 1.13.0.`,
    data: { properties: { caseId: ID, market: MARKET, surface: { enum: ["REFERRAL_CLAIM", "REWARD", "REFERRAL_ELIGIBILITY", "WIDGET", "TOUCH", "PROVIDER_REVIEW"] }, band: { enum: ["LOW", "MEDIUM", "HIGH"] }, ruleIds: { type: "array", items: { type: "string", pattern: "^r_[a-z_]{2,30}$" }, maxItems: 20 }, enforced: { type: "boolean" }, resolution: { enum: ["CONFIRMED", "DISMISSED", "UPHELD_APPEAL", "EXPIRED"] }, at: TS, ...AGG }, required: ["caseId", "surface", "at"] },
    example: { aggregateId: "fc_01JF3ZF000", data: { caseId: "fc_01JF3ZF000", market: "EG", surface: "REWARD", band: "HIGH", ruleIds: ["r_farm"], enforced: false, ...(t === "FraudCaseResolved" ? { resolution: "DISMISSED" } : {}), at: "2027-03-04T09:12:44.000Z", aggregateType: "FraudCase", aggregateId: "fc_01JF3ZF000" } },
  })),
  ...["GrowthRecommendationProposed", "GrowthRecommendationDecided"].map((t) => ({
    type: t, producer: "kiorex", aggregateType: "GrowthRecommendation", status: "v2-draft", group: "growth",
    description: `INTERNAL (Kiorex outbox only). ${t === "GrowthRecommendationProposed" ? "A recommendation was proposed from aggregate counts" : "A person accepted, dismissed or let a recommendation expire"}. Rule id, kind and market only; a recommendation is built from aggregates (k >= 10) and never carries a person (error RECOMMENDATION_NOT_AGGREGATE). 1.13.0.`,
    data: { properties: { recommendationId: ID, market: MARKET, kind: { type: "string", pattern: "^[A-Z][A-Z_]{2,40}$" }, ruleId: { type: "string", maxLength: 60 }, decision: { enum: ["ACCEPTED", "DISMISSED", "EXPIRED"] }, at: TS, ...AGG }, required: ["recommendationId", "kind", "at"] },
    example: { aggregateId: "rec_01JF3ZG000", data: { recommendationId: "rec_01JF3ZG000", market: "EG", kind: "PAUSE_CAMPAIGN", ruleId: "campaign-cpa-high", ...(t === "GrowthRecommendationDecided" ? { decision: "DISMISSED" } : {}), at: "2027-03-04T09:12:44.000Z", aggregateType: "GrowthRecommendation", aggregateId: "rec_01JF3ZG000" } },
  })),
  ...["GrowthJourneyPublished", "GrowthJourneyKilled"].map((t) => ({
    type: t, producer: "kiorex", aggregateType: "GrowthJourney", status: "v2-draft", group: "growth",
    description: `INTERNAL (Kiorex outbox only). ${t === "GrowthJourneyPublished" ? "A custom automation journey was published (two-person rule)" : "A custom journey was killed or auto-stopped"}. Journey id, version and checksum only; never an audience list or message text. Any MARKETING send still needs growth.marketing_messaging. 1.13.0.`,
    data: { properties: { journeyId: ID, version: { type: "integer", minimum: 1 }, market: MARKET, checksum: { type: "string", pattern: "^[0-9a-f]{16,64}$" }, reason: { type: "string", maxLength: 200 }, at: TS, ...AGG }, required: ["journeyId", "at"] },
    example: { aggregateId: "jny_01JF3ZH000", data: { journeyId: "jny_01JF3ZH000", version: 1, market: "EG", checksum: "a".repeat(32), at: "2027-03-04T09:12:44.000Z", aggregateType: "GrowthJourney", aggregateId: "jny_01JF3ZH000" } },
  })),
  {
    type: "MarketOnboardingStateChanged", producer: "kiorex", aggregateType: "MarketOnboarding", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only). A market moved between onboarding states (DRAFT, STAGED, READY, LIVE_REQUESTED, PAUSED). `market.<cc>.live` stays the human gate; this event records the step, never turns anything on (1.13.0).",
    data: { properties: { market: MARKET, from: { type: "string", pattern: "^[A-Z][A-Z_]{2,30}$" }, to: { type: "string", pattern: "^[A-Z][A-Z_]{2,30}$" }, at: TS, ...AGG }, required: ["market", "to", "at"] },
    example: { aggregateId: "ZY", data: { market: "ZY", from: "DRAFT", to: "STAGED", at: "2027-03-04T09:12:44.000Z", aggregateType: "MarketOnboarding", aggregateId: "ZY" } },
  },
  {
    type: "SeoQualityGateFailed", producer: "kiorex", aggregateType: "SeoPage", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only). A public page failed a blocking SEO quality check (thin content, near duplicate, AR/EN parity, structured data, canonical, hreflang, claims, empty page, review markup, available providers). Page key and check ids only. `wouldNoindex` says what autoNoindex would do; nothing changes unless SEO_AUTOMATION.autoNoindex is on (1.13.0).",
    data: { properties: { market: MARKET, pageKey: { type: "string", minLength: 1, maxLength: 300 }, locale: { enum: ["ar", "en"] }, templateKind: { type: "string", maxLength: 40 }, score: { type: "number", minimum: 0, maximum: 100 }, failedChecks: { type: "array", items: { type: "string", maxLength: 60 }, maxItems: 30 }, wouldNoindex: { type: "boolean" }, at: TS, ...AGG }, required: ["market", "pageKey", "locale", "failedChecks", "at"] },
    example: { aggregateId: "doctor/dr-sample|ar", data: { market: "EG", pageKey: "doctor/dr-sample", locale: "ar", templateKind: "doctor", score: 61, failedChecks: ["thin-content"], wouldNoindex: true, at: "2027-03-04T09:12:44.000Z", aggregateType: "SeoPage", aggregateId: "doctor/dr-sample|ar" } },
  },
  {
    type: "SeoVitalBudgetBreached", producer: "kiorex", aggregateType: "SeoVital", status: "v2-draft", group: "growth",
    description: "INTERNAL (Kiorex outbox only). A Core Web Vitals p75 (lab or field) of a template went over its budget from SEO_AUTOMATION.vitals. Template kind, metric, source and the p75 only. Blocks nothing in code (1.13.0).",
    data: { properties: { market: MARKET, templateKind: { type: "string", maxLength: 40 }, metric: { enum: ["lcpMs", "inpMs", "cls", "tbtMs", "perfScore"] }, source: { enum: ["LAB", "FIELD"] }, p75: { type: "number" }, budget: { type: "number" }, day: { type: "string", pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" }, targets: { type: "array", items: { type: "string", maxLength: 80 }, maxItems: 10 }, ...AGG }, required: ["market", "templateKind", "metric", "source", "p75", "day"] },
    example: { aggregateId: "doctor|lcpMs|FIELD", data: { market: "EG", templateKind: "doctor", metric: "lcpMs", source: "FIELD", p75: 3100, budget: 2500, day: "2027-03-04", targets: ["ops"], aggregateType: "SeoVital", aggregateId: "doctor|lcpMs|FIELD" } },
  },
  // ── Phase 4 loyalty and partnerships (GRW-P4-D; additive, still unreleased: see CHANGELOG "Unreleased")
  {
    type: "LoyaltyPointsAccrued", producer: "kiorex", aggregateType: "LoyaltyAccount", status: "v2-draft", group: "growth",
    description: "INTERNAL. Loyalty points were added to a patient's separate points ledger for a COMPLETED booking (or a tier bonus). Opaque account reference and amounts only: no booking, provider, specialty or person. Points are not money (work package P4-D).",
    data: { properties: { accountRef: ID, market: MARKET, entryType: { enum: ["ACCRUE", "TIER_BONUS"] }, points: { type: "integer", minimum: 1 }, tier: { enum: ["NONE", "SILVER", "GOLD", "PLATINUM"] }, at: TS, ...AGG }, required: ["accountRef", "entryType", "points", "at"] },
    example: { aggregateId: "lac_01JF4DA000", data: { accountRef: "lac_01JF4DA000", market: "EG", entryType: "ACCRUE", points: 10, tier: "SILVER", at: "2027-03-04T09:12:44.000Z", aggregateType: "LoyaltyAccount", aggregateId: "lac_01JF4DA000" } },
  },
  {
    type: "LoyaltyPointsConverted", producer: "kiorex", aggregateType: "LoyaltyAccount", status: "v2-draft", group: "growth",
    description: "INTERNAL. Points were converted into a reward lot of kind LOYALTY in the existing patient reward ledger (one transaction). The lot reference and its value are the only link; there is no cash, top-up or transfer path (work package P4-D).",
    data: { properties: { accountRef: ID, market: MARKET, points: { type: "integer", minimum: 1 }, lotRef: ID, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, at: TS, ...AGG }, required: ["accountRef", "points", "lotRef", "amountMinor", "currency", "at"] },
    example: { aggregateId: "lac_01JF4DA000", data: { accountRef: "lac_01JF4DA000", market: "EG", points: 100, lotRef: "rwl_01JF4DB000", amountMinor: 5000, currency: "EGP", at: "2027-03-04T09:12:44.000Z", aggregateType: "LoyaltyAccount", aggregateId: "lac_01JF4DA000" } },
  },
  {
    type: "PartnershipCodeRedeemed", producer: "kiorex", aggregateType: "PartnershipProgram", status: "v2-draft", group: "growth",
    description: "INTERNAL. A patient redeemed a partnership code; a reward lot was issued inside the program budget (enforced in the database). Opaque program, redemption and lot references only: never the person or the code (work package P4-D).",
    data: { properties: { programRef: ID, redemptionRef: ID, lotRef: ID, market: MARKET, kind: { enum: ["CODE_DISCOUNT", "CO_PROMO", "CARD_OFFER"] }, amountMinor: { type: "integer", minimum: 1 }, currency: { type: "string", minLength: 3, maxLength: 3 }, at: TS, ...AGG }, required: ["programRef", "redemptionRef", "lotRef", "amountMinor", "currency", "at"] },
    example: { aggregateId: "ptp_01JF4DC000", data: { programRef: "ptp_01JF4DC000", redemptionRef: "pcr_01JF4DD000", lotRef: "rwl_01JF4DB001", market: "EG", kind: "CODE_DISCOUNT", amountMinor: 3000, currency: "EGP", at: "2027-03-04T09:12:44.000Z", aggregateType: "PartnershipProgram", aggregateId: "ptp_01JF4DC000" } },
  },
];

export const ENVELOPE = {
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: "https://contracts.kiorex.com/events/envelope.schema.json",
  title: "KiorexEventEnvelope",
  description: "Outbox/webhook envelope. Kiorly's body is exactly {eventId,type,aggregateType,aggregateId,target,occurredAt,data}. Consumers de-duplicate on eventId (at-least-once).",
  type: "object",
  properties: {
    eventId: { type: "string", minLength: 1, description: "Unique per event (Kiorly: outbox row id). De-dup key." },
    type: { type: "string", minLength: 1 },
    aggregateType: { type: "string", minLength: 1 },
    aggregateId: { type: "string", minLength: 1 },
    target: { type: "string", description: "Kiorly outbox target, e.g. KIOREX. Optional for other producers." },
    occurredAt: { type: "string", format: "date-time" },
    data: { type: "object" },
  },
  required: ["eventId", "type", "aggregateType", "aggregateId", "occurredAt", "data"],
};

export function buildSchema(ev) {
  const file = ev.file ?? ev.type;
  const types = [ev.type, ...(ev.aliases ?? [])];
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: `https://contracts.kiorex.com/events/${file}.schema.json`,
    title: file,
    description: ev.description,
    "x-producer": ev.producer,
    "x-status": ev.status,
    allOf: [{ $ref: "envelope.schema.json" }],
    type: "object",
    properties: {
      type: types.length === 1 ? { const: ev.type } : { enum: types },
      aggregateType: ev.aggregateTypeAlt ? { enum: [ev.aggregateType, ...ev.aggregateTypeAlt] } : { const: ev.aggregateType },
      data: { type: "object", ...ev.data },
    },
    required: ["type", "aggregateType", "data"],
  };
}

export function buildExample(ev) {
  return {
    eventId: `01JF3ZEVT${ev.type.replace(/[^A-Za-z]/g, "").slice(0, 8).toUpperCase().padEnd(8, "X")}`,
    type: ev.type,
    aggregateType: ev.aggregateType,
    aggregateId: ev.example.aggregateId,
    ...(ev.producer === "kiorly-clinic" || (ev.producer === "kiorly-lab" && ev.type !== "LabResultReleased") ? { target: "KIOREX" } : {}),
    occurredAt: "2027-03-04T09:12:44.000Z",
    data: ev.example.data,
  };
}
