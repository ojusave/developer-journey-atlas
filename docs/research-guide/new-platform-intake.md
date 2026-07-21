# New platform intake

User input begins research. It does not directly change the published corpus.

## State machine

```text
requested
  -> duplicate-or-alias
  -> researching
  -> partial | blocked | needs-review
  -> published
```

`rejected` is used when the request is out of scope or cannot identify a developer platform.

## Required sequence

1. Normalize the submitted name without assigning a new identity prematurely.
2. Check existing slugs, names, organizations, and aliases.
3. Define one bounded developer goal.
4. Locate current official sources.
5. Draft the route using the canonical journey schema.
6. Validate every source reference and unresolved transition.
7. Generate human and LLM projections.
8. Require independent review before publication.

The existing live-research service may create a draft pull request. A draft PR is an intake artifact, not publication or approval. It must never auto-merge.

The machine-readable intake contract is `schemas/platform-intake.schema.json`.
