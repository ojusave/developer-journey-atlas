# Cursor prompt: audit the shortest required developer onboarding paths

## Where we are now

You are working on Developer Journey Atlas.

- Canonical GitHub repository: `https://github.com/ojusave/developer-journey-atlas`
- Local repository: `/Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/scanner-app`
- Production: `https://developer-journey-atlas.onrender.com`
- The canonical branch is `main`. Pull the latest `main` before creating a focused audit branch.
- PR #5 established the new account-creation-to-first-success audit contract and is merged.
- The repository contains 205 preserved source-evidence records in `packages/journey-corpus/records/`.
- Do not rewrite those records. Their exact SHA-256 hashes are checked by the audit validator.
- The separate authoritative audit layer is `packages/journey-corpus/audits/`.
- `packages/journey-corpus/shortest-path-audit.schema.json` defines the machine-readable audit contract.
- `packages/journey-corpus/audit-status.json` is generated, not hand-edited.
- Render is the verified calibration case: 8 required actions, 13 required fields, 1 unavoidable wait, and 1 external gate.
- Zoom is `needs-human-judgment`. Its counts are correctly withheld because the exact app goal and a reported Marketplace terms screen remain unresolved.
- The other 203 platforms are `pending` and their legacy step totals are correctly withheld from the UI, catalog, LLM artifacts, and peer comparison.
- The live wrapper, API, human catalog, and LLM-readable files already enforce those states. Do not rebuild the product or invent a new scoring system.
- An unrelated local file named `docs/prompts/migrate-atlas-research-to-render-workflows.md` may be untracked. Preserve it and do not stage, edit, delete, or include it in audit commits.

Before editing, run `git status -sb`, inspect the current branch, fetch `atlas`, and confirm that you are based on the latest `atlas/main`. Never push to the legacy `origin` remote.

## Where we want to be

Move the corpus from 1 verified, 1 unresolved, and 203 pending records toward a fully re-audited Atlas, one evidence-safe batch at a time.

For every completed platform audit:

1. The path starts at account creation.
2. The path ends at the earliest meaningful, observable developer success for one bounded developer goal.
3. The selected route is the lowest-friction complete self-service route under the lexicographic route rule below.
4. Every required developer action is present in order.
5. Every required field is listed under the action or form that contains it.
6. Required actions and required fields are counted separately.
7. Required agreements, verification, permissions, authorizations, commands, code changes, waits, gates, and observable outcomes are preserved in the correct fields.
8. Documentation reading, optional work, passive waiting, and automatic platform behavior are not counted as developer actions.
9. Every included fact is supported by current official evidence.
10. If the route, field list, or terminal cannot be established safely, the audit is `needs-human-judgment` or `blocked`, and all public counts remain null.

The desired result is accurate, attributable data that a human and an LLM can read without additional interpretation. It is not a large number of superficially completed JSON files.

## What we are looking for

For each platform, reconstruct the actual clicks and implementation work a new developer must complete, not the headings in a tutorial.

Look specifically for:

- every account-creation screen and required signup field;
- email, phone, identity-provider, age, captcha, passkey, or multifactor verification;
- legal or Marketplace agreements that are mandatory before first success;
- workspace, organization, tenant, region, plan, role, and entitlement choices;
- billing or payment gates, including whether a no-payment route reaches the same success;
- repository, application, project, resource, credential, and API-key creation;
- every mandatory field on each required form, including required values that may be prefilled or generated;
- external authorizations, requested scopes, repository permissions, administrator approvals, and trust-boundary crossings;
- required installation, CLI, SDK, dependency, environment, code, configuration, and command work;
- asynchronous waits such as email delivery, provisioning, builds, deploys, review, and approval;
- the exact action needed to observe first success and the visible success signal;
- shorter official alternatives and why each was selected, rejected, or left unresolved;
- optional fields, optional customization, documentation navigation, automatic platform outcomes, and post-success work that must be explicitly excluded;
- authenticated or dynamic screens whose required fields cannot be established from public evidence;
- contradictions between current docs, support pages, changelogs, and the current public product UI.

Do not look for or claim observed drop-off, conversion, difficulty, completion time, prevalence, or usability. This corpus describes route structure only.

## Execution steps

### 1. Establish a safe batch

- Start from latest `atlas/main` and create a focused branch such as `research/audit-cloud-batch-01`.
- Select a small coherent batch, preferably 5 to 10 platforms in one category.
- Do not attempt 203 audits in one unreviewable change.
- Record the selected slugs before research and do not edit outside that batch unless a shared validator defect must be fixed.
- Confirm that no file under `packages/journey-corpus/records/` changes.

### 2. Read the contract before researching

Read completely:

