# Changelog

Semver per contract (KX-09 §07). Additive = minor; removing/renaming a field, type string or path = major with 90-day dual support.

## Unreleased (documentation only)

- `openapi/kiorly-lab.v1.openapi.json`: the 401 description of the partner routes now reads `HMAC_REJECTED (...)`, the code the Lab returns since the kx-test hardening (27 Nov 2026), identical in shape to the Pharmacy: `{ statusCode: 401, code: "HMAC_REJECTED", message: <reason> }` (previously `INVALID_CLIENT`, `INVALID_SIGNATURE` with `reason`, `REPLAYED_NONCE`). No schema, path or field changed; the platform client only reads the status.

## 1.13.1 (patch, additive; tagged locally `v1.13.1`, NOT published)

### Added
- `INTEGRATION_MODES` config schema accepts the keys `CARD_GATEWAY` (generic card acquirer) and `BANK_IPN` (bank / IPN rail), each `mock` or `real`, like every other integration. Additive only: no key, enum value or default removed; a stored 1.13.0 payload validates unchanged and an absent key still means "mock". The Kiorex platform patched both keys locally; that patch is removed once this tarball is vendored.
- Proof: `test/growth-config-sweep.test.ts` (new INTEGRATION_MODES 1.13.1 case) and the unchanged 1.12.0 baseline test. `CONTRACTS_VERSION` = 1.13.1.

## 1.13.0 (consolidated; PREPARED on branch `contracts-1.13.0`, NOT tagged, NOT published: the founder decides the publish)

Additive minor over 1.12.0 (no field, type string, path, enum value (one request enum gains a value), config key or flag removed or renamed; every new field is optional; no required field added to an existing event, schema or request). This one release **replaces** the "unreleased 1.13.0 and 1.14.0" arrangement: the Phase 4 corporate set that was waiting for "1.14.0" (below) is part of this release, so one publish carries everything every wave asked for (launch guide 11.38, 11.41, 11.63, 11.76, 11.81, 11.88, 11.91, 11.94, 11.121). Additive proof: `test/growth-1.13.test.ts` against `test/growth-baseline-1.12.0.json`.

### Added
- **Config kinds** (JSON Schema, also `@kiorex/contracts/growth-config/*`): `FRAUD_RULES` (twoPersonOnMoney cannot be switched off; per-surface actions closed so a surface can never reach attribution, commission or booking), `SEO_AUTOMATION` (`autoNoindex` default false), `LTV_POLICY` and `EXPERIMENT_POLICY` (k floor 10), `ATTRIBUTION_MODELS` (reporting only), `AUTOMATION_POLICY` (journey caps), `MARKET_PROFILE` (market facts; `market.<cc>.live` stays the human gate), the Phase 4 `CORPORATE_POLICY` and `LOYALTY_RULES` (points per completed booking, tiers, window, FIFO expiry, annual cap, conversion block; every amount 0 = off; no cash, top-up or transfer key). Optional `ATTRIBUTION_POLICY.products.<PHARMACY|LAB|NURSE>.windows`. Shapes are the ones the Kiorex API already validates locally, so the local validators can be removed after publishing.
- **COM-3 commission policy on the rate view (additive, same 1.13.0)**: `CommissionRateView` gains optional `disclosure` (provider-facing texts as the Kiorex super admin entered them, Arabic and English, empty = wording not set: hide the block, keep the numbers; `showOverrideReason`) and `counsel` (funds-flow counsel status of the market, informational); the rate spec gains optional `currency`, `rounding`, `minCollectMinor`, `graceDays`, `retryDays`, `invoiceDueDays`, `reminderDays`, `disputeWindowDays`, `savedMethodChargeAllowed`. No value and no wording is part of this package. Nothing required was added. NOT published.
- **Config kinds, configurability sweep (additive, same 1.13.0)**: `RECOMMENDATION_POLICY` (k never below 10), `REWARD_GUARDS` (loss block never below 30 days), `LIFECYCLE_STAGES`, `CROSS_PRODUCT_POLICY`, `REFERRAL_FRAUD_THRESHOLDS` (14 detection numbers, bounded on both sides), `INTEGRATION_RUNTIME` (circuit breaker and retry) and `INTEGRATION_MODES` (the approved mock or real mode per integration, never a credential). Every property carries a `default` equal to the value that shipped in code, so a stored version that omits a key changes nothing. `EXPERIMENT_POLICY`, `AUTOMATION_POLICY` and `ATTRIBUTION_MODELS` were already in this set; the platform now reads them. Proof: `test/growth-config-sweep.test.ts` plus the unchanged 1.12.0 baseline test.
- **Flags** (catalogue 103 keys): `growth.attribution_models`, `growth.cohorts_ltv`, `growth.fraud_scoring` (ON, shadow), `growth.automation_journeys`, `growth.ai_recommendations` (**launch-locked**, KX-11 governance), `growth.seo_automation`, `growth.market_onboarding`, `clinic.sponsored_promotions` (Clinic mirror, org scope), plus `growth.corporate` and `growth.loyalty` (both launch-locked). A flag absent from the catalogue evaluates ON today; after the publish these have documented defaults.
- **Events** (Kiorex outbox, aggregate references only): `ExperimentStarted`, `ExperimentStopped`, `ExperimentConcluded`, `ExperimentSrmDetected`, `ExperimentShipRequested`, `FraudCaseOpened`, `FraudCaseResolved`, `GrowthRecommendationProposed`, `GrowthRecommendationDecided`, `GrowthJourneyPublished`, `GrowthJourneyKilled`, `MarketOnboardingStateChanged`, `SeoQualityGateFailed`, `SeoVitalBudgetBreached`, the Phase 4 `CorporateAccountCreated`, `CorporateCodeRedeemed`, `CorporateLeadReferred`, and the Phase 4 loyalty events `LoyaltyPointsAccrued`, `LoyaltyPointsConverted`, `PartnershipCodeRedeemed` (internal, opaque references only). Optional fields: `PROVIDER_PROMOTION_UPDATED` gains `name`, `budgetCapMinor`, `perPatientLimit`, `eligibility`, `fundingMode`, `reviewKinds`; `PatientAcquisitionRecorded` gains `product`.
- **OpenAPI**: marketplace 1.7.0: `POST /promotions/{promotionId}/reverse`, `POST /promotions/{promotionId}/review-decision`, `GET /growth/staff-phone-match` (keyed hashes in, one boolean out), the optional `sponsoredDiscount {applied, amountMinor, reason}` on the `POST /bookings` 201 answer. Pharmacy and Lab `ProductAcquisitionBlock`: `origin` accepts `CROSS_PRODUCT`, optional `factRef`.
- **`src/growth.ts`**: `PHASE3_ERROR_CODES` (`JOURNEY_INVALID`, `RECOMMENDATION_NOT_AGGREGATE`) with statuses, `GROWTH_FLAGS_1_13`, `PRODUCT_FUNNEL_EVENTS` (`order_started`, `order_placed`, `lab_booking_started`, `lab_booking_placed`), `LOYALTY_TIERS`, `LOYALTY_ENTRY_TYPES` (ACCRUE, EXPIRE, REVERSE, TIER_BONUS, CONVERT: no wallet verb), `PARTNERSHIP_KINDS`, `PARTNERSHIP_STATUSES`, `PARTNERSHIP_FUNDING_MODES`, `LOYALTY_ERROR_CODES`, `QUARANTINE_TOUCH_ACTION`, `PROMOTION_EXPENSE_LINE_CODE`, `staffPhoneMatchHash` / `staffPhoneMatchDigits` and `fixtures/growth-v1.13/staff-phone-match-vectors.json` (the Clinic and Kiorex keep their own copy and prove it against the vectors).

