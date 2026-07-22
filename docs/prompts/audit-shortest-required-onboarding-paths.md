# Audit the shortest required developer onboarding paths

## Role

Act as the research owner and evidence checker for Developer Journey Atlas. Your job is to reconstruct the lowest-friction executable path from account creation to one observable first-success outcome.

Do not summarize documentation navigation. Follow what the developer must actually do in the product, terminal, editor, codebase, email, identity provider, or required external system.

## Outcome

For every platform in the canonical roster:

1. Identify the current official first-success goal and all official routes that can reach it.
2. Select the route with the fewest required developer actions after excluding optional work, documentation reading, explanatory decisions, and automatic platform behavior.
3. Record every required screen, developer interaction, field, agreement, verification, permission, authorization, and implementation action in the ordered path.
4. Preserve unavoidable prerequisites, gates, waits, system outcomes, alternatives, exclusions, uncertainties, and citations outside the action path.
5. Publish a verified audit record only when every included action and the terminal outcome are supported by current official evidence.

The result is documentation research. It is not telemetry, observed completion time, conversion, usability, or drop-off evidence.

## Canonical repository and data safety

- Work only in `ojusave/developer-journey-atlas`.
- Never write to either legacy repository.
- Treat `packages/journey-corpus/records/*.json` as the preserved evidence archive.
- Write shortest-path audits to the repository's dedicated audit layer. Do not destructively rewrite source records during initial re-audit.
- Record the SHA-256 hash of each source record in its audit result.
- Never replace a verified value with a model guess.
- Never mark a platform verified merely because its JSON validates.
- A changed source page, hidden authenticated step, or unresolved route choice must lower the audit status, not be silently filled in.

## Standard starting state

Start at account creation. Account creation is part of the measured path, not a prerequisite outside it.

Assume only:

- a supported browser;
- access to an email address or supported identity provider;
- a normal local development environment when the official quickstart requires one;
- the minimum pre-existing artifact explicitly named in the developer goal, such as an existing Git repository for a deployment journey.

Do not assume an existing platform account, tenant, API key, project, application, billing profile, administrator approval, connected repository, or accepted legal agreement. Record every required account-creation screen and every required field or agreement that current official evidence exposes. If an authenticated or dynamic form hides its fields, preserve the gap and do not call the audit verified.

## First-success boundary

Use the earliest meaningful, observable outcome demonstrated or explicitly named by an official getting-started path.

Valid examples include:

- a deployed application returns its root response;
- an authenticated API request returns the documented response;
- a created integration is authorized for local testing;
- a local example runs and shows the documented result.

Do not stop at documentation arrival, signup completion, a dashboard opening, credential visibility, resource creation, or form submission unless the official quickstart itself defines that state as the terminal developer outcome.

If official sources do not establish one boundary, return `NEEDS_HUMAN_JUDGMENT` or `BLOCKED`. Do not choose a convenient boundary.

## Route graph

Model the journey as a directed graph:

- A node is an observable developer or product state.
- An edge is one required developer interaction or one required implementation action.
- Automatic platform work, waits, prerequisites, and outcomes annotate edges or nodes. They are not developer-action edges.
- Optional actions are excluded from the selected graph.
- Alternate official routes form separate branches that converge only when their states genuinely match.

Use a shortest-path search over complete candidate routes within the self-service web onboarding surface. Do not substitute a CLI, coding agent, infrastructure-as-code template, or third-party automation for the product path unless the selected developer goal explicitly requires that surface or no self-service web route exists. Do not apply invented numeric friction weights.

Select routes in this order:

1. Exclude routes that require payment, administrator action, manual approval, or unavailable entitlement when an official route reaches the same outcome without that gate.
2. Minimize the number of required developer-action edges.
3. When action counts tie, prefer fewer unavoidable waits and fewer external-system handoffs.
4. When still tied, prefer the route the vendor labels recommended, quickstart, default, or first.
5. When still tied, retain both as equal candidates and return `NEEDS_HUMAN_JUDGMENT` instead of inventing a winner.

This is a lexicographic shortest-path rule. Do not turn it into an opaque score.

## What belongs in the required path

Include only actions the developer must perform before the selected terminal:

- create and verify the platform account;
- accept a legal agreement only when the current flow requires it before the terminal;
- request or obtain required access;
- click or select required product controls;
- complete and submit required fields on a screen;
- authorize an identity provider, repository, application, or requested scopes;
- install required software or dependencies;
- create or edit required code or configuration;
- run required commands, requests, builds, or tests;
- open or inspect the terminal result when observation requires an action.

## What must not appear as a required action

Exclude from the ordered developer path:

- opening, reading, reviewing, or understanding documentation;
- selecting the route for the purpose of the research record;
- optional fields, customization, previews, examples, or hardening;
- automatically generated names, credentials, builds, provisioning, responses, or status changes;
- passive waiting or monitoring when no developer interaction is required;
- troubleshooting that occurs only after a failure;
- repeated descriptions of prerequisites;
- production, publishing, review, analytics, scaling, custom domains, or other work after first success.

