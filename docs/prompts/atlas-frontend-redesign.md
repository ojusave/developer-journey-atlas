# Prompt: Research and redesign Developer Journey Atlas frontend

Use this prompt to research UI practice, then redesign `packages/journey-corpus/web/` for https://developer-journey-atlas.onrender.com/.

## Context

The Atlas is a **search-first research tool**: pick a developer platform, see its documented account-creation → first-success route, with honest audit status. It is not a ranking product and must not invent drop-off scores.

Current UX inventory: `docs/ux/current-frontend-experience.md`.

Problem: the live UI over-explains. Disclaimers, kickers, and investigation prose compete with the search and the route. Visual language is generic (cream paper, terracotta, Inter). Missing Sign up on Render with Ojus UTMs.

## Research brief (do this first)

1. **Progressive disclosure** (NN/g): show the few things users need first; defer secondary detail behind clear scent (“Open path”, “Sources”). Prefer one primary → secondary hop, not walls of always-on copy.
2. **Search-first tools** (docs explorers, API catalogs): put query + results at the center; keep chrome quiet; use strong information scent on result labels.
3. **Honesty without lectures**: one short caveat near the data that needs it (audit status, withheld counts). Do not repeat the same disclaimer three times on the first viewport.
4. **Reference looks** (study structure, do not clone branding): Stripe docs search density, MDN’s search → article clarity, Linear’s quiet chrome, Notion’s single-job sections. Note what they hide until asked.
5. **Anti-patterns to avoid** (workspace rules): Inter/Roboto/Arial defaults; cream `#F4F1EA`-ish + terracotta; purple gradient SaaS; broadsheet hairlines; pill clusters; card-heavy heroes; stats strips in the first viewport.

Deliverable of research: 5–8 concrete rules for this product (e.g. “Hero = brand + one line + search + CTAs only”).

## Product constraints (non-negotiable)

- Keep existing API behavior (`/api/search`, `/api/platforms/:slug`, `/api/research` SSE, `/api/meta`).
- Preserve audit honesty: verified vs needs-human-judgment / blocked / pending; withhold peer comparison when not verified.
- Render-first chrome: Deploy to Render, Sign up on Render (UTMs), GitHub link, Render favicon.
  - Signup helper pattern: `utm_source=github`, `utm_medium=referral`, `utm_campaign=ojus_demos`, vary `utm_content` (`navbar_button`, `hero_cta`, `footer_link`).
  - Prefer `https://dashboard.render.com/register?...` or the project’s existing `renderSignupUrl` shape; never bare signup URLs without UTMs.
- Prefer square/near-square controls inspired by DDS (https://github.com/R4ph-t/DDS) without copying purple Inter theme wholesale.
- No em dashes in UI copy. Prefer colons.

## Redesign goals

1. **Brand-first first viewport:** “Developer Journey Atlas” is the dominant signal; one short supporting sentence; search; Deploy + Sign up. No methodology essay in the hero.
2. **Result hierarchy:** name → first success → audit status → counts (or withheld) → path/sources behind details. Investigation prompts collapsed by default.
3. **Cut words:** remove duplicate disclaimers; shorten banners; one “how to read” line only when a result is shown.
4. **Atmosphere:** cool slate / ink field with subtle topographic or grid texture; expressive display + readable body fonts (not Inter); one sharp accent (teal or chartreuse), not terracotta/purple.
5. **Motion:** 2–3 purposeful motions (hero settle, result enter, suggestion open). No decorative noise.
6. **Mobile:** header wraps; search stacks; result readable without horizontal scroll.

## Implementation scope

- Edit only `packages/journey-corpus/web/{index.html,styles.css,app.js}` unless a tiny shared helper is required.
- Do not rewrite corpus records or audit JSON.
- Ship on branch → push `atlas` remote → deploy web service `developer-journey-atlas` on Render.

## Acceptance checks

- [ ] First viewport readable in ~5 seconds: brand, job, search, deploy/signup
- [ ] Searching “Render” still shows verified path with comparison when API returns it
- [ ] Unverified platforms still withhold counts/comparison and say so briefly
- [ ] Sign up links include Ojus UTMs
- [ ] No Inter; no cream+terracotta theme; Render favicon present
- [ ] Production URL updated after deploy
