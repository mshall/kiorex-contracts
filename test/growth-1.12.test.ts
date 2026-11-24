import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import {
  ASSISTANT_TOOL_NAMES, CAMPAIGN_STATES, CAMPAIGN_TRANSITIONS, CONTRACTS_VERSION, EVENT_META, FLAG_CATALOGUE, GROWTH_CONFIG_KINDS, GROWTH_CONFIG_SCHEMAS, GROWTH_ERROR_CODES, GROWTH_ERROR_STATUS,
  INTEGRATION_KINDS, PRODUCTS, REFERRAL_CODE_ALPHABET, SAFETY_NEVER_FLAGS, canTransitionCampaign, isEventType, isValidReferralCode, productOf, rewardIdempotencyKey, validateEvent, validateGrowthConfig,
} from "../src/index.js";
import * as growthExports from "../src/growth.js";
import { listDir, readJson } from "./helpers.js";

const baseline = readJson("test/growth-baseline-1.11.0.json");
const vectors = readJson("fixtures/growth-v1.12/vectors.json");

describe("1.12.0 is an additive minor over 1.11.0", () => {
  it("version and per-spec versions", () => {
    expect(CONTRACTS_VERSION).toBe("1.12.0");
    expect(readJson("package.json").version).toBe("1.12.0");
    expect(readJson("openapi/kiorex-growth.v1.openapi.json").info.version).toBe("1.1.0");
    expect(readJson("openapi/kiorly-marketplace.v1.openapi.json").info.version).toBe("1.6.0");
    expect(readJson("openapi/kiorex-webhooks.v1.openapi.json").info.version).toBe("1.2.0");
    expect(readJson("package.json").files).toEqual(expect.arrayContaining(["fixtures/growth-v1.12"]));
  });

  it("no 1.11.0 event lost a required field or changed a property; nothing newly required", () => {
    for (const [file, old] of Object.entries<any>(baseline.events)) {
      const now = readJson(`events/${file}`);
      expect(now.properties.type, file).toEqual(old.type);
      expect(now.properties.aggregateType, file).toEqual(old.aggregateType);
      expect(now.required, file).toEqual(old.required);
      const nd = now.properties.data;
      expect(nd.required ?? [], `${file} must not add a REQUIRED data field`).toEqual(old.data.required);
      for (const [k, v] of Object.entries<any>(old.data.properties)) expect(nd.properties[k], `${file}.${k}`).toEqual(v);
    }
  });

  it("every 1.11.0 OpenAPI path, method, operationId and schema property is still there; no required field was added", () => {
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

  it("every 1.11.0 config kind keeps its keys, and its required list", () => {
    for (const [file, old] of Object.entries<any>(baseline.configs)) {
      const now = readJson(`src/growth-config/${file}`);
      expect(now.required ?? [], file).toEqual(old.required);
      for (const [k, v] of Object.entries<any>(old.properties)) expect(now.properties[k], `${file}.${k}`).toEqual(v);
    }
  });

  it("every 1.11.0 flag key is still in the catalogue and every 1.11.0 growth.ts export remains", () => {
    const keys = FLAG_CATALOGUE.map((f) => f.key);
    for (const k of baseline.flags) expect(keys, k).toContain(k);
    for (const name of baseline.growthExports) expect(Object.keys(growthExports).concat(["AcquisitionOrigin", "AttributionReasonCode"]), name).toBeTruthy();
    for (const name of baseline.growthExports.filter((n: string) => /^[A-Z_]+$|^[a-z]/.test(n))) expect(name in growthExports, name).toBe(true);
  });
});

describe("1.12.0 events", () => {
  const NEW = [
    "CampaignCreated", "CampaignStatusChanged", "CampaignBudgetThresholdReached", "CampaignApprovalDecided", "ReferralCodeIssued", "ReferralRelationshipCreated", "ReferralQualified", "ReferralRejected",
    "RewardIssued", "RewardRedeemed", "RewardReversed", "RewardExpired", "RewardHeld", "AssistantConversationEscalated", "AssistantBudgetBreakerTripped", "LifecycleDecisionRecorded", "IntegrationRunFailed",
    "ProductAcquisitionFact", "ProviderVerificationUpdateRequested", "ProviderVerificationDecided", "WAITLIST_OFFER_CREATED", "WAITLIST_OFFER_EXPIRED",
  ];
  it.each(NEW)("%s: registered, has a schema file, an example and a fixture, and the example validates", (t) => {
    expect(isEventType(t)).toBe(true);
    expect(listDir("events")).toContain(`${t}.schema.json`);
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t, ex).valid, JSON.stringify(validateEvent(t, ex))).toBe(true);
    expect(listDir("fixtures/events-v2.4")).toContain(`${t}.json`);
  });
  it("producers: Clinic produces the verification request and the waitlist offers, Kiorex everything else", () => {
    expect(EVENT_META.ProviderVerificationUpdateRequested.producer).toBe("kiorly-clinic");
    expect(EVENT_META.WAITLIST_OFFER_CREATED.producer).toBe("kiorly-clinic");
    expect(EVENT_META.ProviderVerificationDecided.producer).toBe("kiorex");
    expect(EVENT_META.CampaignCreated.producer).toBe("kiorex");
    expect(EVENT_META.ProductAcquisitionFact.producer).toBe("kiorex");
  });
  it("product is optional on the link events (1.11.0 payloads stay valid) and constrained when present", () => {
    for (const t of ["ReferralLinkCreated", "ReferralLinkRevoked"]) {
      const ex = readJson(`events/examples/${t}.example.json`);
      expect(validateEvent(t, ex).valid).toBe(true);
      for (const product of PRODUCTS) expect(validateEvent(t, { ...ex, data: { ...ex.data, product } }).valid, `${t} ${product}`).toBe(true);
      expect(validateEvent(t, { ...ex, data: { ...ex.data, product: "DENTAL" } }).valid).toBe(false);
    }
    expect(productOf(undefined)).toBe("CLINIC");
    expect(productOf("LAB")).toBe("LAB");
    expect(productOf("nope")).toBe("CLINIC");
  });
  it("ProductAcquisitionFact is for partner products only, needs the evidence hash and carries no person", () => {
    const ex = readJson("events/examples/ProductAcquisitionFact.example.json");
    expect(validateEvent("ProductAcquisitionFact", { ...ex, data: { ...ex.data, product: "CLINIC" } }).valid).toBe(false);
    const { evidenceHash: _h, ...no } = ex.data; void _h;
    expect(validateEvent("ProductAcquisitionFact", { ...ex, data: no }).valid).toBe(false);
    expect(Object.keys(ex.data).join(" ")).not.toMatch(/name|phone|email|patient|health|diagnos/i);
  });
  it("no new event example carries a person or health data", () => {
    for (const t of NEW) expect(Object.keys(readJson(`events/examples/${t}.example.json`).data).join(" "), t).not.toMatch(/name|phone|email|patient|health|diagnos|ipaddr/i);
  });
  it("Rx items[] and the visit summary followUp are optional; the signed summary is untouched", () => {
    const rx = readJson("events/examples/PRESCRIPTION_SHARED.example.json");
    expect(validateEvent("PRESCRIPTION_SHARED", rx).valid).toBe(true);
    expect(validateEvent("PRESCRIPTION_SHARED", { ...rx, data: { ...rx.data, items: [{ name: "Amoxicillin 500 mg", dose: "1 capsule", frequency: "3 times daily", durationDays: 7 }] } }).valid).toBe(true);
    expect(validateEvent("PRESCRIPTION_SHARED", { ...rx, data: { ...rx.data, items: [{ dose: "x" }] } }).valid).toBe(false);
    const vs = readJson("events/examples/VISIT_SUMMARY_SHARED.example.json");
    expect(validateEvent("VISIT_SUMMARY_SHARED", { ...vs, data: { ...vs.data, followUp: { intervalDays: 14 } } }).valid).toBe(true);
    expect(validateEvent("VISIT_SUMMARY_SHARED", { ...vs, data: { ...vs.data, followUp: { intervalDays: 0 } } }).valid).toBe(false);
  });
});

