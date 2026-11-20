import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { EVENT_EXAMPLES, EVENT_META, EVENT_SCHEMAS, isEventType, validateEnvelope, validateEvent, type EventType } from "../src/index.js";
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

describe("record-share aggregateType (1.4.1)", () => {
  it("accepts the canonical Encounter/Patient and the vault naming Record, still rejects anything else", () => {
    const ex = (t: string) => JSON.parse(JSON.stringify((EVENT_EXAMPLES as any)[t]));
    for (const t of ["VISIT_SUMMARY_SHARED", "PRESCRIPTION_SHARED", "RECORD_SHARE_REVOKED"]) {
      for (const agg of [ex(t).aggregateType, "Record"]) { const e = ex(t); e.aggregateType = agg; expect(validateEvent(t, e).valid, `${t} ${agg}`).toBe(true); }
      const bad = ex(t); bad.aggregateType = "Nope"; expect(validateEvent(t, bad).valid, t).toBe(false);
    }
  });
});

describe("Rev 2.3 events (KX-09 §04 v2.3, KX-05 §08, KX-23)", () => {
  const REV23 = ["HOME_VISIT_ASSIGNED", "HOME_VISIT_EN_ROUTE", "HOME_VISIT_ABORTED_UNSAFE", "SAFETY_ALERT_RAISED", "CARE_PLAN_CONFIRMED", "CARE_PLAN_ENDED", "ReferralIssued", "MedicationOrderShared"];
  const ex = (t: string) => JSON.parse(JSON.stringify(readJson(`events/examples/${t}.example.json`)));

  it.each(REV23)("%s: kiorly-clinic v2-draft event whose example and fixture validate", (t) => {
    expect(isEventType(t)).toBe(true);
    expect(EVENT_META[t as EventType]).toMatchObject({ producer: "kiorly-clinic", status: "v2-draft" });
    expect(validateEvent(t as EventType, ex(t)).valid).toBe(true);
    expect(readJson(`fixtures/events-v2.3/${t}.json`)).toEqual(ex(t));
  });

  it("no address, coordinate or phone number travels in home-visit / safety / care-plan events", () => {
    for (const t of ["HOME_VISIT_ASSIGNED", "HOME_VISIT_EN_ROUTE", "HOME_VISIT_ABORTED_UNSAFE", "SAFETY_ALERT_RAISED", "CARE_PLAN_CONFIRMED", "CARE_PLAN_ENDED"]) {
      for (const bad of [{ visitAddress: { district: "x" } }, { address: "1 Nile St" }, { lat: 30.1 }, { lng: 31.2 }, { phone: "+201000000000" }]) {
        const e = ex(t); e.data = { ...e.data, ...bad };
        expect(validateEvent(t as EventType, e).valid, `${t} ${Object.keys(bad)[0]}`).toBe(false);
      }
    }
    const a = ex("HOME_VISIT_ASSIGNED"); a.data.assignee.phone = "+201000000000";
    expect(validateEvent("HOME_VISIT_ASSIGNED", a).valid).toBe(false);
    expect(JSON.stringify(EVENT_EXAMPLES)).not.toMatch(/"(visitAddress|line1|latitude|longitude)"/);
  });

  it("HOME_VISIT_ASSIGNED needs name + photo/badge shape; EN_ROUTE ETA is optional and non-negative", () => {
    const a = ex("HOME_VISIT_ASSIGNED"); delete a.data.assignee.displayName;
    expect(validateEvent("HOME_VISIT_ASSIGNED", a).valid).toBe(false);
    const r = ex("HOME_VISIT_EN_ROUTE"); delete r.data.etaMinutes;
    expect(validateEvent("HOME_VISIT_EN_ROUTE", r).valid).toBe(true);
    r.data.etaMinutes = -1;
    expect(validateEvent("HOME_VISIT_EN_ROUTE", r).valid).toBe(false);
  });

  it("HOME_VISIT_ABORTED_UNSAFE is never a no-show and never auto-forfeits the deposit (BR61)", () => {
    for (const bad of [{ noShow: true }, { depositAction: "FORFEIT" }, { reason: "free text" }]) {
      const e = ex("HOME_VISIT_ABORTED_UNSAFE"); e.data = { ...e.data, ...bad };
      expect(validateEvent("HOME_VISIT_ABORTED_UNSAFE", e).valid, JSON.stringify(bad)).toBe(false);
    }
  });

  it("SAFETY_ALERT_RAISED: 60 s delivery, known kinds and recipients, no free text", () => {
    const e = ex("SAFETY_ALERT_RAISED");
    expect(e.data.deliverWithinSeconds).toBe(60);
    for (const bad of [{ deliverWithinSeconds: 600 }, { kind: "OTHER" }, { deliverTo: [] }, { deliverTo: ["PATIENT"] }, { message: "help at flat 4" }]) {
      expect(validateEvent("SAFETY_ALERT_RAISED", { ...e, data: { ...e.data, ...bad } }).valid, JSON.stringify(bad)).toBe(false);
    }
  });

  it("CARE_PLAN_* carry the schedule with appointment IDs only", () => {
    const c = ex("CARE_PLAN_CONFIRMED");
    expect(c.data.visits.every((v: any) => v.appointmentId)).toBe(true);
    expect(validateEvent("CARE_PLAN_CONFIRMED", { ...c, data: { ...c.data, visits: [] } }).valid).toBe(false);
    const n = ex("CARE_PLAN_ENDED");
    expect(validateEvent("CARE_PLAN_ENDED", { ...n, data: { ...n.data, reason: "because" } }).valid).toBe(false);
  });

  it("ReferralIssued and MedicationOrderShared require the consent token and carry no clinical content", () => {
    for (const [t, content] of [["ReferralIssued", { diagnosis: "x" }], ["MedicationOrderShared", { items: [{ drugName: "x" }] }]] as const) {
      const e = ex(t);
      const { consentToken: _c, ...rest } = e.data; void _c;
      expect(validateEvent(t, { ...e, data: rest }).valid, `${t} consentToken`).toBe(false);
      expect(validateEvent(t, { ...e, data: { ...e.data, ...content } }).valid, `${t} content`).toBe(false);
    }
    const m = ex("MedicationOrderShared"); delete m.data.expiresAt;
    expect(validateEvent("MedicationOrderShared", m).valid).toBe(false);
  });
});

