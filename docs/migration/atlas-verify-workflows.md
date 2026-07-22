# Durable audit verification (Workflows)

## Why Workflows

Shortest-path verification is long-running: docs search, LLM propose, schema repair, and GitHub draft PRs fail transiently. Render Workflows give per-task retries, timeouts, and fan-out (`verifyAuditBatch`).

## Tasks

| Task | Role | Retry |
|---|---|---|
| `refreshAuditEvidence` | Official docs search | 2 |
| `proposeAuditRevision` | OpenRouter audit JSON | 1 (schema-repair is terminal) |
| `draftAuditContribution` | Draft PR `audits/<slug>.json` | 2 |
| `verifyPlatformAudit` | Parent orchestration | none (subtasks retry) |
| `verifyAuditBatch` | Fan-out ≤40 slugs | parent |

## Honesty

Machine sets `verified` **only** after `evaluateAuditEligibility` passes. Otherwise `needs-human-judgment` / `blocked` with `counts: null`. Never auto-merge. Frozen `records/*` untouched.

## API

- `POST /api/verify` `{ "slug": "resend", "checkOnly": false }` → 202 `{ runId }`
- `GET /api/verify/:runId`

Env: `RENDER_API_KEY`, `RENDER_VERIFY_TASK_SLUG=developer-journey-atlas-workflows/verifyPlatformAudit`, plus Workflow service secrets (`YDC_API_KEY`, `OPENROUTER_*`, `GITHUB_TOKEN`).

## Curves

Verified corpus/category curves unlock after ≥3 comparable verified audits merge.
