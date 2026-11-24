import { describe, expect, it } from "vitest";
import { FLAG_CATALOGUE, FLAG_KEYS, FLAGS, SAFETY_NEVER_FLAGS } from "../src/index.js";
import { readJson } from "./helpers.js";

const cat = readJson("flags/catalogue.json");
const safety = readJson("flags/safety-never-flags.json");

const REV23_KEYS = [
  "clinic.profession.physiotherapy", "clinic.home_visits", "clinic.home_route_view", "clinic.home_dispatch",
  "nurse.edition", "nurse.individual_tenants", "nurse.care_plans", "nurse.mar", "nurse.private_duty_shifts", "nurse.family_updates",
  "nurse.individual_kiorex_listing", "kiorex.home_visits", "kiorex.category.physiotherapy", "kiorex.category.nursing", "kiorex.visit_tracking",
];

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
      // Rev 2.3 (KX-08 §10): 15 keys
      ...REV23_KEYS,
      // 1.10.0 growth engine (ARCH section 16)
      "growth.provider_links", "growth.attribution", "growth.ssr_public_pages", "growth.seo_landing_pages", "growth.widgets", "growth.deep_links",
      "growth.analytics_visitor", "growth.marketing_messaging", "growth.campaigns", "growth.patient_referral", "growth.rewards", "kiorex.whatsapp_ai_assistant",
      "growth.experiments", "growth.integrations.<kind>",
      // 1.12.0 growth Phase 2 (additive)
      "growth.campaign_approval_required", "growth.provider_marketing_v2", "growth.assistant_real_model", "growth.lifecycle_journeys", "growth.referral_fraud_enforce",
      ...["googleads", "searchconsole", "ga4", "playconsole", "appstoreconnect", "metaads", "tiktok", "whatsappcloud", "fcmapns", "crux"].map((k) => `growth.integrations.${k}`),
      // 1.12.0 Rev 2.6: patient credit, goodwill, sponsored promotions, provider credit v2
      "growth.patient_credit", "growth.refund_as_credit", "growth.family_credit", "growth.support_goodwill", "growth.sponsored_promotions", "growth.corporate", "growth.loyalty", "clinic.provider_credit_v2", "clinic.usage_bundles",
      // 1.13.0 consolidated
      "growth.attribution_models", "growth.cohorts_ltv", "growth.fraud_scoring", "growth.automation_journeys", "growth.ai_recommendations", "growth.seo_automation", "growth.market_onboarding", "clinic.sponsored_promotions",
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
      "clinic.home_visits", "clinic.specialty_templates.<code>", "clinic.whatsapp_ai_receptionist", "kiorex.ai_navigation",
      "kiorex.category.physiotherapy", "kiorex.home_visits", "kiorex.lab_bookings", "kiorex.pharmacy_orders", "kiorex.telemedicine",
      "market.<country>.live", "nurse.care_plans", "nurse.individual_kiorex_listing", "nurse.mar",
      // 1.10.0 growth engine: counsel-gated
      "growth.analytics_visitor", "growth.marketing_messaging", "growth.patient_referral", "growth.rewards", "kiorex.whatsapp_ai_assistant",
      // 1.12.0: the real assistant model needs the safety-review gate (ADR-024)
      "growth.assistant_real_model",
      // 1.12.0 Rev 2.6: counsel-gated credit and promotion flags
      "growth.patient_credit", "growth.refund_as_credit", "growth.family_credit", "growth.support_goodwill", "growth.sponsored_promotions", "growth.corporate", "growth.loyalty",
      // 1.13.0
      "growth.ai_recommendations",
    ].sort());
  });
});

