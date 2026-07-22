# Current frontend UI/UX: Developer Journey Atlas

**Live:** https://developer-journey-atlas.onrender.com/  
**Source:** `packages/journey-corpus/web/` (`index.html`, `styles.css`, `app.js`)  
**Served by:** Express static mount of `web/` ahead of generated data artifacts  
**Captured:** 2026-07-21 against production HTML/text and local source on `atlas/main`

---

## First viewport (exact experience)

1. **Skip link** (“Skip to content”) appears only on keyboard focus.
2. **Header** (full-width dark navy `#101c2c`):
   - Left: “DJ” mark in terracotta square + “Developer Journey Atlas”
   - Right: Method → `/methodology.md`, GitHub → `ojusave/developer-journey-atlas`, primary button “Deploy to Render”
   - **Missing vs project standards:** no “Sign up on Render” (UTMs)
3. **Hero** on cream paper `#f4f6f3`, Inter/system fonts, terracotta accent `#e55432`:
   - Eyebrow: `OPEN DEVELOPER-JOURNEY RESEARCH`
   - H1: `Account creation to first developer success.`
   - Supporting line: `Search a platform. See every verified required action and field on its shortest self-service path.`
   - Search combobox + primary “Show journey”
   - Hint: `{count} preserved source records. Re-audited paths are labeled clearly.`
   - Notice: `Optional work is excluded. Platform automation is not counted as developer work. No fake drop-off score.`
4. **Result panel** empty/hidden until a search succeeds.
5. **Footer:** one sentence of mission copy + links (GitHub, LLM guide, data manifest, measurement contract).

Overall feel: long explanatory copy before the tool does work; brand lives mainly in the nav, not as the dominant hero signal; visual language matches the common “cream paper + terracotta + Inter” pattern.

---

## Interaction flow

| Step | Behavior |
|------|----------|
| Type in search | Debounced `GET /api/search?q=…`; up to 8 suggestions (name + category); arrow keys / Enter / click |
| Submit | Exact name match → platform; else first suggestion; else unknown-platform research panel |
| Known platform | `GET /api/platforms/:slug` → result card |
| Unknown platform | Auto-starts `POST /api/research` (SSE); “Retry research” button; status log; draft banner + assessment; optional draft PR URL |

---

## Result card (known platform): what the user sees, in order

1. Platform name + category pill  
2. Outcome lede  
3. **“What this means”** strip (docs route ≠ behavior / conversion / ranking)  
4. **Audit banner** (verified / needs-human-judgment / blocked / pending)  
5. **Documented first success** block + signal counters (or “Withheld”)  
6. If verified: **Documented onboarding load** peer comparison card  
7. **Where to investigate** section (prompts + disclaimer microcopy)  
8. Collapsed `<details>`: path / prerequisites / gates / step list  
9. Collapsed `<details>`: official sources  
10. Links to full JSON record (+ audit JSON when present) and a note line  

Honesty about audit status is correct. Density of explanatory paragraphs and section kickers is high; the actionable path is buried under disclaimers and investigation copy.

---

## Gaps vs product / platform standards

- No Sign up on Render with Ojus UTMs (`navbar_button` / `hero_cta` / `footer_link`)
- GitHub is in header and footer (OK); Deploy is header-only
- Render favicon is present
- Default Inter + cream/terracotta look conflicts with workspace frontend design rules
- Too much front-loaded explanation before search value appears
