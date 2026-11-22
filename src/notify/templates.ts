import { PhiGuard } from "./phi.js";
import type { Channel, ChannelBodyMap, Locale, Purpose, Reason } from "./types.js";
import { LOCALES } from "./types.js";

export interface RenderContext {
  locale: Locale;
  params: Record<string, string | number>;
  /** Substitute `{name}` placeholders from params. Missing keys render as an empty string. */
  t(text: string): string;
}

export type ChannelRenderer<C extends Channel> = (ctx: RenderContext) => ChannelBodyMap[C];
export type ChannelRenderers = { [C in Channel]?: ChannelRenderer<C> };

export interface TemplateDefinition {
  /** Intent code, e.g. APPOINTMENT_REMINDER. */
  type: string;
  purpose: Purpose;
  /** PHI-free guard: the ONLY param keys an intent may carry. Anything else is rejected. */
  allowedParams: readonly string[];
  /** Subset of allowedParams that must be present. Default none. */
  requiredParams?: readonly string[];
  /** Skip quiet hours for this template even when severity is not CRITICAL. */
  quietBypass?: boolean;
  /** Max SMS segments (overrides the service default). */
  smsMaxSegments?: number;
  /** Per-channel renderers; each receives the locale (ar | en) and returns the channel body. */
  channels: ChannelRenderers;
  /** Sample params used by registry.validate() to prove every channel renders in both locales. */
  sampleParams?: Record<string, string | number>;
}

export type RenderResult<C extends Channel> =
  | { ok: true; body: ChannelBodyMap[C] }
  | { ok: false; reason: Reason; detail?: string };

export function interpolate(text: string, params: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? ""));
}

// ── SMS segments ──
const GSM7 = "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXT = "^{}\\[~]|€\f";

export interface SmsSegments { encoding: "GSM-7" | "UCS-2"; length: number; segments: number }

