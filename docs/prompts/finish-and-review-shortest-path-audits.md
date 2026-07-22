# Cursor prompt: finish remaining shortest-path audits and review the corpus

## Where we are now

You are continuing the Developer Journey Atlas shortest-required-path audit.

- Canonical GitHub repository: `https://github.com/ojusave/developer-journey-atlas`
- Local repository: `/Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/scanner-app`
- Production: `https://developer-journey-atlas.onrender.com`
- Active branch: `research/audit-entire-corpus` (based on `atlas/main`)
- Push only to the `atlas` remote. Never push to legacy `origin`.
- Preserve the untracked file `docs/prompts/migrate-atlas-research-to-render-workflows.md`. Do not stage, edit, delete, or include it in commits.
- Do not rewrite any file under `packages/journey-corpus/records/`. Their SHA-256 hashes are frozen and checked by the validator.

### Current corpus state (as of handoff)

| Metric | Value |
|---|---|
| Roster size | 205 |
| Audit files on disk | 189 |
| `verified` | 1 (Render only) |
| `needs-human-judgment` | 188 |
| `blocked` | 0 |
| `pending` | **16** |

Calibration audits already present and must remain intact unless a cold checker finds a real contract violation:

- `packages/journey-corpus/audits/render.json` → `verified` (8 actions, 13 fields, 1 wait, 1 gate)
- `packages/journey-corpus/audits/zoom.json` → `needs-human-judgment` (`counts: null`)

### The 16 platforms that still lack an audit sidecar

```
arduino
canva-developer-platform
mapbox
dolby-io
cloudinary
imgix
gitguardian
semgrep
cyberark
f5-distributed-cloud
dwolla
marqeta
paddle
chargebee
celonis
uipath
```

Frozen source-record hashes live at `/tmp/atlas-record-hashes.freeze.json` (regenerate if missing by hashing every `records/<slug>.json`). Copy the exact hash for each new audit into `source_record_sha256`.

## Where we want to be

Finish the assignment. Terminal state:

1. Every roster slug has `packages/journey-corpus/audits/<slug>.json`
2. `audit-status.json` reports `pending: 0`
3. Every platform is honestly `verified`, `needs-human-judgment`, or `blocked`
4. Every verified audit has exact derived counts; every non-verified audit has `counts: null`
5. An independent checker has cold-reviewed the corpus (or a representative risk sample plus every newly written audit)
6. Source-record hashes still match the freeze
7. Full verification gate passes
8. Changes are committed on `research/audit-entire-corpus`, pushed to `atlas`, and a PR is opened against `ojusave/developer-journey-atlas:main`

Finishing does **not** mean forcing platforms to `verified`. A well-evidenced unresolved or blocked audit is complete. A guess labeled verified is not.

## Contract (read completely before editing)

- `packages/journey-corpus/SELECTION-POLICY.md`
- `packages/journey-corpus/MEASUREMENT-CONTRACT.md`
- `packages/journey-corpus/shortest-path-audit.schema.json`
- `packages/journey-corpus/audits/render.json`
- `packages/journey-corpus/audits/zoom.json`
- `packages/journey-corpus/scripts/validate-shortest-path-audits.mjs`
- Original program prompt: `docs/prompts/audit-shortest-required-onboarding-paths.md`

Hard rules:

- Path starts at account creation and ends at the earliest official first-success outcome for one bounded goal.
- Lexicographic route rule from SELECTION-POLICY. Equal consequential routes → `needs-human-judgment`.
- One form submission = one action; list every required field under that action; count fields separately.
- Exclude docs reading, optional work, platform automation, and passive waits from `required_path`.
- Never invent signup fields behind auth. Prefer `needs-human-judgment` or `blocked`.
- `verified` requires: no unverified evidence states, empty `uncertainties`, non-null matching counts.
- Non-verified requires: `counts: null` and at least one uncertainty with exact `evidence_needed`.
- Action objects may only contain: `step_number`, `kind`, `interface`, `action`, `required_fields`, `observable_result`, `evidence_state`, `source_ids`. Do **not** put `notes` on actions (only on fields).
- `audited_at` for new work: today's date in `YYYY-MM-DD`.

## Execution steps

### 1. Establish state

```sh
cd /Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/scanner-app
git status -sb
git fetch atlas --prune
git branch --show-current   # expect research/audit-entire-corpus
npm --prefix packages/journey-corpus run audit:paths:check
```

Confirm the 16 pending slugs above still match `audit-status.json`. If some are already filled, skip them and recompute remaining.

### 2. Write the 16 missing audits (makers)

You may spawn parallel maker subagents. Give each exclusive slug ownership.

For each remaining slug:

1. Read `records/<slug>.json` for discovery only.
2. Reopen current official docs / public signup UI (Exa `web_search_exa` + `web_fetch_exa`, or WebFetch). Search results are not evidence.
3. Write `packages/journey-corpus/audits/<slug>.json` matching the schema exactly.
4. Prefer honest `needs-human-judgment` when signup fields, product/route choice, or first-success boundary cannot be established from public evidence.
5. Never touch `records/`, schemas, validators, or another agent's audit files.

Suggested exclusive shards for the remaining 16:

| Shard | Slugs |
|---|---|
| A | arduino, canva-developer-platform, mapbox |
| B | dolby-io, cloudinary, imgix |
| C | gitguardian, semgrep, cyberark, f5-distributed-cloud |
| D | dwolla, marqeta, paddle, chargebee |
| E | celonis, uipath |

After makers finish, strip any illegal keys (`notes` on actions, etc.), then run:

