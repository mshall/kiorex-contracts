import { describe, expect, it } from "vitest";
import { GROWTH_CONFIG_KINDS, GROWTH_CONFIG_KINDS_WITH_SCHEMA, validateGrowthConfig } from "../src/index.js";
import { readJson } from "./helpers.js";

const baseline = readJson("test/growth-baseline-1.12.0.json");
const SWEEP = ["RECOMMENDATION_POLICY", "REWARD_GUARDS", "LIFECYCLE_STAGES", "CROSS_PRODUCT_POLICY", "INTEGRATION_RUNTIME", "INTEGRATION_MODES"] as const;

/** Every property of a schema carries a default equal to what shipped in code, so a stored version that omits a key changes nothing. */
const defaultsOf = (s: any): any => Object.fromEntries(Object.entries<any>(s.properties).filter(([, v]) => "default" in v || v.properties).map(([k, v]) => [k, "default" in v ? v.default : defaultsOf(v)]));

describe("1.13.0 configurability sweep: policy numbers that were code constants (additive)", () => {
  it("six new kinds, registered, with a schema, and none of them is a 1.12.0 kind", () => {
    for (const k of SWEEP) {
      expect(GROWTH_CONFIG_KINDS).toContain(k);
      expect(GROWTH_CONFIG_KINDS_WITH_SCHEMA).toContain(k);
      expect(Object.keys(baseline.configs)).not.toContain(`${k}.schema.json`);
    }
  });
  it("the shipped defaults validate, equal today's code values, and an empty document is valid (omitted key = default)", () => {
    for (const k of SWEEP) { const s = readJson(`src/growth-config/${k}.schema.json`); expect(validateGrowthConfig(k, {}).valid, k).toBe(true); if (k !== "INTEGRATION_MODES") expect(validateGrowthConfig(k, defaultsOf(s)).valid, k).toBe(true); }
    expect(defaultsOf(readJson("src/growth-config/RECOMMENDATION_POLICY.schema.json"))).toEqual({ k: 10, spendFloorMinor: 50000, expiryDays: 14, maxPerRun: 10, maxShiftBp: 2000, minRatioBp: 15000, maxAiSummariesPerDay: 20 });
    expect(defaultsOf(readJson("src/growth-config/REWARD_GUARDS.schema.json"))).toEqual({ recoverableLossBlockDays: 90, maxActiveLots: 50 });
    expect(defaultsOf(readJson("src/growth-config/LIFECYCLE_STAGES.schema.json"))).toEqual({ dormantDays: 180, churnedDays: 365, retainedAttendedMin: 2, retainedWindowDays: 365 });
    expect(defaultsOf(readJson("src/growth-config/CROSS_PRODUCT_POLICY.schema.json"))).toEqual({ rxToPharmacy: { ttlDays: 30, lookbackDays: 7 }, labOrderToLab: { ttlDays: 30, lookbackDays: 7 }, carePlanToHomeVisit: { ttlDays: 30, lookbackDays: 30 } });
    expect(defaultsOf(readJson("src/growth-config/INTEGRATION_RUNTIME.schema.json"))).toEqual({ breakerThreshold: 5, breakerCooldownMinutes: 30, maxAttempts: 3 });
  });
  it("safety floors cannot be weakened: recommendation k >= 10, loss block >= 30 days", () => {
    for (const bad of [{ k: 9 }, { k: 0 }, { k: -1 }]) expect(validateGrowthConfig("RECOMMENDATION_POLICY", bad).valid, JSON.stringify(bad)).toBe(false);
    expect(validateGrowthConfig("RECOMMENDATION_POLICY", { k: 25 }).valid).toBe(true);
    expect(validateGrowthConfig("RECOMMENDATION_POLICY", { minRatioBp: 10000 }).valid).toBe(false);
    for (const bad of [{ recoverableLossBlockDays: 29 }, { recoverableLossBlockDays: 0 }, { maxActiveLots: 9 }, { maxActiveLots: 501 }]) expect(validateGrowthConfig("REWARD_GUARDS", bad).valid, JSON.stringify(bad)).toBe(false);
    expect(validateGrowthConfig("REWARD_GUARDS", { recoverableLossBlockDays: 30, maxActiveLots: 10 }).valid).toBe(true);
  });
  it("every number is bounded and unknown keys are rejected", () => {
    const bad: Array<[string, unknown]> = [
      ["LIFECYCLE_STAGES", { dormantDays: 29 }], ["LIFECYCLE_STAGES", { churnedDays: 1461 }], ["LIFECYCLE_STAGES", { retainedAttendedMin: 0 }], ["LIFECYCLE_STAGES", { surprise: 1 }],
      ["CROSS_PRODUCT_POLICY", { rxToPharmacy: { ttlDays: 0 } }], ["CROSS_PRODUCT_POLICY", { carePlanToHomeVisit: { lookbackDays: 91 } }], ["CROSS_PRODUCT_POLICY", { other: {} }],
      ["INTEGRATION_RUNTIME", { breakerThreshold: 1 }], ["INTEGRATION_RUNTIME", { breakerCooldownMinutes: 4 }], ["INTEGRATION_RUNTIME", { maxAttempts: 6 }], ["INTEGRATION_RUNTIME", { apiKey: "x" }],
    ];
    for (const [k, p] of bad) expect(validateGrowthConfig(k, p).valid, `${k} ${JSON.stringify(p)}`).toBe(false);
  });
  it("INTEGRATION_MODES: only known integration keys, only mock or real, and no field can carry a credential", () => {
    expect(validateGrowthConfig("INTEGRATION_MODES", { modes: { SMS: "real", PAYMOB: "mock" } }).valid).toBe(true);
    for (const bad of [{ modes: { SMS: "sandbox" } }, { modes: { NOT_A_VENDOR: "real" } }, { modes: {}, apiKey: "sk_live_x" }, { secret: "x" }]) expect(validateGrowthConfig("INTEGRATION_MODES", bad).valid, JSON.stringify(bad)).toBe(false);
    const props = readJson("src/growth-config/INTEGRATION_MODES.schema.json").properties.modes.properties;
    expect(Object.keys(props)).toEqual(expect.arrayContaining(["PAYMOB", "FAWRY", "INSTAPAY", "SMS", "EMAIL", "WHATSAPP_CLOUD", "PUSH_FCM", "GOOGLE_ADS", "LLM_ASSISTANT", "TURN_VIDEO", "PASSPORT_IDP", "OBJECT_STORAGE"]));
  });
  it("the three kinds that already existed in 1.13.0 keep their keys (EXPERIMENT_POLICY, AUTOMATION_POLICY, ATTRIBUTION_MODELS are untouched by the sweep)", () => {
    expect(Object.keys(readJson("src/growth-config/EXPERIMENT_POLICY.schema.json").properties)).toEqual(expect.arrayContaining(["minRunDays", "srmAlpha", "kAnonymity", "conversionWindowDays"]));
    expect(readJson("src/growth-config/EXPERIMENT_POLICY.schema.json").properties.kAnonymity.minimum).toBe(10);
  });
});
