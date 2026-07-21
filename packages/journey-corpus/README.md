# First-Mile Atlas

Source-grounded onboarding research for people studying how developer platforms document the path to first success.

[Live Atlas](https://devrelcon-research.onrender.com/) · [LLM guide](https://devrelcon-research.onrender.com/llms.txt) · [Data manifest](https://devrelcon-research.onrender.com/data/index.json) · [Source snapshot](https://devrelcon-research.onrender.com/source/index.md)

## Highlights

- **205 canonical records:** each JSON file reconstructs one selected route to a documented first-success boundary.
- **Step-level evidence:** prerequisites, actions, gates, waits, outcomes, and vendor time claims cite inspected official documentation.
- **Documented steps, not scores:** the public site shows each platform's documented onboarding steps, extracted from official docs. It shows no score, no rank, and no leaderboard. An experimental effort-score generator stays in the repo but is internal and not shown publicly.
- **Multiple access paths:** use the interactive Atlas, individual JSON records, the complete manifest, or the LLM-oriented text interfaces.

## Contents

- [Overview](#overview)
- [Use the dataset](#use-the-dataset)
- [Research contract](#research-contract)
- [Data products](#data-products)
- [Verify documented steps](#verify-documented-steps)
- [Analyze safely](#analyze-safely)
- [Develop and validate](#develop-and-validate)
- [Deploy and operate](#deploy-and-operate)
- [Contributing and license](#contributing-and-license)

## Overview

The Atlas asks one bounded question: for each named platform, what complete path does the platform's official documentation provide from developer intent to an explicitly named or demonstrated first success?

"Complete" applies only to the selected first route. It does not cover advanced configuration, production hardening, scaling, or later tutorials. The dataset reconstructs documentation. It does not contain telemetry, observed completion times, conversion rates, or activation rates.

## Use the dataset

Open the [interactive Atlas](https://devrelcon-research.onrender.com/) to search by platform, outcome, or category.

Fetch the machine-readable index and a canonical record:

```sh
curl -sS https://devrelcon-research.onrender.com/data/index.json \
  | jq '.records[] | select(.slug == "render")'

curl -sS https://devrelcon-research.onrender.com/data/records/render.json \
  | jq '{platform, surface, documented_first_success, sources}'
```

For model-assisted analysis, begin with [`/llms.txt`](https://devrelcon-research.onrender.com/llms.txt). The consolidated [`/llms-full.txt`](https://devrelcon-research.onrender.com/llms-full.txt) includes the methodology, catalog, record contract, and deployed source code.

## Research contract

Each record follows these rules:

1. Inspect current official documentation directly. Search results and memory can locate a page but cannot support a recorded fact.
2. Preserve every required prerequisite, account gate, developer action, platform event, wait, branch, and verification step on the selected route.
3. Cite source IDs on every evidence-bearing field, including time and completion claims.
4. Record a vendor time claim only when the inspected source makes one. Otherwise use `not documented`.
5. Stop at the official first-success boundary and list excluded next steps.
6. Record missing, contradictory, login-gated, or ambiguous documentation instead of filling gaps from memory.

Broad platforms use the decision order in [`SELECTION-POLICY.md`](SELECTION-POLICY.md). Measurement units, comparability constraints, and non-claims are defined in [`MEASUREMENT-CONTRACT.md`](MEASUREMENT-CONTRACT.md).

A record marked `complete` is research-complete for its selected route. It is not necessarily a globally canonical platform journey or directly comparable with every other record.

## Data products

| Path | Purpose |
| --- | --- |
| `records/*.json` | Canonical source of truth, one record per platform |
| `record.schema.json` | Machine-checkable record contract |
| `roster.json` | Complete 205-platform research roster |
| `coverage.json` | Validation and completion report |
| `ds-quality.json` | Analytical quality, assumptions, and comparability metadata |
| `selected-path-heuristic.json` | Experimental, internal normalized counts and unitless effort scores for selected routes. Not shown on the public site. |
| `catalog.md` | Generated human-readable index |
| `ds-audit.md` | Pre-repair baseline audit and reproducibility findings |
| `verify/<slug>.json` | Per-step verification verdicts and supporting official-doc excerpts (see [Verify documented steps](#verify-documented-steps)) |
| `verify-summary.md` | Verification counts and the list of records a human must review |

Generated files come from the canonical records and shared measurement code in `lib/measure.mjs`. Run the generators instead of editing derived artifacts by hand.

`selected-path-heuristic.json` and its generator `build-selected-path.mjs` are experimental and internal. The effort score is a unitless heuristic over normalized counts, not minutes, not observed time, not a vendor claim, and not a ranking. It is kept in the repo for reproducibility but is deliberately not shown on the public site. A properly verified benchmark may return later, once the underlying claims are checked against sources.

## Verify documented steps

`npm run verify` checks each record's documented steps against the official docs they cite. It resolves each step's `source_ids` to the record's `sources`, confirms the cited URLs are on the platform's own documentation domain, fetches the live docs (cached by URL so reruns are cheap and deterministic), and requires a literal supporting excerpt from the fetched page for the step's `action` and `success_signal`. Nothing passes on a model's opinion: a verdict rests on quoted document text or the step is flagged.

```sh
npm run verify                              # verify every record
npm run verify -- --only stripe,render,vercel   # verify a subset (headliners first)
npm run verify -- --refresh                 # ignore the fetch cache and refetch
```

A step is `supported` only when a cited, reachable, official-domain source yields a literal excerpt covering its action and success signal. A record is `verified` only when every required step is supported; otherwise it is `needs_human` with the failing steps listed. Platforms listed in `headline.json` (the ones named aloud on a slide) are never marked `verified` by the tool alone. They are capped at `needs_human` until a human signs off, because headline claims get human verification, not tool self-certification.

Outputs are written to `verify/<slug>.json` (per-step verdicts, excerpts, URLs, and `fetched_at`) and `verify-summary.md` (counts and the explicit human-review list). Both are dated. The verifier reads the fetched HTML only: docs rendered entirely client-side may yield fewer supported steps, which is reported honestly rather than guessed.

## Analyze safely

Safe analysis starts with `ds-quality.json`. Filter on `comparability_status` and relevant confounds before comparing records.

```js
import fs from "node:fs";

const quality = JSON.parse(fs.readFileSync("ds-quality.json", "utf8"));
const cohort = quality.records.filter((record) =>
  record.existing_asset_requirements.length === 0 &&
  !record.opaque_signup &&
  record.execution_environment === "hosted" &&
  record.boundary_evidence_type === "explicitly-named"
);
```

Do not report `raw_transition_count` as developer effort. Do not interpret `heuristic_effort_score` as minutes, observed time, or a best-developer-experience ranking. For example, Render's record contains platform events that are not actions the developer performs.

## Develop and validate

Prerequisites: Node.js, npm, and a clean Git working tree for the reproducibility check.

```sh
npm test          # run measurement regression fixtures
npm run validate  # validate all canonical records
npm run build     # regenerate derived artifacts and validate again
npm run check     # regenerate, then fail if tracked output changed
npm run verify    # verify documented steps against cited official docs
npm run site      # build the static site into public/
```

Key contributor paths:

- `records/`: canonical research records
- `lib/measure.mjs`: normalized measurement and classification logic
- `build-*.mjs`: deterministic generators
- `tests/regression.mjs`: measurement-layer fixtures
- `site/` and `scripts/build-site.mjs`: published Atlas

## Deploy and operate

The production Atlas is a Render Static Site at [devrelcon-research.onrender.com](https://devrelcon-research.onrender.com/).

| Setting | Value |
| --- | --- |
| Build Command | `node scripts/build-site.mjs` |
| Publish Directory | `public` |
| Required environment variables | None |

After a deploy, verify that `/`, `/llms.txt`, and `/data/index.json` return `200`. Build and request logs are available from the service in the Render Dashboard.

## Contributing and license

Open a focused pull request against `main`. Include the validation commands you ran and regenerate any derived artifacts affected by record or measurement changes.

Software in this package is licensed under the Apache License 2.0. Original research records and research documentation are licensed under Creative Commons Attribution 4.0 International. The repository-level `LICENSE_SCOPE.md` defines the controlling path boundaries and exclusions.
