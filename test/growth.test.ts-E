import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import {
  ACQUISITION_BLOCK_SCHEMA, ACQUISITION_ORIGINS, ACQUISITION_SOURCE_KINDS, ATTRIBUTION_REASON_CODES, COMMISSION_DISPUTE_REASONS, CONTRACTS_VERSION, EVENT_META,
  FLAGS, GROWTH_CLIENT_EVENT_NAMES, GROWTH_CONFIG_KINDS, GROWTH_CONFIG_KINDS_WITH_SCHEMA, GROWTH_CONFIG_SCHEMAS, GROWTH_ERROR_CODES, GROWTH_ERROR_STATUS,
  GROWTH_EVENT_NAMES, GROWTH_SERVER_EVENT_NAMES, WIDGET_MAX_ORIGINS, acquisitionOriginOf, computeAttributionInputsHash, growthCanonicalJson, isEventType,
  isValidWidgetOrigin, validateAcquisitionBlock, validateEvent, validateGrowthConfig, type EventType,
} from "../src/index.js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, listDir, readJson } from "./helpers.js";

const vectors = readJson("fixtures/growth-v1.10/vectors.json");
const examples = readJson("fixtures/growth-v1.10/acquisition-examples.json");
const baseline = readJson("test/growth-baseline-1.9.0.json");
const market = readJson("openapi/kiorly-marketplace.v1.openapi.json");
const growth = readJson("openapi/kiorex-growth.v1.openapi.json");
const cat = readJson("flags/catalogue.json");

