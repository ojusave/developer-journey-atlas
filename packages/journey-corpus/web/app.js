const el = {
  hero: document.querySelector("#home-hero"),
  catalogShell: document.querySelector("#catalog-shell"),
  catalogProviderCount: document.querySelector("#catalog-provider-count"),
  catalogTypeCount: document.querySelector("#catalog-type-count"),
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  clearSearch: document.querySelector("#clear-search"),
  filters: document.querySelector(".catalog-filters"),
  cohortGuide: document.querySelector("#cohort-guide-list"),
  providerList: document.querySelector("#provider-list"),
  providerListTitle: document.querySelector("#provider-list-title"),
  catalogStatus: document.querySelector("#catalog-status"),
  catalogEmpty: document.querySelector("#catalog-empty"),
  emptyClear: document.querySelector("#empty-clear"),
  researchUnknown: document.querySelector("#research-unknown"),
  catalogError: document.querySelector("#catalog-error"),
  catalogRetry: document.querySelector("#catalog-retry"),
  result: document.querySelector("#result"),
  status: document.querySelector("#global-status"),
};

let llmCatalog = null;
let activeCohort = "all";
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

function showHomeSurface() {
  document.body.classList.remove("route-page");
  el.hero.hidden = false;
  el.catalogShell.hidden = false;
}

function hideHomeSurface() {
  document.body.classList.add("route-page");
  el.hero.hidden = true;
  el.catalogShell.hidden = true;
}

function allCatalogProviders() {
  return llmCatalog?.cohorts.flatMap((cohort) => cohort.providers) ?? [];
}

function cohortForProvider(provider) {
  return llmCatalog?.cohorts.find((cohort) => cohort.id === provider.cohortId) ?? null;
}

function renderCohortGuide() {
  if (!llmCatalog) return;
  el.cohortGuide.innerHTML = llmCatalog.cohorts.map((cohort) => `
    <div>
      <dt>${esc(cohort.label)}</dt>
      <dd>${esc(cohort.description)}</dd>
    </div>
  `).join("");
}

function providerItem(provider) {
  const cohort = cohortForProvider(provider);
  const action = provider.routeStatus === "published" && provider.routeUrl
    ? `<a class="provider-action" href="/platform/${encodeURIComponent(provider.slug)}">Open reviewed guide</a>`
    : `<a class="provider-action" href="/platform/${encodeURIComponent(provider.slug)}">View provider status</a>`;
  const status = provider.routeStatus === "published"
    ? '<span class="provider-status status-published"><span aria-hidden="true"></span>Guide available</span>'
    : '<span class="provider-status status-review"><span aria-hidden="true"></span>In the catalog</span>';
  return `
    <li class="provider-item" data-provider-slug="${esc(provider.slug)}" tabindex="-1">
      <div class="provider-name">
        <strong>${esc(provider.name)}</strong>
        <span>${esc(cohort?.shortLabel ?? provider.providerType)}</span>
      </div>
      <div class="provider-state">
        ${status}
        ${action}
      </div>
    </li>
  `;
}

function filteredProviders() {
  const query = el.input.value.trim().toLowerCase();
  return allCatalogProviders().filter((provider) => {
    const matchesCohort = activeCohort === "all" || provider.cohortId === activeCohort;
    const matchesQuery = !query || `${provider.name} ${provider.providerType} ${provider.cohortLabel} ${(provider.searchAliases ?? []).join(" ")}`
      .toLowerCase()
      .includes(query);
    return matchesCohort && matchesQuery;
  });
}