describe("1.12.0 growth OpenAPI 1.1.0, marketplace 1.6.0, webhooks 1.2.0", () => {
  const g = readJson("openapi/kiorex-growth.v1.openapi.json");
  const m = readJson("openapi/kiorly-marketplace.v1.openapi.json");
  it("growth: campaign resolve is public and never returns a budget; referral, assistant and preference endpoints exist with unique operationIds", () => {
    const resolve = g.paths["/growth/v1/campaign/resolve"].get;
    expect(resolve.operationId).toBe("growthResolveCampaign");
    expect(resolve.security).toBeUndefined();
    const result = JSON.stringify(g.components.schemas.CampaignResolveResult);
    expect(result).not.toMatch(/budget|spend|channel|eligib/i);
    for (const p of ["/growth/v1/referral/me", "/growth/v1/referral/invites", "/growth/v1/referral/rewards", "/growth/v1/referral/claim", "/growth/v1/assistant/link", "/growth/v1/preferences"]) expect(g.paths[p], p).toBeTruthy();
    const ids = Object.values<any>(g.paths).flatMap((p) => Object.values<any>(p).filter((o) => o && o.operationId).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of ["/growth/v1/referral/me", "/growth/v1/referral/invites", "/growth/v1/referral/rewards", "/growth/v1/referral/claim"]) for (const op of Object.values<any>(g.paths[p])) expect(op.security).toEqual([{ patientSession: [] }]);
    expect(g.components.schemas.ReferralClaimRequest.additionalProperties).toBe(false);
  });
  it("marketplace: KIOREX_WHATSAPP channel, pay-link registration entry, VIDEO modality; no referral or reward field anywhere", () => {
    const channel = m.paths["/bookings"].post.requestBody.content["application/json"].schema.properties.channel;
    expect(channel.enum).toEqual(["MARKETPLACE", "CLINIC_LINK", "KIOREX_WHATSAPP"]);
    expect(m.paths["/pay/links"].post.operationId).toBe("payRegisterLink");
    expect(m.components.schemas.ProviderV23Fields.properties.modalities.items.enum).toContain("VIDEO");
    expect(JSON.stringify(m).toLowerCase()).not.toMatch(/referralrelationship|rewardlot|relationshipref/);
  });
  it("partner OpenAPIs carry the optional acquisition block schema only", () => {
    for (const [n, schema] of [["kiorly-pharmacy", "OrderIntent"], ["kiorly-lab", "InboundLabOrder"]] as const) {
      const s = readJson(`openapi/${n}.v1.openapi.json`);
      expect(s.components.schemas[schema].properties.acquisition.$ref).toBe("#/components/schemas/ProductAcquisitionBlock");
      expect(s.components.schemas[schema].required ?? []).not.toContain("acquisition");
      const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
      const ok = ajv.compile(s.components.schemas.ProductAcquisitionBlock);
      expect(ok({ origin: "PROVIDER_LED", decisionId: "atd_1", policyVersion: "agp_1", reason: "EXPLICIT_PROVIDER_CHANNEL", evidenceHash: "a".repeat(64), product: "PHARMACY" })).toBe(true);
      expect(ok({ origin: "PROVIDER_LED", decisionId: "atd_1", policyVersion: "agp_1", reason: "X", evidenceHash: "zz" })).toBe(false);
    }
  });
  it("webhooks: delivery shapes exist", () => {
    const w = readJson("openapi/kiorex-webhooks.v1.openapi.json");
    for (const n of ["ProductAcquisitionFactDelivery", "ProviderVerificationDecidedDelivery", "ProviderVerificationUpdateRequestedDelivery"]) expect(w.components.schemas[n], n).toBeTruthy();
  });
});

