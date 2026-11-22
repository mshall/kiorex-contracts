import type { Channel, DeliveryStatus, Locale, Reason, Severity } from "./types.js";

/**
 * The single audit record shape every product writes (one row per channel attempt or status change).
 * No bodies, no raw addresses, no params: PHI-free by construction.
 */
export interface AuditRecord {
  id: string;
  /** ISO timestamp. */
  at: string;
  notificationId: string;
  idempotencyKey: string;
  intentType: string;
  severity: Severity;
  recipientId: string;
  /** null for intent-level records (for example DEDUPED). */
  channel: Channel | null;
  status: DeliveryStatus;
  reason?: Reason;
  detail?: string;
  /** 1-based attempt counter within the notification. */
  attempt: number;
  locale: Locale;
  providerRef?: string;
  /** Masked address, for example `+201****567`, `a***@x.com`, `push:****`. */
  addressMasked?: string;
  mode?: "mock" | "real";
  /** Quiet hours: status QUEUED with reason QUIET_HOURS and the epoch ms the send is deferred to. */
  deferredUntil?: number;
}

/** Outbox / audit sink injected by the product (database table, queue, log). */
export interface AuditSink { write(record: AuditRecord): void | Promise<void> }

export class MemoryAuditSink implements AuditSink {
  readonly records: AuditRecord[] = [];
  write(r: AuditRecord): void { this.records.push(r); }
}

export function maskAddress(channel: Channel, to: string): string {
  if (channel === "EMAIL") { const [u = "", d] = to.split("@"); return d ? `${u.slice(0, 1)}***@${d}` : "***"; }
  if (channel === "PUSH") return "push:****";
  if (channel === "INAPP") return "inapp";
  return to.length > 6 ? `${to.slice(0, 4)}****${to.slice(-3)}` : "***";
}
