const el = {
  searchView: document.querySelector("#search-view"),
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  searchStatus: document.querySelector("#search-status"),
  searchResults: document.querySelector("#search-results"),
  searchError: document.querySelector("#search-error"),
  searchRetry: document.querySelector("#search-retry"),
  result: document.querySelector("#result"),
  status: document.querySelector("#global-status"),
};

let providers = [];
let providerCount = 0;
let activePoll = 0;
let researchPending = false;

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 160;
const DISCOVERY_SLUGS = [
  "stripe",
  "openai",
  "github",
  "google-gemini-api",
  "mistral-ai",
  "xai-api",
  "anthropic",
  "auth0",
  "twilio",
  "slack",
  "sentry",
  "render",
];

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
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

function setMeta(title, description, url = location.href) {
  document.title = title;
  document.querySelector('meta[name="description"]')?.setAttribute("content", description);
  document.querySelector('meta[property="og:title"]')?.setAttribute("content", title);
  document.querySelector('meta[property="og:description"]')?.setAttribute("content", description);
  document.querySelector('link[rel="canonical"]')?.setAttribute("href", url);
  document.querySelector('meta[property="og:url"]')?.setAttribute("content", url);
}

function setRootMetadata() {
  setMeta(
    "Developer Journey Atlas",
    "Search a developer platform and see the documented first-mile path from account creation to first success.",
    `${location.origin}/`,
  );
}

function setNotFoundMetadata(slug) {
  setMeta(
    "Route not reviewed | Developer Journey Atlas",
    "Research this platform to reconstruct the source-grounded first-mile path.",
    `${location.origin}/platform/${encodeURIComponent(slug)}`,
  );
}

function normalizeProvider(provider, published = false) {
  return {
    name: String(provider.name ?? ""),
    slug: String(provider.slug ?? ""),
    aliases: Array.isArray(provider.searchAliases) ? provider.searchAliases.map(String) : [],
    category: String(provider.category ?? ""),
    outcome: String(provider.outcome ?? ""),
    routeStatus: String(provider.routeStatus ?? (published ? "published" : "known_needs_review")),
    reviewReasons: Array.isArray(provider.reviewReasons) ? provider.reviewReasons.map(String) : [],
    published: published || provider.routeStatus === "published",
  };
}

