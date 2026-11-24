import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { CHECKOUT_LINE_CODES, FLAG_CATALOGUE, GROWTH_CONFIG_KINDS, GOODWILL_REASONS, PROMOTION_RESERVE_REJECTIONS, REFUND_DESTINATIONS, REWARD_ISSUE_ON, REWARD_KINDS_V2, isEventType, refundDestinationOf, validateEvent, validateGrowthConfig } from "../src/index.js";
import { readJson } from "./helpers.js";

const vec = readJson("fixtures/credit-ledger-vectors.json");
const market = readJson("openapi/kiorly-marketplace.v1.openapi.json");
const growth = readJson("openapi/kiorex-growth.v1.openapi.json");

describe("1.12.0 Rev 2.6 amendment: patient credit, provider credit and sponsored promotions", () => {
  const NEW = ["RefundDestinationChosen", "RewardRestored", "GoodwillGranted", "ProviderCreditGranted", "ProviderCreditConsumed", "ProviderCreditExpired", "PROVIDER_PROMOTION_UPDATED", "PromotionReviewDecided", "SponsoredDiscountReserved", "SponsoredDiscountDebited", "SponsoredDiscountReleased", "SponsoredDiscountReversed"];
  it.each(NEW)("%s is registered with an example that validates and carries no identity", (t) => {
    expect(isEventType(t)).toBe(true);
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t, ex).valid).toBe(true);
    expect(Object.keys(ex.data).join(" ")).not.toMatch(/name|phone|email|\bsub\b|patientId|nationalId/i);
  });
  it("patient credit events are Kiorex-produced and provider credit events Clinic-produced: the two systems never share an event", () => {
    for (const t of ["RefundDestinationChosen", "RewardRestored", "GoodwillGranted"]) expect(readJson(`events/${t}.schema.json`)["x-producer"]).toBe("kiorex");
    for (const t of ["ProviderCreditGranted", "ProviderCreditConsumed", "ProviderCreditExpired", "SponsoredDiscountDebited"]) expect(readJson(`events/${t}.schema.json`)["x-producer"]).toBe("kiorly-clinic");
    expect(JSON.stringify(readJson("events/examples/ProviderCreditGranted.example.json"))).not.toMatch(/RewardLot|patient/i);
  });
  it("the refund destination defaults to ORIGINAL and can never become CREDIT by accident", () => {
    expect(REFUND_DESTINATIONS).toEqual(["ORIGINAL", "CREDIT"]);
    for (const v of [undefined, null, "", "original", "credit", "CASH", 1, {}]) expect(refundDestinationOf(v)).toBe("ORIGINAL");
    expect(refundDestinationOf("CREDIT")).toBe("CREDIT");
    const chosen = readJson("events/examples/RefundDestinationChosen.example.json") as { data: Record<string, unknown> };
    expect(validateEvent("RefundDestinationChosen", { ...chosen, data: { ...chosen.data, choice: "CASH" } }).valid).toBe(false);
  });
  it("COMMISSION_CHARGE_CREATED gains the optional fee-basis fields; an old payload stays valid", () => {
    const ex = readJson("events/examples/COMMISSION_CHARGE_CREATED.example.json");
    expect(validateEvent("COMMISSION_CHARGE_CREATED", ex).valid).toBe(true);
    expect(validateEvent("COMMISSION_CHARGE_CREATED", { ...ex, data: { ...ex.data, feeBasisMinor: 4000, sponsoredDiscountMinor: 10000, basisPolicyVersion: "spp_1" } }).valid).toBe(true);
    expect(validateEvent("COMMISSION_CHARGE_CREATED", { ...ex, data: { ...ex.data, feeBasisMinor: -1 } }).valid).toBe(false);
  });
  it("marketplace: reserve and release commands, the optional sponsoredDiscount block and the optional tender; none is required", () => {
    expect(market.paths["/promotions/{promotionId}/reserve"].post.operationId).toBe("marketplaceReservePromotion");
    expect(market.paths["/promotions/{promotionId}/release"].post.operationId).toBe("marketplaceReleasePromotion");
    const booking = market.paths["/bookings"].post.requestBody.content["application/json"].schema;
    expect(booking.properties.sponsoredDiscount.$ref).toContain("SponsoredDiscountBlock");
    expect(booking.required ?? []).not.toContain("sponsoredDiscount");
    for (const p of ["/deposit-links/{token}/paid", "/bookings/{externalRef}/deposit-paid"]) { const s = market.paths[p].post.requestBody.content["application/json"].schema; expect(s.properties.tender.$ref).toContain("Tender"); expect(s.required ?? []).not.toContain("tender"); }
    const ajv = new Ajv2020({ strict: false }); addFormats(ajv);
    const reserve = ajv.compile(market.components.schemas.PromotionReserveRequest);
    expect(reserve({ version: 2, bookingRef: "kx_bk_1", patientRef: "ref_abc", careType: "IN_CLINIC", amountMinor: 10000, currency: "EGP", idempotencyKey: "reserve-0001" })).toBe(true);
    expect(reserve({ version: 2, bookingRef: "kx_bk_1", patientRef: "ref_abc", careType: "IN_CLINIC", amountMinor: 0, currency: "EGP", idempotencyKey: "reserve-0001" })).toBe(false);
    expect(reserve({ version: 2, bookingRef: "kx_bk_1", patientRef: "ref_abc", sub: "usr_1", careType: "IN_CLINIC", amountMinor: 1, currency: "EGP", idempotencyKey: "reserve-0001" })).toBe(false); // no extra key: the patient sub can never ride along
    expect(Object.keys(market.components.schemas.PromotionReserveRequest.properties).join(" ")).not.toMatch(/\bsub\b|phone|name|email/i);
    expect(market.components.schemas.PromotionReserveRefusal.properties.code.enum).toEqual([...PROMOTION_RESERVE_REJECTIONS]);
    expect(JSON.stringify(market).toLowerCase()).not.toMatch(/rewardlot|refunddestination|relationshipref|"sub"/);
  });
  it("growth OpenAPI: credit, household, quote and refund preview exist, behind the patient session, with unique operationIds", () => {
    for (const p of ["/growth/v1/credit", "/growth/v1/credit/household", "/growth/v1/rewards/quote", "/pay/v1/refunds/preview"]) expect(growth.paths[p], p).toBeTruthy();
    const ids = Object.values<any>(growth.paths).flatMap((p) => Object.values<any>(p).filter((o) => o && o.operationId).map((o) => o.operationId));
    expect(new Set(ids).size).toBe(ids.length);
    expect(growth.components.schemas.RefundDestination.enum).toEqual(["ORIGINAL", "CREDIT"]);
    expect(growth.components.schemas.CheckoutLine.properties.code.enum).toEqual([...CHECKOUT_LINE_CODES]);
    const preview = growth.components.schemas.RefundPreview;
    expect(preview.required).toContain("options");
  });
  it("flags: five new locked patient and promotion flags with a gate, two clinic flags that are not locked", () => {
    const by = (k: string) => FLAG_CATALOGUE.find((f) => f.key === k)!;
    for (const k of ["growth.patient_credit", "growth.refund_as_credit", "growth.family_credit", "growth.support_goodwill", "growth.sponsored_promotions"]) { expect(by(k), k).toMatchObject({ launchLocked: true, class: "Launch-locked" }); expect(by(k).gate).toBeTruthy(); expect(by(k).whenOff.length).toBeGreaterThan(20); }
    expect(by("growth.refund_as_credit").dependsOn).toEqual(["growth.patient_credit"]);
    expect(by("growth.family_credit").dependsOn).toEqual(["growth.patient_credit"]);
    for (const k of ["clinic.provider_credit_v2", "clinic.usage_bundles"]) { expect(by(k)).toMatchObject({ launchLocked: false, product: "kiorly-clinic" }); expect(by(k).scopes).toContain("org"); }
  });
  it("REWARD_RULES keeps the work-package field names and carries the optional credit block; SPONSORED_PROMOTION_POLICY validates", () => {
    expect(GROWTH_CONFIG_KINDS).toContain("SPONSORED_PROMOTION_POLICY");
    const rules = { mode: "COUPON", currency: "EGP", amounts: { referrerMinor: 0, refereeMinor: 0, repeatMinor: 0, promoMinor: 0 }, expiryMonths: 12, perUserAnnualCapMinor: 0, perCampaignCapMinor: 0, ruleBudgetCeilingMinor: 0, redemptionMaxBp: 10000, minPayableMinor: 0, postToPayLedger: false };
    expect(validateGrowthConfig("REWARD_RULES", rules).valid).toBe(true);
    const credit = { maxOpenBalanceMinor: 200000, refundAsCredit: { enabled: false, refundCreditExpiryMonths: 12, refundCreditOnExpiry: "REFUND_TO_ORIGINAL", restoredLotMinDays: 90 }, family: { enabled: false }, goodwill: { reasons: [...GOODWILL_REASONS], perAgentDailyCapMinor: 50000, perPatient90dCapMinor: 20000, perReasonMaxMinor: 10000, approvalAboveMinor: 5000 }, campaignScope: { serviceKinds: ["IN_CLINIC"], specialtyAllowlist: [] } };
    expect(validateGrowthConfig("REWARD_RULES", { ...rules, credit, issueOn: ["COMPLETED_VISIT"], reversalWindowDays: 30, holdMaxDays: 14, manualApprovalAboveMinor: 20000 }).valid).toBe(true);
    for (const bad of [{ issueOn: ["SIGNUP"] }, { issueOn: ["BOOKING_CREATED"] }, { credit: { ...credit, refundAsCredit: { ...credit.refundAsCredit, refundCreditOnExpiry: "KEEP" } } }, { credit: { ...credit, goodwill: { ...credit.goodwill, reasons: ["BECAUSE"] } } }, { redemptionMaxBp: 10001 }])
      expect(validateGrowthConfig("REWARD_RULES", { ...rules, ...bad }).valid).toBe(false);
    expect([...REWARD_ISSUE_ON]).toEqual(["COMPLETED_VISIT", "COMPLETED_NTH_VISIT", "SUPPORT_APPROVED", "REFUND_CHOICE"]);
    expect(REWARD_KINDS_V2).toEqual(expect.arrayContaining(["WELCOME", "GOODWILL", "CAMPAIGN", "REFUND_CREDIT", "RESTORED", "REFERRER"]));
    const pol = { commissionBasis: "GROSS_BEFORE_SPONSORED", highValueBudgetMinor: 5000000, highValuePerBookingMinor: 50000, maxDiscountBp: 3000, allowedCareTypes: ["IN_CLINIC"], defaultFundingMode: "WALLET_THEN_INVOICE", postToPayLedger: false, reservationTtlGraceMinutes: 15, reviewRequired: true };
    expect(validateGrowthConfig("SPONSORED_PROMOTION_POLICY", pol).valid).toBe(true);
    for (const bad of [{ commissionBasis: "WHATEVER" }, { maxDiscountBp: 0 }, { allowedCareTypes: [] }, { surprise: 1 }]) expect(validateGrowthConfig("SPONSORED_PROMOTION_POLICY", { ...pol, ...bad }).valid).toBe(false);
  });
});

