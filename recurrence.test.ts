// Fixture tests for the recurrence/timezone engine (audit finding H2, part 2).
// Real .ics strings are parsed with node-ical (as at runtime) and fed to
// parseEvents, so these exercise the true RRULE / EXDATE / RECURRENCE-ID path.
// TZ is pinned to UTC in jest.config.js for deterministic date assertions.

import ical from "node-ical";
import { parseEvents, ParsedCalendar, ParseEventsOptions } from "./recurrence";

const OPTS: ParseEventsOptions = {
  userEmail: undefined,
  hideDeclined: true,
  now: new Date(Date.UTC(2026, 0, 10)), // 2026-01-10 → window 2025-01-01 .. 2028-12-31
};

function parse(ics: string): ParsedCalendar {
  return ical.parseICS(ics) as unknown as ParsedCalendar;
}

const vcal = (body: string) =>
  ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//test//EN", body, "END:VCALENDAR"].join("\r\n");

const ymd = (d: Date | string | number) => new Date(d).toISOString().slice(0, 10);

describe("parseEvents — non-recurring", () => {
  it("passes a plain event through", () => {
    const out = parseEvents(
      parse(
        vcal(
          "BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260112T090000Z\r\nDTEND:20260112T100000Z\r\nSUMMARY:One-off\r\nEND:VEVENT"
        )
      ),
      OPTS
    );
    expect(out).toHaveLength(1);
    expect(out[0].summary).toBe("One-off");
  });

  it("drops a CANCELLED event", () => {
    const out = parseEvents(
      parse(
        vcal(
          "BEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260112T090000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Scrapped\r\nEND:VEVENT"
        )
      ),
      OPTS
    );
    expect(out.find((e) => e.summary === "Scrapped")).toBeUndefined();
  });
});

describe("parseEvents — recurring", () => {
  const weekly = vcal(
    "BEGIN:VEVENT\r\nUID:w\r\nDTSTART:20260106T090000Z\r\nDTEND:20260106T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nSUMMARY:Weekly Standup\r\nEND:VEVENT"
  );

  it("expands a weekly COUNT=5 event to 5 occurrences", () => {
    const out = parseEvents(parse(weekly), OPTS);
    const standups = out.filter((e) => e.summary === "Weekly Standup");
    expect(standups).toHaveLength(5);
    // Jan 6, 13, 20, 27, Feb 3
    expect(standups.map((e) => ymd(e.start!))).toEqual([
      "2026-01-06",
      "2026-01-13",
      "2026-01-20",
      "2026-01-27",
      "2026-02-03",
    ]);
  });

  it("excludes an EXDATE occurrence", () => {
    const withExdate = vcal(
      "BEGIN:VEVENT\r\nUID:w\r\nDTSTART:20260106T090000Z\r\nDTEND:20260106T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nEXDATE:20260113T090000Z\r\nSUMMARY:Weekly Standup\r\nEND:VEVENT"
    );
    const days = parseEvents(parse(withExdate), OPTS).map((e) => ymd(e.start!));
    expect(days).not.toContain("2026-01-13");
    expect(days).toHaveLength(4);
  });

  it("returns nothing when every occurrence is outside the window", () => {
    const old = vcal(
      "BEGIN:VEVENT\r\nUID:old\r\nDTSTART:20000104T090000Z\r\nRRULE:FREQ=WEEKLY;COUNT=3\r\nSUMMARY:Ancient\r\nEND:VEVENT"
    );
    expect(parseEvents(parse(old), OPTS)).toHaveLength(0);
  });
});

describe("parseEvents — rescheduled instance (RECURRENCE-ID)", () => {
  // A master weekly event plus an override moving the 2026-01-20 occurrence.
  const withOverride = vcal(
    [
      "BEGIN:VEVENT\r\nUID:w\r\nDTSTART:20260106T090000Z\r\nDTEND:20260106T100000Z\r\nRRULE:FREQ=WEEKLY;COUNT=5\r\nSUMMARY:Weekly Standup\r\nEND:VEVENT",
      "BEGIN:VEVENT\r\nUID:w\r\nRECURRENCE-ID:20260120T090000Z\r\nDTSTART:20260120T140000Z\r\nDTEND:20260120T150000Z\r\nSUMMARY:Weekly Standup (moved)\r\nEND:VEVENT",
    ].join("\r\n")
  );

  it("replaces the original occurrence with the rescheduled one", () => {
    const out = parseEvents(parse(withOverride), OPTS);
    const moved = out.filter((e) => e.summary === "Weekly Standup (moved)");
    const original0120 = out.filter(
      (e) => e.summary === "Weekly Standup" && ymd(e.start!) === "2026-01-20"
    );
    expect(moved).toHaveLength(1); // the override is present
    expect(original0120).toHaveLength(0); // the original 01-20 is suppressed
    // Total still 5: four originals + one moved
    expect(out.filter((e) => String(e.summary).startsWith("Weekly Standup"))).toHaveLength(5);
  });
});
