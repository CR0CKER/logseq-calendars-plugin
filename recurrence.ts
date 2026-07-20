// recurrence.ts — the recurring-event expansion engine, extracted verbatim from
// index.ts's rawParser so it can be fixture-tested (audit finding H2, part 2).
//
// parseEvents is pure: it takes an already-parsed node-ical calendar object plus
// the resolved settings, and returns the flat, sorted list of event occurrences.
// It does no Logseq I/O. `now` is injectable so recurrence-range tests are
// deterministic. The algorithm (RRULE.between range, EXDATE exclusion,
// rescheduled-instance override, tzid-aware time reconstruction) is unchanged
// from the original — only the logseq.settings reads became parameters and the
// user-facing console/showMsg noise was dropped.

import moment from "moment-timezone";
import {
  sortDate,
  shouldFilterDeclinedEvent,
  isCancelledEvent,
  EventLike,
} from "./parsing";

export interface ParseEventsOptions {
  /** logseq.settings.userEmail */
  userEmail: string | undefined;
  /** resolved logseq.settings.hideDeclinedEvents !== false */
  hideDeclined: boolean;
  /** Reference "today" for the recurrence window; defaults to new Date(). */
  now?: Date;
}

/** The rrule object node-ical attaches to a recurring VEVENT (fields we use). */
interface RRuleLike {
  between(after: Date, before: Date, inc?: boolean): Date[];
  origOptions: { dtstart?: Date; tzid?: string };
}

/** The subset of a node-ical calendar component this engine reads. */
interface RawEvent extends EventLike {
  rrule?: RRuleLike;
  exdate?: unknown;
  recurrences?: Record<string, RawEvent>;
  start?: Date;
  end?: Date;
  [key: string]: unknown;
}

export type ParsedCalendar = Record<string, RawEvent>;

/**
 * Expand a parsed iCal calendar into a flat, sorted list of event occurrences:
 * non-recurring events pass through; recurring events are expanded across a
 * window of 1 year back to 2 years ahead, honoring EXDATE deletions and
 * rescheduled (RECURRENCE-ID) overrides. Declined (for the given user) and
 * CANCELLED occurrences are dropped.
 */
export function parseEvents(rawDataV2: ParsedCalendar, opts: ParseEventsOptions): EventLike[] {
  const { userEmail, hideDeclined } = opts;
  const eventsArray: EventLike[] = [];

  for (const dataValue in rawDataV2) {
    const event = rawDataV2[dataValue];
    if (typeof event.rrule == "undefined") {
      if (
        !shouldFilterDeclinedEvent(event, userEmail, hideDeclined) &&
        !isCancelledEvent(event)
      ) {
        eventsArray.push(event);
      }
    } else {
      const rrule = event.rrule;
      // Generate recurring events from 1 year ago to 2 years in the future
      const today = opts.now ?? new Date();
      const startDate = new Date(today.getFullYear() - 1, 0, 1, 0, 0, 0, 0);
      const endDate = new Date(today.getFullYear() + 2, 11, 31, 23, 59, 59, 999);
      const dates = rrule.between(startDate, endDate);
      if (!dates || !Array.isArray(dates) || dates.length === 0) continue;

      // Normalize exdate to an array for easier checking
      let exdateArray: unknown[] = [];
      if (event.exdate) {
        if (typeof event.exdate === "object") {
          // exdate can be an array or an object keyed by date; Object.values()
          // extracts the date values regardless of structure.
          const values = Object.values(event.exdate as Record<string, unknown>);
          exdateArray = values.filter(
            (v) =>
              v instanceof Date ||
              (v != null &&
                typeof v === "object" &&
                ((v as { getTime?: unknown }).getTime || (v as { _d?: unknown })._d))
          );
        } else {
          exdateArray = [event.exdate];
        }
      }

      try {
        dates.forEach((date: Date) => {
          // Skip dates in the EXDATE exception list (compare ignoring time).
          const isExcluded = exdateArray.some((exdate) => {
            const exd = new Date(exdate as string | number | Date);
            return (
              exd.getFullYear() === date.getFullYear() &&
              exd.getMonth() === date.getMonth() &&
              exd.getDate() === date.getDate()
            );
          });
          if (isExcluded) return;

          // Skip an occurrence that has a rescheduled override (added below).
          if (event.recurrences) {
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
              date.getDate()
            ).padStart(2, "0")}`;
            if (event.recurrences[dateKey]) return;
          }

          let newDate: Date;
          let newEndDate: Date | undefined;
          if (rrule.origOptions.tzid) {
            // tzid present — reconstruct the time in the event's timezone.
            const originalStartTime = moment.tz(rrule.origOptions.dtstart, rrule.origOptions.tzid);
            const hours = originalStartTime.hours();
            const minutes = originalStartTime.minutes();
            const seconds = originalStartTime.seconds();

            newDate = moment
              .tz(
                {
                  year: date.getFullYear(),
                  month: date.getMonth(),
                  date: date.getDate(),
                  hour: hours,
                  minute: minutes,
                  second: seconds,
                },
                rrule.origOptions.tzid
              )
              .toDate();

            if (event.end && event.start) {
              const duration = moment(event.end).diff(moment(event.start));
              newEndDate = moment(newDate).add(duration, "milliseconds").toDate();
            }
          } else {
            // tzid absent — copy the wall-clock time from the original start.
            const hours = event.start!.getHours();
            const minutes = event.start!.getMinutes();
            const seconds = event.start!.getSeconds();

            newDate = new Date(date);
            newDate.setHours(hours, minutes, seconds);

            if (event.end && event.start) {
              const duration = event.end.getTime() - event.start.getTime();
              newEndDate = new Date(newDate.getTime() + duration);
            }
          }
          const start = moment(newDate) as unknown as { _d: Date };
          const secondaryEvent = {
            ...event,
            start: start["_d"],
            end: newEndDate || event.end,
            // Preserve timezone info for proper time formatting later
            timezone: rrule.origOptions.tzid,
          } as EventLike;

          if (
            !shouldFilterDeclinedEvent(secondaryEvent, userEmail, hideDeclined) &&
            !isCancelledEvent(secondaryEvent)
          ) {
            eventsArray.push(secondaryEvent);
          }
        });
      } catch (error) {
        console.error("Error processing recurring event:", event.summary, error);
        continue;
      }

      // Add rescheduled/modified instances from the recurrences property.
      if (event.recurrences) {
        try {
          for (const recKey in event.recurrences) {
            const recEvent = event.recurrences[recKey];
            if (
              !shouldFilterDeclinedEvent(recEvent, userEmail, hideDeclined) &&
              !isCancelledEvent(recEvent)
            ) {
              eventsArray.push({
                ...recEvent,
                // Preserve timezone info if available
                timezone: rrule.origOptions.tzid,
              } as EventLike);
            }
          }
        } catch (error) {
          console.error("Error processing recurrence modifications:", event.summary, error);
        }
      }
    }
  }
  return sortDate(eventsArray);
}
