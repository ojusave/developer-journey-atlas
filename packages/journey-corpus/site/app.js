const elements = {
  search: document.querySelector("#search"),
  category: document.querySelector("#category"),
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

// Platforms are listed alphabetically only. There is no score, no rank, and no
// ordering by step count: the list is a directory, not a leaderboard.
function render() {
  const query = elements.search.value.trim().toLocaleLowerCase();
  const category = elements.category.value;

  const filtered = routes
    .filter((row) => !category || row.category === category)
    .filter((row) => {
      if (!query) return true;
      const haystack = [row.name, row.category, row.outcome].join(" ").toLocaleLowerCase();
      return haystack.includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name));

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
        </summary>
        <div class="result-body">
          <dl>
            <dt>Category</dt>
            <dd>${escapeHtml(row.category)}</dd>
          </dl>
          <dl>
            <dt>Documented first success</dt>
            <dd>${escapeHtml(row.outcome)}</dd>
          </dl>
          <a class="record-link" href="data/records/${encodeURIComponent(row.slug)}.json">Open the evidence record (JSON), including the full documented step list</a>
        </div>
      </details>
    </li>
  `).join("");

  elements.results.innerHTML = `<ol class="results-list">${items}</ol>`;
  elements.results.setAttribute("aria-busy", "false");
}

async function load() {
  try {
    const response = await fetch("data/index.json");
    if (!response.ok) {
      throw new Error("The published research files could not be loaded.");
    }
    const manifest = await response.json();

    routes = manifest.records ?? [];
    const counts = manifest.counts ?? {};
    elements.platformCount.textContent = formatNumber(counts.platforms ?? routes.length);
    elements.stepCount.textContent = formatNumber(counts.steps ?? 0);
    elements.sourceCount.textContent = formatNumber(counts.sources ?? 0);
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

load();
