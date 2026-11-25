import { describe, expect, it } from "vitest";
import {
  COMMISSION_COLLECTION_MODES, COMMISSION_RATE_NOT_SET, COMMISSION_RATE_PRODUCTS, EVENT_EXAMPLES, EVENT_META, commissionAmountMinor, effectiveCommissionRate, isEventType, validateEvent,
  type CommissionRateHistoryRow, type CommissionRateSpec,
} from "../src/index.js";
import { readJson } from "./helpers.js";

const vectors = readJson("fixtures/commission-v1.13/rate-vectors.json");

describe("COM-2 commission rates (additive in 1.13.0)", () => {
  it("COMMISSION_CHARGE_STATUS_CHANGED is an emitted Clinic event whose example validates; the three charge events accept the COM-1 fields", () => {
    expect(isEventType("COMMISSION_CHARGE_STATUS_CHANGED")).toBe(true);
    expect(EVENT_META.COMMISSION_CHARGE_STATUS_CHANGED).toMatchObject({ producer: "kiorly-clinic", status: "emitted", aggregateType: "Appointment" });
    expect(validateEvent("COMMISSION_CHARGE_STATUS_CHANGED", EVENT_EXAMPLES.COMMISSION_CHARGE_STATUS_CHANGED as never).valid).toBe(true);
    // what the Clinic sends today validates against all three
    const payload = { ...(EVENT_EXAMPLES.COMMISSION_CHARGE_STATUS_CHANGED as any), type: "COMMISSION_CHARGE_CREATED" };
    expect(validateEvent("COMMISSION_CHARGE_CREATED", payload).valid).toBe(true);
    expect(validateEvent("COMMISSION_CHARGE_REVERSED", { ...payload, type: "COMMISSION_CHARGE_REVERSED", data: { ...payload.data, status: "REVERSED", reason: "check_in_reverted" } }).valid).toBe(true);
  });
  it("the new fields are optional: the 1.12.0 example of CREATED still validates and nothing became required", () => {
    const e = readJson("events/COMMISSION_CHARGE_CREATED.schema.json");
    expect(e.properties.data.required).toEqual(["chargeId", "appointmentId", "amount", "currency", "status", "attendedAt"]);
    expect(validateEvent("COMMISSION_CHARGE_CREATED", EVENT_EXAMPLES.COMMISSION_CHARGE_CREATED as never).valid).toBe(true);
    expect(validateEvent("COMMISSION_CHARGE_STATUS_CHANGED", { ...(EVENT_EXAMPLES.COMMISSION_CHARGE_STATUS_CHANGED as any), data: { ...(EVENT_EXAMPLES.COMMISSION_CHARGE_STATUS_CHANGED as any).data, disputeStatus: "SOMETHING_ELSE" } }).valid).toBe(false);
  });
  it("vocabulary: three products, three collection modes", () => {
    expect([...COMMISSION_RATE_PRODUCTS]).toEqual(["CLINIC", "PHARMACY", "LAB"]);
    expect([...COMMISSION_COLLECTION_MODES]).toEqual(["NET_FROM_PAYOUT", "AUTO_CHARGE_SAVED_METHOD", "INVOICE_AND_COLLECT"]);
  });
  for (const v of vectors.effective) {
    it(`effective rate: ${v.name}`, () => {
      const r = effectiveCommissionRate(v.history as CommissionRateHistoryRow[], new Date(v.at));
      expect({ state: r.state, source: r.source, version: r.version }).toEqual(v.expected);
    });
  }
  for (const v of vectors.amount) {
    it(`amount: ${v.name}`, () => expect(commissionAmountMinor(v.basisMinor, v.spec as CommissionRateSpec)).toBe(v.expected));
  }
  it("nothing is shipped: no history is NOT_SET, never a default rate", () => {
    expect(effectiveCommissionRate([], new Date())).toEqual(COMMISSION_RATE_NOT_SET);
  });
  it("the three product specs document the same CommissionRateView and its route; the Clinic also documents COM-1's collection push; no actor identity is a property", () => {
    const paths: Record<string, string> = { "kiorly-marketplace": "/commission-rates", "kiorly-pharmacy": "/marketplace/v1/commission-rates", "kiorly-lab": "/integration/v1/commission-rates" };
    for (const [spec, path] of Object.entries(paths)) {
      const s = readJson(`openapi/${spec}.v1.openapi.json`);
      const op = s.paths[path]?.post;
      expect(op?.operationId, spec).toMatch(/RecordCommissionRate$/);
      expect(op.requestBody.content["application/json"].schema.$ref).toBe("#/components/schemas/CommissionRateView");
      const view = s.components.schemas.CommissionRateView;
      expect(view.required).toEqual(["orgRef", "product", "version", "history"]);
      const keys = JSON.stringify([view.properties, view.properties.history.items.properties]).match(/"([A-Za-z]+)":/g)!.join("");
      expect(keys).not.toMatch(/proposedBy|decidedBy|actor|decisionNote/);
      expect(view.properties.product.enum).toEqual(["CLINIC", "PHARMACY", "LAB"]);
    }
    expect(readJson("openapi/kiorly-marketplace.v1.openapi.json").paths["/commission-collections"].post.operationId).toBe("marketplaceRecordCommissionCollection");
  });
});