```sh
npm --prefix packages/journey-corpus run audit:paths
```

Stop maker work only when `pending: 0`.

### 3. Independent checker pass (required)

No maker may approve its own work. Spawn separate checker agents, or do a cold second pass yourself that reopens sources without relying on the draft narrative.

Minimum checker scope:

1. **Every newly written audit** from the 16 (mandatory).
2. **Risk sample of existing maker audits** (at least one per category, plus any that claim `verified` if any appear beyond Render). Prefer downgrading over rubber-stamping.
3. Prompt-failure simulations from the original program:
   - docs/optional/platform events counted as actions
   - shorter gated route preferred over a no-gate route
   - unverified fields invented
   - equal routes silently chosen
   - public wrappers still exposing legacy counts for non-verified platforms

Checker actions:

- Approve, correct, or downgrade each reviewed audit.
- If evidence cannot reproduce the route/terminal, set `needs-human-judgment` or `blocked`, set `counts: null`, and state exact `evidence_needed`.
- Confirm `source_record_sha256` still matches the freeze / live record hash.
- Confirm no file under `records/` changed.

### 4. Integrity scrub

Run a whole-corpus schema scrub before the gate:

- No additional properties on actions or fields beyond the schema.
- Verified audits have matching counts and zero uncertainties.
- Non-verified audits have null counts and ≥1 uncertainty.
- Source IDs referenced everywhere exist in `sources[]`.
- Step numbers contiguous from 1.

Regenerate status:

```sh
npm --prefix packages/journey-corpus run audit:paths
npm --prefix packages/journey-corpus run audit:paths:check
```

Confirm record-hash freeze:

```sh
# compare every records/*.json SHA-256 to /tmp/atlas-record-hashes.freeze.json
# regenerate freeze only if the file is missing; never change records to match audits
```

### 5. Full verification gate

```sh
npm --prefix packages/journey-corpus run audit:paths
npm --prefix packages/journey-corpus run audit:paths:check
npm --prefix packages/journey-corpus run check
npm --prefix packages/journey-corpus test
npm --prefix packages/journey-corpus run test:app
npm --prefix packages/journey-corpus run site
node packages/journey-corpus/scripts/check-llm-site.mjs
npm run test:all
npm run typecheck
npm run build
render blueprints validate render.yaml
git diff --check
```

Then verify:

- `pending: 0` in `audit-status.json`
- non-verified platforms expose no legacy path / comparison totals in catalog, LLM artifacts, API, or UI
- no score, rank, drop-off, conversion, or causal claim introduced
- source records unchanged

### 6. Publish

Stage only audit sidecars and directly related generated/validation files (for example `audit-status.json` and regenerated site/LLM artifacts produced by the gate). Never stage:

- `docs/prompts/migrate-atlas-research-to-render-workflows.md`
- secrets, `.env`, or unrelated local work
- any `records/` file

```sh
git add packages/journey-corpus/audits packages/journey-corpus/audit-status.json
# plus any other generated artifacts the gate updated, if present and related

git commit -m "$(cat <<'EOF'
Complete shortest-path audit for entire corpus

Finish the remaining pending platform audits, run independent review,
and regenerate audit-status so pending reaches zero. Source records
are unchanged; public counts remain withheld for non-verified audits.
EOF
)"

git push -u atlas HEAD
gh pr create --repo ojusave/developer-journey-atlas --base main --head research/audit-entire-corpus \
  --title "Complete shortest-path audit for entire corpus" \
  --body "$(cat <<'EOF'
## Summary
- Finish remaining pending shortest-path audits (`pending: 0`)
- Independent checker pass on new audits + risk sample
- Regenerate `audit-status.json` and related artifacts
- Confirm `records/` hashes unchanged

## Status totals
- verified: <N>
- needs-human-judgment: <N>
- blocked: <N>
- pending: 0

## Test plan
- [ ] `npm --prefix packages/journey-corpus run audit:paths:check`
- [ ] `npm --prefix packages/journey-corpus test` and `test:app`
- [ ] `npm run test:all` / typecheck / build
- [ ] Confirm catalog/LLM files withhold counts for non-verified platforms
- [ ] After merge: production health, audit-status, catalog, llms.txt
EOF
)"
```

Do not merge until required checks pass. After merge, wait for Render auto-deploy and verify production.

## Parallelism

You are authorized to spawn maker and checker subagents with exclusive file ownership. Parent owns:

- roster / assignment map
- conflict resolution
- status regeneration
- verification gate
- commit / push / PR

Workers must return: assigned slugs, final status per slug, official URLs opened, unresolved evidence, files changed, validator result, and confirmation that `records/` were untouched.

## Assignment status return

Return one status:

- `COMPLETE`: pending 0, checks passed, PR opened (or ready)
- `NEEDS HUMAN JUDGMENT`: corpus finished but consequential unresolved items remain (expected; still `COMPLETE` for the assignment if pending is 0 and those platforms are correctly classified)
- `BLOCKED`: required official evidence/access unavailable for remaining work
- `NOT FEASIBLE`: cannot finish safely from available evidence
- `STAGNATED`: two strategies failed without progress

Return one evidence state:

- `ARTIFACT VERIFIED` when audits, hashes, and local gates pass
- `OUTCOME VALIDATED` only after production verification post-merge
- `DECISION READY` when the PR is ready for human merge

Passing JSON/tests alone is not enough to mark research quality `verified` for a platform. It is enough to mark the **assignment** complete once every platform has an honest terminal audit status and the gate is green.