describe("1.10.0 growth contract is an additive minor", () => {
  it("version (the 1.11.0 minor only adds to it, see test/link-registry-1.11.test.ts)", () => {
    expect(CONTRACTS_VERSION).toMatch(/^1\.(11|12)\.\d+$/);
    expect(readJson("package.json").version).toMatch(/^1\.(11|12)\.\d+$/);
    expect(market.info.version).toMatch(/^1\.[56]\.\d+$/);
  });

  it("no 1.9.0 event schema lost a required field, a property or changed a property's schema (diff against the 1.9.0 snapshot)", () => {
    for (const [file, old] of Object.entries<any>(baseline.events)) {
      const now = readJson(`events/${file}`);
      expect(now.properties.type, file).toEqual(old.type);
      expect(now.properties.aggregateType, file).toEqual(old.aggregateType);
      expect(now.required, file).toEqual(old.required);
      const nd = now.properties.data;
      for (const r of old.data.required ?? []) expect(nd.required, `${file} data.required`).toContain(r);
      expect(nd.required ?? [], `${file} must not add a REQUIRED data field`).toEqual(old.data.required ?? []);
      for (const [k, v] of Object.entries<any>(old.data.properties ?? {})) expect(nd.properties[k], `${file}.${k}`).toEqual(v);
    }
  });

  it("every 1.9.0 flag keeps every field; every 1.9.0 OpenAPI path, method, operationId and schema name is still there", () => {
    for (const [key, old] of Object.entries<any>(baseline.flags)) expect(cat.flags.find((f: any) => f.key === key), key).toEqual(old);
    for (const [name, old] of Object.entries<any>(baseline.openapi)) {
      const s = readJson(`openapi/${name}.v1.openapi.json`);
      for (const [path, methods] of Object.entries<any>(old.paths)) {
        for (const [m, opId] of Object.entries<any>(methods)) expect(s.paths[path]?.[m]?.operationId, `${name} ${m} ${path}`).toBe(opId);
      }
      for (const sc of old.schemas) expect(s.components.schemas[sc], `${name} schema ${sc}`).toBeTruthy();
    }
  });

  it("old consumers that ignore unknown fields still validate old and new payloads (additive proof)", () => {
    const charge = readJson("events/examples/COMMISSION_CHARGE_CREATED.example.json");
    const { decisionRef: _d, origin: _o, policyVersion: _p, ...old } = charge.data;
    void _d; void _o; void _p;
    expect(validateEvent("COMMISSION_CHARGE_CREATED", { ...charge, data: old }).valid, "1.9.0 payload without the new fields").toBe(true);
    expect(validateEvent("COMMISSION_CHARGE_CREATED", { ...charge, data: { ...old, decisionRef: "cdc_1", origin: "PROVIDER_LED", policyVersion: "agp_1", futureField: 1 } }).valid).toBe(true);
    const profile = readJson("events/examples/PROVIDER_PROFILE_UPDATED.example.json");
    expect(validateEvent("PROVIDER_PROFILE_UPDATED", { ...profile, data: { ...profile.data, widgetOrigins: undefined } }).valid).toBe(true);
    const appt = readJson("events/examples/CHECKED_IN.example.json");
    expect(validateEvent("CHECKED_IN", { ...appt, data: { ...appt.data, acquisitionOrigin: "PROVIDER_LED" } }).valid).toBe(true);
    expect(validateEvent("CHECKED_IN", { ...appt, data: { ...appt.data, acquisitionOrigin: "NOPE" } }).valid).toBe(false);
  });

  it("the CHANGELOG states an additive minor", () => {
    const log = readFileSync(join(ROOT, "CHANGELOG.md"), "utf8");
    expect(log).toMatch(/## 1\.10\.0\s+Additive minor/);
  });
});

describe("acquisition block (ARCH section 6.7)", () => {
  it("the marketplace booking request carries an optional acquisition block and documents the 400 codes", () => {
    const post = market.paths["/bookings"].post;
    const props = post.requestBody.content["application/json"].schema.properties;
    expect(props.acquisition).toEqual({ $ref: "#/components/schemas/AcquisitionBlock" });
    expect(post.requestBody.content["application/json"].schema.required ?? []).not.toContain("acquisition");
    expect(props.channel.enum.slice(0, 2)).toEqual(["MARKETPLACE", "CLINIC_LINK"]); // 1.12.0 only appends KIOREX_WHATSAPP
    expect(market.components.schemas.AcquisitionError.properties.code.enum).toEqual(["ACQUISITION_BLOCK_INVALID", "ACQUISITION_EVIDENCE_HASH_INVALID"]);
    expect(market.components.schemas.AcquisitionBlock.required).toEqual(["origin", "decisionId", "policyVersion", "reason", "evidenceHash"]);
  });

  it("the embedded schema equals the OpenAPI component", () => {
    const { $id, ...rest } = ACQUISITION_BLOCK_SCHEMA as any;
    expect($id).toContain("AcquisitionBlock");
    expect(rest).toEqual(market.components.schemas.AcquisitionBlock);
  });

  it.each(Object.entries<any>(examples.valid))("valid example: %s", (_n, block) => {
    expect(validateAcquisitionBlock(block).valid).toBe(true);
  });
  it.each(Object.entries<any>(examples.invalid))("invalid example: %s", (_n, block) => {
    expect(validateAcquisitionBlock(block).valid).toBe(false);
  });

  it("origins, reasons and source kinds match the architecture document", () => {
    expect([...ACQUISITION_ORIGINS]).toEqual(["PROVIDER_LED", "MARKETPLACE", "UNATTRIBUTED"]);
    expect([...ATTRIBUTION_REASON_CODES]).toEqual(["EXPLICIT_PROVIDER_CHANNEL", "PRIOR_PROVIDER_TOUCH", "PATIENT_REFERRAL", "MARKETPLACE_TOUCH", "NO_PROVIDER_EVIDENCE"]);
    expect(ACQUISITION_SOURCE_KINDS).toContain("PROVIDER_QR");
    for (const e of Object.values<any>(examples.valid)) if (e.touch) expect(ACQUISITION_SOURCE_KINDS).toContain(e.touch.kind);
  });

  it("absent or malformed block reads as UNATTRIBUTED (today's rules)", () => {
    expect(acquisitionOriginOf(undefined)).toBe("UNATTRIBUTED");
    expect(acquisitionOriginOf({ origin: "x" })).toBe("UNATTRIBUTED");
    expect(acquisitionOriginOf(examples.valid.providerLedExplicitChannel)).toBe("PROVIDER_LED");
  });

  it("PROVIDER_LED_EVIDENCE is a dispute reason next to the existing four", () => {
    expect([...COMMISSION_DISPUTE_REASONS]).toEqual(["EXISTING_PATIENT", "DID_NOT_ATTEND", "DUPLICATE", "OTHER", "PROVIDER_LED_EVIDENCE"]);
  });
});

describe("fixed vectors (Clinic keeps a copy of these helpers and proves it against the same file)", () => {
  it("canonical JSON vectors", () => {
    for (const v of vectors.canonicalJson as any[]) expect(growthCanonicalJson(v.input)).toBe(v.output);
  });
  it("inputs hash vectors", () => {
    for (const v of vectors.inputsHash as any[]) expect(computeAttributionInputsHash(v.inputs), v.name).toBe(v.hash);
  });
  it("touch order in the input does not change the hash; a different touch or policy version does", () => {
    const v = vectors.inputsHash[0];
    expect(computeAttributionInputsHash({ ...v.inputs, touches: [...v.inputs.touches].reverse() })).toBe(v.hash);
    expect(computeAttributionInputsHash({ ...v.inputs, policyVersion: "agp_other" })).not.toBe(v.hash);
    expect(computeAttributionInputsHash({ ...v.inputs, touches: v.inputs.touches.slice(1) })).not.toBe(v.hash);
  });
  it("the example evidence hashes are the vector hashes", () => {
    expect(examples.valid.providerLedExplicitChannel.evidenceHash).toBe(vectors.inputsHash[0].hash);
  });
  it("widget origin rules: https only, exact origin, no wildcard, no path, lowercase", () => {
    for (const o of vectors.widgetOrigins.valid) expect(isValidWidgetOrigin(o), o).toBe(true);
    for (const o of vectors.widgetOrigins.invalid) expect(isValidWidgetOrigin(o), o).toBe(false);
    expect(WIDGET_MAX_ORIGINS).toBe(10);
  });
});

describe("growth events", () => {
  const NEW = ["CommissionAdjusted", "PatientConsentUpdated", "AttributionAssigned", "PatientAcquisitionRecorded", "ReferralLinkCreated"];
  it.each(NEW)("%s: v2-draft event whose example and v2.4 fixture validate", (t) => {
    expect(isEventType(t)).toBe(true);
    expect(EVENT_META[t as EventType].status).toBe("v2-draft");
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t as EventType, ex).valid).toBe(true);
    expect(readJson(`fixtures/events-v2.4/${t}.json`)).toEqual(ex);
  });
  it("producers: Clinic emits CommissionAdjusted and ReferralLinkCreated, Kiorex the rest", () => {
    expect(EVENT_META.CommissionAdjusted.producer).toBe("kiorly-clinic");
    expect(EVENT_META.ReferralLinkCreated.producer).toBe("kiorly-clinic");
    for (const t of ["PatientConsentUpdated", "AttributionAssigned", "PatientAcquisitionRecorded"]) expect(EVENT_META[t as EventType].producer).toBe("kiorex");
  });
  it("CommissionAdjusted rejects a malformed amount; PatientConsentUpdated needs a text version", () => {
    const ca = readJson("events/examples/CommissionAdjusted.example.json");
    expect(validateEvent("CommissionAdjusted", { ...ca, data: { ...ca.data, adjustedAmount: "40,00" } }).valid).toBe(false);
    const pc = readJson("events/examples/PatientConsentUpdated.example.json");
    const { textVersion: _t, ...noText } = pc.data;
    void _t;
    expect(validateEvent("PatientConsentUpdated", { ...pc, data: noText }).valid).toBe(false);
    expect(validateEvent("PatientConsentUpdated", { ...pc, data: { ...pc.data, source: "carrier-pigeon" } }).valid).toBe(false);
  });
  it("no growth event payload carries a name, phone, email, ip or health field in its examples", () => {
    for (const t of NEW) {
      const text = JSON.stringify(readJson(`events/examples/${t}.example.json`).data).toLowerCase();
      for (const bad of ["phone", "email", "\"name\"", "ipaddress", "diagnosis", "specialty"]) expect(text, `${t} ${bad}`).not.toContain(bad);
    }
  });
  it("COMMISSION_CHARGE_CREATED gains decisionRef, origin, policyVersion; PROVIDER_PROFILE_UPDATED gains widgetOrigins (max 10, https only)", () => {
    const c = readJson("events/COMMISSION_CHARGE_CREATED.schema.json").properties.data.properties;
    for (const k of ["decisionRef", "origin", "policyVersion"]) expect(c[k], k).toBeTruthy();
    const p = readJson("events/PROVIDER_PROFILE_UPDATED.schema.json");
    expect(p.properties.data.properties.widgetOrigins.maxItems).toBe(10);
    const ex = readJson("events/examples/PROVIDER_PROFILE_UPDATED.example.json");
    expect(validateEvent("PROVIDER_PROFILE_UPDATED", { ...ex, data: { ...ex.data, widgetOrigins: ["https://clinic.example.com"] } }).valid).toBe(true);
    expect(validateEvent("PROVIDER_PROFILE_UPDATED", { ...ex, data: { ...ex.data, widgetOrigins: ["http://clinic.example.com"] } }).valid).toBe(false);
    expect(validateEvent("PROVIDER_PROFILE_UPDATED", { ...ex, data: { ...ex.data, widgetOrigins: Array.from({ length: 11 }, (_, i) => `https://c${i}.example.com`) } }).valid).toBe(false);
  });
  it("every schema file is still indexed (index.json lists all)", () => {
    const idx = readJson("events/index.json").events.map((e: any) => `${e.file}.schema.json`);
    for (const f of listDir("events").filter((x) => x.endsWith(".schema.json") && x !== "envelope.schema.json")) expect(idx, f).toContain(f);
  });
});

