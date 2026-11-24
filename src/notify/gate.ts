import type { Channel, Purpose, Recipient } from "./types.js";

export interface QuietHours {
  /** Local start hour 0-23 (inclusive). */
  startHour: number;
  /** Local end hour 0-23 (exclusive). start > end wraps midnight. */
  endHour: number;
  /** Minutes east of UTC (Cairo = 120 or 180 in summer). A fixed offset is wrong on the two nights a year the zone changes it: prefer `zone` (1.12.0). */
  tzOffsetMinutes: number;
  /** IANA zone, e.g. Africa/Cairo (additive, 1.12.0). When present it wins over `tzOffsetMinutes`, so a window that spans a DST change ends at the right local hour. */
  zone?: string;
}

export interface ChannelPreference {
  /** The recipient switched this channel off. */
  optedOut?: boolean;
  /** Consent for the template purpose on this channel; default true when the store has no record. */
  consent?: boolean;
  quiet?: QuietHours | null;
  /** Epoch ms of the last inbound WhatsApp message from the recipient (opens the 24 h window). */
  whatsappLastInboundAt?: number;
}

/** Injected by each product: where opt-outs, consent and quiet hours live. */
export interface PreferenceStore {
  get(recipientId: string, ctx: { channel: Channel; purpose: Purpose }): Promise<ChannelPreference>;
}

export const WHATSAPP_WINDOW_MS = 24 * 3600_000;

interface Wall { y: number; mo: number; d: number; h: number }
const fmtCache = new Map<string, Intl.DateTimeFormat>();
const fmt = (zone: string) => {
  let f = fmtCache.get(zone);
  if (!f) { f = new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" }); fmtCache.set(zone, f); }
  return f;
};
/** Local wall clock of `at` in `zone`. */
function wallOf(at: number, zone: string): Wall {
  const p: Record<string, number> = {};
  for (const part of fmt(zone).formatToParts(new Date(at))) if (part.type !== "literal") p[part.type] = Number(part.value);
  return { y: p.year!, mo: p.month!, d: p.day!, h: p.hour! === 24 ? 0 : p.hour! };
}
/** Minutes east of UTC that `zone` has at the instant `at`. */
function offsetMs(at: number, zone: string): number {
  const p: Record<string, number> = {};
  for (const part of fmt(zone).formatToParts(new Date(at))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! === 24 ? 0 : p.hour!, p.minute!, p.second!);
  return asUtc - Math.floor(at / 1000) * 1000;
}
/** UTC instant of a local wall time `hour:00` on the given local date in `zone` (the offset is the one in force AT that wall time, not at the caller's instant). */
function wallToUtc(y: number, mo: number, d: number, hour: number, zone: string): number {
  const naive = Date.UTC(y, mo - 1, d, hour, 0, 0);
  let utc = naive - offsetMs(naive, zone);
  const again = naive - offsetMs(utc, zone);
  if (again !== utc) utc = again;
  return utc;
}

/**
 * Epoch ms when the quiet window containing `at` ends, or null when `at` is outside the window.
 * With a `zone` (third argument, or `q.zone`, additive in 1.12.0) the end is computed on the local calendar of that zone, so the two nights a year the zone
 * changes its offset no longer end the window an hour early or late. Without a zone the fixed `tzOffsetMinutes` behaviour is unchanged.
 */
export function quietUntil(at: number, q: QuietHours, zone?: string): number | null {
  if (q.startHour === q.endHour) return null;
  const z = zone ?? q.zone;
  if (z) {
    const w = wallOf(at, z);
    const inside = q.startHour > q.endHour ? w.h >= q.startHour || w.h < q.endHour : w.h >= q.startHour && w.h < q.endHour;
    if (!inside) return null;
    const nextDay = q.startHour > q.endHour ? w.h >= q.startHour : false;
    const base = new Date(Date.UTC(w.y, w.mo - 1, w.d + (nextDay ? 1 : 0)));
    let end = wallToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate(), q.endHour, z);
    if (end <= at) end = wallToUtc(base.getUTCFullYear(), base.getUTCMonth() + 1, base.getUTCDate() + 1, q.endHour, z);
    return end;
  }
  const off = q.tzOffsetMinutes * 60_000;
  const local = new Date(at + off);
  const h = local.getUTCHours();
  const inside = q.startHour > q.endHour ? h >= q.startHour || h < q.endHour : h >= q.startHour && h < q.endHour;
  if (!inside) return null;
  const end = new Date(local);
  end.setUTCHours(q.endHour, 0, 0, 0);
  if (end.getTime() <= local.getTime()) end.setUTCDate(end.getUTCDate() + 1);
  return end.getTime() - off;
}

export function addressFor(channel: Channel, r: Recipient): string[] {
  switch (channel) {
    case "SMS": case "WHATSAPP": return r.phone ? [r.phone] : [];
    case "EMAIL": return r.email ? [r.email] : [];
    case "PUSH": return (r.deviceIds ?? []).filter(Boolean);
    case "INAPP": return [r.id];
  }
}

export type GateDecision =
  | { allow: true; addresses: string[]; whatsappFreeForm: boolean }
  | { allow: false; reason: "CONSENT" | "OPT_OUT" | "NO_ADDRESS" }
  | { allow: false; reason: "QUIET_HOURS"; until: number };

/**
 * Order: consent, opt-out, quiet hours (not for INAPP, CRITICAL or quietBypass), address.
 * The WhatsApp 24 h window is evaluated here too: `whatsappFreeForm` says free text is allowed.
 */
export function evaluateGate(o: {
  channel: Channel; recipient: Recipient; pref: ChannelPreference; now: number; critical: boolean; quietBypass: boolean;
}): GateDecision {
  const { channel, recipient, pref, now } = o;
  if (pref.consent === false) return { allow: false, reason: "CONSENT" };
  if (pref.optedOut) return { allow: false, reason: "OPT_OUT" };
  if (channel !== "INAPP" && !o.critical && !o.quietBypass && pref.quiet) {
    const until = quietUntil(now, pref.quiet);
    if (until !== null) return { allow: false, reason: "QUIET_HOURS", until };
  }
  const addresses = addressFor(channel, recipient);
  if (!addresses.length) return { allow: false, reason: "NO_ADDRESS" };
  const whatsappFreeForm = channel === "WHATSAPP" && pref.whatsappLastInboundAt !== undefined && now - pref.whatsappLastInboundAt < WHATSAPP_WINDOW_MS;
  return { allow: true, addresses, whatsappFreeForm };
}
