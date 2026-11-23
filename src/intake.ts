/**
 * Partner connection intake (1.9.0): how a partner product (Clinic, Nurse, Pharmacy, Lab) signs `POST /partners/v1/connection-requests`.
 *
 * Secrets: ops at Kiorex creates a one-time ENROLMENT CODE per partner (`kxe_<id>.<secret>`, shown once, single use, expiring, revocable).
 * The first request is signed with the enrolment code; Kiorex answers with an ISSUED INTAKE KEY (`kxi_<secret>`, shown once) which signs
 * every later request (re-submit, credential rotation). Kiorex stores only the derived signing key (sha256 hex of the secret), never the secret.
 *
 * Signature: `X-Kiorly-Signature: sha256=HMAC-SHA256(signingKey, "<X-Kiorly-Timestamp>.<rawBody>")`, signingKey = hex(sha256(secret)).
 * The body carries a single-use `nonce`; the timestamp (unix seconds) must be within 5 minutes.
 */
import { createHash, randomBytes } from "node:crypto";
import { signWebhook, verifyWebhook, WEBHOOK_HEADERS } from "./hmac.js";

export const INTAKE_PATH = "/partners/v1/connection-requests";
export const INTAKE_ENROLMENT_HEADER = "X-Kiorex-Enrolment";
export const INTAKE_MAX_BODY_BYTES = 64 * 1024;
export const INTAKE_MAX_SKEW_SECONDS = 5 * 60;
export const INTAKE_NONCE_PATTERN = /^[A-Za-z0-9_-]{16,64}$/;
export const INTAKE_ERROR_CODES = ["INVALID_JSON", "INVALID_REQUEST", "INVALID_KIND", "INVALID_BASE_URL", "CREDENTIALS_REQUIRED", "READINESS_TOO_LARGE", "INTAKE_UNAUTHORIZED", "PAYLOAD_TOO_LARGE", "RATE_LIMITED", "PARTNER_CONNECTION_NOT_FOUND"] as const;
export type IntakeErrorCode = (typeof INTAKE_ERROR_CODES)[number];

/** hex(sha256(secret)): the HMAC key for the intake signature; the only form Kiorex keeps. */
export function deriveIntakeSigningKey(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** `kxe_<id>` of a full enrolment code (what goes in X-Kiorex-Enrolment); undefined when the code is malformed. */
export function enrolmentIdOf(code: string): string | undefined {
  const m = /^(kxe_[A-Za-z0-9_-]{8,16})\.[A-Za-z0-9_-]{32,64}$/.exec(code.trim());
  return m?.[1];
}

/** Used by Kiorex ops tooling and tests: a fresh enrolment code and what Kiorex stores for it. */
export function generateEnrolmentCode(): { id: string; code: string; signingKey: string } {
  const id = `kxe_${randomBytes(6).toString("base64url")}`;
  const code = `${id}.${randomBytes(32).toString("base64url")}`;
  return { id, code, signingKey: deriveIntakeSigningKey(code) };
}
export function generateIntakeKey(): { key: string; signingKey: string } {
  const key = `kxi_${randomBytes(32).toString("base64url")}`;
  return { key, signingKey: deriveIntakeSigningKey(key) };
}
export const newIntakeNonce = (): string => randomBytes(18).toString("base64url");

/** Partner side: headers for a raw JSON body signed with the enrolment code (first request) or the issued intake key (later requests). */
export function signIntakeRequest(input: { secret: string; body: string; timestamp?: number; enrolmentCode?: string }): Record<string, string> {
  const s = signWebhook({ secret: deriveIntakeSigningKey(input.secret), body: input.body, timestamp: input.timestamp });
  const headers: Record<string, string> = { "content-type": "application/json", [WEBHOOK_HEADERS.timestamp]: s.timestamp, [WEBHOOK_HEADERS.signature]: s.signature };
  const id = input.enrolmentCode ? enrolmentIdOf(input.enrolmentCode) : undefined;
  if (id) headers[INTAKE_ENROLMENT_HEADER] = id;
  return headers;
}

/** Kiorex side: `signingKey` is what Kiorex stored (hex sha256 of the secret). Timestamp window only; nonce de-duplication is the receiver's job. */
export function verifyIntakeSignature(input: { signingKey: string; body: string | Uint8Array; timestamp: string | undefined; signature: string | undefined; now?: number }): boolean {
  return verifyWebhook({ secret: input.signingKey, body: input.body, timestamp: input.timestamp, signature: input.signature, now: input.now, toleranceSeconds: INTAKE_MAX_SKEW_SECONDS }).ok;
}
