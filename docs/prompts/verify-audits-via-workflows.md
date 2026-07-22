# Cursor prompt: durable shortest-path audit verification via Render Workflows

You are working in `ojusave/developer-journey-atlas`. Implement durable **audit verification** so verified onboarding curves can eventually unlock. This is long-running work: provider failures, schema repair, and GitHub races require **Workflows with retries**.

## Outcome

1. `verifyPlatformAudit` Workflow parent chains retryable subtasks and returns a terminal `VerifyOutcome`.
2. Machine may propose `verified` **only** when deterministic eligibility checks pass. Otherwise status stays `needs-human-judgment` or `blocked` with `counts: null`.
3. Results land as a **draft GitHub PR** (`audits/<slug>.json`). Never auto-merge.
4. Web API starts/polls runs (`POST /api/verify`, `GET /api/verify/:runId`) without exposing secrets.
5. Batch parent can fan out across NHJ slugs.

## Non-goals

- Do not force 223 platforms to `verified`.
- Do not use OpenRouter blocker links or curves math inside verification.
- Do not rewrite `records/*` (SHA-256 frozen).

## Done when

Unit tests cover eligibility + orchestration with fakes; Workflow tasks are registered beside research; docs explain how verified curves unlock after ≥3 verified peers merge.
