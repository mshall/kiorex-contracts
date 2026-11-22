import type { Channel, Purpose, Recipient } from "./types.js";

export interface QuietHours {
  /** Local start hour 0-23 (inclusive). */
  startHour: number;
  /** Local end hour 0-23 (exclusive). start > end wraps midnight. */
  endHour: number;
  /** Minutes east of UTC (Cairo = 120 or 180 in summer). */
  tzOffsetMinutes: number;
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

/** Epoch ms when the quiet window containing `at` ends, or null when `at` is outside the window. */
export function quietUntil(at: number, q: QuietHours): number | null {
  if (q.startHour === q.endHour) return null;
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
