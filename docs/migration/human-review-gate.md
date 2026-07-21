# Developer Journey Atlas human review gate

## Recommendation

The local artifact is safe to review and continue developing. It is **not yet approved or safe to publish** because licensing, dependency advisories, and repository-publication decisions remain open.

Human approval is still required before any push, remote rename, deployment change, source-repository archival, or public release.

## Recorded commits

- Original scanner: `5c6f8cf1c89abbc617f8113cd96d54311df2fcda`
- Original journey corpus: `dd23053647944efefc1bec68d1897a369b495055`
- History-preserving import merge: `de1fb7dfc7ddcd9cd54669f625ee01c9349baa19`
- Integrated Atlas data layer: `23464708b766710bf3c6334bba78e3abb2987e53`

## What was merged

- All 288 tracked journey-corpus files, imported byte-identically under `packages/journey-corpus/` with their Git history.
- The scanner application and its existing generated runtime blocker catalog.
- The canonical blocker taxonomy, moved with 100 percent rename similarity into `packages/blocker-taxonomy/`.
- New generated human and LLM views, strict intake and output schemas, validation scripts, comparison artifacts, and research-boundary documentation.

No tracked source file was intentionally excluded. Git metadata and ignored local artifacts such as dependency directories, builds, screenshots, and local loop state were not copied as research content.

## What changed or was transformed

- The blocker taxonomy path changed. Its bytes and SHA-256 did not change.
- Four existing scanner integration files were edited: `README.md`, `package.json`, `scripts/build-catalog.mjs`, and `src/generated/catalog.json`.
- `packages/generated-views/` contains derived projections. These are duplicates by design for human reading and LLM retrieval, but they are not canonical evidence.
- `packages/journey-corpus/` retains its original generated artifacts and its existing application because deleting or refactoring them during the preservation migration would weaken provenance and rollback safety.
- Seven source paths existed in both repositories with different content: `.env.example`, `.gitignore`, `README.md`, `package-lock.json`, `package.json`, `render.yaml`, and `tsconfig.json`. All seven were isolated under the package boundary. None was overwritten.
- Twenty-one same-filename, different-content pairs were reported for review. See `repository-comparison.json` for exact paths and Git blobs.

Every original path and transformation is listed in `migration-map.json`. All 375 entries are approved under one of five explicit evidence classes: 285 byte-identical imports, four reviewed license metadata changes, 79 unchanged scanner blobs, one path-only taxonomy move, and six reviewed compatibility edits.

## Preservation evidence

- 205 of 205 platform records preserved
- 790 of 790 blocker reasons preserved
- 28 of 28 universal blocker families preserved
- 16 of 16 platform archetypes preserved
- 285 research and implementation files remain byte-identical to their imported Git blobs
- three imported license metadata files changed after approval, with their original Git blobs retained in the migration map
- one scanner lockfile changed only to reflect the approved package license, with its original Git blob retained in the migration map
- 0 duplicate platform slugs
- 0 mapped destination collisions
- 1,040 independently parseable LLM retrieval records
- 790 blocker hypotheses explicitly ineligible for diagnosis without attempt-level evidence

## Privacy findings

Gitleaks 8.30.1 scanned the entire reachable migration history. It initially reported two UUID-shaped `idempotencyKey` fixtures in `workflows/README.md` and `workflows/test/diagnostic-turn.test.ts`; manual inspection confirmed both are non-secret test values. Their exact fingerprints are documented in `.gitleaksignore`, and the final full-history scan passes with no findings. Tracked `.env.example` files contain placeholders or blank values. No raw user answers were added, and no actual credential was found.

## Validation

The full result and limitations are in `validation-report.md`. The automated suite, browser smoke test, accessibility checks, offline check, and 100-session API load smoke test passed. No live research was run.

## Remaining risks and decisions

See `unresolved-decisions.md`. The highest-consequence items are licensing, public repository ownership, deployment cutover, and the evidence threshold for returning any diagnosis.

## Local rollback and recovery

The migration branch can be left without deleting it:

```sh
cd /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/scanner-app
git switch main
```

The original repositories can be reconstructed into a new temporary directory from the verified bundles:

```sh
rollback_root="$(mktemp -d /tmp/developer-journey-atlas-rollback.XXXXXX)"
git bundle verify /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/scanner.bundle
git bundle verify /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/data.bundle
git clone /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/scanner.bundle "$rollback_root/scanner"
git clone /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/data.bundle "$rollback_root/data"
git -C "$rollback_root/scanner" switch --detach 5c6f8cf1c89abbc617f8113cd96d54311df2fcda
git -C "$rollback_root/data" switch --detach dd23053647944efefc1bec68d1897a369b495055
```

The tracked-file archives are also available at:

- `/Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/scanner-tracked.tar.gz`
- `/Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/migration-backups/2026-07-21/data-tracked.tar.gz`

No destructive rollback command is required, and none should be used.
