import { describe, expect, it } from "vitest";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { CONTRACTS_VERSION, EVENT_META, GROWTH_CONFIG_SCHEMAS, isEventType, validateEvent, validateGrowthConfig } from "../src/index.js";
import { readJson } from "./helpers.js";

const baseline = readJson("test/growth-baseline-1.10.0.json");
const market = readJson("openapi/kiorly-marketplace.v1.openapi.json");
const seoSchema = readJson("src/growth-config/SEO.schema.json");

const SEO_BASE = { canonicalHost: "https://kiorex.com", locales: ["ar", "en"], defaultLocale: "ar", minLiveProviders: 3, minUniqueBlocks: 3, maxSiblingSimilarityPercent: 70, sitemapShardSize: 10000, edgeCacheSeconds: 300, staleWhileRevalidateSeconds: 3600, delistedGoneAfterDays: 30, reviewMarkupEnabled: true, districtPagesEnabled: true };

describe("1.11.0 is an additive minor over 1.10.0", () => {
  it("version", () => {
    expect(CONTRACTS_VERSION).toBe("1.11.0");
    expect(readJson("package.json").version).toBe("1.11.0");
    expect(market.info.version).toBe("1.5.0");
  });

  it("no 1.10.0 event lost a required field or changed a property; no required field was added", () => {
    for (const [file, old] of Object.entries<any>(baseline.events)) {
      const now = readJson(`events/${file}`);
      expect(now.properties.type, file).toEqual(old.type);
      expect(now.required, file).toEqual(old.required);
      const nd = now.properties.data;
      expect(nd.required ?? [], `${file} must not add a REQUIRED data field`).toEqual(old.data.required ?? []);
      for (const [k, v] of Object.entries<any>(old.data.properties ?? {})) expect(nd.properties[k], `${file}.${k}`).toEqual(v);
    }
  });

  it("every 1.10.0 OpenAPI path, method, operationId and schema is still there", () => {
    for (const [name, old] of Object.entries<any>(baseline.openapi)) {
      const s = readJson(`openapi/${name}.v1.openapi.json`);
      for (const [path, methods] of Object.entries<any>(old.paths)) for (const [m, opId] of Object.entries<any>(methods)) expect(s.paths[path]?.[m]?.operationId, `${name} ${m} ${path}`).toBe(opId);
      for (const sc of old.schemas) expect(s.components.schemas[sc], `${name} schema ${sc}`).toBeTruthy();
    }
  });
});

describe("SEO config extension keys (GRW-P1-F, validated by Kiorex validateSeoExtensions)", () => {
  it("every 1.10.0 SEO key and the required list are unchanged", () => {
    expect(seoSchema.required).toEqual(baseline.seo.required);
    for (const [k, v] of Object.entries<any>(baseline.seo.properties)) expect(seoSchema.properties[k], k).toEqual(v);
  });
  it("a 1.10.0 payload without the new keys still validates", () => {
    expect(validateGrowthConfig("SEO", SEO_BASE).valid).toBe(true);
  });
  it("accepts templates, thresholds, review-markup and pagination policy", () => {
    const full = { ...SEO_BASE, paginatedIndexable: true, reviewMarkupMinCount: 5, sameDayWindowHours: 24, minAvailableProviders: 2, maxParentSimilarityPercent: 100, templates: { en: { city: { title: "{specialty} in {city}", description: "{count} providers in {city}" } }, ar: { doctor: { title: "{name} - {specialty}" } } } };
    expect(validateGrowthConfig("SEO", full).valid).toBe(true);
  });
  it.each([
    ["reviewMarkupMinCount", 0], ["sameDayWindowHours", 73], ["minAvailableProviders", 51], ["maxParentSimilarityPercent", 49], ["paginatedIndexable", "yes"],
  ])("rejects out-of-range %s", (k, v) => { expect(validateGrowthConfig("SEO", { ...SEO_BASE, [k]: v }).valid).toBe(false); });
  it("rejects an unknown locale, page type, field or markup in a template", () => {
    for (const templates of [{ fr: {} }, { en: { landing: { title: "x" } } }, { en: { city: { title: "x", slug: "y" } } }, { en: { city: { title: "<b>x</b>" } } }, { en: { city: { title: "" } } }]) {
      expect(validateGrowthConfig("SEO", { ...SEO_BASE, templates }).valid, JSON.stringify(templates)).toBe(false);
    }
  });
  it("unknown top-level keys are still rejected", () => { expect(validateGrowthConfig("SEO", { ...SEO_BASE, surprise: 1 }).valid).toBe(false); });
  it("the exported schema equals the file", () => { expect(GROWTH_CONFIG_SCHEMAS.SEO).toEqual(seoSchema); });
});

