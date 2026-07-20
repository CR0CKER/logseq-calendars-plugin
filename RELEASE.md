# Release checklist

Last updated: 2026-07-20 01:55 PM CDT

How to cut a release of **logseq-ical-sync**, and the manual checks that CI can't
do for us. Releases are built by `.github/workflows/publish.yml`, which fires on
any pushed git tag.

## Why the manual steps exist

Two things are **not** covered by the CI gates and must be verified by hand:

1. **Runtime behavior in Logseq.** CI builds and type-checks the bundle and runs the
   unit tests, but it never loads the plugin in a real Logseq/Electron renderer. The
   calendar fetch (`fetch`, since we dropped axios) and the block rendering only run
   there.
2. **The release workflow itself.** `publish.yml` is tag-triggered, so a pull request
   never exercises it. The first tag after any change to that workflow is the first
   time it actually runs.

## 1. Pre-release smoke test (in Logseq)

Load the current `main` build as an unpacked/dev plugin and confirm:

- [ ] **Fetch works.** Sync at least one real calendar over HTTPS (Google / iCloud /
      Outlook iCal URL). Events appear in the daily note — this exercises the
      `fetch` path that replaced axios (cross-origin + redirects).
- [ ] **A bad URL fails cleanly.** Point a calendar at a 404 URL → "Calendar not
      found: Check your URL"; a broken/unreachable URL → the generic fetch-error
      message. No silent failure.
- [ ] **Recurring events are correct.** A weekly/monthly recurring event shows on the
      right days; a deleted occurrence (EXDATE) is absent; a rescheduled occurrence
      shows once, on its new time (not also the original).
- [ ] **Timezone is right.** An event created in a non-local timezone shows at the
      correct local time, including across a DST boundary.
- [ ] **Declined / cancelled filtering.** With your email set, a declined event is
      hidden (when the setting is on); a cancelled event never appears.
- [ ] **Rendering / sanitization.** An event title containing `[[Some Page]]` renders
      as a real Logseq link, and `#tag` as a real tag (these are intentionally kept).
      An event containing `{{query ...}}` shows as literal text and does **not**
      execute.
- [ ] **Participants** (if your feed includes attendees) render as `[[Name]]` links.

## 2. Cut the release

- [ ] **Bump `version` in `package.json`** to the new semver. The release asset
      includes `package.json`, and Logseq uses that version to detect updates, so the
      **tag and the `package.json` version must match** (tag `v3.2.0` → version
      `3.2.0`).
- [ ] Commit the bump (through a PR — `main` is protected) and merge it.
- [ ] Update `CHANGELOG.md`: move the relevant `[Unreleased]` notes under a new
      version heading, and add the compare/tag links at the bottom.
- [ ] Tag and push from an up-to-date `main`:
      ```bash
      git tag vX.Y.Z
      git push origin vX.Y.Z
      ```
- [ ] Watch the workflow:
      ```bash
      gh run watch -R CR0CKER/logseq-calendars-plugin
      # or: gh run list -R CR0CKER/logseq-calendars-plugin --workflow="Build plugin" --limit 1
      ```
      > `gh` gotcha: if this checkout ever gains an `upstream` remote, pass
      > `-R CR0CKER/logseq-calendars-plugin` so `gh` doesn't target the upstream repo.

## 3. Verify the release (after the workflow finishes)

- [ ] The GitHub Release for the tag exists and is **not** a draft:
      https://github.com/CR0CKER/logseq-calendars-plugin/releases
- [ ] It has **both** assets attached:
      - `logseq-ical-sync-vX.Y.Z.zip`
      - `package.json`
      ```bash
      gh release view vX.Y.Z -R CR0CKER/logseq-calendars-plugin --json assets \
        --jq '.assets[].name'
      ```
- [ ] The zip, unzipped, contains `dist/`, `package.json`, `README.md`, `icon.png`,
      and the `package.json` version inside matches the tag.

## 4. Marketplace

The [logseq/marketplace](https://github.com/logseq/marketplace) entry points at this
repo and the installer fetches the **latest release**, so most releases need **no**
marketplace action — just tag and the update propagates.

- [ ] Only open a marketplace PR if the **manifest** itself changed (title,
      description, icon, or flags in `packages/logseq-ical-sync/manifest.json`).

## Rollback

If a release is broken, cut a new patch release with the fix — don't delete the tag
(users may already have it). If the workflow failed mid-way, fix forward and re-tag a
new patch version; `allowUpdates: true` lets the release action update an existing
release for the same tag if you must re-run it.
