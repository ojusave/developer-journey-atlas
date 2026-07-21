# Comparison and anonymization

Comparisons are stored with real internal journey IDs, dimensions, source IDs, differences, and limitations. This preserves auditability.

Participant-facing output may omit platform names. Anonymization is a presentation transformation, not a change to canonical evidence.

## Eligibility

A comparison is eligible only when the journeys share a declared developer goal or finish line and at least one material structural dimension. Industry category alone is insufficient.

Useful dimensions include authentication model, credential model, setup surface, execution model, first operation, success verification, account gates, and branch complexity.

## Language constraints

Never say “similar platforms usually” without denominator evidence.

With fewer than three qualified peers, use bounded language:

- “A comparable documented journey uses...”
- “The available comparison shows...”
- “There is not enough coverage to identify a broader pattern.”

Do not include details that make an unnamed platform trivially identifiable unless necessary and approved.

The machine-readable contract is `schemas/comparison-record.schema.json`. The imported score-based comparison implementation remains internal and is not a participant-facing authority.
