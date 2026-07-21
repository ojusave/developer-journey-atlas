# Developer Journey Atlas unresolved decisions

These items are intentionally unresolved. None is approved by the local migration.

## Required before publication

1. **Choose the public repository plan.** Decide whether the scanner repository becomes the monorepo remote, whether a new remote is created, and what happens to each current repository. Do not archive either source until the published monorepo and rollback path are verified.
2. **Run a dedicated secret scan.** The pattern audit passed, but a purpose-built scanner has not been run against the full combined history.
3. **Verify Node 22.** The full suite passed on Node 24.13.0, not the repositories' declared Node 22 runtime.
4. **Resolve licensing.** The journey-corpus README says there is no public license while its `package.json` says MIT. Human or legal review must establish the intended license before publishing the combined work.
5. **Approve transformations.** Every entry in `migration-map.json` has `approved: false`. A human must review and approve semantic transformations before they are treated as authoritative.
6. **Choose deployment ownership.** The current scanner and journey-corpus services have separate runtime assumptions. Updating remote URLs, Render resources, environment variables, or CI targets requires a separate deployment plan.

## Required before product diagnosis

1. **Define canonical multi-journey identity.** Source records have platform slugs but no durable journey IDs. `journey:<slug>:documented-primary` is only a deterministic compatibility ID for generated views.
2. **Validate research freshness.** The imported records retain their source dates and statuses. The migration did not re-research any platform, so outputs must not imply currentness beyond the cited evidence date.
3. **Set a diagnosis evidence threshold.** The 790 blocker entries are hypotheses, not observed reasons for drop-off. Returning a blocker as a diagnosis requires attempt-level evidence and a documented eligibility rule.
4. **Validate comparison cohorts.** Anonymous comparisons must use compatible outcomes and documented cohort rules. The current corpus does not establish market prevalence or peer performance.
5. **Test language with real users.** The human-readable format follows the documented plain-language rules, but ADHD readability and actionability have not been tested with users.
6. **Retarget unknown-platform automation.** The imported draft-PR research flow still reflects the original repository and configuration. Update it only after the monorepo publication target and review ownership are approved.

## Explicitly outside this migration

- Building or redesigning the UI
- Automatically merging research for an unknown platform
- Renaming infrastructure or package identifiers
- Publishing, pushing, deploying, or archiving repositories
- Claiming that documented friction explains actual user abandonment
