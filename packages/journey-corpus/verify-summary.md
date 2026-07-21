# Verification summary

Generated at: 2026-07-21T06:44:47.844Z
Scope: subset: render, stripe, vercel, supabase, twilio, netlify, github, openai, box (9 record(s))

Each step is checked against the official docs it cites: the cited URL must be on the platform's own documentation domain, must be reachable, and must contain a literal excerpt supporting the step's action and success signal. Verdicts rest on quoted document text, not on model agreement. Docs change; this reflects the pages fetched on the dates in each `verify/<slug>.json`.

## Record verdicts

- verified: 1
- needs_human: 8

## Step verdicts

- supported: 79
- unsupported: 34
- source_unreachable: 0
- non_official_domain: 0
- no_sources: 0

## Records a human must review

| Platform | Slug | Headline | Required steps | Supported | Failing steps |
| --- | --- | :---: | ---: | ---: | --- |
| Render | render | yes | 24 | 20 | 2, 8, 12, 13 |
| Vercel | vercel | yes | 9 | 6 | 1, 5, 7 |
| Supabase | supabase | yes | 12 | 7 | 1, 2, 3, 5, 11 |
| OpenAI | openai | yes | 5 | 3 | 1, 5 |
| Twilio | twilio | yes | 20 | 13 | 3, 5, 7, 11, 14, 17, 18 |
| Stripe | stripe | yes | 11 | 4 | 1, 2, 3, 5, 7, 9, 11 |
| GitHub | github | yes | 10 | 7 | 4, 5, 7 |
| Netlify | netlify | yes | 15 | 13 | 5, 13 |

Headline platforms are listed here by policy even when their steps are supported: they are capped at needs_human until a human signs off.

## Method and limits

- The verifier reads only the fetched HTML text. Docs rendered entirely client-side may yield fewer supported steps. That is reported, not guessed.
- A field is supported when at least max(2, ceil(0.5 x key-term count)) of its key terms co-occur in one window of the fetched page.
- "supported" means the step's key terms literally appear together in the cited doc, with the excerpt and matched terms recorded. That is evidence for a human to check, not proof of semantic agreement. This is why headline claims are still capped for human sign-off.
- Fetches are cached by URL under `verify/.cache/` so reruns are deterministic. Use `--refresh` to refetch.

