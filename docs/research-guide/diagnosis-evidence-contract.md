# Diagnosis evidence contract

Developer Journey Atlas may describe a documented path and narrow possible explanations. It may return an individual blocker only as a supported hypothesis when two independent evidence gates pass.

A supported hypothesis is not a confirmed cause. It applies only to the specific attempt and evidence named in the output.

Today, zero real blocker reasons pass the catalog-level gate. The Atlas can narrow families and propose evidence-producing checks. It cannot name an individual reason as supported from the current corpus alone.

## What each dataset can establish

The journey corpus establishes what official documentation says about one selected route at one research snapshot. It can establish prerequisites, actions, choices, waits, gates, and documented success signals.

The blocker taxonomy inventories possible explanations. Catalog membership does not establish occurrence, frequency, severity, or causation.

A specific-attempt case contains reports or observations about one bounded attempt. It does not automatically establish a broader pattern.

These evidence sources stay separate. Repetition does not upgrade one source class into another.

## Gate 1: catalog-level eligibility

An individual blocker is structurally eligible only when the catalog marks it `diagnosis_eligible` and its maturity is `reviewed` or `locally_validated`.

It must also have a reviewed diagnostic card that records:

1. The observable implication that would be expected if the hypothesis fit.
2. Preconditions that must be tested.
3. Evidence kinds accepted for the individual-reason claim.
4. The nearest plausible lookalikes and how they must be checked.
5. Review date, provenance source IDs, and known limitations.

The machine-readable card contract is [`schemas/reason-diagnostic-card.schema.json`](../../schemas/reason-diagnostic-card.schema.json).

A taxonomy entry, stable ID, category, description, or retrieval match cannot pass this gate by itself.

## Gate 2: attempt-level support

An eligible blocker becomes a supported hypothesis for one attempt only when:

1. The claim cites active evidence events of a kind accepted by its card.
2. At least one cited event is support-capable under the policy below.
3. Every required precondition has accepted evidence.
4. Every required lookalike has active evidence that can distinguish it.
5. No correction, retraction, contradiction, or missing reference invalidates the claim.

Both gates must pass. Strong attempt evidence cannot repair an unreviewed catalog reason. A reviewed card cannot replace evidence from the attempt.

## Evidence-kind policy

This table is a conservative project policy. It is not an empirical ranking or a universal research standard.

| Evidence kind | Can independently support an individual reason | Can test a prerequisite | Can address a lookalike | Visible attribution required |
|---|---:|---:|---:|---:|
| Participant report | No | Yes | Yes | Yes |
| Direct observation | Yes | Yes | Yes | No |
| Product or platform data | Yes | Yes | Yes | No |
| Support case | Yes | Yes | Yes | Yes |
| Developer interview | Yes | Yes | Yes | Yes |
| Team anecdote | No | No | No | Yes |
| Assumption | No | No | No | Yes |
| No evidence | No | No | No | No |

“Support-capable” does not mean automatically sufficient. The evidence must fit the exact claim, satisfy the diagnostic card, and remain active.

A support case or developer interview supports only the bounded hypothesis represented by that evidence. The output must preserve attribution. It cannot imply prevalence or independent observation.

Multiple anecdotes, assumptions, or participant reports do not become direct observation merely through quantity.

## Allowed claim states

### Documented path

The statement is supported by cited official documentation. It describes the route, not why a person stopped.

### Participant reported

The output states what a participant reported. The attribution remains visible.

### Plausible hypothesis

The known stage and context make a blocker worth checking. It remains one of several possible explanations.

### Supported hypothesis

Both evidence gates pass for one specific attempt. The output cites the supporting evidence events, evidence kinds, research sources, and limitations.

### Insufficient evidence

The evidence cannot distinguish the remaining explanations. The output names what remains unknown and gives one bounded next check.

The contract has no “confirmed cause” state.

## Corrections and contradictions

Evidence events are append-only. A correction deactivates the earlier event for downstream claims.

A claim that cites corrected, missing, or inactive evidence fails validation. A contradiction keeps the reason from supported output until it is resolved with new active evidence.

Changing an upstream answer must invalidate conclusions that depended on the earlier answer.

## Human output order

Use this order:

1. What the documented path establishes.
2. What the specific attempt establishes.
3. Up to three candidate or supported hypotheses, with their status visible.
4. What remains unknown.
5. One next check that could change what is known.

Never hide an evidence downgrade behind confident prose.

## Machine output requirements

[`schemas/diagnosis-output.schema.json`](../../schemas/diagnosis-output.schema.json) is version 2.0.0 because supported items now require evidence event IDs, evidence kinds, and limitations. Comparison eligibility and withholding fields are also required.

The runtime validator in [`src/domain/evidence-validation.ts`](../../src/domain/evidence-validation.ts) enforces catalog maturity, diagnostic-card review, provenance, active evidence, accepted evidence kinds, prerequisites, and lookalikes.

Schema validation proves structure. Runtime validation proves that the supplied references satisfy this project policy. Neither proves that the hypothesis is causally true or useful to a real user.

## Synthetic example: insufficient evidence

A participant says, “I stopped before creating a credential.” The journey record documents that credential creation is required. The taxonomy contains several credential-related blockers.

Safe result:

- Known: the participant reported stopping before credential creation.
- Possible: credential setup may be unresolved.
- Unknown: whether the credential screen was reached or what prevented progress.
- Next check: observe whether the participant reaches credential creation without assistance.

This remains `insufficient-evidence`. Documentation plus a report does not identify one cause.

## Synthetic example: both gates pass

A synthetic catalog reason has a reviewed card. The card names an observable implication, a required prerequisite, an accepted evidence kind, and a lookalike check. A synthetic attempt contains active direct observation for the claim, product data for the prerequisite, and active evidence that addresses the lookalike.

The mechanism may return `supported-hypothesis` for that synthetic attempt. It must still state that the result does not establish prevalence or causation elsewhere.

The repository's synthetic schema and unit-test fixtures exercise this path. They do not promote a real blocker.

## Prohibited upgrades

Do not convert:

- A documentation step into an observed drop-off.
- A blocker taxonomy item into a diagnosis.
- A participant report into direct observation.
- Several weak signals into strong evidence.
- One supported attempt into a common pattern.
- A passing schema into factual or causal validation.

Anonymous comparisons have a separate eligibility and withholding contract in [`comparison-and-anonymization.md`](comparison-and-anonymization.md).
