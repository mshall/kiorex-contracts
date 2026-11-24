import { describe, expect, it } from "vitest";
import {
  signControlPlaneRequest, signKiorlyRequest, signSnapshot, signWebhook, verifyControlPlaneRequest, verifyKiorlyRequest,
  verifySnapshot, verifyWebhook, sha256BodyHex, kiorlyCanonicalString,
} from "../src/index.js";
import { ROOT, readJson } from "./helpers.js";
import { existsSync } from "node:fs";
import { join } from "node:path";

const vectors = readJson("test/hmac-vectors.json");

describe("Kiorly request HMAC (marketplace-hmac.ts byte-for-byte)", () => {
  for (const v of vectors.request) {
    it(`vector: ${v.name}`, () => {
      expect(sha256BodyHex(v.body)).toBe(v.bodySha256);
      expect(kiorlyCanonicalString({ timestamp: v.timestamp, nonce: v.nonce, method: v.method, path: v.path, bodySha256: v.bodySha256 })).toBe(v.canonical);
      const s = signKiorlyRequest({ clientKey: "kx_dev_client", clientSecret: v.secret, method: v.method, path: v.path, body: v.body, timestamp: v.timestamp, nonce: v.nonce });
      expect(s.signature).toBe(v.signature);
      expect(s.headers["X-Kiorly-Signature"]).toBe(v.signature);
      const r = verifyKiorlyRequest({ headers: s.headers, method: v.method, path: v.path, body: v.body, secret: v.secret, now: Number(v.timestamp) });
      expect(r).toEqual({ ok: true });
    });
  }

  it("ignores the query string and is case-insensitive on method/headers", () => {
    const v = vectors.request[1];
    const s = signKiorlyRequest({ clientKey: "k", clientSecret: v.secret, method: "get", path: `${v.path}?page=2`, timestamp: v.timestamp, nonce: v.nonce });
    expect(s.signature).toBe(v.signature);
    const lower = Object.fromEntries(Object.entries(s.headers).map(([k, val]) => [k.toLowerCase(), val]));
    expect(verifyKiorlyRequest({ headers: lower, method: "GET", path: `${v.path}?page=9`, secret: v.secret, now: Number(v.timestamp) }).ok).toBe(true);
  });

  it("rejects tampering, stale timestamps and missing headers", () => {
    const v = vectors.request[0];
    const s = signKiorlyRequest({ clientKey: "k", clientSecret: v.secret, method: v.method, path: v.path, body: v.body, timestamp: v.timestamp, nonce: v.nonce });
    const base = { headers: s.headers, method: v.method, path: v.path, secret: v.secret, now: Number(v.timestamp) };
    expect(verifyKiorlyRequest({ ...base, body: v.body + " " })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyKiorlyRequest({ ...base, body: v.body, path: "/api/v1/marketplace/v1/other" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyKiorlyRequest({ ...base, body: v.body, secret: "wrong" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyKiorlyRequest({ ...base, body: v.body, now: Number(v.timestamp) + 5 * 60 * 1000 + 1 })).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyKiorlyRequest({ ...base, headers: {}, body: v.body })).toEqual({ ok: false, reason: "missing_headers" });
  });

  it("matches Kiorly's own function when the sibling repo is present (live parity)", async () => {
    const p = join(ROOT, "..", "clinics-management/apps/api/src/marketplace/marketplace-hmac.ts");
    if (!existsSync(p)) return; // standalone checkout: static vectors above still prove parity
    const kiorly: any = await import(/* @vite-ignore */ p);
    for (const v of vectors.request) {
      const canonical = kiorly.marketplaceCanonicalString({ timestamp: v.timestamp, nonce: v.nonce, method: v.method, path: v.path, bodySha256: kiorly.sha256BodyHex(v.body ? Buffer.from(v.body) : undefined) });
      const ours = signKiorlyRequest({ clientKey: "k", clientSecret: v.secret, method: v.method, path: v.path, body: v.body, timestamp: v.timestamp, nonce: v.nonce });
      expect(ours.canonical).toBe(canonical);
      expect(ours.signature).toBe(kiorly.signMarketplaceRequest(v.secret, canonical));
    }
  });

  it("control-plane requests use X-Kiorex-Product-Key and never send the secret", () => {
    const s = signControlPlaneRequest({ productKey: "ff_kiorly-clinic_dev", productSecret: "ff_dev_secret_change_me", method: "GET", path: "/api/v1/control/v1/flags/snapshot?product=kiorly-clinic", timestamp: "1767225601234", nonce: "a3d5c2e1-1111-4222-8333-944455566677" });
    expect(s.headers["X-Kiorex-Product-Key"]).toBe("ff_kiorly-clinic_dev");
    expect(Object.keys(s.headers)).not.toContain("X-Kiorly-Client-Secret");
    expect(JSON.stringify(s.headers)).not.toContain("ff_dev_secret_change_me");
    expect(verifyControlPlaneRequest({ headers: s.headers, method: "GET", path: "/api/v1/control/v1/flags/snapshot", secret: "ff_dev_secret_change_me", now: 1767225601234 }).ok).toBe(true);
  });
});

describe("webhook HMAC (OutboxDeliveryService.signBody)", () => {
  const w = vectors.webhook;
  it("reproduces the Kiorly vector", () => {
    const s = signWebhook({ secret: w.secret, body: w.body, timestamp: w.timestamp, eventType: "APPOINTMENT_CONFIRMED", eventId: "clx9abc" });
    expect(s.signature).toBe(w.signature);
    expect(s.headers["X-Kiorly-Timestamp"]).toBe(String(w.timestamp));
    expect(s.headers["X-Kiorly-Event"]).toBe("APPOINTMENT_CONFIRMED");
  });
  it("verifies, and rejects tamper / wrong secret / stale / missing", () => {
    const base = { secret: w.secret, body: w.body, timestamp: String(w.timestamp), signature: w.signature, now: w.timestamp };
    expect(verifyWebhook(base)).toEqual({ ok: true });
    expect(verifyWebhook({ ...base, body: w.body.replace("clinic_01", "clinic_02") })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyWebhook({ ...base, secret: "nope" })).toEqual({ ok: false, reason: "bad_signature" });
    expect(verifyWebhook({ ...base, now: w.timestamp + 301 })).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyWebhook({ ...base, signature: undefined })).toEqual({ ok: false, reason: "missing_headers" });
    expect(verifyWebhook({ ...base, signature: w.signature.slice(7) })).toEqual({ ok: false, reason: "bad_signature" });
  });
  it("accepts raw Buffer bodies", () => {
    expect(verifyWebhook({ secret: w.secret, body: Buffer.from(w.body), timestamp: String(w.timestamp), signature: w.signature, now: w.timestamp }).ok).toBe(true);
  });
});

describe("flag snapshot signature", () => {
  it("is order-independent and detects tampering", () => {
    const snap = { product: "kiorex", version: 3, generatedAt: "2027-01-01T00:00:00.000Z", flags: [{ key: "a", values: { global: "OFF" } }] };
    const sig = signSnapshot("s", snap);
    expect(verifySnapshot("s", { ...snap, signature: sig })).toBe(true);
    expect(verifySnapshot("s", { flags: snap.flags, generatedAt: snap.generatedAt, version: 3, product: "kiorex", signature: sig })).toBe(true);
    expect(verifySnapshot("s", { ...snap, version: 4, signature: sig })).toBe(false);
    expect(verifySnapshot("x", { ...snap, signature: sig })).toBe(false);
  });
});

describe("partner webhook client key (1.4.0)", () => {
  it("signWebhook adds X-Kiorly-Client-Key only when given and the signature is unchanged by it", async () => {
    const { signWebhook, verifyWebhook, PARTNER_API_PATH, PARTNER_WEBHOOK_PATH, WEBHOOK_HEADERS } = await import("../src/index.js");
    const body = JSON.stringify({ eventId: "e1" });
    const a = signWebhook({ secret: "s", body, timestamp: 1_800_000_000, eventType: "OrderReady", eventId: "e1", clientKey: "kx_dev_pharmacy_client" });
    const b = signWebhook({ secret: "s", body, timestamp: 1_800_000_000, eventType: "OrderReady", eventId: "e1" });
    expect(a.headers[WEBHOOK_HEADERS.clientKey]).toBe("kx_dev_pharmacy_client");
    expect(b.headers[WEBHOOK_HEADERS.clientKey]).toBeUndefined();
    expect(a.signature).toBe(b.signature);
    expect(verifyWebhook({ secret: "s", body, timestamp: a.timestamp, signature: a.signature, now: 1_800_000_001 }).ok).toBe(true);
    expect(PARTNER_API_PATH.pharmacy).toBe("/marketplace/v1");
    expect(PARTNER_WEBHOOK_PATH.lab).toBe("/api/v1/webhooks/lab");
  });
});
