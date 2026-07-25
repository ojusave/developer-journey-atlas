const el = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  result: document.querySelector("#result"),
  status: document.querySelector("#global-status"),
};

let currentSuggestions = [];
let activeSuggestion = -1;
let searchController = null;
let searchGeneration = 0;
let comparisonGeneration = 0;
let evidenceGeneration = 0;
let activePoll = 0;
let researchPending = false;

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const scrollBehavior = () => prefersReducedMotion.matches ? "auto" : "smooth";
const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 160;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function announce(message) {
  el.status.textContent = "";
  window.setTimeout(() => {
    el.status.textContent = message;
  }, 20);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => ({ error: { message: "The server returned an unreadable response." } }));
  if (!response.ok || body.error) {
    const error = new Error(body.error?.message || `Request failed (${response.status}).`);
    error.code = body.error?.code;
    error.status = response.status;
    throw error;
  }
  return body;
}

function cancelSuggestions() {
  searchGeneration += 1;
  searchController?.abort();
  searchController = null;
  hideSuggestions();
}

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

function renderSuggestions(rows, generation) {
  if (generation !== searchGeneration) return;
  currentSuggestions = rows.slice(0, 8);
  if (currentSuggestions.length === 0) {
    hideSuggestions();
    return;
  }
  el.suggestions.innerHTML = currentSuggestions.map((row, index) => `
    <li class="suggestion" role="option" id="sugg-${index}" data-slug="${esc(row.slug)}" aria-selected="false">
      <span class="s-name">${esc(row.name)}</span>
      <span class="s-cat">${esc(row.category)}</span>
    </li>
  `).join("");
  el.suggestions.hidden = false;
  el.input.setAttribute("aria-expanded", "true");
}

let searchTimer;
function queueSearch(query) {
  window.clearTimeout(searchTimer);
  const normalized = query.trim();
  if (!normalized) {
    cancelSuggestions();
    return;
  }
  const generation = ++searchGeneration;
  searchController?.abort();
  searchController = new AbortController();
  searchTimer = window.setTimeout(async () => {
    try {
      const { data } = await api(`/api/search?q=${encodeURIComponent(normalized)}`, {
        signal: searchController.signal,
      });
      renderSuggestions(data, generation);
    } catch (error) {
      if (error.name !== "AbortError" && generation === searchGeneration) hideSuggestions();
    }
  }, 160);
}

