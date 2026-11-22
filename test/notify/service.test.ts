import { describe, expect, it } from "vitest";
import {
  addressFor, createMockAdapters, evaluateGate, MemoryAuditSink, MemoryDispatchStore, MockChannelAdapter, NotificationService, planRoute, quietUntil,
  DEFAULT_ROUTING, WHATSAPP_WINDOW_MS, maskAddress, NOTIFY_LAYER_VERSION, type RoutingPolicy,
} from "../../src/notify/index.js";
import { intent, makeRegistry, makeService, MapPrefs, recipient, T0, FakeClock } from "./harness.js";

const MIN = 60_000;
const QUIET = { startHour: 22, endHour: 7, tzOffsetMinutes: 120 };
const NIGHT = Date.UTC(2026, 10, 23, 21, 0, 0); // 23:00 Cairo
const MORNING = Date.UTC(2026, 10, 24, 5, 0, 0); // 07:00 Cairo

describe("routing policy", () => {
  it("plans by severity, narrows by channels keeping policy order", () => {
    expect(planRoute(DEFAULT_ROUTING, "ROUTINE").channels).toEqual(["INAPP", "PUSH", "EMAIL"]);
    expect(planRoute(DEFAULT_ROUTING, "IMPORTANT").channels).toEqual(["INAPP", "PUSH", "WHATSAPP", "SMS"]);
    expect(planRoute(DEFAULT_ROUTING, "CRITICAL")).toMatchObject({ parallel: true });
    expect(planRoute(DEFAULT_ROUTING, "IMPORTANT", ["SMS", "PUSH"]).channels).toEqual(["PUSH", "SMS"]);
    expect(planRoute(DEFAULT_ROUTING, "ROUTINE", ["WHATSAPP", "PUSH", "WHATSAPP"]).channels).toEqual(["PUSH", "WHATSAPP"]); // outside the route: appended
  });
  it("sends only to the chain head while it is pending, INAPP is always written (sidecar)", async () => {
    const { svc, adapters } = makeService();
    const s = await svc.dispatch(intent());
    expect(adapters.INAPP.sent).toHaveLength(1);
    expect(adapters.PUSH.sent).toHaveLength(1);
    expect(adapters.EMAIL.sent).toHaveLength(0);
    expect(s.phase).toBe("IN_PROGRESS");
    expect(s.attempts.map((a) => [a.channel, a.status])).toEqual([["INAPP", "DELIVERED"], ["PUSH", "SENT"]]);
    expect(s.nextActionAt).toBe(T0 + 15 * MIN);
  });
});

