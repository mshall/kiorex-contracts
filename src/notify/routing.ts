import type { Channel, Severity } from "./types.js";

export interface SeverityRoute {
  /** Ordered preference. */
  channels: Channel[];
  /** Fan out to every channel at once (CRITICAL). */
  parallel?: boolean;
  /** Fall back to the next channel when no DELIVERED/READ receipt arrived within this time. */
  fallbackAfterMs?: number;
}

export type RoutingPolicy = Record<Severity, SeverityRoute>;

const MIN = 60_000;

/** Defaults: in-app inbox is always written; ROUTINE tries cheap channels, IMPORTANT escalates, CRITICAL fans out. */
export const DEFAULT_ROUTING: RoutingPolicy = {
  ROUTINE: { channels: ["INAPP", "PUSH", "EMAIL"], fallbackAfterMs: 15 * MIN },
  IMPORTANT: { channels: ["INAPP", "PUSH", "WHATSAPP", "SMS"], fallbackAfterMs: 5 * MIN },
  CRITICAL: { channels: ["INAPP", "PUSH", "WHATSAPP", "SMS", "EMAIL"], parallel: true },
};

/**
 * Resolve the ordered channel list for an intent: the severity route, optionally restricted to `only`.
 * Listed channels keep policy order; a listed channel the severity route does not contain is appended in the given order.
 */
export function planRoute(policy: RoutingPolicy, severity: Severity, only?: readonly Channel[]): SeverityRoute {
  const r = policy[severity];
  const channels = only ? [...r.channels.filter((c) => only.includes(c)), ...only.filter((c, i) => !r.channels.includes(c) && only.indexOf(c) === i)] : [...r.channels];
  return { ...r, channels };
}