function stepFields(fields) {
  if (!Array.isArray(fields) || fields.length === 0) return "";
  return `
    <div class="field-inventory">
      <p>Information to provide</p>
      <ul class="step-fields">
        ${fields.map((field) => `
          <li>
            <strong>${esc(field.label)}</strong>
            <span class="step-tag">${esc(field.type || "field")}</span>
            ${field.required === false ? '<span class="step-optional">optional</span>' : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function stepGates(gates) {
  if (!Array.isArray(gates) || gates.length === 0) return "";
  return `
    <div class="documented-gates">
      <p>Requirement or choice</p>
      <ul>
        ${gates.map((gate) => `
          <li>
            <span class="step-tag">${esc(gate.type || "gate")}</span>
            ${esc(gate.description)}
            ${gate.required === false ? '<span class="step-optional">conditional</span>' : ""}
          </li>
        `).join("")}
      </ul>
    </div>
  `;
}

function kindLabel(kind) {
  return {
    developer_action: "Your action",
    decision: "Your choice",
    passive_wait: "Wait",
    platform_outcome: "Platform status",
    terminal_outcome: "First success",
  }[kind] || "Route event";
}

function stepItem(step) {
  const tags = `<span class="step-tag step-kind kind-${esc(step.kind)}">${esc(kindLabel(step.kind))}</span>`;
  const signal = step.successSignal
    ? `<p class="step-signal"><strong>Expected result:</strong> ${esc(step.successSignal)}</p>`
    : "";
  return `
    <li class="step kind-border-${esc(step.kind)}">
      <div class="step-head"><span class="step-num">${esc(step.stepNumber)}</span>${tags}</div>
      <p class="step-action">${esc(step.action)}</p>
      ${stepFields(step.requiredFields)}
      ${stepGates(step.frictionGates)}
      ${signal}
    </li>
  `;
}

function routeOverview(scope) {
  if (!scope) return "";
  const alternatives = Array.isArray(scope.alternatives) && scope.alternatives.length
    ? `
      <details class="route-alternatives">
        <summary>Other documented routes considered</summary>
        <ul>
          ${scope.alternatives.map((alternative) => `
            <li>
              <strong>${esc(alternative.condition)}</strong>
              <span>${esc(alternative.routeSummary)}</span>
              <span class="alternative-reason">Not selected here: ${esc(alternative.reasonNotSelected)}</span>
            </li>
          `).join("")}
        </ul>
      </details>
    `
    : "";
  return `
    <section class="route-overview" aria-labelledby="route-overview-title">
      <h3 id="route-overview-title">At a glance</h3>
      <dl>
        <div>
          <dt>Selected path</dt>
          <dd>${esc(scope.selectedPath)}</dd>
        </div>
        <div>
          <dt>Best fit</dt>
          <dd>${esc(scope.bestFit)}</dd>
        </div>
        <div>
          <dt>First success</dt>
          <dd>${esc(scope.firstSuccess)}</dd>
        </div>
      </dl>
      ${alternatives}
    </section>
  `;
}

function correctionUrl(journey) {
  const title = `Journey correction: ${journey.name}`;
  const body = [
    `Platform: ${journey.name}`,
    `Route URL: ${location.origin}/platform/${journey.slug}`,
    "",
    "Disputed step:",
    "",
    "Current source:",
    "",
    "Proposed source:",
    "",
    "Expected first-success boundary:",
    "",
    "Contributor evidence:",
  ].join("\n");
  const params = new URLSearchParams({ title, body, labels: "journey-correction" });
  return `https://github.com/ojusave/developer-journey-atlas/issues/new?${params}`;
}

function comparisonCriteria(criteria) {
  return `
    <details class="comparison-criteria">
      <summary>What counts as comparable?</summary>
      <ul>${criteria.map((criterion) => `<li>${esc(criterion)}</li>`).join("")}</ul>
    </details>
  `;
}

function renderUnavailableComparison(comparison, failed = false) {
  return `
    <div class="comparison-head">
      <div>
        <h3 id="peer-comparison-title">Comparable peers</h3>
        <p class="comparison-state">Comparison unavailable</p>
      </div>
      <span class="comparison-count">${esc(comparison.qualifiedPeerCount)} of ${esc(comparison.requiredPeerCount)}</span>
    </div>
    <p>${esc(
      failed
        ? "The comparison could not be loaded. The documented route remains available."
        : `${comparison.qualifiedPeerCount} of ${comparison.requiredPeerCount} qualified peers are currently available.`,
    )}</p>
    <p class="microcopy">${esc(comparison.note)}</p>
    ${comparisonCriteria(comparison.criteria)}
    ${failed ? '<button class="btn btn-secondary comparison-retry" type="button">Try comparison again</button>' : ""}
  `;
}

function peerResultItem(peer) {
  const values = peer.measurements;
  return `
    <li>
      <button class="peer-inspect" type="button" data-peer-slug="${esc(peer.slug)}">
        <strong>${esc(peer.name)}</strong>
        <span>${esc(values.requiredActions)} actions, ${esc(values.requiredFields)} fields, ${esc(values.externalGates)} gates, ${esc(values.unavoidableWaits)} waits</span>
      </button>
    </li>
  `;
}

function renderPeerSelection(peer) {
  const selection = document.querySelector("#peer-selection");
  if (!selection || !peer) return;
  const values = peer.measurements;
  selection.innerHTML = `
    <p class="section-kicker">Selected peer</p>
    <h4>${esc(peer.name)}</h4>
    <dl class="peer-measurements">
      <div><dt>Required actions</dt><dd>${esc(values.requiredActions)}</dd></div>
      <div><dt>Required fields</dt><dd>${esc(values.requiredFields)}</dd></div>
      <div><dt>External gates</dt><dd>${esc(values.externalGates)}</dd></div>
      <div><dt>Unavoidable waits</dt><dd>${esc(values.unavoidableWaits)}</dd></div>
    </dl>
    <a class="btn btn-secondary" href="/platform/${encodeURIComponent(peer.slug)}">Open route</a>
  `;
}

function renderPeerResults(peers, query = "") {
  const results = document.querySelector("#peer-results");
  if (!results) return;
  const normalized = query.trim().toLowerCase();
  const matches = peers.filter((peer) =>
    `${peer.name} ${peer.organization}`.toLowerCase().includes(normalized)
  );
  results.innerHTML = matches.length
    ? matches.map(peerResultItem).join("")
    : '<li class="peer-empty">No qualified peer matches that search.</li>';
  const status = document.querySelector("#peer-search-status");
  if (status) {
    status.textContent = `${matches.length} qualified peer${matches.length === 1 ? "" : "s"} shown.`;
  }
}

function renderAvailableComparison(comparison) {
  const rows = comparison.dimensions.map((dimension) => `
    <tr>
      <th scope="row">${esc(dimension.label)}</th>
      <td>${esc(dimension.subjectValue)}</td>
      <td>${esc(dimension.peerMedian)}</td>
      <td>${esc(dimension.peerMinimum)} to ${esc(dimension.peerMaximum)}</td>
      <td>${esc(dimension.position)}</td>
    </tr>
  `).join("");
  return `
    <div class="comparison-head">
      <div>
        <h3 id="peer-comparison-title">Comparable peers</h3>
        <p class="comparison-state">Direct route comparison</p>
      </div>
      <span class="comparison-count">${esc(comparison.qualifiedPeerCount)} qualified</span>
    </div>
    <div class="comparison-table-wrap" tabindex="0" role="region" aria-label="Route comparison dimensions">
      <table class="comparison-table">
        <thead>
          <tr>
            <th scope="col">Route dimension</th>
            <th scope="col">${esc(comparison.subject.name)}</th>
            <th scope="col">Peer median</th>
            <th scope="col">Peer range</th>
            <th scope="col">Position</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div class="peer-search">
      <label for="peer-search">Find a qualified peer</label>
      <input id="peer-search" type="search" autocomplete="off" placeholder="Search by platform or organization">
      <p id="peer-search-status" class="microcopy" role="status" aria-live="polite"></p>
      <ul id="peer-results" class="peer-results"></ul>
      <section id="peer-selection" class="peer-selection" aria-live="polite"></section>
    </div>
    <p class="microcopy">${esc(comparison.note)}</p>
    ${comparisonCriteria(comparison.criteria)}
  `;
}

function wirePeerComparison(comparison, slug) {
  if (comparison.available) {
    const input = document.querySelector("#peer-search");
    renderPeerResults(comparison.peers);
    renderPeerSelection(comparison.peers[0]);
    input?.addEventListener("input", (event) => {
      renderPeerResults(comparison.peers, event.target.value);
    });
    document.querySelector("#peer-results")?.addEventListener("click", (event) => {
      const trigger = event.target.closest(".peer-inspect");
      if (!trigger) return;
      renderPeerSelection(comparison.peers.find((peer) => peer.slug === trigger.dataset.peerSlug));
    });
  }
  document.querySelector(".comparison-retry")?.addEventListener("click", () => {
    loadPeerComparison(slug);
  });
}

async function loadPeerComparison(slug) {
  const mount = document.querySelector("#peer-comparison");
  if (!mount) return;
  const generation = ++comparisonGeneration;
  mount.setAttribute("aria-busy", "true");
  mount.innerHTML = '<p class="comparison-loading">Checking qualified peers…</p>';
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/curve`);
    const activeJourney = document.querySelector(".journey-card");
    if (generation !== comparisonGeneration || activeJourney?.dataset.platformSlug !== slug) return;
    mount.innerHTML = data.available
      ? renderAvailableComparison(data)
      : renderUnavailableComparison(data);
    wirePeerComparison(data, slug);
  } catch {
    if (generation !== comparisonGeneration) return;
    const fallback = {
      qualifiedPeerCount: 0,
      requiredPeerCount: 3,
      criteria: [
        "The same developer job and account-creation starting boundary",
        "The same first-success outcome and boundary",
        "The same route granularity and platform category",
        "A distinct organization and documentation set",
        "Current reviewed evidence",
      ],
      note: "Comparison data is temporarily unavailable.",
    };
    mount.innerHTML = renderUnavailableComparison(fallback, true);
    wirePeerComparison(fallback, slug);
  } finally {
    if (generation === comparisonGeneration) mount.setAttribute("aria-busy", "false");
  }
}

function renderEvidence(evidence) {
  const sources = evidence.sources.map((source) => `
    <li class="evidence-source">
      <div class="evidence-source-head">
        <h4>${esc(source.title)}</h4>
        <span>${esc(source.officialDomain)}</span>
      </div>
      <p><strong>Supports:</strong> ${source.claimOrRouteElements.map(esc).join("; ")}</p>
      <p><strong>Section or locator:</strong> ${source.locators.map(esc).join("; ")}</p>
      <p><strong>Retrieved:</strong> ${esc(source.retrievedAt || "Date unavailable")}</p>
      <a href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Open official source</a>
    </li>
  `).join("");
  return `
    <p>${esc(evidence.derivationNote)}</p>
    <ul class="evidence-list">${sources}</ul>
  `;
}

async function loadOfficialEvidence(slug) {
  const mount = document.querySelector("#official-evidence-content");
  if (!mount) return;
  const generation = ++evidenceGeneration;
  mount.setAttribute("aria-busy", "true");
  mount.innerHTML = '<p role="status">Loading official evidence…</p>';
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/evidence`);
    const activeJourney = document.querySelector(".journey-card");
    if (generation !== evidenceGeneration || activeJourney?.dataset.platformSlug !== slug) return;
    mount.innerHTML = renderEvidence(data);
  } catch (error) {
    if (generation !== evidenceGeneration) return;
    mount.innerHTML = `
      <p role="alert">Official evidence could not be loaded. The documented route remains available.</p>
      <button class="btn btn-secondary evidence-retry" type="button">Try evidence again</button>
    `;
    mount.querySelector(".evidence-retry")?.addEventListener("click", () => loadOfficialEvidence(slug));
  } finally {
    if (generation === evidenceGeneration) mount.setAttribute("aria-busy", "false");
  }
}