describe("fallback", () => {
  it("falls back after the receipt timeout and not before", async () => {
    const { svc, adapters, clock } = makeService();
    await svc.dispatch(intent());
    clock.advance(14 * MIN + 59_000);
    expect(await svc.tick()).toEqual([]);
    expect(adapters.EMAIL.sent).toHaveLength(0);
    clock.advance(1_000);
    expect(await svc.tick()).toHaveLength(1);
    expect(adapters.EMAIL.sent).toHaveLength(1);
    expect(adapters.EMAIL.sent[0]!.message.attempt).toBe(3);
  });
  it("does not fall back when a delivery receipt arrived in time", async () => {
    const { svc, adapters, clock } = makeService();
    await svc.dispatch(intent());
    const ref = adapters.PUSH.lastRef!;
    clock.advance(2 * MIN);
    const s = await svc.applyStatus("PUSH", { providerRef: ref, status: "DELIVERED" });
    expect(s!.phase).toBe("DELIVERED");
    expect(s!.nextActionAt).toBeUndefined();
    clock.advance(60 * MIN);
    expect(await svc.tick()).toEqual([]);
    expect(adapters.EMAIL.sent).toHaveLength(0);
  });
  it("falls back immediately when the send fails or a FAILED receipt arrives", async () => {
    const a = makeService();
    a.adapters.PUSH.failNext(1, "TOKEN_GONE");
    const s = await a.svc.dispatch(intent());
    expect(a.adapters.EMAIL.sent).toHaveLength(1);
    expect(s.attempts.find((x) => x.channel === "PUSH")).toMatchObject({ status: "FAILED", reason: "SEND_FAILED", detail: "TOKEN_GONE" });

    const b = makeService();
    await b.svc.dispatch(intent());
    const after = await b.svc.applyStatus("PUSH", { providerRef: b.adapters.PUSH.lastRef!, status: "FAILED", error: "invalid token" });
    expect(b.adapters.EMAIL.sent).toHaveLength(1);
    expect(after!.attempts.find((x) => x.channel === "PUSH")).toMatchObject({ status: "FAILED", reason: "DELIVERY_FAILED", detail: "invalid token" });
  });
  it("skips channels without address / template / adapter and moves on", async () => {
    const { svc, adapters } = makeService({ adapters: [] });
    const s = await svc.dispatch(intent());
    expect(s.attempts.map((a) => [a.channel, a.reason])).toEqual([["INAPP", "NO_ADAPTER"], ["PUSH", "NO_ADAPTER"], ["EMAIL", "NO_ADAPTER"]]);
    expect(s.phase).toBe("EXHAUSTED");
    expect(adapters.PUSH.sent).toHaveLength(0);

    const n = makeService();
    const r = await n.svc.dispatch(intent({ recipient: recipient({ deviceIds: [] }), idempotencyKey: "k2" }));
    expect(r.attempts.find((a) => a.channel === "PUSH")).toMatchObject({ status: "SKIPPED", reason: "NO_ADDRESS" });
    expect(n.adapters.EMAIL.sent).toHaveLength(1);

    const t = makeService();
    const w = await t.svc.dispatch(intent({ type: "WA_FREE_ONLY", params: { name: "x" }, idempotencyKey: "k3", severity: "IMPORTANT" }));
    expect(w.attempts.filter((a) => a.reason === "NO_TEMPLATE").map((a) => a.channel)).toEqual(["INAPP", "PUSH", "SMS"]);
  });
  it("closes after the last channel times out; a late receipt still delivers", async () => {
    const { svc, adapters, clock } = makeService();
    const i = intent({ channels: ["PUSH"] });
    const s = await svc.dispatch(i);
    expect(s.nextActionAt).toBe(T0 + 15 * MIN);
    clock.advance(15 * MIN);
    await svc.tick();
    const stored = await svc.dispatch(i); // idempotent read of the state
    expect(stored.phase).toBe("EXHAUSTED");
    const late = await svc.applyStatus("PUSH", { providerRef: adapters.PUSH.lastRef!, status: "DELIVERED" });
    expect(late!.phase).toBe("DELIVERED");
  });
  it("goes EXHAUSTED when every channel fails", async () => {
    const { svc, adapters } = makeService();
    adapters.PUSH.failNext(); adapters.EMAIL.failNext();
    const s = await svc.dispatch(intent());
    expect(s.phase).toBe("EXHAUSTED");
    // the INAPP sidecar delivered, but it does not count as reaching the person
    expect(s.attempts[0]).toMatchObject({ channel: "INAPP", status: "DELIVERED" });
  });
  it("a sidecar-only route (INAPP only) is DELIVERED", async () => {
    const { svc } = makeService();
    const s = await svc.dispatch(intent({ channels: ["INAPP"] }));
    expect(s.phase).toBe("DELIVERED");
  });
  it("no fallback timer when the route has no fallbackAfterMs", async () => {
    const routing: RoutingPolicy = { ...DEFAULT_ROUTING, ROUTINE: { channels: ["PUSH", "EMAIL"] } };
    const { svc } = makeService({ routing });
    const s = await svc.dispatch(intent());
    expect(s.nextActionAt).toBeUndefined();
  });
});

