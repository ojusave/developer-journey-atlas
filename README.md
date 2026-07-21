# Developer Journey Atlas

Developer Journey Atlas combines a source-grounded corpus of documented developer journeys with a separate blocker-hypothesis taxonomy and the existing map-first scanner application.

The repository is being consolidated locally. The existing GitHub repository, package names, deployment resources, storage keys, and runtime identifiers retain their historical names until a separate publication and compatibility migration is approved.

## Research boundaries

- `packages/journey-corpus/records/*.json` is the canonical source for 205 documented platform journeys.
- `packages/blocker-taxonomy/first-mile-blocker-universe.md` is the canonical source for 790 blocker hypotheses.
- `packages/generated-views/atlas.md` and `atlas.jsonl` are deterministic human and LLM projections. Do not edit them directly.
- A documented friction gate is not a confirmed drop-off point.
- A blocker hypothesis is not a diagnosis without evidence from a specific attempt.

Run `npm run atlas:verify` after changing either canonical dataset. See `docs/research-guide/` for the data model, evidence method, retrieval contract, intake workflow, and anonymized-comparison rules.

## Existing scanner application

The scanner remains the deployable application while the combined data system is verified. The private product and architecture record remains the canonical decision log for the workshop application.

## What is implemented

- A friendly mobile-first React interface with deterministic name, company or project, platform, and role intake.
- An editable eight-stage developer journey from encounter and access through a representative operation and independently verified success.
- Two evidence-placement decisions, the furthest stage definitely reached and the earliest unresolved transition, followed by exactly one stage-specific discriminator.
- Immediate map feedback before any cause question, participant-owned conclusions, explicit uncertainty, and valid non-intervention, legitimate-gate, deliberate-non-fit, and evidence-gap endings.
- A compiled versioned research graph built from the repository's [blocker taxonomy](packages/blocker-taxonomy/first-mile-blocker-universe.md), containing 790 preserved blocker hypotheses across 28 universal families and 16 platform archetypes.
- Browser resume, validated JSON import and export, Markdown journey-map export, correction retraction, clear-map deletion, and an offline application shell.
- An anonymous Node service with Postgres persistence, revision checks, idempotency, short-lived encrypted answer envelopes, and no name or company fields.
- An optional single-call Mastra reasoner through a pinned OpenRouter model. Deterministic reasoning is the safe default.
- A feature-gated Render Workflow task that receives opaque IDs only. Direct processing is the safe default.
- The earlier 16-screen adaptive interview remains in Git history for audit, but it is no longer the participant-facing path because it delayed value until the final screen.
- Optional Arize OpenTelemetry export containing operational metadata only. Raw answers, prompts, reflections, names, companies, and Action Brief content are not exported.

## Local run

Node 22.22.0 is the verified runtime used by Render and the deployment checks.

Install and verify:

```sh
npm ci
npm run test:run
npm run typecheck
npm run build
npm --prefix workflows run typecheck
npm --prefix workflows run build
```

Run the production-shaped deterministic service without external credentials:

```sh
npm run build
ALLOW_IN_MEMORY_STORE=true REASONING_MODE=deterministic npm start
```

Open `http://127.0.0.1:10000`. This in-memory mode is local-only. Production startup rejects it.

For live frontend development, run the service and Vite separately:

```sh
npm run dev:server
npm run dev
```

Vite proxies `/api` to the service on port 10000.

## Verification commands

With the deterministic service running on port 10000:

```sh
npm run test:e2e
CONCURRENCY=100 npm run test:load
render blueprints validate render.yaml
```

The load script is a local concurrency smoke, not evidence about Render, Postgres, OpenRouter, or Workflow capacity.

## Data and privacy boundaries

- Name and company or project stay in browser storage and exports.
- The adaptive service accepts platform archetype context and diagnostic answers only. Profile fields are rejected.
- Accepted answers are stored in application-encrypted envelopes. The envelope is expunged after processing or after its short TTL.
- Ordinary logs contain operational IDs, objective IDs, status, and latency, not answer text.
- Arize is disabled by default. When enabled, manual spans contain only pseudonymous and operational metadata. Mastra auto-instrumentation is intentionally not used because it would normally capture prompts and completions.
- Clearing a case first confirms server deletion, then removes the browser copy.
- Never paste secrets, customer data, real incident details, or private company information into a test case.

## Enabling Mastra and OpenRouter

Do not reuse a key that has appeared in chat, terminal output, screenshots, or source control. Create a new restricted key and inject it as an environment variable.

Before changing `REASONING_MODE` to `mastra`:

1. Pin one evaluated model in `DIAGNOSTIC_MODEL`. Auto-routing is rejected by configuration.
2. Verify input and output logging and provider broadcast are disabled for the key and account.
3. Approve the provider allowlist and its data-retention terms.
4. Set a hard account credit cap and alert.
5. Run the normal, non-attempt, aggregate, correction, dead-end, malformed, timeout, and false-green cases from the canonical evidence gate.
6. Confirm that deterministic validation rejects invented or unsupported catalog IDs.

