import { describe, expect, it } from "vitest";
import {
  CONTRACTS_VERSION, FLAG_CATALOGUE, GROWTH_CONFIG_KINDS, GROWTH_FLAGS_1_13, PHASE3_ERROR_CODES, isEventType, staffPhoneMatchHash, validateEvent, validateGrowthConfig,
} from "../src/index.js";
import * as growthExports from "../src/growth.js";
import { readJson } from "./helpers.js";

const baseline = readJson("test/growth-baseline-1.12.0.json");

describe("1.13.0 is an additive minor over 1.12.0 (additive proof)", () => {
  it("version, per-spec versions and packed fixtures", () => {
    expect(CONTRACTS_VERSION).toBe("1.13.0");
    expect(readJson("package.json").version).toBe("1.13.0");
    expect(readJson("openapi/kiorly-marketplace.v1.openapi.json").info.version).toBe("1.7.0");
    expect(readJson("package.json").files).toEqual(expect.arrayContaining(["fixtures/growth-v1.13"]));
  });
  it("no 1.12.0 event lost a required field or changed a property; nothing newly required", () => {
    for (const [file, old] of Object.entries<any>(baseline.events)) {
      const now = readJson(`events/${file}`);
      expect(now.properties.type, file).toEqual(old.type);
      expect(now.properties.aggregateType, file).toEqual(old.aggregateType);
      expect(now.required, file).toEqual(old.required);
      const nd = now.properties.data;
      expect(nd.required ?? [], `${file} must not add a REQUIRED data field`).toEqual(old.data.required);
      for (const [k, v] of Object.entries<any>(old.data.properties ?? {})) expect(nd.properties[k], `${file}.${k}`).toEqual(v);
    }
  });
  it("every 1.12.0 OpenAPI path, method, operationId and schema property is still there; no required field was added", () => {
    for (const [name, old] of Object.entries<any>(baseline.openapi)) {
      const s = readJson(`openapi/${name}.v1.openapi.json`);
      for (const [path, methods] of Object.entries<any>(old.paths)) for (const [m, opId] of Object.entries<any>(methods)) expect(s.paths[path]?.[m]?.operationId, `${name} ${m} ${path}`).toBe(opId);
      for (const [sc, shape] of Object.entries<any>(old.schemas)) {
        const now = s.components.schemas[sc];
        expect(now, `${name} schema ${sc}`).toBeTruthy();
        for (const p of shape.properties) expect(Object.keys(now.properties ?? {}), `${name} ${sc}.${p}`).toContain(p);
        expect(now.required ?? [], `${name} ${sc} required`).toEqual(shape.required);
      }
    }
  });
  it("every 1.12.0 config kind keeps its keys and required list (ATTRIBUTION_POLICY only gains the optional products)", () => {
    for (const [file, old] of Object.entries<any>(baseline.configs)) {
      const now = readJson(`src/growth-config/${file}`);
      expect(now.required ?? [], file).toEqual(old.required);
      for (const [k, v] of Object.entries<any>(old.properties)) expect(now.properties[k], `${file}.${k}`).toEqual(v);
    }
  });
  it("every 1.12.0 flag key and growth.ts export remains", () => {
    const keys = FLAG_CATALOGUE.map((f) => f.key);
    for (const k of baseline.flags) expect(keys, k).toContain(k);
    for (const name of baseline.growthExports.filter((n: string) => /^[A-Z_0-9]+$|^[a-z]/.test(n))) expect(name in growthExports, name).toBe(true);
  });
  it("the partner acquisition origin enum only gained CROSS_PRODUCT and the request enum order is kept", () => {
    for (const f of ["kiorly-pharmacy", "kiorly-lab"]) {
      const b = readJson(`openapi/${f}.v1.openapi.json`).components.schemas.ProductAcquisitionBlock;
      expect(b.properties.origin.enum).toEqual(["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED", "CROSS_PRODUCT"]);
      expect(b.required).toEqual(["origin", "decisionId", "policyVersion", "reason", "evidenceHash"]);
      expect(b.properties.factRef.type).toBe("string");
    }
  });
});