describe("CRITICAL fan-out", () => {
  it("sends on every channel in parallel, bypassing quiet hours", async () => {
    const { svc, adapters, clock, prefs } = makeService();
    clock.t = NIGHT;
    prefs.set("u1", "*", { quiet: QUIET });
    const s = await svc.dispatch(intent({ severity: "CRITICAL" }));
    for (const c of ["INAPP", "PUSH", "WHATSAPP", "SMS", "EMAIL"] as const) expect(adapters[c].sent, c).toHaveLength(1);
    expect(s.parallel).toBe(true);
    expect(s.phase).toBe("IN_PROGRESS");
    expect(s.nextActionAt).toBeUndefined();
  });
  it("is DELIVERED as soon as any channel delivers, and still honours opt-out and consent", async () => {
    const { svc, adapters, prefs } = makeService();
    prefs.set("u1", "SMS", { optedOut: true });
    prefs.set("u1", "EMAIL", { consent: false });
    prefs.set("u1", "WHATSAPP", { whatsappLastInboundAt: T0 - 1000 });
    const s = await svc.dispatch(intent({ severity: "CRITICAL", type: "OTP_ALERT", params: {} }));
    expect(adapters.SMS.sent).toHaveLength(0);
    expect(adapters.EMAIL.sent).toHaveLength(0);
    expect(s.attempts.filter((a) => a.status === "SKIPPED").map((a) => a.reason).sort()).toEqual(["CONSENT", "OPT_OUT"]);
    const done = await svc.applyStatus("WHATSAPP", { providerRef: adapters.WHATSAPP.lastRef!, status: "READ" });
    expect(done!.phase).toBe("DELIVERED");
  });
  it("is EXHAUSTED when nothing was accepted", async () => {
    const { svc, adapters } = makeService();
    for (const c of ["PUSH", "WHATSAPP", "SMS", "EMAIL"] as const) adapters[c].failNext();
    const s = await svc.dispatch(intent({ severity: "CRITICAL" }));
    expect(s.phase).toBe("EXHAUSTED");
  });
});

