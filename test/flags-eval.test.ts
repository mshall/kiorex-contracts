import { describe, expect, it } from "vitest";
import { evaluateFlag, featureDisabledBody, type FlagSnapshotShape, type SnapshotFlag } from "../src/index.js";

const flag = (key: string, over: Partial<SnapshotFlag> = {}): SnapshotFlag => ({
  key, class: "Module", scopes: ["global", "market", "org"], dependsOn: [], launchLocked: false, gateSatisfied: false, values: {}, ...over,
});
const snap = (...flags: SnapshotFlag[]): FlagSnapshotShape => ({ product: "kiorly-clinic", version: 1, generatedAt: "2027-01-01T00:00:00.000Z", flags });
const ctx = { market: "EG", orgId: "org_1" };

describe("evaluateFlag - KX-08 §08 rules", () => {
  it("rule 1: default ON at every scope; a missing row inherits ON", () => {
    expect(evaluateFlag(snap(flag("kiorex.marketplace")), "kiorex.marketplace", ctx)).toMatchObject({ enabled: true, reason: "default" });
    expect(evaluateFlag(snap(), "kiorex.marketplace", ctx).enabled).toBe(true);
  });

  it("rule 1-3: any OFF wins at global, market or organization", () => {
    const g = evaluateFlag(snap(flag("k", { values: { global: "OFF" } })), "k", ctx);
    expect(g).toMatchObject({ enabled: false, reason: "global_off", scope: "global" });
    const m = evaluateFlag(snap(flag("k", { values: { markets: { EG: "OFF" } } })), "k", ctx);
    expect(m).toMatchObject({ enabled: false, reason: "market_off", scope: "market" });
    const o = evaluateFlag(snap(flag("k", { values: { orgs: { org_1: "OFF" } } })), "k", ctx);
    expect(o).toMatchObject({ enabled: false, reason: "org_off", scope: "org" });
  });

  it("OFF is scoped: other markets/orgs stay ON; market code is case-insensitive", () => {
    const s = snap(flag("k", { values: { markets: { EG: "OFF" }, orgs: { org_9: "OFF" } } }));
    expect(evaluateFlag(s, "k", { market: "SA", orgId: "org_1" }).enabled).toBe(true);
    expect(evaluateFlag(s, "k", { market: "eg", orgId: "org_1" }).enabled).toBe(false);
    expect(evaluateFlag(s, "k", { market: "SA", orgId: "org_9" }).enabled).toBe(false);
    expect(evaluateFlag(s, "k", {}).enabled).toBe(true);
  });

  it("a lower scope cannot re-enable what a higher scope turned off", () => {
    // there is no ON value in the snapshot shape; a global OFF stays OFF whatever the market/org context
    const s = snap(flag("k", { values: { global: "OFF" } }));
    expect(evaluateFlag(s, "k", { market: "EG", orgId: "org_1" }).enabled).toBe(false);
    expect(evaluateFlag(s, "k", { market: "SA" }).enabled).toBe(false);
  });

  it("rule 4: plan entitlement is a separate gate (HTTP 402)", () => {
    expect(evaluateFlag(snap(flag("k")), "k", { ...ctx, entitled: false })).toMatchObject({ enabled: false, reason: "not_entitled" });
    expect(evaluateFlag(snap(flag("k")), "k", { ...ctx, entitled: true }).enabled).toBe(true);
  });

  it("rule 5: launch-locked is effective only when gateSatisfied", () => {
    const locked = (gateSatisfied: boolean) => snap(flag("kiorex.telemedicine", { class: "Launch-locked", launchLocked: true, gateSatisfied }));
    expect(evaluateFlag(locked(false), "kiorex.telemedicine", ctx)).toMatchObject({ enabled: false, reason: "awaiting_gate" });
    expect(evaluateFlag(locked(true), "kiorex.telemedicine", ctx)).toMatchObject({ enabled: true, reason: "default" });
    const off = snap(flag("kiorex.telemedicine", { launchLocked: true, gateSatisfied: true, values: { global: "OFF" } }));
    expect(evaluateFlag(off, "kiorex.telemedicine", ctx).enabled).toBe(false);
  });

  it("rule 6: a child is effective only if its parents are (transitively)", () => {
    const s = snap(
      flag("kiorex.marketplace", { values: { markets: { EG: "OFF" } } }),
      flag("clinic.kiorex_listing", { dependsOn: ["kiorex.marketplace"] }),
      flag("clinic.commission_settlement", { dependsOn: ["clinic.kiorex_listing"] }),
    );
    expect(evaluateFlag(s, "clinic.kiorex_listing", ctx)).toMatchObject({ enabled: false, reason: "dependency_off", blockedBy: "kiorex.marketplace", scope: "market" });
    expect(evaluateFlag(s, "clinic.commission_settlement", ctx)).toMatchObject({ enabled: false, reason: "dependency_off", blockedBy: "kiorex.marketplace" });
    expect(evaluateFlag(s, "clinic.commission_settlement", { market: "SA" }).enabled).toBe(true);
  });

  it("rule 6: parent that is launch-locked without gate blocks the child", () => {
    const s = snap(flag("p", { launchLocked: true, gateSatisfied: false }), flag("c", { dependsOn: ["p"] }));
    expect(evaluateFlag(s, "c", ctx)).toMatchObject({ enabled: false, reason: "dependency_off", blockedBy: "p" });
  });

  it("dependencies absent from this product's snapshot fall back to code defaults", () => {
    const s = snap(flag("clinic.eprescription_handoff", { dependsOn: ["pharmacy.module"] }));
    expect(evaluateFlag(s, "clinic.eprescription_handoff", ctx).enabled).toBe(true);
  });

  it("dependency cycles fail closed instead of recursing forever", () => {
    const s = snap(flag("a", { dependsOn: ["b"] }), flag("b", { dependsOn: ["a"] }));
    expect(evaluateFlag(s, "a", ctx).enabled).toBe(false);
  });

  it("rule 7: precedence is OFF value > entitlement > gate > dependency", () => {
    const s = snap(
      flag("p", { values: { global: "OFF" } }),
      flag("k", { launchLocked: true, gateSatisfied: false, dependsOn: ["p"], values: { markets: { EG: "OFF" } } }),
    );
    expect(evaluateFlag(s, "k", { ...ctx, entitled: false }).reason).toBe("market_off");
    expect(evaluateFlag(s, "k", { market: "SA", entitled: false }).reason).toBe("not_entitled");
    expect(evaluateFlag(s, "k", { market: "SA" }).reason).toBe("awaiting_gate");
  });
});

