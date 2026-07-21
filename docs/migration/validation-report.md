# Developer Journey Atlas validation report

## Result

Status: **PASS**

Evidence state: **ARTIFACT VERIFIED**

This result verifies the local migration artifact on `migration/developer-journey-atlas`. It does not approve publication, prove research freshness, or validate the future UI with real users.

Integration commit: `23464708b766710bf3c6334bba78e3abb2987e53`

## Source preservation

- The journey corpus was imported from commit `dd23053647944efefc1bec68d1897a369b495055` using an unsquashed Git subtree.
- All 288 imported files remain byte-identical to that source commit.
- The blocker taxonomy SHA-256 remains `54c7cc6b9512dfe59bb1468537f122357f41a5693b254a405d173e89a6a08341` after its path-only move.
- The canonical counts remain 205 platform records, 790 blocker reasons, 28 universal families, and 16 platform archetypes.
- The migration map covers all 375 source paths. Every transformation remains explicitly unapproved pending human review.

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
| Atlas integrity checks | 22 passed |
| Browser end-to-end and accessibility smoke test | passed |
| In-memory API load smoke test | 100 completed, 0 failed |

The Atlas integrity checks compile all three strict JSON Schemas, verify imported Git blobs and source hashes, verify generated-view hashes, parse all 1,040 JSONL records independently, confirm that all 790 blocker hypotheses remain `not_diagnosis_eligible`, classify all 375 original files, and prove that every mapped destination path is unique.

The browser smoke test covered the supported diagnostic flow, insufficient-evidence handling, a corrected journey, legitimate completion with no drop-off, exports, persistence, deletion, accessibility, offline behavior, and layouts from 320 px through 1280 px. The API load smoke test completed 100 concurrent in-memory sessions with no failures.

## Generated outputs

- Human index: `packages/generated-views/atlas.md`
- Human platform records: `packages/generated-views/platforms/*.md`
- Human blocker reference: `packages/generated-views/blockers.md`
- LLM retrieval records: `packages/generated-views/atlas.jsonl`
- Generated hashes and counts: `packages/generated-views/index.json`

Generated outputs are derived views. They must be regenerated from the canonical sources and reviewed as diffs, not edited as new evidence.

## Security and privacy preflight

A local pattern scan found no private-key, GitHub-token, AWS-key, OpenAI-key, or Render-key signatures in tracked history. Tracked environment examples contain blank or placeholder credentials. This is a preflight result, not a substitute for a dedicated secret scanner before publication.

## Environment and limitations

- Verification ran on Node 24.13.0. Both source repositories declare Node 22, so a clean Node 22 run remains required before publication.
- The production build emits an existing warning for a client chunk larger than 500 kB. The build still passes.
- No live platform research was performed during migration.
- No causal drop-off reason, prevalence claim, or comparison conclusion was created from the taxonomy.
- No user study or ADHD-language comprehension test was performed.
- No remote repository, deployment, archive, or production resource was changed.

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