describe("Nurse-collected lab hand-off (1.6.0, KNLAB01 / KLORD05)", () => {
  const fx = readJson("fixtures/nurse-lab-handoff-v1.6.json");
  it("the Nurse LabOrderPlaced example validates and the Clinic example is unchanged (all new fields optional)", () => {
    expect(validateEvent("LabOrderPlaced", fx).valid).toBe(true);
    const plain = readJson("events/examples/LabOrderPlaced.example.json");
    expect(validateEvent("LabOrderPlaced", plain).valid).toBe(true);
    expect(plain.data.nurseCollection).toBeUndefined();
  });
  it("refuses a malformed tube label, a missing sample and a single identifier", () => {
    const bad = (patch: any) => validateEvent("LabOrderPlaced", { ...fx, data: { ...fx.data, ...patch } }).valid;
    expect(bad({ nurseCollection: { ...fx.data.nurseCollection, samples: [{ label: "a b", specimenType: "BLOOD" }] } })).toBe(false);
    expect(bad({ nurseCollection: { ...fx.data.nurseCollection, samples: [] } })).toBe(false);
    expect(bad({ identifiersChecked: ["fullName"] })).toBe(false);
    expect(bad({ identifiersChecked: ["FULL_NAME", "DATE_OF_BIRTH"] })).toBe(false); // the vocabulary is the lab's (camelCase)
    expect(bad({ originEdition: "PHARMACY" })).toBe(false);
    const { consentToken: _c, ...noConsent } = fx.data;
    void _c;
    expect(validateEvent("LabOrderPlaced", { ...fx, data: noConsent }).valid).toBe(false);
  });
  it("Lab order events carry the optional originEdition NURSE while source stays KIORLY_CLINIC", () => {
    for (const t of ["LabOrderCreated", "LabOrderStatusChanged"] as const) {
      const ex = readJson(`events/examples/${t}.example.json`);
      expect(validateEvent(t, { ...ex, data: { ...ex.data, source: "KIORLY_CLINIC", originEdition: "NURSE" } }).valid).toBe(true);
      expect(validateEvent(t, { ...ex, data: { ...ex.data, source: "KIORLY_NURSE" } }).valid).toBe(false);
      expect(validateEvent(t, { ...ex, data: { ...ex.data, originEdition: "CLINIC" } }).valid).toBe(false);
    }
  });
});