- **Commission rates and charge status (COM-1 / COM-2, additive, same 1.13.0)**: the event `COMMISSION_CHARGE_STATUS_CHANGED` (the Clinic has emitted it since COM-1; Kiorex mirrors it as a claim, idempotently and in time order) and the optional `tenantId`, `clinicId`, `decisionAmount`, `disputeDeadline`, `disputeStatus` on the three `COMMISSION_CHARGE_*` events (Kiorly Clinic already sends them). Rates are set by default **per organisation type** (CLINIC, PHARMACY, LAB) and overridden **per organisation** by Kiorex super admins under maker-checker, append-only and effective-dated; the product only displays them. New signed Kiorex-to-partner commands: marketplace `POST /commission-rates` (and the documented `POST /commission-collections`), pharmacy `POST /marketplace/v1/commission-rates`, lab `POST /integration/v1/commission-rates`, all with the schema `CommissionRateView` (history rows with scope DEFAULT or ORG, kind RATE or INHERIT, effectiveFrom, reason, spec; a monotonic `version`; no actor identity). `src/commission-rate.ts` ships the vocabulary and the reference `effectiveCommissionRate` / `commissionAmountMinor`; `fixtures/commission-v1.13/rate-vectors.json` proves every implementation against the same cases. **No numeric rate is part of the contract**: an empty history is "rate not set" and no commission is charged (the numbers are a founder / finance decision). Proof: `test/commission-rate-1.13.test.ts`.

- **Cross-product hints (gap closure, optional)**: `PRESCRIPTION_SHARED.data.appointmentId` and `LabOrderPlaced.data.appointmentId` (the visit the document came from; absent = Kiorex infers within 7 days), the new Clinic event `CARE_PLAN_SUGGESTED` (ids and a time only; a clinician prompt for follow-up care at home), and an optional `acquisition` (existing `AcquisitionBlock`) on the marketplace `CarePlanRequest`; optional visit times `CHECKED_IN.checkedInAt`, `COMPLETED.checkedInAt` and `COMPLETED.completedAt` (the Kiorex short-visit fraud rule; times only).

### Not in 1.13.0 (needs a person)
- A separate `growth.product_ingest` flag: `growth.attribution` keeps gating it unless the founder asks for a switch.
- Ratification of the draft partner events (`OrderReady`, `DispenseCompleted`, `OrderRejected`, `LabResultReleased`) stays human (G-14).
- Counsel and founder gates on every launch-locked flag.

### Package
- `CONTRACTS_VERSION` = 1.13.0. Consumers pin it with `npm run pack:local` after the founder publishes.

### (history) the corporate set that was written as unreleased 1.14.0, now inside 1.13.0


