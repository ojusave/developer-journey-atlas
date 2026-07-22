# Cursor prompt: migrate Atlas corpus serving to Render Postgres

You are working in `ojusave/developer-journey-atlas` (local checkout may use remote name `atlas`). Implement a production-ready migration so the **live Atlas web app on Render** reads platforms, journey steps, friction gates, audits, and the 790-reason blocker taxonomy from **Render Managed PostgreSQL**, with clear relational joins so the UI can show a full onboarding journey and highlight steps that have documented friction / linked blocker hypotheses.

This is a follow-on to the product direction discussed in-repo: journey-first UI, overlay documented pain on steps, optional peer placement curves later. It does **not** replace the research Workflows migration (`docs/prompts/migrate-atlas-research-to-render-workflows.md`). Preserve Workflows behavior.

## Outcome contract

| Field | Value |
|---|---|
| Outcome owner | Agent implementing this prompt; human approves production secrets and Blueprint apply |
| Class | Engineering / platform data migration |
| Baseline | App serves from git-committed JSON via `LocalDataStore` (`records/`, `audits/`, heuristic/quality JSON, `src/generated/catalog.json` for blockers) |
| Target | Hybrid: git remains the research/import source; **Runtime reads Postgres**. `DataStore` port unchanged for feature code. Relationships support step ↔ gate ↔ blocker joins |
| Measure | Public Atlas (or authenticated internal API if public UI not yet wired) returns a platform journey with ordered steps and gate overlays from Postgres on Render |
| Threshold | At least one known platform (e.g. `resend` or `render`) and blocker catalog counts match seed expectations; `/healthz` still passes |
| Proof required | `OUTCOME VALIDATED` on Render (not only local migrate + unit tests) |
| Guardrails | Measurement contract; no drop-off/conversion scores; hybrid not “delete git corpus”; secrets never logged; Express stays the web framework |
| Entry path | Agent reads this prompt → inspects repo → implements → seeds → deploys Blueprint with Postgres → verifies live API/UI |
| Completion signal | Live Render deploy serves Postgres-backed journey + taxonomy; PR opened with notes |
| Next use | Product can build “highlight pain on journey” UI and later curves without inventing a second data store |

### Non-goals

- Do not invent observed login/check drop-off telemetry.
- Do not treat the 790 blockers as proven diagnoses (`not_diagnosis_eligible` stays the default).
- Do not delete `records/` or the blocker markdown universe in this change set (keep as import source).
- Do not rebuild the frontend redesign or expand to 300 platforms as part of this prompt unless required to prove the data path.
- Do not replace Render Workflows research with DB-only drafts unless a separate approved prompt says so.
- Do not introduce Neo4j, ontology frameworks, or a weighted “difficulty score” for public claims.
- Do not use Hono/Fastify; keep Express.

## Decisions already approved (do not re-litigate unless blocked)

1. **Hybrid storage:** git JSON/markdown = import & reviewable evidence; Postgres = runtime serve.
2. **ORM:** Prisma (TypeScript) behind a new `PostgresDataStore` implementing existing `DataStore` (+ thin extensions for joins if needed).
3. **Relationships:** relational FKs; soft map gate `type` → blocker family for v1; optional explicit `gate_blocker_links` table for curated overlays.
4. **Platform:** Render Managed Postgres + existing web service; `DATABASE_URL` from `fromDatabase` in `render.yaml`.
5. **Honesty:** friction gates = documented requirements; blockers = hypotheses. Copy must not say “drop-off.”

If evidence shows Prisma cannot fit the current Node 22 / package layout without unreasonable cost, stop with `NEEDS HUMAN JUDGMENT` and propose one alternative with the same port boundary. Do not silently switch stacks.

## Start: inspect current state

1. Read `git status` and remotes. Prefer pushing to `atlas` (`ojusave/developer-journey-atlas`), not legacy `origin`, unless the human says otherwise.
2. Preserve unrelated uncommitted work (especially other files under `docs/prompts/`).
3. Inspect at minimum:
   - `packages/journey-corpus/src/core/ports.ts` (`DataStore`, `PlatformRecord`, audits)
   - `packages/journey-corpus/src/adapters/localData.ts`
   - `packages/journey-corpus/src/server.ts` and API routes under `src/api/`
   - `packages/journey-corpus/record.schema.json`
   - `packages/blocker-taxonomy/` and `src/generated/catalog.json` (790 reasons)
   - `packages/journey-corpus/MEASUREMENT-CONTRACT.md`
   - `render.yaml`
