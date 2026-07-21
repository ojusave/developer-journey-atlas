# Developer Journey Atlas naming migration

## Decision

The public product name is Developer Journey Atlas.

## This migration

Use the new name in integration documentation and generated Atlas views. Preserve historical filenames, blocker IDs, repository URLs, package names, storage keys, database identifiers, environment variables, Render resources, telemetry service names, and deployed URLs.

## Later migration

Rename technical identifiers only after the consolidated repository is approved and published. Inventory each identifier, identify readers and writers, provide compatibility aliases, verify rollback, and migrate one boundary at a time.

Do not rename the GitHub repository and Render resources in the same change. Do not change browser storage or exported case schemas without explicit backward-compatibility tests.

Historical source text may continue to use “first mile” when changing it would falsify provenance or break stable references.

## Recommended GitHub publication sequence

1. Create `ojusave/developer-journey-atlas` as a private repository with no generated starter commit.
2. Push the verified migration branch as `main`, then rerun clean Node 22, Atlas integrity, Gitleaks, and GitHub Actions checks from the new remote.
3. Retarget unknown-platform draft PRs and a staging deployment to the new repository. Keep production on the historical source until staging passes.
4. Make the new repository public only after licensing, dependency, links, and deployment ownership are resolved.
5. Replace both historical repository READMEs with a pointer to the Atlas and archive them. Keep their GitHub URLs and history available for provenance.

Deleting the historical repositories is not recommended. Archiving makes them read-only while preserving links, stars, issues, commit references, and a recovery path. Reconsider deletion only after a documented cooling-off period and an audit showing no remaining external links, deployments, automation, or provenance need.
