# LLM retrieval guide

Start with `packages/generated-views/index.json`, then stream `atlas.jsonl` one line at a time.

## Record types

- `atlas_metadata`: corpus-wide interpretation rules and counts.
- `platform_journey`: one documented platform route with sources, steps, gates, and unknowns.
- `blocker_group`: a universal family or platform archetype.
- `blocker_hypothesis`: one possible explanation with diagnosis eligibility.

## Safe retrieval sequence

1. Resolve the platform by `platformId`, slug, or canonical alias data.
2. Retrieve the matching `platform_journey` record.
3. Identify the relevant documented stage from case evidence.
4. Retrieve blocker families mapped to that stage in the runtime catalog.
5. Exclude individual blockers marked `not_diagnosis_eligible` from supported-cause output.
6. Return known facts, candidate hypotheses, unknowns, and one next check separately.

Before returning `supported-hypothesis`, apply both gates in the [diagnosis evidence contract](diagnosis-evidence-contract.md). Require a reviewed diagnostic card plus active attempt evidence for the exact claim, prerequisites, and lookalikes.

Do not infer truth from retrieval rank. Do not omit `evidenceState`, `diagnosisEligibility`, `sourceIds`, `doesNotProve`, or unresolved questions when generating an answer.

For a supported item, do not omit evidence event IDs, evidence kinds, attribution requirements, or limitations. When either gate fails, return a hypothesis or `insufficient-evidence` instead.

If the platform is absent, return `platform-not-present` and create an intake record. Do not synthesize a canonical journey inside the response.

## Wrapper assembly boundary

Use `assembleDiagnosis` in `src/domain/diagnosis-assembler.ts` as the seam between Atlas evidence and a future UI or language model.

The assembler performs exact platform resolution, validates journey source references, joins active attempt evidence to catalog candidates, applies the diagnosis evidence contract, and withholds ineligible comparisons. It returns `diagnosis-output.schema.json` version 2.0.0.

Do not give a language model the full corpus and ask it to decide what is true. Give it only the assembled diagnosis object. The model may shorten or explain that object, but it must preserve evidence states, attribution, unknowns, limitations, and withholding decisions.

Canonical journey records and the blocker taxonomy are read-only inputs to this assembly step. A missing platform produces a review-gated intake state instead of a synthetic journey.