/** The vectors are data. This reference arithmetic only proves the file is internally consistent; KP and CM prove their own code against the stored numbers. */
describe("fixtures/credit-ledger-vectors.json", () => {
  const round = Math.round;
  it("refund allocation vectors satisfy the RC-4 invariant and the sponsored share is voided, never paid out", () => {
    expect(vec.refundAllocation.length).toBeGreaterThanOrEqual(12);
    for (const v of vec.refundAllocation) {
      const e = v.expected; const r = v.refundableMinor / v.priceMinor;
      expect(e.creditRestoredMinor + e.cardRefundMinor, v.name).toBe(e.patientPaidRefundableMinor);
      expect(e.patientPaidRefundableMinor, v.name).toBe(round(r * (v.creditMinor + v.cardMinor + v.heldDepositMinor)));
      expect(e.creditRestoredMinor, v.name).toBe(Math.min(v.creditMinor, round(r * v.creditMinor)));
      expect(e.sponsoredVoidedMinor, v.name).toBe(round(r * v.sponsoredMinor));
      expect(e.cardRefundMinor, v.name).toBeGreaterThanOrEqual(0);
      expect(v.priceMinor - v.sponsoredMinor, v.name).toBe(v.creditMinor + v.cardMinor + v.heldDepositMinor);
    }
    const doc = vec.refundAllocation[0].expected;
    expect(doc).toEqual({ patientPaidRefundableMinor: 40000, creditRestoredMinor: 15000, cardRefundMinor: 25000, sponsoredVoidedMinor: 10000 }); // D 500, S 100, C 150, K 250
    expect(vec.refundAllocation[1].expected).toEqual({ patientPaidRefundableMinor: 16000, creditRestoredMinor: 6000, cardRefundMinor: 10000, sponsoredVoidedMinor: 4000 }); // the 40 percent example
  });
  it("FIFO vectors: scoped first, then first expiring, then lot id; expired lots skipped; over-consumption refused", () => {
    const consume = (lots: any[], amount: number, now?: string) => {
      const live = lots.filter((l) => !now || Date.parse(l.expiresAt) > Date.parse(now)).sort((a, b) => Number(!!b.scoped) - Number(!!a.scoped) || Date.parse(a.expiresAt) - Date.parse(b.expiresAt) || (a.id < b.id ? -1 : 1));
      if (live.reduce((s, l) => s + l.remainingMinor, 0) < amount) return null;
      const out: Array<{ lotId: string; minor: number }> = []; let left = amount;
      for (const l of live) { if (!left) break; const t = Math.min(l.remainingMinor, left); out.push({ lotId: l.id, minor: t }); left -= t; }
      return out;
    };
    for (const v of vec.fifo) expect(consume(v.lots, v.consumeMinor, v.now), v.name).toEqual(v.expected);
  });
  it("expiry and reversal vectors", () => {
    for (const v of vec.expiry) { const expired = Date.parse(v.at) >= Date.parse(v.expiresAt); const open = v.issuedMinor - v.redeemedMinor - (v.reservedMinor ?? 0); expect(expired ? open : 0, v.name).toBe(v.expireMinor); }
    for (const v of vec.reversal) { expect(v.issuedMinor - v.redeemedMinor, v.name).toBe(v.reverseMinor); expect(v.redeemedMinor, v.name).toBe(v.recoverableLossMinor); }
  });
});
