# Independent organization research instructions

Each record covers exactly one roster entry. Work only within the roster entries
assigned to your batch, and never edit another batch's records.

## Required sequence

1. Read the organization-specific handoff, this knowledge base's `README.md`,
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
11. Write only the assigned `records/<slug>.json` with `apply_patch`.
12. Run `node validate-records.mjs --slug <slug>` and correct deterministic
    failures before returning.

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

## Return

Return exactly one status: `PASS`, `REWORK_REQUIRED`, `BLOCKED`, or
`NEEDS_HUMAN_JUDGMENT`. Include the record path, official URLs inspected,
validator command/result, remaining uncertainty, one evidence state, and the
recommended parent action.