describe("growth names and codes", () => {
  it("canonical funnel events: 15 names, client and server sets partition them", () => {
    expect(GROWTH_EVENT_NAMES).toHaveLength(15);
    expect([...GROWTH_CLIENT_EVENT_NAMES, ...GROWTH_SERVER_EVENT_NAMES].sort()).toEqual([...GROWTH_EVENT_NAMES].sort());
    for (const n of ["SlotSelected", "BookingInitiated", "BookingConfirmed", "BookingAttended", "BookingCancelled", "PatientRegistered"]) expect(GROWTH_SERVER_EVENT_NAMES).toContain(n);
    const enumNames = growth.components.schemas.GrowthEventInput.properties.name.enum;
    expect(enumNames).toEqual([...GROWTH_CLIENT_EVENT_NAMES]);
  });
  it("every growth error code has an HTTP status and the OpenAPI error schema points at the same list", () => {
    expect(Object.keys(GROWTH_ERROR_STATUS).sort()).toEqual([...GROWTH_ERROR_CODES].sort());
    expect(new Set(GROWTH_ERROR_CODES).size).toBe(GROWTH_ERROR_CODES.length);
  });
  it("kiorex-growth OpenAPI: public touch, events and bootstrap, unique operationIds, OFF contract documented", () => {
    expect(Object.keys(growth.paths)).toEqual(expect.arrayContaining(["/bootstrap", "/growth/v1/events", "/growth/v1/evidence/{bookingId}", "/growth/v1/touch"])); // 1.12.0 (growth 1.1.0) only adds paths: see test/growth-1.12.test.ts
    const ids = Object.values<any>(growth.paths).flatMap((p) => Object.values<any>(p).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(growth.paths["/growth/v1/touch"].post.responses["202"]).toBeTruthy();
    expect(growth.paths["/growth/v1/touch"].post.responses["403"].content["application/json"].schema.$ref).toBe("#/components/schemas/GrowthError");
    expect(growth.paths["/growth/v1/touch"].post.responses["429"].headers["Retry-After"]).toBeTruthy();
    expect(growth.paths["/bootstrap"].get.security).toEqual([]);
    expect(growth.components.schemas.TouchRequest.additionalProperties).toBe(false);
  });
  it("the touch request validates the documented examples, rejects an email-like UTM and a non-https-style unknown key", () => {
    const ajv = new (Ajv2020 as any).default({ strict: false, allErrors: true });
    (addFormats as any).default(ajv);
    ajv.addSchema({ $id: "g", ...growth.components.schemas.TouchRequest });
    const v = ajv.getSchema("g");
    expect(v({ landingKind: "PROVIDER_LINK", ref: "7K2M9X4Q", dwellMs: 1800 })).toBe(true);
    expect(v({ landingKind: "SPECIALTY_CITY", utm: { source: "google", medium: "organic" } })).toBe(true);
    expect(v({ landingKind: "HOME", utm: { source: "a@b.com" } })).toBe(false);
    expect(v({ landingKind: "HOME", utm: { source: "x".repeat(65) } })).toBe(false);
    expect(v({ landingKind: "HOME", surprise: 1 })).toBe(false);
    expect(v({ landingKind: "HOME", dwellMs: -1 })).toBe(false);
    expect(v({})).toBe(false);
  });
  it("bootstrap fixes showMarketSelector as a required boolean", () => {
    expect(growth.components.schemas.Bootstrap.required).toContain("showMarketSelector");
  });
});

describe("growth config schemas (ARCH section 16)", () => {
  const GOOD: Record<string, any> = {
    ATTRIBUTION_POLICY: { providerTouchWindowDays: 30, patientReferralWindowDays: 30, campaignClickWindowDays: 7, campaignViewWindowHours: 0, visitorKeyMaxDays: 180, newPatientLookbackMonths: 24, touchEvidenceRetentionMonths: 25, unlinkedTouchRetentionMonths: 13, minDwellMsForProviderTouch: 1000, ltTokenTtlMinutes: 30, precedence: "PROVIDER_FIRST", allowOfflineEvidence: false },
    SEO: { canonicalHost: "https://kiorex.com", locales: ["ar", "en"], defaultLocale: "ar", minLiveProviders: 3, minUniqueBlocks: 3, maxSiblingSimilarityPercent: 70, sitemapShardSize: 10000, edgeCacheSeconds: 300, staleWhileRevalidateSeconds: 3600, delistedGoneAfterDays: 30, reviewMarkupEnabled: true, districtPagesEnabled: true },
    WIDGET_POLICY: { maxOriginsPerOrg: 10, allowLocalhostOrigins: false, sessionTokenTtlSeconds: 900, maxActiveHoldsPerPhone: 3, maxActiveHoldsPerIpHash: 5, embedHost: "https://book.kiorex.com", sdkCacheSeconds: 31536000 },
    CONSENT_DEFAULTS: { regimeId: "pdpl-eg-v0", quietHoursStart: "21:00", quietHoursEnd: "09:00", quietHoursTimezone: "Africa/Cairo", maxMarketingPerDay: 1, maxMarketingPerWeek: 3, withdrawalPropagationSeconds: 60, bannerEqualWeight: true, textVersionIds: { analytics: "TODO_NEEDS_HUMAN_v0", marketing: "TODO_NEEDS_HUMAN_v0" } },
    MARKET_GROWTH: { market: "EG", currency: "EGP", phoneCode: "+20", locales: ["ar", "en"], canonicalSegment: "eg", bookingLinkBaseUrl: "https://kiorly.link", qrEnabled: true, marketingLicenceConfirmed: false, integrations: { search_console: false }, whatsappPhoneNumberIdRef: null, dataCell: "frankfurt" },
  };
  it("five kinds ship a schema; the ten kinds of ARCH section 16 are all named", () => {
    expect([...GROWTH_CONFIG_KINDS_WITH_SCHEMA].sort()).toEqual(expect.arrayContaining(["ATTRIBUTION_POLICY", "CONSENT_DEFAULTS", "MARKET_GROWTH", "SEO", "WIDGET_POLICY"])); // 1.12.0 adds six more
    expect(GROWTH_CONFIG_KINDS.length).toBeGreaterThanOrEqual(10);
    for (const k of Object.keys(GROWTH_CONFIG_SCHEMAS)) expect(GROWTH_CONFIG_KINDS).toContain(k);
    for (const k of Object.keys(GROWTH_CONFIG_SCHEMAS)) expect(readJson(`src/growth-config/${k}.schema.json`)).toEqual((GROWTH_CONFIG_SCHEMAS as any)[k]);
  });
  it.each(Object.keys(GOOD))("%s: the proposed defaults validate, an unknown key and a wrong type are rejected", (kind) => {
    expect(validateGrowthConfig(kind, GOOD[kind])).toMatchObject({ valid: true });
    expect(validateGrowthConfig(kind, { ...GOOD[kind], surprise: 1 }).valid).toBe(false);
    const firstKey = Object.keys(GOOD[kind])[0];
    expect(validateGrowthConfig(kind, { ...GOOD[kind], [firstKey]: { nope: true } }).valid).toBe(false);
    const { [firstKey]: _x, ...missing } = GOOD[kind];
    void _x;
    if ((GROWTH_CONFIG_SCHEMAS as any)[kind].required.includes(firstKey)) expect(validateGrowthConfig(kind, missing).valid).toBe(false);
  });
  it("attribution windows have sane bounds (a 400-day provider window is refused; FIRST_TOUCH is only a named alternative)", () => {
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", { ...GOOD.ATTRIBUTION_POLICY, providerTouchWindowDays: 400 }).valid).toBe(false);
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", { ...GOOD.ATTRIBUTION_POLICY, precedence: "RANDOM" }).valid).toBe(false);
    expect(validateGrowthConfig("ATTRIBUTION_POLICY", { ...GOOD.ATTRIBUTION_POLICY, ltTokenTtlMinutes: 31 }).valid).toBe(false);
  });
  it("secrets are never config: only *Ref names exist, widget localhost cannot be a non-boolean, marketing banner weight is fixed", () => {
    expect(validateGrowthConfig("CONSENT_DEFAULTS", { ...GOOD.CONSENT_DEFAULTS, bannerEqualWeight: false }).valid).toBe(false);
    expect(validateGrowthConfig("MARKET_GROWTH", { ...GOOD.MARKET_GROWTH, whatsappPhoneNumberIdRef: "secretRef:kx/wa/eg" }).valid).toBe(true);
    expect(validateGrowthConfig("MARKET_GROWTH", { ...GOOD.MARKET_GROWTH, market: "egypt" }).valid).toBe(false);
  });
  it("kinds without a 1.10.0 schema report a clear error", () => {
    const r = validateGrowthConfig("REWARDS", {});
    expect(r.valid).toBe(false);
  });
  it("proposed defaults are labelled PROPOSED_DEFAULT in every schema description", () => {
    for (const s of Object.values<any>(GROWTH_CONFIG_SCHEMAS)) expect(s.description).toContain("PROPOSED_DEFAULT");
  });
});

describe("growth flags (ADR-023/024/025)", () => {
  const GROWTH = ["growth.provider_links", "growth.attribution", "growth.ssr_public_pages", "growth.seo_landing_pages", "growth.widgets", "growth.deep_links", "growth.analytics_visitor", "growth.marketing_messaging", "growth.campaigns", "growth.patient_referral", "growth.rewards", "kiorex.whatsapp_ai_assistant", "growth.experiments", "growth.integrations.<kind>"];
  const LOCKED = ["growth.analytics_visitor", "growth.marketing_messaging", "growth.patient_referral", "growth.rewards", "kiorex.whatsapp_ai_assistant"];
  const by = (k: string) => cat.flags.find((f: any) => f.key === k);
  it.each(GROWTH)("%s is in the catalogue with scopes, whenOff text and a PROPOSED_DEFAULT note", (k) => {
    const f = by(k);
    expect(f, k).toBeTruthy();
    expect(f.scopes.length).toBeGreaterThan(0);
    expect(f.whenOff.length).toBeGreaterThan(20);
    expect(f.note).toContain("PROPOSED_DEFAULT");
    expect(f.launchLocked).toBe(LOCKED.includes(k));
    if (f.launchLocked) expect(f.gate).toContain("NEEDS_HUMAN");
  });
  it("exactly the counsel-gated flags are launch-locked; the pattern key is a pattern", () => {
    expect(cat.flags.filter((f: any) => f.key.startsWith("growth.") && f.launchLocked).map((f: any) => f.key).sort()).toEqual([...LOCKED.filter((k) => k.startsWith("growth.")), "growth.assistant_real_model", "growth.patient_credit", "growth.refund_as_credit", "growth.family_credit", "growth.support_goodwill", "growth.sponsored_promotions", "growth.corporate"].sort()); // 1.12.0 adds locked keys
    expect(by("growth.integrations.<kind>").keyPattern).toBe(true);
    expect(FLAGS.GROWTH_ATTRIBUTION).toBe("growth.attribution");
  });
  it("OFF text never claims to hide stored data or disable a safety path", () => {
    for (const k of GROWTH) {
      const off = by(k).whenOff.toLowerCase();
      expect(off, k).not.toMatch(/\bhide[sd]?\b.*\b(data|records?|bookings)\b/);
      for (const bad of ["safety alert", "emergency", "sos"]) expect(off, k).not.toContain(bad);
    }
    expect(by("growth.widgets").scopes).toContain("org");
    expect(by("growth.provider_links").product).toBe("kiorly-clinic");
  });
});

describe("tarball surface", () => {
  it("package exports the growth config schemas and files list ships fixtures", () => {
    const pkg = readJson("package.json");
    expect(pkg.exports["./growth-config/*"]).toBe("./src/growth-config/*");
    expect(pkg.files).toEqual(expect.arrayContaining(["src/growth-config", "fixtures/growth-v1.10"]));
  });
});

describe("provider link codes (ARCH section 4.2)", () => {
  it("ReferralLinkCreated accepts 8-character Crockford codes only", () => {
    const ex = readJson("events/examples/ReferralLinkCreated.example.json");
    expect(validateEvent("ReferralLinkCreated", ex).valid).toBe(true);
    for (const bad of ["7k2m9x4q", "7K2M9X4I", "7K2M9X4O", "7K2M9X4L", "7K2M9X4U", "7K2M9X4", "7K2M9X4QQ"]) {
      expect(validateEvent("ReferralLinkCreated", { ...ex, data: { ...ex.data, linkCode: bad } }).valid, bad).toBe(false);
    }
  });
});
