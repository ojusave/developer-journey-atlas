const el = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  result: document.querySelector("#result"),
};

let currentSuggestions = [];
let activeSuggestion = -1;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function num(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

async function api(path) {
  const res = await fetch(path);
  const body = await res.json().catch(() => ({ error: { message: "Bad response" } }));
  if (!res.ok || body.error) {
    const message = body.error ? body.error.message : `Request failed (${res.status})`;
    const err = new Error(message);
    err.code = body.error && body.error.code;
    err.status = res.status;
    throw err;
  }
  return body;
}

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/* ---------- Suggestions ---------- */

function hideSuggestions() {
  el.suggestions.hidden = true;
  el.input.setAttribute("aria-expanded", "false");
  el.input.removeAttribute("aria-activedescendant");
  activeSuggestion = -1;
}

function setActiveSuggestion(index) {
  const options = [...el.suggestions.querySelectorAll(".suggestion")];
  if (options.length === 0) return;
  activeSuggestion = (index + options.length) % options.length;
  options.forEach((option, optionIndex) => {
    const active = optionIndex === activeSuggestion;
    option.setAttribute("aria-selected", String(active));
    if (active) {
      el.input.setAttribute("aria-activedescendant", option.id);
      option.scrollIntoView({ block: "nearest" });
    }
  });
}

function renderSuggestions(rows) {
  currentSuggestions = rows;
  if (rows.length === 0) {
    hideSuggestions();
    return;
  }
  el.suggestions.innerHTML = rows
    .slice(0, 8)
    .map(
      (r, i) => `
      <li class="suggestion" role="option" id="sugg-${i}" data-slug="${esc(r.slug)}" aria-selected="false">
        <span class="s-name">${esc(r.name)}</span>
        <span class="s-cat">${esc(r.category)}</span>
      </li>`,
    )
    .join("");
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

const runSearch = debounce(async (q) => {
  if (!q) {
    hideSuggestions();
    return;
  }
  try {
    const { data } = await api(`/api/search?q=${encodeURIComponent(q)}`);
    renderSuggestions(data);
  } catch {
    hideSuggestions();
  }
}, 160);

/* ---------- Rendering one platform's onboarding flow ---------- */

function stepFields(fields) {
  if (!fields || fields.length === 0) return "";
  return `
    <ul class="step-fields" aria-label="Required fields">
      ${fields.map((f) => `<li><strong>${esc(f.label)}</strong>${f.type ? ` <span class="step-tag">${esc(f.type)}</span>` : ""}</li>`).join("")}
    </ul>`;
}

function stepFriction(gates) {
  if (!gates || gates.length === 0) return "";
  return `
    <div class="step-friction">
      ${gates.map((g) => `
        <p class="friction-note">
          <span class="chip chip-friction">${esc(g.type || "friction")}</span>
          ${esc(g.description)}
        </p>`).join("")}
    </div>`;
}

function stepItem(s) {
  const meta = [s.phase, s.interface]
    .filter(Boolean)
    .map((x) => `<span class="step-tag">${esc(x)}</span>`)
    .join("");
  const details = s.details && s.details.length
    ? `<ul class="step-details">${s.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
    : "";
  const signal = s.successSignal
    ? `<p class="step-signal">Done when: ${esc(s.successSignal)}</p>`
    : "";
  const optional = s.required === false ? '<span class="step-optional">optional</span>' : "";
  const frictionClass = s.hasFriction ? " step-has-friction" : "";
  return `
    <li class="step${frictionClass}">
      <div class="step-head"><span class="step-num">${num(s.stepNumber)}</span>${meta}${optional}</div>
      <p class="step-action">${esc(s.action)}</p>
      ${details}
      ${stepFields(s.requiredFields)}
      ${signal}
      ${stepFriction(s.frictionGates)}
    </li>`;
}

function bandLabel(band) {
  if (band === "light") return "Light";
  if (band === "moderate") return "Moderate";
  if (band === "heavy") return "Heavy";
  return "Unavailable";
}

function renderPlacement(placement, title) {
  if (!placement) return "";
  if (!placement.available) {
    return `
      <div class="score-placement">
        <h4>${esc(title)}</h4>
        <p class="score-unavailable">${esc(placement.summary)}</p>
      </div>`;
  }
  const pos =
    placement.position === "below"
      ? "below peer median effort"
      : placement.position === "above"
        ? "above peer median effort"
        : "at peer median effort";
  return `
    <div class="score-placement">
      <h4>${esc(title)}</h4>
      <p class="score-value">
        <span class="score-number">${esc(placement.score)}</span>
        <span class="score-band band-${esc(placement.band)}">${esc(bandLabel(placement.band))}</span>
      </p>
      <p class="score-meta">${esc(pos)} · ${num(placement.peerCount)} peers</p>
      <p class="score-summary">${esc(placement.summary)}</p>
    </div>`;
}

function renderOnboardingScore(score) {
  if (!score) return "";
  const b = score.breakdown || {};
  return `
    <section class="score-card" aria-label="Documented onboarding load">
      <p class="section-kicker">${esc(score.name || "Documented Onboarding Load")}</p>
      <p class="score-lede">Where this documented path sits overall and among category peers. Higher means a heavier path to first success.</p>
      <div class="score-grid">
        ${renderPlacement(score.overall, "Overall")}
        ${renderPlacement(score.peers, "Among peers")}
      </div>
      <ul class="score-breakdown" aria-label="Score breakdown">
        <li><span>Effort meter</span><strong>${esc(b.effort)}</strong></li>
        <li><span>Required actions</span><strong>${num(b.requiredActions)}</strong></li>
        <li><span>Friction gates</span><strong>${num(b.gates)}</strong></li>
        <li><span>Waits</span><strong>${num(b.waits)}</strong></li>
      </ul>
      <p class="score-note">${esc(score.note)}</p>
      <p class="score-finish">Finish line: ${esc(score.finishLine)}</p>
    </section>`;
}

/** Journey-first view: platform name + numbered onboarding steps only. */
function renderJourney(journey) {
  const stepList = journey.steps || [];
  const steps = stepList.length
    ? `<ol class="steps-list">${stepList.map(stepItem).join("")}</ol>`
    : '<p class="lede">No documented onboarding steps are available for this platform yet.</p>';
  const frictionHint = journey.highlightedStepCount
    ? `<p class="journey-hint">${num(journey.highlightedStepCount)} step${journey.highlightedStepCount === 1 ? "" : "s"} mark documented friction.</p>`
    : "";

  return `
    <div class="card journey-card">
      <div class="assess-head">
        <h2>${esc(journey.name)}</h2>
        <span class="pill pill-cat">${esc(journey.category)}</span>
      </div>
      <p class="lede">Onboarding from account creation to first success, step by step.</p>
      ${renderOnboardingScore(journey.onboardingScore)}
      ${frictionHint}
      <h3 class="steps-heading visually-hidden">Onboarding steps</h3>
      ${steps}
    </div>`;
}

/** Fallback when only an assessment payload exists (e.g. fresh research draft). */
function renderAssessmentAsJourney(a) {
  const gatesByStep = new Map();
  for (const gate of a.frictionGates || []) {
    if (gate.atStep == null) continue;
    const list = gatesByStep.get(gate.atStep) || [];
    list.push(gate);
    gatesByStep.set(gate.atStep, list);
  }
  const steps = (a.steps || []).map((s) => {
    const frictionGates = gatesByStep.get(s.stepNumber) || [];
    return { ...s, hasFriction: frictionGates.length > 0, frictionGates };
  });
  return renderJourney({
    name: a.name,
    category: a.category,
    steps,
    highlightedStepCount: steps.filter((s) => s.hasFriction).length,
  });
}

async function showPlatform(slug) {
  hideSuggestions();
  el.result.hidden = false;
  el.result.innerHTML = '<div class="state-message">Loading the onboarding flow…</div>';
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const journey = await api(`/api/platforms/${encodeURIComponent(slug)}/journey`);
    el.result.innerHTML = renderJourney(journey.data);
  } catch (journeyErr) {
    try {
      const assessment = await api(`/api/platforms/${encodeURIComponent(slug)}`);
      el.result.innerHTML = renderAssessmentAsJourney(assessment.data);
    } catch (err) {
      el.result.innerHTML = `<div class="state-message"><strong>Could not load that platform.</strong><br>${esc(err.message || journeyErr.message)}</div>`;
    }
  }
}

// A monotonically increasing token so a new submission (or reload) cancels any
// in-flight polling loop from a previous one.
let activePoll = 0;
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 160; // ~6.5 minutes, then we stop polling but research continues.

const PHASE_TEXT = {
  queued: "Queued. Research will start shortly…",
  running: "Researching official documentation…",
  retrying: "A step hit a transient error and is being retried…",
};

const OUTCOME_MESSAGE = {
  no_docs: "No official documentation was found for that platform, so nothing could be drafted.",
  search_failed: "The documentation search provider was unavailable. Nothing was submitted. Try again shortly.",
  model_failed: "The model provider was unavailable while reconstructing the record. Nothing was submitted. Try again shortly.",
  invalid_output: "The model could not produce a schema-valid record from the official docs, so nothing was submitted.",
  source_grounding_failed: "The draft cited sources that were not returned by the official-docs search, so it was rejected. Nothing was submitted.",
};

function setUrlState(query, runId) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (runId) params.set("research", runId);
  const suffix = params.toString();
  history.replaceState(null, "", suffix ? `?${suffix}` : location.pathname);
}

function setStatus(text) {
  const statusEl = document.querySelector("#research-status");
  if (statusEl) statusEl.textContent = text;
}

function renderUnknown(query) {
  el.result.hidden = false;
  el.result.innerHTML = `
    <div class="card unknown-panel">
      <p class="section-kicker">New platform</p>
      <h2>Researching ${esc(query)}</h2>
      <p class="lede">Looking up official docs and drafting the onboarding flow.</p>
      <p class="research-status" id="research-status" role="status" aria-live="polite"></p>
      <button class="btn btn-secondary" id="research-btn" type="button" hidden>Retry research</button>
    </div>`;
  wireRetry(query);
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  researchPlatform(query);
}

function wireRetry(query) {
  const btn = document.querySelector("#research-btn");
  if (!btn) return;
  btn.hidden = false;
  btn.addEventListener("click", () => researchPlatform(query));
}

function renderResearchError(message, query) {
  el.result.hidden = false;
  el.result.innerHTML = `
    <div class="card unknown-panel">
      <p class="section-kicker">RESEARCH</p>
      <h2>"${esc(query)}"</h2>
      <p class="lede">${esc(message)}</p>
      <button class="btn btn-secondary" id="research-btn" type="button">Try research again</button>
    </div>`;
  wireRetry(query);
}

function renderResult(result, query) {
  if (result.outcome === "known") return showPlatform(result.slug);
  if (result.outcome === "completed") {
    // Prefer the persisted journey (Postgres) once the status poll has saved it.
    if (result.slug) return showPlatform(result.slug);
    el.result.innerHTML = renderAssessmentAsJourney(result.assessment);
    return;
  }
  renderResearchError(OUTCOME_MESSAGE[result.outcome] || "Research could not be completed.", query);
}

// Start research and poll for its result. Safe to call on retry or on reload.
async function researchPlatform(query) {
  const btn = document.querySelector("#research-btn");
  if (btn) btn.disabled = true;
  setStatus("Starting…");
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: query }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      renderResearchError(body.error ? body.error.message : `Research is unavailable right now (${res.status}).`, query);
      return;
    }
    if (body.data && body.data.known) return showPlatform(body.data.slug);
    const runId = body.data && body.data.runId;
    if (!runId) {
      renderResearchError("Research could not be started right now. Try again shortly.", query);
      return;
    }
    setUrlState(query, runId);
    setStatus(PHASE_TEXT[body.data.phase] || PHASE_TEXT.queued);
    pollRunStatus(runId, query);
  } catch {
    renderResearchError("Could not reach the research service. Check your connection and try again.", query);
  }
}

// Poll server-side run status. A dropped connection never cancels the research;
// the run continues on Render and the browser resumes on the next poll.
async function pollRunStatus(runId, query) {
  const token = ++activePoll;
  let networkErrors = 0;
  for (let i = 0; i < MAX_POLLS; i += 1) {
    if (token !== activePoll) return; // superseded by a newer run
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    if (token !== activePoll) return;
    let body;
    try {
      const res = await fetch(`/api/research/${encodeURIComponent(runId)}`);
      body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 404 && i < 3) continue; // run may not be visible yet
        renderResearchError(body.error ? body.error.message : "Lost track of this research run.", query);
        return;
      }
      networkErrors = 0;
    } catch {
      networkErrors += 1;
      setStatus("Reconnecting to the research service… (your research is still running)");
      if (networkErrors > 8) {
        renderResearchError("Could not reach the research service. Your research may still be running: reload to resume.", query);
        return;
      }
      continue;
    }

    const projection = body.data;
    if (!projection) continue;
    if (projection.phase === "completed" && projection.result) {
      setUrlState(query, null);
      renderResult(projection.result, query);
      return;
    }
    if (projection.phase === "failed") {
      renderResearchError(projection.message || "Research could not be completed. Try again shortly.", query);
      return;
    }
    setStatus(PHASE_TEXT[projection.phase] || PHASE_TEXT.running);
  }
  setStatus("Research is taking longer than expected. It is still running: reload this page to resume.");
}

async function submitQuery(q) {
  const query = q.trim();
  if (!query) return;
  activePoll += 1; // cancel any previous polling loop
  try {
    const { data } = await api(`/api/search?q=${encodeURIComponent(query)}`);
    const exact = data.find((r) => r.name.toLowerCase() === query.toLowerCase());
    if (exact) return showPlatform(exact.slug);
    if (data.length > 0) return showPlatform(data[0].slug);
    renderUnknown(query);
  } catch (err) {
    el.result.hidden = false;
    el.result.innerHTML = `<div class="state-message">${esc(err.message)}</div>`;
  }
}

// Resume an in-flight research run after a page reload using the URL state.
function resumeFromUrl() {
  const params = new URLSearchParams(location.search);
  const runId = params.get("research");
  const query = params.get("q");
  if (!runId || !query) return false;
  el.input.value = query;
  el.result.hidden = false;
  el.result.innerHTML = `
    <div class="card unknown-panel">
      <p class="section-kicker">New platform</p>
      <h2>Researching ${esc(query)}</h2>
      <p class="lede">Resuming research…</p>
      <p class="research-status" id="research-status" role="status" aria-live="polite"></p>
      <button class="btn btn-secondary" id="research-btn" type="button" hidden>Retry research</button>
    </div>`;
  wireRetry(query);
  setStatus("Resuming…");
  pollRunStatus(runId, query);
  return true;
}

/* ---------- Events ---------- */

el.input.addEventListener("input", (e) => runSearch(e.target.value));
el.input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));
el.input.addEventListener("keydown", (event) => {
  if (el.suggestions.hidden) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveSuggestion(activeSuggestion + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveSuggestion(activeSuggestion - 1);
  } else if (event.key === "Escape") {
    hideSuggestions();
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    const choice = currentSuggestions[activeSuggestion];
    if (choice) showPlatform(choice.slug);
  }
});

el.suggestions.addEventListener("click", (e) => {
  const li = e.target.closest(".suggestion");
  if (li) showPlatform(li.dataset.slug);
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitQuery(el.input.value);
});

async function init() {
  resumeFromUrl();
}

init();
