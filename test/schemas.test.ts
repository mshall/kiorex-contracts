import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { EVENT_META, EVENT_SCHEMAS, isEventType, validateEnvelope, validateEvent, type EventType } from "../src/index.js";
import { listDir, readJson } from "./helpers.js";

const KX09_EVENTS = [
  "APPOINTMENT_CONFIRMED", "APPOINTMENT_RESCHEDULED", "CANCELLED_BY_CLINIC", "CANCELLED_BY_PATIENT", "CHECKED_IN",
  "CHECK_IN_REVERTED", "COMPLETED", "NO_SHOW", "SLOTS_CHANGED", "PROVIDER_PROFILE_UPDATED", "LISTING_STATUS_CHANGED",
  "COMMISSION_CHARGE_CREATED", "COMMISSION_CHARGE_REVERSED", "REVIEW_INVITATION_ELIGIBLE", "REVIEW_REPLY_POSTED",
  "PrescriptionIssued", "OrderReady", "DispenseCompleted", "OrderRejected", "LabResultReleased",
  "subject.deleted", "session.revoked", "flag.changed",
];

const LAB_DRAFT_EVENTS = ["LabOrderCreated", "LabOrderStatusChanged", "LabCriticalEscalated", "LabReportCorrected", "LabInvoiceIssued", "LabPaymentRecorded"];
const schemaFiles = listDir("events").filter((f) => f.endsWith(".schema.json"));

describe("event schemas", () => {
  it("compile under JSON Schema 2020-12 (strict) with formats", () => {
    const ajv = new (Ajv2020 as any).default({ strict: true, allErrors: true });
    ajv.addKeyword("x-producer");
    ajv.addKeyword("x-status");
    (addFormats as any).default(ajv);
    for (const f of schemaFiles) ajv.addSchema(readJson(`events/${f}`));
    for (const f of schemaFiles) expect(() => ajv.getSchema(readJson(`events/${f}`).$id), f).not.toThrow();
    for (const f of schemaFiles) expect(ajv.getSchema(readJson(`events/${f}`).$id), f).toBeTruthy();
  });

  it("declares draft 2020-12 and a stable $id on every schema", () => {
    for (const f of schemaFiles) {
      const s = readJson(`events/${f}`);
      expect(s.$schema).toBe("https://json-schema.org/draft/2020-12/schema");
      expect(s.$id).toBe(`https://contracts.kiorex.com/events/${f}`);
    }
  });

  it("has a schema file for every KX-09 §04 event (+ envelope)", () => {
    expect(schemaFiles).toContain("envelope.schema.json");
    for (const t of KX09_EVENTS) expect(schemaFiles, t).toContain(`${t}.schema.json`);
  });

  it("committed schema files equal the in-package schemas (run `npm run generate` if this fails)", () => {
    for (const [type, schema] of Object.entries(EVENT_SCHEMAS)) {
      const file = EVENT_META[type as EventType].schemaFile;
      expect(readJson(`events/${file}`), file).toEqual(schema);
    }
  });
});

describe("event examples", () => {
  it("every schema has an example and every example validates", () => {
    for (const f of schemaFiles.filter((x) => x !== "envelope.schema.json")) {
      const name = f.replace(".schema.json", "");
      const example = readJson(`events/examples/${name}.example.json`);
      const r = validateEnvelope(example);
      expect(r.valid ? [] : r.errors, name).toEqual([]);
    }
  });

  it("every KX-09 event type validates through validateEvent, including the RESCHEDULED alias", () => {
    for (const t of KX09_EVENTS) {
      const ex = readJson(`events/examples/${t}.example.json`);
      const r = validateEvent(t, ex);
      expect(r.valid, t).toBe(true);
      expect(isEventType(t)).toBe(true);
    }
    const resched = readJson("events/examples/APPOINTMENT_RESCHEDULED.example.json");
    expect(resched.type).toBe("RESCHEDULED"); // Kiorly's actual type string
    expect(validateEvent("RESCHEDULED", resched).valid).toBe(true);
    expect(validateEvent("APPOINTMENT_RESCHEDULED", { ...resched, type: "APPOINTMENT_RESCHEDULED" }).valid).toBe(true);
  });

  it("rejects malformed events", () => {
    const ok = readJson("events/examples/APPOINTMENT_CONFIRMED.example.json");
    expect(validateEvent("APPOINTMENT_CONFIRMED", { ...ok, eventId: undefined }).valid).toBe(false);
    expect(validateEvent("APPOINTMENT_CONFIRMED", { ...ok, data: { ...ok.data, nextStatus: "COMPLETED" } }).valid).toBe(false);
    expect(validateEvent("APPOINTMENT_CONFIRMED", { ...ok, occurredAt: "yesterday" }).valid).toBe(false);
    expect(validateEvent("APPOINTMENT_CONFIRMED", { ...ok, type: "COMPLETED" }).valid).toBe(false);
    expect(validateEvent("NOPE", ok).valid).toBe(false);
  });

  it("tolerates additive fields (forward compatible)", () => {
    const ok = readJson("events/examples/CHECKED_IN.example.json");
    expect(validateEvent("CHECKED_IN", { ...ok, newTopLevel: 1, data: { ...ok.data, extra: "x" } }).valid).toBe(true);
  });

  it("encodes event-specific guarantees", () => {
    const rev = readJson("events/examples/CHECK_IN_REVERTED.example.json");
    expect(validateEvent("CHECK_IN_REVERTED", { ...rev, data: { ...rev.data, nextStatus: "COMPLETED" } }).valid).toBe(false);
    const lab = readJson("events/examples/LabResultReleased.example.json");
    expect(validateEvent("LabResultReleased", { ...lab, data: { ...lab.data, values: [{ k: 1 }] } }).valid).toBe(false);
    const ready = readJson("events/examples/OrderReady.example.json");
    const { pharmacistSignoff: _p, ...noSign } = ready.data;
    void _p;
    expect(validateEvent("OrderReady", { ...ready, data: noSign }).valid).toBe(false);
    const rx = readJson("events/examples/PrescriptionIssued.example.json");
    const { consentToken: _c, ...noConsent } = rx.data;
    void _c;
    expect(validateEvent("PrescriptionIssued", { ...rx, data: noConsent }).valid).toBe(false);
  });
});

describe("Kiorly Lab draft events (NH-LB-025)", () => {
  it.each(LAB_DRAFT_EVENTS)("%s is a v2-draft kiorly-lab event whose example validates", (t) => {
    expect(isEventType(t)).toBe(true);
    expect(EVENT_META[t as EventType]).toMatchObject({ producer: "kiorly-lab", status: "v2-draft" });
    const ex = readJson(`events/examples/${t}.example.json`);
    expect(validateEvent(t as EventType, ex).valid).toBe(true);
  });
  it("critical/report events never carry result values", () => {
    for (const t of ["LabCriticalEscalated", "LabReportCorrected"]) {
      const ex = readJson(`events/examples/${t}.example.json`);
      expect(validateEvent(t as EventType, { ...ex, data: { ...ex.data, values: [1] } }).valid).toBe(false);
    }
  });
});