4. Count current corpus: platforms with `primary_path`, friction gates, audit statuses, catalog reason count.
5. Confirm whether an equivalent Postgres migration prompt or implementation already exists; **update the canonical artifact** instead of forking a second prompt.

## Research before coding (freshness)

Verify current primary sources (do not rely on memory alone). Record date checked:

- https://render.com/docs/databases
- https://render.com/docs/postgresql-creating-connecting
- https://render.com/docs/blueprint-spec (databases, `fromDatabase`, `DATABASE_URL`)
- https://www.prisma.io/docs (Prisma version compatible with the repo’s Node version)
- Current `@prisma/client` / `prisma` release notes for breaking changes

Write a short decision note (PR body or `docs/migration/atlas-postgres-serving.md`) covering:

- Why hybrid beats “Postgres only” for evidence review
- Schema shape and join path for journey + gates + blockers
- Seed/migrate strategy on Render (release command vs startup migrate; idempotent seed)
- How `LocalDataStore` remains available for tests / offline fallback
- Rollback: env flag to force file-backed store if DB is down

## Stable IDs (do not replace)

- **Platforms:** `Platform.slug` (e.g. `resend`)
- **Blocker reasons:** keep catalog IDs as primary keys (`U00.01` … universal, `P01.05` … archetype). **790 unique IDs; zero duplicates.**
- **Families / archetypes / journeys / stages:** same catalog node ids (`U04`, `P01`, `J01`, `S03`)
- **Steps:** unique on `(platformSlug, stepNumber)`; surrogate `cuid` for FKs
- **Friction gates:** surrogate `cuid`; optional curated links via `GateBlockerLink`

Never regenerate random UUIDs for the 790 reasons during seed. Upsert by source id.

## Required data model (adapt names to Prisma idioms)

Implement the smallest schema that supports serving and joins. Suggested entities:

1. **`Platform`** – slug (PK), name, organization, category, research fields needed by UI/API, import metadata (`source_sha256`, `imported_at`).
2. **`JourneyStep`** – FK platform, `step_number`, phase, actor, interface, action, details (JSON), success_signal, required, source_ids (JSON).
3. **`FrictionGate`** – FK platform, `at_step` (nullable FK or number matching step), `type`, description, documented_requirement, source_ids.
4. **`Audit`** – FK platform, audit_status, counts JSON or typed columns, full audit payload JSON if needed for fidelity, source_record_sha256.
5. **`MetricRow` / `QualityRow`** – either normalized tables or JSON columns sufficient for existing comparison helpers; prefer columns used by `buildDocumentedOnboardingLoad`.
6. **Blocker taxonomy**
   - `BlockerFamily`, `PlatformArchetype`, `JourneyKind` / `Stage` as needed from catalog nodes
   - `BlockerReason` – stable `id` (e.g. `U02.15`), kind, label, description, diagnosis eligibility
7. **Links**
   - **Soft:** code or table mapping friction gate `type` → family id(s)
   - **Explicit (optional v1):** `GateBlockerLink` (`friction_gate_id`, `blocker_reason_id`, `link_source`, `confidence`)

Do not flatten the 790 reasons into free text on each gate without retaining stable taxonomy IDs.

Indexes: `platform.slug`, `(platform_id, step_number)`, `blocker_reason.id`, gate `type`.

## Required application architecture

1. Keep **`DataStore` as the port**. Feature routes must not import Prisma client directly.
2. Add **`PostgresDataStore`** implementing `DataStore`.
3. Composition root (`server.ts` / deps): select store via env, e.g.:
   - `DATA_STORE=postgres` when `DATABASE_URL` is set (production default on Render)
   - `DATA_STORE=local` for tests and emergency rollback
4. Add seed/import script that reads:
   - `packages/journey-corpus/records/*.json`
   - `packages/journey-corpus/audits/*.json`
   - selected-path / quality artifacts as today
   - blocker catalog (`src/generated/catalog.json` or rebuild from taxonomy markdown)
5. Seed must be **idempotent** (upsert by slug / reason id).
6. Extend API only as needed for the join use case. Minimum new or extended endpoint:
   - `GET /api/platforms/:slug` (or dedicated journey endpoint) returns ordered steps with nested `frictionGates` and, when linked, `blockerHypotheses` (labeled as hypotheses, not causes).
7. Preserve `/healthz`. Optionally add a DB ping in health or a separate `/readyz` without failing liveness on brief DB blips if that matches current ops practice; document the choice.
8. Tests: unit tests against `InMemoryDataStore` remain; add adapter/integration tests for Postgres when `DATABASE_URL` is available (skip cleanly otherwise).
9. Files stay small; group Prisma schema, seed, and adapter under clear folders. No file over ~200 lines without splitting.

