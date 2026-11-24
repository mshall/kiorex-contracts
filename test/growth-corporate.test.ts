import { describe, expect, it } from "vitest";
import { CORPORATE_BENEFIT_ENTRY_TYPES, CORPORATE_MIN_K, FLAG_CATALOGUE, GROWTH_CONFIG_KINDS, isEventType, validateEvent, validateGrowthConfig } from "../src/index.js";
import { readJson } from "./helpers.js";

/** GRW-P4-C corporate programme contract additions (additive, unreleased 1.14.0 set). */
describe("corporate programme contracts", () => {
  const EVENTS = ["CorporateAccountCreated", "CorporateCodeRedeemed", "CorporateLeadReferred"];
  it.each(EVENTS)("%s is registered, validates, and carries no person", (t) => {
    expect(isEventType(t)).toBe(true);
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t, ex).valid).toBe(true);
    expect(Object.keys(ex.data).join(" ")).not.toMatch(/\bname\b|phone|email|\bsub\b|patient|national|booking|provider|specialty|diagnos/i);
  });
  it("the lead event comes from the Clinic and the two account events stay Kiorex-internal", () => {
    expect(readJson("events/CorporateLeadReferred.schema.json")["x-producer"]).toBe("kiorly-clinic");
    for (const t of ["CorporateAccountCreated", "CorporateCodeRedeemed"]) expect(readJson(`events/${t}.schema.json`)["x-producer"]).toBe("kiorex");
  });
  it("the lead event refuses a contact name, phone or e-mail field shape beyond the opaque reference", () => {
    const ex = readJson("events/examples/CorporateLeadReferred.example.json");
    expect(validateEvent("CorporateLeadReferred", { ...ex, data: { ...ex.data, companyName: "x" } }).valid).toBe(false);
    expect(Object.keys(ex.data)).toContain("contactRef");
  });
  it("growth.corporate is launch-locked, market scoped, OFF-safe and documents whenOff", () => {
    const f = FLAG_CATALOGUE.find((x) => x.key === "growth.corporate")!;
    expect(f).toMatchObject({ launchLocked: true, class: "Launch-locked", product: "kiorex" });
    expect(f.whenOff.length).toBeGreaterThan(20);
    expect(f.scopes).toContain("market");
  });
  it("CORPORATE_POLICY validates, rejects unknown keys, and cannot lower the aggregate floor below 10", () => {
    expect(GROWTH_CONFIG_KINDS).toContain("CORPORATE_POLICY");
    expect(validateGrowthConfig("CORPORATE_POLICY", { enabled: true, eligibility: { openCode: true, domainEmail: false, hrList: true }, fundingMode: "SPONSOR_CREDIT", minAggregateK: 10, codeFormat: { length: 10, groupSize: 5 }, hrList: { matchWindowDays: 30, maxRows: 5000 } }).valid).toBe(true);
    for (const bad of [{ minAggregateK: 9 }, { fundingMode: "WALLET" }, { surprise: 1 }, { codeFormat: { length: 4 } }, { hrList: { matchWindowDays: 0 } }]) expect(validateGrowthConfig("CORPORATE_POLICY", bad).valid, JSON.stringify(bad)).toBe(false);
    expect(CORPORATE_MIN_K).toBe(10);
  });
  it("the corporate benefit ledger has no wallet verbs: no top-up, transfer, cash-out or balance entry", () => {
    expect([...CORPORATE_BENEFIT_ENTRY_TYPES]).toEqual(["RESERVE", "REDEEM", "RELEASE", "REVERSE"]);
  });
});
