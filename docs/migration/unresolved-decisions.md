# Developer Journey Atlas unresolved decisions

These items are intentionally unresolved. None is approved by the local migration.

## Required before publication

1. **Approve the public repository plan.** The recommendation is a new `ojusave/developer-journey-atlas` repository, initially private. Publish and verify it before archiving the two historical repositories. Do not delete them.
2. **Resolve licensing.** Use Apache License 2.0 for software and CC BY 4.0 for original research records, taxonomy content, documentation, and generated data views, subject to ownership confirmation. The journey-corpus README currently says there is no public license while its `package.json` says MIT.
3. **Choose deployment ownership.** The recommendation is one production application owned by the new repository, with research intake remaining a review-gated job in the same repository. Retarget and verify staging before changing the live Render service.
4. **Resolve current dependency advisories.** A clean npm audit reports three moderate and two low transitive findings through optional Mastra dependencies. There are no high or critical findings. The affected Hono Windows static-file path is not used by the scanner, but the lockfile should be updated when an upstream-compatible release is available.

## Licensing recommendation

- [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) is designed for software and includes an explicit patent license.
- [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) covers copyright and applicable database rights while preserving attribution for the research work.
- Creative Commons [recommends software-specific licenses for software](https://creativecommons.org/faq/#can-i-apply-a-creative-commons-license-to-software), which is why one CC license should not cover the whole repository.
- Linked vendor documentation, trademarks, quotations, and other third-party material remain under their original rights. The Atlas license can cover only original expression, selection, arrangement, and database rights owned by the licensor.

Before adding the license files, confirm that Ojus owns or has permission to license all original contributions. Then add explicit path scope, attribution instructions, and matching package metadata. This is a licensing recommendation, not legal advice.

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
