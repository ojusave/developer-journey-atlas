# Platform first-mile knowledge base

This is the standalone source-grounded platform dataset for the DevRelCon
first-mile workshop research. It contains data and validation artifacts only;
the workshop application, session contract, stage outline, and broader blocker
research live elsewhere.

## Research question

For each named platform, what is the complete path documented by the platform
from a developer arriving with intent to the first-success boundary that the
official documentation itself explicitly names or demonstrates?

"Complete" applies only inside that bounded first path. It does not mean
researching the full product, advanced configuration, production hardening,
scaling, or later tutorials.

## Evidence rules

1. Inspect current official documentation directly. Search and memory may locate
   a page but cannot support a recorded fact.
2. Follow every official link needed to reconstruct the path. Do not summarize
   only the landing page or quickstart index.
3. Record every required prerequisite, account or access gate, atomic action,
   system response, wait, branch, and verification step on the primary path.
   When the docs present peer starting routes, preserve the shared spine in
   `primary_path` and record at least one complete, ordered, atomic official
   route in `candidate_paths`. A branch summary does not count as the journey.
   If public official docs genuinely cannot expose an executable candidate,
   record the exact source-backed reason in `candidate_path_gap` instead.
4. Cite source IDs on every prerequisite, path step, gate, time claim, and
   completion claim.
5. Record the vendor's explicit time claim when one exists. Otherwise write
   `not documented`; never estimate.
6. Do not choose the success boundary. A complete record requires an official
   milestone that is either explicitly named or demonstrated as the terminal
   success state of the official getting-started path. `normalized_outcome` is
   only a faithful paraphrase of that documented result.
7. When official documentation is missing, contradictory, login-gated, or does
   not select one canonical surface, record the uncertainty or return
   `blocked`/`needs-human-judgment`. Do not fill the gap from memory.
8. Paraphrase. Preserve exact commands, UI labels, field names, response values,
   and very short excerpts only when necessary to make the path reproducible.
9. Stop at the documented first-success boundary and list excluded next steps.
10. Do not create accounts, accept terms, enter payment details, deploy, send
    messages, or otherwise exercise a production system.

## Selection rule for broad platforms

Start at the vendor's official developer or product documentation home. Choose
the path the vendor itself presents as the general or recommended getting-started
route. Record why it is primary and list plausible alternatives. If the vendor
offers several equally primary surfaces or terminal success states and the
documentation does not select a default, return `needs-human-judgment` rather
than choosing silently.

## Contents

- `roster.json`: the complete 205-platform research roster, including all 100 independently audited records from the scale run.
- `record.schema.json`: machine-checkable record contract.
- `record.template.json`: copyable starting shape for each independent agent.
- `candidate-path-audit.json`: records flagged because their shared spine stops before an executable candidate route.
- `cold-audit-open.json`: unresolved independent source-to-step findings that keep a record invalid until correction and recheck.
- `cold-audit-summary.md`: resolved cross-batch source-to-step audit receipt for the high-risk and reworked records.
- `records/`: one canonical JSON record per platform. This is the only source of truth.
- `catalog.md`: generated human-readable index after integration.
- `coverage.json`: generated validation and completion report.
- `MEASUREMENT-CONTRACT.md`: definitions of every measurement unit (raw transition, developer action, platform event, wait, decision, documentation navigation, terminal). Read this before analyzing.
- `ds-quality.json`: generated analytical-quality and comparability metadata per record. Not a ranking. Use it to filter records before analysis.
- `selected-path-heuristic.json`: generated per-platform selected route with normalized counts and a unitless `heuristic_effort_score`. Not a ranking, not minutes, not observed time. Replaces the former `easiest-path.json`.
- `ds-audit.md`: pre-repair baseline audit of `main` (defect counts, slug lists, reproducibility findings).
- `lib/measure.mjs`: shared measurement library that both generators import, so counts never diverge.
- `build-all.mjs`, `build-ds-quality.mjs`, `build-selected-path.mjs`, `build-catalog.mjs`, `build-ds-audit.mjs`: generators.
- `tests/regression.mjs`: fixtures for the measurement layer (Render counts, Chronosphere assumptions, re-researched granularity, classifier false positives).

## Route selection policy

When official docs present peer routes, or a cloud signup gate previously left a
record unresolved, this dataset applies `SELECTION-POLICY.md`: commit to the
fastest and most commonly used documented route (prefer local/no-account when
offered; otherwise the vendor's first-listed or recommended quickstart).

## Completion standard

A platform record is complete only when its full bounded path is reconstructed
from inspected official sources and every evidence-bearing field is attributable.
Passing the schema is necessary but not sufficient; the parent also reviews
source coverage and representative paths cold.

## What `complete` means (and what it does not)

A `complete` record describes one committed route to an observable terminal. It is
research-complete. It is **not** automatically globally canonical or directly
comparable to every other record. A record can be complete while its platform still
has no single platform-wide first success. That platform-wide ambiguity lives in
`surface.selection_basis`, `surface.alternatives_considered`, and `uncertainties`.
The selected-route success fields (`surface.name` and the four
`documented_first_success` narrative fields) must describe the committed route's
terminal affirmatively. The validator fails a `complete` record that uses blocked or
needs-human-judgment phrasing in those fields, and reports the exact field and rule.

## Analysis honesty: what is safe to analyze

This dataset is reconstructed documentation, not telemetry. There are no measured
conversion rates, activation rates, or observed times here.

- **Safe:** per-record structure from `ds-quality.json` (developer actions, platform
  events, gates, waits, starting-state assumptions, execution environment), and
  filtering or grouping records by those fields.
- **Conditionally safe:** cross-platform comparisons, but only after filtering on
  `comparability_status` and the confound dimensions. Every record is currently
  `conditional`, never unconditionally `comparable`, because documentation navigation,
  platform events, starting-state assumptions, or granularity differences apply.
- **Unsafe:** treating `raw_transition_count` as developer effort, treating
  `heuristic_effort_score` as minutes, or reading `selected-path-heuristic.json` as a
  ranking or a "best developer experience" claim.

### Raw transitions are not developer actions

Render's record has 25 raw transitions but only 21 developer actions (20 required,
1 optional). Four transitions are platform events: Render creates the service, runs
the build, marks the deploy Live, and serves the response. Do not report 25 as "25
steps the developer must do." See `MEASUREMENT-CONTRACT.md`.

### Filter before you compare

```js
import fs from "node:fs";
const dq = JSON.parse(fs.readFileSync("ds-quality.json", "utf8"));

// A cohort with no assumed existing assets, no opaque signup, hosted execution,
// and an explicitly named terminal. Compare within this cohort, not across all 205.
const cohort = dq.records.filter((r) =>
  r.existing_asset_requirements.length === 0 &&
  !r.opaque_signup &&
  r.execution_environment === "hosted" &&
  r.boundary_evidence_type === "explicitly-named"
);
```

## Regenerate and validate

Everything is deterministic (no wall-clock timestamps; artifacts pin an
`input_hash` derived from the records). One command regenerates and re-validates:

```bash
node build-all.mjs          # validate, regenerate coverage/catalog/ds-quality/selected-path, re-validate
node build-all.mjs --check  # same, then fail if regeneration left a dirty git diff (CI)
node tests/regression.mjs   # measurement-layer fixtures
```

`ds-audit.md` is a one-time pre-repair baseline and is not regenerated by
`build-all.mjs`.
