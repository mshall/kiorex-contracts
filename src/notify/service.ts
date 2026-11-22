import { type AuditRecord, type AuditSink, maskAddress } from "./audit.js";
import { evaluateGate, type PreferenceStore } from "./gate.js";
import { DEFAULT_ROUTING, planRoute, type RoutingPolicy } from "./routing.js";
import { isDeliveredStatus, mergeStatus } from "./status.js";
import { type Attempt, type DispatchState, type DispatchStore, MemoryDispatchStore } from "./store.js";
import type { TemplateRegistry } from "./templates.js";
import type { Channel, ChannelAdapter, Clock, DeliveryStatus, NotificationIntent, Reason, RenderedMessage, StatusEvent } from "./types.js";
import { CHANNELS, LOCALES } from "./types.js";

export interface NotificationServiceOptions {
  adapters: ReadonlyArray<ChannelAdapter>;
  registry: TemplateRegistry;
  preferences: PreferenceStore;
  audit: AuditSink;
  clock?: Clock;
  routing?: RoutingPolicy;
  store?: DispatchStore;
  /** Id generator; default crypto.randomUUID(). */
  newId?: () => string;
  /** Default dedupe window when an intent gives `dedupe` without `windowMs` (24 h). */
  defaultDedupeWindowMs?: number;
}

export interface WebhookResult { verified: boolean; applied: number; ignored: number }

const DAY = 24 * 3600_000;

/**
 * The notification layer. Pure: all I/O goes through the injected adapters, preference store, audit sink,
 * dispatch store and clock. Timers are the caller's job: call tick() on a schedule (every minute is plenty).
 */
export class NotificationService {
  private readonly adapters = new Map<Channel, ChannelAdapter>();
  private readonly registry: TemplateRegistry;
  private readonly prefs: PreferenceStore;
  private readonly sink: AuditSink;
  private readonly clock: Clock;
  private readonly routing: RoutingPolicy;
  private readonly store: DispatchStore;
  private readonly newId: () => string;
  private readonly dedupeMs: number;

  constructor(o: NotificationServiceOptions) {
    for (const a of o.adapters) this.adapters.set(a.channel, a);
    this.registry = o.registry;
    this.prefs = o.preferences;
    this.sink = o.audit;
    this.clock = o.clock ?? { now: () => Date.now() };
    this.routing = o.routing ?? DEFAULT_ROUTING;
    this.store = o.store ?? new MemoryDispatchStore();
    this.newId = o.newId ?? (() => globalThis.crypto.randomUUID());
    this.dedupeMs = o.defaultDedupeWindowMs ?? DAY;
  }

  /** Swap an adapter at runtime (tests, go-live wiring). */
  setAdapter(a: ChannelAdapter): void { this.adapters.set(a.channel, a); }
  adapter(channel: Channel): ChannelAdapter | undefined { return this.adapters.get(channel); }

  /** Accept an intent: apply idempotency + dedupe, route, gate, render, send. Never throws for a delivery problem. */
  async dispatch(intent: NotificationIntent): Promise<DispatchState> {
    const bad = this.validate(intent);
    const existing = await this.store.getByKey(intent.idempotencyKey);
    if (existing) return structuredClone(existing);
    const now = this.clock.now();
    const state: DispatchState = {
      id: this.newId(), idempotencyKey: intent.idempotencyKey, intent: structuredClone(intent), chain: [], parallel: false,
      cursor: 0, attempts: [], phase: "IN_PROGRESS", createdAt: now, updatedAt: now,
    };
    if (bad) return this.suppress(state, bad.reason, bad.detail, "EXHAUSTED");
    if (intent.dedupe) {
      const dk = `${intent.recipient.id}|${intent.type}|${intent.dedupe.key}`;
      const prev = await this.store.getDedupe(dk);
      if (prev && now - prev.at < (intent.dedupe.windowMs ?? this.dedupeMs)) return this.suppress(state, "DEDUPED", prev.id, "SUPPRESSED");
      await this.store.putDedupe(dk, state.id, now);
    }
    const route = planRoute(this.routing, intent.severity, intent.channels);
    state.parallel = !!route.parallel;
    state.fallbackAfterMs = route.fallbackAfterMs;
    state.chain = route.channels.filter((c) => c !== "INAPP");
    if (route.channels.includes("INAPP")) await this.attempt(state, "INAPP");
    if (state.parallel) {
      await Promise.all(state.chain.map((c) => this.attempt(state, c)));
      state.cursor = state.chain.length;
    } else {
      await this.advance(state);
    }
    this.settle(state);
    await this.store.put(state);
    return structuredClone(state);
  }

  /** Resume due work: quiet-hours deferrals and fallback after a delivery-receipt timeout. Returns processed ids. */
  async tick(limit = 100): Promise<string[]> {
    const now = this.clock.now();
    const due = await this.store.listDue(now, limit);
    const done: string[] = [];
    for (const s of due) {
      const state = structuredClone(s);
      const wasDeferred = state.phase === "DEFERRED";
      state.nextActionAt = undefined;
      state.phase = "IN_PROGRESS";
      if (!wasDeferred && state.cursor >= state.chain.length) state.closed = true; // last channel timed out: nothing left to try
      else await this.advance(state, wasDeferred ? undefined : "FALLBACK_AFTER_TIMEOUT");
      this.settle(state);
      await this.store.put(state);
      done.push(state.id);
    }
    return done;
  }