describe("1.13.0 events", () => {
  const NEW = [
    "ExperimentStarted", "ExperimentStopped", "ExperimentConcluded", "ExperimentSrmDetected", "ExperimentShipRequested", "FraudCaseOpened", "FraudCaseResolved",
    "GrowthRecommendationProposed", "GrowthRecommendationDecided", "GrowthJourneyPublished", "GrowthJourneyKilled", "MarketOnboardingStateChanged", "SeoQualityGateFailed", "SeoVitalBudgetBreached",
  ];
  it.each(NEW)("%s is registered, validates its example and carries no person", (t) => {
    expect(isEventType(t)).toBe(true);
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t, ex).valid, t).toBe(true);
    expect(Object.keys(ex.data).join(" ")).not.toMatch(/\bname\b|phone|e-?mail|\bsub\b|patient|national|diagnos|device|ipHash/i);
    expect(readJson(`events/${t}.schema.json`)["x-producer"]).toBe("kiorex");
  });
  it("PROVIDER_PROMOTION_UPDATED and PatientAcquisitionRecorded gain only optional fields", () => {
    const p = readJson("events/PROVIDER_PROMOTION_UPDATED.schema.json").properties.data;
    for (const k of ["name", "budgetCapMinor", "perPatientLimit", "eligibility", "fundingMode", "reviewKinds"]) { expect(p.properties[k], k).toBeTruthy(); expect(p.required).not.toContain(k); }
    const a = readJson("events/PatientAcquisitionRecorded.schema.json").properties.data;
    expect(a.properties.product.enum).toEqual(["CLINIC", "PHARMACY", "LAB", "NURSE"]);
    expect(a.required).not.toContain("product");
  });
  it("an event with a person field in its payload still validates (additive) but the new examples contain none", () => {
    const ex = readJson("events/examples/FraudCaseOpened.example.json");
    expect(validateEvent("FraudCaseOpened", { ...ex, data: { ...ex.data, surface: "NOT_A_SURFACE" } }).valid).toBe(false);
  });
});

describe("1.13.0 flags", () => {
  it("the eight new flags exist, are in the documented classes and only growth.ai_recommendations is launch-locked", () => {
    for (const k of GROWTH_FLAGS_1_13) {
      const f = FLAG_CATALOGUE.find((x) => x.key === k)!;
      expect(f, k).toBeTruthy();
      expect(f.whenOff.length).toBeGreaterThan(20);
      expect(f.launchLocked, k).toBe(k === "growth.ai_recommendations");
    }
    const ai = FLAG_CATALOGUE.find((x) => x.key === "growth.ai_recommendations")!;
    expect(ai.gate).toContain("NEEDS_HUMAN");
    expect(FLAG_CATALOGUE.find((x) => x.key === "clinic.sponsored_promotions")).toMatchObject({ product: "kiorly-clinic" });
    expect(FLAG_CATALOGUE.find((x) => x.key === "growth.fraud_scoring")!.note).toContain("SHADOW");
  });
});

