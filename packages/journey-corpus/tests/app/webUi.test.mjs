import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { JSDOM } from "jsdom";

const webRoot = new URL("../../web/", import.meta.url);

async function waitFor(check, message) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(message);
}

test("home screen shows multiple corpus platforms before typing", async () => {
  const html = await readFile(new URL("index.html", webRoot), "utf8");
  const app = await readFile(new URL("app.js", webRoot), "utf8");
  const dom = new JSDOM(html, {
    url: "https://atlas.test/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  window.fetch = async (path) => {
    if (path === "/api/platforms?include=all") {
      return {
        ok: true,
        json: async () => ({
          data: [
            { name: "Render", slug: "render", routeStatus: "published" },
            { name: "Stripe", slug: "stripe", routeStatus: "known_needs_review" },
            { name: "OpenAI", slug: "openai", routeStatus: "known_needs_review" },
            { name: "GitHub", slug: "github", routeStatus: "known_needs_review" },
          ],
          meta: { count: 4 },
        }),
      };
    }
    throw new Error(`Unexpected request: GET ${path}`);
  };

  window.eval(app);
  await waitFor(
    () => window.document.querySelector("#search-status")?.textContent.includes("4 platforms loaded"),
    "corpus count was not shown",
  );

  const visibleChoices = window.document.querySelector("#search-results")?.textContent ?? "";
  assert.match(visibleChoices, /Stripe/);
  assert.match(visibleChoices, /OpenAI/);
  assert.match(visibleChoices, /GitHub/);
  assert.match(visibleChoices, /Render/);
  assert.equal(window.document.querySelector("#search-results")?.hidden, false);
  dom.window.close();
});

test("search, consent, research, and draft display form one complete human flow", async () => {
  const html = await readFile(new URL("index.html", webRoot), "utf8");
  const app = await readFile(new URL("app.js", webRoot), "utf8");
  const requests = [];
  const dom = new JSDOM(html, {
    url: "https://atlas.test/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const nativeSetTimeout = globalThis.setTimeout;
  window.setTimeout = (callback) => nativeSetTimeout(callback, 0);
  window.fetch = async (path, options = {}) => {
    requests.push({ path: String(path), method: options.method ?? "GET" });
    if (path === "/api/platforms?include=all") {
      return {
        ok: true,
        json: async () => ({
          data: [{
              name: "Mistral",
              slug: "mistral",
              category: "AI, ML, and agents",
              outcome: "Receive the first model response",
              routeStatus: "known_needs_review",
              reviewReasons: ["missing_journey_graph"],
          }],
        }),
      };
    }
    if (path === "/api/platforms/mistral/journey") {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "No public route." } }),
      };
    }
    if (path === "/api/research" && options.method === "POST") {
      return { ok: true, json: async () => ({ data: { runId: "run-1", phase: "queued" } }) };
    }
    if (path === "/api/research/run-1") {
      return {
        ok: true,
        json: async () => ({
          data: {
            runId: "run-1",
            phase: "completed",
            result: {
              outcome: "draft_ready",
              slug: "mistral",
              draft: {
                name: "Mistral",
                slug: "mistral",
                startingUrl: "https://docs.mistral.ai/getting-started/",
                firstSuccess: "Receive the first model response",
                successSignal: "The response contains generated text",
                prerequisites: [{ requirement: "A Mistral account", required: true }],
                steps: [
                  { stepNumber: 1, action: "Create an API key", successSignal: "The key is available" },
                  { stepNumber: 2, action: "Send a chat request", successSignal: "The response returns text" },
                ],
                complexity: {
                  rating: "low",
                  score: 2,
                  note: "Documented structural complexity.",
                  dimensions: {
                    requiredActions: 2,
                    requiredFields: 0,
                    decisionPoints: 0,
                    documentedExternalGates: 0,
                    unavoidableWaits: 0,
                  },
                },
                sources: [{
                  title: "Mistral quickstart",
                  url: "https://docs.mistral.ai/getting-started/",
                  accessedAt: "2026-07-25",
                }],
              },
            },
          },
        }),
      };
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${path}`);
  };

  window.eval(app);
  await waitFor(
    () => window.document.querySelector("#search-status")?.textContent.includes("platforms loaded"),
    "provider search did not become ready",
  );
  assert.equal(window.document.querySelector("#search-results")?.hidden, false);
  assert.match(window.document.querySelector("#search-results")?.textContent ?? "", /Mistral/);

  const input = window.document.querySelector("#search");
  input.value = "Mistral";
  window.document.querySelector("#search-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(
    () => window.document.querySelector("#research-btn")?.textContent === "Refresh research",
    "search did not show the explicit research action",
  );
  assert.match(window.document.querySelector("#result").textContent, /missing_journey_graph/);
  assert.equal(
    requests.filter((request) => request.path === "/api/research").length,
    0,
    "research must not start before the person chooses it",
  );

  window.document.querySelector("#research-btn").click();
  await waitFor(
    () => window.document.querySelector(".state-label")?.textContent === "Research draft",
    "completed research did not display its draft",
  );

  const resultText = window.document.querySelector("#result").textContent;
  assert.match(resultText, /Receive the first model response/);
  assert.match(resultText, /Create an API key/);
  assert.match(resultText, /Send a chat request/);
  assert.match(resultText, /Saved privately for maintainer review/);
  assert.equal(
    window.document.querySelector('a[href="https://docs.mistral.ai/getting-started/"]')?.textContent,
    "Open official guide",
  );
  assert.equal(requests.filter((request) => request.path === "/api/research").length, 1);
  assert.equal(requests.filter((request) => request.path === "/api/research/run-1").length, 1);

  dom.window.close();
});

test("a failed attempt can retry into a saved private draft", async () => {
  const html = await readFile(new URL("index.html", webRoot), "utf8");
  const app = await readFile(new URL("app.js", webRoot), "utf8");
  let researchStarts = 0;
  const dom = new JSDOM(html, {
    url: "https://atlas.test/",
    runScripts: "outside-only",
  });
  const { window } = dom;
  const nativeSetTimeout = globalThis.setTimeout;
  window.setTimeout = (callback) => nativeSetTimeout(callback, 0);
  const draft = {
    name: "Mistral AI",
    slug: "mistral-ai",
    startingUrl: "https://docs.mistral.ai/getting-started/",
    firstSuccess: "Receive the first model response",
    successSignal: "The response contains generated text",
    prerequisites: [],
    steps: [{ stepNumber: 1, action: "Send the first API request", successSignal: "Text returns" }],
    complexity: {
      rating: "low",
      score: 1,
      note: "Documented structural complexity.",
      dimensions: {
        requiredActions: 1,
        requiredFields: 0,
        decisionPoints: 0,
        documentedExternalGates: 0,
        unavoidableWaits: 0,
      },
    },
    sources: [{ title: "Mistral quickstart", url: "https://docs.mistral.ai/getting-started/" }],
  };
  window.fetch = async (path, options = {}) => {
    if (path === "/api/platforms?include=all") {
      return {
        ok: true,
        json: async () => ({
          data: [{
              name: "Mistral AI",
              slug: "mistral-ai",
              category: "AI, ML, and agents",
              outcome: "Receive the first model response",
              routeStatus: "known_needs_review",
              reviewReasons: ["missing_journey_graph"],
          }],
        }),
      };
    }
    if (path === "/api/platforms/mistral-ai/journey") {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { message: "No public route." } }),
      };
    }
    if (path === "/api/research" && options.method === "POST") {
      researchStarts += 1;
      return researchStarts === 1
        ? { ok: true, json: async () => ({ data: { runId: "old-run", resumed: true } }) }
        : {
            ok: true,
            json: async () => ({
              data: { result: { outcome: "draft_ready", slug: "mistral-ai", draft } },
            }),
          };
    }
    if (path === "/api/research/old-run") {
      return {
        ok: true,
        json: async () => ({
          data: {
            runId: "old-run",
            phase: "completed",
            result: { outcome: "invalid_output" },
          },
        }),
      };
    }
    throw new Error(`Unexpected request: ${options.method ?? "GET"} ${path}`);
  };

  window.eval(app);
  await waitFor(
    () => window.document.querySelector("#search-status")?.textContent.includes("platforms loaded"),
    "provider search did not become ready",
  );
  const input = window.document.querySelector("#search");
  input.value = "Mistral AI";
  window.document.querySelector("#search-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(
    () => window.document.querySelector("#research-btn")?.textContent === "Refresh research",
    "search did not show the research action",
  );
  window.document.querySelector("#research-btn").click();
  await waitFor(
    () => window.document.querySelector("#research-btn")?.textContent === "Try again",
    "failed research did not offer an immediate retry",
  );
  window.document.querySelector("#research-btn").click();
  await waitFor(
    () => window.document.querySelector(".state-label")?.textContent === "Research draft",
    "retry did not display the saved private draft",
  );
  assert.match(window.document.querySelector("#result").textContent, /Send the first API request/);
  assert.equal(researchStarts, 2);
  dom.window.close();
});
