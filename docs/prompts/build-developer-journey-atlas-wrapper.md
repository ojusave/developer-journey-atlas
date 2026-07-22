# Build and deploy the Developer Journey Atlas wrapper

## Role

Act as the senior product engineer, research-methods reviewer, and deployment owner for the Developer Journey Atlas open source repository.

## Outcome

Ship a public, production-ready wrapper that lets someone search for a developer platform and quickly understand:

1. The documented route from entry point to first success.
2. The prerequisites, required actions, waits, decisions, and friction gates on that route.
3. Where that documented route sits beside qualified peers in the same category.
4. Which parts of the documented route may deserve investigation, without claiming they caused real developer drop-off.
5. The official sources and research date behind every claim.

If a platform is absent, let the visitor start source-grounded research, inspect the machine-drafted result, and create a draft contribution in the same GitHub repository for human review.

## Canonical repository boundary

- Work only in `ojusave/developer-journey-atlas`.
- Do not write, push, open pull requests, or deploy from either legacy repository.
- Keep the corpus, scanner history, wrapper, research pipeline, documentation, and deployment configuration in the canonical monorepo.
- Preserve all canonical records byte-for-byte unless a new, separately reviewed research contribution explicitly changes one.
- Keep new research additions in draft pull requests. Never auto-merge research output.

## Product language

- Product name: Developer Journey Atlas.
- Do not call the product First Mile or First-Mile Atlas.
- Use short, direct, ADHD-friendly copy with clear sections and progressive disclosure.
- Lead with what matters, then let users expand the full path and sources.
- Do not claim the interface is ADHD-accessible without user testing. Do meet practical accessibility requirements.

## Measurement and accuracy contract

All public paths and comparisons must satisfy the canonical [shortest required onboarding path audit](audit-shortest-required-onboarding-paths.md). Source records remain the evidence archive. An unaudited source record must not be presented as a verified shortest path.

Do not invent or imply observed user behavior.

- Never present documentation-derived data as a drop-off rate, conversion rate, usability score, completion probability, or observed completion time.
- Do not expose the existing heuristic effort value as a product score.
- If showing a single summary indicator, call it `Documented onboarding load` and define it as a transparent description of the selected documented route.
- The indicator must derive only from committed structured fields, keep its components visible, and carry a prominent statement that it is not observed drop-off.
- Compare platforms only when category, normalized first-success boundary, research completeness, and comparability status allow it.
- Require at least three qualified peers before showing a category placement. Otherwise show `Not enough comparable peers`.
- Never name individual peers in the public comparison. Show cohort size, median or band, and the selected platform's position.
- Never label a platform easy, hard, good, bad, best, or worst based on documentation counts.
- Describe potential difficulty areas as `investigation prompts` derived from documented prerequisites, waits, decisions, interfaces, and friction gates. Do not call them causes or recorded drop-off reasons.
- Keep every result traceable to its canonical JSON record and official sources.
- Mark live research as machine-drafted and unverified until human review.

## Primary UI flow

### Search state

- One obvious search field with autocomplete.
- Explain in one sentence what the Atlas does and does not measure.
- Show the current platform count.
- Support keyboard navigation, visible focus, reduced motion, and mobile layouts.

### Known platform result

Show a compact summary first:

- platform and category
- documented first success
- selected onboarding surface
- research date and source count
- documented onboarding load label or unavailable state
- required developer actions, waits, decisions, and gates
- anonymous same-category placement when qualified
- two or three investigation prompts, clearly labeled as documentation-derived

Then provide expandable detail:

- prerequisites
- numbered documented path
- success signals
- official source links
- full evidence record
- measurement and comparison caveats

### Unknown platform result

- Say the platform is not yet in the dataset.
- Let the visitor start live research.
- Stream understandable progress updates.
- Search official documentation with You.com only when configured.
- Reconstruct the record with OpenRouter only when configured.
- Validate against the canonical schema before display or contribution.
- Display the draft with source links and an unverified label.
- If GitHub credentials are configured and research is complete, open a draft pull request to `ojusave/developer-journey-atlas` at `packages/journey-corpus/records/<slug>.json`.
- If any provider or GitHub is unavailable, preserve the useful result and explain the degraded state without crashing.

## Architecture

- Upgrade the existing wrapper in `packages/journey-corpus`; do not create a competing application.
- Reuse the existing local data store, assessment builder, research pipeline, schema validator, You.com adapter, OpenRouter adapter, and GitHub draft PR writer.
- Add a public comparison contract with conservative qualification rules and tests.
- Keep research providers optional and disabled cleanly when secrets are absent.
- Use a single Render web service for the first release.
- Do not require Render Workflows for version one. Document it as an optional future extraction for long-running or high-volume research because Workflow services are beta and are not created by Blueprints.

## Render deployment

- Put one canonical `render.yaml` at the repository root.
- Configure a Node web service rooted at `packages/journey-corpus`.
- Use a health check at `/healthz`.
- Deploy automatically only after checks pass.
- Keep all secrets out of Git.
- Add optional Blueprint secret placeholders for `YDC_API_KEY`, `OPENROUTER_API_KEY`, and `GITHUB_TOKEN`.
- Keep the public app usable when those secrets are absent.
- Deploy the merged default branch to Ojus's existing Render production workspace.
- Verify the health endpoint, home page, known-platform flow, unknown-platform degraded or live flow, mobile layout, and production logs.

## Documentation

Rewrite the root README around the canonical monorepo and public wrapper. Borrow the useful information architecture patterns seen in mature open source projects such as LlamaIndex and OpenClaw, without copying their text:

- clear one-sentence positioning
- live demo and documentation links near the top
- quick start that works in a few commands
- repository map
- data integrity and measurement boundaries
- research contribution flow
- Render deployment instructions
- validation commands
- licensing explanation
- roadmap and known limits

Add:

- a wrapper example under `examples/`
- a UI walkthrough document
- placeholders for a short overview video and a research-contribution video
- an LLM-readable entry point and links to the generated data manifest

## Verification

Before publishing:

1. Record hashes of canonical data before implementation.
2. Run package validation, data build checks, application tests, root tests, type checks, and builds.
3. Add tests for peer qualification, minimum cohort size, anonymous output, and no drop-off claims.
4. Confirm canonical record hashes are unchanged except for an intentionally added record.
5. Search user-facing files for stale First-Mile branding and legacy repository URLs.
6. Test the wrapper at desktop and mobile widths.
7. Run an automated accessibility scan and manually verify keyboard search behavior.
8. Confirm all links and JSON evidence routes work.
9. Commit and push only to the `atlas` remote.
10. Merge only after required GitHub checks pass.
11. Deploy only from the canonical repository and verify the public URL.

## Required handoff

Return only the consequential facts:

- production URL
- canonical GitHub repository and pull request or merge commit
- what the score means and does not mean
- whether live research and draft GitHub contributions are enabled
- verification results
- any exact secret or user action still required
