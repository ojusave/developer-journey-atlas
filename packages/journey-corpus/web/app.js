const el = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  platformCount: document.querySelector("#platform-count"),
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

/* ---------- Rendering one platform's documented route ---------- */

// A short, honest "how to read this" strip shown with every result. It frames
// the content as documented steps, not a measurement, score, or ranking.
function readStrip() {
  return `
    <p class="read-strip">
      <strong>What this means:</strong> this is the route described by official docs. It is not observed
      developer behavior, a conversion rate, or a product ranking.
    </p>`;
}

function renderLoad(load) {
  if (!load || !load.available) {
    return `
      <section class="load-card load-unavailable" aria-labelledby="load-title">
        <p class="section-kicker">DOCUMENTED ONBOARDING LOAD</p>
        <h3 id="load-title">${esc(load?.label || "Comparison unavailable")}</h3>
        <p>${esc(load?.summary || "There is not enough qualified evidence for a peer comparison.")}</p>
        <p class="microcopy">${esc(load?.note || "No drop-off score is inferred from documentation.")}</p>
      </section>`;
  }

  const components = (load.components || []).map((component) => `
    <li class="signal-row">
      <span><strong>${num(component.value)}</strong> ${esc(component.label)}</span>
      <span class="position position-${esc(component.position)}">${esc(component.position)} peer median (${num(component.peerMedian)})</span>
    </li>`).join("");

  return `
    <section class="load-card" aria-labelledby="load-title">
      <div class="load-head">
        <div>
          <p class="section-kicker">DOCUMENTED ONBOARDING LOAD</p>
          <h3 id="load-title">${esc(load.label)}</h3>
        </div>
        <span class="load-score" aria-label="${num(load.signalsAboveMedian)} of ${num(load.signalCount)} signals above peer median">
          ${num(load.signalsAboveMedian)}<small>/${num(load.signalCount)}</small>
        </span>
      </div>
      <p>${esc(load.summary)}</p>
      <ul class="signal-list">${components}</ul>
      <p class="microcopy">${esc(load.note)}</p>
    </section>`;
}

/** Counts are null for non-verified audits; never dereference routeSignals blindly. */
function renderSignals(routeSignals) {
  if (!routeSignals) {
    return '<p class="withheld">Counts withheld until this path is verified.</p>';
  }
  return `
        <div class="signal-counters" aria-label="Documented route signals">
          <div><strong>${num(routeSignals.requiredActions)}</strong><span>required actions</span></div>
          <div><strong>${num(routeSignals.requiredFields ?? routeSignals.decisions)}</strong><span>required fields</span></div>
          <div><strong>${num(routeSignals.waits)}</strong><span>waits</span></div>
          <div><strong>${num(routeSignals.gates)}</strong><span>gates</span></div>
        </div>`;
}

function stepItem(s) {
  const meta = [s.phase, s.actor, s.interface]
    .filter(Boolean)
    .map((x) => `<span class="step-tag">${esc(x)}</span>`)
    .join("");
  const details = s.details && s.details.length
    ? `<ul class="step-details">${s.details.map((d) => `<li>${esc(d)}</li>`).join("")}</ul>`
    : "";
  const signal = s.successSignal
    ? `<p class="step-signal"><strong>Success signal:</strong> ${esc(s.successSignal)}</p>`
    : "";
  const optional = s.required ? "" : '<span class="step-optional">optional</span>';
  return `
    <li class="step">
      <div class="step-head"><span class="step-num">${num(s.stepNumber)}</span>${meta}${optional}</div>
      <p class="step-action">${esc(s.action)}</p>
      ${details}
      ${signal}
    </li>`;
}