  /** Apply one normalized provider status. Forward-only; a FAILED chain attempt falls back immediately. */
  async applyStatus(channel: Channel, ev: StatusEvent): Promise<DispatchState | null> {
    const stored = await this.store.getByProviderRef(channel, ev.providerRef);
    if (!stored) return null;
    const state = structuredClone(stored);
    const a = state.attempts.find((x) => x.channel === channel && x.providerRefs.includes(ev.providerRef))!; // the store indexes by ref, so it exists
    const next = mergeStatus(a.status, ev.status);
    if (next === a.status) return state; // idempotent replay or stale event
    a.status = next;
    a.updatedAt = ev.occurredAt && !Number.isNaN(Date.parse(ev.occurredAt)) ? Date.parse(ev.occurredAt) : this.clock.now();
    if (next === "FAILED") { a.reason = "DELIVERY_FAILED"; a.detail = ev.error?.slice(0, 200); }
    await this.audit(state, a, a.providerRefs[0]);
    state.updatedAt = this.clock.now();
    if (next === "FAILED" && !state.parallel && state.phase === "IN_PROGRESS" && state.chain.includes(channel) && this.isLastChainAttempt(state, a)) {
      state.nextActionAt = undefined;
      await this.advance(state);
    }
    this.settle(state);
    await this.store.put(state);
    return structuredClone(state);
  }

  /** Verify + parse + apply a provider webhook for one channel. */
  async handleWebhook(channel: Channel, rawBody: string, headers: Record<string, unknown> = {}): Promise<WebhookResult> {
    const adapter = this.adapters.get(channel);
    if (!adapter || !adapter.verify(rawBody, headers)) return { verified: false, applied: 0, ignored: 0 };
    let applied = 0; let ignored = 0;
    for (const ev of adapter.parseWebhook(rawBody, headers)) {
      const before = await this.store.getByProviderRef(channel, ev.providerRef);
      const prevStatus = before?.attempts.find((x) => x.providerRefs.includes(ev.providerRef))?.status;
      const after = await this.applyStatus(channel, ev);
      const now = after?.attempts.find((x) => x.providerRefs.includes(ev.providerRef))?.status;
      if (after && now !== prevStatus) applied++; else ignored++;
    }
    return { verified: true, applied, ignored };
  }

  // ── internals ──
  private validate(i: NotificationIntent): { reason: Reason; detail: string } | null {
    if (!i.idempotencyKey) return { reason: "PARAM_MISSING", detail: "idempotencyKey" };
    if (!i.recipient?.id) return { reason: "PARAM_MISSING", detail: "recipient.id" };
    if (!LOCALES.includes(i.recipient.locale)) return { reason: "PARAM_MISSING", detail: "recipient.locale" };
    const def = this.registry.get(i.type);
    if (!def) return { reason: "UNKNOWN_TYPE", detail: i.type };
    return this.registry.checkParams(def, i.params ?? {});
  }

  private async suppress(state: DispatchState, reason: Reason, detail: string, phase: DispatchState["phase"]): Promise<DispatchState> {
    state.phase = phase;
    const a: Attempt = { n: 1, channel: "INAPP", status: "SKIPPED", reason, detail, providerRefs: [], at: this.clock.now(), updatedAt: this.clock.now() };
    await this.audit(state, a, undefined, undefined, true); // intent-level record: no channel, no attempt row
    await this.store.put(state);
    return structuredClone(state);
  }

  /** Sequential routing: try chain channels from the cursor until one is accepted by a provider (or deferred). */
  private async advance(state: DispatchState, note?: string): Promise<void> {
    while (state.cursor < state.chain.length) {
      const channel = state.chain[state.cursor]!;
      const a = await this.attempt(state, channel, note);
      note = undefined;
      if (a.reason === "QUIET_HOURS" && a.deferredUntil !== undefined) {
        state.phase = "DEFERRED"; state.nextActionAt = a.deferredUntil;
        state.attempts.pop(); // the deferral is audited but is not an attempt; the channel is retried at cursor
        return;
      }
      state.cursor++;
      if (a.status === "SENT" || a.status === "QUEUED" || isDeliveredStatus(a.status)) {
        if (!isDeliveredStatus(a.status) && state.fallbackAfterMs !== undefined) state.nextActionAt = this.clock.now() + state.fallbackAfterMs;
        return;
      }
    }
    state.nextActionAt = undefined;
  }

  private isLastChainAttempt(state: DispatchState, a: Attempt): boolean {
    const chainAttempts = state.attempts.filter((x) => state.chain.includes(x.channel));
    return chainAttempts[chainAttempts.length - 1] === a;
  }

