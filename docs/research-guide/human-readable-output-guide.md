# Human-readable output guide

Human output should help a reader act without overstating evidence.

Use this order:

1. What the documented path says.
2. Where the path becomes unclear or demanding.
3. What may be happening, limited to three candidate hypotheses.
4. What remains unknown.
5. One next check.

Use “supported hypothesis” only when both gates in the [diagnosis evidence contract](diagnosis-evidence-contract.md) pass. Keep the attempt scope, evidence attribution, and limitations visible.

Use one idea per sentence, concrete verbs, short paragraphs, and descriptive headings. Define technical terms. Do not blame the developer or platform.

Preferred language:

- “The documented path becomes unclear here.”
- “This is a possible blocker, not a confirmed cause.”
- “The available evidence cannot distinguish these explanations.”
- “The next useful check is whether the developer reached this step.”
- “This hypothesis is supported for this attempt, but it is not a confirmed cause or broader pattern.”

Prohibited without appropriate evidence:

- “This is why the developer dropped off.”
- “This is the most common reason.”
- “Similar platforms usually do this.”
- “The platform has a conversion problem.”
- “This is the confirmed cause.”

The generated `packages/generated-views/atlas.md` presents the full corpus. A future UI may progressively disclose sources and alternatives, but it must preserve the same evidence boundaries.

## Progressive presentation

The wrapper should render the assembled diagnosis in this order:

1. Bottom line.
2. What the evidence establishes.
3. Up to three possible explanations or research areas.
4. What remains unknown.
5. One next check.

Sources, methodology, comparison limitations, and alternative hypotheses may begin collapsed, but they must remain available without changing the wording or evidence state of the primary claims.

The wrapper may simplify sentence structure. It must not merge separate evidence classes, replace an unknown with a guess, promote a candidate to a supported hypothesis, or rewrite an attributed report as direct observation.
