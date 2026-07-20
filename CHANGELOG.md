# Changelog

Last updated: 2026-07-20 12:31 PM CDT

All notable changes to this project are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
