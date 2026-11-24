import { describe, expect, it } from "vitest";
import {
  CONTRACTS_VERSION, INTAKE_ERROR_CODES, INTAKE_MAX_BODY_BYTES, INTAKE_NONCE_PATTERN, deriveIntakeSigningKey, enrolmentIdOf, generateEnrolmentCode,
  generateIntakeKey, newIntakeNonce, signIntakeRequest, verifyIntakeSignature,
} from "../src/index.js";
import { readJson } from "./helpers.js";

const spec = readJson("openapi/kiorex-partner-intake.v1.openapi.json");
const body = JSON.stringify({ nonce: "n".repeat(20), kind: "LAB", orgRef: "org_1", name: "Lab" });

describe("1.9.0 partner connection intake contract (additive)", () => {
  it("is a minor bump and the spec documents both endpoints, the headers and the uniform error codes", () => {
    expect(CONTRACTS_VERSION).toMatch(/^1\.(9|10|11|12|13)\.\d+$/);
    const post = spec.paths["/partners/v1/connection-requests"].post;
    expect(post.operationId).toBe("submitConnectionRequest");
    expect(Object.keys(post.responses)).toEqual(expect.arrayContaining(["200", "400", "401", "413", "429"]));
    expect(post.responses["429"].headers["Retry-After"]).toBeTruthy();
    expect(post.parameters.map((p: any) => p.name)).toEqual(expect.arrayContaining(["X-Kiorly-Timestamp", "X-Kiorly-Signature", "X-Kiorex-Enrolment"]));
    expect(spec.paths["/partners/v1/connection-requests/{id}"].get.operationId).toBe("getConnectionRequestStatus");
    expect(spec.components.schemas.Error.properties.code.enum).toEqual([...INTAKE_ERROR_CODES]);
    expect(spec.components.schemas.ConnectionRequest.additionalProperties).toBe(false); // strict
    expect(spec.components.schemas.ConnectionRequest.required).toEqual(["nonce", "kind", "orgRef", "name"]);
    expect(INTAKE_MAX_BODY_BYTES).toBe(65536);
  });

  it("does not touch any other published contract path", () => {
    for (const f of ["kiorly-marketplace", "kiorex-control-plane", "kiorex-webhooks", "kiorly-pharmacy", "kiorly-lab"]) {
      const s = readJson(`openapi/${f}.v1.openapi.json`);
      expect(Object.keys(s.paths).some((p) => p.includes("connection-requests")), f).toBe(false);
    }
  });

  it("enrolment code: shape, id extraction, derived signing key is the only thing stored", () => {
    const e = generateEnrolmentCode();
    expect(e.code).toMatch(/^kxe_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{43}$/);
    expect(enrolmentIdOf(e.code)).toBe(e.id);
    expect(enrolmentIdOf("garbage")).toBeUndefined();
    expect(e.signingKey).toBe(deriveIntakeSigningKey(e.code));
    expect(e.signingKey).toMatch(/^[0-9a-f]{64}$/);
    expect(generateIntakeKey().key).toMatch(/^kxi_/);
    expect(newIntakeNonce()).toMatch(INTAKE_NONCE_PATTERN);
  });

  it("known vector (every product implements the same derivation and signature)", () => {
    const code = "kxe_AAAAAAAA.BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB";
    expect(deriveIntakeSigningKey(code)).toBe("a0ce8b1dc66e4970ef3b844867fabe228c276e5bfffaccfe2ace5e67232adac3");
    const h = signIntakeRequest({ secret: code, body: '{"a":1}', timestamp: 1_700_000_000, enrolmentCode: code });
    expect(h["X-Kiorly-Timestamp"]).toBe("1700000000");
    expect(h["X-Kiorex-Enrolment"]).toBe("kxe_AAAAAAAA");
    expect(h["X-Kiorly-Signature"]).toBe("sha256=0f75288125b5933d50f18d797e51ff3160081300fb82c2b8753a22711baf3e14");
  });

  it("sign and verify round trip; wrong key, tampered body and stale timestamp are refused", () => {
    const e = generateEnrolmentCode(); const now = 1_800_000_000;
    const h = signIntakeRequest({ secret: e.code, body, timestamp: now, enrolmentCode: e.code });
    expect(verifyIntakeSignature({ signingKey: e.signingKey, body, timestamp: h["X-Kiorly-Timestamp"], signature: h["X-Kiorly-Signature"], now })).toBe(true);
    expect(verifyIntakeSignature({ signingKey: generateEnrolmentCode().signingKey, body, timestamp: h["X-Kiorly-Timestamp"], signature: h["X-Kiorly-Signature"], now })).toBe(false);
    expect(verifyIntakeSignature({ signingKey: e.signingKey, body: body + " ", timestamp: h["X-Kiorly-Timestamp"], signature: h["X-Kiorly-Signature"], now })).toBe(false);
    expect(verifyIntakeSignature({ signingKey: e.signingKey, body, timestamp: h["X-Kiorly-Timestamp"], signature: h["X-Kiorly-Signature"], now: now + 301 })).toBe(false);
    expect(verifyIntakeSignature({ signingKey: e.signingKey, body, timestamp: h["X-Kiorly-Timestamp"], signature: h["X-Kiorly-Signature"], now: now + 299 })).toBe(true);
    // the issued key signs later requests without the enrolment header
    const k = generateIntakeKey(); const h2 = signIntakeRequest({ secret: k.key, body, timestamp: now });
    expect(h2["X-Kiorex-Enrolment"]).toBeUndefined();
    expect(verifyIntakeSignature({ signingKey: k.signingKey, body, timestamp: h2["X-Kiorly-Timestamp"], signature: h2["X-Kiorly-Signature"], now })).toBe(true);
  });
});
