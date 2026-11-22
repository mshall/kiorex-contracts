/**
 * Notification layer: shared vocabulary (KX-09 1.7.0). Pure types, no I/O.
 * See docs/NOTIFICATION_LAYER.md.
 */

/** Delivery channels. INAPP is the first-class in-app inbox. */
export const CHANNELS = ["SMS", "EMAIL", "WHATSAPP", "PUSH", "INAPP"] as const;
export type Channel = (typeof CHANNELS)[number];

export const LOCALES = ["ar", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const SEVERITIES = ["ROUTINE", "IMPORTANT", "CRITICAL"] as const;
export type Severity = (typeof SEVERITIES)[number];

/** Why a notification exists. Drives which consent the gate asks the preference store for. */
export const PURPOSES = ["TRANSACTIONAL", "REMINDER", "MARKETING", "SECURITY"] as const;
export type Purpose = (typeof PURPOSES)[number];

export interface Recipient {
  /** Stable account id (never a phone or email). */
  id: string;
  /** E.164 phone for SMS and WhatsApp. */
  phone?: string;
  email?: string;
  /** Push device tokens (one send per device). */
  deviceIds?: string[];
  locale: Locale;
}

export interface NotificationIntent {
  /** Template code, e.g. APPOINTMENT_REMINDER. */
  type: string;
  recipient: Recipient;
  /** Only keys the template declares (allowedParams) are accepted. */
  params?: Record<string, string | number>;
  severity: Severity;
  /** Same key = same notification: a repeat returns the stored result and never sends twice. */
  idempotencyKey: string;
  /**
   * Suppress a logically identical notification under a DIFFERENT idempotency key:
   * same recipient + type + dedupe.key inside windowMs (default 24 h).
   */
  dedupe?: { key: string; windowMs?: number };
  /** Restrict routing to these channels (kept in policy order). */
  channels?: Channel[];
  /** Opaque, PHI-free pass-through for adapters and audit (for example a booking id). */
  metadata?: Record<string, string>;
}

/** Normalized delivery status. FAILED and SKIPPED are terminal. */
export const DELIVERY_STATUSES = ["QUEUED", "SENT", "DELIVERED", "READ", "FAILED", "SKIPPED"] as const;
export type DeliveryStatus = (typeof DELIVERY_STATUSES)[number];

/** Why an attempt was SKIPPED or FAILED (stable codes, safe to store and show to ops). */
export const REASONS = [
  "CONSENT", "OPT_OUT", "NO_ADDRESS", "WHATSAPP_WINDOW", "NO_TEMPLATE", "NO_ADAPTER", "DEDUPED",
  "QUIET_HOURS", "PHI_BLOCKED", "SMS_TOO_LONG", "PARAM_NOT_ALLOWED", "PARAM_MISSING", "RENDER_ERROR",
  "SEND_FAILED", "ADAPTER_ERROR", "DELIVERY_FAILED", "TIMEOUT", "UNKNOWN_TYPE",
] as const;
export type Reason = (typeof REASONS)[number];

// ── channel bodies ──
export interface SmsBody { text: string }
export interface EmailBody { subject: string; html: string; text: string }
export interface WhatsAppBody {
  /** Pre-approved template (required outside the 24 h customer-service window). */
  template?: { name: string; language: string; vars: Record<string, string> };
  /** Free-form text, allowed only inside the 24 h window. */
  text?: string;
}
export interface PushBody { title: string; body: string; data?: { deepLink?: string } & Record<string, string> }
export interface InAppBody { title: string; body: string; deepLink?: string; data?: Record<string, string> }

export interface ChannelBodyMap {
  SMS: SmsBody; EMAIL: EmailBody; WHATSAPP: WhatsAppBody; PUSH: PushBody; INAPP: InAppBody;
}
export type ChannelBody<C extends Channel = Channel> = ChannelBodyMap[C];

/** What a ChannelAdapter receives. `body` carries the channel-specific payload. */
export interface RenderedMessage<C extends Channel = Channel> {
  notificationId: string;
  channel: C;
  /** Phone, email address, device token or account id (INAPP). */
  to: string;
  type: string;
  locale: Locale;
  body: ChannelBodyMap[C];
  severity: Severity;
  attempt: number;
  metadata?: Record<string, string>;
}

export interface SendOutcome {
  ok: boolean;
  providerRef?: string;
  error?: string;
}

/** One normalized status event from a provider webhook. */
export interface StatusEvent {
  providerRef: string;
  status: DeliveryStatus;
  error?: string;
  /** ISO timestamp from the provider, when given. */
  occurredAt?: string;
}

/** Contract every per-repo adapter implements (SMS, Email, WhatsApp, Push, in-app). */
export interface ChannelAdapter<C extends Channel = Channel> {
  readonly channel: C;
  readonly mode: "mock" | "real";
  send(message: RenderedMessage<C>): Promise<SendOutcome>;
  /** Parse a provider webhook body into normalized events. Unknown statuses are dropped, never guessed. */
  parseWebhook(rawBody: string, headers?: Record<string, unknown>): StatusEvent[];
  /** Verify the provider signature of a webhook. */
  verify(rawBody: string, headers?: Record<string, unknown>): boolean;
}

export interface Clock { now(): number }
