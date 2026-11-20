/**
 * HMAC helpers. The Kiorly request helpers reproduce, byte for byte, the algorithm in
 * clinics-management/apps/api/src/marketplace/marketplace-hmac.ts and marketplace-auth.guard.ts.
 * The webhook helpers reproduce OutboxDeliveryService.signBody / post() in
 * clinics-management/apps/api/src/messaging/outbox-delivery.service.ts.
 * Vectors in test/hmac-vectors.json were computed by executing Kiorly's own functions.
 */
import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export const MARKETPLACE_HMAC_MAX_SKEW_MS = 5 * 60 * 1000;
export const WEBHOOK_MAX_SKEW_SECONDS = 5 * 60;

export const KIORLY_HEADERS = {
  clientKey: "X-Kiorly-Client-Key",
  clientSecret: "X-Kiorly-Client-Secret",
  timestamp: "X-Kiorly-Timestamp",
  nonce: "X-Kiorly-Nonce",
  signature: "X-Kiorly-Signature",
} as const;
export const CONTROL_PLANE_PRODUCT_KEY_HEADER = "X-Kiorex-Product-Key";

type Body = string | Uint8Array | Buffer | undefined | null;

const toBuffer = (body: Body): Buffer | undefined =>
  body == null ? undefined : typeof body === "string" ? Buffer.from(body, "utf8") : Buffer.from(body);

/** sha256 hex of the body; an empty/absent body hashes the empty string (as Kiorly does). */
export function sha256BodyHex(body: Body): string {
  const buf = toBuffer(body);
  const h = createHash("sha256");
  if (buf?.length) h.update(buf);
  return h.digest("hex");
}

/** TIMESTAMP \n NONCE \n METHOD(upper) \n PATH \n sha256hex(BODY) */
export function kiorlyCanonicalString(input: {
  timestamp: string;
  nonce: string;
  method: string;
  path: string;
  bodySha256: string;
}): string {
  return `${input.timestamp}\n${input.nonce}\n${input.method.toUpperCase()}\n${input.path}\n${input.bodySha256}`;
}

export function signCanonical(secret: string, canonical: string): string {
  return createHmac("sha256", secret).update(canonical).digest("base64url");
}

