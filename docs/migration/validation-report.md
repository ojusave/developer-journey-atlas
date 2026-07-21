# Developer Journey Atlas validation report

## Result

Status: **PASS**

Evidence state: **ARTIFACT VERIFIED**

This result verifies the local migration artifact on `migration/developer-journey-atlas`. Migration verification alone did not approve publication. The subsequent public release is documented below. Neither step proves research freshness or validates the future UI with real users.

Integration commit: `23464708b766710bf3c6334bba78e3abb2987e53`

## Source preservation

- The journey corpus was imported from commit `dd23053647944efefc1bec68d1897a369b495055` using an unsquashed Git subtree.
- 285 imported files remain byte-identical to that source commit. The package README, package manifest, and package lock metadata changed only to implement the approved dual-license boundary, with their original blobs retained in the migration map.
- The blocker taxonomy SHA-256 remains `54c7cc6b9512dfe59bb1468537f122357f41a5693b254a405d173e89a6a08341` after its path-only move.
- The canonical counts remain 205 platform records, 790 blocker reasons, 28 universal families, and 16 platform archetypes.
- The migration map covers all 375 source paths. Every transformation is approved under a named evidence class in the human review gate.

## Canonical publication

- The canonical repository is `https://github.com/ojusave/developer-journey-atlas`.
- It was created private with `main` as its default branch.
- The first published commit was `0bfc24faae81fd2b48c465ed3a7b1682b802087e`.
- GitHub Actions run `29868804912` passed the Node 22 and data-integrity job and the full-history secret scan.
- A public-release audit corrected a stale claim about historical Render resources before visibility changed.
- Public release commit `4e0854b298409caff9bbcdac7af8f009ebd5c355` passed GitHub Actions run `29869690383`.
- Anonymous repository, contents, archive, and Git access were verified after the visibility changed to public.
- Private vulnerability reporting and dependency alerts are enabled.
- The scanner source repository received canonical notice commit `42129c2` and the journey-corpus source repository received canonical notice commit `b904ffb`.
- Both source repositories are archived read-only. Neither was deleted.
- Both active research static sites remained on source commit `dd23053647944efefc1bec68d1897a369b495055`; the pointer commit used Render's documented `[skip render]` mechanism and did not deploy.

## Automated verification

The final local verification passed on 2026-07-21:

| Check | Result |
| --- | --- |
| Scanner application tests | 114 passed |
| Scanner Workflow tests | 4 passed |
| Journey-corpus regression tests | 6 passed |
| Journey-corpus application tests | 15 passed |
| Journey record validation | 205 records, 0 validation errors |
| Scanner type checks | passed |
| Scanner production build | passed |
| Workflow type check and build | passed |
| Journey deterministic generation check | passed |
| Atlas integrity checks | 24 passed |
| Browser end-to-end and accessibility smoke test | passed |
| In-memory API load smoke test | 100 completed, 0 failed |

The Atlas integrity checks compile all three strict JSON Schemas, verify imported Git blobs and source hashes, verify all 79 unchanged scanner blobs, review four license metadata changes, verify generated-view hashes, parse all 1,040 JSONL records independently, confirm that all 790 blocker hypotheses remain `not_diagnosis_eligible`, classify all 375 original files, and prove that every mapped destination path is unique.

The browser smoke test covered the supported diagnostic flow, insufficient-evidence handling, a corrected journey, legitimate completion with no drop-off, exports, persistence, deletion, accessibility, offline behavior, and layouts from 320 px through 1280 px. The API load smoke test completed 100 concurrent in-memory sessions with no failures.

## Generated outputs

- Human index: `packages/generated-views/atlas.md`
- Human platform records: `packages/generated-views/platforms/*.md`
- Human blocker reference: `packages/generated-views/blockers.md`
- LLM retrieval records: `packages/generated-views/atlas.jsonl`
- Generated hashes and counts: `packages/generated-views/index.json`

Generated outputs are derived views. They must be regenerated from the canonical sources and reviewed as diffs, not edited as new evidence.

## Security and privacy preflight

Gitleaks 8.30.1 scanned the entire reachable migration history. Its two initial alerts were manually verified UUID fixtures, not credentials; the exact fingerprints are documented and the final scan passes with no findings. The earlier pattern scan also found no private-key, GitHub-token, AWS-key, OpenAI-key, or Render-key signatures. Tracked environment examples contain blank or placeholder credentials.

## Environment and limitations

- The full suite and browser flow passed in a fresh checkout using the official Node 22.22.0 macOS ARM64 binary and npm 10.9.4. The downloaded archive matched Node's published SHA-256.
- The production build emits an existing warning for a client chunk larger than 500 kB. The build still passes.
- A clean npm audit reports three moderate and two low transitive advisories through optional Mastra dependencies. There are no high or critical findings. The optional Mastra path is disabled by default. This is a tracked maintenance risk, not a high or critical release blocker.
- No live platform research was performed during migration.
- No causal drop-off reason, prevalence claim, or comparison conclusion was created from the taxonomy.
- No user study or ADHD-language comprehension test was performed.
- The canonical remote repository was created private, audited, and later made public. No production resource or deployment was changed during publication.

## Reproduce

Install dependencies in both the repository root and `packages/journey-corpus`, then run:

```sh
npm run test:all
npm run typecheck
npm run build
npm --prefix workflows run typecheck
npm --prefix workflows run build
npm run journey:check
```
