/**
 * Growth and patient acquisition engine contract (1.10.0, additive; ARCH sections 6, 8, 16).
 *
 * - The signed `acquisition` block Kiorex adds to POST /marketplace/v1/bookings (the request HMAC already signs the body).
 * - `computeAttributionInputsHash`: the deterministic fingerprint stored on every decision and carried as `evidenceHash`.
 * - Names, codes and kinds shared by Kiorex (decision function, ops config) and Kiorly Clinic (intake, commission decision).
 *
 * Kiorly Clinic keeps its own copy of the small pieces it needs (its Docker build context cannot reach this package) and proves
 * them against the fixed vectors in `fixtures/growth-v1.10/vectors.json` (see CHANGELOG 1.10.0).
 */
import { createHash, createHmac } from "node:crypto";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { ACQUISITION_BLOCK_SCHEMA, GROWTH_CONFIG_SCHEMAS } from "./generated/growth-schemas.js";

export const ACQUISITION_ORIGINS = ["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED"] as const;
export type AcquisitionOrigin = (typeof ACQUISITION_ORIGINS)[number];

/** Reason codes the decision function emits today. Receivers must tolerate codes added later. */
export const ATTRIBUTION_REASON_CODES = [
  "EXPLICIT_PROVIDER_CHANNEL", "PRIOR_PROVIDER_TOUCH", "PATIENT_REFERRAL", "MARKETPLACE_TOUCH", "NO_PROVIDER_EVIDENCE",
] as const;
export type AttributionReasonCode = (typeof ATTRIBUTION_REASON_CODES)[number];

/** AcquisitionSource.sourceKind taxonomy (config, ARCH section 6.1). */
export const ACQUISITION_SOURCE_KINDS = [
  "PROVIDER_LINK", "PROVIDER_QR", "WIDGET", "ORGANIC_SEARCH", "DIRECT", "REFERRAL", "CAMPAIGN", "WHATSAPP", "OFFLINE",
] as const;
export type AcquisitionSourceKind = (typeof ACQUISITION_SOURCE_KINDS)[number];

export const ATTRIBUTION_PRECEDENCES = ["PROVIDER_FIRST", "LAST_NON_DIRECT", "FIRST_TOUCH"] as const;

export interface AcquisitionTouchRef { kind: string; ref: string; at: string }
export interface AcquisitionBlock {
  origin: AcquisitionOrigin;
  decisionId: string;
  policyVersion: string;
  reason: string;
  /** sha256 hex of the stored decision's inputs (computeAttributionInputsHash). */
  evidenceHash: string;
  touch?: AcquisitionTouchRef;
}

/** Commission dispute reasons known to the contract. PROVIDER_LED_EVIDENCE is new in 1.10.0 (ARCH section 6.7 item 3). */
export const COMMISSION_DISPUTE_REASONS = ["EXISTING_PATIENT", "DID_NOT_ATTEND", "DUPLICATE", "OTHER", "PROVIDER_LED_EVIDENCE"] as const;
export type CommissionDisputeReasonName = (typeof COMMISSION_DISPUTE_REASONS)[number];

/** Canonical funnel event names recorded in GrowthEvent (ARCH section 8). Stable; props stay minimal. */
export const GROWTH_EVENT_NAMES = [
  "PageViewed", "SearchStarted", "ResultsViewed", "ProviderViewed", "SlotSelected", "BookingInitiated", "BookingConfirmed", "BookingAttended",
  "BookingCancelled", "AppInstalled", "PatientRegistered", "WidgetLoaded", "WidgetBookingStarted", "WhatsAppConversationStarted", "ConsentGranted",
] as const;
export type GrowthEventName = (typeof GROWTH_EVENT_NAMES)[number];
/** Names a browser or app may report on the anonymous stream. */
export const GROWTH_CLIENT_EVENT_NAMES = [
  "PageViewed", "SearchStarted", "ResultsViewed", "ProviderViewed", "AppInstalled", "WidgetLoaded", "WidgetBookingStarted", "WhatsAppConversationStarted", "ConsentGranted",
] as const;
/** Names written only by the server from operational facts (never accepted from a client). */
export const GROWTH_SERVER_EVENT_NAMES = GROWTH_EVENT_NAMES.filter((n) => !(GROWTH_CLIENT_EVENT_NAMES as readonly string[]).includes(n)) as readonly GrowthEventName[];

