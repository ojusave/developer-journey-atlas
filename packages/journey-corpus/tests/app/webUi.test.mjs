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
    if (path === "/data/llm-api-catalog.json") {
      return {
        ok: true,
        json: async () => ({
          cohorts: [{
            providers: [{
              name: "Mistral",
              slug: "mistral",
              searchAliases: ["Mistral AI"],
              routeStatus: "review",
            }],
          }],
        }),
      };
    }
    if (path === "/api/platforms") {
      return { ok: true, json: async () => ({ data: [] }) };
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
    () => window.document.querySelector("#search-status")?.textContent.includes("Try OpenAI"),
    "provider search did not become ready",
  );

  const input = window.document.querySelector("#search");
  input.value = "Mistral";
  window.document.querySelector("#search-form").dispatchEvent(
    new window.Event("submit", { bubbles: true, cancelable: true }),
  );
  await waitFor(
    () => window.document.querySelector("#research-btn")?.textContent === "Start research",
    "search did not show the explicit research action",
  );
  assert.match(window.document.querySelector(".trust-note").textContent, /You\.com and OpenRouter/);
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
