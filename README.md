# First-Mile Scanner

This repository contains the experimental adaptive scanner for the DevRelCon first-mile workshop side quest. The private product and architecture record remains the canonical decision log. This repository is the canonical source for the deployable application.

## What is implemented

- A friendly mobile-first React interface with deterministic name, company or project, platform, and role intake.
- A visible choice between adaptive help and a browser-only guided path.
- A bounded D1 to D10 diagnostic engine with one focused question at a time, corrections, explicit uncertainty, evidence validation, valid non-intervention endings, an explicit choice after 12 diagnostic prompts, and a hard stop at 15.
- A compiled versioned research graph containing 790 preserved blocker reasons across 28 universal families and 16 platform archetypes.
- Browser resume, retry recovery that survives reload, validated JSON import and export, Markdown Action Brief export, correction retraction, clear-case deletion, seven-day evidence notes, and an offline application shell.
- An anonymous Node service with Postgres persistence, revision checks, idempotency, short-lived encrypted answer envelopes, and no name or company fields.
- An optional single-call Mastra reasoner through a pinned OpenRouter model. Deterministic reasoning is the safe default.
- A feature-gated Render Workflow task that receives opaque IDs only. Direct processing is the safe default.
- A friendly short route when a participant is bored or wants to stop. Interruption text is not retained as case evidence.
- Optional Arize OpenTelemetry export containing operational metadata only. Raw answers, prompts, reflections, names, companies, and Action Brief content are not exported.

## Local run

Node 22.13 or newer is required.

Install and verify:

```sh
npm ci
npm run test:run
npm run typecheck
VITE_ADAPTIVE_ENABLED=true npm run build
npm --prefix workflows run typecheck
npm --prefix workflows run build
```

Run the production-shaped deterministic service without external credentials:

```sh
VITE_ADAPTIVE_ENABLED=true npm run build
ALLOW_IN_MEMORY_STORE=true REASONING_MODE=deterministic npm start
```

Open `http://127.0.0.1:10000`. This in-memory mode is local-only. Production startup rejects it.

For live frontend development, run the service and Vite separately:

```sh
npm run dev:server
VITE_ADAPTIVE_ENABLED=true npm run dev
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

The Blueprint deliberately starts with `REASONING_MODE=deterministic`, `EXECUTION_MODE=direct`, and Arize disabled. Render Workflows must be created manually because Blueprints do not manage them. Follow [the Workflow operator notes](workflows/README.md) only after the live per-turn benchmark passes.

Optional provider credentials are not declared with `sync: false` in the initial Blueprint because Render would require every placeholder during creation even though those features are disabled. Add the relevant keys from `.env.example` in the Dashboard only when enabling that feature.

No Render resources have been created. This folder is not currently connected to a Git remote, so there is no safe deploy source yet.

## Rollback switches

- Model problem: set `REASONING_MODE=deterministic` and restart.
- Workflow problem: set `EXECUTION_MODE=direct` and restart.
- Arize problem: set `ARIZE_TELEMETRY_ENABLED=false` and restart.
- Adaptive product problem: set `VITE_ADAPTIVE_ENABLED=false`, rebuild, and deploy the guided-only client.
- Data incident: disable the service, rotate affected credentials and `SESSION_ENVELOPE_KEY`, review Postgres retention and backups, and do not claim deletion beyond what was verified.

## Current release gate

The implementation is **artifact verified**, not **outcome validated** and not approved for workshop traffic.

The remaining gates are external or research-quality gates:

- zero individual reason cards are currently diagnosis eligible, so the app may narrow families and prescribe evidence but must not claim an individual cause;
- the live OpenRouter and Mastra path has not been exercised with a rotated restricted key;
- the Arize export has not been observed in a real project;
- the Render Web Service, Postgres, and per-turn Workflow path have not been load-tested together;
- the actual room concurrency, shared-network behavior, provider cost cap, and abuse controls have not been verified; and
- five representative practitioners have not yet completed a moderated pilot showing that the flow is useful, understandable, and not boring.

The final local release candidate passed 114 application and server tests plus four Workflow tests. Its production-shaped browser smoke covers adaptive and guided completion, accessibility, boredom recovery, retry persistence, expired-retry recovery, correction retraction through Markdown export, resume, deletion, offline shell, and layouts from 320px through 1280px. A 100-session local concurrency smoke completed all 100 with zero failures, 103ms p95, and 121ms maximum session time. The locally running Workflow adapter also accepted and completed an opaque per-turn dispatch, and the Blueprint validates as three actions.

The production bundle is 144.33KB gzip. Vite reports the uncompressed 700.31KB client chunk as large, so test first load on the actual event network before public use. `npm audit` reports no critical, high, or moderate findings. Three low-severity findings remain in Mastra's nested legacy AI SDK utility chain. The current Mastra release is already installed and an audit-fix dry run proposes no safe package change, so track the upstream fix instead of forcing an incompatible override.

Keep the QR code and public workshop claim blocked until those gates pass.