function wireEvidenceDisclosure(journey) {
  const disclosure = document.querySelector("#official-evidence");
  disclosure?.addEventListener("toggle", () => {
    if (disclosure.open && disclosure.dataset.loaded !== "true") {
      disclosure.dataset.loaded = "true";
      loadOfficialEvidence(journey.slug);
    }
  });
}

function renderJourney(journey) {
  const prerequisites = Array.isArray(journey.prerequisites) && journey.prerequisites.length
    ? `
      <section class="route-facts" aria-labelledby="prerequisites-title">
        <h3 id="prerequisites-title">What you need before starting</h3>
        <ul>
          ${journey.prerequisites.map((item) => `
            <li>${esc(item.requirement)}${item.required === false ? " (optional)" : ""}</li>
          `).join("")}
        </ul>
      </section>
    `
    : "";
  const steps = Array.isArray(journey.steps) && journey.steps.length
    ? `
      <details class="route-details">
        <summary>Show all ${esc(journey.steps.length)} documented events</summary>
        <p class="route-details-note">Actions, choices, waits, and platform status changes stay separate so the route is not compressed.</p>
        <ol class="steps-list">${journey.steps.map(stepItem).join("")}</ol>
      </details>
    `
    : '<p>No published route is available.</p>';
  return `
    <article class="card journey-card" data-platform-slug="${esc(journey.slug)}">
      <div class="assess-head">
        <div>
          <p class="section-kicker">Route map</p>
          <h2 tabindex="-1" id="journey-title">${esc(journey.name)}</h2>
        </div>
        <span class="pill pill-cat">${esc(journey.category)}</span>
      </div>
      <p class="lede">${esc(journey.note)}</p>
      ${routeOverview(journey.routeScope)}
      ${prerequisites}
      <div class="result-actions">
        ${journey.startingUrl ? `<a class="btn btn-primary" id="official-start" href="${esc(journey.startingUrl)}" target="_blank" rel="noopener noreferrer">Open official starting point</a>` : ""}
        <button class="btn btn-secondary" type="button" id="share-route">Copy share link</button>
        <a class="btn btn-secondary" id="correct-route" href="${esc(correctionUrl(journey))}" target="_blank" rel="noopener noreferrer">Suggest a correction</a>
      </div>
      <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      <section class="peer-comparison" id="peer-comparison" aria-labelledby="peer-comparison-title" aria-busy="true">
        <p class="comparison-loading">Checking qualified peers…</p>
      </section>
      <details class="official-evidence" id="official-evidence">
        <summary>View official evidence</summary>
        <div id="official-evidence-content"></div>
      </details>
      <h3 class="steps-heading">Detailed route</h3>
      ${steps}
    </article>
  `;
}