describe("1.12.0 growth.ts vocabulary and fixed vectors", () => {
  it("campaign state machine: the exported table equals the vector table and the full 7 x 7 pair matrix agrees", () => {
    expect(CAMPAIGN_TRANSITIONS).toEqual(vectors.campaignTransitions);
    let allowed = 0;
    for (const a of CAMPAIGN_STATES) for (const b of CAMPAIGN_STATES) { const ok = vectors.campaignTransitions[a].includes(b); expect(canTransitionCampaign(a, b), `${a}->${b}`).toBe(ok); if (ok) allowed++; }
    expect(allowed).toBe(13);
    expect(CAMPAIGN_TRANSITIONS.ARCHIVED).toEqual([]);
    expect(CAMPAIGN_TRANSITIONS.COMPLETED).toEqual(["ARCHIVED"]);
  });
  it("reward idempotency key vectors", () => {
    for (const v of vectors.rewardIdempotencyKey) expect(rewardIdempotencyKey(v.type, v.id)).toBe(v.key);
    for (const v of vectors.rewardIdempotencyKeyInvalid) expect(() => rewardIdempotencyKey(v.type, v.id), JSON.stringify(v)).toThrow();
    expect(growthExports.REWARD_IDEMPOTENCY_KEY_PATTERN.test(rewardIdempotencyKey("ISSUE", "x_1"))).toBe(true);
  });
  it("referral code alphabet and validity vectors", () => {
    expect(REFERRAL_CODE_ALPHABET).toBe(vectors.referralCode.alphabet);
    expect(REFERRAL_CODE_ALPHABET).toHaveLength(32);
    for (const c of ["I", "L", "O", "U"]) expect(REFERRAL_CODE_ALPHABET).not.toContain(c);
    for (const c of vectors.referralCode.valid) expect(isValidReferralCode(c), c).toBe(true);
    for (const c of vectors.referralCode.invalid) expect(isValidReferralCode(c), c).toBe(false);
  });
  it("campaign error codes are served with the documented statuses", () => {
    expect(GROWTH_ERROR_STATUS.CAMPAIGN_INVALID_TRANSITION).toBe(409);
    expect(GROWTH_ERROR_STATUS.CAMPAIGN_CEILING_EXCEEDED).toBe(409);
    expect(GROWTH_ERROR_STATUS.CAMPAIGN_SELF_APPROVAL).toBe(403);
    expect(GROWTH_ERROR_STATUS.CAMPAIGN_NOT_FOUND).toBe(404);
    for (const c of GROWTH_ERROR_CODES) expect(GROWTH_ERROR_STATUS[c], c).toBeGreaterThanOrEqual(400);
  });
  it("assistant tools are a closed list and never include a symptom-to-specialty tool", () => {
    expect(ASSISTANT_TOOL_NAMES).toContain("hold_slot");
    expect(ASSISTANT_TOOL_NAMES.join(" ")).not.toMatch(/symptom|diagnos|triage/);
  });
});

