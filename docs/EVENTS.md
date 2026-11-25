# Event catalogue

Generated from `events/index.json` and `flags/catalogue.json` (documentation snapshot; the schemas in `events/` are authoritative). Every event travels in the envelope `events/envelope.schema.json`: `{eventId, type, aggregateType, aggregateId, occurredAt, target, data}`. Consumers de-duplicate on `eventId` and must tolerate unknown fields and unknown event types (log + 2xx).

| Type | Producer | Aggregate | Status | Aliases | Schema |
|---|---|---|---|---|---|
| `APPOINTMENT_CONFIRMED` | kiorly-clinic | Appointment | emitted |  | [APPOINTMENT_CONFIRMED.schema.json](../events/APPOINTMENT_CONFIRMED.schema.json) |
| `RESCHEDULED` | kiorly-clinic | Appointment | emitted | `APPOINTMENT_RESCHEDULED` | [APPOINTMENT_RESCHEDULED.schema.json](../events/APPOINTMENT_RESCHEDULED.schema.json) |
| `CANCELLED_BY_CLINIC` | kiorly-clinic | Appointment | emitted |  | [CANCELLED_BY_CLINIC.schema.json](../events/CANCELLED_BY_CLINIC.schema.json) |
| `CANCELLED_BY_PATIENT` | kiorly-clinic | Appointment | emitted |  | [CANCELLED_BY_PATIENT.schema.json](../events/CANCELLED_BY_PATIENT.schema.json) |
| `CHECKED_IN` | kiorly-clinic | Appointment | emitted |  | [CHECKED_IN.schema.json](../events/CHECKED_IN.schema.json) |
| `CHECK_IN_REVERTED` | kiorly-clinic | Appointment | emitted |  | [CHECK_IN_REVERTED.schema.json](../events/CHECK_IN_REVERTED.schema.json) |
| `COMPLETED` | kiorly-clinic | Appointment | emitted |  | [COMPLETED.schema.json](../events/COMPLETED.schema.json) |
| `NO_SHOW` | kiorly-clinic | Appointment | emitted |  | [NO_SHOW.schema.json](../events/NO_SHOW.schema.json) |
| `SLOTS_CHANGED` | kiorly-clinic | Clinic | emitted |  | [SLOTS_CHANGED.schema.json](../events/SLOTS_CHANGED.schema.json) |
| `PROVIDER_PROFILE_UPDATED` | kiorly-clinic | MarketplaceListing | emitted |  | [PROVIDER_PROFILE_UPDATED.schema.json](../events/PROVIDER_PROFILE_UPDATED.schema.json) |
| `LISTING_STATUS_CHANGED` | kiorly-clinic | MarketplaceListing | emitted |  | [LISTING_STATUS_CHANGED.schema.json](../events/LISTING_STATUS_CHANGED.schema.json) |
| `COMMISSION_CHARGE_CREATED` | kiorly-clinic | Appointment | emitted |  | [COMMISSION_CHARGE_CREATED.schema.json](../events/COMMISSION_CHARGE_CREATED.schema.json) |
| `COMMISSION_CHARGE_REVERSED` | kiorly-clinic | Appointment | emitted |  | [COMMISSION_CHARGE_REVERSED.schema.json](../events/COMMISSION_CHARGE_REVERSED.schema.json) |
| `COMMISSION_CHARGE_STATUS_CHANGED` | kiorly-clinic | Appointment | emitted |  | [COMMISSION_CHARGE_STATUS_CHANGED.schema.json](../events/COMMISSION_CHARGE_STATUS_CHANGED.schema.json) |
| `REVIEW_INVITATION_ELIGIBLE` | kiorly-clinic | Appointment | emitted |  | [REVIEW_INVITATION_ELIGIBLE.schema.json](../events/REVIEW_INVITATION_ELIGIBLE.schema.json) |
| `REVIEW_REPLY_POSTED` | kiorly-clinic | KiorexReview | emitted |  | [REVIEW_REPLY_POSTED.schema.json](../events/REVIEW_REPLY_POSTED.schema.json) |
| `MARKETPLACE_BOOKING_CONFIRM_TIMEOUT` | kiorly-clinic | Appointment | kiorly-extra |  | [MARKETPLACE_BOOKING_CONFIRM_TIMEOUT.schema.json](../events/MARKETPLACE_BOOKING_CONFIRM_TIMEOUT.schema.json) |
| `VISIT_SUMMARY_SHARED` | kiorly-clinic | Encounter | kiorly-extra |  | [VISIT_SUMMARY_SHARED.schema.json](../events/VISIT_SUMMARY_SHARED.schema.json) |
| `PRESCRIPTION_SHARED` | kiorly-clinic | Encounter | kiorly-extra |  | [PRESCRIPTION_SHARED.schema.json](../events/PRESCRIPTION_SHARED.schema.json) |
| `RECORD_SHARE_REVOKED` | kiorly-clinic | Patient | kiorly-extra |  | [RECORD_SHARE_REVOKED.schema.json](../events/RECORD_SHARE_REVOKED.schema.json) |
| `WAITLIST_OFFER` | kiorly-clinic | WaitlistOffer | emitted |  | [WAITLIST_OFFER.schema.json](../events/WAITLIST_OFFER.schema.json) |
| `PrescriptionIssued` | kiorly-clinic | Prescription | emitted |  | [PrescriptionIssued.schema.json](../events/PrescriptionIssued.schema.json) |
| `LabOrderPlaced` | kiorly-clinic | LabOrder | emitted |  | [LabOrderPlaced.schema.json](../events/LabOrderPlaced.schema.json) |
| `OrderReady` | kiorly-pharmacy | PharmacyOrder | v2-draft |  | [OrderReady.schema.json](../events/OrderReady.schema.json) |
| `OrderOutForDelivery` | kiorly-pharmacy | PharmacyOrder | v2-draft |  | [OrderOutForDelivery.schema.json](../events/OrderOutForDelivery.schema.json) |
| `DispenseCompleted` | kiorly-pharmacy | PharmacyOrder | v2-draft |  | [DispenseCompleted.schema.json](../events/DispenseCompleted.schema.json) |
| `OrderRejected` | kiorly-pharmacy | PharmacyOrder | v2-draft |  | [OrderRejected.schema.json](../events/OrderRejected.schema.json) |
| `LabResultReleased` | kiorly-lab | LabReport | v2-draft |  | [LabResultReleased.schema.json](../events/LabResultReleased.schema.json) |
| `LabOrderCreated` | kiorly-lab | LabOrder | v2-draft |  | [LabOrderCreated.schema.json](../events/LabOrderCreated.schema.json) |
| `LabOrderStatusChanged` | kiorly-lab | LabOrder | v2-draft |  | [LabOrderStatusChanged.schema.json](../events/LabOrderStatusChanged.schema.json) |
| `LabCriticalEscalated` | kiorly-lab | CriticalAlert | v2-draft |  | [LabCriticalEscalated.schema.json](../events/LabCriticalEscalated.schema.json) |
| `LabReportCorrected` | kiorly-lab | LabReport | v2-draft |  | [LabReportCorrected.schema.json](../events/LabReportCorrected.schema.json) |
| `LabInvoiceIssued` | kiorly-lab | Invoice | v2-draft |  | [LabInvoiceIssued.schema.json](../events/LabInvoiceIssued.schema.json) |
| `LabPaymentRecorded` | kiorly-lab | Payment | v2-draft |  | [LabPaymentRecorded.schema.json](../events/LabPaymentRecorded.schema.json) |
| `subject.deleted` | kiorex-account | Subject | v2-draft |  | [subject.deleted.schema.json](../events/subject.deleted.schema.json) |
| `session.revoked` | kiorex-account | Session | v2-draft |  | [session.revoked.schema.json](../events/session.revoked.schema.json) |
| `guardian.link.changed` | kiorex-account | GuardianLink | v2-draft |  | [guardian.link.changed.schema.json](../events/guardian.link.changed.schema.json) |
| `membership.changed` | kiorex-account | Membership | v2-draft |  | [membership.changed.schema.json](../events/membership.changed.schema.json) |
| `account.merged` | kiorex-account | Account | v2-draft |  | [account.merged.schema.json](../events/account.merged.schema.json) |
| `flag.changed` | kiorex-control-plane | Flag | v2-draft |  | [flag.changed.schema.json](../events/flag.changed.schema.json) |
| `HOME_VISIT_ASSIGNED` | kiorly-clinic | Appointment | v2-draft |  | [HOME_VISIT_ASSIGNED.schema.json](../events/HOME_VISIT_ASSIGNED.schema.json) |
| `HOME_VISIT_EN_ROUTE` | kiorly-clinic | Appointment | v2-draft |  | [HOME_VISIT_EN_ROUTE.schema.json](../events/HOME_VISIT_EN_ROUTE.schema.json) |
| `HOME_VISIT_ABORTED_UNSAFE` | kiorly-clinic | Appointment | v2-draft |  | [HOME_VISIT_ABORTED_UNSAFE.schema.json](../events/HOME_VISIT_ABORTED_UNSAFE.schema.json) |
| `SAFETY_ALERT_RAISED` | kiorly-clinic | SafetyAlert | v2-draft |  | [SAFETY_ALERT_RAISED.schema.json](../events/SAFETY_ALERT_RAISED.schema.json) |
| `CARE_PLAN_CONFIRMED` | kiorly-clinic | CarePlan | v2-draft |  | [CARE_PLAN_CONFIRMED.schema.json](../events/CARE_PLAN_CONFIRMED.schema.json) |
| `CARE_PLAN_ENDED` | kiorly-clinic | CarePlan | v2-draft |  | [CARE_PLAN_ENDED.schema.json](../events/CARE_PLAN_ENDED.schema.json) |
| `ReferralIssued` | kiorly-clinic | Referral | v2-draft |  | [ReferralIssued.schema.json](../events/ReferralIssued.schema.json) |
| `MedicationOrderShared` | kiorly-clinic | DoctorOrder | v2-draft |  | [MedicationOrderShared.schema.json](../events/MedicationOrderShared.schema.json) |
| `CommissionAdjusted` | kiorly-clinic | Appointment | v2-draft |  | [CommissionAdjusted.schema.json](../events/CommissionAdjusted.schema.json) |
| `PatientConsentUpdated` | kiorex | PatientConsent | v2-draft |  | [PatientConsentUpdated.schema.json](../events/PatientConsentUpdated.schema.json) |
| `AttributionAssigned` | kiorex | BookingIntent | v2-draft |  | [AttributionAssigned.schema.json](../events/AttributionAssigned.schema.json) |
| `PatientAcquisitionRecorded` | kiorex | PatientProfile | v2-draft |  | [PatientAcquisitionRecorded.schema.json](../events/PatientAcquisitionRecorded.schema.json) |
| `ReferralLinkCreated` | kiorly-clinic | ProviderReferralLink | v2-draft |  | [ReferralLinkCreated.schema.json](../events/ReferralLinkCreated.schema.json) |

Back to the [README](../README.md) · [Docs index](INDEX.md)