export const GROWTH_LANDING_KINDS = [
  "HOME", "SPECIALTY_CITY", "SPECIALTY_DISTRICT", "CARE_TYPE_DISTRICT", "HUB", "DOCTOR", "CLINIC", "PROVIDER_LINK", "WIDGET", "REFERRAL", "CAMPAIGN", "WHATSAPP", "APP_OPEN", "OTHER",
] as const;
export const GROWTH_CARE_TYPES = ["DOCTORS", "PHYSIOTHERAPY", "HOME_NURSING"] as const;

/** Provider link vocabulary (Clinic ProviderReferralLink). */
export const REFERRAL_LINK_OWNER_SCOPES = ["ORG", "CLINIC", "BRANCH", "DOCTOR", "DESK"] as const;
export const REFERRAL_LINK_CHANNEL_KINDS = ["WEB_LINK", "QR_POSTER", "QR_DESK", "SOCIAL", "SMS", "WHATSAPP_SHARE", "EMAIL_SIG", "GOOGLE_PROFILE"] as const;
export const REFERRAL_LINK_STATUSES = ["ACTIVE", "PAUSED", "REVOKED"] as const;

/** GrowthConfigVersion vocabulary (ARCH section 16). */
export const GROWTH_CONFIG_KINDS = [
  "ATTRIBUTION_POLICY", "SEO", "WIDGET_POLICY", "CONSENT_DEFAULTS", "COMMS_CAPS", "CAMPAIGN_GUARDRAILS", "REWARDS", "INTEGRATIONS", "EXPERIMENT_GUARDRAILS", "MARKET_GROWTH",
  // 1.12.0 (additive): Phase 2 kinds. The older proposed names above stay for compatibility; Phase 2 uses the names below.
  "CAMPAIGN_POLICY", "REFERRAL_RULES", "REWARD_RULES", "LIFECYCLE_POLICY", "ASSISTANT_POLICY", "INTEGRATION", "SPONSORED_PROMOTION_POLICY",
  // 1.13.0 (additive, consolidated): Phase 3 kinds the Kiorex ops console already validates locally, plus Phase 4 corporate (GRW-P4-C)
  "FRAUD_RULES", "SEO_AUTOMATION", "LTV_POLICY", "MARKET_PROFILE", "ATTRIBUTION_MODELS", "EXPERIMENT_POLICY", "AUTOMATION_POLICY", "CORPORATE_POLICY",
  // Phase 4 (1.13.0 branch, GRW-P4-D)
  "LOYALTY_RULES",
] as const;
export type GrowthConfigKind = (typeof GROWTH_CONFIG_KINDS)[number];
/** Kinds with a JSON Schema in 1.10.0; the others are Phase 2 and 3 and ship their schema with their phase. */
export const GROWTH_CONFIG_KINDS_WITH_SCHEMA = Object.keys(GROWTH_CONFIG_SCHEMAS) as ReadonlyArray<keyof typeof GROWTH_CONFIG_SCHEMAS>;
export const GROWTH_CONFIG_SCOPES = ["GLOBAL", "MARKET"] as const;
export const GROWTH_CONFIG_STATES = ["DRAFT", "PENDING_APPROVAL", "APPROVED", "ACTIVE", "SUPERSEDED", "REJECTED", "ROLLED_BACK"] as const;

