import { describe, expect, it } from "vitest";
import { CONTRACTS_VERSION } from "../src/index.js";
import { readJson } from "./helpers.js";

const pharmacy = readJson("openapi/kiorly-pharmacy.v1.openapi.json");
const lab = readJson("openapi/kiorly-lab.v1.openapi.json");

describe("1.8.0 partner contracts are additive (Arabic names, OUT_FOR_DELIVERY)", () => {
  it("version is at least 1.8.0 (minor bump)", () => { expect(CONTRACTS_VERSION).toMatch(/^1\.(8|9|10|11)\.\d+$/); });

  it("pharmacy CatalogueItem: nameAr/formAr/activeIngredient exist, are strings and are NOT required", () => {
    const s = pharmacy.components.schemas.CatalogueItem;
    for (const f of ["nameAr", "formAr", "activeIngredient"]) { expect(s.properties[f].type).toBe("string"); expect(s.required).not.toContain(f); }
    expect(s.required).toEqual(expect.arrayContaining(["pharmacyId", "sku", "name", "priceMinor", "rxRequired", "available"])); // nothing required was added or removed
  });

  it("pharmacy Quote items carry optional nameAr/formAr; the required set is unchanged", () => {
    const it = pharmacy.components.schemas.Quote.properties.items.items;
    expect(it.properties.nameAr.type).toBe("string");
    expect(it.required).toEqual(["sku", "qty", "unitPriceMinor", "rxRequired", "controlled", "available"]);
  });

  it("OrderResult.status keeps every 1.7.0 value and adds OUT_FOR_DELIVERY after READY", () => {
    const e: string[] = pharmacy.components.schemas.OrderResult.properties.status.enum;
    expect(e).toEqual(expect.arrayContaining(["RECEIVED", "ACCEPTED", "PARTIALLY_ACCEPTED", "READY", "DISPENSED", "REJECTED", "CANCELLED", "EXPIRED"]));
    expect(e[e.indexOf("READY") + 1]).toBe("OUT_FOR_DELIVERY");
  });

  it("lab tests and quote: Arabic fields optional, required sets unchanged", () => {
    const t = lab.components.schemas.TestList.properties.items.items;
    for (const f of ["nameAr", "preparationAr", "sampleTypeAr"]) { expect(t.properties[f].type).toBe("string"); expect(t.required).not.toContain(f); }
    expect(t.required).toEqual(["labId", "code", "name", "priceMinor"]);
    const q = lab.components.schemas.LabQuote.properties.tests.items;
    expect(q.properties.nameAr.type).toBe("string");
    expect(q.required).toEqual(["code", "name", "priceMinor"]);
  });
});
