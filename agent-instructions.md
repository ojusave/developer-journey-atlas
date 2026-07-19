# Three-stage first-mile research instructions

Each record covers exactly one roster entry. Work only within the roster entries
assigned to your batch, and never edit another batch's records.

## Role separation

- **Evidence researcher:** inspect current official sources, write one evidence
  packet, validate its source references, hand it to the builder, then continue
  to the next roster entry. Do not write or approve the schema record. A packet
  becomes immutable when handed off. If later evidence requires correction,
  stop and send the parent a revision request; do not overwrite the live packet
  until the parent pauses downstream ownership.
- **Record builder:** convert only the received packet into the canonical schema,
  preserve every documented gap, run deterministic validation, hand the staged
  record to the checker, then continue to the next packet. Do not add facts from
  memory or independently redefine the route. After checker handoff, never
  delete, replace, or rebuild that staged record unless the parent records a
  rework request and the checker explicitly releases file ownership.
- **Authenticity checker:** reopen every load-bearing official source without
  relying on the maker's narrative, compare every evidence-bearing field, make
  only accuracy-required corrections, log each correction, and rerun validation.
  Preserve accurate sentences instead of stylistically rewriting them. The
  checker owns the staged record from receipt through its audit return; upstream
  revisions are routed through the parent rather than applied concurrently.
- **Parent:** freezes and deduplicates the roster, routes handoffs, accepts only
  checker-passed records, closes every role handoff, integrates records, verifies
  unchanged prior-record hashes, and publishes the scoped private change. The
  parent serializes any post-handoff revision: pause the checker, release file
  ownership, rebuild and validate once, then return the new artifact to checking.

## Required sequence

1. Read the role-specific handoff, this file, the knowledge base `README.md`,
   `record.schema.json`, `record.template.json`, and the assigned roster entry.
2. Start from the current official developer or product documentation home.
3. Identify the vendor-presented general or recommended getting-started surface.
   If several surfaces are equally primary, do not choose from memory or taste.
   Return `needs-human-judgment` and document the alternatives.
4. Open every official page needed to follow the path. A search result, landing
   page, or quickstart index is discovery evidence only.
5. Reconstruct every required atomic step from post-discovery arrival through
   the first-success boundary that the official documentation explicitly names
   or demonstrates as the terminal success state of its getting-started path.
   The researcher may not select or infer that boundary. Include account, tenant,
   entitlement, billing, administrator, software, credential, configuration,
   permission, wait, execution, and verification requirements when documented.
6. Before writing, perform a semantic completeness pass against the primary
   official path. Account for every heading, numbered action, prerequisite,
   conditional branch, wait state, failure or retry instruction, and terminal
   verification in exactly one of: `prerequisites`, `primary_path`, `branches`,
   `friction_gates`, `uncertainties`, or `excluded_after_success`. Do not treat
   schema validity as proof that this comparison was performed.
   If the official docs require a human choice among peer routes, keep the
   common spine in `primary_path` and put at least one fully reconstructed,
   atomic, end-to-end official route in `candidate_paths`. A prose `branches`
   summary is not a substitute for the ordered path. If no candidate can be
   reconstructed from public official docs, leave `candidate_paths` empty and
   state the exact evidence gap in both `candidate_path_gap` and
   `uncertainties`. Use `candidate_path_gap: null` when the primary path or a
   candidate path is fully reconstructed.
7. Preserve the official order. Do not move a prerequisite into the live path,
   or insert a later lifecycle action such as an automatic redeploy into the
   initial journey, unless the official guide places it there.
8. Record only vendor-stated time. Otherwise use `not documented`.
9. Put every official source in `sources` and attach source IDs to every
   evidence-bearing field. Record missing or contradictory transitions as
   uncertainties.
10. Stop at first success and list later material explicitly excluded.
11. Write only the role's assigned staging artifact with `apply_patch`. Never
    edit the canonical record directory before checker approval and parent
    integration.