describe("consent, opt-out, quiet hours, WhatsApp window", () => {
  it("asks the store per channel with the template purpose", async () => {
    const { svc, prefs } = makeService();
    await svc.dispatch(intent());
    expect(prefs.calls).toContainEqual({ id: "u1", channel: "PUSH", purpose: "REMINDER" });
  });
  it("skips on missing consent and on opt-out with a recorded reason, then falls through", async () => {
    const { svc, adapters, prefs, audit } = makeService();
    prefs.set("u1", "PUSH", { consent: false });
    prefs.set("u1", "EMAIL", { optedOut: true });
    const s = await svc.dispatch(intent());
    expect(s.phase).toBe("EXHAUSTED");
    expect(adapters.PUSH.sent).toHaveLength(0);
    expect(audit.records.filter((r) => r.status === "SKIPPED").map((r) => [r.channel, r.reason])).toEqual([["PUSH", "CONSENT"], ["EMAIL", "OPT_OUT"]]);
  });
  it("defers during quiet hours and resumes after the window (tick)", async () => {
    const { svc, adapters, clock, prefs, audit } = makeService();
    clock.t = NIGHT;
    prefs.set("u1", "PUSH", { quiet: QUIET });
    const s = await svc.dispatch(intent());
    expect(s.phase).toBe("DEFERRED");
    expect(s.nextActionAt).toBe(MORNING);
    expect(adapters.PUSH.sent).toHaveLength(0);
    expect(adapters.INAPP.sent).toHaveLength(1); // the inbox is never deferred
    expect(audit.records.find((r) => r.reason === "QUIET_HOURS")).toMatchObject({ status: "QUEUED", deferredUntil: MORNING });
    clock.t = MORNING - 1;
    expect(await svc.tick()).toEqual([]);
    clock.t = MORNING;
    expect(await svc.tick()).toHaveLength(1);
    expect(adapters.PUSH.sent).toHaveLength(1);
    const after = await svc.dispatch(intent());
    expect(after.phase).toBe("IN_PROGRESS");
    expect(after.attempts.filter((a) => a.channel === "PUSH")).toHaveLength(1);
  });
  it("quietBypass templates and CRITICAL ignore quiet hours", async () => {
    const reg = makeRegistry();
    const { simpleTemplate } = await import("../../src/notify/index.js");
    reg.register(simpleTemplate({ type: "BYPASS", purpose: "TRANSACTIONAL", en: "x", ar: "ص", quietBypass: true, channels: ["PUSH"] }));
    const { svc, adapters, clock, prefs } = makeService({ registry: reg });
    clock.t = NIGHT; prefs.set("u1", "*", { quiet: QUIET });
    const s = await svc.dispatch(intent({ type: "BYPASS", params: {}, channels: ["PUSH"] }));
    expect(s.phase).toBe("IN_PROGRESS");
    expect(adapters.PUSH.sent).toHaveLength(1);
  });
  it("quietUntil handles wrap, same-day windows, disabled windows and the end boundary", () => {
    expect(quietUntil(NIGHT, QUIET)).toBe(MORNING);
    expect(quietUntil(Date.UTC(2026, 10, 23, 23, 0, 0), QUIET)).toBe(MORNING); // 01:00 local, same-night window ends 07:00
    expect(quietUntil(MORNING, QUIET)).toBeNull();
    expect(quietUntil(T0, QUIET)).toBeNull();
    expect(quietUntil(T0, { startHour: 11, endHour: 14, tzOffsetMinutes: 120 })).toBe(Date.UTC(2026, 10, 23, 12, 0, 0));
    expect(quietUntil(T0, { startHour: 5, endHour: 5, tzOffsetMinutes: 0 })).toBeNull();
    // end hour already passed in the local day while inside a wrapped window (01:00 local -> 07:00 same local day)
    expect(quietUntil(Date.UTC(2026, 10, 23, 23, 0, 0), { startHour: 22, endHour: 7, tzOffsetMinutes: 120 })).toBe(Date.UTC(2026, 10, 24, 5, 0, 0));
  });
  it("WhatsApp: free text inside the 24 h window, approved template only outside, skip when no template", async () => {
    const { svc, adapters, clock, prefs } = makeService();
    prefs.set("u1", "WHATSAPP", { whatsappLastInboundAt: T0 - WHATSAPP_WINDOW_MS + 1 });
    await svc.dispatch(intent({ channels: ["WHATSAPP"], idempotencyKey: "in" }));
    expect((adapters.WHATSAPP.sent[0]!.message.body as any).text).toBeUndefined(); // template-based renderer: template is used even inside the window
    expect((adapters.WHATSAPP.sent[0]!.message.body as any).template.name).toBe("appt_reminder");

    prefs.set("u1", "WHATSAPP", { whatsappLastInboundAt: T0 - WHATSAPP_WINDOW_MS });
    await svc.dispatch(intent({ channels: ["WHATSAPP"], idempotencyKey: "out" }));
    expect((adapters.WHATSAPP.sent[1]!.message.body as any).template.name).toBe("appt_reminder");

    const free = await svc.dispatch(intent({ type: "WA_FREE_ONLY", params: { name: "x" }, channels: ["WHATSAPP"], idempotencyKey: "free-out" }));
    expect(free.attempts[0]).toMatchObject({ status: "SKIPPED", reason: "WHATSAPP_WINDOW" });
    prefs.set("u1", "WHATSAPP", { whatsappLastInboundAt: clock.now() - 1000 });
    const ok = await svc.dispatch(intent({ type: "WA_FREE_ONLY", params: { name: "x" }, channels: ["WHATSAPP"], idempotencyKey: "free-in" }));
    expect(ok.attempts[0]!.status).toBe("SENT");
    expect(adapters.WHATSAPP.sent[2]!.message.body).toEqual({ text: "Hello x" });
  });
  it("evaluateGate and addressFor basics", () => {
    const r = recipient();
    expect(addressFor("SMS", r)).toEqual(["+201001234567"]);
    expect(addressFor("WHATSAPP", r)).toEqual(["+201001234567"]);
    expect(addressFor("EMAIL", r)).toEqual(["ahmed@example.com"]);
    expect(addressFor("PUSH", r)).toEqual(["tok1"]);
    expect(addressFor("INAPP", r)).toEqual(["u1"]);
    expect(addressFor("PUSH", recipient({ deviceIds: undefined }))).toEqual([]);
    expect(addressFor("SMS", recipient({ phone: undefined }))).toEqual([]);
    expect(addressFor("EMAIL", recipient({ email: undefined }))).toEqual([]);
    expect(evaluateGate({ channel: "SMS", recipient: r, pref: {}, now: T0, critical: false, quietBypass: false })).toEqual({ allow: true, addresses: ["+201001234567"], whatsappFreeForm: false });
    expect(evaluateGate({ channel: "SMS", recipient: recipient({ phone: undefined }), pref: {}, now: T0, critical: false, quietBypass: false })).toEqual({ allow: false, reason: "NO_ADDRESS" });
    expect(evaluateGate({ channel: "INAPP", recipient: r, pref: { quiet: QUIET }, now: NIGHT, critical: false, quietBypass: false }).allow).toBe(true);
  });
});