function renderCatalog() {
  if (!llmCatalog) return;
  const providers = filteredProviders();
  const selectedCohort = llmCatalog.cohorts.find((cohort) => cohort.id === activeCohort);
  const query = el.input.value.trim();
  el.providerListTitle.textContent = selectedCohort?.label ?? "All providers";
  el.providerList.innerHTML = providers.map(providerItem).join("");
  el.providerList.hidden = providers.length === 0;
  el.catalogEmpty.hidden = providers.length !== 0;
  el.clearSearch.hidden = query.length === 0;
  document.querySelectorAll("[data-cohort-count]").forEach((count) => {
    const cohortId = count.dataset.cohortCount;
    count.textContent = cohortId === "all"
      ? String(allCatalogProviders().length)
      : String(llmCatalog.cohorts.find((cohort) => cohort.id === cohortId)?.providers.length ?? 0);
  });
  el.catalogStatus.textContent = providers.length === allCatalogProviders().length && !query
    ? `${providers.length} providers shown. Setup-guide reviews are in progress.`
    : `${providers.length} provider${providers.length === 1 ? "" : "s"} shown.`;
}

function setCohort(cohortId) {
  activeCohort = cohortId;
  document.querySelectorAll(".filter-button").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.cohort === cohortId));
  });
  renderCatalog();
}

function clearCatalogSearch({ focus = true } = {}) {
  el.input.value = "";
  setCohort("all");
  if (focus) el.input.focus();
}

