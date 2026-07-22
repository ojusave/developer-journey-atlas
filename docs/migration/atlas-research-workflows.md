# Atlas research on Render Workflows

Unknown-platform research used to run inside the HTTP request that triggered it: `POST /api/research` opened a Server-Sent Events stream and did the whole pipeline (search, model reconstruction, grounding, assessment, draft PR) before the response ended. That coupled a multi-provider, minute-scale job to a single socket. If the browser navigated away, the request timed out, or the web service restarted mid-research, the work was lost and any partial GitHub state was orphaned.

This migration moves the research to a durable Render Workflow. The web service now starts a run and returns immediately; the run continues regardless of the browser or the web process, and the UI reads server-side status by run id.

## Why a Workflow, not inline SSE

The research path has the three properties Workflows exist for: it is long-running (tens of seconds to minutes across two external providers plus GitHub), it has independent failure modes worth isolating (search vs model vs contribution), and its result must survive a dropped client. Holding an HTTP request open for the full duration gives none of that. A Workflow run is durable, retryable per step, and observable by id after the triggering request is long gone.

We deliberately did **not** reuse the existing `workflows/` scanner service or its private-callback design (`INTERNAL_WORKFLOW_SECRET` + `/internal/workflow/turn`). That service exists for a different boundary: the scanner needs the Workflow to call back into a stateful web runtime. Atlas research is self-contained. It reads committed dataset artifacts, calls external providers, and returns a bounded result. A client-triggered task with server-side status reads needs no callback endpoint and no extra shared secret, so introducing one would be unjustified surface area.

## Task graph

A single parent task with three chained subtasks, not one monolith and not a fan-out:

- `researchPlatform` (parent, stable public entry). Validates input, short-circuits known platforms against the local dataset, orchestrates the subtasks, runs the deterministic steps itself (source-grounding check, assessment), and returns one bounded terminal outcome.
- `searchOfficialDocs` (child). Independently retryable for transient search-provider failures. Zero results is deterministic and returned, not thrown, so it is classified as "no docs" without wasting retries.
- `reconstructRecord` (child). Independently retryable for transient model failures. A schema-repair exhaustion is deterministic and returned as `invalid_output`, never retried.
- `draftContribution` (child). Creates the human-gated draft PR idempotently.

The deterministic steps (grounding, assessment) stay in the parent process because they are cheap, pure, and add no durability value as separate runs. The canonical logic lives once in `packages/journey-corpus`: the tasks import the existing `core/` orchestration and `adapters/`. There is no second research implementation.

## Retry and idempotency boundaries

The SDK retries any thrown error, so the classification rule is: **throw only for transient failures, return a terminal result for deterministic ones.** Transient (network, timeout, provider 5xx/429) throws and is retried at the subtask boundary with bounded exponential backoff. Deterministic (no docs, schema-repair exhaustion, source-grounding failure, permission errors) returns a typed terminal result that the parent interprets. When a subtask exhausts its retries, the parent catches it and returns a user-safe terminal reason (`search_failed`, `model_failed`) rather than letting the run crash.

GitHub contribution is the retry-sensitive step. It is idempotent by construction:

- The branch name is deterministic: `research/<slug>`, no timestamp.
- Before creating anything, it looks for an already-open PR from that head and reuses it.
- If the branch exists from a prior run, it is reset to the base commit and the single record file is re-committed.

So a subtask retry, a parent re-run, or a duplicate submission for the same platform converges on one PR. Permission and validation errors (401/403/404/422) are permanent and returned as a skipped contribution; the research still completes and the draft is shown for manual submission.

Timeouts are set per step from observed provider behavior, not defaulted to 24 hours: search 90s, reconstruct 300s, contribution 120s, parent 600s. The parent is not retried; its subtasks own retries, and re-running the parent would redo expensive work.

## How the browser gets progress and results

The Render API key lives only on the web service. The browser never sees it. The flow:

- `POST /api/research` validates and rate-limits, short-circuits known platforms, starts the run with `startTask`, and returns `202` with a run id.
- `GET /api/research/:runId` reads the run with `getTaskRun` and returns a safe projection: `{ runId, phase, result, message }`. It never returns credentials, raw upstream errors, or the run's raw task input.
- The browser polls that endpoint (2.5s interval) and renders queued, running, retrying, completed, and failed states. Polling is the default because the SDK's server-side reads are simple and reliable; no request is held open for the task duration.
- Recovery: the run id and query are written to the URL, so a reload resumes polling. A dropped fetch never cancels the run.

## Duplicate submissions

Two layers. The web service keeps a bounded in-memory map of recently started runs keyed by normalized slug (10-minute TTL) and returns the existing run id for a repeat submission instead of starting a new one. Even across web-service restarts that clear the map, the deterministic GitHub branch guarantees at most one open PR per platform.

## Model behavior

`OPENROUTER_MODEL` is optional. When unset, the request omits the `model` field entirely and OpenRouter uses the account/payer default. No stale model is pinned in config or on Render.

## Environment fields

Web service `developer-journey-atlas`:

- `RENDER_API_KEY` (secret): server-side key for `@renderinc/sdk`.
- `RENDER_WORKFLOW_TASK_SLUG` (non-secret): `developer-journey-atlas-workflows/researchPlatform`.

Workflow service `developer-journey-atlas-workflows`:

- `YDC_API_KEY`, `OPENROUTER_API_KEY`, `GITHUB_TOKEN` (secrets, rotated).
- `OPENROUTER_MODEL` (optional, leave unset).
- `GITHUB_REPO_SLUG` (optional, non-secret).

After migration, the provider and GitHub secrets are removed from the web service, and the legacy `RESEARCH_ENABLED` field is gone (research availability is now derived from the presence of `RENDER_API_KEY` and the task slug). Blueprints cannot manage Workflow services, so `render.yaml` declares only the web service; the Workflow service is created with the Render CLI or Dashboard.

## Beta and operational notes

- Render Workflows is in beta; the SDK (`@renderinc/sdk@0.6.0`, pinned) may introduce breaking changes. Task signatures were verified against the installed source, not memory.
- Workspace-wide concurrency limits apply. The per-platform dedupe and the existing per-IP rate limit keep spend bounded.
- Retrying the parent is intentionally disabled to avoid re-running expensive subtasks; durability comes from the subtasks and from idempotent GitHub writes.

## Local verification

- `render workflows tasks list --local` shows all four tasks registered.
- A run for a known platform returns `{ outcome: "known", slug: "render" }` with `status: completed`, matching the projection contract.
- A run for an unknown platform (no provider keys locally) chains the search subtask, retries, and the parent returns `{ outcome: "search_failed" }` instead of crashing.
- `npm run build:app` and `npm run test:app` pass (38 tests: input validation, retry classification, status projection, GitHub idempotency, and start/status API boundaries).
