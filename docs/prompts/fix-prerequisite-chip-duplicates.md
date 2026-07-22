# Cursor prompt: fix prerequisite chip duplicates in the Atlas UI

## What you are looking at

In the journey detail panel, **PREREQUISITES** renders as type chips (pills), not full requirement text.

Source fields (record schema enum):

- `account`, `access`, `plan`, `billing`, `hardware`, `software`, `identity`, `permission`, `region`, `knowledge`, `approval`, `configuration`, `credential`, `domain`, `environment`, `legal`, `network`, `verification`, `other`

UI code today (`packages/journey-corpus/web/app.js` and first-mile `web/app.js`):

```js
prerequisites.map((p) =>
  `<span class="chip ${p.required ? "req" : ""}">${esc(p.type)}${p.required ? " (required)" : ""}</span>`
)
```

So each chip is only: **`{type}`** or **`{type} (required)`**.

## Why duplicates appear

Records often have **multiple prerequisites that share the same `type`** but different `requirement` strings. Example: **Plaid** (`records/plaid.json`):

| type | required | requirement (short) |
|---|---|---|
| account | true | Plaid developer account |
| credential | true | client_id / secret |
| software | true | Node (or similar runtime) |
| software | false | Optional tooling / OS note |
| knowledge | true | Domain knowledge |
| billing | false | Paid plan note |

The UI collapses those to:

`account (required)` · `credential (required)` · `software (required)` · `software` · `knowledge (required)` · `billing`

That looks like a duplicate **software** tag. It is not a data bug in the sense of identical rows: it is a **presentation bug** (label loses the distinguishing requirement text). Across the corpus, ~59 platforms have repeated prerequisite types.

## Second bug to check (Developer Journey Atlas only)

In `packages/journey-corpus/src/core/assessment.ts`, when an audit exists:

```ts
prerequisites: audit
  ? audit.prerequisites.map((p) => ({ type: "required", requirement: p.description, required: true }))
  : [],
```

That hardcodes `type: "required"`, so verified platforms can show chips like `required (required)` and **drop** record-typed chips entirely. NHJ / first-mile paths that map from `record.prerequisites` keep the enum types.

Fix both: presentation for same-type multiples, and assessment mapping for audits.

---

## Where we are now

- Canonical Atlas: `https://github.com/ojusave/developer-journey-atlas`
- Local checkout: `/Users/ojusave/Desktop/Samples/work/workshops/devrelcon-first-mile/scanner-app`
- Production Atlas: `https://developer-journey-atlas.onrender.com`
- Legacy first-mile UI (Assess): `https://github.com/ojusave/devrelcon-first-mile-data` → `https://first-mile-atlas.onrender.com`
- Prefer fixing **developer-journey-atlas** first; mirror the UI rule on first-mile if that site still serves Assess.

Push only to the `atlas` remote for the canonical repo. Do not rewrite `packages/journey-corpus/records/*` hashes unless a true duplicate-row data cleanup is approved separately.

---

## Goal

Make prerequisites readable and non-confusing:

1. No two chips that look identical while meaning different requirements.
2. Prefer showing **what** is required over a bare type enum when types collide.
3. Keep required vs optional visible.
4. Do not invent a difficulty score from prerequisites.

---

## Recommended fix (pick this unless you have a better one)

**UI-first (preferred):** stop rendering bare type-only chips when there is more than one prerequisite, or always show a short requirement label.

Concrete rule:

- If `prerequisites.length === 0`: keep empty copy.
- Else render a **list** (not a flat chip row of types only), each item:
  - lead-in: type label (optional small chip)
  - body: `requirement` text (truncated sensibly)
  - mark required vs optional clearly (badge or suffix)
- Deduplicate only when `type + required + normalized(requirement)` are identical.
- Do **not** silently drop a second `software` row that has different requirement text.

Optional compact mode if you keep chips:

- Collapse by `type`: one chip per type, labeled `software ×2` or `software (required + optional)`, with the full list in a `<details>` or tooltip. Prefer the list approach over cryptic ×N chips.

**Assessment mapping (Atlas):**

- When an audit exists, do **not** set `type: "required"`.
- Prefer record prerequisites (typed) when present; otherwise map audit prerequisites to `type: "other"` (or a dedicated `"audit"` label) with `requirement: description`, `required: true`.
- Never produce chips whose visible text is `required (required)`.

---

## Identify pass (do this before editing)

1. Script the corpus: list every slug where `prerequisites` has duplicate `type` values. Report count and top examples (include Plaid).
2. Curl production (or local) `GET /api/platforms/plaid` and show the `prerequisites` payload vs rendered chip labels.
3. Confirm whether Atlas assessment currently returns `type: "required"` for verified audits (Render).
4. Grep UI for `chip` / `prerequisites` in Atlas `web/app.js` and first-mile `web/app.js`.

---

## Implement

1. Branch from latest `main` on the canonical Atlas repo.
2. Fix `buildAssessment` prerequisite mapping if broken.
3. Fix UI rendering so same-type prerequisites are distinguishable.
4. Add a small unit or regression test: assessment / render helper given two `software` rows with different requirements does not emit two identical labels.
5. Mirror the UI fix on first-mile if that repo is still deployed.
6. Do **not** mass-edit record JSON just to force unique types unless product explicitly wants one-per-type (that would lose real distinct requirements).

---

## Out of scope

- Changing the prerequisite type enum
- Turning prerequisites into a score or ranking
- Rewriting official-docs evidence text
- GitHub Auto-PR / research pipeline work

---

## Done when

- [ ] Plaid (and similar) no longer show two indistinguishable `software` chips
- [ ] Required vs optional remains obvious
- [ ] Distinct requirements remain visible (list or equivalent)
- [ ] Verified Atlas assessments do not render `required (required)` chips
- [ ] Tests cover the duplicate-type case
- [ ] PR opened; production deploy verified on Plaid (or equivalent)

---

## Honesty constraints

- Prerequisites are **documented starting conditions**, not measured drop-off causes.
- Duplicate-looking chips are a UI labeling problem until proven identical data rows.
- Prefer clarity over fewer chips.