async function copyShareLink(slug) {
  const url = `${location.origin}/platform/${slug}`;
  const status = document.querySelector("#copy-status");
  try {
    await navigator.clipboard.writeText(url);
    status.textContent = "Share link copied.";
    announce("Share link copied.");
  } catch {
    status.textContent = "Could not copy automatically. Copy the URL from the address bar.";
    announce("Could not copy the share link.");
  }
}

function wireJourneyActions(journey) {
  document.querySelector("#share-route")?.addEventListener("click", () => copyShareLink(journey.slug));
  document.querySelector("#correct-route")?.addEventListener("click", () => {
    announce("Opening a prefilled GitHub correction form. Nothing has been submitted.");
  });
  wireEvidenceDisclosure(journey);
}

function setClientMetadata(journey) {
  const title = `${journey.name} documented route | Developer Journey Atlas`;
  const description = `Inspect ${journey.name}'s source-grounded route from account creation to first developer success.`;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", location.href);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", location.href);
}

function setRootMetadata() {
  const title = "Developer Journey Atlas";
  const description = "Search a reviewed developer platform and inspect its source-grounded route from account creation to first success.";
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", location.origin + "/");
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", location.origin + "/");
}

function setNotFoundMetadata(slug) {
  const title = "Route not found | Developer Journey Atlas";
  const description = "This platform does not have a published source-grounded route.";
  const canonicalUrl = `${location.origin}/platform/${encodeURIComponent(slug)}`;
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", canonicalUrl);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", canonicalUrl);
}