describe("marketplace `lt` and the link registry lookup", () => {
  it("POST /bookings declares the optional `lt` string and it is not required", () => {
    const schema = market.paths["/bookings"].post.requestBody.content["application/json"].schema;
    expect(schema.properties.lt.type).toBe("string");
    expect(schema.required ?? []).not.toContain("lt");
  });
  it("lookup and reconciliation operations exist with unique operationIds and typed records", () => {
    expect(market.paths["/referral-links/{code}"].get.operationId).toBe("marketplaceGetReferralLink");
    expect(market.paths["/referral-links"].get.operationId).toBe("marketplaceListReferralLinks");
    const rec = market.components.schemas.ReferralLinkRecord;
    expect(rec.required).toEqual(expect.arrayContaining(["code", "orgRef", "status"]));
    expect(rec.properties.status.enum).toEqual(["ACTIVE", "PAUSED", "REVOKED"]);
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
    const ok = ajv.compile({ ...rec, components: undefined });
    expect(ok({ code: "7K2M9X4Q", orgRef: "ten_1", clinicRef: null, ownerScope: "DOCTOR", channelKind: "QR_DESK", status: "REVOKED", createdAt: "2027-03-04T09:12:44.000Z", updatedAt: "2027-03-20T08:00:00.000Z", revokedAt: "2027-03-20T08:00:00.000Z" })).toBe(true);
    expect(ok({ code: "7k2m9x4q", orgRef: "ten_1", ownerScope: "DOCTOR", channelKind: "QR_DESK", status: "ACTIVE", createdAt: "2027-03-04T09:12:44.000Z", updatedAt: "2027-03-04T09:12:44.000Z" })).toBe(false);
  });
});

describe("ReferralLinkCreated and ReferralLinkRevoked carry the organisation reference", () => {
  it("both are Clinic-produced v2-draft events", () => {
    for (const t of ["ReferralLinkCreated", "ReferralLinkRevoked"]) { expect(isEventType(t)).toBe(true); expect(EVENT_META[t as keyof typeof EVENT_META].producer).toBe("kiorly-clinic"); }
  });
  it("orgRef is optional on Created (1.10.0 payloads stay valid) and required on Revoked", () => {
    const c = readJson("events/examples/ReferralLinkCreated.example.json");
    expect(c.data.orgRef).toBeTruthy();
    const { orgRef: _o, clinicRef: _c, ...old } = c.data; void _o; void _c;
    expect(validateEvent("ReferralLinkCreated", { ...c, data: old }).valid).toBe(true);
    const r = readJson("events/examples/ReferralLinkRevoked.example.json");
    expect(validateEvent("ReferralLinkRevoked", r).valid).toBe(true);
    const { orgRef: _x, ...noOrg } = r.data; void _x;
    expect(validateEvent("ReferralLinkRevoked", { ...r, data: noOrg }).valid).toBe(false);
    expect(validateEvent("ReferralLinkRevoked", { ...r, data: { ...r.data, linkCode: "7k2m9x4q" } }).valid).toBe(false);
  });
  it("neither payload carries a person", () => {
    for (const t of ["ReferralLinkCreated", "ReferralLinkRevoked"]) {
      const keys = Object.keys(readJson(`events/examples/${t}.example.json`).data).join(" ");
      expect(keys).not.toMatch(/name|phone|email|ip|patient|health/i);
    }
  });
});
