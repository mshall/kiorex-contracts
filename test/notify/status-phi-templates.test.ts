import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHI_PATTERNS, interpolate, isDeliveredStatus, isTerminalStatus, mergeStatus, normalizeEmailStatus, normalizeInAppStatus, normalizePushStatus,
  normalizeSmsStatus, normalizeVendorStatus, normalizeWhatsAppStatus, parseNeutralStatusBody, PhiGuard, simpleTemplate, smsSegments, TemplateRegistry,
} from "../../src/notify/index.js";
import { makeRegistry } from "./harness.js";

describe("status model", () => {
  it("merges forward only", () => {
    expect(mergeStatus("QUEUED", "SENT")).toBe("SENT");
    expect(mergeStatus("SENT", "QUEUED")).toBe("SENT");
    expect(mergeStatus("DELIVERED", "SENT")).toBe("DELIVERED");
    expect(mergeStatus("DELIVERED", "READ")).toBe("READ");
    expect(mergeStatus("READ", "DELIVERED")).toBe("READ");
  });
  it("FAILED applies before delivery, never after; FAILED and SKIPPED are sticky", () => {
    expect(mergeStatus("SENT", "FAILED")).toBe("FAILED");
    expect(mergeStatus("DELIVERED", "FAILED")).toBe("DELIVERED");
    expect(mergeStatus("READ", "FAILED")).toBe("READ");
    expect(mergeStatus("FAILED", "DELIVERED")).toBe("FAILED");
    expect(mergeStatus("SKIPPED", "SENT")).toBe("SKIPPED");
    expect(mergeStatus("QUEUED", "SKIPPED")).toBe("SKIPPED");
    expect(mergeStatus("SENT", "SKIPPED")).toBe("SENT");
  });
  it("classifies statuses", () => {
    expect(isTerminalStatus("READ")).toBe(true);
    expect(isTerminalStatus("SENT")).toBe(false);
    expect(isTerminalStatus("FAILED")).toBe(true);
    expect(isDeliveredStatus("READ")).toBe(true);
    expect(isDeliveredStatus("SENT")).toBe(false);
  });
  it("normalizes vendor statuses per channel", () => {
    expect(normalizeSmsStatus("DELIVRD")).toBe("DELIVERED");
    expect(normalizeSmsStatus("UNDELIV")).toBe("FAILED");
    expect(normalizeSmsStatus("Sending")).toBe("SENT");
    expect(normalizeSmsStatus("queued")).toBe("QUEUED");
    expect(normalizeEmailStatus("processed")).toBe("SENT");
    expect(normalizeEmailStatus("open")).toBe("READ");
    expect(normalizeEmailStatus("bounce")).toBe("FAILED");
    expect(normalizeEmailStatus("Delivery")).toBe("DELIVERED");
    expect(normalizeWhatsAppStatus("read")).toBe("READ");
    expect(normalizeWhatsAppStatus("undelivered")).toBe("FAILED");
    expect(normalizePushStatus("invalid-token")).toBe("FAILED");
    expect(normalizePushStatus("opened")).toBe("READ");
    expect(normalizeInAppStatus("stored")).toBe("DELIVERED");
    expect(normalizeVendorStatus("SMS", "mystery")).toBeUndefined();
    expect(normalizeVendorStatus("SMS", undefined)).toBeUndefined();
  });
  it("parses the neutral webhook body (wrapped, single, malformed, unknown)", () => {
    const wrapped = JSON.stringify({ events: [{ id: "a", status: "delivered", occurredAt: "2026-01-01T00:00:00Z" }, { id: "b", status: "failed" }, { id: "c", status: "weird" }, { status: "sent" }] });
    expect(parseNeutralStatusBody("SMS", wrapped)).toEqual([
      { providerRef: "a", status: "DELIVERED", occurredAt: "2026-01-01T00:00:00Z" },
      { providerRef: "b", status: "FAILED", error: "DELIVERY_FAILED" },
    ]);
    expect(parseNeutralStatusBody("SMS", JSON.stringify({ providerRef: "z", status: "failed", error: "boom" }))).toEqual([{ providerRef: "z", status: "FAILED", error: "boom" }]);
    expect(parseNeutralStatusBody("SMS", "not json")).toEqual([]);
    expect(parseNeutralStatusBody("SMS", "[]")).toEqual([]);
    expect(parseNeutralStatusBody("SMS", "null")).toEqual([]);
  });
});

