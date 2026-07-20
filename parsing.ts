// parsing.ts — pure, framework-free helpers extracted from index.ts so they can
// be unit-tested without a live Logseq environment (audit finding H2).
//
// None of these functions read the `logseq` global: settings that used to be read
// from `logseq.settings` inside the function body (hideDeclinedEvents,
// participantEmailFallback) are now passed in explicitly by the caller. Behavior
// is otherwise identical to the original in index.ts.

import urlRegexSafe from "url-regex-safe";

/** One attendee entry as node-ical exposes it (only the fields we read). */
export interface ICalAttendee {
  val?: string;
  params?: { CN?: string; PARTSTAT?: string };
}

/** The subset of a node-ical VEVENT that these helpers touch. */
export interface EventLike {
  attendee?: ICalAttendee | ICalAttendee[];
  status?: string | { val?: string };
  summary?: string;
  start?: Date | string | number;
}

/**
 * Filter out events with a missing/invalid start, then sort ascending by
 * absolute (UTC) start time — which matches the displayed local order.
 */
export function sortDate<T extends { start?: Date | string | number }>(data: T[]): T[] {
  const validEvents = data.filter((event) => {
    if (!event.start) return false;
    const startDate = new Date(event.start);
    if (isNaN(startDate.getTime())) return false;
    return true;
  });

  return validEvents.sort(
    (a, b) =>
      Math.round(new Date(a.start!).getTime() / 1000) -
      Math.round(new Date(b.start!).getTime() / 1000)
  );
}

/**
 * True if the given user (by email) has PARTSTAT=DECLINED on this event and
 * declined-hiding is enabled. `hideDeclined` is the resolved setting value
 * (logseq.settings.hideDeclinedEvents !== false) supplied by the caller.
 */
export function shouldFilterDeclinedEvent(
  event: EventLike,
  userEmail: string | undefined,
  hideDeclined: boolean
): boolean {
  // Only filter if email is configured and the feature is enabled.
  if (!userEmail || userEmail.trim() === "" || !hideDeclined) {
    return false;
  }
  if (!event.attendee) {
    return false;
  }

  const attendees = Array.isArray(event.attendee) ? event.attendee : [event.attendee];
  const normalizedUserEmail = userEmail.trim().toLowerCase();

  const userAttendee = attendees.find((attendee) => {
    if (!attendee.val) return false;
    const attendeeEmail = attendee.val.replace("mailto:", "").toLowerCase();
    return attendeeEmail === normalizedUserEmail;
  });

  if (userAttendee && userAttendee.params?.PARTSTAT === "DECLINED") {
    console.log(`Filtering declined event: ${event.summary}`);
    return true;
  }

  return false;
}

/**
 * Resolve an attendee's display name, or null if it has none. An email-shaped CN
 * is treated as "no name" — some providers (notably Google) set CN to the
 * attendee's own email when no real display name is shared, and turning that into
 * a [[link]] would be wrong.
 */
export function getAttendeeName(attendee: ICalAttendee | undefined): string | null {
  const cn = attendee?.params?.CN;
  if (!cn) return null;
  const trimmed = String(cn).trim();
  if (trimmed === "") return null;
  const email = attendee?.val
    ? attendee.val.replace(/^mailto:/i, "").trim().toLowerCase()
    : "";
  if (email && trimmed.toLowerCase() === email) return null;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * Comma-separated participant list for the given PARTSTAT values. Named attendees
 * are wrapped in [[...]]; nameless attendees fall back to their bare email unless
 * `emailFallback` is false, in which case they are omitted. The user themselves
 * (matched against userEmail) is always excluded. Empty list -> "".
 */
export function formatParticipants(
  event: EventLike,
  statuses: string[],
  userEmail: string | undefined,
  emailFallback: boolean
): string {
  if (!event.attendee) return "";
  const attendees = Array.isArray(event.attendee) ? event.attendee : [event.attendee];
  const normalizedUserEmail = userEmail ? userEmail.trim().toLowerCase() : "";
  const entries: string[] = [];
  for (const a of attendees) {
    const partstat = (a?.params?.PARTSTAT || "NEEDS-ACTION").toUpperCase();
    if (!statuses.includes(partstat)) continue;
    const email = a?.val ? a.val.replace(/^mailto:/i, "").toLowerCase() : "";
    if (normalizedUserEmail && email === normalizedUserEmail) continue; // exclude self
    const name = getAttendeeName(a);
    if (name) {
      entries.push(`[[${name}]]`);
    } else if (emailFallback && a?.val) {
      entries.push(a.val.replace(/^mailto:/i, ""));
    }
  }
  return entries.join(", ");
}

/** True if the event's STATUS is CANCELLED (handles string or {val} shapes). */
export function isCancelledEvent(event: EventLike): boolean {
  if (!event.status) {
    return false;
  }
  const statusValue =
    typeof event.status === "string" ? event.status : event.status.val || event.status;
  const normalizedStatus = statusValue.toString().toUpperCase().trim();
  if (normalizedStatus === "CANCELLED") {
    console.log(`Filtering cancelled event: ${event.summary}`);
    return true;
  }
  return false;
}

/**
 * Turn any URLs inside a location string into Markdown links labelled with the
 * host (e.g. "meet.google.com/..."). ReDoS-safe URL matching via url-regex-safe.
 */
export function parseLocation(rawLocation: string): string {
  const matches = rawLocation.match(urlRegexSafe());
  let parsed = rawLocation;
  let linkDesc: string;

  if (!matches || matches.length === 0) {
    return parsed;
  }

  for (const match of matches) {
    try {
      const url = new URL(match);
      linkDesc = url.hostname + "/...";
    } catch (e) {
      // If the regex returns something URL() rejects, just use the whole link.
      linkDesc = match;
    }
    parsed = parsed.replace(match, "[" + linkDesc + "](" + match + ")");
  }
  return parsed;
}

/**
 * Substitute the {Placeholder} variables in a user template. Every occurrence of
 * each variable is replaced (both exact-case and lower-case spellings).
 */
export function templateFormatter(
  template: string,
  description = "No Description",
  date = "No Date",
  start = "No Start",
  end = "No End",
  title = "No Title",
  location = "No Location",
  confirmedParticipants = "",
  tentativeParticipants = "",
  pendingParticipants = "",
  allParticipants = ""
): string {
  const properDescription = description === "" ? "No Description" : description;
  const properLocation = location === "" ? "No Location" : location;
  const parsedLocation = parseLocation(properLocation);
  const subsitutions: Record<string, string> = {
    "{Description}": properDescription,
    "{Date}": date,
    "{Start}": start,
    "{End}": end,
    "{Title}": title,
    "{RawLocation}": properLocation,
    "{Location}": parsedLocation,
    "{ConfirmedParticipants}": confirmedParticipants,
    "{TentativeParticipants}": tentativeParticipants,
    "{PendingParticipants}": pendingParticipants,
    "{Participants}": allParticipants,
  };
  let templatex1 = template;

  for (const substitute in subsitutions) {
    // replaceAll (not replace) so a variable used more than once in a template
    // — e.g. "{Title} … {Title}" — is substituted at every occurrence, not just
    // the first. Both the exact-case and lower-case spellings are replaced.
    const template2 = templatex1.replaceAll(substitute, subsitutions[substitute]);
    const template3 = template2.replaceAll(substitute.toLowerCase(), subsitutions[substitute]);
    templatex1 = template3;
  }
  return templatex1;
}
