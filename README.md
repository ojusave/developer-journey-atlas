# Developer Journey Atlas

Search a reviewed developer platform and inspect its source-grounded route from account creation to first success.

[Live Atlas](https://developer-journey-atlas.onrender.com) · [Data manifest](https://developer-journey-atlas.onrender.com/data/index.json) · [LLM guide](https://developer-journey-atlas.onrender.com/llms.txt)

Developer Journey Atlas is an independent community project, not an official Render product.

## Current publication state

- The repository preserves 237 research records, including 25 currently documented LLM API surfaces across direct-provider, managed-inference or routing, and cloud-platform cohorts.
- One route, Render, currently passes the deterministic identity, first-party source-content, claim-grounding, required-field, branch, and route-integrity gates.
- The other 236 records remain non-public while their routes and evidence need human review.
- Blocker-reason links and cross-platform associations remain internal until independent evaluation passes.
- Documentation structure is not evidence of conversion, abandonment, usability, difficulty, causality, or observed completion time.

## Public experience

Known platforms use durable routes such as `/platform/render`. The server renders platform-specific title, description, canonical URL, and Open Graph metadata before the browser loads JavaScript.

Searching for an unknown platform does not start research. The user must read the provider disclosure and explicitly activate the research action. Render Workflows, You.com, and OpenRouter may process the platform name. A completed result remains private until maintainer review passes every publication gate.

The public API is fail-closed:

```http
GET /api/meta
GET /api/platforms
GET /api/platforms/render/journey
GET /api/platforms/render/evidence
GET /api/search?q=render
GET /healthz
```

Internal legacy calculations remain in the repository for migration analysis. Public routes and responses do not expose composite onboarding metrics, peer placement, model-selected blocker reasons, or cross-platform associations.

## Build and verification

From `packages/journey-corpus`:

```sh
npm run build:data
npm run build:app
npm run test:app
npm test
npm run review:corpus
npm run reason:lab -- inspect G001
```

`build:data` regenerates the publication health and evaluation foundations, builds the machine-readable public surface, publishes the active web source snapshot, and checks that only eligible routes are included.

`review:corpus` reports one deterministic disposition for all 237 records and the next coherent cohort-review action. `reason:lab` operates the private two-reviewer labeling workflow. Candidate cohort inclusion never makes a route public or comparison-qualified.

## Deploying a personal copy

The repository Blueprint selects a paid Starter web service and a paid Basic-256mb Render Postgres instance. Review [current Render pricing](https://render.com/pricing) before deploying.

The Blueprint manages the public web service and Postgres read model. Workflow services for research and verification are configured separately. No workflow starts unless the required server-side credentials and task slug are present.

Relevant environment variables:

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection in production |
| `DATA_STORE` | `postgres` in production or `local` for the committed corpus |
| `PUBLIC_BASE_URL` | Canonical public origin used for metadata |
| `RENDER_API_KEY` | Starts and reads approved Workflow runs |
| `RENDER_WORKFLOW_TASK_SLUG` | Research Workflow task |
| `VERIFY_ADMIN_SECRET` | Protects the verification start endpoint |
| `OPENROUTER_API_KEY` | Workflow-side reconstruction and internal evaluation |
| `OPENROUTER_MODEL` | Workflow-side reconstruction model |
| `YDC_API_KEY` | Workflow-side first-party documentation discovery |
| `RESEARCH_GLOBAL_HOURLY_LIMIT` | Shared research-start capacity |

## Trust and privacy contracts

- `packages/journey-corpus/SELECTION-POLICY.txt`
- `packages/journey-corpus/MEASUREMENT-CONTRACT.txt`
- `packages/journey-corpus/PRIVACY.md`
- `packages/journey-corpus/EVENT-CONTRACT.txt`
- `packages/journey-corpus/LAUNCH-CHECKLIST.txt`
- `packages/journey-corpus/corpus-health.json`
- `packages/journey-corpus/migration-analysis.json`
- `packages/journey-corpus/evaluation/`

The event contract is `measurement_unavailable`: no approved analytics collector, persistence, query path, or verified test event is installed.

## Project structure

| Path | Purpose |
| --- | --- |
| `packages/journey-corpus/web/` | Active public product UI |
| `packages/journey-corpus/public/` | Generated public machine artifacts and active source snapshot |
| `packages/journey-corpus/trust/` | Platform identities, fetched source evidence, and journey graphs |
| `packages/journey-corpus/evaluation/` | Labeling packet and predeclared validation protocols |
| `packages/journey-corpus/records/` | Preserved source records |
| `packages/journey-corpus/audits/` | Historical shortest-path audit state |
| `workflows/` | Render Workflow tasks |
| `render.yaml` | Paid web service and Postgres Blueprint |

## License

Software is Apache-2.0 under `LICENSE`. Original research expression is Creative Commons Attribution 4.0 under `DATA_LICENSE.txt`.
