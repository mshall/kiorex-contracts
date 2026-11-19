import { describe, expect, it } from "vitest";
import { FLAG_CATALOGUE, FLAG_KEYS, FLAGS, SAFETY_NEVER_FLAGS } from "../src/index.js";
import { readJson } from "./helpers.js";

const cat = readJson("flags/catalogue.json");
const safety = readJson("flags/safety-never-flags.json");

describe("flag catalogue (KX-08 §09)", () => {
  it("json files and generated TS constants agree", () => {
    expect(cat.flags.map((f: any) => f.key)).toEqual(FLAG_CATALOGUE.map((f) => f.key));
    expect(safety.items.map((i: any) => i.id)).toEqual(SAFETY_NEVER_FLAGS.map((i) => i.id));
    expect(Object.values(FLAGS)).toEqual([...FLAG_KEYS]);
  });

  it("has unique keys and well-formed entries", () => {
    const keys = cat.flags.map((f: any) => f.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const f of cat.flags) {
      expect(f.key).toMatch(/^[a-z0-9_.<>]+$/);
      expect(f.scopes.length).toBeGreaterThan(0);
      for (const s of f.scopes) expect(["global", "market", "org"]).toContain(s);
      expect(["Module", "Commercial", "Integration", "AI", "Launch-locked"]).toContain(f.class);
      expect(f.whenOff.length).toBeGreaterThan(5);
      expect(f.launchLocked).toBe(f.class === "Launch-locked");
      if (f.launchLocked) expect(f.gate, f.key).toBeTruthy();
      else expect(f.gate, f.key).toBeNull();
    }
  });

  it("covers every key in KX-08 §09", () => {
    const expected = [
      "clinic.kiorex_listing", "clinic.commission_settlement", "clinic.kiorly_pay_deposits", "whatsapp_reminders", "clinic.whatsapp_inbound",
      "instapay", "fawry", "card_payments", "ai_assistant", "clinic.ai_scribe", "clinic.whatsapp_ai_receptionist", "clinic.no_show_risk",
      "clinic.waitlist_autofill", "clinic.record_share_patient_app", "clinic.eprescription_handoff", "clinic.lab_order_handoff", "clinic.payers_tpa",
      "clinic.specialty_templates.<code>", "clinic.referral_rewards", "clinic.field_rep_onboarding", "kiorex.marketplace", "kiorex.pay_deposits",
      "kiorex.reviews", "kiorex.family_accounts", "kiorex.record_vault", "kiorex.whatsapp_booking", "kiorex.sponsored_listings",
      "kiorex.pharmacy_orders", "kiorex.lab_bookings", "kiorex.telemedicine", "kiorex.ai_navigation", "account.passkeys", "account.provider_sso",
      "pharmacy.module", "pharmacy.kiorex_orders", "pharmacy.forecasting", "pharmacy.insurer_claims", "lab.module", "lab.analyzer_interfaces",
      "lab.home_collection", "lab.kiorex_bookings", "market.<country>.live",
    ];
    expect(cat.flags.map((f: any) => f.key).sort()).toEqual(expected.sort());
  });

  it("every dependsOn refers to a catalogue key", () => {
    const keys = new Set(cat.flags.map((f: any) => f.key));
    for (const f of cat.flags) for (const d of f.dependsOn) expect(keys.has(d), `${f.key} -> ${d}`).toBe(true);
  });

  it("dependency graph is acyclic", () => {
    const byKey = new Map<string, string[]>(cat.flags.map((f: any) => [f.key, f.dependsOn]));
    const visit = (k: string, stack: string[]) => {
      expect(stack.includes(k), `cycle ${[...stack, k].join(" -> ")}`).toBe(false);
      for (const d of byKey.get(k) ?? []) visit(d, [...stack, k]);
    };
    for (const k of byKey.keys()) visit(k, []);
  });

  it("launch-locked set matches KX-08 §09", () => {
    const locked = cat.flags.filter((f: any) => f.launchLocked).map((f: any) => f.key).sort();
    expect(locked).toEqual([
      "clinic.specialty_templates.<code>", "clinic.whatsapp_ai_receptionist", "kiorex.ai_navigation", "kiorex.lab_bookings",
      "kiorex.pharmacy_orders", "kiorex.telemedicine", "market.<country>.live",
    ]);
  });
});

describe("ADR-025: safety controls are never flags", () => {
  it("lists the 12 fixed controls from KX-08 §09", () => {
    expect(safety.adr).toBe("ADR-025");
    expect(safety.items).toHaveLength(12);
  });

  it("no catalogue key (or whenOff text claiming to disable a safety control) matches a safety control", () => {
    for (const f of cat.flags) {
      const key = f.key.toLowerCase();
      for (const s of safety.items) {
        expect(key, `${f.key} must not equal safety id ${s.id}`).not.toBe(s.id);
        for (const token of s.forbiddenKeyTokens) expect(key.includes(token), `${f.key} contains safety token "${token}" (${s.id})`).toBe(false);
      }
    }
  });

  it("safety ids and catalogue keys are disjoint", () => {
    const keys = new Set(cat.flags.map((f: any) => f.key));
    for (const s of safety.items) expect(keys.has(s.id)).toBe(false);
  });
});
