# Workshop route selection policy

Date: 2026-07-19

When official documentation presents peer getting-started routes, or when a
cloud signup gate previously left a record `needs-human-judgment` or `blocked`,
this workshop commits to one route using the following order:

1. Prefer a local, no-account, Docker, or OSS quickstart when official docs
   offer one as a first-mile path.
2. Otherwise prefer the vendor's first-listed, recommended, or "quickest"
   cloud / dashboard quickstart (most commonly used surface).
3. When signup is required but form fields are not publicly enumerated, record
   "Sign up" as a single opaque step citing the official signup URL, then
   reconstruct every publicly documented post-login step. Do not invent form
   fields.
4. Set `research_status` to `complete` only when the committed route has a
   documented first-success terminal reconstructed from official sources.

This policy is an explicit workshop decision. It does not claim the vendor
named a single canonical path when the docs leave peers open.