Preserve relevant excluded work in explicit `excluded` or `unavoidable_waits` fields so nothing factual is lost.

## Action granularity

Track both journey actions and required fields. Do not confuse the two units.

- Treat one form submission as one journey action. List every required field, checkbox, agreement, validation rule, and field-level uncertainty under that action.
- Count required fields separately from journey actions. Never hide fields inside `complete the form` prose.
- Keep a redirect authorization in an external system as a separate action because it crosses a trust boundary.
- Keep separate commands or code changes separate when each must be executed or saved independently.
- Combine navigation labels that form one continuous menu action, such as `New > Web Service`.
- Do not combine actions across different screens, trust boundaries, tools, or observable states merely to lower the count.
- Do not split a single form into one journey action per field merely to raise the action count.

## Evidence protocol

For each platform:

1. Open the current official documentation home, getting-started guide, account guide, and product pages needed for the route.
2. Use search results only to discover sources. Open the official source before relying on it.
3. Inspect publicly accessible product states when official documentation omits a transition. Do not authenticate, create accounts, accept terms, deploy, send requests, or cause external changes.
4. Cite every required action, prerequisite, wait, gate, exclusion, and terminal outcome.
5. Record the source access date and displayed update date when present.
6. Compare the selected route with plausible official alternatives.
7. Search for contradictory current evidence, especially changed signup, app type, billing, or permission requirements.
8. Mark authenticated or undocumented transitions as uncertainty. Never infer their fields or outcomes.

Official vendor documentation is primary evidence for the vendor's current flow. Vendor marketing pages can help locate a flow but cannot establish comparative ease or user outcomes.

## Audit output

Each audit record must contain:

- platform name and slug;
- audit status: `verified`, `blocked`, or `needs-human-judgment`;
- audit date and source-record SHA-256;
- blank-slate starting state and minimum assumed prior artifacts;
- developer goal and first-success boundary;
- official candidate routes considered;
- selected route and selection explanation;
- ordered required developer actions with kind, interface, every required field, observable result, and source IDs;
- required prerequisites and external gates;
- unavoidable waits and automatic platform outcomes;
- optional and post-success work explicitly excluded;
- current official sources;
- uncertainties and exact evidence needed to resolve them;
- separate action and required-field counts derived only from the verified required path.

Never expose an action count or comparison for a record whose audit status is not `verified`.

## Corpus execution

1. Freeze hashes for all canonical source records.
2. Audit Render and Zoom as calibration cases.
3. Run deterministic checks against the two cases and correct the contract if either path still includes documentation, optional actions, or platform events.
4. Audit the remaining roster in bounded batches with one maker and one independent checker per record when independent agents are available.
5. If independent agents are unavailable, use a cold review that reopens the original prompt, official sources, and audit record without relying on the maker's explanation.
6. Keep unaudited records visible as `pending re-audit`, but do not show their path count, peer placement, or onboarding-load comparison as verified.
7. Regenerate public and LLM-readable artifacts only from verified audit records.
8. Confirm source-record hashes remain unchanged.

## Verification gates

An audit passes only when:

- every ordered step is a required developer interaction or implementation action;
- no ordered step is documentation navigation, a platform event, passive waiting, or optional work;
- form-field granularity follows the action rule;
- the route begins from the standard starting state;
- the route reaches the cited first-success boundary;
- no official route with fewer required actions and fewer hard gates was missed;
- all claims have current official citations;
- a cold or independent checker reaches the same route from the evidence;
- schema validation, source-reference validation, generated-artifact checks, and regressions pass;
- public UI wording does not imply observed drop-off, difficulty, completion time, or conversion.

## Prompt failure simulations

The checker must reject these cases:

1. A structurally valid record still includes `Read the quickstart`, optional naming, and automatic provisioning as developer steps.
2. A shorter path is chosen only because it has fewer clicks, even though it requires payment or administrator approval and a no-gate route exists.
3. A build and schema pass, but the public wrapper still displays counts from unaudited legacy records.
4. An authenticated screen is hidden, and the researcher invents its mandatory fields.
5. A vendor's docs show two equal routes, and the researcher silently chooses the preferred one.

## Status and evidence return

Return one assignment status:

- `COMPLETE`: the scoped audits, checks, and integration are finished.
- `NEEDS HUMAN JUDGMENT`: evidence supports multiple consequential routes or boundaries.
- `BLOCKED`: required official evidence or access is unavailable.
- `NOT FEASIBLE`: the requested verified result cannot be produced safely from available evidence.
- `STAGNATED`: two different evidence strategies failed without useful new information.

Return one evidence state:

- `NO RELIABLE EVIDENCE`
- `ARTIFACT VERIFIED`
- `OUTCOME VALIDATED`
- `DECISION READY`

Passing JSON, tests, or builds alone is never enough to mark the research `COMPLETE`.