describe("render failures and PHI at the service level", () => {
  it("PHI in an allowed param blocks SMS/push and falls back to email", async () => {
    const { svc, adapters, audit } = makeService();
    const s = await svc.dispatch(intent({ params: { doctor: "HIV clinic", time: "10:00" }, severity: "IMPORTANT" }));
    expect(adapters.PUSH.sent).toHaveLength(0);
    expect(adapters.SMS.sent).toHaveLength(0);
    expect(audit.records.filter((r) => r.reason === "PHI_BLOCKED").map((r) => [r.channel, r.status])).toEqual([["PUSH", "FAILED"], ["WHATSAPP", "FAILED"], ["SMS", "FAILED"]]);
    expect(s.phase).toBe("EXHAUSTED");
  });
  it("undeclared params, unknown type, missing recipient fields are suppressed with an intent-level audit record", async () => {
    const { svc, adapters, audit } = makeService();
    const a = await svc.dispatch(intent({ params: { doctor: "a", time: "b", diagnosis: "x" } as any, idempotencyKey: "a" }));
    const b = await svc.dispatch(intent({ type: "NOPE", idempotencyKey: "b" }));
    const c = await svc.dispatch(intent({ idempotencyKey: "" }));
    const d = await svc.dispatch(intent({ idempotencyKey: "d", recipient: recipient({ id: "" }) }));
    const e = await svc.dispatch(intent({ idempotencyKey: "e", recipient: recipient({ locale: "fr" as any }) }));
    const f = await svc.dispatch(intent({ idempotencyKey: "f", params: { doctor: "a" } }));
    expect([a, b, c, d, e, f].every((s) => s.phase === "EXHAUSTED")).toBe(true);
    expect(audit.records.map((r) => [r.channel, r.reason, r.detail])).toEqual([
      [null, "PARAM_NOT_ALLOWED", "diagnosis"], [null, "UNKNOWN_TYPE", "NOPE"], [null, "PARAM_MISSING", "idempotencyKey"], [null, "PARAM_MISSING", "recipient.id"],
      [null, "PARAM_MISSING", "recipient.locale"], [null, "PARAM_MISSING", "time"],
    ]);
    for (const ad of Object.values(adapters)) expect(ad.sent).toHaveLength(0);
  });
  it("SMS too long is a failed attempt with its own reason", async () => {
    const { svc } = makeService();
    const s = await svc.dispatch(intent({ params: { doctor: "d".repeat(400), time: "1" }, channels: ["SMS"], severity: "IMPORTANT" }));
    expect(s.attempts[0]).toMatchObject({ status: "FAILED", reason: "SMS_TOO_LONG" });
  });
  it("adapter exceptions are contained as ADAPTER_ERROR", async () => {
    const { svc, adapters } = makeService();
    adapters.PUSH.throwOnSend = new Error("socket hang up");
    const s = await svc.dispatch(intent());
    expect(s.attempts.find((a) => a.channel === "PUSH")).toMatchObject({ status: "FAILED", reason: "ADAPTER_ERROR", detail: "socket hang up" });
    expect(adapters.EMAIL.sent).toHaveLength(1);
    adapters.PUSH.throwOnSend = "plain" as any;
    const s2 = await svc.dispatch(intent({ idempotencyKey: "k2" }));
    expect(s2.attempts.find((a) => a.channel === "PUSH")!.detail).toBe("plain");
  });
});

