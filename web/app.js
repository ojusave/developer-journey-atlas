const el = {
  form: document.querySelector("#search-form"),
  input: document.querySelector("#search"),
  suggestions: document.querySelector("#suggestions"),
  platformCount: document.querySelector("#platform-count"),
  result: document.querySelector("#result"),
};

let currentSuggestions = [];

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

/* ---------- Rendering an assessment ---------- */

function metricBox(value, label, hint) {
  const hintHtml = hint ? `<span class="m-hint">${esc(hint)}</span>` : "";
  return `<div class="metric-box"><span class="m-value">${esc(value)}</span><span class="m-label">${esc(label)}</span>${hintHtml}</div>`;
}

// Plain-language translation of the comparability status, so "conditional"
// isn't a cryptic label.
function comparabilityText(status) {
  if (status === "comparable") return "Comparable: this route makes few special assumptions.";
  if (status === "not-comparable") return "Not directly comparable: the documented success here is ambiguous or unusual.";
  return "Conditionally comparable: this route assumes things (like an existing account or a specific surface), so read side-by-side numbers loosely.";
}

// A short, scannable "how to read this" strip shown with every result.
function readStrip() {
  return `
    <p class="read-strip">
      <strong>How to read this:</strong> these numbers describe the route official docs lay out to a first success,
      how many steps and gates it spells out. They are not a measure of how easy, fast, or good the product is,
      and a lower number is not "better".
    </p>`;
}

function renderAssessment(a) {
  const prereqs = a.prerequisites.length
    ? `<div class="chips">${a.prerequisites
        .map((p) => `<span class="chip ${p.required ? "req" : ""}">${esc(p.type)}${p.required ? " (required)" : ""}</span>`)
        .join("")}</div>`
    : '<p class="lede">No prerequisites documented for this route.</p>';

  const gates = a.frictionGates.length
    ? `<div class="chips">${a.frictionGates.map((g) => `<span class="chip">${esc(g.type)}</span>`).join("")}</div>`
    : '<p class="lede">No friction gates documented on this route.</p>';

  const time = a.timeToFirstSuccess
    ? `${esc(a.timeToFirstSuccess.value)} ${a.timeToFirstSuccess.vendorClaim ? "(vendor claim)" : ""}`
    : "Not documented";

  const sources = a.sources.length
    ? `<ul class="sources-list">${a.sources
        .slice(0, 6)
        .map((s) => `<li><a href="${esc(s.url)}" rel="noreferrer">${esc(s.title)}</a></li>`)
        .join("")}${a.sources.length > 6 ? `<li>+ ${a.sources.length - 6} more in the record</li>` : ""}</ul>`
    : '<p class="lede">See the full record for sources.</p>';

  return `
    <div class="card">
      <div class="assess-head">
        <h2>${esc(a.name)}</h2>
        <span class="pill pill-cat">${esc(a.category)}</span>
      </div>
      <p class="lede">${esc(a.outcome)}</p>
      ${readStrip()}

      <div class="metrics-grid">
        ${metricBox(num(a.metrics.developerActions), "Developer actions", "steps you take")}
        ${metricBox(num(a.metrics.gates), "Friction gates", "sign-up, billing, approvals…")}
        ${metricBox(num(a.metrics.platformEvents), "Automated steps", "the platform does these")}
        ${metricBox(a.metrics.effortScore, "Route length", "weighted step count, not time")}
        ${metricBox(esc(a.metrics.comparability), "Comparability", "how safely it compares")}
      </div>
      <p class="lede compare-note">${esc(comparabilityText(a.metrics.comparability))}</p>

      <dl class="kv">
        <div><dt>Selected route</dt><dd>${esc(a.selectedSurface)}</dd></div>
        <div><dt>Documented first success</dt><dd>${esc(a.firstSuccess.milestone || a.firstSuccess.normalizedOutcome || a.outcome)}</dd></div>
        <div><dt>Vendor time claim</dt><dd>${time}</dd></div>
        <div><dt>Prerequisites</dt><dd>${prereqs}</dd></div>
        <div><dt>Friction gates</dt><dd>${gates}</dd></div>
        <div><dt>Documented path length</dt><dd>${num(a.pathStepCount)} steps, ${num(a.sourceCount)} official sources</dd></div>
        <div><dt>Sources</dt><dd>${sources}</dd></div>
      </dl>

      <p class="dist-line"><a href="${esc(a.recordUrl)}" rel="noreferrer">Open the full evidence record (JSON)</a></p>
      <p class="dist-line">${esc(a.note)}</p>
    </div>`;
}