describe("evaluateFlag - expiry", () => {
  const s = (expiresAt: string) => snap(flag("k", { values: { global: "OFF" }, expiresAt }));
  it("an OFF is honoured until expiresAt, then ignored", () => {
    expect(evaluateFlag(s("2027-01-01T02:00:00.000Z"), "k", { now: Date.parse("2027-01-01T01:59:59.000Z") }).enabled).toBe(false);
    const after = evaluateFlag(s("2027-01-01T02:00:00.000Z"), "k", { now: new Date("2027-01-01T02:00:00.000Z") });
    expect(after).toMatchObject({ enabled: true, expired: true });
  });
  it("expiry does not bypass the launch gate", () => {
    const locked = snap(flag("k", { launchLocked: true, gateSatisfied: false, values: { global: "OFF" }, expiresAt: "2027-01-01T00:00:00.000Z" }));
    expect(evaluateFlag(locked, "k", { now: Date.parse("2028-01-01T00:00:00.000Z") }).reason).toBe("awaiting_gate");
  });
  it("an unparseable expiresAt is ignored (OFF stays)", () => {
    expect(evaluateFlag(s("not-a-date"), "k", {}).enabled).toBe(false);
  });
});

describe("evaluateFlag - fail-static / code defaults", () => {
  it("no snapshot: ON, except launch-locked which is OFF until a snapshot confirms the gate", () => {
    expect(evaluateFlag(null, "kiorex.marketplace", ctx)).toMatchObject({ enabled: true, reason: "default" });
    expect(evaluateFlag(undefined, "clinic.no_show_risk", ctx).enabled).toBe(true);
    expect(evaluateFlag(null, "kiorex.telemedicine", ctx)).toMatchObject({ enabled: false, reason: "no_snapshot_launch_locked" });
    expect(evaluateFlag(null, "kiorex.ai_navigation", ctx).enabled).toBe(false);
  });
  it("pattern keys: market.<country>.live and clinic.specialty_templates.<code> are launch-locked", () => {
    expect(evaluateFlag(null, "market.eg.live", ctx).enabled).toBe(false);
    expect(evaluateFlag(null, "clinic.specialty_templates.cardiology", ctx).enabled).toBe(false);
    const s = snap(flag("market.eg.live", { launchLocked: true, gateSatisfied: true }));
    expect(evaluateFlag(s, "market.eg.live", ctx).enabled).toBe(true);
  });
  it("catalogue dependencies apply with no snapshot (child of a launch-locked parent is OFF)", () => {
    expect(evaluateFlag(null, "kiorex.pharmacy_orders", ctx).enabled).toBe(false);
    expect(evaluateFlag(null, "clinic.whatsapp_inbound", ctx).enabled).toBe(true);
  });
  it("fail-static: the last-known snapshot keeps being honoured (evaluation is pure on the snapshot given)", () => {
    const last = snap(flag("kiorex.marketplace", { values: { global: "OFF" } }));
    expect(evaluateFlag(last, "kiorex.marketplace", ctx).enabled).toBe(false);
  });
  it("a key absent from a snapshot uses code defaults (unknown launch-locked key stays OFF)", () => {
    expect(evaluateFlag(snap(), "kiorex.telemedicine", ctx).enabled).toBe(false);
    expect(evaluateFlag(snap(), "brand_new_unknown_flag", ctx).enabled).toBe(true);
    expect(evaluateFlag(snap(), "brand_new_unknown_flag", ctx, { brand_new_unknown_flag: { launchLocked: true } }).enabled).toBe(false);
  });
});

describe("FEATURE_DISABLED body", () => {
  it("builds the universal 403 body {code,key,scope}", () => {
    const d = evaluateFlag(snap(flag("kiorex.marketplace", { values: { markets: { EG: "OFF" } } })), "kiorex.marketplace", ctx);
    expect(featureDisabledBody(d)).toEqual({ statusCode: 403, code: "FEATURE_DISABLED", key: "kiorex.marketplace", scope: "market", message: expect.any(String) });
  });
});