The request already sends OpenRouter data-collection denial, zero-data-retention routing, required-parameter routing, a strict schema, one model step, no tools, and a 20-second timeout. Those request controls do not prove account-level privacy settings.

## Enabling Arize

Set `ARIZE_TELEMETRY_ENABLED=true` only with `ARIZE_API_KEY`, `ARIZE_SPACE_ID`, and `ARIZE_PROJECT_NAME`. The default endpoint is the Arize US OTLP HTTP trace endpoint. Change `ARIZE_OTLP_ENDPOINT` for an approved regional endpoint.

Observability is outside the diagnostic authority boundary. It cannot make a candidate valid, and its failure must not determine the attendee result. A live trace has not been verified because no Arize credentials were available.

## Render deployment shape

`render.yaml` validates as three Blueprint actions:

- one Node web service;
- one paid Postgres database; and
- one shared environment group for the Workflow callback secret.

The Blueprint deliberately starts with `REASONING_MODE=deterministic`, `EXECUTION_MODE=direct`, and Arize disabled. Render Workflows are separate resources because Blueprints do not manage them.

Optional provider credentials are not declared with `sync: false` in the initial Blueprint because Render would require every placeholder during creation even though those features are disabled. Add the relevant keys from `.env.example` in the Dashboard only when enabling that feature.

Deployment is not part of the current open-source release. On July 21, 2026, the historical Scanner URL returned `404`, and the previously recorded Scanner service, database, and Workflow were no longer present in the selected Render workspace. Historical deployment checks remain evidence of past behavior only.

Treat `render.yaml` as a proposed deployment shape, not the source of truth for a current environment. Validate it against a staging environment before creating or changing Render resources. The separate research static site remains connected to the historical data repository and must be retargeted in a deployment-specific change.

## Rollback switches

- Model problem: set `REASONING_MODE=deterministic` and restart.
- Workflow problem: set `EXECUTION_MODE=direct` and restart.
- Arize problem: set `ARIZE_TELEMETRY_ENABLED=false` and restart.
- Adaptive product problem: set `VITE_ADAPTIVE_ENABLED=false`, rebuild, and deploy the guided-only client.
- Data incident: disable the service, rotate affected credentials and `SESSION_ENVELOPE_KEY`, review Postgres retention and backups, and do not claim deletion beyond what was verified.

## Licensing

Repository software is licensed under the [Apache License 2.0](LICENSE). Original research records, taxonomy content, documentation, and generated research views are licensed under [Creative Commons Attribution 4.0 International](DATA_LICENSE.md).

Read [LICENSE_SCOPE.md](LICENSE_SCOPE.md) for the exact path boundaries and third-party exclusions.

Contributions are welcome under the evidence and licensing rules in [CONTRIBUTING.md](CONTRIBUTING.md).

Report vulnerabilities and sensitive research-data concerns through the process in [SECURITY.md](SECURITY.md).

## Current release gate

The implementation is **artifact verified**, not **outcome validated**. No current Scanner deployment is verified or approved for workshop traffic.

The first live participant-flow review failed: the app behaved like a long diagnostic interview, required 15 transitions before synthesis, and did not make the purpose of its questions clear. The current map-first frontend is the corrective release candidate. It must be redeployed and tested by Ojus and representative practitioners before replacing that failure with a workshop-readiness claim.

The remaining gates are external or research-quality gates:

- zero individual reason cards are currently diagnosis eligible, so the app may narrow families and prescribe evidence but must not claim an individual cause;
- the participant-facing map currently uses deterministic research routing and does not invoke the optional OpenRouter and Mastra path;
- the optional OpenRouter and Mastra path has not been exercised with a rotated restricted key;
- the Arize export has not been observed in a real project;
- automatic web-to-Workflow dispatch remains disabled until a long-lived Render API key is added and that path passes the same live checks;
- the actual room concurrency, shared-network behavior, provider cost cap, and abuse controls have not been verified; and
- five representative practitioners have not yet completed a moderated pilot showing that the flow is useful, understandable, and not boring.

The release candidate passed 114 application and server tests plus four Workflow tests. The local browser smoke covers the map-first mobile flow, value before diagnosis, stage-specific research routing, accessibility, correction retraction, Markdown and JSON export, resume, deletion, offline shell, and layouts from 320px through 1280px. Historical checks recorded a 100-session concurrency smoke with zero failures and one successful opaque Workflow callback. Those checks do not establish the state of any current deployment. The Blueprint validates as three actions, and any future deployment must repeat the runtime checks in its target environment.

The current local production build is 133.12KB gzip. Vite reports the uncompressed 661.21KB client chunk as large, primarily because the complete research catalog is available offline, so test first load on the actual event network before public use. A clean npm audit currently reports three moderate and two low transitive findings through optional Mastra dependencies, with no high or critical findings. The Mastra path is disabled by default. Track or adopt an upstream-compatible fix instead of forcing an incompatible override.

Keep the QR code and public workshop claim blocked until those gates pass.