function pushPlatformRoute(slug) {
  const target = `/platform/${encodeURIComponent(slug)}`;
  if (location.pathname !== target) history.pushState({ slug }, "", target);
}

async function showPlatform(slug, { push = true, focus = true } = {}) {
  activePoll += 1;
  comparisonGeneration += 1;
  evidenceGeneration += 1;
  researchPending = false;
  cancelSuggestions();
  el.result.hidden = false;
  el.result.innerHTML = '<div class="state-message" role="status">Loading documented route…</div>';
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/journey`);
    if (push) pushPlatformRoute(data.slug);
    el.input.value = data.name;
    el.result.innerHTML = renderJourney(data);
    wireJourneyActions(data);
    setClientMetadata(data);
    announce(`${data.name} documented route loaded.`);
    if (focus) document.querySelector("#journey-title")?.focus();
    loadPeerComparison(data.slug);
  } catch (error) {
    renderNotFound(slug, error.message);
  }
}

function renderNotFound(slug, detail = "") {
  el.result.hidden = false;
  el.result.innerHTML = `
    <section class="card unknown-panel" aria-labelledby="not-found-title">
      <p class="section-kicker">Not found</p>
      <h2 id="not-found-title" tabindex="-1">No published route for “${esc(slug)}”</h2>
      <p class="lede">Only routes that pass the source, identity, field, and route-integrity gates are published.</p>
      ${detail ? `<p class="microcopy">${esc(detail)}</p>` : ""}
      <a class="btn btn-secondary" href="/" id="back-to-search">Back to search</a>
    </section>
  `;
  setNotFoundMetadata(slug);
  document.querySelector("#not-found-title")?.focus();
  announce("No published route was found. Research did not start.");
}

function renderResearchConsent(query) {
  el.result.hidden = false;
  el.result.innerHTML = `
    <section class="card unknown-panel" aria-labelledby="research-title">
      <p class="section-kicker">Not in the published Atlas</p>
      <h2 id="research-title" tabindex="-1">Research “${esc(query)}”?</h2>
      <p class="lede">This action sends the platform name through the project’s research workflow. Render Workflows, You.com, and OpenRouter may process it.</p>
      <p>The result remains a private draft until a maintainer reviews its identity, sources, fields, and selected route. Search suggestions do not start this process.</p>
      <button class="btn btn-primary" id="research-btn" type="button">Start research</button>
      <p class="research-status" id="research-status" role="status" aria-live="polite"></p>
    </section>
  `;
  document.querySelector("#research-btn")?.addEventListener("click", () => researchPlatform(query));
  document.querySelector("#research-title")?.focus();
  announce("Research consent is required. No research has started.");
}

function setResearchStatus(message) {
  const status = document.querySelector("#research-status");
  if (status) status.textContent = message;
  announce(message);
}

function renderResearchTerminal(query, heading, message, retry = true) {
  researchPending = false;
  el.result.innerHTML = `
    <section class="card unknown-panel" aria-labelledby="research-terminal-title">
      <p class="section-kicker">Research status</p>
      <h2 id="research-terminal-title" tabindex="-1">${esc(heading)}</h2>
      <p class="lede">${esc(message)}</p>
      ${retry ? '<button class="btn btn-secondary" id="research-btn" type="button">Try again</button>' : ""}
    </section>
  `;
  document.querySelector("#research-btn")?.addEventListener("click", () => researchPlatform(query));
  document.querySelector("#research-terminal-title")?.focus();
  announce(`${heading}. ${message}`);
}

const OUTCOME_MESSAGE = {
  identity_ambiguous: "The name matches multiple platforms. Choose a more specific name before retrying.",
  identity_unresolved: "The platform’s first-party identity could not be established.",
  no_official_source: "No accepted first-party documentation was found.",
  official_source_unusable: "The first-party documentation could not support a publishable route.",
  invalid_output: "The draft did not pass the required record schema.",
  claim_grounding_failed: "One or more route claims lacked accepted first-party evidence.",
  search_failed: "The documentation search provider was unavailable.",
  model_failed: "The reconstruction provider was unavailable.",
};

async function researchPlatform(query) {
  if (researchPending) {
    setResearchStatus("Research is already pending for this request.");
    return;
  }
  researchPending = true;
  const button = document.querySelector("#research-btn");
  if (button) button.disabled = true;
  setResearchStatus("Starting research…");
  try {
    const body = await api("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: query }),
    });
    if (body.data?.known) {
      researchPending = false;
      await showPlatform(body.data.slug);
      return;
    }
    if (!body.data?.runId) throw new Error("Research could not be started.");
    setResearchStatus(body.data.deduplicated ? "An existing research run is in progress…" : "Research is queued…");
    pollRunStatus(body.data.runId, query);
  } catch (error) {
    const rateLimited = error.status === 429;
    renderResearchTerminal(
      query,
      rateLimited ? "Research capacity reached" : "Research unavailable",
      error.message,
      true,
    );
  }
}

async function pollRunStatus(runId, query) {
  const token = ++activePoll;
  for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    if (token !== activePoll) return;
    try {
      const { data } = await api(`/api/research/${encodeURIComponent(runId)}`);
      if (data.phase === "completed" && data.result) {
        researchPending = false;
        if (data.result.outcome === "known") {
          await showPlatform(data.result.slug);
          return;
        }
        if (data.result.outcome === "review_required") {
          renderResearchTerminal(query, "Private draft ready for review", data.result.message, false);
          return;
        }
        renderResearchTerminal(
          query,
          "Research stopped safely",
          OUTCOME_MESSAGE[data.result.outcome] || data.result.message || "The draft did not pass a publication gate.",
          true,
        );
        return;
      }
      if (data.phase === "failed") {
        renderResearchTerminal(query, "Research failed", data.message || "The workflow failed safely.", true);
        return;
      }
      setResearchStatus(data.phase === "retrying" ? "A provider step is retrying…" : "Research is running…");
    } catch (error) {
      renderResearchTerminal(query, "Research status unavailable", error.message, true);
      return;
    }
  }
  researchPending = false;
  renderResearchTerminal(query, "Research is still running", "The browser stopped polling. You can safely retry later.", true);
}

async function submitQuery(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    announce("Enter a platform name.");
    return;
  }
  activePoll += 1;
  researchPending = false;
  cancelSuggestions();
  try {
    const { data } = await api(`/api/search?q=${encodeURIComponent(query)}`);
    const exact = data.find((row) => row.name.toLowerCase() === query.toLowerCase());
    if (exact) {
      await showPlatform(exact.slug);
      return;
    }
    if (data.length > 0) {
      await showPlatform(data[0].slug);
      return;
    }
    if (location.pathname !== "/") history.pushState(null, "", "/");
    renderResearchConsent(query);
  } catch (error) {
    el.result.hidden = false;
    el.result.innerHTML = `<div class="state-message" role="alert">${esc(error.message)}</div>`;
  }
}

function showLanding() {
  activePoll += 1;
  researchPending = false;
  cancelSuggestions();
  el.result.hidden = true;
  el.result.innerHTML = "";
  el.input.value = "";
  setRootMetadata();
  el.input.focus({ preventScroll: true });
}

function routeFromLocation() {
  const match = location.pathname.match(/^\/platform\/([^/]+)\/?$/);
  if (match) {
    showPlatform(decodeURIComponent(match[1]), { push: false, focus: false });
    return;
  }
  showLanding();
}

el.input.addEventListener("input", (event) => queueSearch(event.target.value));
el.input.addEventListener("blur", () => window.setTimeout(hideSuggestions, 150));
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    cancelSuggestions();
    return;
  }
  if (el.suggestions.hidden) return;
  if (event.key === "ArrowDown") {
    event.preventDefault();
    setActiveSuggestion(activeSuggestion + 1);
  } else if (event.key === "ArrowUp") {
    event.preventDefault();
    setActiveSuggestion(activeSuggestion - 1);
  } else if (event.key === "Enter" && activeSuggestion >= 0) {
    event.preventDefault();
    const choice = currentSuggestions[activeSuggestion];
    if (choice) showPlatform(choice.slug);
  }
});

el.suggestions.addEventListener("click", (event) => {
  const choice = event.target.closest(".suggestion");
  if (choice) showPlatform(choice.dataset.slug);
});

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuery(el.input.value);
});

window.addEventListener("popstate", routeFromLocation);

routeFromLocation();