/** Segment count: GSM-7 160 / 153 per part, UCS-2 (Arabic, emoji) 70 / 67 per part. */
export function smsSegments(text: string): SmsSegments {
  let septets = 0; let gsm = true;
  for (const ch of text) {
    if (GSM7.includes(ch)) septets += 1;
    else if (GSM7_EXT.includes(ch)) septets += 2;
    else { gsm = false; break; }
  }
  if (gsm) return { encoding: "GSM-7", length: septets, segments: septets === 0 ? 0 : septets <= 160 ? 1 : Math.ceil(septets / 153) };
  const units = text.length; // UTF-16 code units
  return { encoding: "UCS-2", length: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

export interface RegistryOptions {
  phiGuard?: PhiGuard;
  /** Default max SMS segments. */
  smsMaxSegments?: number;
}

export class TemplateRegistry {
  private readonly defs = new Map<string, TemplateDefinition>();
  private readonly phi: PhiGuard;
  private readonly smsMax: number;
  constructor(opts: RegistryOptions = {}) {
    this.phi = opts.phiGuard ?? new PhiGuard();
    this.smsMax = opts.smsMaxSegments ?? 4;
  }

  register(def: TemplateDefinition): this {
    if (this.defs.has(def.type)) throw new Error(`template ${def.type} already registered`);
    const missing = (def.requiredParams ?? []).filter((k) => !def.allowedParams.includes(k));
    if (missing.length) throw new Error(`template ${def.type}: requiredParams not in allowedParams: ${missing.join(",")}`);
    this.defs.set(def.type, def);
    return this;
  }
  get(type: string): TemplateDefinition | undefined { return this.defs.get(type); }
  has(type: string): boolean { return this.defs.has(type); }
  types(): string[] { return [...this.defs.keys()]; }
  hasChannel(type: string, channel: Channel): boolean { return !!this.defs.get(type)?.channels[channel]; }

  /** Param guard shared by render() and the service: allow-list and required keys. */
  checkParams(def: TemplateDefinition, params: Record<string, unknown>): { reason: Reason; detail: string } | null {
    const extra = Object.keys(params).filter((k) => !def.allowedParams.includes(k));
    if (extra.length) return { reason: "PARAM_NOT_ALLOWED", detail: extra.join(",") };
    const missing = (def.requiredParams ?? []).filter((k) => params[k] === undefined || params[k] === "");
    if (missing.length) return { reason: "PARAM_MISSING", detail: missing.join(",") };
    return null;
  }

  render<C extends Channel>(type: string, channel: C, locale: Locale, params: Record<string, string | number> = {}): RenderResult<C> {
    const def = this.defs.get(type);
    if (!def) return { ok: false, reason: "UNKNOWN_TYPE", detail: type };
    const bad = this.checkParams(def, params);
    if (bad) return { ok: false, ...bad };
    const renderer = def.channels[channel] as ChannelRenderer<C> | undefined;
    if (!renderer) return { ok: false, reason: "NO_TEMPLATE", detail: channel };
    let body: ChannelBodyMap[C];
    try { body = renderer({ locale, params, t: (s) => interpolate(s, params) }); }
    catch (e) { return { ok: false, reason: "RENDER_ERROR", detail: String(e instanceof Error ? e.message : e).slice(0, 120) }; }
    if (channel === "SMS") {
      const seg = smsSegments((body as { text: string }).text);
      const max = def.smsMaxSegments ?? this.smsMax;
      if (seg.segments > max) return { ok: false, reason: "SMS_TOO_LONG", detail: `${seg.segments}>${max}` };
    }
    const hits = this.phi.scan(channel, body);
    if (hits.length) return { ok: false, reason: "PHI_BLOCKED", detail: hits.join(",") };
    return { ok: true, body };
  }

  /** Dev/CI check: every registered channel renders in ar and en with the sample params. Returns problems (empty = ok). */
  validate(): string[] {
    const problems: string[] = [];
    for (const def of this.defs.values()) {
      const params = def.sampleParams ?? Object.fromEntries(def.allowedParams.map((k) => [k, "x"]));
      for (const channel of Object.keys(def.channels) as Channel[]) {
        const rendered: string[] = [];
        for (const locale of LOCALES) {
          const r = this.render(def.type, channel, locale, params);
          if (!r.ok) problems.push(`${def.type}/${channel}/${locale}: ${r.reason}${r.detail ? ` (${r.detail})` : ""}`);
          else rendered.push(JSON.stringify(r.body));
        }
        if (rendered.length === 2 && rendered[0] === rendered[1]) problems.push(`${def.type}/${channel}: ar and en render identically`);
      }
    }
    return problems;
  }
}

export interface SimpleTemplateInput {
  type: string;
  purpose: Purpose;
  en: string;
  ar: string;
  /** Default: the `{placeholders}` found in en and ar. */
  allowedParams?: readonly string[];
  requiredParams?: readonly string[];
  quietBypass?: boolean;
  smsMaxSegments?: number;
  /** Channels to enable. Default SMS, PUSH, INAPP. */
  channels?: readonly Channel[];
  /** Email subject (ar/en). Default: the first 60 characters of the text. */
  subject?: { en: string; ar: string };
  /** WhatsApp template name (enables the template form; otherwise free text only). */
  whatsappTemplate?: string;
  /** Push / in-app title. */
  title?: { en: string; ar: string };
  /** Deep link for push / in-app (placeholders allowed). */
  deepLink?: string;
  sampleParams?: Record<string, string | number>;
}

const placeholders = (s: string): string[] => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!);
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Build a TemplateDefinition from one ar/en text pair; the shape most reminders and receipts need. */
export function simpleTemplate(i: SimpleTemplateInput): TemplateDefinition {
  const allowed = i.allowedParams ?? [...new Set([...placeholders(i.en), ...placeholders(i.ar)])];
  const channels = i.channels ?? ["SMS", "PUSH", "INAPP"];
  const text = (c: RenderContext) => c.t(c.locale === "ar" ? i.ar : i.en);
  const title = (c: RenderContext) => (i.title ? c.t(i.title[c.locale]) : c.locale === "ar" ? "كيوريكس" : "Kiorex");
  const link = (c: RenderContext) => (i.deepLink ? c.t(i.deepLink) : undefined);
  const r: ChannelRenderers = {};
  if (channels.includes("SMS")) r.SMS = (c) => ({ text: text(c) });
  if (channels.includes("EMAIL")) r.EMAIL = (c) => ({ subject: i.subject ? c.t(i.subject[c.locale]) : text(c).slice(0, 60), text: text(c), html: `<p dir="${c.locale === "ar" ? "rtl" : "ltr"}">${esc(text(c))}</p>` });
  if (channels.includes("WHATSAPP")) {
    r.WHATSAPP = (c) => i.whatsappTemplate
      ? { template: { name: i.whatsappTemplate, language: c.locale, vars: Object.fromEntries(allowed.map((k) => [k, String(c.params[k] ?? "")])) } }
      : { text: text(c) };
  }
  if (channels.includes("PUSH")) r.PUSH = (c) => ({ title: title(c), body: text(c), ...(link(c) ? { data: { deepLink: link(c)! } } : {}) });
  if (channels.includes("INAPP")) r.INAPP = (c) => ({ title: title(c), body: text(c), ...(link(c) ? { deepLink: link(c)! } : {}) });
  return {
    type: i.type, purpose: i.purpose, allowedParams: allowed, requiredParams: i.requiredParams, quietBypass: i.quietBypass,
    smsMaxSegments: i.smsMaxSegments, channels: r, sampleParams: i.sampleParams,
  };
}
