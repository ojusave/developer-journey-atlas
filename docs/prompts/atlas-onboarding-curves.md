# Cursor prompt: onboarding curves (corpus + category)

You are working in `ojusave/developer-journey-atlas`. Implement **curve placement** for a platform against (1) the full corpus and (2) its category peers, using documentation-derived counts only.

## Reality check (do not ignore)

- Only **one** platform currently has `audit_status=verified` (`render`). The measurement contract’s **verified** peer comparison needs ≥3 verified peers with matching finish line: it cannot power a useful public curve yet.
- OpenRouter blocker links and the 790 taxonomy are **hypotheses**. They must **not** move the curve.
- Legacy `heuristic_effort_score` must **not** power user-facing curves.

## Outcome

Expose two labeled curve layers:

1. **`verified`** (strict): existing `buildDocumentedOnboardingLoad` rules; available only when contract peers exist. Also compute a **corpus-wide** verified peer set (same finish line / comparability rules, any category) when ≥3 peers exist.
2. **`draftDocumented`** (pragmatic, always-labeled): for any complete record with `primary_path`, place using countable **documented structure** signals vs medians:
   - documented steps (`primary_path.length`)
   - required steps (required !== false)
   - documented friction gates (`friction_gates.length`)
   - wait-typed gates (type `wait` or `rate-limit`)

Each layer returns **corpus** and **category** scopes. Each signal stays separate (below / at / above median). **No single difficulty score.**

Honesty copy on every payload: documentation structure only; not drop-off, conversion, or usability.

## Deliverables

1. `buildCurvePlacement(row, store)` in core (or extend onboarding load cleanly)
2. `GET /api/platforms/:slug/curve`
3. Include `curve` on `GET /api/platforms/:slug/journey` meta (or nested field)
4. Tests: draft places Resend-like fixture; verified unavailable with one peer; unknown IDs/OpenRouter counts never appear in curve math
5. Short note in `docs/migration/atlas-onboarding-curves.md`

## Non-goals

- Do not invent percentiles that look like rankings for marketing.
- Do not use OpenRouter link counts, blocker taxonomy size, or heuristic effort scores.
- Do not claim verified placement for NHJ audits.

## Done when

Calling the curve API for `resend` returns `draftDocumented` corpus + category components with medians, and `verified.available=false` with a clear reason until more audits pass.
