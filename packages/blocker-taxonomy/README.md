# Developer Journey Atlas blocker taxonomy

This package is the canonical source for the blocker inventory used by Developer Journey Atlas.

The taxonomy contains 790 possible blocker hypotheses across 28 universal families and 16 platform archetypes. A listed blocker is not evidence that it occurred, is common, or caused a developer to stop.

`first-mile-blocker-universe.md` retains its historical filename and stable IDs for provenance. Public product language uses Developer Journey Atlas.

Run `npm run catalog:build` from the repository root after changing the taxonomy. The generated runtime catalog marks every individual reason `not_diagnosis_eligible` unless a separate evidence process changes that status.
