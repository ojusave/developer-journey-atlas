# Shortest required path selection policy

Date: 2026-07-21

## Boundary

Every audited journey begins at account creation and ends at the earliest meaningful first-success outcome established by current official evidence.

The account, tenant, credentials, product resources, connected repositories, legal acceptance, and permissions do not exist at the start unless the developer goal explicitly names a prior artifact, such as an existing Git repository to deploy.

## Selected surface

Use the platform's self-service web onboarding surface when one exists. Do not replace the product flow with a CLI, coding agent, infrastructure template, or third-party automation unless the selected developer goal explicitly requires that surface or no self-service path exists.

## Shortest-path rule

Reconstruct complete official candidate routes to the same outcome, then select lexicographically:

1. Prefer a route without payment, administrator work, manual approval, or unavailable entitlement.
2. Minimize required developer actions.
3. When tied, prefer fewer unavoidable waits and fewer external-system handoffs.
4. When still tied, prefer the vendor's documented recommended, quickstart, default, or first route.
5. If a consequential tie remains, do not invent a winner. Mark the audit `needs-human-judgment`.

No opaque weighted friction score is used.

## Units

- A required action is one developer interaction or implementation action that changes state.
- A required field is tracked under the form action that contains it and counted separately.
- Documentation reading, optional work, platform automation, and passive waiting are not developer actions.
- Required agreements, verifications, permissions, and external authorizations are included.
- Platform automation and waits remain visible in their own fields.

## Publication gate

The preserved source records in `records/` are evidence archives. A record is not a verified shortest path until a matching audit in `audits/` passes `shortest-path-audit.schema.json`, source-hash checks, evidence-reference checks, and cold or independent review.

Only audits marked `verified` may expose action counts or peer comparison. All others must show their exact status and evidence gap.
