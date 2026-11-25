/**
 * COM-2 commission rate (additive, contracts 1.13.0): the vocabulary and the reference resolution shared by Kiorex, Kiorly Clinic, Pharmacy and Lab.
 *
 * The commission / fee rate is set by default PER ORGANISATION TYPE (product) and may be overridden for ONE organisation, both by Kiorex super admins under maker-checker, append-only and effective-dated.
 * Kiorex then reports each organisation's view to its product (`CommissionRateView`); the product only displays it. NO numeric rate is part of this package: an unset default means NO CHARGE and a
 * visible "rate not set" state. `fixtures/commission-v1.13/rate-vectors.json` proves every implementation against the same cases.
 */
export const COMMISSION_RATE_PRODUCTS = ["CLINIC", "PHARMACY", "LAB"] as const;
export type CommissionRateProduct = (typeof COMMISSION_RATE_PRODUCTS)[number];
export const COMMISSION_FEE_TYPES = ["PERCENT", "FLAT"] as const;
export type CommissionFeeType = (typeof COMMISSION_FEE_TYPES)[number];
export const COMMISSION_COLLECTION_MODES = ["NET_FROM_PAYOUT", "AUTO_CHARGE_SAVED_METHOD", "INVOICE_AND_COLLECT"] as const;
export type CommissionCollectionMode = (typeof COMMISSION_COLLECTION_MODES)[number];
export const COMMISSION_RATE_SCOPES = ["DEFAULT", "ORG"] as const;
export const COMMISSION_RATE_KINDS = ["RATE", "INHERIT"] as const;

export interface CommissionRateSpec {
  feeType: CommissionFeeType;
  /** PERCENT: basis points of the fee basis, 0..10000. */
  percentBps: number | null;
  /** FLAT: amount per charge in minor units. */
  flatMinor: number | null;
  minMinor: number | null;
  maxMinor: number | null;
  /** null = follow the collection settings. */
  mode: CommissionCollectionMode | null;
}
export interface CommissionRateHistoryRow {
  version: number;
  scope: (typeof COMMISSION_RATE_SCOPES)[number];
  kind: (typeof COMMISSION_RATE_KINDS)[number];
  effectiveFrom: string;
  /** Reason of an organisation override; null for a default. */
  reason: string | null;
  spec: CommissionRateSpec | null;
}
/** What Kiorex pushes to the product (POST commission-rates). `version` is a numeric string, monotonic: the newest wins. No actor identity ever travels. */
export interface CommissionRateView {
  orgRef: string;
  product: CommissionRateProduct;
  version: string;
  mode?: CommissionCollectionMode | null;
  history: CommissionRateHistoryRow[];
}
export interface EffectiveCommissionRate {
  state: "SET" | "NOT_SET";
  source: "OVERRIDE" | "DEFAULT" | null;
  version: number | null;
  effectiveFrom: string | null;
  reason: string | null;
  spec: CommissionRateSpec | null;
}
export const COMMISSION_RATE_NOT_SET: EffectiveCommissionRate = { state: "NOT_SET", source: null, version: null, effectiveFrom: null, reason: null, spec: null };

const inForce = (rows: CommissionRateHistoryRow[], at: Date): CommissionRateHistoryRow | null => {
  const live = rows.filter((r) => new Date(r.effectiveFrom).getTime() <= at.getTime());
  live.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime() || b.version - a.version);
  return live[0] ?? null;
};

/** The effective rate of an organisation at an instant: its own newest row in force decides (a RATE row is an override, an INHERIT row hands back to the default); otherwise the default; otherwise NOT_SET. */
export function effectiveCommissionRate(history: CommissionRateHistoryRow[], at: Date): EffectiveCommissionRate {
  const o = inForce(history.filter((r) => r.scope === "ORG"), at);
  if (o && o.kind === "RATE" && o.spec) return { state: "SET", source: "OVERRIDE", version: o.version, effectiveFrom: o.effectiveFrom, reason: o.reason, spec: o.spec };
  const d = inForce(history.filter((r) => r.scope === "DEFAULT"), at);
  if (d && d.kind === "RATE" && d.spec) return { state: "SET", source: "DEFAULT", version: d.version, effectiveFrom: d.effectiveFrom, reason: null, spec: d.spec };
  return COMMISSION_RATE_NOT_SET;
}

/** Commission of one charge in minor units: percent of the fee basis rounded half up on exact integers, or the flat amount; then the floor and the cap. */
export function commissionAmountMinor(basisMinor: number, spec: CommissionRateSpec): number {
  let v = spec.feeType === "FLAT" ? (spec.flatMinor ?? 0) : Math.floor((basisMinor * (spec.percentBps ?? 0) * 2 + 10_000) / 20_000);
  if (spec.minMinor != null) v = Math.max(v, spec.minMinor);
  if (spec.maxMinor != null) v = Math.min(v, spec.maxMinor);
  return v;
}
