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
        clinic: { type: "object", description: "Published clinic profile." }, ...AGG,
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
    type: "VISIT_SUMMARY_SHARED", producer: "kiorly-clinic", aggregateType: "Encounter", status: "kiorly-extra",
    description: "Signed visit summary pushed to the Kiorex record vault after patient consent (KX-11). Not in KX-09 §04. Contains clinical content: never log it.",
    data: {
      properties: {
        patientId: ID, scope: { const: "VISIT_SUMMARY" },
        summary: { type: "object", properties: { encounterId: ID, clinicId: ID, signedAt: TS, soap: { type: "object", properties: { chiefComplaint: NSTR, subjective: NSTR, objective: NSTR, assessment: NSTR, plan: NSTR } } }, required: ["encounterId", "clinicId", "signedAt", "soap"] },
        signature: { type: "string", description: "hex HMAC-SHA256 over JSON.stringify(summary) with KIOREX_RECORD_SHARE_HMAC_SECRET." }, ...AGG,
      },
      required: ["patientId", "scope", "summary", "signature"],
    },
    example: { aggregateId: "enc_01JF3ZB000", data: { patientId: "pat_01JF3Z0000", scope: "VISIT_SUMMARY", summary: { encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", signedAt: "2027-03-05T11:10:00.000Z", soap: { chiefComplaint: "Cough", subjective: null, objective: null, assessment: null, plan: null } }, signature: "0".repeat(64), aggregateType: "Encounter", aggregateId: "enc_01JF3ZB000" } },
  },
  {
    type: "PRESCRIPTION_SHARED", producer: "kiorly-clinic", aggregateType: "Encounter", status: "kiorly-extra",
    description: "Prescription of a signed encounter shared with the patient app after consent. Not in KX-09 §04.",
    data: { properties: { patientId: ID, scope: { const: "PRESCRIPTIONS" }, encounterId: ID, clinicId: ID, signedAt: TS, pdf: { type: "object", description: "Signed expiring public link to the Rx PDF (additive, 1.1.0); fetch it into the patient vault before expiresAt.", properties: { url: { type: "string", format: "uri" }, expiresAt: TS }, required: ["url", "expiresAt"] }, ...AGG }, required: ["patientId", "scope", "encounterId", "clinicId", "signedAt"] },
    example: { aggregateId: "enc_01JF3ZB000", data: { patientId: "pat_01JF3Z0000", scope: "PRESCRIPTIONS", encounterId: "enc_01JF3ZB000", clinicId: "clinic_01JF3Z7ZZZ", signedAt: "2027-03-05T11:10:00.000Z", pdf: { url: "https://app.kiorly.com/api/v1/public/rx/verify/abc123/pdf", expiresAt: "2027-03-19T11:10:00.000Z" }, aggregateType: "Encounter", aggregateId: "enc_01JF3ZB000" } },
  },
  {
    type: "RECORD_SHARE_REVOKED", producer: "kiorly-clinic", aggregateType: "Patient", status: "kiorly-extra",
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
    description: "Kiorly Clinic handed a lab order to Kiorly Lab via Kiorex (KCV204, clinic.lab_order_handoff). A patient consent token (LAB_RESULTS record-share grant) is required. One event per order. Additive in 1.1.0.",
    data: {
      properties: {
        orderId: ID, encounterId: ID, clinicId: ID, patientRef: { type: "string", minLength: 1, description: "Kiorly patient reference; never a national ID." },
        orderingClinicianId: ID, consentToken: { type: "string", minLength: 1 }, orderedAt: TS,
        items: { type: "array", minItems: 1, items: { type: "object", properties: { code: S, nameEn: { type: "string", minLength: 1 }, nameAr: S }, required: ["nameEn"] } },
        notes: S, preferredLabId: ID, ...AGG,
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
    type: "DispenseCompleted", producer: "kiorly-pharmacy", aggregateType: "PharmacyOrder", status: "v2-draft",
    description: "Order dispensed to the patient. Pharmacist sign-off must be present (KPRX06).",
    data: { properties: { orderId: ID, pharmacyId: ID, branchId: ID, dispensedAt: TS, pharmacistSignoff: { type: "object", properties: { userId: ID, signedAt: TS }, required: ["userId", "signedAt"] }, partial: { type: "boolean" } }, required: ["orderId", "pharmacyId", "dispensedAt", "pharmacistSignoff"] },
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
      aggregateType: { const: ev.aggregateType },
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
    ...(ev.producer === "kiorly-clinic" ? { target: "KIOREX" } : {}),
    occurredAt: "2027-03-04T09:12:44.000Z",
    data: ev.example.data,
  };
}