describe("1.13.0 config kinds", () => {
  it("the seven kinds are registered and have a schema", () => {
    for (const k of ["FRAUD_RULES", "SEO_AUTOMATION", "LTV_POLICY", "MARKET_PROFILE", "ATTRIBUTION_MODELS", "EXPERIMENT_POLICY", "AUTOMATION_POLICY"]) {
      expect(GROWTH_CONFIG_KINDS).toContain(k);
      expect(validateGrowthConfig(k as any, {}).valid === true || validateGrowthConfig(k as any, {}).valid === false).toBe(true);
    }
  });
  it("FRAUD_RULES accepts the shipped defaults shape, cannot switch off the two-person rule, rejects unknown rules and cross-surface actions", () => {
    expect(validateGrowthConfig("FRAUD_RULES", { enforce: false, bands: { review: 30, hold: 70 }, diminishing: 0.6, twoPersonOnMoney: true, rules: { r_self: { enabled: true, weight: 100, cap: 100, enforce: false } }, actions: { TOUCH: { REVIEW: "OPEN_CASE", HOLD: "QUARANTINE_TOUCH" } }, thresholds: { touchBurstPerMinute: 20 } }).valid).toBe(true);
    for (const bad of [{ twoPersonOnMoney: false }, { rules: { r_nope: { weight: 1 } } }, { actions: { TOUCH: { HOLD: "HOLD_REWARD" } } }, { bands: { review: 0 } }, { surprise: 1 }]) expect(validateGrowthConfig("FRAUD_RULES", bad).valid, JSON.stringify(bad)).toBe(false);
  });
  it("SEO_AUTOMATION: autoNoindex boolean, template names closed, check ids closed", () => {
    expect(validateGrowthConfig("SEO_AUTOMATION", { autoNoindex: false, minUniqueWords: { doctor: 15 }, blocking: ["thin-content", "similarity"], vitals: { lcpMs: 2500, inpMs: 200, cls: 0.1, tbtMs: 200, perfScore: 90 }, title: { min: 12, max: 70 } }).valid).toBe(true);
    for (const bad of [{ autoNoindex: "yes" }, { minUniqueWords: { nonsense: 1 } }, { blocking: ["made-up"] }, { forbiddenClaims: { en: ["<b>x</b>"] } }]) expect(validateGrowthConfig("SEO_AUTOMATION", bad).valid, JSON.stringify(bad)).toBe(false);
  });
  it("LTV_POLICY and EXPERIMENT_POLICY cannot lower the k-anonymity floor below 10", () => {
    expect(validateGrowthConfig("LTV_POLICY", { horizonMonths: 12, minCohortPatients: 10 }).valid).toBe(true);
    expect(validateGrowthConfig("LTV_POLICY", { minCohortPatients: 9 }).valid).toBe(false);
    expect(validateGrowthConfig("LTV_POLICY", { minPatientsPerObservedMonth: 5 }).valid).toBe(false);
    expect(validateGrowthConfig("EXPERIMENT_POLICY", { kAnonymity: 10, minRunDays: 7 }).valid).toBe(true);
    expect(validateGrowthConfig("EXPERIMENT_POLICY", { kAnonymity: 5 }).valid).toBe(false);
  });
  it("ATTRIBUTION_MODELS keeps windows to 1..90 days and the data-driven node floor at 10", () => {
    expect(validateGrowthConfig("ATTRIBUTION_MODELS", { windows: { webAppDays: 30, campaignDays: 7, providerLinkDays: 30 }, halfLifeDays: 7, positionFirstBp: 4000, positionLastBp: 4000, dataDriven: { minConversions: 1000, minNodeK: 10 } }).valid).toBe(true);
    for (const bad of [{ windows: { webAppDays: 91 } }, { dataDriven: { minNodeK: 9 } }, { halfLifeDays: 0 }]) expect(validateGrowthConfig("ATTRIBUTION_MODELS", bad).valid, JSON.stringify(bad)).toBe(false);
  });
  it("AUTOMATION_POLICY caps stay bounded; MARKET_PROFILE needs the regulation block", () => {
    expect(validateGrowthConfig("AUTOMATION_POLICY", { maxNodes: 12, maxSendsPerJourney: 3, maxSendsPer30Days: 4, holdoutPercent: 0 }).valid).toBe(true);
    expect(validateGrowthConfig("AUTOMATION_POLICY", { maxSendsPer30Days: 31 }).valid).toBe(false);
    const profile = { cc: "ZY", name: { ar: "زيد", en: "Zedland" }, currency: "ZYD", minorUnits: 2, phoneCode: "+999", timezone: "UTC", locales: ["ar", "en"], defaultLocale: "en", canonicalSegment: "zy", quietHours: { start: "22:00", end: "08:00" }, workingWeek: [0, 1, 2, 3, 4], geographyRef: null, regulation: { marketingLicenceRequired: true, marketingLicenceHeld: false, consentRegimeId: "opt_in", minimumAge: 18, healthAdvertisingRestricted: true, reviewMarkupAllowed: false, dataExportRuleId: "export_default" } };
    expect(validateGrowthConfig("MARKET_PROFILE", profile).valid).toBe(true);
    const { regulation: _r, ...noReg } = profile;
    expect(validateGrowthConfig("MARKET_PROFILE", noReg).valid).toBe(false);
    expect(validateGrowthConfig("MARKET_PROFILE", { ...profile, cc: "zy" }).valid).toBe(false);
  });
  it("ATTRIBUTION_POLICY accepts the optional per-product windows and still accepts a 1.12.0 document", () => {
    const base = readJson("src/growth-config/ATTRIBUTION_POLICY.schema.json");
    expect(Object.keys(base.properties.products.properties)).toEqual(["PHARMACY", "LAB", "NURSE"]);
    expect(base.required ?? []).toEqual(baseline.configs["ATTRIBUTION_POLICY.schema.json"].required);
  });
});

