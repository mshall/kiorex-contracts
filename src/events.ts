import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import type { ErrorObject } from "ajv";
import { ENVELOPE_SCHEMA, EVENT_SCHEMAS, EVENT_TYPE_ALIASES, type EventMap, type EventType } from "./generated/events.js";

const AjvCtor = ((Ajv2020 as unknown as { default?: typeof Ajv2020 }).default ?? Ajv2020) as typeof Ajv2020;
const addFormatsFn = ((addFormats as unknown as { default?: typeof addFormats }).default ?? addFormats) as typeof addFormats;

let ajv: InstanceType<typeof AjvCtor> | undefined;

function getAjv() {
  if (ajv) return ajv;
  const instance = new AjvCtor({ allErrors: true, strict: true });
  instance.addKeyword("x-producer");
  instance.addKeyword("x-status");
  addFormatsFn(instance);
  instance.addSchema(ENVELOPE_SCHEMA);
  for (const schema of Object.values(EVENT_SCHEMAS)) instance.addSchema(schema);
  ajv = instance;
  return instance;
}

export type KnownEventTypeString = EventType | keyof typeof EVENT_TYPE_ALIASES;

export function canonicalEventType(type: string): EventType | undefined {
  if (type in EVENT_SCHEMAS) return type as EventType;
  const alias = (EVENT_TYPE_ALIASES as Record<string, EventType>)[type];
  return alias;
}

export type ValidateEventResult<T extends string> =
  | { valid: true; type: EventType; event: T extends keyof EventMap ? EventMap[T] : EventMap[EventType] }
  | { valid: false; type?: EventType; errors: string[] };

const fmt = (e: ErrorObject) => `${e.instancePath || "/"} ${e.message ?? "invalid"}${e.params ? ` ${JSON.stringify(e.params)}` : ""}`;

/**
 * Validate a full event (envelope + data) against its JSON Schema.
 * `type` may be the canonical type or a documented alias (APPOINTMENT_RESCHEDULED -> RESCHEDULED).
 * Unknown types return { valid: false }; callers should log and acknowledge unknown types (forward compatibility).
 */
export function validateEvent<T extends string = string>(type: T, payload: unknown): ValidateEventResult<T> {
  const canonical = canonicalEventType(type);
  if (!canonical) return { valid: false, errors: [`unknown event type: ${type}`] };
  const validate = getAjv().getSchema(EVENT_SCHEMAS[canonical].$id);
  if (!validate) return { valid: false, type: canonical, errors: ["schema not registered"] };
  if (validate(payload)) return { valid: true, type: canonical, event: payload as never };
  return { valid: false, type: canonical, errors: (validate.errors ?? []).map(fmt) };
}

/** Validate any envelope by reading its own `type`. */
export function validateEnvelope(payload: unknown): ValidateEventResult<string> {
  const t = (payload as { type?: unknown } | null)?.type;
  if (typeof t !== "string") return { valid: false, errors: ["missing type"] };
  return validateEvent(t, payload);
}

export function isEventType(type: string): type is EventType {
  return canonicalEventType(type) !== undefined;
}