- this prompt;
- `packages/journey-corpus/SELECTION-POLICY.md`;
- `packages/journey-corpus/MEASUREMENT-CONTRACT.md`;
- `packages/journey-corpus/shortest-path-audit.schema.json`;
- `packages/journey-corpus/audits/render.json`;
- `packages/journey-corpus/audits/zoom.json`;
- `packages/journey-corpus/scripts/validate-shortest-path-audits.mjs`;
- the preserved source record for every assigned platform.

Treat Render as the verified granularity example and Zoom as the correct example of withholding unsafe counts.

### 3. Define one bounded developer goal

- Find the vendor's current official getting-started or quickstart goal.
- If the platform contains several products or app types, do not create a fake universal route.
- Select one bounded goal only when official evidence establishes it as the default or shortest comparable goal.
- Otherwise enumerate the consequential candidates and return `needs-human-judgment`.
- Write the first-success outcome and observable signal before constructing the path.

### 4. Build the route graph

- Represent product states as nodes and required developer interactions as edges.
- Include account creation as the first measured state transition.
- Build every plausible complete official route to the same success.
- Remove optional actions and automatic platform events from the developer-action graph.
- Keep waits and gates as annotations, not action edges, unless a later developer interaction is required to continue.
- Apply the lexicographic route rule below. Do not invent weighted friction values.

### 5. Reconstruct every action and field

- Follow the selected route screen by screen and tool by tool.
- One submitted form is one developer action.
- List every required field, agreement, checkbox, challenge, permission, or value beneath that form action.
- Split actions when the developer crosses screens, tools, trust boundaries, or observable states.
- Split independent commands and code changes when each must be executed or saved separately.
- Never compress missing evidence into `complete setup` or `configure the app`.
- Never split one form into one action per field.

### 6. Gather current official evidence

- Use official documentation, official support, official changelogs, official repositories, and observed public UI only.
- Search results are discovery aids, not evidence.
- Open every cited source and record the access date.
- Inspect public unauthenticated UI when it resolves a documented gap.
- Do not create accounts, accept terms, deploy resources, send production requests, or cause external changes merely to complete an audit.
- If an authenticated transition hides required screens or fields, preserve the gap and lower the status.

### 7. Write the sidecar audit

- Create or update only `packages/journey-corpus/audits/<slug>.json` for assigned platforms.
- Copy the exact SHA-256 of `packages/journey-corpus/records/<slug>.json` into `source_record_sha256`.
- Use `counts: null` for every status except `verified`.
- A verified audit cannot contain an unverified action, unverified field, unresolved consequential choice, or hidden transition.
- Keep candidate routes, exclusions, waits, gates, platform outcomes, uncertainties, and evidence needed explicit.
- Do not hand-edit `audit-status.json`.

### 8. Perform a separate evidence review

- The maker may not approve its own audit without a cold second pass.
- Reopen every load-bearing source without relying on the draft narrative.
- Confirm each action is required, every mandatory field is present, and no shorter no-payment or no-approval route was missed.
- Confirm optional work, documentation reading, platform automation, and passive waits are excluded from the action count.
- Downgrade the audit if the checker cannot reproduce the same route and terminal from the evidence.

### 9. Regenerate and verify

Run:

```sh
npm --prefix packages/journey-corpus run audit:paths
npm --prefix packages/journey-corpus run audit:paths:check
npm --prefix packages/journey-corpus run check
npm --prefix packages/journey-corpus test
npm --prefix packages/journey-corpus run test:app
npm --prefix packages/journey-corpus run site
node packages/journey-corpus/scripts/check-llm-site.mjs
npm run test:all
npm run typecheck
npm run build
render blueprints validate render.yaml
git diff --check
```

Then verify:

- source-record hashes remain unchanged;
- verified action counts equal the path length;
- verified field counts equal the total nested required fields;
- nonverified audits have null counts;
- pending records expose no legacy path or comparison totals;
- the catalog and LLM files show `withheld` for nonverified records;
- mobile and desktop UI do not overflow and retain progressive disclosure;
- no score, rank, drop-off, conversion, or causal claim has been introduced.

### 10. Publish one reviewable batch

- Stage only the assigned audits and directly related generated or validation files.
- Never stage unrelated local work.
- Commit with a scoped message such as `Audit shortest paths for cloud batch 01`.
- Push only to the `atlas` remote.
- Open a pull request against `ojusave/developer-journey-atlas:main`.
- In the PR, list every platform and its final status, exact unresolved evidence, validation results, and confirmation that source records were unchanged.
- Do not merge until all required checks pass.
- After merge, wait for the Render auto-deploy and verify the production health endpoint, audited platform APIs, audit-status file, human catalog, and `llms.txt`.

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
