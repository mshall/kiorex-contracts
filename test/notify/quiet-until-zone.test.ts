import { describe, expect, it } from "vitest";
import { evaluateGate, quietUntil, type QuietHours } from "../../src/notify/index.js";

// Africa/Cairo, quiet 21:00 to 09:00. DST: forward on the last Friday of April (00:00 -> 01:00, UTC+2 -> +3), back on the last Thursday of October (24:00 -> 23:00, UTC+3 -> +2).
const Q: QuietHours = { startHour: 21, endHour: 9, tzOffsetMinutes: 120 };
const Z = "Africa/Cairo";
const utc = (y: number, m: number, d: number, h: number, mi = 0) => Date.UTC(y, m - 1, d, h, mi, 0);

describe("quietUntil with an IANA zone (1.12.0, closes GC-1 item G-5)", () => {
  it("an ordinary winter night ends at 09:00 local (07:00 UTC)", () => {
    expect(quietUntil(utc(2026, 1, 14, 20, 0), Q, Z)).toBe(utc(2026, 1, 15, 7, 0)); // 22:00 local
    expect(quietUntil(utc(2026, 1, 15, 2, 0), Q, Z)).toBe(utc(2026, 1, 15, 7, 0)); // 04:00 local
    expect(quietUntil(utc(2026, 1, 15, 7, 0), Q, Z)).toBeNull(); // 09:00 local is outside
  });
  it("an ordinary summer night ends at 09:00 local (06:00 UTC)", () => {
    expect(quietUntil(utc(2026, 7, 14, 19, 30), Q, Z)).toBe(utc(2026, 7, 15, 6, 0)); // 22:30 local (+3)
  });
  it("FALL BACK night (Thu 29 Oct 2026 to Fri 30 Oct): the window ends 09:00 local on the new offset, not an hour early", () => {
    const at = utc(2026, 10, 29, 19, 0); // 22:00 local, still +3
    const end = quietUntil(at, Q, Z);
    expect(end).toBe(utc(2026, 10, 30, 7, 0)); // 09:00 local at +2
    // the fixed-offset result at +3 would have been 06:00 UTC = 08:00 local: an hour early
    expect(quietUntil(at, { ...Q, tzOffsetMinutes: 180 })).toBe(utc(2026, 10, 30, 6, 0));
    expect(end).not.toBe(utc(2026, 10, 30, 6, 0));
  });
  it("SPRING FORWARD night (Thu 23 Apr 2026 to Fri 24 Apr): ends 09:00 local on the new offset, not an hour late", () => {
    const at = utc(2026, 4, 23, 19, 0); // 21:00 local, still +2
    expect(quietUntil(at, Q, Z)).toBe(utc(2026, 4, 24, 6, 0)); // 09:00 local at +3
    expect(quietUntil(at, { ...Q, tzOffsetMinutes: 120 })).toBe(utc(2026, 4, 24, 7, 0));
  });
  it("after midnight inside the wrapped window on a transition night", () => {
    expect(quietUntil(utc(2026, 10, 30, 1, 0), Q, Z)).toBe(utc(2026, 10, 30, 7, 0)); // 03:00 local at +2
    expect(quietUntil(utc(2026, 4, 24, 3, 0), Q, Z)).toBe(utc(2026, 4, 24, 6, 0)); // 06:00 local at +3
  });
  it("same-day windows and equal hours behave as before", () => {
    expect(quietUntil(utc(2026, 1, 15, 8, 30), { startHour: 11, endHour: 14, tzOffsetMinutes: 0 }, Z)).toBeNull(); // 10:30 local
    expect(quietUntil(utc(2026, 1, 15, 10, 30), { startHour: 11, endHour: 14, tzOffsetMinutes: 0 }, Z)).toBe(utc(2026, 1, 15, 12, 0)); // 12:30 local
    expect(quietUntil(utc(2026, 1, 15, 10, 0), { startHour: 5, endHour: 5, tzOffsetMinutes: 0 }, Z)).toBeNull();
  });
  it("the old two-argument signature is unchanged and `zone` on QuietHours is honoured by the gate", () => {
    expect(quietUntil(Date.UTC(2026, 10, 23, 23, 0, 0), { startHour: 22, endHour: 7, tzOffsetMinutes: 120 })).toBe(Date.UTC(2026, 10, 24, 5, 0, 0));
    const r = { id: "u1", phone: "+201000000000" };
    const d = evaluateGate({ channel: "SMS", recipient: r, pref: { quiet: { ...Q, zone: Z } }, now: utc(2026, 10, 29, 19, 0) } as never);
    expect(d).toMatchObject({ allow: false, reason: "QUIET_HOURS", until: utc(2026, 10, 30, 7, 0) });
  });
});
