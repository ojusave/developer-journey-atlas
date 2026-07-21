# Human-readable output guide

Human output should help a reader act without overstating evidence.

Use this order:

1. What the documented path says.
2. Where the path becomes unclear or demanding.
3. What may be happening, limited to three candidate hypotheses.
4. What remains unknown.
5. One next check.

Use one idea per sentence, concrete verbs, short paragraphs, and descriptive headings. Define technical terms. Do not blame the developer or platform.

Preferred language:

- “The documented path becomes unclear here.”
- “This is a possible blocker, not a confirmed cause.”
- “The available evidence cannot distinguish these explanations.”
- “The next useful check is whether the developer reached this step.”

Prohibited without appropriate evidence:

- “This is why the developer dropped off.”
- “This is the most common reason.”
- “Similar platforms usually do this.”
- “The platform has a conversion problem.”

The generated `packages/generated-views/atlas.md` presents the full corpus. A future UI may progressively disclose sources and alternatives, but it must preserve the same evidence boundaries.