describe("Rev 2.3 flags: classes, scopes, dependencies and launch gates (KX-08 §10, KX-23 §09, KX-05 §11)", () => {
  const by = (k: string) => cat.flags.find((f: any) => f.key === k);
  const rows: Array<[string, string, string[], string[], string[]]> = [
    // key, class, scopes, dependsOn, gateIds
    ["clinic.profession.physiotherapy", "Module", ["global", "market"], [], []],
    ["clinic.home_visits", "Launch-locked", ["global", "market", "org"], [], ["GHV1", "GHV2"]],
    ["clinic.home_route_view", "Module", ["global", "market", "org"], ["clinic.home_visits"], []],
    ["clinic.home_dispatch", "Module", ["global", "market", "org"], ["clinic.home_visits"], []],
    ["nurse.edition", "Module", ["global", "market"], [], []],
    ["nurse.individual_tenants", "Commercial", ["global", "market"], ["nurse.edition"], []],
    ["nurse.care_plans", "Launch-locked", ["global", "market", "org"], [], ["GKN1"]],
    ["nurse.mar", "Launch-locked", ["global", "market", "org"], [], ["GKN1"]],
    ["nurse.private_duty_shifts", "Module", ["global", "market", "org"], ["nurse.edition"], []],
    ["nurse.family_updates", "Integration", ["global", "market", "org"], ["whatsapp_reminders"], []],
    ["nurse.individual_kiorex_listing", "Launch-locked", ["global", "market"], ["kiorex.home_visits"], ["GKN2"]],
    ["kiorex.home_visits", "Launch-locked", ["global", "market"], ["clinic.home_visits"], ["GHV1", "GHV2"]],
    ["kiorex.category.physiotherapy", "Launch-locked", ["global", "market"], [], ["GPR1"]],
    ["kiorex.category.nursing", "Module", ["global", "market"], ["kiorex.home_visits", "nurse.edition"], []],
    ["kiorex.visit_tracking", "Module", ["global", "market"], ["kiorex.home_visits"], []],
  ];
  it.each(rows)("%s", (key, cls, scopes, deps, gates) => {
    const f = by(key);
    expect(f, key).toBeTruthy();
    expect(f.class).toBe(cls);
    expect(f.scopes).toEqual(scopes);
    expect(f.dependsOn).toEqual(deps);
    expect(f.gateIds ?? []).toEqual(gates);
    for (const g of gates) expect(f.gate).toContain(g);
  });
  it("nurse.* flags are Nurse-edition scoped; physio template gate GPR2 is on the specialty pattern key", () => {
    for (const f of cat.flags.filter((x: any) => x.key.startsWith("nurse."))) expect(f.edition, f.key).toBe("NURSE");
    expect(by("clinic.specialty_templates.<code>").gateIds).toEqual(["NH010", "GPR2"]);
    expect(REV23_KEYS).toHaveLength(15);
  });
  it("gates GHV1/GHV2/GPR1/GPR2/GKN1/GKN2 are all referenced by the catalogue", () => {
    const ids = new Set(cat.flags.flatMap((f: any) => f.gateIds ?? []));
    for (const g of ["GHV1", "GHV2", "GPR1", "GPR2", "GKN1", "GKN2"]) expect(ids.has(g), g).toBe(true);
  });
  it("home-visit safety controls are not flags (ADR-025 / KX-05 §08)", () => {
    const keys = cat.flags.map((f: any) => f.key.toLowerCase());
    for (const t of ["safety_timer", "sos", "unsafe_abort", "address_mask", "scope_of_practice", "mar_allergy"]) expect(keys.some((k: string) => k.includes(t)), t).toBe(false);
  });
});

describe("ADR-025: safety controls are never flags", () => {
  it("lists the 12 fixed controls from KX-08 §09 plus the 4 added in Rev 2.3", () => {
    expect(safety.adr).toBe("ADR-025");
    expect(safety.items).toHaveLength(21); // 16 + 5 added in 1.12.0 (assistant emergency short-circuit, PHI guard, marketing consent check, k-anonymity floor, assertAdSafe)
    expect(safety.items.slice(12, 16).map((i: any) => i.id)).toEqual(["scope_of_practice_enforcement", "profession_verification", "home_visit_safety", "mar_safety_checks"]);
    expect(safety.items.slice(16).map((i: any) => i.id)).toEqual(["assistant_emergency_short_circuit", "assistant_phi_guard", "marketing_consent_check", "k_anonymity_floor", "ad_safety_assertion"]);
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
