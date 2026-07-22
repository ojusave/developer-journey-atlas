# Measurement contract (v2.0)

## What this corpus contains

Developer Journey Atlas has two layers:

1. `records/` preserves detailed official-documentation evidence collected under the original research method.
2. `audits/` reconstructs the verified shortest required developer path from account creation to first success.

A source record does not become a verified path merely because it validates. Public counts and comparisons come only from verified audit records.

This is documentation and public-interface research. It is not telemetry, conversion, activation, drop-off, usability, or observed completion time.

## Required developer action

One intentional interaction or implementation action performed by the developer before first success.

Examples:

- submit the account-creation form;
- authorize repository access in GitHub;
- choose `New > Web Service`;
- install a dependency;
- add required code;
- run a command;
- open the terminal result.

Documentation reading, research-route selection, platform automation, and optional work are excluded.

## Required field

One required input, checkbox, agreement, challenge, permission, URL, repository, command value, or other field contained in a required action.

Fields are listed under their form or interaction and counted separately. A seven-field service form is one journey action and seven required fields. This prevents both hiding field burden and inflating the journey into one step per HTML control.

## External gate

A required permission, administrator action, entitlement, payment, legal acceptance, identity-provider authorization, or other boundary outside the platform's direct control.

The developer interaction may appear in the path. The gate itself is counted separately.

## Unavoidable wait

A required asynchronous interval such as email delivery, provisioning, build, deployment, or human approval.

Passive waiting is not a developer action. A separate developer action is counted only when the developer must interact again to continue.

## Platform outcome

Automatic work performed by the platform or an external system, such as generating credentials, running a build, returning an API response, or marking a deploy Live.

Platform outcomes remain visible but are never counted as developer actions.

## First success

The earliest meaningful observable result explicitly named or demonstrated by the selected official getting-started route. Resource creation or credential visibility alone is not enough unless the official route defines it as the terminal developer result.

## Comparisons

Anonymous peer context is withheld unless:

- the subject and every peer have verified shortest-path audits;
- the source research is marked complete;
- all routes begin at account creation;
- category and normalized first-success type match;
- research granularity and comparability metadata are compatible;
- at least three qualified peers remain.

The comparison may show direct medians for required actions, required fields, unavoidable waits, and external gates. It must not combine them into a difficulty, quality, or drop-off score.

## Legacy measurements

`selected-path-heuristic.json`, `ds-quality.json`, and original source-record step counts remain in the repository for provenance and migration analysis. They are not public shortest-path measurements and must not power user-facing claims.
