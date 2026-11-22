import type { Channel, DeliveryStatus } from "./types.js";

const RANK: Record<DeliveryStatus, number> = { QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: -1, SKIPPED: -1 };

export const isTerminalStatus = (s: DeliveryStatus): boolean => s === "FAILED" || s === "SKIPPED" || s === "READ";
/** True once the recipient's device or inbox has the message. */
export const isDeliveredStatus = (s: DeliveryStatus): boolean => s === "DELIVERED" || s === "READ";

/**
 * Forward-only merge so retries and out-of-order webhooks are idempotent:
 * QUEUED < SENT < DELIVERED < READ. FAILED applies unless the message was already delivered or read;
 * a FAILED or SKIPPED row never moves again.
 */
export function mergeStatus(current: DeliveryStatus, next: DeliveryStatus): DeliveryStatus {
  if (current === "FAILED" || current === "SKIPPED") return current;
  if (next === "FAILED") return RANK[current] >= RANK.DELIVERED ? current : "FAILED";
  if (next === "SKIPPED") return current === "QUEUED" ? "SKIPPED" : current;
  return RANK[next] > RANK[current] ? next : current;
}

const key = (s: unknown): string => String(s ?? "").trim().toLowerCase().replace(/[\s-]+/g, "_");

const GENERIC: Record<string, DeliveryStatus> = {
  queued: "QUEUED", accepted: "QUEUED", pending: "QUEUED", scheduled: "QUEUED",
  sent: "SENT", submitted: "SENT", sending: "SENT", enroute: "SENT",
  delivered: "DELIVERED", delivrd: "DELIVERED",
  read: "READ", seen: "READ",
  failed: "FAILED", undelivered: "FAILED", undeliv: "FAILED", rejected: "FAILED", rejectd: "FAILED", expired: "FAILED", error: "FAILED",
};

const SMS: Record<string, DeliveryStatus> = { ...GENERIC, undeliverable: "FAILED", unknown: "FAILED", canceled: "FAILED" };

const EMAIL: Record<string, DeliveryStatus> = {
  ...GENERIC,
  processed: "SENT", send: "SENT", deferred: "SENT", delay: "SENT", delivery: "DELIVERED",
  open: "READ", opened: "READ", click: "READ", clicked: "READ",
  bounce: "FAILED", bounced: "FAILED", dropped: "FAILED", blocked: "FAILED", complaint: "FAILED", spamreport: "FAILED", spam_report: "FAILED", reject: "FAILED",
};

const WHATSAPP: Record<string, DeliveryStatus> = { ...GENERIC, deleted: "FAILED" };

const PUSH: Record<string, DeliveryStatus> = {
  ...GENERIC, ok: "SENT", success: "SENT", received: "DELIVERED", displayed: "DELIVERED",
  opened: "READ", clicked: "READ", dismissed: "DELIVERED",
  invalid_token: "FAILED", unregistered: "FAILED", not_registered: "FAILED", invalid_registration: "FAILED", mismatch_sender_id: "FAILED",
};

const INAPP: Record<string, DeliveryStatus> = { ...GENERIC, stored: "DELIVERED", unread: "DELIVERED", opened: "READ" };

const TABLES: Record<Channel, Record<string, DeliveryStatus>> = { SMS, EMAIL, WHATSAPP, PUSH, INAPP };

/** Vendor status normalizer. Returns undefined for an unknown status (never guesses). */
export function normalizeVendorStatus(channel: Channel, raw: unknown): DeliveryStatus | undefined {
  return TABLES[channel][key(raw)];
}
export const normalizeSmsStatus = (raw: unknown) => normalizeVendorStatus("SMS", raw);
export const normalizeEmailStatus = (raw: unknown) => normalizeVendorStatus("EMAIL", raw);
export const normalizeWhatsAppStatus = (raw: unknown) => normalizeVendorStatus("WHATSAPP", raw);
export const normalizePushStatus = (raw: unknown) => normalizeVendorStatus("PUSH", raw);
export const normalizeInAppStatus = (raw: unknown) => normalizeVendorStatus("INAPP", raw);

/**
 * Parse the provider-neutral webhook body `{ events: [{ id, status, error?, occurredAt? }] }`
 * (a single event object is accepted too) into normalized events.
 */
export function parseNeutralStatusBody(channel: Channel, rawBody: string): import("./types.js").StatusEvent[] {
  let j: unknown;
  try { j = JSON.parse(rawBody); } catch { return []; }
  const obj = j as { events?: unknown } | null;
  const list: any[] = Array.isArray(obj?.events) ? (obj!.events as any[]) : j && typeof j === "object" && !Array.isArray(j) ? [j] : [];
  const out: import("./types.js").StatusEvent[] = [];
  for (const e of list) {
    const status = normalizeVendorStatus(channel, e?.status);
    const providerRef = String(e?.id ?? e?.providerRef ?? "");
    if (!status || !providerRef) continue;
    out.push({
      providerRef, status,
      ...(status === "FAILED" ? { error: String(e?.error ?? "DELIVERY_FAILED").slice(0, 200) } : {}),
      ...(e?.occurredAt ? { occurredAt: String(e.occurredAt) } : {}),
    });
  }
  return out;
}
