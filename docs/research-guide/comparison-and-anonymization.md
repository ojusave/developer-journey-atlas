# Comparison and anonymization

Developer Journey Atlas compares documented route structures. It does not compare conversion, usability, product quality, market performance, or actual drop-off rates.

Comparisons keep real internal journey IDs, dimensions, source IDs, research dates, differences, and limitations. Anonymization is a presentation transformation. It does not change canonical evidence.

## Analysis eligibility

A comparison is analysis-eligible only when:

1. The subject and every peer share a declared developer goal or finish line.
2. They share at least one material structural dimension.
3. Every compared dimension cites source evidence.
4. The subject and every peer expose their research snapshot date.
5. Known limitations remain attached to the record.

Material dimensions include authentication model, credential model, setup surface, execution model, first operation, success verification, account gates, entitlement gates, and branch complexity.

Industry category or platform archetype alone is insufficient. A freshness date is not proof that a record is still current. This contract does not invent a universal expiry window.

## Pattern eligibility

At least three qualified peers are required before participant-facing output may describe a pattern across the available cohort.

With fewer than three qualified peers, use bounded language:

- “A comparable documented journey uses...”
- “The available comparison shows...”
- “There is not enough coverage to identify a broader pattern.”

Never say “similar platforms usually” without denominator evidence. Never convert a documented route difference into a performance ranking.

## Anonymization eligibility

`safe_to_anonymize` is a separate gate. An analysis-eligible comparison may still be unsafe to present anonymously.

Set the participant-facing summary to `null` when:

- Analysis eligibility fails.
- Anonymization safety fails.
- The available details make an unnamed peer trivially identifiable.
- A required source or limitation is missing.

Store the reason in `withheld_reasons`. Do not remove internal evidence to make the output appear anonymous.

## Machine contract

[`schemas/comparison-record.schema.json`](../../schemas/comparison-record.schema.json) is version 2.0.0. It requires research snapshots, analysis eligibility, the three-peer threshold result, pattern eligibility, anonymization safety, and withholding reasons.

[`src/domain/comparison-validation.ts`](../../src/domain/comparison-validation.ts) computes eligibility from the declared goal or finish line, structural dimensions, source coverage, research snapshots, peer count, and anonymization decision.

The imported score-based comparison implementation remains internal and is not mounted on the public API. It is not participant-facing authority.

## What the contract does not establish

Passing comparison validation does not establish:

- Market prevalence.
- Peer performance.
- Conversion or completion rates.
- User effort or difficulty.
- A causal reason for abandonment.

Representative cohort selection and current research freshness still require validation before product comparison claims are approved.
