import type { Channel, DeliveryStatus, NotificationIntent, Reason } from "./types.js";

export interface Attempt {
  /** 1-based, per notification. */
  n: number;
  channel: Channel;
  status: DeliveryStatus;
  reason?: Reason;
  detail?: string;
  providerRefs: string[];
  at: number;
  /** Epoch ms of the last status change (receipt or send). */
  updatedAt: number;
  /** Quiet hours: when the deferred send runs. */
  deferredUntil?: number;
}

export type DispatchPhase = "IN_PROGRESS" | "DEFERRED" | "DELIVERED" | "EXHAUSTED" | "SUPPRESSED";

export interface DispatchState {
  id: string;
  idempotencyKey: string;
  intent: NotificationIntent;
  /** Sequential chain (INAPP is a sidecar and not part of it). */
  chain: Channel[];
  parallel: boolean;
  fallbackAfterMs?: number;
  /** Index of the next chain channel to try (sequential only). */
  cursor: number;
  attempts: Attempt[];
  phase: DispatchPhase;
  /** Final receipt timeout passed with no channel left: phase stays EXHAUSTED unless a late receipt delivers. */
  closed?: boolean;
  /** When tick() must act next: fallback timeout or quiet-hours deferral. */
  nextActionAt?: number;
  createdAt: number;
  updatedAt: number;
}

/** Durable state the product provides (database table). The in-memory one is for tests and single-process use. */
export interface DispatchStore {
  getByKey(idempotencyKey: string): Promise<DispatchState | undefined>;
  getByProviderRef(channel: Channel, providerRef: string): Promise<DispatchState | undefined>;
  put(state: DispatchState): Promise<void>;
  /** Logical-duplicate registry: the notification id that already used this dedupe key and when. */
  getDedupe(key: string): Promise<{ id: string; at: number } | undefined>;
  putDedupe(key: string, id: string, at: number): Promise<void>;
  /** States with nextActionAt <= now and phase IN_PROGRESS | DEFERRED. */
  listDue(now: number, limit: number): Promise<DispatchState[]>;
}

export class MemoryDispatchStore implements DispatchStore {
  private readonly byKey = new Map<string, DispatchState>();
  private readonly byRef = new Map<string, string>();
  private readonly dedupe = new Map<string, { id: string; at: number }>();
  constructor(private readonly maxEntries = 10_000) {}

  async getByKey(k: string) { return this.byKey.get(k); }
  async getByProviderRef(channel: Channel, ref: string) {
    const key = this.byRef.get(`${channel}:${ref}`);
    return key ? this.byKey.get(key) : undefined;
  }
  async put(s: DispatchState) {
    this.byKey.set(s.idempotencyKey, s);
    for (const a of s.attempts) for (const r of a.providerRefs) this.byRef.set(`${a.channel}:${r}`, s.idempotencyKey);
    while (this.byKey.size > this.maxEntries) {
      const oldest = this.byKey.keys().next().value as string;
      this.byKey.delete(oldest);
    }
  }
  async getDedupe(k: string) { return this.dedupe.get(k); }
  async putDedupe(k: string, id: string, at: number) {
    this.dedupe.set(k, { id, at });
    while (this.dedupe.size > this.maxEntries) this.dedupe.delete(this.dedupe.keys().next().value as string);
  }
  async listDue(now: number, limit: number) {
    return [...this.byKey.values()].filter((s) => s.nextActionAt !== undefined && s.nextActionAt <= now && (s.phase === "IN_PROGRESS" || s.phase === "DEFERRED")).slice(0, limit);
  }
}
