# Cursor prompt: link journey friction to blocker taxonomy via OpenRouter

You are working in `ojusave/developer-journey-atlas` (remote `atlas`). Research current OpenRouter capabilities (embeddings + generative), then implement a durable way to **propose relationships** between platform onboarding friction (journey steps / `friction_gates`) and the **790 blocker reason IDs** (`U##.##`, `P##.##`).

This builds on Postgres hybrid serving (`docs/prompts/migrate-atlas-corpus-to-render-postgres.md`, PR #14). Do not delete the soft map (`GateTypeFamilyMap`). OpenRouter links are an additional, labeled hypothesis layer.

## Outcome contract

| Field | Value |
|---|---|
| Baseline | Soft map only: gate `type` → family (e.g. `account` → `U04`). No per-reason links from model output |
| Target | Batch (and optionally on-demand) linking that writes `GateBlockerLink` rows: `frictionGateId` → `blockerReasonId`, with `linkSource`, model metadata, and confidence |
| Measure | For a known platform (e.g. `resend`), journey API returns curated/model links (or a dedicated links field) for at least one gate, citing real catalog IDs only |
| Proof | `ARTIFACT VERIFIED` with tests + local seed/link run; `OUTCOME VALIDATED` on Render if Postgres + Workflows + OpenRouter key are available |
| Guardrails | Links are **hypotheses**, not drop-off diagnoses; never invent reason IDs; never score public “difficulty”; secrets never logged; Express + existing Workflows patterns |

### Non-goals

- Do not claim observed conversion or login drop-off.
- Do not replace soft-map fallback.
- Do not require Neo4j or an external vector DB if OpenRouter embeddings + Postgres (or in-memory cosine over stored vectors) is enough for ~790 reasons.
- Do not auto-merge research PRs or change measurement-contract public curves.

## Research first (mandatory)

Before coding, verify current primary sources (date-stamp findings):

1. OpenRouter embeddings API: https://openrouter.ai/docs (embeddings endpoints, models, request/response shapes, pricing notes)
2. OpenRouter chat/completions for JSON-constrained selection (models already used in-repo, e.g. `OPENROUTER_MODEL`)
3. Existing Atlas OpenRouter adapter: `packages/journey-corpus/src/adapters/openRouter.ts`
4. Existing Workflows: `packages/journey-corpus/src/workflows/`
5. Prisma `GateBlockerLink`, `FrictionGate`, `CatalogNode`, journey overlay API

Write a short decision note in `docs/migration/atlas-openrouter-blocker-links.md` covering:

- Embed-only vs generate-only vs **retrieve-then-confirm** (preferred default)
- Where vectors live (Postgres column vs recomputed each run vs file artifact)
- Task graph on Render Workflows vs one-shot CLI seed
- Idempotency and re-link strategy
- Honesty language for API/UI

If OpenRouter embeddings are unavailable or a poor fit, stop with `NEEDS HUMAN JUDGMENT` and propose chat-only linking with the same `GateBlockerLink` schema. Do not invent a fake embeddings client.

## Required design (default hypothesis)

1. **Index once:** embed all `CatalogNode` where `kind=reason` (790). Persist embedding + model id + content hash.
2. **Per gate:** build text from `type`, `description`, optional step action/details; embed; take top-k reasons by cosine similarity (k=8–15).
3. **Confirm:** LLM call with gate text + top-k candidates; return 0–3 reason IDs that must be subset of candidates; reject unknown IDs.
4. **Write:** upsert `GateBlockerLink` with `linkSource=openrouter`, confidence from model or similarity band.
5. **Serve:** extend journey overlay to include model links alongside soft-map family hypotheses, clearly labeled.

Prefer a Workflow task `linkPlatformBlockers` (input: `{ slug }` or `{ slugs: [] }`) plus a CLI `npm run db:link-blockers` for local/batch. Web request must not block on full-corpus linking.

## Implementation requirements

1. Ports/adapters: do not call OpenRouter from route handlers directly. Add narrow ports (e.g. `EmbeddingProvider`, extend `LLMProvider` or a `BlockerLinker` port) and adapters.
2. Env: reuse `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`; add `OPENROUTER_EMBEDDING_MODEL` (documented default after research).
3. Feature flag: `BLOCKER_LINKING_ENABLED` (default off in web; on for Workflow/CLI).
4. Tests: fake embedding/LLM providers; assert unknown IDs rejected; assert soft-map still present when no model links.
5. Keep files small; update migration doc and this prompt’s “Done when” checklist in the PR.

## False-success resistance

Do not claim `COMPLETE` if:

- Soft-map still the only link and no OpenRouter path exists
- Model returns free-text reasons not in the catalog
- Links write without `linkSource` / model metadata
- Journey API implies drop-off causation
- Only a markdown plan exists with no runnable seed/Workflow path

## Assignment status

Use `COMPLETE` | `NEEDS HUMAN JUDGMENT` | `BLOCKED` | `NOT FEASIBLE` | `STAGNATED` and evidence `NO RELIABLE EVIDENCE` | `ARTIFACT VERIFIED` | `OUTCOME VALIDATED` | `DECISION READY`.

## Done when

A developer can run linking for `resend` (CLI or Workflow), see `GateBlockerLink` rows to real `U##.##`/`P##.##` ids, and fetch a journey payload that shows those hypotheses without claiming diagnosed drop-off. Soft map remains as fallback.
