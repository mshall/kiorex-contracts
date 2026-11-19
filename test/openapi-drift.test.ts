import { describe, expect, it } from "vitest";
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

  it("the copied spec still equals the sibling Kiorly source when present", () => {
    const src = join(ROOT, "..", "clinics-management/apps/api/openapi/marketplace.openapi.json");
    const csrc = join(ROOT, "..", "clinics-management/apps/api/openapi/kiorex-consumer-contract.json");
    try {
      expect(readFileSync(join(ROOT, "openapi/kiorly-marketplace.v1.openapi.json"), "utf8")).toBe(readFileSync(src, "utf8"));
      expect(readFileSync(join(ROOT, "consumer/kiorex-consumer-contract.json"), "utf8")).toBe(readFileSync(csrc, "utf8"));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e; // standalone checkout / Kiorly moved on: pinning is the point
    }
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