function mergeProviders(catalog, corpus) {
  const merged = new Map();
  for (const provider of catalog) {
    if (provider.name && provider.slug) merged.set(provider.slug, normalizeProvider(provider));
  }
  for (const provider of corpus) {
    if (!provider.name || !provider.slug) continue;
    const current = merged.get(provider.slug);
    merged.set(provider.slug, {
      ...(current ?? normalizeProvider(provider)),
      name: provider.name,
      category: provider.category ?? current?.category ?? "",
      outcome: provider.outcome ?? current?.outcome ?? "",
      routeStatus: provider.routeStatus ?? current?.routeStatus ?? "known_needs_review",
      reviewReasons: provider.reviewReasons ?? current?.reviewReasons ?? [],
      published: provider.routeStatus === "published",
    });
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

async function loadProviders() {
  el.searchError.hidden = true;
  el.searchStatus.textContent = "Loading platforms...";
  try {
    const publishedResponse = await fetch("/api/platforms?include=all");
    if (!publishedResponse.ok) throw new Error("Platform search failed.");
    const published = await publishedResponse.json();
    const catalogProviders = [];
    providers = mergeProviders(catalogProviders, Array.isArray(published?.data) ? published.data : []);
    providerCount = Number(published?.meta?.count ?? providers.length);
    if (!providers.length) throw new Error("Platform search is empty.");
    renderMatches();
  } catch {
    providers = [];
    providerCount = 0;
    el.searchResults.hidden = true;
    el.searchError.hidden = false;
    el.searchStatus.textContent = "";
  }
}

function discoveryProviders() {
  const bySlug = new Map(providers.map((provider) => [provider.slug, provider]));
  const selected = DISCOVERY_SLUGS.map((slug) => bySlug.get(slug)).filter(Boolean);
  if (selected.length >= 8) return selected;
  const selectedSlugs = new Set(selected.map((provider) => provider.slug));
  return [
    ...selected,
    ...providers.filter((provider) => !selectedSlugs.has(provider.slug)).slice(0, 12 - selected.length),
  ];
}

function matchesFor(query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return discoveryProviders();
  return providers.filter((provider) =>
    `${provider.name} ${provider.slug} ${provider.aliases.join(" ")}`.toLowerCase().includes(normalized)
  ).slice(0, 10);
}

function providerResult(provider) {
  return `
    <li>
      <button type="button" data-provider="${esc(provider.slug)}">
        <span>${esc(provider.name)}</span>
      </button>
    </li>
  `;
}

function renderMatches() {
  if (!providers.length) return;
  const query = el.input.value.trim();
  const matches = matchesFor(query);
  el.searchResults.innerHTML = matches.map(providerResult).join("");
  el.searchResults.hidden = matches.length === 0;
  if (!query) {
    el.searchStatus.textContent = `${providerCount || providers.length} platforms loaded. Pick one or type to search.`;
  } else if (matches.length) {
    el.searchStatus.textContent = `${matches.length} match${matches.length === 1 ? "" : "es"}`;
  } else {
    el.searchStatus.textContent = `No saved platform for "${query}". You can research it.`;
  }
}

function showSearch() {
  activePoll += 1;
  researchPending = false;
  document.body.classList.remove("detail-page");
  el.searchView.hidden = false;
  el.result.hidden = true;
  el.result.innerHTML = "";
  setRootMetadata();
}

function showResultSurface() {
  document.body.classList.add("detail-page");
  el.searchView.hidden = true;
  el.result.hidden = false;
}

function pushPlatformRoute(slug) {
  const target = `/platform/${encodeURIComponent(slug)}`;
  if (location.pathname !== target) history.pushState({ slug }, "", target);
}

function backLink() {
  return '<a class="back-link" href="/">← Search</a>';
}

function compactSteps(steps) {
  if (!Array.isArray(steps) || !steps.length) return '<p>No steps are available yet.</p>';
  return `
    <ol class="steps">
      ${steps.map((step) => `
        <li>
          <p>${esc(step.action)}</p>
          ${step.successSignal ? `<small>${esc(step.successSignal)}</small>` : ""}
          ${Array.isArray(step.requiredFields) && step.requiredFields.length ? `
            <ul class="field-list">
              ${step.requiredFields.map((field) => `<li>${esc(field.label)}${field.required === false ? " (optional)" : ""}</li>`).join("")}
            </ul>
          ` : ""}
          ${Array.isArray(step.frictionGates) && step.frictionGates.length ? `
            <ul class="gate-list">
              ${step.frictionGates.map((gate) => `<li>${esc(gate.description)}</li>`).join("")}
            </ul>
          ` : ""}
        </li>
      `).join("")}
    </ol>
  `;
}

function renderComplexity(complexity) {
  if (!complexity?.dimensions) return "";
  const d = complexity.dimensions;
  const items = [
    ["Actions", d.requiredActions],
    ["Fields", d.requiredFields],
    ["Choices", d.decisionPoints],
    ["Gates", d.documentedExternalGates],
    ["Waits", d.unavoidableWaits],
  ];
  return `
    <section class="complexity-panel" aria-label="Documented complexity">
      <div>
        <p class="state-label">Complexity</p>
        <h2>${esc(complexity.rating)} (${esc(complexity.score)})</h2>
        <p>${esc(complexity.note)}</p>
      </div>
      <dl>
        ${items.map(([label, value]) => `<div><dt>${esc(label)}</dt><dd>${esc(value)}</dd></div>`).join("")}
      </dl>
    </section>
  `;
}

function sourceLinks(sources) {
  if (!Array.isArray(sources) || !sources.length) return "<p>No sources are available.</p>";
  const links = sources.map((source) => {
    const url = safeHttpUrl(source.url);
    return url
      ? `<li><a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(source.title)}</a></li>`
      : `<li>${esc(source.title)}</li>`;
  }).join("");
  return `<ul class="source-list">${links}</ul>`;
}

/** Banner shown above a saved route that has not passed maintainer review. */
function draftNotice() {
  return `
    <div class="draft-notice" role="note">
      <p>This route was built from official documentation by an automated research run. A maintainer has not reviewed it, and it is not part of the published corpus.</p>
    </div>
  `;
}

function renderJourney(journey, review = {}) {
  const isDraft = review.reviewStatus === "unreviewed_draft";
  const startUrl = safeHttpUrl(journey.startingUrl);
  const firstSuccess = journey.routeScope?.firstSuccess || journey.outcome || "First successful API response";
  const selectedPath = journey.routeScope?.selectedPath || "Follow the documented setup route below.";
  const prerequisites = Array.isArray(journey.prerequisites) && journey.prerequisites.length
    ? `<ul>${journey.prerequisites.map((item) => `<li>${esc(item.requirement)}</li>`).join("")}</ul>`
    : "<p>None documented.</p>";
  return `
    <article class="journey${isDraft ? " draft" : ""}" data-platform-slug="${esc(journey.slug)}">
      ${backLink()}
      <p class="state-label">${isDraft ? "Research draft" : "Reviewed guide"}</p>
      <h1 id="result-title" tabindex="-1">${esc(journey.name)}</h1>
      <p class="result-lede">${esc(firstSuccess)}</p>
      ${isDraft ? draftNotice() : ""}
      ${startUrl ? `<a class="btn btn-primary start-link" href="${esc(startUrl)}" target="_blank" rel="noopener noreferrer">Open official guide</a>` : ""}

      ${renderComplexity(journey.complexity)}

      <section>
        <h2>Path</h2>
        <p>${esc(selectedPath)}</p>
        ${compactSteps(journey.steps)}
      </section>

      <details>
        <summary>Before you start</summary>
        ${prerequisites}
      </details>

      <details id="official-evidence">
        <summary>Official sources</summary>
        <div id="official-evidence-content"><p>Open to load sources.</p></div>
      </details>

      <details id="peer-comparison">
        <summary>Domain comparison</summary>
        <div id="peer-comparison-content"><p>Open to load compatible peers.</p></div>
      </details>
    </article>
  `;
}

async function loadOfficialEvidence(slug) {
  const mount = document.querySelector("#official-evidence-content");
  if (!mount) return;
  mount.innerHTML = "<p>Loading sources…</p>";
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/evidence?include=all`);
    mount.innerHTML = sourceLinks(data.sources);
  } catch {
    mount.innerHTML = "<p>Sources could not be loaded.</p>";
  }
}

function wireJourney(journey) {
  const disclosure = document.querySelector("#official-evidence");
  disclosure?.addEventListener("toggle", () => {
    if (disclosure.open && disclosure.dataset.loaded !== "true") {
      disclosure.dataset.loaded = "true";
      loadOfficialEvidence(journey.slug);
    }
  });
  const comparison = document.querySelector("#peer-comparison");
  comparison?.addEventListener("toggle", () => {
    if (comparison.open && comparison.dataset.loaded !== "true") {
      comparison.dataset.loaded = "true";
      loadPeerComparison(journey.slug);
    }
  });
}

function renderPeerComparison(comparison) {
  if (!comparison?.available) {
    return `
      <p>${esc(comparison?.note ?? "Comparison is not available yet.")}</p>
      <p class="trust-note">${esc(comparison?.qualifiedPeerCount ?? 0)} of ${esc(comparison?.requiredPeerCount ?? 3)} compatible peers are ready.</p>
    `;
  }
  return `
    <p>${esc(comparison.note)}</p>
    <ul class="comparison-list">
      ${comparison.dimensions.map((item) => `
        <li>
          <span>${esc(item.label)}</span>
          <strong>${esc(item.subjectValue)}</strong>
          <small>peer median ${esc(item.peerMedian)}, range ${esc(item.peerMinimum)}-${esc(item.peerMaximum)}</small>
        </li>
      `).join("")}
    </ul>
  `;
}

async function loadPeerComparison(slug) {
  const mount = document.querySelector("#peer-comparison-content");
  if (!mount) return;
  mount.innerHTML = "<p>Loading comparison...</p>";
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/peer-comparison`);
    mount.innerHTML = renderPeerComparison(data);
  } catch {
    mount.innerHTML = "<p>Comparison could not be loaded.</p>";
  }
}