describe("1.12.0 configuration kinds", () => {
  const GOOD: Record<string, Record<string, unknown>> = {
    CAMPAIGN_POLICY: { approvalAboveMinor: 2000000, budgetIncreaseApprovalPercent: 20, monthlyCeilingMinor: 50000000, dailyDefaultCapMinor: 1000000, budgetAlertThresholdsBp: [5000, 8000, 10000], allowedChannels: ["ORGANIC_SEARCH", "EMAIL", "WHATSAPP", "SMS", "IN_APP", "PUSH", "PARTNER", "REFERRAL", "OFFLINE", "PAID_SEARCH", "PAID_SOCIAL", "PAID_VIDEO"], sensitiveChannels: ["WHATSAPP", "SMS"], utmNaming: { maxTokenLength: 40, campaignPrefixMarket: true }, creativeRules: { maxCreatives: 30, allowedHttpsHosts: ["cdn.kiorex.com"], assetKeyPrefix: "growth/creatives/" }, autoExpiryGraceHours: 0, requireReasonOnPause: true },
    REFERRAL_RULES: { enabled: true, qualification: { requireAttended: true, holdDays: 7, requirePhoneVerified: true, lookbackDays: 30 }, caps: { perReferrer30Days: 5, perReferrerYear: 20 }, repeatBonus: { count: 0, windowDays: 90 }, eligibleCareTypes: ["IN_CLINIC", "VIDEO", "HOME_VISIT"], signals: { deviceSignal: false, paymentFingerprint: true } },
    REWARD_RULES: { mode: "COUPON", currency: "EGP", amounts: { referrerMinor: 0, refereeMinor: 0, repeatMinor: 0, promoMinor: 0 }, expiryMonths: 12, perUserAnnualCapMinor: 0, perCampaignCapMinor: 0, ruleBudgetCeilingMinor: 0, redemptionMaxBp: 10000, minPayableMinor: 0, postToPayLedger: false },
    LIFECYCLE_POLICY: { messageClasses: ["TRANSACTIONAL", "SECURITY", "CLINICAL", "MARKETING"], frequencyCaps: { marketingPerDay: 1, marketingPerWeek: 3 }, quietHours: { start: "21:00", end: "09:00", timezone: "Africa/Cairo" }, journeys: { welcome: { enabled: true, messageClass: "TRANSACTIONAL" } }, segments: { new_users: { attributes: ["stage", "platform", "language"] } }, holdoutBps: 0 },
    ASSISTANT_POLICY: { languages: ["ar", "en"], toolsByState: { SEARCH: ["search_providers", "get_slots"] }, budgets: { tokensPerTurn: 1500, tokensPerConversation: 8000, turnsPerConversation: 40, tokensPerSubjectDay: 30000, costPerMarketDayMinor: 200000 }, rateLimits: { messagesPerNumberPerHour: 30, globalConcurrency: 50 }, retentionDays: 30, escalationSlaMinutes: 30, model: { mode: "mock", providerLabel: "mock" } },
    INTEGRATION: { integrations: { googleads: { mode: "mock", secretRef: "growth/googleads/dev", accountLabel: "Main account", pullSchedule: "daily", rateBudgetPerHour: 60, retentionDays: 395 } } },
  };
  it("the six Phase 2 kinds ship a schema and are named; the older ten are still named", () => {
    for (const k of Object.keys(GOOD)) { expect(Object.keys(GROWTH_CONFIG_SCHEMAS)).toContain(k); expect(GROWTH_CONFIG_KINDS).toContain(k); expect(readJson(`src/growth-config/${k}.schema.json`)).toEqual((GROWTH_CONFIG_SCHEMAS as any)[k]); }
    for (const k of ["ATTRIBUTION_POLICY", "SEO", "WIDGET_POLICY", "CONSENT_DEFAULTS", "COMMS_CAPS", "CAMPAIGN_GUARDRAILS", "REWARDS", "INTEGRATIONS", "EXPERIMENT_GUARDRAILS", "MARKET_GROWTH"]) expect(GROWTH_CONFIG_KINDS).toContain(k);
  });
  it.each(Object.keys(GOOD))("%s: proposed default validates; unknown key, missing key and wrong type are rejected", (kind) => {
    expect(validateGrowthConfig(kind, GOOD[kind])).toMatchObject({ valid: true });
    expect(validateGrowthConfig(kind, { ...GOOD[kind], surprise: 1 }).valid).toBe(false);
    const first = Object.keys(GOOD[kind])[0]!;
    const { [first]: _x, ...missing } = GOOD[kind]!; void _x;
    expect(validateGrowthConfig(kind, missing).valid).toBe(false);
    expect(validateGrowthConfig(kind, { ...GOOD[kind], [first]: { nope: true } }).valid).toBe(false);
  });
  it("campaign policy rejects an out-of-set alert threshold, an unknown channel and a bad host", () => {
    const c = GOOD.CAMPAIGN_POLICY!;
    expect(validateGrowthConfig("CAMPAIGN_POLICY", { ...c, budgetAlertThresholdsBp: [4000] }).valid).toBe(false);
    expect(validateGrowthConfig("CAMPAIGN_POLICY", { ...c, allowedChannels: ["TELEPATHY"] }).valid).toBe(false);
    expect(validateGrowthConfig("CAMPAIGN_POLICY", { ...c, creativeRules: { ...(c.creativeRules as object), allowedHttpsHosts: ["http://x"] } }).valid).toBe(false);
  });
  it("lifecycle segments allow only non-clinical attributes; reward mode is a closed set; integration secrets are names", () => {
    const l = GOOD.LIFECYCLE_POLICY!;
    expect(validateGrowthConfig("LIFECYCLE_POLICY", { ...l, segments: { s1: { attributes: ["specialty"] } } }).valid).toBe(false);
    expect(validateGrowthConfig("LIFECYCLE_POLICY", { ...l, segments: { s1: { attributes: ["diagnosis"] } } }).valid).toBe(false);
    expect(validateGrowthConfig("REWARD_RULES", { ...GOOD.REWARD_RULES, mode: "CASH" }).valid).toBe(false);
    const one = (over: object) => ({ integrations: { googleads: { ...(GOOD.INTEGRATION as any).integrations.googleads, ...over } } });
    expect(validateGrowthConfig("INTEGRATION", one({ secretRef: "SK_LIVE_ABCDEFGHIJKLMNOP" })).valid).toBe(false);
    expect(validateGrowthConfig("INTEGRATION", one({ mode: "live" })).valid).toBe(false);
    expect(validateGrowthConfig("INTEGRATION", { integrations: { "Bad Kind": (GOOD.INTEGRATION as any).integrations.googleads } }).valid).toBe(false);
  });
  it("ATTRIBUTION_POLICY.ltBinding and SEO.delistedStatus are optional additions; a 1.11.0 payload still validates", () => {
    const attr = { providerTouchWindowDays: 30, patientReferralWindowDays: 30, campaignClickWindowDays: 7, campaignViewWindowHours: 0, visitorKeyMaxDays: 180, newPatientLookbackMonths: 24, touchEvidenceRetentionMonths: 25, unlinkedTouchRetentionMonths: 13, minDwellMsForProviderTouch: 1000, ltTokenTtlMinutes: 30, precedence: "PROVIDER_FIRST", allowOfflineEvidence: false };
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", attr).valid).toBe(true);
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", { ...attr, ltBinding: "SESSION_HASH" }).valid).toBe(true);
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", { ...attr, ltBinding: "COOKIE" }).valid).toBe(false);
    const seo = { canonicalHost: "https://kiorex.com", locales: ["ar", "en"], defaultLocale: "ar", minLiveProviders: 3, minUniqueBlocks: 3, maxSiblingSimilarityPercent: 70, sitemapShardSize: 10000, edgeCacheSeconds: 300, staleWhileRevalidateSeconds: 3600, delistedGoneAfterDays: 30, reviewMarkupEnabled: true, districtPagesEnabled: true };
    for (const v of ["404", "410", "301_CLINIC"]) expect(validateGrowthConfig("SEO", { ...seo, delistedStatus: v }).valid, v).toBe(true);
    expect(validateGrowthConfig("SEO", { ...seo, delistedStatus: "200" }).valid).toBe(false);
  });
});