## Render / Blueprint requirements

Update `render.yaml` to:

1. Declare a **Postgres** database (sensible plan for the workspace; do not assume Free if the account cannot create it; prefer the smallest paid plan that works, or document Dashboard creation if Blueprint constraints block you).
2. Wire the web service `DATABASE_URL` with `fromDatabase` / connectionString.
3. Set `DATA_STORE=postgres` for the web service.
4. Run migrations on deploy safely (e.g. release command `npx prisma migrate deploy` and a controlled seed). Do not destroy production data on every deploy.
5. Confirm the web service still binds `0.0.0.0:$PORT`.
6. Keep Workflow-related env vars (`RENDER_API_KEY`, `RENDER_WORKFLOW_TASK_SLUG`) intact.

Deploy to the existing Atlas service when possible. Open a PR. Do not force-push. Do not commit secrets.

After deploy, verify on the **public Render URL**:

1. `/healthz` OK
2. List or search platforms still works
3. One platform journey payload includes steps + gates from Postgres (spot-check counts vs a known record)
4. Blocker catalog is queryable or embedded in the journey overlay path with count ≈ 790

## Honesty and product language

- Friction gates: “documented requirements or transitions,” not drop-off points.
- Blockers: “hypotheses,” not diagnosed causes unless eligibility changes under a separate evidence process.
- Peer curves / counts: still follow `MEASUREMENT-CONTRACT.md` and audit verification rules. Moving to Postgres does not unlock unverified public comparison scores.

## Work loop (adaptive, not a fixed checklist)

For each meaningful cycle: observe → predict → act → measure → learn → decide.

- Prefer the smallest coherent slice that proves Postgres serving on Render (schema + seed + `PostgresDataStore` + one API path + Blueprint) before polishing UI.
- After two failed attempts in the same direction, change strategy or stop `STAGNATED` / `BLOCKED` honestly.
- Do not weaken the outcome contract, proof bar, or guardrails to declare success.
- Route specialized checks when useful (schema review, Render Blueprint, measurement-contract cold pass). A named role without an actual check is not a handoff.

### Human boundaries

Require human approval for: production Blueprint apply if destructive, rotating secrets, deleting git corpus files, changing measurement contract claims, or spending beyond existing Render workspace norms.

## False-success resistance (must pass these simulations)

The agent must **not** claim `COMPLETE` / `OUTCOME VALIDATED` if only:

1. Prisma schema compiles and local `migrate` works, but Render still serves `LocalDataStore`.
2. Tables exist but seed never ran (empty list / missing Resend).
3. API returns file-shaped JSON while still reading disk, or returns steps without gate join capability.
4. Catalog “790” is hardcoded in UI copy without rows in `BlockerReason`.
5. Health check is green while every platform route 500s on DB errors with no fallback/flag story.
6. PR merges code that drops measurement-contract honesty (“drop-off score” from gate counts).

On blocked DB provisioning: status `BLOCKED`, evidence of what Render returned, and the exact human action needed.

## Assignment status and evidence state

Use exactly one assignment status:

- `COMPLETE` – live Render path serves Postgres-backed journey + taxonomy joins; contract met
- `NEEDS HUMAN JUDGMENT` – e.g. plan tier, whether to soft-map only vs curated links, UI copy
- `BLOCKED` – missing credentials, cannot create Postgres, cannot deploy
- `NOT FEASIBLE` – constraint conflict that cannot be resolved safely
- `STAGNATED` – two cycles, no progress, no credible next move

Use exactly one evidence state:

- `NO RELIABLE EVIDENCE`
- `ARTIFACT VERIFIED` – code/schema/tests only
- `OUTCOME VALIDATED` – observed on Render entry path
- `DECISION READY` – human decision artifact only (not sufficient for this prompt’s COMPLETE)

Passing CI alone is at most `ARTIFACT VERIFIED`.

## Deliverables

1. Prisma schema + migrations
2. Idempotent seed/import from existing corpus + catalog
3. `PostgresDataStore` + env composition switch + rollback flag
4. API support for journey steps with gate (and optional blocker) overlays
5. `render.yaml` Postgres wiring + deploy notes
6. Short migration doc under `docs/migration/`
7. PR to `ojusave/developer-journey-atlas`
8. Live verification notes (URLs, sample slug, counts checked)

## Done when

A user (or agent) hits the deployed Atlas on Render, loads a platform, and receives the **full documented onboarding journey** with **friction gates attached to steps**, backed by Postgres, with the **790-reason taxonomy** available for soft or explicit linking, without claiming unverified drop-off. Git corpus remains available for import and research review.
