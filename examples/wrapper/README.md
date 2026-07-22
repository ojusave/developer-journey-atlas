# Public wrapper example

This example documents the intended product flow implemented by `packages/journey-corpus/web/`.

## Known platform

```text
Search platform
  -> documented first success
  -> four visible route signals
  -> anonymous qualified-peer comparison
  -> investigation prompts
  -> expandable steps and official evidence
```

Example API requests:

```sh
curl http://localhost:3000/api/search?q=render
curl http://localhost:3000/api/platforms/render
curl http://localhost:3000/data/records/render.json
```

The platform response includes `onboardingLoad`. It reports direct component values and anonymous peer medians. It never includes peer names or the internal heuristic effort score.

## Missing platform

```text
Search platform
  -> no local match
  -> start optional live research
  -> search official docs through You.com
  -> reconstruct and schema-validate through OpenRouter
  -> show unverified draft
  -> optionally open a draft GitHub pull request
  -> human review before merge
```

Provider failures degrade locally. The known-platform search remains available, and a researched draft is still shown if only the GitHub write fails.

## Product copy contract

Say `documented onboarding load`, `route signals`, and `investigation prompts`.

Do not say `drop-off rate`, `conversion score`, `easy`, `hard`, `best`, or `worst` unless future observed evidence supports the claim.