describe("PHI guard", () => {
  const g = new PhiGuard();
  it("blocks national id, MRN, lab values, diagnosis terms (en and ar) in SMS/PUSH/WHATSAPP", () => {
    expect(g.scan("SMS", { text: "ID 29801011234567" })).toEqual(["NATIONAL_ID"]);
    expect(g.scan("SMS", { text: "MRN: 4455" })).toContain("MRN");
    expect(g.scan("SMS", { text: "Glucose 180 mg/dl" })).toContain("LAB_VALUE");
    expect(g.scan("SMS", { text: "Your diagnosis is ready" })).toContain("DIAGNOSIS");
    expect(g.scan("SMS", { text: "نتيجة التشخيص" })).toContain("DIAGNOSIS"); // with the definite article
    expect(g.scan("SMS", { text: "نتيجة تشخيص" })).toContain("DIAGNOSIS");
    expect(g.scan("SMS", { text: "تحميل التطبيق لتحمل" })).toEqual([]); // "حمل" inside other words is not PHI
    expect(g.scan("SMS", { text: "روشتة" })).toContain("PRESCRIPTION");
    expect(g.scan("SMS", { text: "Take 500 mg twice daily" })).toContain("PRESCRIPTION");
    expect(g.scan("PUSH", { title: "Hi", body: "HIV result" })).toContain("DIAGNOSIS");
    expect(g.scan("PUSH", { title: "Hi", body: "ok", data: { deepLink: "kiorex://a", note: "cancer" } })).toContain("DIAGNOSIS");
    expect(g.scan("PUSH", { title: "Hi", body: "ok", data: { deepLink: "https://x.test/diabetes" } })).toEqual([]); // links are not scanned
    expect(g.scan("PUSH", { title: "Hi", body: "ok", data: { deepLink: "/bookings/cancer" } })).toEqual([]);
    expect(g.scan("WHATSAPP", { text: "cancer" })).toContain("DIAGNOSIS");
    expect(g.scan("WHATSAPP", { template: { name: "t", language: "en", vars: { a: "29801011234567" } } })).toEqual(["NATIONAL_ID"]);
    expect(g.scan("WHATSAPP", {})).toEqual([]);
  });
  it("does not scan email or in-app, and passes clean text", () => {
    expect(g.scan("EMAIL", { subject: "diagnosis", html: "", text: "29801011234567" })).toEqual([]);
    expect(g.scan("INAPP", { title: "t", body: "diagnosis" })).toEqual([]);
    expect(g.scan("SMS", { text: "Visit with Dr Omar at 10:00" })).toEqual([]);
  });
  it("accepts a custom pattern list and exposes defaults", () => {
    expect(DEFAULT_PHI_PATTERNS.length).toBeGreaterThan(3);
    expect(new PhiGuard([{ code: "X", pattern: /secret/ }]).scan("SMS", { text: "a secret" })).toEqual(["X"]);
  });
});

describe("SMS segments", () => {
  it("counts GSM-7 and UCS-2", () => {
    expect(smsSegments("")).toEqual({ encoding: "GSM-7", length: 0, segments: 0 });
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161))).toMatchObject({ segments: 2 });
    expect(smsSegments("a".repeat(307))).toMatchObject({ segments: 3 });
    expect(smsSegments("{}")).toMatchObject({ length: 4 });
    expect(smsSegments("م")).toEqual({ encoding: "UCS-2", length: 1, segments: 1 });
    expect(smsSegments("م".repeat(70))).toMatchObject({ segments: 1 });
    expect(smsSegments("م".repeat(71))).toMatchObject({ segments: 2 });
    expect(smsSegments("م".repeat(135))).toMatchObject({ segments: 3 });
    expect(smsSegments("")).toMatchObject({ segments: 0 });
  });
});