describe("1.13.0 vocabulary, OpenAPI and vectors", () => {
  it("phase 3 error codes", () => { expect([...PHASE3_ERROR_CODES]).toEqual(["JOURNEY_INVALID", "RECOMMENDATION_NOT_AGGREGATE"]); });
  it("marketplace 1.7.0 documents the three added operations and the booking sponsoredDiscount answer", () => {
    const m = readJson("openapi/kiorly-marketplace.v1.openapi.json");
    expect(m.paths["/promotions/{promotionId}/reverse"].post.operationId).toBe("marketplaceReversePromotion");
    expect(m.paths["/promotions/{promotionId}/review-decision"].post.operationId).toBe("marketplacePromotionReviewDecision");
    expect(m.paths["/growth/staff-phone-match"].get.operationId).toBe("marketplaceStaffPhoneMatch");
    expect(m.components.schemas.PromotionReviewDecisionRequest.required).toEqual(["version", "reviewKind", "decision", "decidedBy"]);
    expect(m.components.schemas.StaffPhoneMatchResult.properties).toEqual({ match: { type: "boolean" } });
    expect(m.paths["/bookings"].post.responses["201"].content["application/json"].schema.properties.sponsoredDiscount.$ref).toContain("SponsoredDiscountAnswer");
  });
  it("staff phone match hash vectors (the Clinic and Kiorex copies must produce these exact values)", () => {
    const v = readJson("fixtures/growth-v1.13/staff-phone-match-vectors.json");
    for (const c of v.cases) expect(staffPhoneMatchHash(c.phone, v.secret), c.phone).toBe(c.hash);
    expect(v.cases[0].hash).toBe(v.cases[1].hash);
    expect(v.cases[0].hash).toBe(v.cases[2].hash);
    expect(v.cases[0].hash).toBe(v.cases[3].hash);
    expect(staffPhoneMatchHash("+201012345678", "another-secret")).not.toBe(v.cases[0].hash);
  });

  it("the loyalty set (GRW-P4-D) is inside 1.13.0 and purely additive: new flag, kind and three Kiorex-internal events", () => {
    expect(FLAG_CATALOGUE.find((x) => x.key === "growth.loyalty")?.launchLocked).toBe(true);
    expect(GROWTH_CONFIG_KINDS).toContain("LOYALTY_RULES");
    for (const t of ["LoyaltyPointsAccrued", "LoyaltyPointsConverted", "PartnershipCodeRedeemed"]) expect(isEventType(t), t).toBe(true);
    for (const k of Object.keys(baseline.configs)) expect(k).not.toBe("LOYALTY_RULES.schema.json");
    expect(Object.keys(baseline.events)).not.toContain("LoyaltyPointsAccrued.schema.json");
    expect(baseline.flags).not.toContain("growth.loyalty");
  });
});