async function showPlatform(slug, { push = true, focus = true } = {}) {
  activePoll += 1;
  researchPending = false;
  showResultSurface();
  if (push) pushPlatformRoute(slug);
  el.result.innerHTML = '<div class="compact-state" role="status">Loading guide…</div>';
  try {
    // include=all so a durable research draft resolves too; the response tells
    // us whether it is published or still awaiting review.
    const { data, meta } = await api(`/api/platforms/${encodeURIComponent(slug)}/journey?include=all`);
    el.result.innerHTML = renderJourney(data, meta ?? {});
    wireJourney(data);
    setMeta(
      `${data.name} API setup | Developer Journey Atlas`,
      `See ${data.name}'s documented first-mile path.`,
      location.href,
    );
    announce(`${data.name} guide loaded.`);
    if (focus) document.querySelector("#result-title")?.focus();
  } catch {
    const provider = providers.find((candidate) => candidate.slug === slug);
    if (provider) {
      renderResearchOffer(provider.name, slug, provider);
      return;
    }
    try {
      const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}?include=all`);
      renderResearchOffer(data.name ?? slug, slug, data);
    } catch {
      renderResearchOffer(slug, slug);
    }
  }
}

function renderResearchOffer(name, slug = "", provider = null) {
  activePoll += 1;
  researchPending = false;
  showResultSurface();
  const known = provider?.routeStatus && provider.routeStatus !== "unknown";
  el.result.innerHTML = `
    <section class="research-card">
      ${backLink()}
      <p class="state-label">${known ? "Not mapped yet" : "New platform"}</p>
      <h1 id="result-title" tabindex="-1">${esc(name)}</h1>
      <p class="result-lede">${known
        ? "We know this platform belongs in the atlas. The step-by-step first-mile path still needs to be built from official docs."
        : "Build a first-mile path from official docs."}</p>
      ${provider?.outcome ? `<p class="trust-note">First goal: ${esc(provider.outcome)}</p>` : ""}
      <p class="trust-note">The draft will show the steps, fields, gates, and sources here.</p>
      <button class="btn btn-primary" id="research-btn" type="button">${known ? "Build path from docs" : "Start research"}</button>
      <p class="status-line" id="research-status" role="status" aria-live="polite"></p>
    </section>
  `;
  document.querySelector("#research-btn")?.addEventListener("click", () => researchPlatform(name));
  setNotFoundMetadata(slug || name);
  document.querySelector("#result-title")?.focus();
  announce(`${name} is ready for research.`);
}

function setResearchStatus(message) {
  const status = document.querySelector("#research-status");
  if (status) status.textContent = message;
  announce(message);
}

function renderResearchFailure(query, heading, message, retry = true) {
  researchPending = false;
  showResultSurface();
  el.result.innerHTML = `
    <section class="research-card">
      ${backLink()}
      <p class="state-label">Research</p>
      <h1 id="result-title" tabindex="-1">${esc(heading)}</h1>
      <p class="result-lede">${esc(message)}</p>
      ${retry ? '<button class="btn btn-secondary" id="research-btn" type="button">Try again</button>' : ""}
    </section>
  `;
  document.querySelector("#research-btn")?.addEventListener("click", () => researchPlatform(query));
  document.querySelector("#result-title")?.focus();
  announce(`${heading}. ${message}`);
}

function renderResearchDraft(result) {
  const draft = result.draft;
  const startUrl = safeHttpUrl(draft.startingUrl);
  showResultSurface();
  el.result.innerHTML = `
    <article class="journey draft" data-platform-slug="${esc(draft.slug)}">
      ${backLink()}
      <p class="state-label">Research draft</p>
      <h1 id="result-title" tabindex="-1">${esc(draft.name)}</h1>
      <p class="result-lede">${esc(draft.firstSuccess)}</p>
      ${draft.successSignal ? `<p class="success-signal">Done when: ${esc(draft.successSignal)}</p>` : ""}
      ${startUrl ? `<a class="btn btn-primary start-link" href="${esc(startUrl)}" target="_blank" rel="noopener noreferrer">Open official guide</a>` : ""}

      ${renderComplexity(draft.complexity)}

      <section>
        <h2>Path</h2>
        ${compactSteps(draft.steps)}
      </section>

      ${Array.isArray(draft.prerequisites) && draft.prerequisites.length ? `
        <details>
          <summary>Before you start</summary>
          <ul>${draft.prerequisites.map((item) => `<li>${esc(item.requirement)}</li>`).join("")}</ul>
        </details>
      ` : ""}

      <details>
        <summary>Official sources</summary>
        ${sourceLinks(draft.sources)}
      </details>
      <p class="trust-note">Saved privately for maintainer review.</p>
    </article>
  `;
  setMeta(
    `${draft.name} research draft | Developer Journey Atlas`,
    `A source-grounded draft path for ${draft.name}.`,
    location.href,
  );
  document.querySelector("#result-title")?.focus();
  announce(`${draft.name} research draft ready.`);
}

const OUTCOME_MESSAGE = {
  identity_ambiguous: ["Use a more specific name", "That name matches more than one platform.", false],
  identity_unresolved: ["Platform not confirmed", "We could not confirm the official platform.", false],
  no_official_source: ["No official guide found", "We could not find usable first-party setup documentation.", false],
  official_source_unusable: ["Official docs were not enough", "The pages did not contain enough detail to build the path.", false],
  invalid_output: ["Draft failed validation", "The draft missed required journey fields or contradicted the record schema.", true],
  claim_grounding_failed: ["Evidence check failed", "At least one action, field, option, gate, or edge was not supported by an accepted official source.", true],
  search_failed: ["Docs search is unavailable", "Try the research again.", true],
  model_failed: ["Route builder is unavailable", "Try the research again.", true],
};

async function researchPlatform(query) {
  if (researchPending) return;
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
      await showPlatform(body.data.slug);
      return;
    }
    if (body.data?.result?.outcome === "draft_ready" && body.data.result.draft) {
      researchPending = false;
      renderResearchDraft(body.data.result);
      return;
    }
    if (!body.data?.runId) throw new Error("Research could not be started.");
    setResearchStatus("Researching official docs. This usually takes about a minute.");
    pollRunStatus(body.data.runId, query);
  } catch (error) {
    renderResearchFailure(query, "Research unavailable", error.message, true);
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
        if (data.result.outcome === "draft_ready" && data.result.draft) {
          renderResearchDraft(data.result);
          return;
        }
        const [heading, message, retry] = OUTCOME_MESSAGE[data.result.outcome]
          ?? ["Research could not finish", "The available evidence was not enough.", false];
        renderResearchFailure(query, heading, message, retry);
        return;
      }
      if (data.phase === "failed") {
        renderResearchFailure(query, "Research failed", data.message || "Try again.", true);
        return;
      }
      setResearchStatus(data.phase === "retrying"
        ? "A research step is retrying…"
        : "Researching official docs. This usually takes about a minute.");
    } catch (error) {
      renderResearchFailure(query, "Research status unavailable", error.message, true);
      return;
    }
  }
  researchPending = false;
  renderResearchFailure(query, "Research is still running", "Return later and try again.", true);
}

async function submitQuery(rawQuery) {
  const query = rawQuery.trim();
  if (!query) {
    el.searchStatus.textContent = "Enter a platform name.";
    el.input.focus();
    return;
  }
  const matches = matchesFor(query);
  const exact = matches.find((provider) =>
    provider.name.toLowerCase() === query.toLowerCase()
    || provider.slug.toLowerCase() === query.toLowerCase()
    || provider.aliases.some((alias) => alias.toLowerCase() === query.toLowerCase())
  );
  if (exact || matches.length === 1) {
    await showPlatform((exact ?? matches[0]).slug);
    return;
  }
  if (matches.length > 1) {
    el.searchResults.hidden = false;
    el.searchStatus.textContent = "Choose a platform below.";
    el.searchResults.querySelector("button")?.focus();
    return;
  }
  const slug = query.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug) pushPlatformRoute(slug);
  renderResearchOffer(query, slug);
}

function routeFromLocation() {
  const match = location.pathname.match(/^\/platform\/([^/]+)\/?$/);
  if (match) {
    showPlatform(decodeURIComponent(match[1]), { push: false, focus: false });
    return;
  }
  showSearch();
}

el.input.addEventListener("input", renderMatches);
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    el.input.value = "";
    renderMatches();
  }
});

el.searchResults.addEventListener("click", (event) => {
  const button = event.target.closest("[data-provider]");
  if (button) showPlatform(button.dataset.provider);
});

el.searchRetry.addEventListener("click", loadProviders);
el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuery(el.input.value);
});
window.addEventListener("popstate", routeFromLocation);

loadProviders().finally(routeFromLocation);