/** Error `code` values of the growth surface (FEATURE_DISABLED stays the universal OFF contract in flags.ts). */
export const GROWTH_ERROR_CODES = [
  "GROWTH_INVALID_REQUEST", "GROWTH_PHI_REJECTED", "GROWTH_EVENT_NOT_ALLOWED", "GROWTH_CONSENT_REQUIRED", "GROWTH_RATE_LIMITED",
  "GROWTH_LINK_TOKEN_INVALID", "GROWTH_LINK_TOKEN_EXPIRED", "GROWTH_EVIDENCE_NOT_FOUND",
  "GROWTH_CONFIG_INVALID", "GROWTH_CONFIG_NOT_FOUND", "GROWTH_CONFIG_TRANSITION_FORBIDDEN", "GROWTH_CONFIG_SELF_APPROVAL", "GROWTH_CONFIG_EFFECTIVE_TOO_SOON",
  "GROWTH_WIDGET_ORIGIN_INVALID", "GROWTH_WIDGET_ORIGIN_NOT_ALLOWED",
  "ACQUISITION_BLOCK_INVALID", "ACQUISITION_EVIDENCE_HASH_INVALID",
  // 1.12.0 (additive): campaign management (GRW-P2-A)
  "CAMPAIGN_NOT_FOUND", "CAMPAIGN_INVALID", "CAMPAIGN_INVALID_TRANSITION", "CAMPAIGN_CEILING_EXCEEDED", "CAMPAIGN_APPROVAL_REQUIRED", "CAMPAIGN_SELF_APPROVAL",
  "CAMPAIGN_BUDGET_EXHAUSTED", "CAMPAIGN_LOCKED", "CAMPAIGN_KEY_TAKEN",
] as const;
export type GrowthErrorCode = (typeof GROWTH_ERROR_CODES)[number];

/** HTTP status each growth code is served with (the OpenAPI documents the same). */
export const GROWTH_ERROR_STATUS: Record<GrowthErrorCode, number> = {
  GROWTH_INVALID_REQUEST: 400, GROWTH_PHI_REJECTED: 422, GROWTH_EVENT_NOT_ALLOWED: 422, GROWTH_CONSENT_REQUIRED: 403, GROWTH_RATE_LIMITED: 429,
  GROWTH_LINK_TOKEN_INVALID: 400, GROWTH_LINK_TOKEN_EXPIRED: 400, GROWTH_EVIDENCE_NOT_FOUND: 404,
  GROWTH_CONFIG_INVALID: 422, GROWTH_CONFIG_NOT_FOUND: 404, GROWTH_CONFIG_TRANSITION_FORBIDDEN: 409, GROWTH_CONFIG_SELF_APPROVAL: 403, GROWTH_CONFIG_EFFECTIVE_TOO_SOON: 422,
  GROWTH_WIDGET_ORIGIN_INVALID: 400, GROWTH_WIDGET_ORIGIN_NOT_ALLOWED: 403,
  ACQUISITION_BLOCK_INVALID: 400, ACQUISITION_EVIDENCE_HASH_INVALID: 400,
  CAMPAIGN_NOT_FOUND: 404, CAMPAIGN_INVALID: 422, CAMPAIGN_INVALID_TRANSITION: 409, CAMPAIGN_CEILING_EXCEEDED: 409, CAMPAIGN_APPROVAL_REQUIRED: 409, CAMPAIGN_SELF_APPROVAL: 403,
  CAMPAIGN_BUDGET_EXHAUSTED: 409, CAMPAIGN_LOCKED: 409, CAMPAIGN_KEY_TAKEN: 409,
};

/** Widget origin allow-list rule (ARCH section 11): exact https origin, no wildcard, no path, at most 10 per organisation. */
export const WIDGET_ORIGIN_PATTERN = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+(:[0-9]{1,5})?$/;
export const WIDGET_MAX_ORIGINS = 10;
export function isValidWidgetOrigin(origin: unknown): origin is string {
  return typeof origin === "string" && origin.length <= 255 && WIDGET_ORIGIN_PATTERN.test(origin);
}

