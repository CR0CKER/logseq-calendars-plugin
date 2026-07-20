// Unit tests for the framework-free helpers in parsing.ts (audit finding H2).
//
// url-regex-safe is mocked so the tests don't load its native re2 backend (which
// has no prebuilt for every dev platform). The mock is a plain global URL regex —
// enough to exercise parseLocation's link-wrapping logic.
jest.mock("url-regex-safe", () => ({
  __esModule: true,
  default: () => /https?:\/\/[^\s)]+/g,
}));

import {
  sortDate,
  shouldFilterDeclinedEvent,
  getAttendeeName,
  formatParticipants,
  isCancelledEvent,
  parseLocation,
  templateFormatter,
  ICalAttendee,
  EventLike,
} from "./parsing";

const attendee = (val: string, cn?: string, partstat?: string): ICalAttendee => ({
  val,
  params: { ...(cn !== undefined ? { CN: cn } : {}), ...(partstat ? { PARTSTAT: partstat } : {}) },
});

describe("getAttendeeName", () => {
  it("returns the trimmed display name", () => {
    expect(getAttendeeName(attendee("mailto:a@b.com", "  Ada Lovelace  "))).toBe("Ada Lovelace");
  });
  it("returns null when there is no CN", () => {
    expect(getAttendeeName(attendee("mailto:a@b.com"))).toBeNull();
  });
  it("returns null for an empty/whitespace CN", () => {
    expect(getAttendeeName(attendee("mailto:a@b.com", "   "))).toBeNull();
  });
  it("returns null when the CN equals the attendee's own email", () => {
    expect(getAttendeeName(attendee("mailto:a@b.com", "A@B.com"))).toBeNull();
  });
  it("returns null for an email-shaped CN even without a matching val", () => {
    expect(getAttendeeName(attendee("mailto:x@y.com", "someone@else.org"))).toBeNull();
  });
  it("returns null for an undefined attendee", () => {
    expect(getAttendeeName(undefined)).toBeNull();
  });
});

describe("formatParticipants", () => {
  const evt = (attendees: ICalAttendee[]): EventLike => ({ attendee: attendees });

  it("returns '' when the event has no attendees", () => {
    expect(formatParticipants({}, ["ACCEPTED"], "me@x.com", true)).toBe("");
  });
  it("wraps named attendees in [[...]] and joins with ', '", () => {
    const e = evt([attendee("mailto:a@x.com", "Ada", "ACCEPTED"), attendee("mailto:b@x.com", "Bob", "ACCEPTED")]);
    expect(formatParticipants(e, ["ACCEPTED"], undefined, true)).toBe("[[Ada]], [[Bob]]");
  });
  it("includes only attendees matching the requested PARTSTAT", () => {
    const e = evt([attendee("mailto:a@x.com", "Ada", "ACCEPTED"), attendee("mailto:b@x.com", "Bob", "DECLINED")]);
    expect(formatParticipants(e, ["ACCEPTED"], undefined, true)).toBe("[[Ada]]");
  });
  it("defaults a missing PARTSTAT to NEEDS-ACTION", () => {
    const e = evt([attendee("mailto:a@x.com", "Ada")]);
    expect(formatParticipants(e, ["NEEDS-ACTION"], undefined, true)).toBe("[[Ada]]");
  });
  it("excludes the user themselves by email", () => {
    const e = evt([attendee("mailto:me@x.com", "Me", "ACCEPTED"), attendee("mailto:a@x.com", "Ada", "ACCEPTED")]);
    expect(formatParticipants(e, ["ACCEPTED"], "ME@x.com", true)).toBe("[[Ada]]");
  });
  it("falls back to the bare email for a nameless attendee when emailFallback is true", () => {
    const e = evt([attendee("mailto:a@x.com", undefined, "ACCEPTED")]);
    expect(formatParticipants(e, ["ACCEPTED"], undefined, true)).toBe("a@x.com");
  });
  it("omits a nameless attendee when emailFallback is false", () => {
    const e = evt([attendee("mailto:a@x.com", undefined, "ACCEPTED")]);
    expect(formatParticipants(e, ["ACCEPTED"], undefined, false)).toBe("");
  });
  it("normalizes a single (non-array) attendee", () => {
    expect(formatParticipants({ attendee: attendee("mailto:a@x.com", "Ada", "ACCEPTED") }, ["ACCEPTED"], undefined, true)).toBe("[[Ada]]");
  });
});

