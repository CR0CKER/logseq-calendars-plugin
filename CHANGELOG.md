# Changelog

Last updated: 2026-07-20 03:03 PM CDT

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [3.2.0] - 2026-07-20

Maintenance and hardening release — the result of a full security/quality audit.
No breaking changes; existing settings and templates are unaffected.

### Security

- **Neutralize `{{macro}}` markup in untrusted calendar text.** Event summary,
  description, location, and attendee names come from an external feed; an event
  the user didn't author (a meeting invite, a shared/subscribed calendar) could
  carry a `{{query}}` / `{{renderer}}` in its title or description and have it
  *execute* in the graph when rendered. `sanitizeForBlock` inserts a zero-width
  space inside each `{{`/`}}` token (visible text unchanged) at every render site.
  Page refs `[[...]]`, block refs `((...))`, and `#tags` are deliberately left
  intact so users' own bracketed/tagged event titles still link.

### Added

- **Test suite** (Jest + ts-jest): 43 tests over the parsing helpers and the
  recurrence engine — attendee-name resolution, participant formatting,
  cancelled/declined filtering, sorting, location links, template substitution,
  and (via real `.ics` fixtures) weekly expansion, EXDATE exclusion, RECURRENCE-ID
  rescheduled overrides, and the recurrence window.
- **CI** (`ci.yml`): blocking `build` / `test` / `typecheck` gates plus a
  non-blocking dependency audit; Dependabot for npm + GitHub Actions; and a
  downloadable `logseq-ical-sync-unpacked` artifact on every run for loading the
  plugin unpacked without a local build.
- `tsconfig.json` + a strict, blocking type-check; `types/url-regex-safe.d.ts`.
- README status badges + `Last updated` stamp; a `RELEASE.md` release checklist.

### Changed

- **Replaced `axios` with the built-in `fetch`** for calendar downloads and removed
  the `axios` dependency — eliminating axios' SSRF / prototype-pollution surface
  from the fetch/parse path. HTTP error handling is now correct (`fetch` doesn't
  reject on error statuses, so the status is checked explicitly; non-404 failures
  now surface a message instead of being swallowed).
- **Refactored for testability:** the framework-free helpers moved to `parsing.ts`
  and the recurrence/timezone engine to `recurrence.ts` (`parseEvents`); they no
  longer read the `logseq` global (settings are passed in). Behavior unchanged.
- Reproducible builds: release + CI install with `npm ci`; build toolchain moved to
  Node 22 with `re2` `^1.26.0` (the old pin had no Node-20 prebuilt).
- SHA-pinned all GitHub Actions with least-privilege `permissions`, and dropped the
  deprecated `actions/upload-release-asset` steps (assets now attach via
  `ncipollo/release-action`).

### Removed

- Stopped tracking `node_modules/` in git (~20k files committed despite
  `.gitignore`), and removed committed `.DS_Store` files, the vestigial `yarn.lock`,
  and the unused `tailwind` dependency.

### Fixed

- Template variables used more than once (e.g. `{Title} … {Title}`) now substitute
  at **every** occurrence instead of only the first.

## [3.1.0] - 2026

### Added

- Meeting-participant template variables: `{ConfirmedParticipants}`,
  `{TentativeParticipants}`, `{PendingParticipants}`, `{Participants}`. Named
  attendees render as `[[links]]`; nameless attendees fall back to their email.
- `participantEmailFallback` setting to omit nameless attendees instead of showing
  their email.

### Changed

- Replaced the `ti-*` font toolbar icon with an inline Tabler `calendar-down` SVG,
  removing the dependency on Logseq's bundled icon set.
- Detect email-shaped `CN` (Google writes `CN=<email>` when no display name is set)
  and treat it as nameless so it isn't turned into a broken link.

## [3.0.1]

### Changed

- Toolbar entry registered under the plugin id `logseq-ical-sync` (was the legacy
  key `open-calendar2`); toolbar icon polished.

## [3.0.0]

### Added

- Community-maintained fork of
  [sawhney17/logseq-calendars-plugin](https://github.com/sawhney17/logseq-calendars-plugin),
  published to the Logseq marketplace as **logseq-ical-sync**.

### Fixed

- Recurring events no longer cut off after 2023 (dynamic 1-year-back → 2-years-ahead range).
- Recurring event times respect their timezone across DST boundaries.
- Rescheduled recurring occurrences no longer also appear on their original date.
- Event sorting uses timezone-aware display time.
- Cancelled events are filtered out.
- Optional filtering of events the user has declined (`hideDeclinedEvents`).

[Unreleased]: https://github.com/CR0CKER/logseq-calendars-plugin/compare/v3.2.0...HEAD
[3.2.0]: https://github.com/CR0CKER/logseq-calendars-plugin/compare/v3.1.0...v3.2.0
[3.1.0]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.1.0
[3.0.1]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.0.1
[3.0.0]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.0.0