/** Deterministic JSON: object keys sorted, no whitespace, `undefined` properties omitted, arrays keep order. Throws on non-finite numbers. */
export function growthCanonicalJson(value: unknown): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string": return JSON.stringify(value);
    case "boolean": return value ? "true" : "false";
    case "number":
      if (!Number.isFinite(value)) throw new TypeError("growthCanonicalJson: non-finite number");
      return JSON.stringify(value);
    case "object": {
      if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? "null" : growthCanonicalJson(v))).join(",")}]`;
      const obj = value as Record<string, unknown>;
      const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
      return `{${keys.map((k) => `${JSON.stringify(k)}:${growthCanonicalJson(obj[k])}`).join(",")}}`;
    }
    default: throw new TypeError(`growthCanonicalJson: unsupported ${typeof value}`);
  }
}

export interface AttributionInputs {
  /** Booking subset the decision looked at (ids and facts only, no patient data). */
  booking: { id: string; orgId: string; clinicId?: string; doctorId?: string; createdAt: string; channel: string; hasValidLt?: boolean };
  /** Ordered touches considered: id and timestamp only. Order is canonicalised by (occurredAt, id) here. */
  touches: Array<{ id: string; occurredAt: string }>;
  policyVersion: string;
  precedence?: string;
}

/** sha256 hex over canonical JSON of the booking subset, the ordered touch ids with timestamps and the policy version. Format version `v1`. */
export function computeAttributionInputsHash(inputs: AttributionInputs): string {
  const touches = [...inputs.touches].sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : a.occurredAt > b.occurredAt ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const payload = { v: 1, booking: inputs.booking, touches: touches.map((t) => ({ id: t.id, at: t.occurredAt })), policyVersion: inputs.policyVersion, precedence: inputs.precedence ?? null };
  return createHash("sha256").update(growthCanonicalJson(payload), "utf8").digest("hex");
}

const AjvCtor = ((Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020) as typeof Ajv2020;
const addFormatsFn = ((addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats) as typeof addFormats;
let ajv: InstanceType<typeof AjvCtor> | undefined;
const getAjv = () => {
  if (ajv) return ajv;
  const a = new AjvCtor({ allErrors: true, strict: true });
  addFormatsFn(a);
  return (ajv = a);
};

export type GrowthValidation<T> = { valid: true; value: T } | { valid: false; errors: string[] };
const fmtErr = (e: { instancePath: string; message?: string }) => `${e.instancePath || "/"} ${e.message ?? "invalid"}`;

/** Validate the optional `acquisition` block of a booking request. A missing block is the caller's UNATTRIBUTED case, not an error. */
export function validateAcquisitionBlock(block: unknown): GrowthValidation<AcquisitionBlock> {
  const a = getAjv();
  const validate = a.getSchema(ACQUISITION_BLOCK_SCHEMA.$id) ?? a.compile(ACQUISITION_BLOCK_SCHEMA as unknown as object);
  if (validate(block)) return { valid: true, value: block as AcquisitionBlock };
  return { valid: false, errors: (validate.errors ?? []).map(fmtErr) };
}

/** Validate a GrowthConfigVersion payload against its kind's JSON Schema. Kinds without a 1.10.0 schema return an error. */
export function validateGrowthConfig(kind: string, payload: unknown): GrowthValidation<Record<string, unknown>> {
  const schema = (GROWTH_CONFIG_SCHEMAS as Record<string, { $id: string }>)[kind];
  if (!schema) return { valid: false, errors: [`no schema for config kind ${kind}`] };
  const a = getAjv();
  const validate = a.getSchema(schema.$id) ?? a.compile(schema);
  if (validate(payload)) return { valid: true, value: payload as Record<string, unknown> };
  return { valid: false, errors: (validate.errors ?? []).map(fmtErr) };
}

/** Reads the origin of a stored/received block; absent or malformed means UNATTRIBUTED (today's rules apply). */
export function acquisitionOriginOf(block: unknown): AcquisitionOrigin {
  const o = (block as { origin?: unknown } | null | undefined)?.origin;
  return (ACQUISITION_ORIGINS as readonly unknown[]).includes(o) ? (o as AcquisitionOrigin) : "UNATTRIBUTED";
}

// ───────────────────────── 1.12.0 (additive): Phase 2 vocabulary ─────────────────────────

/** Products of the ecosystem for the `product` discriminator on link events and acquisition facts (Phase 4). Absent on 1.11.0 payloads means CLINIC. */
export const PRODUCTS = ["CLINIC", "PHARMACY", "LAB", "NURSE"] as const;
export type Product = (typeof PRODUCTS)[number];
/** Products that can receive a ProductAcquisitionFact from Kiorex (the Clinic keeps its signed booking block). */
export const PARTNER_FACT_PRODUCTS = ["PHARMACY", "LAB", "NURSE"] as const;
export const PRODUCT_ACQUISITION_OUTCOMES = ["ORDERED", "COMPLETED", "CANCELLED"] as const;
export function productOf(value: unknown): Product { return (PRODUCTS as readonly unknown[]).includes(value) ? (value as Product) : "CLINIC"; }

/** Campaign states and the allowed transitions (GRW-P2-A). The platform enforces more (approval, budget); this table is the part every product can rely on. */
export const CAMPAIGN_STATES = ["DRAFT", "PENDING_APPROVAL", "SCHEDULED", "ACTIVE", "PAUSED", "COMPLETED", "ARCHIVED"] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];
export const CAMPAIGN_TRANSITIONS: Readonly<Record<CampaignState, readonly CampaignState[]>> = {
  DRAFT: ["PENDING_APPROVAL", "SCHEDULED", "ARCHIVED"],
  PENDING_APPROVAL: ["DRAFT", "SCHEDULED"],
  SCHEDULED: ["ACTIVE", "DRAFT", "ARCHIVED"],
  ACTIVE: ["PAUSED", "COMPLETED"],
  PAUSED: ["ACTIVE", "COMPLETED"],
  COMPLETED: ["ARCHIVED"],
  ARCHIVED: [],
};
export const CAMPAIGN_PAUSE_REASONS = ["BUDGET", "MANUAL", "GUARDRAIL"] as const;
export const CAMPAIGN_APPROVAL_KINDS = ["ACTIVATE", "BUDGET_INCREASE", "REACTIVATE"] as const;
export const CAMPAIGN_CHANNELS = ["ORGANIC_SEARCH", "EMAIL", "SMS", "WHATSAPP", "PUSH", "IN_APP", "PARTNER", "PAID_SEARCH", "PAID_SOCIAL", "PAID_VIDEO", "OFFLINE", "REFERRAL"] as const;
export const CAMPAIGN_CARE_TYPE_BUCKETS = ["IN_CLINIC", "VIDEO", "HOME_VISIT"] as const;
export function canTransitionCampaign(from: CampaignState, to: CampaignState): boolean { return CAMPAIGN_TRANSITIONS[from].includes(to); }

/** Message classes (AD-6). The notify purpose REMINDER maps to TRANSACTIONAL with the REMINDERS consent. */
export const LIFECYCLE_MESSAGE_CLASSES = ["TRANSACTIONAL", "SECURITY", "CLINICAL", "MARKETING"] as const;
export type LifecycleMessageClass = (typeof LIFECYCLE_MESSAGE_CLASSES)[number];

/** Referral code alphabet: Crockford base32 without I, L, O, U; 8 characters (ARCH section 4.2). */
export const REFERRAL_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const REFERRAL_CODE_PATTERN = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const isValidReferralCode = (code: unknown): code is string => typeof code === "string" && REFERRAL_CODE_PATTERN.test(code);
export const REFERRAL_REJECT_REASONS = [
  "SELF_REFERRAL", "ALREADY_PATIENT", "CODE_SUSPENDED", "CAP_REACHED", "EXPIRED", "NOT_ATTENDED", "PHONE_NOT_VERIFIED", "DUPLICATE_IDENTITY", "PAYMENT_FINGERPRINT_MATCH",
  "CARE_TYPE_NOT_ELIGIBLE", "PROVIDER_LED_BOOKING", "FRAUD_HOLD", "RULES_DISABLED",
] as const;
export const REFERRAL_STATUSES = ["INVITED", "SIGNED_UP", "BOOKED", "QUALIFIED", "REJECTED", "EXPIRED"] as const;

/** Reward ledger vocabulary (AD-2). Rewards never change an attribution decision or a commission. */
export const REWARD_MODES = ["COUPON", "CREDIT"] as const;
export const REWARD_KINDS = ["REFERRER", "REFEREE", "REPEAT", "PROMO", "CORPORATE", "LOYALTY"] as const;
/** Patient credit (Rev 2.6, ADR-048 Proposed): additional lot kinds, funding labels, refund destinations and the closed reason lists. Patient credit and provider credit are two separate systems: nothing converts between them. */
export const REWARD_KINDS_V2 = [...REWARD_KINDS, "WELCOME", "GOODWILL", "CAMPAIGN", "REFUND_CREDIT", "RESTORED"] as const;
export const REWARD_FUNDING = ["PLATFORM_MARKETING", "PLATFORM_SERVICE_RECOVERY", "PATIENT_REFUND"] as const;
export const REFUND_DESTINATIONS = ["ORIGINAL", "CREDIT"] as const;
export type RefundDestination = (typeof REFUND_DESTINATIONS)[number];
/** Absent or unknown means ORIGINAL: the default can never become credit by accident. */
export const refundDestinationOf = (v: unknown): RefundDestination => (v === "CREDIT" ? "CREDIT" : "ORIGINAL");
export const GOODWILL_REASONS = ["PROVIDER_LATE_CANCEL", "LONG_WAIT", "FAILED_BOOKING", "PAYMENT_ISSUE", "OTHER_APPROVED"] as const;
export const REWARD_ISSUE_ON = ["COMPLETED_VISIT", "COMPLETED_NTH_VISIT", "SUPPORT_APPROVED", "REFUND_CHOICE"] as const;
/** Checkout line codes in the order they are applied: a price reduction first, then credit, a held deposit, and the card last. */
export const CHECKOUT_LINE_CODES = ["PRICE", "SPONSORED_DISCOUNT", "PATIENT_CREDIT", "DEPOSIT_HELD", "CARD"] as const;
export const PROMOTION_STATUSES = ["DRAFT", "SUBMITTED", "IN_REVIEW", "APPROVED", "ACTIVE", "PAUSED", "EXHAUSTED", "EXPIRED", "REJECTED", "ARCHIVED"] as const;
export const PROMOTION_RESERVE_REJECTIONS = ["BUDGET_EXHAUSTED", "NOT_ELIGIBLE", "PAUSED", "WALLET_INSUFFICIENT", "LIMIT_REACHED"] as const;
export const PROMOTION_BUDGET_ENTRY_TYPES = ["RESERVE", "RELEASE", "DEBIT", "REVERSE_DEBIT"] as const;
export const REWARD_ENTRY_TYPES = ["ISSUE", "HOLD", "RELEASE_HOLD", "RESERVE", "UNRESERVE", "REDEEM", "REVERSE", "EXPIRE"] as const;
export type RewardEntryType = (typeof REWARD_ENTRY_TYPES)[number];
export const REWARD_REASON_CODES = [
  "REFERRER_QUALIFIED", "REFEREE_WELCOME", "REPEAT_BOOKING", "PROMO_CAMPAIGN", "FRAUD_HOLD", "FRAUD_CLEARED", "BOOKING_CANCELLED", "REFUND", "EXPIRED", "MANUAL_REVERSAL",
] as const;
export const REWARD_IDEMPOTENCY_KEY_PATTERN = /^rwd:[a-z0-9_-]{1,40}:[A-Za-z0-9_-]{1,64}$/;
/** `rwd:<entry type lower case>:<opaque id>`, the idempotency key of one ledger entry. Same input, same key; a retry can never double an entry. */
export function rewardIdempotencyKey(type: RewardEntryType, opaqueId: string): string {
  if (!(REWARD_ENTRY_TYPES as readonly string[]).includes(type)) throw new TypeError(`rewardIdempotencyKey: unknown entry type ${String(type)}`);
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(opaqueId)) throw new TypeError("rewardIdempotencyKey: opaque id must be 1 to 64 of A-Za-z0-9_-");
  return `rwd:${type.toLowerCase()}:${opaqueId}`;
}

/** WhatsApp assistant: the only tools a model may choose and the error codes of the secure link (AD-5). The model never produces a fact. */
export const ASSISTANT_TOOL_NAMES = [
  "search_providers", "get_slots", "get_next_available", "hold_slot", "prepare_confirmation", "confirm_booking", "cancel_booking", "reschedule_booking", "join_waitlist", "handoff_to_human",
] as const;
export const ASSISTANT_ERROR_CODES = ["ASSISTANT_LINK_INVALID", "ASSISTANT_LINK_EXPIRED", "ASSISTANT_LINK_USED", "ASSISTANT_PHONE_NOT_VERIFIED", "ASSISTANT_BUDGET_EXCEEDED"] as const;

/** Integration kinds registered as concrete flag keys `growth.integrations.<kind>` (P1 section 8 noted none were registered). */
export const INTEGRATION_KINDS = ["googleads", "searchconsole", "ga4", "playconsole", "appstoreconnect", "metaads", "tiktok", "whatsappcloud", "fcmapns", "crux"] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

// ── GRW-P4-C corporate programme vocabulary (additive; unreleased 1.14.0 set). A corporate benefit is its OWN ledger: never a patient credit lot, never a provider credit, never a balance.
export const CORPORATE_ACCOUNT_STATUSES = ["LEAD", "ACTIVE", "PAUSED", "ENDED"] as const;
export const CORPORATE_FUNDING_MODES = ["SPONSOR_CREDIT", "PLATFORM_PROMO"] as const;
export const CORPORATE_CODE_KINDS = ["OPEN", "LIST"] as const;
export const CORPORATE_VERIFIED_BY = ["DOMAIN_EMAIL", "HR_LIST", "CODE"] as const;
export const CORPORATE_LEAD_SOURCES = ["B2B_REFERRAL", "OUTBOUND", "INBOUND"] as const;
export const CORPORATE_LEAD_STATUSES = ["NEW", "CONTACTED", "QUALIFIED", "PROPOSAL", "WON", "LOST", "DUPLICATE"] as const;
export const CORPORATE_BENEFIT_ENTRY_TYPES = ["RESERVE", "REDEEM", "RELEASE", "REVERSE"] as const;
/** Smallest group any employer-facing or ops corporate aggregate may show (a safety control, never a flag or a config value below it). */
export const CORPORATE_MIN_K = 10;
export const CORPORATE_ERROR_CODES = [
  "CORPORATE_CODE_INVALID", "CORPORATE_CODE_EXHAUSTED", "CORPORATE_CODE_EXPIRED", "CORPORATE_NOT_ELIGIBLE", "CORPORATE_ALREADY_MEMBER", "CORPORATE_ACCOUNT_NOT_ACTIVE",
  "CORPORATE_CEILING_EXCEEDED", "CORPORATE_MEMBER_CAP_EXCEEDED", "CORPORATE_SELF_APPROVAL", "CORPORATE_TERMS_INCOMPLETE", "CORPORATE_EMAIL_NOT_VERIFIED",
] as const;

// ── 1.13.0 consolidated additive vocabulary (waves 7 to 9)
/** Error codes of the journey builder and the recommendation engine (Kiorex ops API). Additive. */
export const PHASE3_ERROR_CODES = ["JOURNEY_INVALID", "RECOMMENDATION_NOT_AGGREGATE"] as const;
export const PHASE3_ERROR_STATUS: Record<(typeof PHASE3_ERROR_CODES)[number], number> = { JOURNEY_INVALID: 422, RECOMMENDATION_NOT_AGGREGATE: 422 };
/** Flags new in 1.13.0 (the other flag keys stay in `FLAGS`). */
export const GROWTH_FLAGS_1_13 = [
  "growth.attribution_models", "growth.cohorts_ltv", "growth.fraud_scoring", "growth.automation_journeys", "growth.ai_recommendations", "growth.seo_automation", "growth.market_onboarding", "clinic.sponsored_promotions",
] as const;
/** Growth analytics event names added with the Pharmacy and Lab ingest (P4-B2); `product` is a rollup dimension. */
export const PRODUCT_FUNNEL_EVENTS = ["order_started", "order_placed", "lab_booking_started", "lab_booking_placed"] as const;
/** Fraud action a TOUCH surface may take: quarantine only hides the touch from decisions and analytics, it never changes a booking or a commission. */
export const QUARANTINE_TOUCH_ACTION = "QUARANTINE_TOUCH" as const;
/** Invoice line and statement field of a provider-sponsored promotion (additive; Rev 2.6). */
export const PROMOTION_EXPENSE_LINE_CODE = "PROMOTION_EXPENSE" as const;

/**
 * Referral fraud rule RF_PROVIDER_COLLUSION: the Clinic answers "does one of these phone hashes belong to staff of this clinic?" (signed GET /marketplace/v1/growth/staff-phone-match).
 * Hash = base64url(HMAC-SHA256(key = HMAC-SHA256(clientSecret, "kx-staff-phone-match-v1"), message = last ten digits of the phone)). Both sides derive the key from the marketplace
 * client secret they already share, so no new secret exists and a hash is useless outside that one client. Vectors: fixtures/growth-v1.13/staff-phone-match-vectors.json.
 */
export function staffPhoneMatchDigits(phone: string): string {
  const d = phone.replace(/\D+/g, "");
  return d.length > 10 ? d.slice(-10) : d;
}
export function staffPhoneMatchHash(phone: string, clientSecret: string): string {
  const key = createHmac("sha256", clientSecret).update("kx-staff-phone-match-v1").digest();
  return createHmac("sha256", key).update(staffPhoneMatchDigits(phone)).digest("base64url");
}
// ── GRW-P4-D loyalty and partnership vocabulary (additive; unreleased). Points are a SEPARATE ledger: never cash, never a stored value; the only way out is a reward lot of kind LOYALTY in the patient reward ledger.
export const LOYALTY_TIERS = ["NONE", "SILVER", "GOLD", "PLATINUM"] as const;
/** CONVERT debits points when they become a reward lot; there is no top-up, transfer, gift or cash-out entry type. */
export const LOYALTY_ENTRY_TYPES = ["ACCRUE", "EXPIRE", "REVERSE", "TIER_BONUS", "CONVERT"] as const;
export const PARTNERSHIP_KINDS = ["CODE_DISCOUNT", "CO_PROMO", "CARD_OFFER"] as const;
export const PARTNERSHIP_STATUSES = ["DRAFT", "ACTIVE", "PAUSED", "ENDED"] as const;
export const PARTNERSHIP_FUNDING_MODES = ["PLATFORM_MARKETING", "PARTNER_FUNDED"] as const;
export const LOYALTY_ERROR_CODES = [
  "LOYALTY_NOT_AVAILABLE", "LOYALTY_INSUFFICIENT_POINTS", "LOYALTY_CONVERSION_OFF", "LOYALTY_CONVERSION_REFUSED", "PARTNERSHIP_CODE_INVALID", "PARTNERSHIP_CODE_EXHAUSTED",
  "PARTNERSHIP_CODE_EXPIRED", "PARTNERSHIP_BUDGET_EXCEEDED", "PARTNERSHIP_ALREADY_REDEEMED", "PARTNERSHIP_NOT_ACTIVE", "PARTNERSHIP_SELF_APPROVAL", "PARTNERSHIP_TERMS_INCOMPLETE",
] as const;