describe("1.12.0 flags", () => {
  const by = (k: string) => FLAG_CATALOGUE.find((f) => f.key === k)!;
  const NEW = ["growth.campaign_approval_required", "growth.provider_marketing_v2", "growth.assistant_real_model", "growth.lifecycle_journeys", "growth.referral_fraud_enforce", ...INTEGRATION_KINDS.map((k) => `growth.integrations.${k}`)];
  it.each(NEW)("%s has whenOff text, scopes and a catalogue dependency that exists", (k) => {
    const f = by(k);
    expect(f, k).toBeTruthy();
    expect(f.whenOff.length).toBeGreaterThan(20);
    expect(f.scopes.length).toBeGreaterThan(0);
    for (const d of f.dependsOn) expect(by(d), `${k} -> ${d}`).toBeTruthy();
  });
  it("growth.assistant_real_model is launch-locked with a gate; the others are not", () => {
    expect(by("growth.assistant_real_model")).toMatchObject({ launchLocked: true, class: "Launch-locked" });
    expect(by("growth.assistant_real_model").gate).toBeTruthy();
    expect(NEW.filter((k) => by(k).launchLocked)).toEqual(["growth.assistant_real_model"]);
  });
  it("provider marketing v2 is org-scoped on Kiorly Clinic", () => {
    expect(by("growth.provider_marketing_v2")).toMatchObject({ product: "kiorly-clinic" });
    expect(by("growth.provider_marketing_v2").scopes).toContain("org");
  });
  it("OFF text never claims to hide stored data", () => { for (const k of NEW) expect(by(k).whenOff.toLowerCase(), k).not.toMatch(/\bhide[sd]?\b.*\b(data|records?|bookings)\b|delete/); });
  it("the five new safety controls are listed and no flag key matches their tokens", () => {
    const added = SAFETY_NEVER_FLAGS.slice(16);
    expect(added.map((s) => s.id)).toEqual(["assistant_emergency_short_circuit", "assistant_phi_guard", "marketing_consent_check", "k_anonymity_floor", "ad_safety_assertion"]);
    for (const f of FLAG_CATALOGUE) for (const s of added) for (const t of s.forbiddenKeyTokens) expect(f.key.toLowerCase().includes(t), `${f.key} ~ ${t}`).toBe(false);
  });
});
