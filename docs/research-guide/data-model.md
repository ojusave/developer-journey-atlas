# Developer Journey Atlas data model

## Canonical datasets

Developer Journey Atlas has two independent canonical datasets:

1. `packages/journey-corpus/records/*.json` reconstructs one official-documentation route for each platform.
2. `packages/blocker-taxonomy/first-mile-blocker-universe.md` inventories possible blocker hypotheses using stable historical IDs.

Neither dataset proves why a real developer stopped. The journey corpus describes documented route shape. The blocker taxonomy describes explanations that may be tested against evidence from a specific attempt.

The [diagnosis evidence contract](diagnosis-evidence-contract.md) keeps catalog-level eligibility separate from attempt-level support. Both gates must pass before an individual reason can be returned as a supported hypothesis.

## Generated identifiers

The imported journey records have stable platform slugs but do not yet contain canonical journey IDs. Generated views use `journey:<platform-slug>:documented-primary` as a deterministic compatibility ID. Do not treat that generated ID as authority for a future second journey. Adding multiple journeys requires a reviewed canonical journey-identity migration.

Blocker IDs such as `U04.03` remain canonical and unchanged.

## Generated views

`packages/generated-views/atlas.md` is the human projection. `atlas.jsonl` is the LLM retrieval projection. `index.json` records their hashes and source boundaries.

Generated views are disposable. Edit the canonical journey record or blocker taxonomy, run `npm run atlas:views`, and review the resulting diff.

## Evidence boundaries

- `documented`: directly supported by the official sources referenced by a journey field.
- `inferred`: a hypothesis or relationship that needs case evidence.
- `unresolved`: the inspected documentation does not establish the transition or answer.
- `not_diagnosis_eligible`: the taxonomy item cannot be returned as an individual diagnosis.

`diagnosis_eligible` is a catalog-level property. It does not mean that the reason is supported for every attempt. Attempt-level support must be recomputed from active case evidence.

The imported journey schema retains its original, more detailed research statuses. The combined views do not silently upgrade those statuses.
