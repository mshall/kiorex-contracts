import {
  createMockAdapters, DEFAULT_ROUTING, MemoryAuditSink, NotificationService, simpleTemplate, TemplateRegistry,
  type ChannelPreference, type NotificationIntent, type NotificationServiceOptions, type PreferenceStore, type Channel, type Purpose, type Recipient,
} from "../../src/notify/index.js";

export const T0 = Date.UTC(2026, 10, 23, 10, 0, 0); // 12:00 Cairo (UTC+2)

export class FakeClock { constructor(public t = T0) {} now() { return this.t; } advance(ms: number) { this.t += ms; } }

export class MapPrefs implements PreferenceStore {
  map = new Map<string, ChannelPreference>();
  calls: Array<{ id: string; channel: Channel; purpose: Purpose }> = [];
  set(id: string, channel: Channel | "*", p: ChannelPreference) { this.map.set(`${id}|${channel}`, p); }
  async get(id: string, ctx: { channel: Channel; purpose: Purpose }) {
    this.calls.push({ id, ...ctx });
    return { ...(this.map.get(`${id}|*`) ?? {}), ...(this.map.get(`${id}|${ctx.channel}`) ?? {}) };
  }
}

export function makeRegistry(): TemplateRegistry {
  const r = new TemplateRegistry({ smsMaxSegments: 2 });
  r.register(simpleTemplate({
    type: "APPOINTMENT_REMINDER", purpose: "REMINDER",
    en: "Reminder: visit with {doctor} at {time}.", ar: "تذكير: زيارتك مع {doctor} في {time}.",
    channels: ["SMS", "EMAIL", "WHATSAPP", "PUSH", "INAPP"], whatsappTemplate: "appt_reminder",
    subject: { en: "Visit reminder", ar: "تذكير بالزيارة" }, deepLink: "kiorex://bookings/{bookingId}",
    allowedParams: ["doctor", "time", "bookingId"], requiredParams: ["doctor", "time"], sampleParams: { doctor: "Dr Omar", time: "10:00", bookingId: "b1" },
  }));
  r.register(simpleTemplate({
    type: "OTP_ALERT", purpose: "SECURITY", en: "Your Kiorex code was used.", ar: "تم استخدام رمز كيوريكس.", channels: ["SMS", "PUSH", "INAPP", "EMAIL", "WHATSAPP"],
  }));
  r.register(simpleTemplate({
    type: "WA_FREE_ONLY", purpose: "TRANSACTIONAL", en: "Hello {name}", ar: "مرحبا {name}", channels: ["WHATSAPP"],
  }));
  return r;
}

export const recipient = (over: Partial<Recipient> = {}): Recipient => ({
  id: "u1", phone: "+201001234567", email: "ahmed@example.com", deviceIds: ["tok1"], locale: "en", ...over,
});

export const intent = (over: Partial<NotificationIntent> = {}): NotificationIntent => ({
  type: "APPOINTMENT_REMINDER", recipient: recipient(), params: { doctor: "Dr Omar", time: "10:00", bookingId: "b1" },
  severity: "ROUTINE", idempotencyKey: "k1", ...over,
});

export function makeService(over: Partial<NotificationServiceOptions> = {}) {
  const adapters = createMockAdapters();
  const clock = new FakeClock();
  const audit = new MemoryAuditSink();
  const prefs = new MapPrefs();
  let n = 0;
  const svc = new NotificationService({
    adapters: Object.values(adapters), registry: makeRegistry(), preferences: prefs, audit, clock,
    routing: DEFAULT_ROUTING, newId: () => `id${++n}`, ...over,
  });
  return { svc, adapters, clock, audit, prefs };
}