async function loadCatalog() {
  el.catalogError.hidden = true;
  el.catalogStatus.textContent = "Loading the provider catalog…";
  try {
    const response = await fetch("/data/llm-api-catalog.json");
    if (!response.ok) throw new Error(`Catalog request failed (${response.status}).`);
    const catalog = await response.json();
    if (
      !catalog
      || !Array.isArray(catalog.cohorts)
      || !catalog.cohorts.every((cohort) => Array.isArray(cohort.providers))
    ) {
      throw new Error("Catalog data is incomplete.");
    }
    const catalogProviders = catalog.cohorts.flatMap((cohort) => cohort.providers);
    if (
      catalog.providerCount !== catalogProviders.length
      || new Set(catalogProviders.map((provider) => provider.slug)).size !== catalog.providerCount
    ) {
      throw new Error("Catalog provider counts are inconsistent.");
    }
    llmCatalog = catalog;
    el.catalogProviderCount.textContent = String(catalog.providerCount);
    el.catalogTypeCount.textContent = String(catalog.cohorts.length);
    renderCohortGuide();
    renderCatalog();
  } catch {
    llmCatalog = null;
    el.providerList.hidden = true;
    el.catalogEmpty.hidden = true;
    el.catalogError.hidden = false;
    el.catalogStatus.textContent = "Provider catalog unavailable.";
  }
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
      <h2 id="route-overview-title">The path in plain language</h2>
      <dl>
        <div>
          <dt>What you will do</dt>
          <dd>${esc(scope.selectedPath)}</dd>
        </div>
        <div>
          <dt>Use this path when</dt>
          <dd>${esc(scope.bestFit)}</dd>
        </div>
        <div>
          <dt>You are done when</dt>
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
      <summary>How Atlas decides which routes can be compared</summary>
      <ul>${criteria.map((criterion) => `<li>${esc(criterion)}</li>`).join("")}</ul>
    </details>
  `;
}

function renderUnavailableComparison(comparison, failed = false) {
  return `
    <h2 id="peer-comparison-title" class="visually-hidden">Provider comparison</h2>
    <details class="comparison-unavailable">
      <summary>${failed ? "Comparison could not be checked" : "Why no provider comparison is shown yet"}</summary>
      <p>${esc(
        failed
          ? "The comparison service did not respond. The reviewed setup guide above is still available."
          : "Atlas waits until at least three similar setup guides pass review. This prevents unlike provider types or different finish lines from being compared.",
      )}</p>
      ${comparisonCriteria(comparison.criteria)}
      ${failed ? '<button class="btn btn-secondary comparison-retry" type="button">Try comparison again</button>' : ""}
    </details>
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
        <h2 id="peer-comparison-title">Compare with reviewed providers</h2>
        <p class="comparison-state">Only similar start states, finish lines, and route detail are included.</p>
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
        <h2 id="prerequisites-title">What you need before starting</h2>
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
        <summary>Open the full ${esc(journey.steps.length)}-event walkthrough</summary>
        <p class="route-details-note">Each action, choice, wait, and result stays separate so you can follow the sequence.</p>
        <ol class="steps-list">${journey.steps.map(stepItem).join("")}</ol>
      </details>
    `
    : '<p>No published route is available.</p>';
  return `
    <article class="card journey-card" data-platform-slug="${esc(journey.slug)}">
      <a class="back-link" href="/">← Browse LLM APIs</a>
      <div class="assess-head">
        <div>
          <p class="section-kicker">Reviewed setup guide</p>
          <h1 tabindex="-1" id="journey-title">${esc(journey.name)}</h1>
        </div>
        <span class="pill pill-cat">${esc(journey.category)}</span>
      </div>
      <p class="lede">Follow one reviewed path from account creation to a working result. Open the official starting point when you are ready to begin.</p>
      ${routeOverview(journey.routeScope)}
      ${prerequisites}
      <div class="result-actions">
        ${journey.startingUrl ? `<a class="btn btn-primary" id="official-start" href="${esc(journey.startingUrl)}" target="_blank" rel="noopener noreferrer">Open official starting point</a>` : ""}
        <button class="btn btn-secondary" type="button" id="share-route">Copy share link</button>
        <a class="btn btn-secondary" id="correct-route" href="${esc(correctionUrl(journey))}" target="_blank" rel="noopener noreferrer">Suggest a correction</a>
      </div>
      <p class="copy-status" id="copy-status" role="status" aria-live="polite"></p>
      <section class="peer-comparison" id="peer-comparison" aria-labelledby="peer-comparison-title" aria-busy="true">
        <p class="comparison-loading">Checking whether a fair provider comparison is ready…</p>
      </section>
      <details class="official-evidence" id="official-evidence">
        <summary>View official evidence</summary>
        <div id="official-evidence-content"></div>
      </details>
      <h2 class="steps-heading">Step-by-step walkthrough</h2>
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
  const title = "Explore 25 LLM APIs | Developer Journey Atlas";
  const description = "Browse 25 LLM API providers by setup model and see which step-by-step guides have passed independent review.";
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

function setReviewPendingMetadata(provider) {
  const title = `${provider.name} setup guide under review | Developer Journey Atlas`;
  const description = `${provider.name} is in the LLM API research catalog. Its step-by-step setup guide has not passed independent review yet.`;
  const canonicalUrl = `${location.origin}/platform/${encodeURIComponent(provider.slug)}`;
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
  hideHomeSurface();
  if (push) pushPlatformRoute(slug);
  el.result.hidden = false;
  el.result.innerHTML = '<div class="state-message" role="status">Loading the setup guide…</div>';
  try {
    const { data } = await api(`/api/platforms/${encodeURIComponent(slug)}/journey`);
    el.result.innerHTML = renderJourney(data);
    wireJourneyActions(data);
    setClientMetadata(data);
    announce(`${data.name} documented route loaded.`);
    if (focus) document.querySelector("#journey-title")?.focus();
    loadPeerComparison(data.slug);
  } catch (error) {
    const provider = allCatalogProviders().find((candidate) => candidate.slug === slug);
    if (provider) {
      renderReviewPending(provider);
      return;
    }
    renderNotFound(slug, error.message);
  }
}

function renderReviewPending(provider) {
  const cohort = cohortForProvider(provider);
  el.result.hidden = false;
  el.result.innerHTML = `
    <article class="card review-pending-card">
      <a class="back-link" href="/">← Browse all LLM APIs</a>
      <p class="section-kicker">In the research catalog</p>
      <h1 id="review-pending-title" tabindex="-1">${esc(provider.name)}</h1>
      <p class="review-heading">The step-by-step setup guide is still under review.</p>
      <p>Atlas has a research record for this provider, but a person has not yet approved the complete path from account creation to the first authenticated model response.</p>
      <dl class="review-facts">
        <div>
          <dt>Provider type</dt>
          <dd>${esc(cohort?.label ?? provider.providerType)}</dd>
        </div>
        <div>
          <dt>Available now</dt>
          <dd>Provider identity in the 25-provider research catalog</dd>
        </div>
        <div>
          <dt>Withheld until review</dt>
          <dd>Setup steps, route counts, and provider comparisons</dd>
        </div>
      </dl>
      <details class="review-method">
        <summary>What must happen before the guide appears?</summary>
        <ol>
          <li>Confirm the provider and its official documentation.</li>
          <li>Separate every required action, choice, wait, and result.</li>
          <li>Confirm where the first successful model response occurs.</li>
          <li>Have an independent reviewer approve the route.</li>
        </ol>
      </details>
    </article>
  `;
  setReviewPendingMetadata(provider);
  document.querySelector("#review-pending-title")?.focus();
  announce(`${provider.name} is in the catalog. Its setup guide review is in progress.`);
}

function renderNotFound(slug, detail = "") {
  el.result.hidden = false;
  el.result.innerHTML = `
    <section class="card unknown-panel" aria-labelledby="not-found-title">
      <a class="back-link" href="/">← Browse all LLM APIs</a>
      <p class="section-kicker">Not in the current catalog</p>
      <h1 id="not-found-title" tabindex="-1">We do not have “${esc(slug)}” yet</h1>
      <p class="lede">Browse the 25 listed providers, or return home and search with a more specific provider name.</p>
      ${detail ? `<p class="microcopy">${esc(detail)}</p>` : ""}
      <a class="btn btn-primary" href="/" id="back-to-search">Browse the provider catalog</a>
    </section>
  `;
  setNotFoundMetadata(slug);
  document.querySelector("#not-found-title")?.focus();
  announce("No published route was found. Research did not start.");
}

function renderResearchConsent(query) {
  showHomeSurface();
  el.result.hidden = false;
  el.result.innerHTML = `
    <section class="card unknown-panel" aria-labelledby="research-title">
      <p class="section-kicker">Separate research request</p>
      <h2 id="research-title" tabindex="-1">Research “${esc(query)}”?</h2>
      <p class="lede">This sends only the provider name to Render Workflows, You.com, and OpenRouter so the project can look for official documentation.</p>
      <p>The result stays private until a maintainer reviews the provider identity, official sources, required actions, and first successful response. Nothing is sent until you choose Start research.</p>
      <button class="btn btn-primary" id="research-btn" type="button">Start research for “${esc(query)}”</button>
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
      <p class="section-kicker">Provider research</p>
      <h2 id="research-terminal-title" tabindex="-1">${esc(heading)}</h2>
      <p class="lede">${esc(message)}</p>
      <p>Nothing was added to the public catalog without a complete review.</p>
      <div class="research-actions">
        ${retry ? '<button class="btn btn-secondary" id="research-btn" type="button">Try this research again</button>' : ""}
        <a class="btn btn-primary" href="/#catalog-shell">Browse the 25 providers</a>
      </div>
    </section>
  `;
  document.querySelector("#research-btn")?.addEventListener("click", () => researchPlatform(query));
  document.querySelector("#research-terminal-title")?.focus();
  announce(`${heading}. ${message}`);
}

const OUTCOME_MESSAGE = {
  identity_ambiguous: {
    heading: "We need a more specific provider name",
    message: "That name can refer to more than one platform. Return to the directory and search with the organization or API name.",
    retry: false,
  },
  identity_unresolved: {
    heading: "We could not confirm the provider",
    message: "We could not establish which official organization and documentation belong to that name.",
    retry: false,
  },
  no_official_source: {
    heading: "No official setup documentation was found",
    message: "We could not find first-party documentation that supports a reliable setup guide.",
    retry: false,
  },
  official_source_unusable: {
    heading: "The official documentation was not enough",
    message: "The pages we found did not contain enough usable detail to build a complete setup guide.",
    retry: false,
  },
  invalid_output: {
    heading: "We could not build a reliable guide",
    message: "We found documentation, but the resulting setup path was incomplete or internally inconsistent.",
    retry: false,
  },
  claim_grounding_failed: {
    heading: "The setup path could not be verified",
    message: "At least one required action was not supported by the accepted official documentation.",
    retry: false,
  },
  search_failed: {
    heading: "Official documentation search is temporarily unavailable",
    message: "The provider that searches official documentation did not respond. Your provider name is still here, so you can retry.",
    retry: true,
  },
  model_failed: {
    heading: "Guide reconstruction is temporarily unavailable",
    message: "The provider that turns official documentation into a draft guide did not respond. You can retry without re-entering the provider name.",
    retry: true,
  },
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
          renderResearchTerminal(
            query,
            "Research collected, human review is next",
            "Official documentation was collected into a private draft. The provider will remain out of the public catalog until a maintainer verifies the complete setup path.",
            false,
          );
          return;
        }
        const outcome = OUTCOME_MESSAGE[data.result.outcome];
        renderResearchTerminal(
          query,
          outcome?.heading ?? "We could not finish this provider review",
          outcome?.message ?? "The available evidence was not enough to build a reliable public setup guide.",
          outcome?.retry ?? false,
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
    announce("Enter an LLM API provider name.");
    return;
  }
  if (!llmCatalog) {
    el.catalogError.hidden = false;
    el.catalogStatus.textContent = "Provider catalog unavailable.";
    announce("The provider catalog is unavailable. Try loading it again.");
    return;
  }
  renderCatalog();
  const providers = filteredProviders();
  const exact = providers.find((provider) => provider.name.toLowerCase() === query.toLowerCase());
  const selectedProvider = exact ?? (providers.length === 1 ? providers[0] : null);
  if (selectedProvider) {
    await showPlatform(selectedProvider.slug);
    return;
  }
  announce(providers.length
    ? `${providers.length} matching providers are shown.`
    : "No provider matches that search. Research has not started.");
}