Additive only. `package.json` stays 1.12.0 and no tarball is packed: 1.13.0 (wave 7 kinds, events and flags) has not been published, so a version jump here would hide it. Consumers keep the vendored 1.12.0 tarball and validate these items locally until the single publish.

### Added
- **Flag** `growth.corporate` (kiorex, global and market, **launch-locked**: counsel on employee data and benefit tax treatment, CFO on invoicing, H-16). `whenOff`: no code redeemed, no benefit quoted or applied; accounts, leads and aggregate reports stay visible to ops; benefits already reserved are settled normally.
- **Config kind** `CORPORATE_POLICY` (schema `src/growth-config/CORPORATE_POLICY.schema.json`): eligibility checks (open code, verified e-mail domain, approved HR list), funding mode, code format, HR list match window, `minAggregateK` (cannot be below 10). It holds **no price, discount value or ceiling**: those are per-account terms entered by ops after a signed contract (NEEDS_HUMAN).
- **Events**: `CorporateAccountCreated`, `CorporateCodeRedeemed` (Kiorex internal; opaque references only, never delivered to an employer) and `CorporateLeadReferred` (Clinic to Kiorex; company name, size bucket and an opaque contact reference only; creates no reward or fee share).
- **`src/growth.ts`**: corporate vocabulary (`CORPORATE_ACCOUNT_STATUSES`, `CORPORATE_FUNDING_MODES`, `CORPORATE_CODE_KINDS`, `CORPORATE_VERIFIED_BY`, `CORPORATE_LEAD_SOURCES`, `CORPORATE_LEAD_STATUSES`, `CORPORATE_BENEFIT_ENTRY_TYPES` (RESERVE, REDEEM, RELEASE, REVERSE only: no wallet verb), `CORPORATE_MIN_K` = 10, `CORPORATE_ERROR_CODES`).
- Tests: `test/growth-corporate.test.ts`; the three launch-locked lists in `flags-catalogue.test.ts` and `growth.test.ts` gained the new key.

## 1.12.0