  /** Derive the overall phase from the chain attempts (or the sidecar when the chain is empty). */
  private settle(state: DispatchState): void {
    state.updatedAt = this.clock.now();
    if (state.phase === "DEFERRED" || state.phase === "SUPPRESSED") return;
    const chainAttempts = state.attempts.filter((a) => state.chain.includes(a.channel));
    const pool = state.chain.length ? chainAttempts : state.attempts;
    if (pool.some((a) => isDeliveredStatus(a.status))) { state.phase = "DELIVERED"; state.nextActionAt = undefined; return; }
    const open = pool.some((a) => a.status === "SENT" || a.status === "QUEUED");
    const moreToTry = !state.parallel && state.cursor < state.chain.length;
    state.phase = (open && !state.closed) || moreToTry ? "IN_PROGRESS" : "EXHAUSTED";
    if (state.phase === "EXHAUSTED") state.nextActionAt = undefined;
  }

  /** One channel attempt: gate, render, send. Appends an Attempt and writes the audit record. */
  private async attempt(state: DispatchState, channel: Channel, note?: string): Promise<Attempt> {
    const { intent } = state;
    const now = this.clock.now();
    const a: Attempt = { n: state.attempts.length + 1, channel, status: "SKIPPED", providerRefs: [], at: now, updatedAt: now, ...(note ? { detail: note } : {}) };
    state.attempts.push(a);
    const finish = async (status: DeliveryStatus, reason?: Reason, detail?: string, addr?: string): Promise<Attempt> => {
      a.status = status; a.reason = reason; if (detail) a.detail = detail;
      await this.write(state, a, addr ?? null);
      return a;
    };
    const def = this.registry.get(intent.type)!;
    if (!def.channels[channel]) return finish("SKIPPED", "NO_TEMPLATE");
    const adapter = this.adapters.get(channel);
    if (!adapter) return finish("SKIPPED", "NO_ADAPTER");
    const pref = await this.prefs.get(intent.recipient.id, { channel, purpose: def.purpose });
    const gate = evaluateGate({ channel, recipient: intent.recipient, pref, now, critical: intent.severity === "CRITICAL", quietBypass: !!def.quietBypass });
    if (!gate.allow) {
      if (gate.reason === "QUIET_HOURS") { a.deferredUntil = gate.until; return finish("QUEUED", "QUIET_HOURS"); }
      return finish("SKIPPED", gate.reason);
    }
    const r = this.registry.render(intent.type, channel, intent.recipient.locale, intent.params ?? {});
    if (!r.ok) return finish("FAILED", r.reason, r.detail);
    if (channel === "WHATSAPP") {
      const b = r.body as { template?: unknown; text?: string };
      if (!gate.whatsappFreeForm) {
        if (!b.template) return finish("SKIPPED", "WHATSAPP_WINDOW");
        delete b.text; // outside the 24 h window only the approved template goes out
      }
    }
    let anyOk = false; let err: string | undefined;
    for (const to of gate.addresses) {
      const msg: RenderedMessage = { notificationId: state.id, channel, to, type: intent.type, locale: intent.recipient.locale, body: r.body as never, severity: intent.severity, attempt: a.n, ...(intent.metadata ? { metadata: intent.metadata } : {}) };
      try {
        const out = await adapter.send(msg);
        if (out.ok) { anyOk = true; if (out.providerRef) a.providerRefs.push(out.providerRef); } else err = out.error ?? "SEND_FAILED";
      } catch (e) { err = String(e instanceof Error ? e.message : e).slice(0, 200); a.reason = "ADAPTER_ERROR"; }
    }
    const addr = maskAddress(channel, gate.addresses[0]!);
    if (!anyOk) return finish("FAILED", a.reason ?? "SEND_FAILED", err, addr);
    // INAPP is stored synchronously: it is delivered the moment the adapter accepts it.
    return finish(channel === "INAPP" ? "DELIVERED" : "SENT", undefined, undefined, addr);
  }

  private async write(state: DispatchState, a: Attempt, addressMasked: string | null): Promise<void> {
    await this.audit(state, a, a.providerRefs[0], addressMasked ?? undefined);
  }

  private async audit(state: DispatchState, a: Attempt, providerRef?: string, addressMasked?: string, intentLevel = false): Promise<void> {
    const i = state.intent;
    const rec: AuditRecord = {
      id: this.newId(), at: new Date(this.clock.now()).toISOString(), notificationId: state.id, idempotencyKey: state.idempotencyKey,
      intentType: i.type, severity: i.severity, recipientId: i.recipient.id,
      channel: intentLevel ? null : a.channel,
      status: a.status, ...(a.reason ? { reason: a.reason } : {}), ...(a.detail ? { detail: a.detail } : {}), attempt: a.n, locale: i.recipient.locale,
      ...(providerRef ? { providerRef } : {}), ...(addressMasked ? { addressMasked } : {}),
      ...(!intentLevel && this.adapters.get(a.channel) ? { mode: this.adapters.get(a.channel)!.mode } : {}),
      ...(a.deferredUntil !== undefined ? { deferredUntil: a.deferredUntil } : {}),
    };
    await this.sink.write(rec);
  }
}
