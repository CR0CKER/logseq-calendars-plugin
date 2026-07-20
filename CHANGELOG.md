# Changelog

Last updated: 2026-07-20 02:02 PM CDT

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- **CI now uploads the built plugin as a downloadable artifact**
  (`logseq-ical-sync-unpacked`) on every push/PR, so it can be loaded unpacked in
  Logseq for testing without a local build (Parcel's `lmdb` native dependency has
  no arm64 prebuilt). See `RELEASE.md`.
- **SHA-pin all GitHub Actions and drop the deprecated release-upload steps**
  (audit finding **L2**). `ncipollo/release-action` and the first-party
  `actions/checkout` / `actions/setup-node` are now pinned to full commit SHAs
  (with a version comment) instead of mutable major tags, so a moved tag can't
  substitute action code; Dependabot's github-actions updates keep the pins
  current. In `publish.yml`, the two archived `actions/upload-release-asset@v1`
  steps were removed — `ncipollo/release-action` attaches the release zip and
  `package.json` via its `artifacts` input — and an explicit least-privilege
  `permissions: contents: write` was added.

### Security

- **Neutralize `{{macro}}` markup in untrusted calendar text** (audit finding
  **M1**). Event summary, description, location, and attendee names come from an
  external feed; an event the user didn't author (a meeting invite, a shared or
  subscribed calendar) could carry a `{{query}}` / `{{renderer}}` in its title or
  description and have it *execute* in the user's graph when rendered. A new
  `sanitizeForBlock` helper inserts a zero-width space inside each `{{`/`}}` token
  (visible text unchanged, no longer parsed as a macro) at every render site.
  Page refs `[[...]]`, block refs `((...))`, and `#tags` are deliberately left
  intact — they are inert and users legitimately put them in their own event
  titles/descriptions and want them to link. Covered by tests.

### Added

- **Recurrence engine tests** (audit finding **H2**, part 2): `recurrence.test.ts`
  parses real `.ics` fixtures with node-ical and asserts on the expanded output —
  weekly expansion, EXDATE exclusion, RECURRENCE-ID rescheduled overrides, the
  recurrence window, and CANCELLED filtering (37 tests total across the suite).
- **`typecheck` is now a blocking CI gate.** The codebase is strict-clean
  (`tsc --noEmit` reports 0 errors, down from 65) after the extraction and light
  annotation of the remaining `index.ts` adapter functions (audit finding **M3**).

### Changed

- **Extracted the recurrence/timezone engine** from `index.ts`'s `rawParser` into a
  new pure `recurrence.ts` (`parseEvents`), with the reference "now" injectable for
  deterministic tests and settings passed in by the caller. `rawParser` is now a
  thin wrapper that parses the feed and delegates. The RRULE/EXDATE/RECURRENCE-ID
  algorithm is unchanged (audit finding **H2**, part 2).

- **Unit test suite** (Jest + ts-jest) for the parsing helpers, run as a blocking
  CI gate (audit finding **H2**, part 1). 31 tests covering attendee-name
  resolution, participant formatting, cancelled/declined filtering, event sorting,
  location link-wrapping, and template substitution — including a **regression
  test for L1** (a repeated template variable is replaced at every occurrence),
  verified to fail against the pre-fix `String.replace` code.
- `types/url-regex-safe.d.ts` — minimal type declaration for the untyped
  `url-regex-safe` package, so the extracted module type-checks clean.

### Changed

- **Extracted the framework-free helpers** (`sortDate`, `shouldFilterDeclinedEvent`,
  `getAttendeeName`, `formatParticipants`, `isCancelledEvent`, `parseLocation`,
  `templateFormatter`) from `index.ts` into a new **`parsing.ts`** module so they
  can be unit-tested without a live Logseq environment. These no longer read the
  `logseq` global — settings (`hideDeclinedEvents`, `participantEmailFallback`) are
  passed in by the caller. Behavior is unchanged. The recurrence/timezone engine
  in `rawParser` is extracted separately in a follow-up (audit H2, part 2). This
  dropped the `tsc` error count from 65 to 50.
- **Replaced `axios` with the built-in `fetch`** for calendar downloads and removed
  the `axios` dependency. This eliminates axios from the plugin's fetch/parse path —
  the surface behind axios' SSRF and prototype-pollution advisories (audit finding
  **H3**). Calendar data is fetched with `fetch` and parsed from a string via
  `node-ical`'s synchronous `parseICS`, so no HTTP client touches the response body.
  - Error handling is now correct: `fetch` does not reject on HTTP error statuses,
    so the response status is checked explicitly (the old `axios` code string-matched
    a 404 error message that `fetch` never produces, and silently swallowed other
    failures). Non-404 failures now surface a message to the user.
  - Note: `node-ical` still pulls `axios@0.24` transitively, but it is not on the
    plugin's code path (only its URL-fetch helpers use it, which the plugin doesn't
    call). Fully removing it requires a `node-ical` major bump — deferred until the
    parser test suite exists (audit H2); Dependabot will surface it.

### Added

- **CI workflow** (`.github/workflows/ci.yml`) on every PR and push to `main`:
  a blocking `build` gate plus informational `typecheck` and `npm audit` jobs
  (non-blocking until the typing and dependency buckets land). (audit finding **M2**)
- **`tsconfig.json`** and a `typecheck` npm script (`tsc --noEmit`, strict target).
  Enforced non-blocking for now — flip to a required check once `index.ts` is typed.
  (audit finding **M3**)
- **`.github/dependabot.yml`** — weekly npm + github-actions update PRs, so the
  dependency tree and action pins stop rotting. (audit finding **M2**)
- README status-badge row (CI, latest release, license) and a `Last updated` stamp.

### Changed

- Release workflow (`publish.yml`) now installs with `npm ci` (was `npm install`)
  for reproducible, lockfile-pinned builds. (audit finding **M2**)
- Bumped the build toolchain to **Node 22** (both workflows) and **`re2` to
  `^1.26.0`**. The old `re2@1.17.7` had no Node-20 prebuilt binary and only
  built because a compiled binary was committed inside `node_modules`; once that
  was untracked (finding H1), a clean `npm ci` had to compile re2 from source and
  failed on Node 20. `re2@1.26` ships a prebuilt but requires Node ≥22. The Node
  version affects only the build toolchain, not the browser-bundled plugin.

### Removed

- **Stop tracking `node_modules/` in git.** The entire dependency tree (~20k files)
  was committed despite being listed in `.gitignore`. It is now untracked; the build
  installs from `package-lock.json` as intended. (audit finding **H1**)
- Untracked committed `.DS_Store` files (root and `.github/`). (audit finding **L3**)
- Removed the vestigial `yarn.lock`. The project builds with `npm` /
  `package-lock.json`; the second lockfile was unused and a source of drift.
- Dropped the unused `tailwind` dependency from `package.json` — it was declared but
  never imported, and pulled in a large transitive tree (including advisory-bearing
  packages). Lockfile regenerated. (audit finding **L3**)

### Fixed

- Template variables used more than once in a single template (e.g.
  `{Title} … {Title}`) now substitute at **every** occurrence instead of only the
  first, by switching `templateFormatter` from `String.replace` to `replaceAll`.
  (audit finding **L1**)

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

[Unreleased]: https://github.com/CR0CKER/logseq-calendars-plugin/compare/v3.1.0...HEAD
[3.1.0]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.1.0
[3.0.1]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.0.1
[3.0.0]: https://github.com/CR0CKER/logseq-calendars-plugin/releases/tag/v3.0.0