describe("idempotency and dedupe", () => {
  it("same idempotency key never sends twice", async () => {
    const { svc, adapters, audit } = makeService();
    const a = await svc.dispatch(intent());
    const n = audit.records.length;
    const b = await svc.dispatch(intent());
    expect(b.id).toBe(a.id);
    expect(adapters.PUSH.sent).toHaveLength(1);
    expect(audit.records).toHaveLength(n);
  });
  it("dedupe suppresses a logically identical intent inside the window, not after", async () => {
    const { svc, adapters, clock, audit } = makeService();
    const d = { key: "booking-1" };
    await svc.dispatch(intent({ idempotencyKey: "a", dedupe: d }));
    const dup = await svc.dispatch(intent({ idempotencyKey: "b", dedupe: d }));
    expect(dup.phase).toBe("SUPPRESSED");
    expect(adapters.PUSH.sent).toHaveLength(1);
    expect(audit.records.find((r) => r.reason === "DEDUPED")).toMatchObject({ channel: null, status: "SKIPPED" });
    // different recipient or type is not a duplicate
    await svc.dispatch(intent({ idempotencyKey: "c", dedupe: d, recipient: recipient({ id: "u2" }) }));
    expect(adapters.PUSH.sent).toHaveLength(2);
    clock.advance(24 * 3600_000);
    await svc.dispatch(intent({ idempotencyKey: "e", dedupe: d }));
    expect(adapters.PUSH.sent).toHaveLength(3);
    clock.advance(1000);
    const custom = await svc.dispatch(intent({ idempotencyKey: "f", dedupe: { key: "x", windowMs: 1000 } }));
    clock.advance(999);
    expect((await svc.dispatch(intent({ idempotencyKey: "g", dedupe: { key: "x", windowMs: 1000 } }))).phase).toBe("SUPPRESSED");
    clock.advance(1);
    expect((await svc.dispatch(intent({ idempotencyKey: "h", dedupe: { key: "x", windowMs: 1000 } }))).phase).not.toBe("SUPPRESSED");
    expect(custom.phase).toBe("IN_PROGRESS");
  });
  it("honours defaultDedupeWindowMs", async () => {
    const { svc, clock } = makeService({ defaultDedupeWindowMs: 10 });
    await svc.dispatch(intent({ idempotencyKey: "a", dedupe: { key: "k" } }));
    clock.advance(10);
    expect((await svc.dispatch(intent({ idempotencyKey: "b", dedupe: { key: "k" } }))).phase).toBe("IN_PROGRESS");
  });
  it("MemoryDispatchStore evicts the oldest beyond maxEntries", async () => {
    const store = new MemoryDispatchStore(2);
    const { svc } = makeService({ store });
    for (const k of ["a", "b", "c"]) await svc.dispatch(intent({ idempotencyKey: k, dedupe: { key: k } }));
    expect(await store.getByKey("a")).toBeUndefined();
    expect(await store.getByKey("c")).toBeDefined();
    expect(await store.getDedupe(`u1|APPOINTMENT_REMINDER|a`)).toBeUndefined();
    expect(await store.getByProviderRef("PUSH", "nope")).toBeUndefined();
  });
});