describe("isCancelledEvent", () => {
  it("is false when there is no status", () => {
    expect(isCancelledEvent({})).toBe(false);
  });
  it("is true for a CANCELLED string status (case/space-insensitive)", () => {
    expect(isCancelledEvent({ status: " cancelled " })).toBe(true);
  });
  it("is true for a { val: 'CANCELLED' } status object", () => {
    expect(isCancelledEvent({ status: { val: "CANCELLED" } })).toBe(true);
  });
  it("is false for a CONFIRMED status", () => {
    expect(isCancelledEvent({ status: "CONFIRMED" })).toBe(false);
  });
});

describe("shouldFilterDeclinedEvent", () => {
  const declinedByMe: EventLike = { attendee: attendee("mailto:me@x.com", "Me", "DECLINED") };

  it("is false when no userEmail is configured", () => {
    expect(shouldFilterDeclinedEvent(declinedByMe, "", true)).toBe(false);
  });
  it("is false when hideDeclined is off", () => {
    expect(shouldFilterDeclinedEvent(declinedByMe, "me@x.com", false)).toBe(false);
  });
  it("is false when the event has no attendees", () => {
    expect(shouldFilterDeclinedEvent({}, "me@x.com", true)).toBe(false);
  });
  it("is true when the configured user has declined", () => {
    expect(shouldFilterDeclinedEvent(declinedByMe, "ME@x.com", true)).toBe(true);
  });
  it("is false when the configured user has accepted", () => {
    const accepted: EventLike = { attendee: attendee("mailto:me@x.com", "Me", "ACCEPTED") };
    expect(shouldFilterDeclinedEvent(accepted, "me@x.com", true)).toBe(false);
  });
});

describe("sortDate", () => {
  it("drops events with a missing or invalid start", () => {
    const out = sortDate([{ start: undefined }, { start: "not-a-date" }, { start: "2026-01-01T10:00:00Z" }]);
    expect(out).toHaveLength(1);
  });
  it("sorts ascending by absolute start time", () => {
    const a = { start: "2026-01-01T12:00:00Z", id: "a" };
    const b = { start: "2026-01-01T09:00:00Z", id: "b" };
    const c = { start: "2026-01-01T15:00:00Z", id: "c" };
    expect(sortDate([a, b, c]).map((e) => e.id)).toEqual(["b", "a", "c"]);
  });
});

describe("parseLocation", () => {
  it("returns the raw location unchanged when it contains no URL", () => {
    expect(parseLocation("Room 4B")).toBe("Room 4B");
  });
  it("wraps a URL in a Markdown link labelled with the host", () => {
    expect(parseLocation("https://meet.google.com/abc-defg")).toBe(
      "[meet.google.com/...](https://meet.google.com/abc-defg)"
    );
  });
});

describe("templateFormatter", () => {
  it("substitutes each variable", () => {
    expect(templateFormatter("{Start} - {End}: {Title}", "d", "date", "09:00", "10:00", "Standup", "")).toBe(
      "09:00 - 10:00: Standup"
    );
  });

  // Regression guard for audit finding L1: a variable used more than once must be
  // replaced at EVERY occurrence. This fails against the pre-fix code, which used
  // String.replace (first occurrence only).
  it("replaces ALL occurrences of a repeated variable (L1 regression)", () => {
    const out = templateFormatter("{Title} @ {Start} — reminder: {Title}", "d", "date", "09:00", "10:00", "Standup", "");
    expect(out).toBe("Standup @ 09:00 — reminder: Standup");
  });

  it("also substitutes the lower-case spelling of a variable", () => {
    expect(templateFormatter("{title}", "d", "date", "s", "e", "Standup", "")).toBe("Standup");
  });

  it("falls back to 'No Description' / 'No Location' for empty values", () => {
    const out = templateFormatter("{Description} @ {RawLocation}", "", "date", "s", "e", "t", "");
    expect(out).toBe("No Description @ No Location");
  });
});