describe("TemplateRegistry", () => {
  const reg = makeRegistry();
  it("renders every channel in ar and en", () => {
    const p = { doctor: "Dr Omar", time: "10:00", bookingId: "b1" };
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "en", p)).toEqual({ ok: true, body: { text: "Reminder: visit with Dr Omar at 10:00." } });
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "ar", p)).toEqual({ ok: true, body: { text: "تذكير: زيارتك مع Dr Omar في 10:00." } });
    const email = reg.render("APPOINTMENT_REMINDER", "EMAIL", "ar", p);
    expect(email).toMatchObject({ ok: true, body: { subject: "تذكير بالزيارة" } });
    expect((email as any).body.html).toContain('dir="rtl"');
    expect((reg.render("APPOINTMENT_REMINDER", "EMAIL", "en", p) as any).body.html).toContain('dir="ltr"');
    expect(reg.render("APPOINTMENT_REMINDER", "WHATSAPP", "en", p)).toMatchObject({ ok: true, body: { template: { name: "appt_reminder", language: "en", vars: { doctor: "Dr Omar", time: "10:00", bookingId: "b1" } } } });
    expect(reg.render("APPOINTMENT_REMINDER", "PUSH", "en", p)).toMatchObject({ ok: true, body: { title: "Kiorex", body: "Reminder: visit with Dr Omar at 10:00.", data: { deepLink: "kiorex://bookings/b1" } } });
    expect(reg.render("APPOINTMENT_REMINDER", "PUSH", "ar", p)).toMatchObject({ body: { title: "كيوريكس" } });
    expect(reg.render("APPOINTMENT_REMINDER", "INAPP", "en", p)).toMatchObject({ ok: true, body: { deepLink: "kiorex://bookings/b1" } });
  });
  it("rejects unknown type, undeclared params, missing required, missing channel", () => {
    expect(reg.render("NOPE", "SMS", "en")).toMatchObject({ ok: false, reason: "UNKNOWN_TYPE" });
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "en", { doctor: "a", time: "b", diagnosis: "x" })).toMatchObject({ ok: false, reason: "PARAM_NOT_ALLOWED", detail: "diagnosis" });
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "en", { doctor: "a" })).toMatchObject({ ok: false, reason: "PARAM_MISSING", detail: "time" });
    expect(reg.render("WA_FREE_ONLY", "SMS", "en", { name: "x" })).toMatchObject({ ok: false, reason: "NO_TEMPLATE" });
    expect(reg.render("OTP_ALERT", "SMS", "en")).toMatchObject({ ok: true });
  });
  it("blocks PHI that arrives through an allowed param and over-long SMS", () => {
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "en", { doctor: "MRN 123", time: "1" })).toMatchObject({ ok: false, reason: "PHI_BLOCKED" });
    expect(reg.render("APPOINTMENT_REMINDER", "PUSH", "en", { doctor: "HIV clinic", time: "1" })).toMatchObject({ ok: false, reason: "PHI_BLOCKED" });
    // email is not scanned, so the same params pass there
    expect(reg.render("APPOINTMENT_REMINDER", "EMAIL", "en", { doctor: "HIV clinic", time: "1" })).toMatchObject({ ok: true });
    expect(reg.render("APPOINTMENT_REMINDER", "SMS", "en", { doctor: "d".repeat(400), time: "1" })).toMatchObject({ ok: false, reason: "SMS_TOO_LONG" });
  });
  it("per-template smsMaxSegments overrides the registry default", () => {
    const r = new TemplateRegistry();
    r.register(simpleTemplate({ type: "LONG", purpose: "TRANSACTIONAL", en: "x{a}", ar: "ي{a}", channels: ["SMS"], smsMaxSegments: 9, allowedParams: ["a"] }));
    expect(r.render("LONG", "SMS", "en", { a: "z".repeat(1000) })).toMatchObject({ ok: true }); // 7 segments, under the template's 9 (registry default is 4)
    expect(r.render("LONG", "SMS", "en", { a: "z".repeat(1500) })).toMatchObject({ ok: false, reason: "SMS_TOO_LONG" }); // 10 segments
  });
  it("renderer exceptions become RENDER_ERROR", () => {
    const r = new TemplateRegistry();
    r.register({ type: "BOOM", purpose: "TRANSACTIONAL", allowedParams: [], channels: { SMS: () => { throw new Error("bad"); } } });
    expect(r.render("BOOM", "SMS", "en")).toMatchObject({ ok: false, reason: "RENDER_ERROR", detail: "bad" });
    const r2 = new TemplateRegistry();
    r2.register({ type: "BOOM2", purpose: "TRANSACTIONAL", allowedParams: [], channels: { SMS: () => { throw "str"; } } });
    expect(r2.render("BOOM2", "SMS", "en")).toMatchObject({ reason: "RENDER_ERROR", detail: "str" });
  });
  it("register guards: duplicate and requiredParams not allowed", () => {
    const r = new TemplateRegistry();
    r.register(simpleTemplate({ type: "A", purpose: "TRANSACTIONAL", en: "a", ar: "ا" }));
    expect(() => r.register(simpleTemplate({ type: "A", purpose: "TRANSACTIONAL", en: "a", ar: "ا" }))).toThrow(/already/);
    expect(() => r.register({ type: "B", purpose: "TRANSACTIONAL", allowedParams: ["x"], requiredParams: ["y"], channels: {} })).toThrow(/requiredParams/);
    expect(r.types()).toEqual(["A"]);
    expect(r.has("A")).toBe(true);
    expect(r.hasChannel("A", "SMS")).toBe(true);
    expect(r.hasChannel("A", "EMAIL")).toBe(false);
    expect(r.hasChannel("Z", "SMS")).toBe(false);
  });
  it("validate() proves ar and en render, and flags identical or failing templates", () => {
    expect(reg.validate()).toEqual([]);
    const r = new TemplateRegistry();
    r.register(simpleTemplate({ type: "SAME", purpose: "TRANSACTIONAL", en: "same", ar: "same", channels: ["SMS"] }));
    r.register({ type: "BAD", purpose: "TRANSACTIONAL", allowedParams: [], channels: { SMS: () => ({ text: "HIV" }) } });
    const p = r.validate();
    expect(p.some((x) => x.startsWith("SAME/SMS: ar and en"))).toBe(true);
    expect(p.some((x) => x.startsWith("BAD/SMS/en: PHI_BLOCKED"))).toBe(true);
  });
  it("interpolate leaves unknown keys empty; simpleTemplate defaults", () => {
    expect(interpolate("a {x} {y}", { x: 1 })).toBe("a 1 ");
    const d = simpleTemplate({ type: "D", purpose: "REMINDER", en: "hi {a}", ar: "اهلا {b}" });
    expect(d.allowedParams).toEqual(["a", "b"]);
    expect(Object.keys(d.channels)).toEqual(["SMS", "PUSH", "INAPP"]);
    const w = simpleTemplate({ type: "W", purpose: "REMINDER", en: "hi", ar: "ا", channels: ["WHATSAPP", "EMAIL"] });
    expect((w.channels.WHATSAPP as any)({ locale: "en", params: {}, t: (s: string) => s })).toEqual({ text: "hi" });
    expect((w.channels.EMAIL as any)({ locale: "en", params: {}, t: (s: string) => s }).subject).toBe("hi");
    expect((w.channels.EMAIL as any)({ locale: "en", params: {}, t: (s: string) => s }).html).toBe('<p dir="ltr">hi</p>');
  });
  it("escapes html in email", () => {
    const r = new TemplateRegistry();
    r.register(simpleTemplate({ type: "E", purpose: "TRANSACTIONAL", en: "a {x}", ar: "ب {x}", channels: ["EMAIL"] }));
    expect((r.render("E", "EMAIL", "en", { x: "<b>&" }) as any).body.html).toContain("&lt;b&gt;&amp;");
  });
});

describe("simpleTemplate options", () => {
  it("custom push/in-app title and a renderer error with an empty message", () => {
    const r = new TemplateRegistry();
    r.register(simpleTemplate({ type: "T", purpose: "REMINDER", en: "x", ar: "س", title: { en: "Hello {n}", ar: "اهلا {n}" }, allowedParams: ["n"] }));
    expect(r.render("T", "PUSH", "ar", { n: "A" })).toMatchObject({ ok: true, body: { title: "اهلا A" } });
    expect(r.render("T", "INAPP", "en", { n: "A" })).toMatchObject({ ok: true, body: { title: "Hello A" } });
    r.register({ type: "E", purpose: "REMINDER", allowedParams: [], channels: { SMS: () => { throw new Error(""); } } });
    expect(r.validate().some((x) => x.startsWith("E/SMS/en: RENDER_ERROR") && !x.includes("("))).toBe(true);
  });
});
