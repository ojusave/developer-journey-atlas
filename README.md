# Platform first-mile knowledge base

This is the standalone source-grounded platform dataset for the DevRelCon
first-mile workshop research. It contains data and validation artifacts only;
the workshop application, session contract, stage outline, and broader blocker
research live elsewhere.

## Research question

For each named platform, what is the complete path documented by the platform
from a developer arriving with intent to the first-success boundary that the
official documentation itself explicitly names or demonstrates?

"Complete" applies only inside that bounded first path. It does not mean
researching the full product, advanced configuration, production hardening,
scaling, or later tutorials.

## Evidence rules

1. Inspect current official documentation directly. Search and memory may locate
   a page but cannot support a recorded fact.
2. Follow every official link needed to reconstruct the path. Do not summarize
   only the landing page or quickstart index.
3. Record every required prerequisite, account or access gate, atomic action,
   system response, wait, branch, and verification step on the primary path.
   When the docs present peer starting routes, preserve the shared spine in
   `primary_path` and record at least one complete, ordered, atomic official
   route in `candidate_paths`. A branch summary does not count as the journey.
   If public official docs genuinely cannot expose an executable candidate,
   record the exact source-backed reason in `candidate_path_gap` instead.
4. Cite source IDs on every prerequisite, path step, gate, time claim, and
   completion claim.
5. Record the vendor's explicit time claim when one exists. Otherwise write
   `not documented`; never estimate.
6. Do not choose the success boundary. A complete record requires an official
   milestone that is either explicitly named or demonstrated as the terminal
   success state of the official getting-started path. `normalized_outcome` is
   only a faithful paraphrase of that documented result.
7. When official documentation is missing, contradictory, login-gated, or does
   not select one canonical surface, record the uncertainty or return
   `blocked`/`needs-human-judgment`. Do not fill the gap from memory.
8. Paraphrase. Preserve exact commands, UI labels, field names, response values,
   and very short excerpts only when necessary to make the path reproducible.
9. Stop at the documented first-success boundary and list excluded next steps.
10. Do not create accounts, accept terms, enter payment details, deploy, send
    messages, or otherwise exercise a production system.

## Selection rule for broad platforms

Start at the vendor's official developer or product documentation home. Choose
the path the vendor itself presents as the general or recommended getting-started
route. Record why it is primary and list plausible alternatives. If the vendor
offers several equally primary surfaces or terminal success states and the
documentation does not select a default, return `needs-human-judgment` rather
than choosing silently.

## Contents

- `roster.json`: the current 159-platform research roster, including the first 54 independently audited records from the 100-platform scale run.
- `record.schema.json`: machine-checkable record contract.
- `record.template.json`: copyable starting shape for each independent agent.
- `candidate-path-audit.json`: records flagged because their shared spine stops before an executable candidate route.
- `cold-audit-open.json`: unresolved independent source-to-step findings that keep a record invalid until correction and recheck.
- `cold-audit-summary.md`: resolved cross-batch source-to-step audit receipt for the high-risk and reworked records.
- `records/`: one canonical JSON record per platform.
- `catalog.md`: generated human-readable index after integration.
- `coverage.json`: generated validation and completion report.

## Completion standard

A platform record is complete only when its full bounded path is reconstructed
from inspected official sources and every evidence-bearing field is attributable.
Passing the schema is necessary but not sufficient; the parent also reviews
source coverage and representative paths cold.
