import { describe, expect, it } from "vitest";
import Ajv from "ajv";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ROOT, listDir, readJson } from "./helpers.js";

const spec = readJson("openapi/kiorly-marketplace.v1.openapi.json");
const consumer = readJson("consumer/kiorex-consumer-contract.json");
const control = readJson("openapi/kiorex-control-plane.v1.openapi.json");
const hooks = readJson("openapi/kiorex-webhooks.v1.openapi.json");

describe("consumer contract vs Kiorly OpenAPI (drift)", () => {
  it("every required operation exists with the same method and operationId", () => {
    for (const op of consumer.requiredOperations) {
      const item = spec.paths[op.path];
      expect(item, `path ${op.path}`).toBeTruthy();
      expect(item[op.method], `${op.method} ${op.path}`).toBeTruthy();
      expect(item[op.method].operationId).toBe(op.operationId);
    }
  });

  it("slot query params are declared required and the booking channel enum matches", () => {
    const params = spec.paths["/clinics/{clinicId}/slots"].get.parameters as Array<{ name: string; required?: boolean }>;
    for (const name of consumer.slotQueryRequired) {
      expect(params.find((p) => p.name === name)?.required, name).toBe(true);
    }
    const channel = spec.paths["/bookings"].post.requestBody.content["application/json"].schema.properties.channel;
    expect(channel.enum).toEqual(expect.arrayContaining(consumer.bookingChannelEnum));
  });

  it("consumer basePath equals the Kiorly server base and auth headers are documented", () => {
    expect(spec.servers[0].url).toBe(consumer.basePath);
    expect(consumer.authHeaders).toEqual(["X-Kiorly-Client-Key", "X-Kiorly-Client-Secret", "X-Kiorly-Timestamp", "X-Kiorly-Nonce", "X-Kiorly-Signature"]);
  });

  it("operationIds are unique", () => {
    const ids: string[] = [];
    for (const item of Object.values<any>(spec.paths)) for (const op of Object.values<any>(item)) if (op?.operationId) ids.push(op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the pinned spec is an additive superset of the sibling Kiorly source when present (v1.2.0 adds Rev 2.3 fields Kiorly has not implemented yet)", () => {
    const src = join(ROOT, "..", "clinics-management/apps/api/openapi/marketplace.openapi.json");
    const csrc = join(ROOT, "..", "clinics-management/apps/api/openapi/kiorex-consumer-contract.json");
    try {
      const kiorly = JSON.parse(readFileSync(src, "utf8"));
      expect(supersetOf(spec, kiorly, "$", spec), "contracts spec must only ADD to the Kiorly spec (no removed/changed path, param, schema or enum value)").toEqual([]);
      expect(readFileSync(join(ROOT, "consumer/kiorex-consumer-contract.json"), "utf8")).toBe(readFileSync(csrc, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // standalone checkout / Kiorly moved on: pinning is the point
    }
  });
});

/**
 * Returns the paths where `base` has something `ext` lacks or changes (arrays: every base element must have a superset match in ext).
 * Info text/version and descriptions may change. Semantically equal spellings are accepted so a restyle is not reported as drift:
 * OpenAPI 3.0 `nullable: true` equals a type array that includes "null", and a local `$ref` in `ext` is resolved against `root`
 * (the Clinic copy inlines what the pinned spec shares through components).
 * Kiorex-to-Kiorly request bodies (sender side) may NARROW a loose string to an enum of strings: the sender promises less than the
 * receiver accepts, which can never break the receiver; widening, removing or retyping stays drift.
 */
function supersetOf(ext: any, base: any, at = "$", root: any = ext): string[] {
  if (at === "$.info") return [];
  if (ext && typeof ext === "object" && !Array.isArray(ext) && typeof ext.$ref === "string" && ext.$ref.startsWith("#/") && !(base && typeof base === "object" && "$ref" in base)) {
    let cur: any = root;
    for (const seg of ext.$ref.slice(2).split("/")) cur = cur?.[seg];
    if (cur) ext = cur;
  }
  if (Array.isArray(base)) {
    if (!Array.isArray(ext)) return [at];
    return base.flatMap((b, i) => (ext.some((e) => supersetOf(e, b, at, root).length === 0) ? [] : [`${at}[${i}]`]));
  }
  if (base && typeof base === "object") {
    if (!ext || typeof ext !== "object") return [at];
    const nb = normaliseNullable(base);
    const ne = normaliseNullable(ext);
    if (SENDER_NARROWING.test(at) && typeof nb.type === "string" && !nb.enum && Array.isArray(ne.enum) && ne.enum.every((v: unknown) => v === null || typeof v === nb.type)) {
      return Object.keys(nb).filter((k) => k !== "type" && k !== "nullable").flatMap((k) => supersetOf(ne[k], nb[k], `${at}.${k}`, root));
    }
    return Object.keys(nb).flatMap((k) => supersetOf(ne[k], nb[k], `${at}.${k}`, root));
  }
  if (/\.(description|summary)$/.test(at)) return []; // wording may be refined additively
  return ext === base ? [] : [at];
}

/** Request bodies Kiorex sends (and the Clinic receives): the sender may be stricter than the receiver's own copy. */
const SENDER_NARROWING = /^\$\.paths\.\/commission-(collections|rates)\.post\.requestBody\./;

function normaliseNullable(schema: any): any {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return schema;
  const out: any = { ...schema };
  if (out.nullable === true && typeof out.type === "string") out.type = [out.type, "null"];
  delete out.nullable;
  if (Array.isArray(out.type)) out.type = [...out.type].sort();
  return out;
}

describe("Rev 2.3 additions to the marketplace OpenAPI (KX-09 §03 v2.3, contracts 1.5.0)", () => {
  const op = (path: string, m: string) => spec.paths[path][m];
  const schemas = spec.components.schemas;

  it("providers sync documents profession, edition, serviceLocations[], coverageDistricts[], verification.register, assignsClinician", () => {
    expect(Object.keys(schemas.ProviderV23Fields.properties)).toEqual(["profession", "edition", "serviceLocations", "coverageDistricts", "verification", "assignsClinician", "modalities"]);
    expect(schemas.Profession.enum).toEqual(["PHYSICIAN", "DENTIST", "PHYSIOTHERAPIST", "NURSE"]);
    expect(schemas.Edition.enum).toEqual(["CLINIC", "NURSE"]);
    expect(schemas.ProviderV23Fields.required).toBeUndefined(); // additive: nothing new is required
    expect(schemas.ProviderVerification.properties.register).toBeTruthy();
  });

  it("slots take serviceLocation, district, lat, lng as OPTIONAL params; required params unchanged; 422 OUT_OF_COVERAGE", () => {
    const params = op("/clinics/{clinicId}/slots", "get").parameters as Array<{ name: string; required?: boolean }>;
    for (const n of ["serviceLocation", "district", "lat", "lng"]) expect(params.find((p) => p.name === n)?.required, n).toBe(false);
    expect(params.filter((p) => p.required).map((p) => p.name)).toEqual(["clinicId", "clinicianId", "typeId", "from", "to"]);
    expect(op("/clinics/{clinicId}/slots", "get").responses["422"]).toBeTruthy();
    expect(schemas.ServiceLocation.enum).toEqual(["IN_CLINIC", "HOME"]);
    expect(Object.keys(schemas.Slot.properties)).toEqual(expect.arrayContaining(["serviceLocation", "district"]));
  });

  it("holds carry optional visitAddress {district, line1, building, floor, flat, landmark, lat, lng}; 422 OUT_OF_COVERAGE on hold and booking", () => {
    expect(Object.keys(schemas.VisitAddress.properties)).toEqual(["district", "line1", "building", "floor", "flat", "landmark", "lat", "lng"]);
    expect(schemas.VisitAddress.required).toEqual(["district"]);
    expect(schemas.SlotHoldRequest.required).not.toContain("visitAddress");
    expect(schemas.SlotHoldRequest.properties.visitAddress.$ref).toBe("#/components/schemas/VisitAddress");
    expect(JSON.stringify(op("/holds", "post").responses["422"])).toContain("OutOfCoverageError");
    expect(JSON.stringify(op("/bookings", "post").responses["422"])).toContain("OutOfCoverageError");
    expect(schemas.OutOfCoverageError.properties.code.enum).toEqual(["OUT_OF_COVERAGE"]);
  });

  it("POST /care-plan-requests is draft, phase P3, idempotent on requestRef, 422 when the provider offers no care plans", () => {
    const o = op("/care-plan-requests", "post");
    expect(o.operationId).toBe("marketplaceCreateCarePlanRequest");
    expect(o["x-status"]).toBe("draft");
    expect(o["x-phase"]).toBe("P3");
    expect(schemas.CarePlanRequest.required).toContain("requestRef");
    expect(o.responses["422"].description).toContain("CARE_PLANS_NOT_OFFERED");
    expect(consumer.requiredOperations.some((r: any) => r.path === "/care-plan-requests")).toBe(false); // not a consumer-required op until P3 ships
  });

  it("fixtures/marketplace-v1.2-home-visit.json validates against the component schemas", () => {
    const fx = readJson("fixtures/marketplace-v1.2-home-visit.json");
    const ajv = new (Ajv as any).default({ strict: false, allErrors: true });
    (addFormats as any).default(ajv);
    for (const key of ["providerList", "slots", "holdRequest", "outOfCoverage422", "carePlanRequest"]) {
      const { schema, value } = fx[key];
      const validate = ajv.compile({ components: spec.components, $ref: `#/components/schemas/${schema}` });
      expect(validate(value), `${key}: ${JSON.stringify(validate.errors)}`).toBe(true);
    }
    const bad = ajv.compile({ components: spec.components, $ref: "#/components/schemas/VisitAddress" });
    expect(bad({ line1: "no district" })).toBe(false);
  });
});

describe("OpenAPI documents", () => {
  const all = listDir("openapi").map((f) => [f, readJson(`openapi/${f}`)] as const);

  it("are valid OpenAPI 3.x documents with unique operationIds and resolvable local $refs", () => {
    for (const [name, doc] of all) {
      expect(String(doc.openapi), name).toMatch(/^3\.(0|1)\./);
      expect(doc.info.version, name).toMatch(/^\d+\.\d+\.\d+$/);
      const text = JSON.stringify(doc);
      for (const m of text.matchAll(/"\$ref":"#\/([^"]+)"/g)) {
        let cur: any = doc;
        for (const seg of m[1]!.split("/")) cur = cur?.[seg];
        expect(cur, `${name}: ${m[0]}`).toBeTruthy();
      }
    }
  });

  it("control plane: snapshot endpoint, 304, ETag, HMAC headers", () => {
    const op = control.paths["/control/v1/flags/snapshot"].get;
    expect(op.responses["200"].headers.ETag).toBeTruthy();
    expect(op.responses["304"]).toBeTruthy();
    expect(op.parameters.map((p: any) => p.name ?? p.$ref)).toEqual(expect.arrayContaining(["product", "If-None-Match"]));
    const names = op.parameters.filter((p: any) => p.$ref).map((p: any) => control.components.parameters[p.$ref.split("/").pop()].name);
    expect(names).toEqual(expect.arrayContaining(["X-Kiorex-Product-Key", "X-Kiorly-Timestamp", "X-Kiorly-Nonce", "X-Kiorly-Signature"]));
    expect(op.parameters.find((p: any) => p.name === "product").schema.enum).toEqual(["kiorly-clinic", "kiorex", "kiorex-account", "kiorly-pharmacy", "kiorly-lab"]);
  });

  it("control plane: snapshot schema carries key, class, scopes, dependsOn, launchLocked, gateSatisfied, values, expiresAt", () => {
    const def = control.components.schemas.FlagDefinition;
    expect(Object.keys(def.properties)).toEqual(expect.arrayContaining(["key", "class", "scopes", "dependsOn", "launchLocked", "gateSatisfied", "values", "expiresAt"]));
    expect(Object.keys(control.components.schemas.FlagValues.properties)).toEqual(["global", "markets", "orgs"]);
    expect(control.components.schemas.FlagSnapshot.required).toEqual(expect.arrayContaining(["product", "version", "generatedAt", "flags", "signature"]));
    expect(control.paths["/feature-flags/kiorex/changed"].post).toBeTruthy();
  });

  it("control plane: universal FEATURE_DISABLED {key,scope} 403 schema", () => {
    const e = control.components.schemas.FeatureDisabledError;
    expect(e.required).toEqual(expect.arrayContaining(["code", "key", "scope"]));
    expect(e.properties.code.const).toBe("FEATURE_DISABLED");
    expect(e.properties.statusCode.const).toBe(403);
    expect(control.components.responses.FeatureDisabled).toBeTruthy();
  });

  it("webhooks: Kiorly receiver and PSP shape are present", () => {
    expect(hooks.paths["/webhooks/kiorly"].post.operationId).toBe("receiveKiorlyWebhook");
    expect(JSON.stringify(hooks.paths["/webhooks/kiorly"])).toContain("X-Kiorly-Event-Id");
    expect(hooks.paths["/webhooks/psp/{provider}"].post).toBeTruthy();
    expect(hooks.components.schemas.PspWebhook.required).toEqual(expect.arrayContaining(["pspEventId", "intentId", "amountMinor"]));
  });
});

describe("Kiorly Lab draft OpenAPI (NH-LB-025)", () => {
  const lab = readJson("openapi/kiorly-lab.v1.openapi.json");
  it("is marked draft and documents the inbound order endpoint with HMAC headers", () => {
    expect(lab["x-status"]).toBe("draft");
    const post = lab.paths["/integration/v1/orders"].post;
    expect(post.operationId).toBe("labCreateOrder");
    expect(post.parameters.map((p: any) => p.name)).toEqual(["X-Kiorly-Client-Key", "X-Kiorly-Timestamp", "X-Kiorly-Nonce", "X-Kiorly-Signature"]);
    expect(lab.components.schemas.InboundLabOrder.required).toEqual(["sourceRef", "patient"]);
  });
  it("operationIds are unique and every $ref resolves", () => {
    const ids: string[] = [];
    for (const item of Object.values<any>(lab.paths)) for (const op of Object.values<any>(item)) ids.push(op.operationId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of JSON.stringify(lab).matchAll(/#\/components\/schemas\/(\w+)/g)) expect(lab.components.schemas[m[1]], m[1]).toBeTruthy();
  });
});

describe("Nurse-edition ratified additions (1.6.0, KNLAB01 / KLORD05)", () => {
  const lab = readJson("openapi/kiorly-lab.v1.openapi.json");
  const order = lab.components.schemas.InboundLabOrder;
  it("relaxes the strict inbound order ONLY for nurseCollection, identifiersChecked and collection.districtId", () => {
    expect(order.additionalProperties).toBe(false);
    expect(order.required).toEqual(["sourceRef", "patient"]);
    expect(Object.keys(order.properties)).toEqual(expect.arrayContaining(["nurseCollection", "identifiersChecked"]));
    expect(order.properties.collection.additionalProperties).toBe(false);
    expect(order.properties.collection.properties.districtId).toBeTruthy();
    expect(lab.components.schemas.NurseCollection.additionalProperties).toBe(false);
    expect(lab.components.schemas.NurseCollection.required).toEqual(expect.arrayContaining(["collectedAt", "consentToken", "samples"]));
    expect(order.properties.identifiersChecked.minItems).toBe(2);
    expect(order.properties.consentChannels.items.enum).toContain("KIORLY_NURSE_IMPORT");
  });
  it("documents the KIORLY_NURSE client source and the custody read (no PHI: NURSE|LAB, no names)", () => {
    expect(lab["x-client-sources"]).toEqual(["KIOREX_BOOKING", "KIORLY_CLINIC", "KIORLY_NURSE"]);
    expect(lab.paths["/integration/v1/orders/{sourceRef}/custody"].get.operationId).toBe("labGetOrderCustody");
    const ev = lab.components.schemas.LabOrderCustody.properties.specimens.items.properties.custody.items.properties.by;
    expect(ev.enum).toEqual(["NURSE", "LAB"]);
  });
  it("marketplace spec carries the Kiorex -> Kiorly lab status push", () => {
    expect(spec.paths["/lab-orders/{orderId}/status"].post.operationId).toBe("marketplaceLabOrderStatus");
  });
});

describe("Kiorly Pharmacy draft OpenAPI + partner addressing (1.4.0)", () => {
  const ph = readJson("openapi/kiorly-pharmacy.v1.openapi.json");
  it("documents the order intent, Rx validation, quote and catalogue operations with HMAC headers", () => {
    const ids = Object.values<any>(ph.paths).flatMap((i) => Object.values<any>(i).map((o) => o.operationId));
    expect(ids).toEqual(expect.arrayContaining(["pharmacyListPharmacies", "pharmacyCatalogue", "pharmacyQuote", "pharmacyCreateOrder", "pharmacyValidatePrescription", "pharmacyCancelOrder"]));
    expect(new Set(ids).size).toBe(ids.length);
    const names = ph.paths["/marketplace/v1/orders"].post.parameters.map((p: any) => p.name);
    expect(names).toEqual(expect.arrayContaining(["X-Kiorly-Client-Key", "X-Kiorly-Timestamp", "X-Kiorly-Nonce", "X-Kiorly-Signature"]));
    expect(JSON.stringify(ph)).not.toContain("X-Kiorex-Org-Id\"");
    for (const m of JSON.stringify(ph).matchAll(/#\/components\/schemas\/(\w+)/g)) expect(ph.components.schemas[m[1]], m[1]).toBeTruthy();
  });
  it("lab has catalogue/quote/slots and Kiorex receives pharmacy + lab webhooks", () => {
    const lab = readJson("openapi/kiorly-lab.v1.openapi.json");
    for (const p of ["/integration/v1/tests", "/integration/v1/tests/quote", "/integration/v1/labs/{labId}/slots", "/integration/v1/labs"]) expect(lab.paths[p], p).toBeTruthy();
    expect(hooks.paths["/webhooks/pharmacy"].post.operationId).toBe("receivePharmacyWebhook");
    expect(hooks.paths["/webhooks/lab"].post.operationId).toBe("receiveLabWebhook");
  });
});