function renderAssessment(a) {
  const prerequisites = a.prerequisites || [];
  const frictionGates = a.frictionGates || [];
  const sourceList = a.sources || [];
  const stepList = a.steps || [];
  const firstSuccess = a.firstSuccess || {};

  const prereqs = prerequisites.length
    ? `<div class="chips">${prerequisites
        .map((p) => `<span class="chip ${p.required ? "req" : ""}">${esc(p.type)}${p.required ? " (required)" : ""}</span>`)
        .join("")}</div>`
    : '<p class="lede">No prerequisites documented for this route.</p>';

  const gates = frictionGates.length
    ? `<ul class="gate-list">${frictionGates
        .map((g) => `<li><span class="chip">${esc(g.type)}</span> ${esc(g.description)}${g.atStep ? ` <span class="gate-step">(at step ${num(g.atStep)})</span>` : ""}</li>`)
        .join("")}</ul>`
    : '<p class="lede">No friction gates documented on this route.</p>';

  const sources = sourceList.length
    ? `<ul class="sources-list">${sourceList
        .slice(0, 8)
        .map((s) => `<li><a href="${esc(s.url)}" rel="noreferrer">${esc(s.title)}</a></li>`)
        .join("")}${sourceList.length > 8 ? `<li>+ ${sourceList.length - 8} more in the record</li>` : ""}</ul>`
    : '<p class="lede">See the full record for sources.</p>';

  const steps = stepList.length
    ? `<ol class="steps-list">${stepList.map(stepItem).join("")}</ol>`
    : '<p class="lede">Open the full record for the documented steps.</p>';

  const asOf = a.researchedAt
    ? ` Documented from official docs as of ${esc(a.researchedAt)}. Docs change.`
    : "";

  const prompts = a.investigationPrompts?.length
    ? `<ul class="prompt-list">${a.investigationPrompts.map((prompt) => `<li>${esc(prompt)}</li>`).join("")}</ul>`
    : '<p class="lede">No specific investigation prompts were derived from the documented route.</p>';

  const stepLabel = a.pathStepCount == null ? "see record" : `${num(a.pathStepCount)} steps`;

  return `
    <div class="card">
      <div class="assess-head">
        <h2>${esc(a.name)}</h2>
        <span class="pill pill-cat">${esc(a.category)}</span>
      </div>
      <p class="lede">${esc(a.outcome)}</p>
      ${readStrip()}

      <div class="summary-grid">
        <div class="summary-block">
          <p class="section-kicker">DOCUMENTED FIRST SUCCESS</p>
          <p class="summary-answer">${esc(firstSuccess.milestone || firstSuccess.normalizedOutcome || a.outcome)}</p>
          <p class="microcopy">Selected route: ${esc(a.selectedSurface)}</p>
        </div>
        ${renderSignals(a.routeSignals)}
      </div>

      ${renderLoad(a.onboardingLoad)}

      <section class="prompt-card" aria-labelledby="prompt-title">
        <p class="section-kicker">WHERE TO INVESTIGATE</p>
        <h3 id="prompt-title">Possible attention points</h3>
        <p class="microcopy">These prompts come from documented gates and prerequisites. They are not recorded causes of drop-off.</p>
        ${prompts}
      </section>

      <details class="detail-panel">
        <summary>Open the full documented route <span>${esc(stepLabel)}</span></summary>
        <dl class="kv">
          <div><dt>Prerequisites</dt><dd>${prereqs}</dd></div>
          <div><dt>Friction gates (descriptive)</dt><dd>${gates}</dd></div>
        </dl>
        <h3 class="steps-heading">Documented steps <span class="steps-count">${esc(stepLabel)}</span></h3>
        ${steps}
      </details>

      <details class="detail-panel sources-block">
        <summary>Check the evidence <span>${num(a.sourceCount)} official sources</span></summary>
        ${sources}
      </details>

      <p class="dist-line"><a href="${esc(a.recordUrl)}" rel="noreferrer">Open the full evidence record (JSON)</a></p>
      <p class="dist-line note-line">${esc(a.note)}${asOf}</p>
    </div>`;
}

async function showPlatform(slug) {
  hideSuggestions();
  el.result.hidden = false;
  el.result.innerHTML = '<div class="state-message">Loading the documented route…</div>';
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const assessment = await api(`/api/platforms/${encodeURIComponent(slug)}`);
    el.result.innerHTML = renderAssessment(assessment.data);
  } catch (err) {
    el.result.innerHTML = `<div class="state-message"><strong>Could not load that platform.</strong><br>${esc(err.message)}</div>`;
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
      <h2>${esc(query)} is not in the Atlas yet</h2>
      <p class="lede">Researching official docs on a durable Workflow, then drafting a contribution for review.</p>
      <p class="research-status" id="research-status" role="status" aria-live="polite"></p>
      <button class="btn btn-secondary" id="research-btn" type="button">Retry research</button>
    </div>`;
  wireRetry(query);
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  researchPlatform(query);
}

function wireRetry(query) {
  const btn = document.querySelector("#research-btn");
  if (btn) btn.addEventListener("click", () => researchPlatform(query));
}

function draftBanner(record) {
  const json = JSON.stringify(record, null, 2);
  const blob = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  return `
    <div class="draft-banner">
      <strong>Machine draft, unverified.</strong> Schema-valid from live research; not human-reviewed.
      <a href="${blob}" download="${esc(record.platform.slug)}.json">Download JSON</a>
    </div>`;
}

function renderContribution(contribution) {
  if (!contribution) return "";
  if (contribution.status === "opened") {
    const reused = contribution.reused ? " An existing open contribution was reused." : "";
    return `<div class="card"><p class="dist-line"><strong>Draft contribution opened for human review:</strong> <a href="${esc(contribution.url)}" rel="noreferrer">${esc(contribution.url)}</a>${reused}</p></div>`;
  }
  return `<div class="card"><p class="dist-line">${esc(contribution.reason)}</p></div>`;
}

// Render a terminal error outcome with a keyboard-accessible retry control.
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
    el.result.innerHTML =
      draftBanner(result.record) + renderAssessment(result.assessment) + renderContribution(result.contribution);
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
      <h2>${esc(query)} is not in the Atlas yet</h2>
      <p class="lede">Resuming research…</p>
      <p class="research-status" id="research-status" role="status" aria-live="polite"></p>
      <button class="btn btn-secondary" id="research-btn" type="button">Retry research</button>
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
  try {
    const { data } = await api("/api/meta");
    el.platformCount.textContent = num(data.count);
  } catch {
    /* leave the static fallback count */
  }
  resumeFromUrl();
}

init();