describe("webhooks and status", () => {
  it("rejects a bad signature, applies forward-only statuses, ignores unknown refs and replays", async () => {
    const { svc, adapters, audit } = makeService();
    await svc.dispatch(intent({ channels: ["SMS"], severity: "IMPORTANT" }));
    const ref = adapters.SMS.lastRef!;
    const good = { "x-mock-signature": "mock-secret" };
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "delivered"), { "x-mock-signature": "bad" })).toEqual({ verified: false, applied: 0, ignored: 0 });
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "delivered"), good)).toEqual({ verified: true, applied: 1, ignored: 0 });
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "delivered"), good)).toEqual({ verified: true, applied: 0, ignored: 1 }); // replay
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "sent"), good)).toMatchObject({ applied: 0, ignored: 1 }); // stale
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody("ghost", "read"), good)).toMatchObject({ applied: 0, ignored: 1 });
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "read"), good)).toMatchObject({ applied: 1 });
    expect(await svc.handleWebhook("SMS", MockChannelAdapter.webhookBody(ref, "failed", "late"), good)).toMatchObject({ applied: 0, ignored: 1 }); // FAILED never beats READ
    expect(audit.records.filter((r) => r.channel === "SMS").map((r) => r.status)).toEqual(["SENT", "DELIVERED", "READ"]);
  });
  it("unknown channel adapter fails verification; unknown applyStatus returns null", async () => {
    const { svc } = makeService({ adapters: [] });
    expect(await svc.handleWebhook("SMS", "{}", {})).toEqual({ verified: false, applied: 0, ignored: 0 });
    expect(await svc.applyStatus("SMS", { providerRef: "x", status: "SENT" })).toBeNull();
  });
  it("a push with several devices is one attempt with one ref per device", async () => {
    const { svc, adapters } = makeService();
    const s = await svc.dispatch(intent({ recipient: recipient({ deviceIds: ["t1", "t2"] }), channels: ["PUSH"] }));
    expect(adapters.PUSH.sent.map((x) => x.message.to)).toEqual(["t1", "t2"]);
    expect(s.attempts[0]!.providerRefs).toHaveLength(2);
    const second = await svc.applyStatus("PUSH", { providerRef: s.attempts[0]!.providerRefs[1]!, status: "DELIVERED", occurredAt: "2026-11-23T10:05:00Z" });
    expect(second!.attempts[0]).toMatchObject({ status: "DELIVERED", updatedAt: Date.parse("2026-11-23T10:05:00Z") });
  });
  it("one failing device does not fail the attempt; all failing does", async () => {
    const { svc, adapters } = makeService();
    adapters.PUSH.failTo.add("t1");
    const ok = await svc.dispatch(intent({ recipient: recipient({ deviceIds: ["t1", "t2"] }), channels: ["PUSH"] }));
    expect(ok.attempts[0]!.status).toBe("SENT");
    const bad = await svc.dispatch(intent({ recipient: recipient({ deviceIds: ["t1"] }), channels: ["PUSH"], idempotencyKey: "z" }));
    expect(bad.attempts[0]).toMatchObject({ status: "FAILED", detail: "MOCK_BOUNCE" });
  });
  it("a bad occurredAt falls back to the clock", async () => {
    const { svc, adapters, clock } = makeService();
    await svc.dispatch(intent({ channels: ["PUSH"] }));
    clock.advance(5);
    const s = await svc.applyStatus("PUSH", { providerRef: adapters.PUSH.lastRef!, status: "DELIVERED", occurredAt: "garbage" });
    expect(s!.attempts[0]!.updatedAt).toBe(T0 + 5);
  });
});

