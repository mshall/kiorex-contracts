import { describe, expect, it } from "vitest";
import { FLAG_CATALOGUE, GROWTH_CONFIG_KINDS, LOYALTY_ENTRY_TYPES, isEventType, validateEvent, validateGrowthConfig } from "../src/index.js";
import { readJson } from "./helpers.js";

/** GRW-P4-D loyalty and partnership contract additions (additive, unreleased). */
describe("loyalty and partnership contracts", () => {
  const EVENTS = ["LoyaltyPointsAccrued", "LoyaltyPointsConverted", "PartnershipCodeRedeemed"];
  it.each(EVENTS)("%s is registered, validates, is Kiorex internal and carries no person", (t) => {
    expect(isEventType(t)).toBe(true);
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t, ex).valid).toBe(true);
    expect(readJson(`events/${t}.schema.json`)["x-producer"]).toBe("kiorex");
    expect(Object.keys(ex.data).join(" ")).not.toMatch(/\bname\b|phone|email|\bsub\b|patient|national|booking|provider|specialty|diagnos|code\b/i);
  });
  it("growth.loyalty is launch-locked, market scoped, documents whenOff and depends on rewards", () => {
    const f = FLAG_CATALOGUE.find((x) => x.key === "growth.loyalty")!;
    expect(f).toMatchObject({ launchLocked: true, class: "Launch-locked", product: "kiorex" });
    expect(f.whenOff.length).toBeGreaterThan(20); expect(f.scopes).toContain("market"); expect(f.dependsOn).toContain("growth.rewards"); expect(f.gate).toContain("NEEDS_HUMAN");
  });
  it("LOYALTY_RULES validates, rejects unknown keys and wallet-like keys, and bounds every number", () => {
    expect(GROWTH_CONFIG_KINDS).toContain("LOYALTY_RULES");
    const ok = { enabled: true, pointsPerCompletedBooking: 0, windowMonths: 12, expiryMonths: 12, annualCapPoints: 0, tiers: { SILVER: { minCompletedBookings: 0, bonusPoints: 0 }, GOLD: {}, PLATINUM: {} }, conversion: { pointsRequired: 0, valueMinor: 0, maxBlocksPerYear: 0 } };
    expect(validateGrowthConfig("LOYALTY_RULES", ok).valid).toBe(true);
    for (const bad of [{ surprise: 1 }, { cashOut: true }, { topUp: 1 }, { transfer: true }, { windowMonths: 0 }, { expiryMonths: 37 }, { pointsPerCompletedBooking: -1 }, { tiers: { DIAMOND: {} } }, { tiers: { GOLD: { minCompletedBookings: 1001 } } }, { tiers: { GOLD: { cash: 1 } } }, { conversion: { cashValue: 1 } }, { conversion: { valueMinor: 1.5 } }]) expect(validateGrowthConfig("LOYALTY_RULES", bad).valid, JSON.stringify(bad)).toBe(false);
  });
  it("the points ledger has no wallet verbs", () => { expect([...LOYALTY_ENTRY_TYPES]).toEqual(["ACCRUE", "EXPIRE", "REVERSE", "TIER_BONUS", "CONVERT"]); });
});
