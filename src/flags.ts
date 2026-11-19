import { FLAG_CATALOGUE, type FlagScopeName } from "./generated/flags.js";

export type FlagValueName = "ON" | "OFF";

export interface SnapshotFlag {
  key: string;
  class: string;
  scopes: readonly FlagScopeName[];
  dependsOn: readonly string[];
  launchLocked: boolean;
  gateSatisfied: boolean;
  values: { global?: "OFF"; markets?: Record<string, "OFF">; orgs?: Record<string, "OFF"> };
  expiresAt?: string;
}

export interface FlagSnapshotShape {
  product: string;
  version: number;
  generatedAt: string;
  flags: readonly SnapshotFlag[];
  signature?: string;
}

export interface EvalContext {
  /** Market code, e.g. "EG" (case-insensitive). */
  market?: string;
  orgId?: string;
  /** Evaluation time; defaults to Date.now(). Used for expiry. */
  now?: Date | number;
  /** Rule 4 (plan entitlement). Pass false when the customer's plan lacks the capability. Default: entitled. */
  entitled?: boolean;
}

export interface CodeDefault {
  launchLocked?: boolean;
  dependsOn?: readonly string[];
}
export type CodeDefaults = Readonly<Record<string, CodeDefault>>;

/** Code defaults derived from the catalogue: ON, except launch-locked -> OFF until a snapshot confirms the gate. */
export const CATALOGUE_CODE_DEFAULTS: CodeDefaults = Object.fromEntries(
  FLAG_CATALOGUE.map((f) => [f.key, { launchLocked: f.launchLocked, dependsOn: f.dependsOn }]),
);

export type FlagReason =
  | "default" //                 nothing turned it off (rule 1)
  | "global_off" | "market_off" | "org_off" // rules 1-3: any OFF wins
  | "not_entitled" //            rule 4 (HTTP 402, not 403)
  | "awaiting_gate" //           rule 5: launch-locked, gate evidence not recorded
  | "no_snapshot_launch_locked" // fail-static: no snapshot yet and launch-locked
  | "dependency_off"; //         rule 6

export interface FlagDecision {
  key: string;
  enabled: boolean;
  reason: FlagReason;
  /** The scope that turned it OFF (for FEATURE_DISABLED {key, scope}). */
  scope?: FlagScopeName;
  /** For dependency_off: the parent flag that is not effective. */
  blockedBy?: string;
  /** An OFF value existed but its expiresAt has passed, so it was ignored. */
  expired?: boolean;
}

const PATTERNS: Array<[RegExp, string]> = [
  [/^clinic\.specialty_templates\.[^.]+$/, "clinic.specialty_templates.<code>"],
  [/^market\.[^.]+\.live$/, "market.<country>.live"],
];

export function lookupCodeDefault(defaults: CodeDefaults, key: string): CodeDefault | undefined {
  if (defaults[key]) return defaults[key];
  for (const [re, pattern] of PATTERNS) if (re.test(key)) return defaults[pattern];
  return undefined;
}

const upper = (s: string | undefined) => s?.toUpperCase();

/**
 * Pure flag evaluation implementing KX-08 §08 "How the effective value is computed":
 * 1 global (default ON) · 2 market · 3 organization — any OFF wins, a lower scope cannot re-enable ·
 * 4 plan entitlement (ctx.entitled) · 5 gate evidence (launch-locked) · 6 dependencies (parents effective) · 7 effective.
 * Expiry: an OFF whose expiresAt has passed is ignored (flag reverts to inherit/ON).
 * Fail-static: with no snapshot (or a key absent from it) code defaults apply: ON, launch-locked -> OFF.
 * Never throws and makes no network call.
 */
export function evaluateFlag(
  snapshot: FlagSnapshotShape | null | undefined,
  key: string,
  ctx: EvalContext = {},
  codeDefaults: CodeDefaults = CATALOGUE_CODE_DEFAULTS,
): FlagDecision {
  const now = ctx.now instanceof Date ? ctx.now.getTime() : (ctx.now ?? Date.now());
  const index = new Map<string, SnapshotFlag>();
  for (const f of snapshot?.flags ?? []) index.set(f.key, f);

  const evalKey = (k: string, entitled: boolean | undefined, path: string[]): FlagDecision => {
    if (path.includes(k)) return { key: k, enabled: false, reason: "dependency_off", blockedBy: k }; // cycle: fail closed
    const flag = index.get(k);
    const fallback = lookupCodeDefault(codeDefaults, k);
    const launchLocked = flag?.launchLocked ?? fallback?.launchLocked ?? false;
    const deps = flag?.dependsOn ?? fallback?.dependsOn ?? [];
    let expired = false;

    if (flag) {
      const exp = flag.expiresAt ? Date.parse(flag.expiresAt) : NaN;
      const live = !(Number.isFinite(exp) && exp <= now);
      const v = flag.values ?? {};
      if (live) {
        if (v.global === "OFF") return { key: k, enabled: false, reason: "global_off", scope: "global" };
        const m = upper(ctx.market);
        if (m && v.markets && Object.entries(v.markets).some(([mk, val]) => upper(mk) === m && val === "OFF")) {
          return { key: k, enabled: false, reason: "market_off", scope: "market" };
        }
        if (ctx.orgId && v.orgs?.[ctx.orgId] === "OFF") return { key: k, enabled: false, reason: "org_off", scope: "org" };
      } else {
        expired = Boolean(v.global || Object.keys(v.markets ?? {}).length || Object.keys(v.orgs ?? {}).length);
      }
    }

    if (entitled === false) return { key: k, enabled: false, reason: "not_entitled", ...(expired ? { expired } : {}) };

    if (launchLocked) {
      if (!flag) return { key: k, enabled: false, reason: "no_snapshot_launch_locked", scope: "global" };
      if (!flag.gateSatisfied) return { key: k, enabled: false, reason: "awaiting_gate", scope: "global" };
    }

    for (const parent of deps) {
      const d = evalKey(parent, undefined, [...path, k]);
      if (!d.enabled) return { key: k, enabled: false, reason: "dependency_off", blockedBy: d.reason === "dependency_off" && d.blockedBy ? d.blockedBy : parent, scope: d.scope };
    }
    return { key: k, enabled: true, reason: "default", ...(expired ? { expired } : {}) };
  };

  return evalKey(key, ctx.entitled, []);
}

export function isFlagEnabled(...args: Parameters<typeof evaluateFlag>): boolean {
  return evaluateFlag(...args).enabled;
}

export interface FeatureDisabledBody {
  statusCode: 403;
  code: "FEATURE_DISABLED";
  key: string;
  scope: FlagScopeName;
  message: string;
}

/** Body for the universal OFF contract: HTTP 403 FEATURE_DISABLED {key, scope}. */
export function featureDisabledBody(decision: Pick<FlagDecision, "key" | "scope">): FeatureDisabledBody {
  return {
    statusCode: 403,
    code: "FEATURE_DISABLED",
    key: decision.key,
    scope: decision.scope ?? "global",
    message: "This capability is temporarily unavailable.",
  };
}