12. Run the assigned packet or record validator and correct deterministic
    failures before handoff. Validation proves structure and source-reference
    consistency only, not factual completeness.

## Evidence-fit and false-success gates

Apply these gates to every packet, record, and audit. They come from defects an
independent checker found in the three-company pilot.

1. A cited page must support the exact sentence, not merely an adjacent concept.
   For example, a trial-limit page cannot support request-driven autostart unless
   it actually states that behavior.
2. Separate peer choices, required conditionals, optional customization, and
   automatic platform work. Never turn one branch into an unconditional step.
3. Record only an observable output or success signal shown by the source. Form
   submission does not imply dashboard access, account provisioning, approval,
   or credentials unless the documentation says so.
4. Recheck current authentication alternatives and their order, including OAuth,
   email, password, passkey, SSO, verification, and administrator branches. If an
   alternative's intermediate sequence is not documented, preserve the gap.
5. A successful list or query call does not imply a non-empty response,
   entitlement, role, partition, or usable resource. Describe returned fields
   conditionally unless the docs guarantee at least one record. Distinguish
   request or transport success from data success: an empty successful response
   may satisfy a documented request-level terminal, but it cannot support a
   claim that the developer retrieved, obtained, or can use a resource.
6. Credential-safety, pricing, billing, wait, and recovery claims require their
   own direct support. Do not extend a warning about one secret or token to a
   different credential.
7. Copy current official source titles and displayed update dates exactly when
   shown. Do not infer a date when none is displayed.
8. Test login-gated links only far enough to observe the public redirect or gate.
   Do not invent authenticated form fields, screens, approvals, or post-submit
   states. When that gate hides a required continuation, record the gate as the
   last observable step, set the record to `blocked`, use
   `boundary_evidence.type: not-established-by-docs`, and state the hidden
   transition in `candidate_path_gap` and `uncertainties`. Never treat the
   redirect, login page, or form submission as the first-success terminal.
9. Before declaring a terminal, ask whether the same evidence would still be
   accurate for an empty result, conditional deployment, alternate signup route,
   or broad product suite. If not, narrow the claim or return an explicit gap.
10. Set `research_status: complete` only when the official documentation selects
    one bounded route and every material pre-success account, region, plan,
    payment, security, credential, resource, and terminal choice on that route is
    resolved or fully documented as a branch. If any unresolved choice changes a
    required action, cost gate, security posture, or completion signal, use
    `needs-human-judgment` or `blocked` even when one candidate is executable.
11. Record only failure and recovery behavior that an official source states for
    the relevant step. A plausible capacity error, validation failure, payment
    rejection, provisioning delay, or diagnostic is not evidence. When no failure
    behavior is documented, say so or preserve an uncertainty rather than
    inventing a likely failure mode.

## Prohibited shortcuts

- No model memory as evidence.
- No researcher-selected definition of first success. If the official docs do
  not name or demonstrate one boundary, return `needs-human-judgment` or
  `blocked` and use `boundary_evidence.type: not-established-by-docs` with
  the official pages checked.
- No secondary tutorials, affiliate posts, community answers, or search snippets
  as record sources.
- No account creation, terms acceptance, billing action, deployment, message,
  transaction, or production execution.
- No estimated completion time, invented friction score, or assumed drop-off.
- No researching the whole platform after the first meaningful success.
- No claim that schema validity proves source completeness.
- No compressed branch paragraph in place of a reconstructable candidate path.
- No handoff claimed complete until the downstream artifact exists, the named
  recipient has returned evidence, and the parent has recorded closure.

## Return

Return exactly one status: `PASS`, `REWORK_REQUIRED`, `BLOCKED`, or
`NEEDS_HUMAN_JUDGMENT`. Include the record path, official URLs inspected,
validator command/result, remaining uncertainty, one evidence state, and the
recommended parent action. `PASS` is local to the assigned role and never marks
the whole research program complete.
