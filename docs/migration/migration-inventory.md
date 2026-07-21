# Developer Journey Atlas migration inventory

## Decision

The existing scanner repository was the local integration destination. The canonical remote is the private `ojusave/developer-journey-atlas` repository. Both source repositories remain unchanged and unarchived. Infrastructure identifiers remain unchanged until a separate approval.

## Baselines

| Source | Commit | Tree | Tracked files | Canonical data |
| --- | --- | --- | ---: | --- |
| Scanner | `5c6f8cf1c89abbc617f8113cd96d54311df2fcda` | `231dbbd4404c9d61f90da51abec3376ca63ad05f` | 87 | 790 blocker reasons, 28 universal families, 16 platform archetypes |
| Journey corpus | `dd23053647944efefc1bec68d1897a369b495055` | `947923e9d17122de879785159c28cf2bfa3121c9` | 288 | 205 canonical platform records |

## Repository metadata

- Scanner: default branch `main`; observed branches `main`; no observed tags; npm with package-lock.json; Node 22.22.0.
- Journey corpus: default branch `main`; observed branches `main`, `ds-analytical-honesty`, `ds-ready-integrity`; no observed tags; npm with package-lock.json; No Node engine or version file declared.
- Source remotes were the two GitHub repositories recorded in `migration-manifest.json`. The added `journey-data-source` remote is local-only and points to the recoverable source clone.

The scanner baseline passed 114 application tests, 4 Workflow tests, type checks, and builds. The journey-corpus baseline passed 6 regression tests, 15 application tests, record validation, deterministic generation checks, and the TypeScript build.

The scanner declares Node 22.22.0. Baseline checks first ran on Node 24.13.0, then the complete suite and browser flow passed in a fresh checkout using the verified official Node 22.22.0 macOS ARM64 binary.

## File classification

- Canonical platform research: `packages/journey-corpus/records/*.json`
- Canonical journey schema and validation: `packages/journey-corpus/record.schema.json` and `packages/journey-corpus/validate-records.mjs`
- Canonical blocker taxonomy: `packages/blocker-taxonomy/first-mile-blocker-universe.md`
- Deployable scanner: existing root application, server, Workflow, and deployment files
- Generated platform artifacts: files documented by `packages/journey-corpus/README.md`
- Combined generated views: `packages/generated-views/atlas.md`, `atlas.jsonl`, and `index.json`
- Intake, comparison, and diagnosis contracts: root `schemas/` and `docs/research-guide/`

The path-level classification for all 375 original files is in `migration-map.json`. Files with `.env` names are flagged as potentially sensitive even when they are tracked examples. Exact-content duplicates, same-path conflicts, source-only files, same-name differences, schema candidates, generated candidates, and tracked-file sizes are in `repository-comparison.json`.

## Repository comparison

| Category | Count |
| --- | ---: |
| Same path and same content | 0 |
| Same path and different content | 7 |
| Scanner-only paths | 80 |
| Journey-corpus-only paths | 281 |
| Cross-repository exact-content groups | 0 |
| Same-filename, different-content pairs | 21 |
| Duplicate platform slugs | 0 |

## Privacy and import audit

- No private-key, GitHub-token, AWS-key, OpenAI-key, or Render-key signatures were found in tracked history using the local pattern audit.
- Both tracked `.env.example` files contain placeholders or blank secret fields, not credentials.
- Gitleaks 8.30.1 scanned the entire reachable migration history. Two initial alerts were manually verified UUID fixtures, not credentials; the exact fingerprints are documented and the final scan passes with no findings.
- The data repository was imported with full history using an unsquashed Git subtree.
- Source Git bundles and tracked-file archives are stored outside this repository under the dated migration backup directory.

## Canonical ownership

The journey corpus and blocker taxonomy are independent canonical datasets. Generated runtime and retrieval catalogs may combine them, but neither dataset is represented as being generated from the other.

## Exclusions

- No repository, package, database, environment variable, Render resource, or remote URL was renamed.
- No UI redesign was performed.
- No live platform research was run.
- No production change, deployment, push, archive, or publication was performed.