function distLine(label, d) {
  return `<p class="dist-line"><strong>${esc(label)}:</strong> ${num(d.value)} vs same-finish-line median ${num(d.categoryMedian)}. ${num(d.lowerCount)} document a shorter route, ${num(d.higherCount)} document a longer one.</p>`;
}

function peerRow(p) {
  return `
      <tr class="${p.sameFinishLine ? "" : "diff-finish"}">
        <td><a href="#" data-slug="${esc(p.slug)}" class="peer-link">${esc(p.name)}</a></td>
        <td>${esc(p.finishLine)}</td>
        <td>${num(p.developerActions)}</td>
        <td>${num(p.gates)}</td>
        <td>${p.effortScore}</td>
      </tr>`;
}

// Turn the effort-score distribution into one plain sentence about where this
// route sits among same-finish-line peers, framed as documentation length.
function positionSentence(c) {
  const d = c.distribution.effortScore;
  let where;
  if (d.higherCount > d.lowerCount) where = "on the longer, more spelled-out side";
  else if (d.lowerCount > d.higherCount) where = "on the shorter, more condensed side";
  else where = "about mid-pack";
  return `Among the ${c.sameFinishLineCount} peer(s) that also reach "${c.finishLine}", this route's documented length is ${where}. That reflects how much the docs walk you through, which can mean thorough docs or more required steps, not that it is harder or worse.`;
}

function renderComparison(c) {
  if (c.peerCount === 0) {
    return `<div class="card"><h2>Category context</h2><p class="lede">No other platforms in "${esc(c.category)}" yet.</p></div>`;
  }

  const sameFinish = c.peers.filter((p) => p.sameFinishLine);
  const diffFinish = c.peers.filter((p) => !p.sameFinishLine);

  const dist = c.sameFinishLineCount > 0
    ? `<p class="lede compare-note">${esc(positionSentence(c))}</p>
       ${distLine("Developer actions", c.distribution.developerActions)}
       ${distLine("Friction gates", c.distribution.gates)}
       ${distLine("Route length (effort score)", c.distribution.effortScore)}`
    : `<p class="lede">No peer in this category documents the same finish line ("${esc(c.finishLine)}"), so there is no like-for-like distribution to show.</p>`;

  const selfRow = `
    <tr class="self">
      <td>${esc(c.platform.name)} (this platform)</td>
      <td>${esc(c.finishLine)}</td>
      <td>${num(c.distribution.developerActions.value)}</td>
      <td>${num(c.distribution.gates.value)}</td>
      <td>${c.distribution.effortScore.value}</td>
    </tr>`;

  const sameSection = sameFinish.length
    ? sameFinish.map(peerRow).join("")
    : "";

  const diffSection = diffFinish.length
    ? `<tr class="section-label"><td colspan="5">Different finish line: measures a different milestone, not compared</td></tr>${diffFinish.map(peerRow).join("")}`
    : "";

  return `
    <div class="card">
      <div class="assess-head">
        <h2>Category context: ${esc(c.category)}</h2>
        <span class="pill">${num(c.sameFinishLineCount)} peer(s) with the same finish line</span>
      </div>
      <p class="dist-line">Documented finish line for this route: <strong>${esc(c.finishLine)}</strong>. Comparisons only make sense between routes that end at the same milestone.</p>
      ${dist}
      <table class="compare-table">
        <thead>
          <tr><th>Platform</th><th>Finish line</th><th>Dev actions</th><th>Gates</th><th>Route length</th></tr>
        </thead>
        <tbody>
          ${selfRow}
          ${sameSection}
          ${diffSection}
        </tbody>
      </table>
      <p class="dist-line">${esc(c.comparabilityNote)}</p>
    </div>`;
}

async function showPlatform(slug) {
  hideSuggestions();
  el.result.hidden = false;
  el.result.innerHTML = '<div class="state-message">Loading assessment…</div>';
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
  try {
    const [assessment, comparison] = await Promise.all([
      api(`/api/platforms/${encodeURIComponent(slug)}`),
      api(`/api/compare?slug=${encodeURIComponent(slug)}`),
    ]);
    el.result.innerHTML = renderAssessment(assessment.data) + renderComparison(comparison.data);
  } catch (err) {
    el.result.innerHTML = `<div class="state-message"><strong>Could not load that platform.</strong><br>${esc(err.message)}</div>`;
  }
}