function showLanding() {
  activePoll += 1;
  researchPending = false;
  showHomeSurface();
  el.result.hidden = true;
  el.result.innerHTML = "";
  setRootMetadata();
  if (!llmCatalog) loadCatalog();
}

function routeFromLocation() {
  const match = location.pathname.match(/^\/platform\/([^/]+)\/?$/);
  if (match) {
    showPlatform(decodeURIComponent(match[1]), { push: false, focus: false });
    return;
  }
  showLanding();
}

el.input.addEventListener("input", renderCatalog);
el.input.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && el.input.value) {
    clearCatalogSearch();
    announce("Search cleared. All 25 providers are shown.");
  }
});

el.filters.addEventListener("click", (event) => {
  const filter = event.target.closest(".filter-button");
  if (!filter) return;
  setCohort(filter.dataset.cohort);
  announce(`${filter.textContent.trim()} filter selected.`);
});

el.clearSearch.addEventListener("click", () => {
  clearCatalogSearch();
  announce("Search cleared. All 25 providers are shown.");
});

el.emptyClear.addEventListener("click", () => {
  clearCatalogSearch();
  announce("All 25 providers are shown.");
});

el.researchUnknown.addEventListener("click", () => {
  const query = el.input.value.trim();
  if (query) renderResearchConsent(query);
});

el.catalogRetry.addEventListener("click", loadCatalog);

el.form.addEventListener("submit", (event) => {
  event.preventDefault();
  submitQuery(el.input.value);
});

window.addEventListener("popstate", routeFromLocation);

loadCatalog().finally(routeFromLocation);
