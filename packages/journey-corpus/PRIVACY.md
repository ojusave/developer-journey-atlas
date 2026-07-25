# Privacy and research data flow

Developer Journey Atlas separates search suggestions from explicit research.

## Search suggestions

Typing in search sends the query to the Atlas server so it can match public, publication-eligible platform names. Search terms are not written to Atlas analytics or research claims.

## Explicit research

Research starts only after the user chooses **Start research** following the provider disclosure. The platform name is sent to the Atlas server, which can start a Render Workflow. That workflow can use You.com for constrained discovery and direct page retrieval, then OpenRouter for a machine reconstruction.

Research results remain private until maintainer review passes platform identity, first-party source authority, retrieved-content, claim-grounding, selected-route, and public-evidence gates. Machine-selected blocker reasons remain internal.

## Stored fields and retention

The research-claim store contains the normalized platform slug, platform name, workflow run ID, status, and timestamps. It does not store client IP addresses, credentials, cookies, private page content, full provider payloads, or model reasoning.

Completed and failed claims are deleted after seven days. Stale claiming or pending rows are deleted after 24 hours. The cleanup runs before new database-backed research and is also available through `npm run db:cleanup-research`.

## Deletion and access

The maintainer can delete expired claim rows with the cleanup command. Production migrations are applied only by an authorized maintainer. Verification workflow starts and status reads require a server-side administrative secret that is never sent to browser JavaScript.