describe("audit shape and masking", () => {
  it("one PHI-free record shape: no body, no raw address", async () => {
    const { svc, audit } = makeService();
    await svc.dispatch(intent({ severity: "IMPORTANT", metadata: { bookingId: "b1" } }));
    for (const r of audit.records) {
      expect(Object.keys(r).sort()).toEqual(expect.arrayContaining(["id", "at", "notificationId", "idempotencyKey", "intentType", "severity", "recipientId", "channel", "status", "attempt", "locale"]));
      const text = JSON.stringify(r);
      expect(text).not.toContain("201001234567");
      expect(text).not.toContain("Dr Omar");
    }
    expect(audit.records.find((r) => r.channel === "PUSH")).toMatchObject({ addressMasked: "push:****", mode: "mock", intentType: "APPOINTMENT_REMINDER" });
    expect(audit.records[0]!.at).toBe(new Date(T0).toISOString());
  });
  it("passes metadata and attempt number to adapters", async () => {
    const { svc, adapters } = makeService();
    await svc.dispatch(intent({ metadata: { messageId: "m1" }, channels: ["PUSH"] }));
    expect(adapters.PUSH.sent[0]!.message).toMatchObject({ metadata: { messageId: "m1" }, attempt: 1, type: "APPOINTMENT_REMINDER", locale: "en", severity: "ROUTINE" });
  });
  it("maskAddress per channel", () => {
    expect(maskAddress("EMAIL", "ahmed@example.com")).toBe("a***@example.com");
    expect(maskAddress("EMAIL", "nodomain")).toBe("***");
    expect(maskAddress("PUSH", "tok")).toBe("push:****");
    expect(maskAddress("INAPP", "u1")).toBe("inapp");
    expect(maskAddress("SMS", "+201001234567")).toBe("+201****567");
    expect(maskAddress("SMS", "123")).toBe("***");
  });
});

describe("locale and defaults", () => {
  it("renders Arabic for ar recipients", async () => {
    const { svc, adapters } = makeService();
    await svc.dispatch(intent({ recipient: recipient({ locale: "ar" }), channels: ["PUSH"] }));
    expect((adapters.PUSH.sent[0]!.message.body as any).body).toContain("تذكير");
  });
  it("uses system clock, uuid ids and default store when not injected", async () => {
    const adapters = createMockAdapters();
    const svc = new NotificationService({ adapters: Object.values(adapters), registry: makeRegistry(), preferences: new MapPrefs(), audit: new MemoryAuditSink() });
    const s = await svc.dispatch(intent({ channels: ["PUSH"] }));
    expect(s.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Math.abs(s.createdAt - Date.now())).toBeLessThan(5000);
    expect(svc.adapter("PUSH")).toBe(adapters.PUSH);
    const replacement = new MockChannelAdapter("PUSH");
    svc.setAdapter(replacement);
    await svc.dispatch(intent({ channels: ["PUSH"], idempotencyKey: "again" }));
    expect(replacement.sent).toHaveLength(1);
    expect(NOTIFY_LAYER_VERSION).toBe("1.7.0");
  });
  it("MockChannelAdapter failTo and createMockAdapters subset", async () => {
    const m = createMockAdapters(["SMS"]);
    expect(Object.keys(m)).toEqual(["SMS"]);
    expect(new FakeClock().now()).toBe(T0);
  });
});

describe("adapter edge cases", () => {
  it("an adapter that accepts without a ref or rejects without an error", async () => {
    const quiet: any = { channel: "SMS", mode: "real", send: async () => ({ ok: true }), parseWebhook: () => [], verify: () => true };
    const { svc } = makeService();
    svc.setAdapter(quiet);
    const ok = await svc.dispatch(intent({ channels: ["SMS"], severity: "IMPORTANT", idempotencyKey: "q1" }));
    expect(ok.attempts[0]).toMatchObject({ status: "SENT", providerRefs: [] });
    quiet.send = async () => ({ ok: false });
    const bad = await svc.dispatch(intent({ channels: ["SMS"], severity: "IMPORTANT", idempotencyKey: "q2" }));
    expect(bad.attempts[0]).toMatchObject({ status: "FAILED", reason: "SEND_FAILED", detail: "SEND_FAILED" });
  });
  it("intents without params work for param-less templates", async () => {
    const { svc } = makeService();
    const s = await svc.dispatch({ type: "OTP_ALERT", recipient: recipient(), severity: "ROUTINE", idempotencyKey: "np", channels: ["PUSH"] });
    expect(s.attempts[0]!.status).toBe("SENT");
  });
});