export function verifyCanonicalSignature(secret: string, canonical: string, signature: string): boolean {
  const a = Buffer.from(signCanonical(secret, canonical));
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Kiorly signs the request path WITHOUT the query string, including any global prefix (e.g. /api/v1/...). */
export function stripQuery(path: string): string {
  return path.split("?")[0] ?? path;
}

export interface SignKiorlyRequestInput {
  clientKey: string;
  clientSecret: string;
  method: string;
  /** Full request path as received by the server (originalUrl); the query string is ignored. */
  path: string;
  body?: Body;
  /** unix epoch milliseconds as a string; defaults to Date.now(). */
  timestamp?: string | number;
  nonce?: string;
}

export interface SignedKiorlyRequest {
  headers: Record<string, string>;
  canonical: string;
  signature: string;
  timestamp: string;
  nonce: string;
}

/** Headers for Kiorex -> Kiorly marketplace calls (scope MARKETPLACE). Matches KX-09 §02. */
export function signKiorlyRequest(input: SignKiorlyRequestInput): SignedKiorlyRequest {
  const timestamp = String(input.timestamp ?? Date.now());
  const nonce = input.nonce ?? randomUUID();
  const canonical = kiorlyCanonicalString({
    timestamp,
    nonce,
    method: input.method,
    path: stripQuery(input.path),
    bodySha256: sha256BodyHex(input.body),
  });
  const signature = signCanonical(input.clientSecret, canonical);
  return {
    headers: {
      [KIORLY_HEADERS.clientKey]: input.clientKey,
      [KIORLY_HEADERS.clientSecret]: input.clientSecret,
      [KIORLY_HEADERS.timestamp]: timestamp,
      [KIORLY_HEADERS.nonce]: nonce,
      [KIORLY_HEADERS.signature]: signature,
    },
    canonical,
    signature,
    timestamp,
    nonce,
  };
}

export type VerifyFailure = "missing_headers" | "stale_timestamp" | "bad_signature";
export type VerifyResult = { ok: true } | { ok: false; reason: VerifyFailure };

export interface VerifyKiorlyRequestInput {
  /** Case-insensitive header lookup is applied. */
  headers: Record<string, string | string[] | undefined>;
  method: string;
  path: string;
  body?: Body;
  /** Secret resolved from the client key by the caller. */
  secret: string;
  now?: number;
  maxSkewMs?: number;
}

function header(headers: VerifyKiorlyRequestInput["headers"], name: string): string | undefined {
  const lower = name.toLowerCase();
  for (const [k, v] of Object.entries(headers)) {
    if (k.toLowerCase() === lower) return (Array.isArray(v) ? v[0] : v)?.trim();
  }
  return undefined;
}

/** Same checks as MarketplaceAuthGuard minus client lookup / nonce store / IP allow-list (caller's job). */
export function verifyKiorlyRequest(input: VerifyKiorlyRequestInput): VerifyResult {
  const timestamp = header(input.headers, KIORLY_HEADERS.timestamp);
  const nonce = header(input.headers, KIORLY_HEADERS.nonce);
  const signature = header(input.headers, KIORLY_HEADERS.signature);
  if (!timestamp || !nonce || !signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(timestamp);
  const now = input.now ?? Date.now();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (input.maxSkewMs ?? MARKETPLACE_HMAC_MAX_SKEW_MS)) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const canonical = kiorlyCanonicalString({
    timestamp,
    nonce,
    method: input.method,
    path: stripQuery(input.path),
    bodySha256: sha256BodyHex(input.body),
  });
  return verifyCanonicalSignature(input.secret, canonical, signature) ? { ok: true } : { ok: false, reason: "bad_signature" };
}

/**
 * Control-plane snapshot request (KX-08 §08, INTEGRATION.md): same canonical scheme, identified by
 * X-Kiorex-Product-Key. The secret is NOT sent as a header.
 */
export function signControlPlaneRequest(
  input: Omit<SignKiorlyRequestInput, "clientKey" | "clientSecret"> & { productKey: string; productSecret: string },
): SignedKiorlyRequest {
  const signed = signKiorlyRequest({ ...input, clientKey: input.productKey, clientSecret: input.productSecret });
  const headers = { ...signed.headers };
  delete headers[KIORLY_HEADERS.clientKey];
  delete headers[KIORLY_HEADERS.clientSecret];
  headers[CONTROL_PLANE_PRODUCT_KEY_HEADER] = input.productKey;
  return { ...signed, headers };
}

export function verifyControlPlaneRequest(input: VerifyKiorlyRequestInput): VerifyResult {
  return verifyKiorlyRequest(input);
}

// ---------------------------------------------------------------------------------------------
// Webhooks (Kiorly outbox -> Kiorex, control plane flag.changed -> products)
// ---------------------------------------------------------------------------------------------

export const WEBHOOK_HEADERS = {
  event: "X-Kiorly-Event",
  eventId: "X-Kiorly-Event-Id",
  timestamp: "X-Kiorly-Timestamp",
  signature: "X-Kiorly-Signature",
  /**
   * Partner webhooks (Kiorly Pharmacy / Kiorly Lab -> Kiorex, 1.4.0): the partner's integration client key. Kiorex resolves the
   * partner registration (and its per-partner webhook secret) from it. Optional for Kiorly Clinic (single global secret).
   */
  clientKey: "X-Kiorly-Client-Key",
} as const;

/**
 * Where partner products live relative to their host (1.4.0, INTEGRATION.md "Vertical partners"). Kiorex stores only the host
 * per partner registration and appends these; the path is part of the HMAC canonical string, so both sides must agree on it.
 */
export const PARTNER_API_PATH = { pharmacy: "/marketplace/v1", lab: "/api/v1/integration/v1" } as const;
/** Kiorex receiver paths for partner outbox events (host = Kiorex API). */
export const PARTNER_WEBHOOK_PATH = { pharmacy: "/api/v1/webhooks/pharmacy", lab: "/api/v1/webhooks/lab" } as const;
/** Dev registration shared by Kiorex and the partners (documented in INTEGRATION.md; never used in production). */
export const PARTNER_DEV_DEFAULTS = {
  pharmacy: { baseUrl: "http://localhost:3100", clientKey: "kx_dev_pharmacy_client", clientSecret: "kx_dev_pharmacy_secret_change_me", webhookSecret: "kx_dev_pharmacy_webhook_secret" },
  lab: { baseUrl: "http://localhost:3200", clientKey: "kl_dev_kiorex", clientSecret: "dev_kiorex_secret_change_me", webhookSecret: "kx_dev_lab_webhook_secret" },
  /** 1.6.0 (KNLAB01): Kiorex's second registration at the Lab, with the KIORLY_NURSE client source (outbound only: the lab signs every webhook with the KIOREX_BOOKING client). */
  labNurse: { baseUrl: "http://localhost:3200", clientKey: "kl_dev_nurse", clientSecret: "dev_nurse_secret_change_me" },
} as const;

/** hex HMAC-SHA256(secret, `${timestampSeconds}.${body}`) — OutboxDeliveryService.signBody. */
export function webhookSignatureHex(secret: string, timestampSeconds: number | string, body: string | Uint8Array): string {
  const text = typeof body === "string" ? body : Buffer.from(body).toString("utf8");
  return createHmac("sha256", secret).update(`${timestampSeconds}.${text}`).digest("hex");
}

export interface SignedWebhook {
  timestamp: string;
  /** `sha256=<hex>` — the X-Kiorly-Signature header value. */
  signature: string;
  headers: Record<string, string>;
}

export function signWebhook(input: {
  secret: string;
  body: string | Uint8Array;
  /** unix SECONDS; defaults to now. */
  timestamp?: number;
  eventType?: string;
  eventId?: string;
  /** Partner webhooks: sends X-Kiorly-Client-Key so the receiver can pick the per-partner secret. */
  clientKey?: string;
}): SignedWebhook {
  const timestamp = String(input.timestamp ?? Math.floor(Date.now() / 1000));
  const signature = `sha256=${webhookSignatureHex(input.secret, timestamp, input.body)}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    [WEBHOOK_HEADERS.timestamp]: timestamp,
    [WEBHOOK_HEADERS.signature]: signature,
  };
  if (input.eventType) headers[WEBHOOK_HEADERS.event] = input.eventType;
  if (input.eventId) headers[WEBHOOK_HEADERS.eventId] = input.eventId;
  if (input.clientKey) headers[WEBHOOK_HEADERS.clientKey] = input.clientKey;
  return { timestamp, signature, headers };
}

/**
 * Verify a webhook. `body` MUST be the raw bytes received (not re-serialised JSON).
 * Kiorly itself sends no replay guard beyond the timestamp, so receivers also de-duplicate on eventId.
 */
export function verifyWebhook(input: {
  secret: string;
  body: string | Uint8Array;
  timestamp: string | undefined;
  signature: string | undefined;
  /** unix SECONDS; defaults to now. */
  now?: number;
  toleranceSeconds?: number;
}): VerifyResult {
  if (!input.timestamp || !input.signature) return { ok: false, reason: "missing_headers" };
  const ts = Number(input.timestamp);
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts) || Math.abs(now - ts) > (input.toleranceSeconds ?? WEBHOOK_MAX_SKEW_SECONDS)) {
    return { ok: false, reason: "stale_timestamp" };
  }
  const expected = Buffer.from(`sha256=${webhookSignatureHex(input.secret, input.timestamp, input.body)}`);
  const got = Buffer.from(input.signature);
  if (expected.length !== got.length || !timingSafeEqual(expected, got)) return { ok: false, reason: "bad_signature" };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Flag snapshot signature
// ---------------------------------------------------------------------------------------------

/** JSON.stringify with recursively sorted object keys (stable across producers). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** base64url HMAC-SHA256 over canonicalJson(snapshot without `signature`). */
export function signSnapshot(secret: string, snapshot: Record<string, unknown>): string {
  const { signature: _ignored, ...rest } = snapshot;
  void _ignored;
  return createHmac("sha256", secret).update(canonicalJson(rest)).digest("base64url");
}

export function verifySnapshot(secret: string, snapshot: Record<string, unknown> & { signature?: string }): boolean {
  if (typeof snapshot.signature !== "string") return false;
  const a = Buffer.from(signSnapshot(secret, snapshot));
  const b = Buffer.from(snapshot.signature);
  return a.length === b.length && timingSafeEqual(a, b);
}
