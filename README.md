# Developer Journey Atlas

Open, source-grounded research into the shortest required path from account creation to first developer success.

[Live Atlas](https://developer-journey-atlas.onrender.com) | [Data manifest](https://developer-journey-atlas.onrender.com/data/index.json) | [LLM guide](https://developer-journey-atlas.onrender.com/llms.txt) | [Research method](docs/research-guide/research-method.md)

> The repository preserves 205 official-documentation evidence records. Only records that pass the new shortest-path audit expose action counts or peer context. This is not observed conversion, activation, completion-time, or drop-off data.

## Start here

Search for a platform in the public wrapper. The result shows:

- the audit status for the selected platform;
- every verified required action and field from account creation to first success;
- unavoidable waits, external gates, platform outcomes, and explicit exclusions;
- anonymous placement beside qualified same-category peers;
- exact unresolved evidence when a route cannot yet be verified;
- the official sources and complete evidence record.

If the platform is missing, the optional research pipeline can search official docs, assemble a schema-valid draft, show it immediately, and open a draft pull request for human review.

## Quick start

Node.js 22 is recommended.

```sh
git clone https://github.com/ojusave/developer-journey-atlas.git
cd developer-journey-atlas/packages/journey-corpus
npm ci
npm run build:data
npm run build:app
npm start
```

Open `http://localhost:3000` and search for `Render`.

## What the comparison means

Peer context is not a weighted score. When enough verified peers exist, it compares four visible signals with an anonymous qualified peer cohort:

1. required developer actions;
2. required fields;
3. unavoidable waits; and
4. external gates.

A comparison appears only when the subject and at least three peers have verified shortest-path audits, complete source research, the same category and normalized first-success type, compatible research granularity, and acceptable comparability metadata. Peer names are never returned by the public comparison.

This is route structure, not a judgment of ease or quality. Real drop-off claims require observed journey evidence under the [diagnosis evidence contract](docs/research-guide/diagnosis-evidence-contract.md).

## Repository map

| Path | Purpose |
| --- | --- |
| `packages/journey-corpus/records/` | 205 preserved source-grounded evidence records |
| `packages/journey-corpus/audits/` | Reviewed shortest-required-path audits |
| `packages/journey-corpus/audit-status.json` | Corpus-wide verified, unresolved, blocked, and pending state |
| `packages/journey-corpus/web/` | Public search and diagnosis wrapper |
| `packages/journey-corpus/src/` | API, research adapters, comparison contract, and GitHub contribution flow |
| `packages/blocker-taxonomy/` | 790 preserved blocker hypotheses, not observed causes |
| `packages/generated-views/` | Deterministic human and LLM projections |
| `src/` and `server/` | Evidence-gated diagnostic scanner retained in the monorepo |
| `docs/research-guide/` | Research, evidence, comparison, and intake contracts |
| `examples/wrapper/` | Product flow and integration example |
| `render.yaml` | Canonical Render Blueprint |

## Data for humans and LLMs

- Human-readable catalog: [`packages/generated-views/atlas.md`](packages/generated-views/atlas.md)
- JSON Lines projection: [`packages/generated-views/atlas.jsonl`](packages/generated-views/atlas.jsonl)
- Individual evidence records: [`packages/journey-corpus/records/`](packages/journey-corpus/records)
- Shortest-path audits: [`packages/journey-corpus/audits/`](packages/journey-corpus/audits)
- Corpus audit status: [`packages/journey-corpus/audit-status.json`](packages/journey-corpus/audit-status.json)
- Record schema: [`packages/journey-corpus/record.schema.json`](packages/journey-corpus/record.schema.json)
- Audit schema: [`packages/journey-corpus/shortest-path-audit.schema.json`](packages/journey-corpus/shortest-path-audit.schema.json)
- Retrieval guide: [`docs/research-guide/llm-retrieval-guide.md`](docs/research-guide/llm-retrieval-guide.md)
- Deployed LLM entry point: [`/llms.txt`](https://developer-journey-atlas.onrender.com/llms.txt)

Canonical source records and audit records stay readable JSON. Source records are preserved during re-audit. Generated views must not be edited directly.

## Optional live research

The wrapper works without external providers. To research missing platforms:

```sh
export RESEARCH_ENABLED=true
export YDC_API_KEY=your_you_com_key
export OPENROUTER_API_KEY=your_openrouter_key
export GITHUB_TOKEN=your_restricted_github_token
npm start
```

- You.com locates official documentation.
- OpenRouter reconstructs a draft under the repository schema.
- `GITHUB_TOKEN` is optional. When present, it must be restricted to opening a branch and draft pull request in `ojusave/developer-journey-atlas`.
- Every draft is labeled unverified and never auto-merged.

## Verify changes

From the repository root:

```sh
npm ci
npm --prefix packages/journey-corpus ci
npm run test:all
npm run typecheck
npm run build
```

For corpus-only work:

```sh
npm --prefix packages/journey-corpus run validate
npm --prefix packages/journey-corpus run audit:paths:check
npm --prefix packages/journey-corpus run check
npm --prefix packages/journey-corpus run test:app
```

See [CONTRIBUTING.md](CONTRIBUTING.md) before changing research records.

## Deploy on Render

The root [`render.yaml`](render.yaml) creates one Node web service rooted at `packages/journey-corpus`. The public wrapper and all generated data interfaces are served together.

[Deploy to Render](https://render.com/deploy?repo=https://github.com/ojusave/developer-journey-atlas)

Live research is off by default. Add `YDC_API_KEY`, `OPENROUTER_API_KEY`, and optionally `GITHUB_TOKEN` in the Render Dashboard, then set `RESEARCH_ENABLED=true`.

Render Workflows are not required for the first release. They are a reasonable later extraction if research jobs become long-running or high-volume, but Workflow services are currently separate from Blueprint-managed services.

## Videos

- Overview video: [placeholder and recording brief](docs/videos/README.md#overview-video)
- Adding a missing platform: [placeholder and recording brief](docs/videos/README.md#research-contribution-video)

## License

- Software: [Apache License 2.0](LICENSE)
- Original research and documentation: [CC BY 4.0](DATA_LICENSE.md)
- Exact path boundaries and third-party exclusions: [LICENSE_SCOPE.md](LICENSE_SCOPE.md)
