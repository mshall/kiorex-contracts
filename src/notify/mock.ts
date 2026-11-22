import { parseNeutralStatusBody } from "./status.js";
import type { Channel, ChannelAdapter, RenderedMessage, SendOutcome, StatusEvent } from "./types.js";

export interface MockSent { message: RenderedMessage; outcome: SendOutcome }

/**
 * Test double for any channel. Records every send, can be told to fail, and speaks the neutral webhook body
 * `{ events: [{ id, status }] }` signed with the header `x-mock-signature: <secret>`.
 */
export class MockChannelAdapter<C extends Channel = Channel> implements ChannelAdapter<C> {
  readonly mode = "mock" as const;
  readonly sent: MockSent[] = [];
  private seq = 0;
  private failures: string[] = [];
  /** Recipients (`to`) that always fail, like the platform's `...0000` bounce numbers. */
  failTo = new Set<string>();
  /** When set, send() throws this error (adapter crash). */
  throwOnSend?: Error;
  constructor(readonly channel: C, readonly secret = "mock-secret") {}

  /** Fail the next `n` sends with an error code. */
  failNext(n = 1, error = "MOCK_FAIL"): this { for (let i = 0; i < n; i++) this.failures.push(error); return this; }

  async send(message: RenderedMessage<C>): Promise<SendOutcome> {
    if (this.throwOnSend) throw this.throwOnSend;
    const err = this.failTo.has(message.to) ? "MOCK_BOUNCE" : this.failures.shift();
    const outcome: SendOutcome = err ? { ok: false, error: err } : { ok: true, providerRef: `mock_${this.channel.toLowerCase()}_${++this.seq}` };
    this.sent.push({ message, outcome });
    return outcome;
  }
  parseWebhook(rawBody: string): StatusEvent[] { return parseNeutralStatusBody(this.channel, rawBody); }
  verify(_rawBody: string, headers: Record<string, unknown> = {}): boolean { return headers["x-mock-signature"] === this.secret; }

  get lastRef(): string | undefined { return [...this.sent].reverse().find((s) => s.outcome.ok)?.outcome.providerRef; }
  /** Helper for tests: the neutral webhook body for one event. */
  static webhookBody(providerRef: string, status: string, error?: string): string {
    return JSON.stringify({ events: [{ id: providerRef, status, ...(error ? { error } : {}) }] });
  }
}

/** One MockChannelAdapter per channel (default all five). */
export function createMockAdapters(channels: readonly Channel[] = ["SMS", "EMAIL", "WHATSAPP", "PUSH", "INAPP"]): { [C in Channel]: MockChannelAdapter<C> } {
  return Object.fromEntries(channels.map((c) => [c, new MockChannelAdapter(c)])) as never;
}
