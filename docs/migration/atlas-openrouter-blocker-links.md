# Atlas OpenRouter blocker links

Date checked: 2026-07-22. Sources: [OpenRouter Embeddings](https://openrouter.ai/docs/api-reference/embeddings) (`POST /api/v1/embeddings`, batch input, cosine similarity).

## Decision

Use **retrieve-then-confirm**:

1. Embed all 790 `kind=reason` catalog labels (cached in Postgres `CatalogEmbedding`).
2. Embed each friction gate (+ step context); take top-k by cosine similarity.
3. Ask the chat model to pick 0–3 IDs **only from that candidate set**.
4. Upsert `GateBlockerLink` with `linkSource=openrouter`.

Soft map (`GateTypeFamilyMap`) stays as fallback when linking is off or yields zero IDs.

## Vectors

Store embeddings in Postgres (`CatalogEmbedding.embedding` JSON float array) keyed by reason id + model + content hash. Re-embed only when hash or model changes. No external vector DB for 790 rows.

## Default models

- Embeddings: `OPENROUTER_EMBEDDING_MODEL` default `openai/text-embedding-3-small`
- Confirm: existing `OPENROUTER_MODEL` (chat completions JSON)

## Runtime

- CLI: `npm run db:link-blockers -- --slug=resend`
- Workflow task: `linkPlatformBlockers` (batch-friendly, not on the web critical path)
- Flag: `BLOCKER_LINKING_ENABLED=true` for Workflow/CLI

## Honesty

Links are hypotheses. API copy must not say drop-off, conversion, or diagnosed cause.