function renderUnknown(query) {
  el.result.hidden = false;
  el.result.innerHTML = `
    <div class="card unknown-panel">
      <h2>"${esc(query)}" isn't in the dataset yet</h2>
      <p class="lede">Run live research: the Atlas searches official documentation, reconstructs a source-grounded first-mile record, measures it, and (when configured) opens a draft pull request back to the dataset.</p>
      <button class="btn btn-primary" id="research-btn" type="button">Research this platform live</button>
      <ol class="research-log" id="research-log" hidden></ol>
    </div>`;
  document.querySelector("#research-btn").addEventListener("click", () => researchPlatform(query));
  el.result.scrollIntoView({ behavior: "smooth", block: "start" });
}

function logStep(text, cls) {
  const logEl = document.querySelector("#research-log");
  if (!logEl) return;
  logEl.hidden = false;
  const li = document.createElement("li");
  if (cls) li.className = cls;
  li.textContent = text;
  logEl.appendChild(li);
}

function draftBanner(record) {
  const json = JSON.stringify(record, null, 2);
  const blob = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  return `
    <div class="draft-banner">
      <strong>Machine-drafted, unverified.</strong> Generated live from official docs via You.com + an LLM. It passed schema
      validation but has not been human-reviewed. Treat it as a starting point, not a source of truth.
      <a href="${blob}" download="${esc(record.platform.slug)}.json">Download the drafted record (JSON)</a>
    </div>`;
}

// Parse a Server-Sent Events stream from a fetch Response body.
async function* readSse(res) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const dataLine = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (dataLine) {
        try {
          yield JSON.parse(dataLine.slice(5).trim());
        } catch {
          /* ignore malformed frame */
        }
      }
    }
  }
}

async function researchPlatform(query) {
  const btn = document.querySelector("#research-btn");
  if (btn) btn.disabled = true;
  logStep("Starting…");
  try {
    const res = await fetch("/api/research", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform: query }),
    });
    if (!res.ok || !res.body) {
      const body = await res.json().catch(() => ({}));
      logStep(body.error ? body.error.message : `Research unavailable (${res.status}).`, "err");
      if (btn) btn.disabled = false;
      return;
    }

    let resultHtml = "";
    for await (const ev of readSse(res)) {
      if (ev.type === "status") logStep(ev.message);
      else if (ev.type === "known") return showPlatform(ev.slug);
      else if (ev.type === "result") {
        resultHtml = draftBanner(ev.record) + renderAssessment(ev.assessment) + renderComparison(ev.comparison);
        el.result.innerHTML = resultHtml;
      } else if (ev.type === "pr") {
        el.result.innerHTML = resultHtml + `<div class="card"><p class="dist-line"><strong>Draft PR opened:</strong> <a href="${esc(ev.url)}" rel="noreferrer">${esc(ev.url)}</a></p></div>`;
      } else if (ev.type === "pr_skipped") {
        el.result.innerHTML = resultHtml + `<div class="card"><p class="dist-line">${esc(ev.reason)}</p></div>`;
      } else if (ev.type === "error") {
        if (resultHtml) el.result.innerHTML = resultHtml + `<div class="card"><p class="dist-line err">${esc(ev.message)}</p></div>`;
        else logStep(ev.message, "err");
      }
    }
  } catch {
    logStep("Lost connection to the research service.", "err");
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function submitQuery(q) {
  const query = q.trim();
  if (!query) return;
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

/* ---------- Events ---------- */

el.input.addEventListener("input", (e) => runSearch(e.target.value));
el.input.addEventListener("blur", () => setTimeout(hideSuggestions, 150));

el.suggestions.addEventListener("click", (e) => {
  const li = e.target.closest(".suggestion");
  if (li) showPlatform(li.dataset.slug);
});

el.form.addEventListener("submit", (e) => {
  e.preventDefault();
  submitQuery(el.input.value);
});

el.result.addEventListener("click", (e) => {
  const link = e.target.closest(".peer-link");
  if (link) {
    e.preventDefault();
    el.input.value = "";
    showPlatform(link.dataset.slug);
  }
});

async function init() {
  try {
    const { data } = await api("/api/meta");
    el.platformCount.textContent = num(data.count);
  } catch {
    /* leave the static fallback count */
  }
}

init();