Additive minor (no field, type string, path, enum value, config key or flag removed or renamed; every new field is optional; no required field added to an existing event, schema or request; the root entry point only gains exports). Foundations of the growth **Phase 2** (work package GRW-P2-X0 of `_docs/growth/GROWTH_PHASE2_4_WORK_PACKAGES.md`). Every default is `PROPOSED_DEFAULT`. Consumers pin 1.12.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.12.0.tgz`).

### Added
- **Product discriminator** (Phase 4 foundation): `ReferralLinkCreated` and `ReferralLinkRevoked` gain optional `product` (`CLINIC` default, `PHARMACY`, `LAB`, `NURSE`; absent = `CLINIC`); new Kiorex-produced `ProductAcquisitionFact` (partner products only; origin, reason, decision, policy version, evidence hash, outcome; never patient data; it can only remove a fee, never add one); `src/growth.ts` `PRODUCTS`, `PARTNER_FACT_PRODUCTS`, `productOf`. `openapi/kiorly-pharmacy.v1.openapi.json` 0.3.0 and `kiorly-lab.v1.openapi.json` 0.5.0 gain the optional `acquisition` block **schema** (`ProductAcquisitionBlock`) on `OrderIntent` and `InboundLabOrder`; its use starts with package P4-B2.
- **Events** (JSON Schema, example, fixture in `fixtures/events-v2.4/`): `CampaignCreated`, `CampaignStatusChanged`, `CampaignBudgetThresholdReached`, `CampaignApprovalDecided`, `ReferralCodeIssued`, `ReferralRelationshipCreated`, `ReferralQualified`, `ReferralRejected`, `RewardIssued`, `RewardRedeemed`, `RewardReversed`, `RewardExpired`, `RewardHeld`, `AssistantConversationEscalated`, `AssistantBudgetBreakerTripped`, `LifecycleDecisionRecorded` (aggregate counters only), `IntegrationRunFailed` (all Kiorex-internal), `ProviderVerificationUpdateRequested` (Clinic to Kiorex), `ProviderVerificationDecided` (Kiorex to Clinic), `WAITLIST_OFFER_CREATED` and `WAITLIST_OFFER_EXPIRED` (Clinic; `WAITLIST_OFFER` stays the delivered event). No payload carries a name, phone, e-mail, message text or health datum.
- **Growth config kinds** with JSON Schema (also `@kiorex/contracts/growth-config/*`): `CAMPAIGN_POLICY`, `REFERRAL_RULES`, `REWARD_RULES`, `LIFECYCLE_POLICY`, `ASSISTANT_POLICY`, `INTEGRATION` (settings keyed by integration kind in one version); optional `ATTRIBUTION_POLICY.ltBinding` (`NONE` | `SESSION_HASH`, absent = `NONE`) and optional `SEO.delistedStatus` (`404` | `410` | `301_CLINIC`, absent = `404`) for the gap-closure package GC-1. `GROWTH_CONFIG_KINDS` names the new kinds next to the ten older proposed names (kept).
- **Flags** (`flags/catalogue.json`, 86 keys): `growth.campaign_approval_required`, `growth.provider_marketing_v2` (org scope, Kiorly Clinic), `growth.assistant_real_model` (**launch-locked**, safety-review gate), `growth.lifecycle_journeys`, `growth.referral_fraud_enforce` (OFF = shadow mode) and the ten concrete `growth.integrations.<kind>` keys (`googleads`, `searchconsole`, `ga4`, `playconsole`, `appstoreconnect`, `metaads`, `tiktok`, `whatsappcloud`, `fcmapns`, `crux`). `flags/safety-never-flags.json` gains five controls that are never flags: assistant emergency short-circuit, PHI guard on model input, consent check on marketing send, k-anonymity floor, `assertAdSafe`.
- **`src/growth.ts`**: campaign states and the transition table (`CAMPAIGN_STATES`, `CAMPAIGN_TRANSITIONS`, `canTransitionCampaign`, pause reasons, approval kinds, channels, care-type buckets), campaign error codes (`CAMPAIGN_NOT_FOUND` 404, `CAMPAIGN_INVALID` 422, `CAMPAIGN_INVALID_TRANSITION` 409, `CAMPAIGN_CEILING_EXCEEDED` 409, `CAMPAIGN_APPROVAL_REQUIRED` 409, `CAMPAIGN_SELF_APPROVAL` 403, `CAMPAIGN_BUDGET_EXHAUSTED` 409, `CAMPAIGN_LOCKED` 409, `CAMPAIGN_KEY_TAKEN` 409), message classes, referral code alphabet and validity (`isValidReferralCode`), referral reject reasons and statuses, reward modes, kinds, ledger entry types and reason codes, `rewardIdempotencyKey` (`rwd:<type lower case>:<opaque id>`), assistant tool names and error codes, `INTEGRATION_KINDS`.
- **OpenAPI**: `kiorex-growth` 1.1.0 (public `GET /growth/v1/campaign/resolve` returning only a landing target and a campaign token, never a budget; patient `GET /referral/me`, `POST /referral/invites`, `GET /referral/rewards`, `POST /referral/claim`; `POST /assistant/link`; `GET/PUT /preferences`; `patientSession` scheme). `kiorly-marketplace` 1.6.0: booking `channel` accepts `KIOREX_WHATSAPP`; the Kiorex pay-link registration `POST /pay/links` is documented; provider listings may declare `modalities` (including `VIDEO`); optional Rx `items[]` on `PRESCRIPTION_SHARED` and optional `followUp.intervalDays` beside (not inside) the signed visit `summary`. Waitlist join and leave and slot capacity were already in 1.1.0 and are unchanged. Rewards never reach the clinic: no referral or reward field exists on a marketplace call. `kiorex-webhooks` 1.2.0: delivery shapes of `ProductAcquisitionFact` and the provider verification loop.
- **`@kiorex/contracts/notify`**: `quietUntil(at, quiet, zone?)` additive third argument and optional `QuietHours.zone` (IANA). With a zone the end of the quiet window is computed on the local calendar, so the two nights a year Cairo changes its offset no longer end the window an hour early (fall back) or late (spring forward). The two-argument form is unchanged (fixed offset).

### Rev 2.6 amendment (still 1.12.0, additive): two separate credit systems and provider-sponsored promotions
- **Events**: Kiorex-internal `RefundDestinationChosen`, `RewardRestored`, `GoodwillGranted` (patient credit; never delivered to a clinic); Clinic `ProviderCreditGranted`, `ProviderCreditConsumed`, `ProviderCreditExpired` (provider wallet CR-05; never on a patient surface; aggregate-only toward ops); `PROVIDER_PROMOTION_UPDATED` (Clinic to Kiorex projection), `PromotionReviewDecided` (Kiorex to Clinic), `SponsoredDiscountReserved`, `SponsoredDiscountDebited`, `SponsoredDiscountReleased`, `SponsoredDiscountReversed` (Clinic to Kiorex). No payload carries a patient identity.
- **Optional fields**: `COMMISSION_CHARGE_CREATED` and `COMMISSION_CHARGE_REVERSED` gain `feeBasisMinor`, `sponsoredDiscountMinor`, `basisPolicyVersion` (also on `CommissionAdjusted`); marketplace `POST /bookings` gains the optional `sponsoredDiscount` block; both deposit-paid calls gain the optional `tender {cardMinor, patientCreditMinor, sponsoredDiscountMinor}`.
- **Marketplace 1.6.0**: signed promotion commands `POST /promotions/{promotionId}/reserve` (idempotent budget hold, refusals `BUDGET_EXHAUSTED`, `NOT_ELIGIBLE`, `PAUSED`, `WALLET_INSUFFICIENT`, `LIMIT_REACHED`, the patient travels only as an opaque keyed `patientRef`) and `/release`. Growth OpenAPI 1.1.0: `GET /growth/v1/credit`, `GET/POST/DELETE /growth/v1/credit/household`, `POST /growth/v1/rewards/quote` (checkout lines), `POST /pay/v1/refunds/preview`, schema `RefundDestination` (absent means ORIGINAL).
- **Flags**: launch-locked `growth.patient_credit`, `growth.refund_as_credit`, `growth.family_credit`, `growth.support_goodwill`, `growth.sponsored_promotions`; `clinic.provider_credit_v2`, `clinic.usage_bundles` (Kiorly Clinic, org scope, not locked).
- **Config**: new kind `SPONSORED_PROMOTION_POLICY` (commission basis `GROSS_BEFORE_SPONSORED` default, high-value thresholds, funding defaults); `REWARD_RULES` uses the work-package field names (`redemptionMaxBp`, `minPayableMinor`, `postToPayLedger`, `reversalWindowDays`, `holdMaxDays`, `manualApprovalAboveMinor`, `issueOn` without SIGNUP or BOOKING_CREATED) and the optional `credit` block (`maxOpenBalanceMinor`, `refundAsCredit`, `family`, `goodwill`, `campaignScope`).
- **`src/growth.ts`**: `REWARD_KINDS_V2`, `REWARD_FUNDING`, `REFUND_DESTINATIONS` and `refundDestinationOf` (anything but the exact string `CREDIT` is ORIGINAL), `GOODWILL_REASONS`, `REWARD_ISSUE_ON`, `CHECKOUT_LINE_CODES`, promotion statuses, reserve refusals and budget entry types.
- **`fixtures/credit-ledger-vectors.json`**: fixed numbers both credit implementations must pass (refund allocation with the RC-4 invariant including the D 500, S 100, C 150, K 250 example, FIFO with scoped lots first, expiry, reversal). Tests: `test/growth-1.12-credit.test.ts`.

### Package
- `CONTRACTS_VERSION` = 1.12.0. Tests: `test/growth-1.12.test.ts` (additive diff against `test/growth-baseline-1.11.0.json`: events, OpenAPI paths and schema properties, config schemas, flags, `growth.ts` exports; new events, OpenAPI, vectors in `fixtures/growth-v1.12/vectors.json`, config schemas, flags, safety controls), `test/notify/quiet-until-zone.test.ts` (Cairo DST vectors). Older tests accept 1.12 where they pinned 1.11 and their expected lists grew only by the additions above.

## 1.11.0

Additive minor (no field, type string, path, enum value or flag removed or renamed; every new field is optional; no required field added). Closes the contract gaps listed in the growth Wave 2 and 3 as-built notes (packages F, C, J, D1). Every default is `PROPOSED_DEFAULT`. Consumers pin 1.11.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.11.0.tgz`).

### Added
- `src/growth-config/SEO.schema.json`: optional keys `templates` (title and description per locale `ar`/`en` and page type `home, hub, city, district, care-district, city-hub, district-hub, same-day, telemedicine, doctor, nurse, clinic, pharmacy, lab`; no markup, at most 120/320 characters), `paginatedIndexable`, `reviewMarkupMinCount` (1..1000), `sameDayWindowHours` (1..72), `minAvailableProviders` (1..50), `maxParentSimilarityPercent` (50..100). They are the keys kiorex-platform `validateSeoExtensions` (apps/api/src/growth/seo) already honours, so the maker-checker write path can now store them. Placeholder names inside a template are validated by Kiorex (the JSON Schema cannot express them).
- `openapi/kiorly-marketplace.v1.openapi.json` 1.4.0 -> 1.5.0: optional `lt` (Clinic link-touch token) on `POST /bookings`; signed link registry lookup `GET /referral-links/{code}` (`marketplaceGetReferralLink`, 404 `REFERRAL_LINK_NOT_FOUND`) and the reconciliation feed `GET /referral-links` (`marketplaceListReferralLinks`, `updatedSince`, `limit`, `cursor`); schemas `ReferralLinkRecord`, `ReferralLinkPage`, `ReferralLinkError`. Both reads use the existing marketplace HMAC; no patient data.
- Events: `ReferralLinkCreated` gains optional `orgRef` and `clinicRef`; new Clinic-produced `ReferralLinkRevoked` (`linkCode`, `orgRef` required, `revokedAt`, optional `reason`). Kiorex consumes both to keep its link registry (code known before its first token; a revoked code stops deciding PROVIDER_LED for new bookings). Fixtures in `fixtures/events-v2.4/`.

### Link registry mechanism (ARCH 4.2 and 6.4)
1. The Clinic emits `ReferralLinkCreated` / `ReferralLinkRevoked` (and `PAUSED` is visible through the lookup) through its outbox, with the organisation reference.
2. Kiorex `LinkRegistryService` stores code -> organisation and the status. A code can belong to one organisation only (a conflicting claim is never honoured).
3. When an event was missed, Kiorex reads `GET /referral-links/{code}` (signed) at decision time for an unknown or stale code, and reconciles with `GET /referral-links?updatedSince=`.
4. A revoked or paused code never makes a new booking PROVIDER_LED, whatever the age of the signed `lt`. Revocation can only remove a fee, never add one. The Clinic keeps its own booking-time check.

### Package
- `CONTRACTS_VERSION` = 1.11.0. Tests: `test/link-registry-1.11.test.ts` (additive diff against `test/growth-baseline-1.10.0.json`, SEO keys, `lt`, registry operations, events); older tests accept 1.11.

## 1.10.0

Additive minor (no field, type string, path, enum value or flag removed or renamed; every new field is optional; the root entry point only gains exports). Publishes the contract of the **growth and patient acquisition engine** (ARCH `_docs/growth/GROWTH_ARCHITECTURE_DECISIONS.md`, work package GRW-P1-A). Every default below is `PROPOSED_DEFAULT` until the founder ratifies it. Consumers pin 1.10.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.10.0.tgz`).

### Added
- `openapi/kiorly-marketplace.v1.openapi.json` 1.3.0 -> 1.4.0: optional signed `acquisition` block on `POST /bookings` (`AcquisitionBlock`: `origin` PROVIDER_LED | MARKETPLACE | UNATTRIBUTED, `decisionId`, `policyVersion`, `reason`, `evidenceHash` sha256 hex, optional `touch {kind, ref, at}`), optional documented `attribution`, and 400 `ACQUISITION_BLOCK_INVALID` / `ACQUISITION_EVIDENCE_HASH_INVALID`. Responses are unchanged. A Clinic that does not know the block ignores it and treats the booking as `UNATTRIBUTED`; today's chargeability rule applies unchanged. The block can only REMOVE a commission, never add one.
- `openapi/kiorex-growth.v1.openapi.json` 1.0.0 (new, draft): public `POST /growth/v1/touch`, `POST /growth/v1/events`, `GET /api/v1/bootstrap` (path `/bootstrap` under the `/api/v1` server) and the evidence read `GET /growth/v1/evidence/{bookingId}` (ops session or signed partner). Generated types: `GrowthApi`.
- Events (JSON Schema, examples, `fixtures/events-v2.4/*`): `CommissionAdjusted` (kiorly-clinic), `PatientConsentUpdated` (kiorex), and the internal-outbox `AttributionAssigned`, `PatientAcquisitionRecorded` (kiorex) and `ReferralLinkCreated` (kiorly-clinic); the internal ones are never delivered to partners.
- Additive optional fields: `COMMISSION_CHARGE_CREATED` and `COMMISSION_CHARGE_REVERSED` gain `decisionRef`, `origin`, `policyVersion`; `PROVIDER_PROFILE_UPDATED` gains `widgetOrigins[]` (https origins, at most 10); every appointment status event gains `acquisitionOrigin`.
- Flags (`flags/catalogue.json`, 68 keys now): `growth.provider_links`, `growth.attribution`, `growth.ssr_public_pages`, `growth.seo_landing_pages`, `growth.widgets`, `growth.deep_links`, `growth.campaigns`, `growth.experiments`, pattern `growth.integrations.<kind>`, and launch-locked `growth.analytics_visitor`, `growth.marketing_messaging`, `growth.patient_referral`, `growth.rewards`, `kiorex.whatsapp_ai_assistant`. Safety controls stay out of the catalogue (ADR-025).
- `src/growth.ts`: `ACQUISITION_ORIGINS`, `ATTRIBUTION_REASON_CODES`, `ACQUISITION_SOURCE_KINDS`, `COMMISSION_DISPUTE_REASONS` (adds `PROVIDER_LED_EVIDENCE`), `GROWTH_EVENT_NAMES` (15 canonical funnel events, client and server partitions), `GROWTH_ERROR_CODES` and `GROWTH_ERROR_STATUS`, `GROWTH_CONFIG_KINDS`, widget origin rule (`isValidWidgetOrigin`, 10 max), `growthCanonicalJson`, `computeAttributionInputsHash` (the `evidenceHash`), `validateAcquisitionBlock`, `validateGrowthConfig`, `acquisitionOriginOf`.
- `src/growth-config/*.schema.json` (also exported as `@kiorex/contracts/growth-config/*`): JSON Schemas for config kinds `ATTRIBUTION_POLICY`, `SEO`, `WIDGET_POLICY`, `CONSENT_DEFAULTS`, `MARKET_GROWTH`. The other kinds of ARCH section 16 ship with their phase.
- Fixtures `fixtures/growth-v1.10/{vectors,acquisition-examples}.json`: fixed vectors for the canonical JSON, the evidence hash and the widget origin rule. Clinic keeps its own copy of the helpers (its Docker build context cannot reach this package) and proves them against these vectors, as it does for the 1.9.0 intake helpers.

### Package
- `CONTRACTS_VERSION` = 1.10.0. Tests: `test/growth.test.ts` (additive diff against a 1.9.0 snapshot, acquisition examples, vectors, events, flags, config schemas), `test/flags-catalogue.test.ts` extended.

## 1.9.0

Additive minor (no field, type string, path or flag removed or renamed). Publishes the partner **connection intake** that kiorex-platform has served since ADR-040 and secures it. Consumers pin 1.9.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.9.0.tgz`).

### Added
- `openapi/kiorex-partner-intake.v1.openapi.json` 1.0.0: `POST /partners/v1/connection-requests` (`submitConnectionRequest`) and `GET /partners/v1/connection-requests/{id}` (`getConnectionRequestStatus`), request/response schemas (strict, `additionalProperties: false`), error codes (`INVALID_JSON`, `INVALID_REQUEST`, `INVALID_KIND`, `INVALID_BASE_URL`, `CREDENTIALS_REQUIRED`, `READINESS_TOO_LARGE`, `INTAKE_UNAUTHORIZED`, `PAYLOAD_TOO_LARGE`, `RATE_LIMITED` with `Retry-After`, `PARTNER_CONNECTION_NOT_FOUND`). Generated types: `PartnerIntakeApi`.
- `src/intake.ts`: `deriveIntakeSigningKey`, `signIntakeRequest`, `verifyIntakeSignature`, `generateEnrolmentCode`, `generateIntakeKey`, `newIntakeNonce`, `enrolmentIdOf`, constants (`INTAKE_MAX_BODY_BYTES` 64 KiB, 5 minute window, nonce pattern).
- Test `test/partner-intake.test.ts` (spec shape, fixed signing vector, sign/verify, replay window).

### Behaviour change on an existing, previously unpublished endpoint (documented, not a published-contract break)
- The first request of an organisation must be signed with a one-time **enrolment code** created by Kiorex ops (`X-Kiorex-Enrolment: kxe_<id>`); the response returns an **intake key** once, which signs every later request. Clinic and Nurse no longer sign with the shared Kiorly webhook secret; Pharmacy and Lab no longer sign with the webhook secret they submit (that secret only configures their own outbound webhooks). Single use, expiry (default 7 days, max 14), revocable, audited, stored as sha256 only. Replay protection: 5 minute timestamp window plus a single-use signed `nonce`. Every authentication failure is the same 401 `INTAKE_UNAUTHORIZED`. Rate limits per IP and per orgRef; 429 carries `Retry-After`.

### Package
- `CONTRACTS_VERSION` = 1.9.0.

## 1.8.0

Additive minor (no field, type string, path or flag removed or renamed; every new field is optional). Founder-delegated decisions of 23 Nov 2026 (`PROPOSED_DEFAULT delegated by founder 23 Nov 2026` where a policy is involved). Consumers pin 1.8.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.8.0.tgz`).

### Arabic names (partner catalogues)
- `kiorly-pharmacy.v1.openapi.json` 0.1.0 -> 0.2.0: `CatalogueItem` and the `Quote` items gain optional `nameAr`, `formAr` (Arabic dosage form), `strength`/`form` (quote) and `activeIngredient` (catalogue). Absent => clients fall back to `name` / `form` (never blank). Search on both partners already matches Arabic and English; GET `/catalogue?q=` accepts either script.
- `kiorly-lab.v1.openapi.json` 0.3.0 -> 0.4.0: `GET /tests` items gain optional `nameAr`, `preparationAr`, `sampleTypeAr`; `POST /tests/quote` tests gain optional `nameAr`.

### OUT_FOR_DELIVERY
- New event `OrderOutForDelivery` (producer kiorly-pharmacy, `v2-draft`): `orderId`, `pharmacyId`, `branchId?`, `outForDeliveryAt`, `estimatedDeliveryMinutes?`, `dispatchedBy?`. Sits between `OrderReady` and `DispenseCompleted`, DELIVERY orders only, no address or courier contact. Kiorex mirrors it as `OUT_FOR_DELIVERY`; a Kiorex that does not know the event ignores it (unknown order types are acknowledged and dropped), and `DispenseCompleted` still completes the order, so old consumers keep working.
- `OrderResult.status` (pharmacy OpenAPI) may now be `OUT_FOR_DELIVERY` (consumers must tolerate unknown values, as before).

### Partial fulfilment
- `DispenseCompleted` gains optional `lines[{sku, quantityRequested, quantityDispensed}]` and `deliveryMade`. With `partial: true` and `lines`, Kiorex refunds the rejected/unavailable lines pro-rata (policy `PROPOSED_DEFAULT`, configurable per market/org); without `lines` the order still parks in `PARTIAL_REVIEW` exactly as before.

### Package
- `CONTRACTS_VERSION` = 1.8.0. Tests: `test/schemas.test.ts` (OrderOutForDelivery, old and new DispenseCompleted payloads), `test/partner-additive.test.ts` (Arabic fields optional and non-required, OUT_FOR_DELIVERY in the status enum, 1.7.0 payloads still validate).

## 1.7.0

Additive minor (no field, type string, path or flag removed or renamed; the root entry point is unchanged). Adds the shared **notification layer** as a new subpath export `@kiorex/contracts/notify` (ESM + CJS + types): pure TypeScript, no I/O, designed to sit above each product's channel adapters (SMS, Email, WhatsApp, Push, in-app inbox). Full guide: `docs/NOTIFICATION_LAYER.md`. Consumers pin 1.7.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.7.0.tgz`).

### Added (`src/notify/`)
- `NotificationIntent` (type code, recipient `{id, phone?, email?, deviceIds?, locale ar|en}`, params, severity ROUTINE | IMPORTANT | CRITICAL, `idempotencyKey`, `dedupe`).
- `TemplateRegistry` and `simpleTemplate`: per intent, per-channel renderers with ar/en (SMS text with segment check, email subject/html/text, WhatsApp template name + vars or free text, push title/body/deep-link `data`, in-app inbox item), `validate()` for CI.
- PHI-free guard: templates declare `allowedParams` (undeclared keys rejected), `PhiGuard` rejects configured patterns in SMS, push and WhatsApp bodies.
- `RoutingPolicy` (`DEFAULT_ROUTING`): ordered channels per severity, fallback after no delivery receipt within a timeout, CRITICAL fans out in parallel; the in-app inbox is a sidecar written first.
- Preference and consent gate (`PreferenceStore`, `evaluateGate`, `quietUntil`): consent, opt-out, quiet hours with CRITICAL / `quietBypass` override, WhatsApp 24 h window and template rule, missing-address skip with a recorded reason.
- Normalized `DeliveryStatus` (QUEUED, SENT, DELIVERED, READ, FAILED, SKIPPED), forward-only `mergeStatus`, per-channel vendor normalizers, `parseNeutralStatusBody`.
- One `AuditRecord` shape and `AuditSink`; `DispatchStore` (idempotency, dedupe, provider-ref index, due list) with `MemoryDispatchStore`.
- `ChannelAdapter` interface (`send`, `parseWebhook`, `verify`) and `NotificationService` (`dispatch`, `tick`, `applyStatus`, `handleWebhook`) taking injected adapters, preference store, audit sink, store and clock.
- `MockChannelAdapter` and `createMockAdapters` for tests.

### Package
- `exports["./notify"]` plus `typesVersions` (node-resolution consumers); tsup builds a second entry (`dist/notify.{js,cjs,d.ts,d.cts}`). `CONTRACTS_VERSION` = 1.7.0.

### Tests
- `test/notify/` (60 tests): routing, fallback timing with a fake clock, CRITICAL fan-out, consent, opt-out, quiet hours, WhatsApp window, PHI guard, idempotency and dedupe, status normalization, webhook replay and out-of-order, ar/en rendering, audit shape. 100 % statements, branches, functions and lines on `src/notify`.

### Adoption
- kiorex-platform adopts it first (see `docs/NOTIFICATION_LAYER.md`); clinic, pharmacy, lab and passport are NOT migrated yet, the migration order is documented.

## 1.6.0

Additive minor (no field, type string, path or flag removed or renamed). Ratifies the Kiorly Lab proposals of `kiorly-lab/Docs/NURSE_SAMPLES.md` (NH-LB-034) for KNLAB01 / KLORD05: a nurse-collected sample handed to Kiorly Lab through Kiorex. Kiorly Nurse stays an EDITION of Kiorly Clinic (ADR-031): no new repository, producer or event type. No tax-authority fields. Consumers pin 1.6.0 via `npm run pack:local` (`dist-pack/kiorex-contracts-1.6.0.tgz`).

### Events
- `LabOrderPlaced` (producer kiorly-clinic): new OPTIONAL `originEdition` (CLINIC | NURSE), `prescriberName`, `identifiersChecked` (>= 2 DISTINCT identifier KINDS from the Lab's vocabulary `fullName | dateOfBirth | phone | nationalId | externalId`, never values; `fullName` is accepted for nurse intake only), `patient` (minimum demographics `fullName`, `dateOfBirth`, `sex`, `phone`, `preferredLocale`; sent only under the consent token, relayed by Kiorex and not retained, never a national id) and `nurseCollection` (`visitRef`, `collectorRef`, `collectorName`, `collectedAt`, `handedOverAt`, `temperatureC`, `samples[{label, specimenType, container}]` with the tube-label pattern `^[\x21-\x7e]{3,40}$`). A Clinic-edition event is unchanged.
- `LabOrderCreated` / `LabOrderStatusChanged` (producer kiorly-lab): new OPTIONAL `originEdition: "NURSE"`; `source` stays `KIORLY_CLINIC` (the enum is not widened).
- Example: `fixtures/nurse-lab-handoff-v1.6.json`.

### OpenAPI `openapi/kiorly-lab.v1.openapi.json` 0.2.0 -> 0.3.0 (still `x-status: draft`)
- `InboundLabOrder` stays strict (`additionalProperties: false`), relaxed ONLY for the new optional `nurseCollection` (schema `NurseCollection`, strict), `identifiersChecked` (min 2) and `collection.districtId`; `consentChannels` gains `KIORLY_NURSE_IMPORT`.
- Third client source `KIORLY_NURSE` (`x-client-sources`): submits only nurse-collected orders; documented 409 `ACCESSION_DUPLICATE` and 422 refusals (`CONSENT_REQUIRED`, `TWO_IDENTIFIERS_REQUIRED`, `COLLECTED_IN_FUTURE`, `HANDOVER_TIME_INVALID`, `SAMPLE_*`).
- New `GET /integration/v1/orders/{sourceRef}/custody` (`labGetOrderCustody`, schema `LabOrderCustody`): per specimen custody events (type, time, temperature, `by: NURSE | LAB`), no names, no PHI; KIORLY_NURSE / KIORLY_CLINIC clients, own orders only.

### OpenAPI `openapi/kiorly-marketplace.v1.openapi.json` 1.2.0 -> 1.3.0
- New `POST /lab-orders/{orderId}/status` (`marketplaceLabOrderStatus`): Kiorex relays the lab status of a hand-off to the Kiorly tenant (status, sanitized custody events, and on release the report id + secure link). No results, no PHI. Idempotent; the headline status is monotonic (a stale push answers 200 `applied:false`).

- `PARTNER_DEV_DEFAULTS.labNurse` (dev client `kl_dev_nurse`, KIORLY_NURSE source): Kiorex's second registration at the Lab.

### Tests
- Nurse `LabOrderPlaced` example validates, malformed tube label / no samples / single identifier / unknown edition / missing consent token are refused; `originEdition` on the Lab events; strict-order relaxation limited to the three ratified fields; custody `by` enum; marketplace status push.

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
