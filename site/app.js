const elements = {
  search: document.querySelector("#search"),
  category: document.querySelector("#category"),
  sort: document.querySelector("#sort"),
  results: document.querySelector("#results"),
  resultCount: document.querySelector("#result-count"),
  platformCount: document.querySelector("#platform-count"),
  stepCount: document.querySelector("#step-count"),
  sourceCount: document.querySelector("#source-count"),
};

let routes = [];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(Number(value) || 0);
}

function populateCategories(rows) {
  const categories = [...new Set(rows.map((row) => row.category).filter(Boolean))].sort();
  for (const category of categories) {
    const option = document.createElement("option");
    option.value = category;
    option.textContent = category;
    elements.category.append(option);
  }
}

function compareRows(a, b, mode) {
  if (mode === "steps") return a.developer_action_count - b.developer_action_count || a.name.localeCompare(b.name);
  if (mode === "gates") return a.gate_count - b.gate_count || a.developer_action_count - b.developer_action_count;
  if (mode === "effort") return a.heuristic_effort_score - b.heuristic_effort_score || a.developer_action_count - b.developer_action_count;
  return a.name.localeCompare(b.name);
}

function render() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const category = elements.category.value;
  const sort = elements.sort.value;

  const filtered = routes
    .filter((row) => !category || row.category === category)
    .filter((row) => {
      if (!query) return true;
      const haystack = [row.name, row.category, row.outcome, row.first_success_type, row.selected_surface]
        .join(" ")
        .toLocaleLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => compareRows(a, b, sort));

  elements.resultCount.textContent = `${formatNumber(filtered.length)} of ${formatNumber(routes.length)} platforms`;

  if (filtered.length === 0) {
    elements.results.innerHTML = '<p class="state-message">No documented route matches those filters. Clear the search or choose another category.</p>';
    elements.results.setAttribute("aria-busy", "false");
    return;
  }

  const items = filtered.map((row) => `
    <li class="result">
      <details>
        <summary>
          <span class="result-title">${escapeHtml(row.name)}</span>
          <span class="result-outcome">${escapeHtml(row.outcome)}</span>
          <span class="result-metrics" aria-label="${escapeHtml(row.developer_action_count)} developer actions, ${escapeHtml(row.gate_count)} friction gates">
            <span class="metric">${escapeHtml(row.developer_action_count)} dev actions</span>
            <span class="metric">${escapeHtml(row.gate_count)} gates</span>
          </span>
        </summary>
        <div class="result-body">
          <dl>
            <dt>Category</dt>
            <dd>${escapeHtml(row.category)}</dd>
          </dl>
          <dl>
            <dt>Selected route</dt>
            <dd>${escapeHtml(row.selected_surface)}</dd>
          </dl>
          <dl>
            <dt>Raw transitions</dt>
            <dd>${escapeHtml(row.raw_transition_count)} total (${escapeHtml(row.platform_event_count)} platform events, not developer actions)</dd>
          </dl>
          <dl>
            <dt>Heuristic effort score</dt>
            <dd>${escapeHtml(row.heuristic_effort_score)} (unitless model output, not minutes and not observed time)</dd>
          </dl>
          <dl>
            <dt>Comparability</dt>
            <dd>${escapeHtml(row.comparability_status)}</dd>
          </dl>
          <a class="record-link" href="data/records/${encodeURIComponent(row.slug)}.json">Open the evidence record (JSON)</a>
        </div>
      </details>
    </li>
  `).join("");

  elements.results.innerHTML = `<ol class="results-list">${items}</ol>`;
  elements.results.setAttribute("aria-busy", "false");
}

async function load() {
  try {
    const [atlasResponse, coverageResponse] = await Promise.all([
      fetch("data/selected-path-heuristic.json"),
      fetch("data/coverage-summary.json"),
    ]);

    if (!atlasResponse.ok || !coverageResponse.ok) {
      throw new Error("The published research files could not be loaded.");
    }

    const [atlas, coverage] = await Promise.all([
      atlasResponse.json(),
      coverageResponse.json(),
    ]);

    routes = atlas.rows;
    elements.platformCount.textContent = formatNumber(coverage.platforms);
    elements.stepCount.textContent = formatNumber(coverage.steps);
    elements.sourceCount.textContent = formatNumber(coverage.sources);
    populateCategories(routes);
    render();
  } catch (error) {
    elements.resultCount.textContent = "Research unavailable";
    elements.results.setAttribute("aria-busy", "false");
    elements.results.innerHTML = `<p class="state-message"><strong>The atlas could not load.</strong><br>${escapeHtml(error.message)} Refresh the page to retry.</p>`;
  }
}

elements.search.addEventListener("input", render);
elements.category.addEventListener("change", render);
elements.sort.addEventListener("change", render);

load();
