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
import { createHash } from "node:crypto";
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
] as const;
export type GrowthErrorCode = (typeof GROWTH_ERROR_CODES)[number];

/** HTTP status each growth code is served with (the OpenAPI documents the same). */
export const GROWTH_ERROR_STATUS: Record<GrowthErrorCode, number> = {
  GROWTH_INVALID_REQUEST: 400, GROWTH_PHI_REJECTED: 422, GROWTH_EVENT_NOT_ALLOWED: 422, GROWTH_CONSENT_REQUIRED: 403, GROWTH_RATE_LIMITED: 429,
  GROWTH_LINK_TOKEN_INVALID: 400, GROWTH_LINK_TOKEN_EXPIRED: 400, GROWTH_EVIDENCE_NOT_FOUND: 404,
  GROWTH_CONFIG_INVALID: 422, GROWTH_CONFIG_NOT_FOUND: 404, GROWTH_CONFIG_TRANSITION_FORBIDDEN: 409, GROWTH_CONFIG_SELF_APPROVAL: 403, GROWTH_CONFIG_EFFECTIVE_TOO_SOON: 422,
  GROWTH_WIDGET_ORIGIN_INVALID: 400, GROWTH_WIDGET_ORIGIN_NOT_ALLOWED: 403,
  ACQUISITION_BLOCK_INVALID: 400, ACQUISITION_EVIDENCE_HASH_INVALID: 400,
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
