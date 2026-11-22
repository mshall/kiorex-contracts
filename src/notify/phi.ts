import type { Channel, ChannelBody } from "./types.js";

export interface PhiPattern { code: string; pattern: RegExp }

/**
 * Default patterns that must never appear in SMS, push or WhatsApp bodies. Deliberately conservative and
 * configurable: pass your own list to `new PhiGuard(patterns)` (add Arabic diagnosis terms, MRN formats, ...).
 */
export const DEFAULT_PHI_PATTERNS: readonly PhiPattern[] = [
  { code: "NATIONAL_ID", pattern: /(?<!\d)[23]\d{13}(?!\d)/ },
  { code: "MRN", pattern: /\b(?:mrn|medical record(?: no| number)?)\b[\s:#-]*\d+/i },
  { code: "LAB_VALUE", pattern: /\b\d+(?:\.\d+)?\s?(?:mg\/dl|mmol\/l|g\/dl|iu\/l|u\/l|ng\/ml|mmhg|bpm)\b/i },
  { code: "DIAGNOSIS", pattern: /\b(?:diagnos(?:is|ed)|hiv|cancer|tumou?r|diabet(?:es|ic)|pregnan(?:t|cy)|std|hepatitis)\b|(?<![\u0600-\u06FF])(?:ال)?(?:تشخيص|سرطان|ورم|سكر|سكري|حمل|إيدز|التهاب الكبد)(?![\u0600-\u06FF])/i },
  { code: "PRESCRIPTION", pattern: /\b\d+\s?(?:mg|mcg|ml)\b.*\b(?:daily|twice|tablet|capsule)\b|\bprescri(?:ption|bed)\b|(?<![\u0600-\u06FF])روشتة(?![\u0600-\u06FF])/i },
];

/** Channels whose bodies are scanned. Email and in-app are authenticated surfaces and are not scanned. */
export const PHI_SCANNED_CHANNELS: readonly Channel[] = ["SMS", "PUSH", "WHATSAPP"];

function texts(channel: Channel, body: ChannelBody): string[] {
  switch (channel) {
    case "SMS": return [(body as { text: string }).text];
    case "PUSH": { const b = body as { title: string; body: string; data?: Record<string, string> }; return [b.title, b.body, ...Object.values(b.data ?? {}).filter((v) => !/^[a-z][a-z0-9+.-]*:\/\//i.test(v) && !v.startsWith("/"))]; }
    default: { const b = body as { text?: string; template?: { vars: Record<string, string> } }; return [b.text ?? "", ...Object.values(b.template?.vars ?? {})]; } // WHATSAPP
  }
}

export class PhiGuard {
  constructor(private readonly patterns: readonly PhiPattern[] = DEFAULT_PHI_PATTERNS) {}
  /** Returns the codes of the patterns that matched (empty = clean). */
  scan(channel: Channel, body: ChannelBody): string[] {
    if (!PHI_SCANNED_CHANNELS.includes(channel)) return [];
    const hay = texts(channel, body).join("\n");
    return this.patterns.filter((p) => p.pattern.test(hay)).map((p) => p.code);
  }
}
