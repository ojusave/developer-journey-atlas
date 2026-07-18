import { mkdir, readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { chromium } from "playwright-core";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:10000";
const executablePath = process.env.CHROME_EXECUTABLE_PATH
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function assertAccessible(page, label) {
  const results = await new AxeBuilder({ page }).analyze();
  const violations = results.violations
    .filter((violation) => violation.impact !== "minor")
    .map((violation) => `${violation.id}: ${violation.help}`);
  assert(violations.length === 0, `${label} accessibility violations: ${violations.join("; ")}`);
}

async function continueTo(page, heading) {
  await page.getByRole("button", { name: /Save and continue|See what this supports/ }).click();
  await page.getByRole("heading", { name: heading }).waitFor();
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await assertAccessible(page, "Welcome screen");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/e2e-mobile-welcome.png", fullPage: true });
  await page.getByRole("radio", { name: /Adaptive help/ }).check();
  assert(await page.getByText("Diagnostic answers may be processed in a short-lived server session").isVisible(), "Adaptive privacy disclosure is missing");
  await page.getByRole("button", { name: "Start a case" }).click();

  await page.locator("#name").fill("Sam");
  await continueTo(page, /Which company, team, or project/);
  await page.locator("#company").fill("Example team");
  await continueTo(page, "Which developer-facing platform is this about?");
  await page.locator("#platform").fill("Example API");
  await page.getByRole("checkbox", { name: "API or SDK", exact: true }).check();
  await continueTo(page, "What is your role in this developer journey?");
  await page.getByRole("radio", { name: "Developer relations", exact: true }).check();
  await continueTo(page, "What are you worried developers are not doing?");

  await page.locator("#concern").fill("idk");
  await page.getByRole("radio", { name: "We see no attempt", exact: true }).check();
  await continueTo(page, "What are developers doing, or not doing, that you can point to?");
  await page.locator("#adaptive-answer").fill("Developers do not attempt the integration.");
  await continueTo(page, "Which developers are we talking about?");
  await page.locator("#developer").fill("Backend engineers evaluating an event integration");
  await page.getByRole("radio", { name: "A person", exact: true }).check();
  await continueTo(page, "What are those developers trying to get done?");
  await page.locator("#developer-job").fill("Receive a verified event when a meeting begins");
  await continueTo(page, "What would count as their first meaningful success?");
  await page.locator("#outcome").fill("A representative event reaches their test endpoint and can be inspected");
  await page.getByRole("radio", { name: "A result the developer can verify", exact: true }).check();
  await continueTo(page, "Where does your direct observation end?");
  await page.getByRole("radio", { name: "No attempt observed", exact: true }).check();
  await page.locator("#last-truth").fill("The eligible cohort has no recorded attempt in the dashboard");
  await continueTo(page, "What explanation is your team carrying right now?");
  await page.locator("#explanation").fill("The starting path may not be visible or relevant");
  await continueTo(page, "What actually supports that explanation?");
  await page.getByRole("checkbox", { name: "Product or platform data", exact: true }).check();
  await page.locator("#evidence-detail").fill("The dashboard records no attempt, but does not show discovery");
  await continueTo(page, "What is the earliest signal that developers encountered this platform?");
  await page.getByText("We cannot tell from the data we have", { exact: true }).click();
  await continueTo(page, "What relationship do you have to the next move?");
  await page.getByRole("radio", { name: "I can investigate it directly", exact: true }).check();
  await page.locator("#ownership").fill("Interview developers who did and did not start");
  await continueTo(page, "What is the smallest move that would teach you something useful?");
  await page.getByRole("radio", { name: "Gather better evidence", exact: true }).check();
  await page.locator("#next-move").fill("Observe three representative developers choosing a starting path");
  await page.locator("#expected-signal").fill("More developers can identify the official start without facilitator help");
  await continueTo(page, "A case you can carry forward.");

  assert(await page.getByText("No intervention justified is a valid result.").isVisible(), "Uncertainty outcome is missing");
  assert(await page.getByText(/Why the scanner stopped here:/).isVisible(), "Stop rationale is missing");
  assert(await page.getByText("Developers do not attempt the integration.", { exact: true }).first().isVisible(), "Adaptive clarification was not carried into the Action Brief");
  await page.getByText("Inspect platform-specific possibilities", { exact: true }).click();
  assert(await page.getByText("Webhook delivery, verification, ordering, retry, replay, or signature validation is not completed.", { exact: true }).isVisible(), "API-specific research was not reachable from the Action Brief");
  await assertAccessible(page, "Action Brief");
  const cachedApiRequests = await page.evaluate(async () => {
    const requests = [];
    for (const cacheName of await caches.keys()) {
      const cache = await caches.open(cacheName);
      requests.push(...await cache.keys());
    }
    return requests.filter((request) => new URL(request.url).pathname.startsWith("/api/")).map((request) => request.url);
  });
  assert(cachedApiRequests.length === 0, "The offline cache stored private or revision-sensitive API responses");

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  assert((await markdownDownload).suggestedFilename().endsWith(".md"), "Markdown export did not start");
  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export portable JSON" }).click();
  assert((await jsonDownload).suggestedFilename().endsWith(".json"), "JSON export did not start");

  await page.getByRole("button", { name: "Start seven-day check" }).click();
  await page.locator("#review-notes").fill("Two developers never found the canonical start; one deliberately chose another tool.");
  await page.getByRole("radio", { name: "Keep investigating", exact: true }).check();
  await page.getByRole("button", { name: "Save seven-day check" }).click();
  await page.getByRole("heading", { name: "A case you can carry forward." }).waitFor();
  assert(await page.getByText("Keep investigating").isVisible(), "Seven-day result was not saved");

  const layout = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert(layout.scrollWidth === layout.clientWidth, `Mobile layout overflows by ${layout.scrollWidth - layout.clientWidth}px`);
  await page.screenshot({ path: "test-results/e2e-mobile-summary.png", fullPage: true });

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Resume saved case" }).click();
  await page.getByRole("heading", { name: "A case you can carry forward." }).waitFor();

  await page.getByRole("button", { name: "Edit this case" }).click();
  await page.locator("#concern").fill("Developers encounter the platform, but do not begin an evaluation.");
  await continueTo(page, "Which developers are we talking about?");
  const correctedRevision = await page.evaluate(() => {
    const value = localStorage.getItem("first-mile-scanner/adaptive-session/v1");
    if (!value) return null;
    const credential = JSON.parse(value);
    return { revision: credential.revision, turnObjectiveIds: Object.keys(credential.turnIds).sort() };
  });
  assert(correctedRevision?.revision === 11, "Correction did not create a new accepted server revision");
  assert(JSON.stringify(correctedRevision?.turnObjectiveIds) === JSON.stringify(["D1"]), "Upstream correction retained stale downstream turn references");
  assert(await page.locator(".adaptive-fallback").count() === 0, "Correction fell back instead of reopening the diagnostic");

  await continueTo(page, "What are those developers trying to get done?");
  await continueTo(page, "What would count as their first meaningful success?");
  await continueTo(page, "Where does your direct observation end?");
  await continueTo(page, "What explanation is your team carrying right now?");
  await continueTo(page, "What actually supports that explanation?");
  await continueTo(page, "What is the earliest signal that developers encountered this platform?");
  await page.getByText("We cannot tell from the data we have", { exact: true }).click();
  await continueTo(page, "What relationship do you have to the next move?");
  await continueTo(page, "What is the smallest move that would teach you something useful?");
  await continueTo(page, "A case you can carry forward.");
  assert(await page.getByText("Developers encounter the platform, but do not begin an evaluation.", { exact: true }).first().isVisible(), "Corrected concern was not carried into the summary");
  assert(await page.getByText("Developers do not attempt the integration.", { exact: true }).count() === 0, "Retracted clarification survived the corrected flow");
  const correctedMarkdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  const correctedMarkdown = await correctedMarkdownDownload;
  const correctedMarkdownPath = await correctedMarkdown.path();
  assert(correctedMarkdownPath, "Corrected Markdown export had no readable path");
  const correctedMarkdownText = await readFile(correctedMarkdownPath, "utf8");
  assert(correctedMarkdownText.includes("Developers encounter the platform, but do not begin an evaluation."), "Corrected Markdown omitted the revised concern");
  assert(!correctedMarkdownText.includes("Developers do not attempt the integration."), "Corrected Markdown retained a retracted clarification");

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Delete and start over" }).click();
  await page.getByRole("heading", { name: "Find where the first mile actually breaks." }).waitFor();
  assert(await page.evaluate(() => localStorage.length === 0), "Clear data left browser state behind");
  assert(await page.getByRole("button", { name: "Resume saved case" }).count() === 0, "Deleted case could still be resumed");
  await page.reload({ waitUntil: "networkidle" });
  assert(await page.getByRole("button", { name: "Resume saved case" }).count() === 0, "Deleted case returned after reload");

  await context.close();

  const guidedContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const guidedPage = await guidedContext.newPage();
  let guidedApiRequests = 0;
  await guidedPage.route("**/api/**", async (route) => {
    guidedApiRequests += 1;
    await route.abort();
  });
  await guidedPage.goto(baseUrl, { waitUntil: "networkidle" });
  await guidedPage.evaluate(() => localStorage.clear());
  await guidedPage.reload({ waitUntil: "networkidle" });
  await guidedPage.getByRole("radio", { name: /Guided only/ }).check();
  assert(await guidedPage.getByText("This prototype saves your work in this browser.").isVisible(), "Guided-only privacy disclosure is missing");
  await guidedPage.getByRole("button", { name: "Start a case" }).click();
  await guidedPage.locator("#name").fill("Sam");
  await continueTo(guidedPage, /Which company, team, or project/);
  await guidedPage.locator("#company").fill("Example team");
  await continueTo(guidedPage, "Which developer-facing platform is this about?");
  await guidedPage.locator("#platform").fill("Example API");
  await guidedPage.getByRole("checkbox", { name: "API or SDK", exact: true }).check();
  await continueTo(guidedPage, "What is your role in this developer journey?");
  await guidedPage.getByRole("radio", { name: "Developer relations", exact: true }).check();
  await continueTo(guidedPage, "What are you worried developers are not doing?");
  await guidedPage.locator("#concern").fill("this is boring");
  await guidedPage.getByRole("radio", { name: "We see no attempt", exact: true }).check();
  await guidedPage.getByRole("button", { name: "Save and continue" }).click();
  assert(await guidedPage.getByRole("heading", { name: "Let’s make this shorter." }).isVisible(), "Guided boredom did not offer a short route");
  await guidedPage.getByRole("button", { name: "Let me correct my answer" }).click();
  assert(await guidedPage.locator("#concern").inputValue() === "", "Interruption text was kept as diagnostic evidence");
  await guidedPage.locator("#concern").fill("idk");
  await guidedPage.getByRole("button", { name: "Save and continue" }).click();
  assert(await guidedPage.getByText(/Name the behavior you can point to/).isVisible(), "Guided mode accepted an uninformative concern");
  assert(await guidedPage.getByRole("heading", { name: "What are you worried developers are not doing?" }).isVisible(), "Guided clarification changed screens too early");
  await guidedPage.locator("#concern").fill("Developers do not attempt the integration.");
  await continueTo(guidedPage, "Which developers are we talking about?");
  await guidedPage.locator("#developer").fill("Backend engineers evaluating an event integration");
  await guidedPage.getByRole("radio", { name: "A person", exact: true }).check();
  await continueTo(guidedPage, "What are those developers trying to get done?");
  await guidedPage.locator("#developer-job").fill("Receive a verified event in their own service");
  await continueTo(guidedPage, "What would count as their first meaningful success?");
  await guidedPage.locator("#outcome").fill("A representative event reaches their endpoint and can be inspected");
  await guidedPage.getByRole("radio", { name: "A result the developer can verify", exact: true }).check();
  await continueTo(guidedPage, "Where does your direct observation end?");
  await guidedPage.getByRole("radio", { name: "We cannot locate the stop yet", exact: true }).check();
  await guidedPage.getByRole("button", { name: "Finish with what we have" }).click();
  await guidedPage.getByRole("heading", { name: "A case you can carry forward." }).waitFor();
  assert(await guidedPage.getByText("We cannot locate the stop yet", { exact: true }).isVisible(), "Boredom recovery manufactured an observation");
  assert(guidedApiRequests === 0, "Guided-only mode contacted the adaptive API");
  await guidedContext.close();

  const recoveryContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const recoveryPage = await recoveryContext.newPage();
  const fakeTurnId = "11111111-1111-4111-8111-111111111111";
  let fakeTurnRetryable = true;
  await recoveryPage.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (request.method() === "POST" && /\/api\/sessions\/[0-9a-f-]{36}\/turns$/i.test(url.pathname)) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({
          error: { code: "turn_retryable", message: "The saved answer can be retried", details: { turnId: fakeTurnId } },
          requestId: "22222222-2222-4222-8222-222222222222",
        }),
      });
      return;
    }
    if (request.method() === "GET" && url.pathname.endsWith(`/turns/${fakeTurnId}`)) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          turn: {
            id: fakeTurnId,
            revision: 1,
            objectiveId: "D1",
            status: "failed",
            result: null,
            errorCode: fakeTurnRetryable ? "processing_failed" : "turn_envelope_expired",
            retryable: fakeTurnRetryable,
          },
        }),
      });
      return;
    }
    await route.continue();
  });
  await recoveryPage.goto(baseUrl, { waitUntil: "networkidle" });
  await recoveryPage.evaluate(() => localStorage.clear());
  await recoveryPage.reload({ waitUntil: "networkidle" });
  await recoveryPage.getByRole("radio", { name: /Adaptive help/ }).check();
  await recoveryPage.getByRole("button", { name: "Start a case" }).click();
  await recoveryPage.locator("#name").fill("Recovery test");
  await continueTo(recoveryPage, /Which company, team, or project/);
  await recoveryPage.locator("#company").fill("Example team");
  await continueTo(recoveryPage, "Which developer-facing platform is this about?");
  await recoveryPage.locator("#platform").fill("Example API");
  await recoveryPage.getByRole("checkbox", { name: "API or SDK", exact: true }).check();
  await continueTo(recoveryPage, "What is your role in this developer journey?");
  await recoveryPage.getByRole("radio", { name: "Developer relations", exact: true }).check();
  await continueTo(recoveryPage, "What are you worried developers are not doing?");
  await recoveryPage.locator("#concern").fill("Developers do not begin an integration.");
  await recoveryPage.getByRole("radio", { name: "We see no attempt", exact: true }).check();
  await recoveryPage.getByRole("button", { name: "Save and continue" }).click();
  await recoveryPage.getByRole("button", { name: "Retry saved answer" }).waitFor();
  await recoveryPage.reload({ waitUntil: "networkidle" });
  await recoveryPage.getByRole("button", { name: "Resume saved case" }).click();
  await recoveryPage.getByRole("button", { name: "Retry saved answer" }).waitFor();
  fakeTurnRetryable = false;
  await recoveryPage.reload({ waitUntil: "networkidle" });
  await recoveryPage.getByRole("button", { name: "Resume saved case" }).click();
  await recoveryPage.getByText(/short-lived server copy of that answer expired/).waitFor();
  assert(await recoveryPage.getByRole("button", { name: "Retry saved answer" }).count() === 0, "Expired recovery remained stuck in a retry loop");
  const recoveryCredential = await recoveryPage.evaluate(() => JSON.parse(localStorage.getItem("first-mile-scanner/adaptive-session/v1")));
  await recoveryPage.evaluate(async (credential) => {
    await fetch(`/api/sessions/${credential.sessionId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${credential.sessionToken}` },
    });
  }, recoveryCredential);
  await recoveryContext.close();

  for (const width of [320, 375, 430, 768, 1280]) {
    const layoutContext = await browser.newContext({
      viewport: { width, height: width < 600 ? 760 : 900 },
      isMobile: width < 600,
    });
    const layoutPage = await layoutContext.newPage();
    await layoutPage.goto(baseUrl, { waitUntil: "networkidle" });
    const viewportLayout = await layoutPage.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));
    assert(viewportLayout.scrollWidth === viewportLayout.clientWidth, `The ${width}px welcome screen has horizontal overflow`);
    await layoutContext.close();
  }

  const offlineContext = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const offlinePage = await offlineContext.newPage();
  await offlinePage.goto(baseUrl, { waitUntil: "networkidle" });
  await offlinePage.evaluate(() => navigator.serviceWorker.ready);
  await offlinePage.reload({ waitUntil: "networkidle" });
  await offlineContext.setOffline(true);
  await offlinePage.reload({ waitUntil: "domcontentloaded" });
  await offlinePage.getByRole("heading", { name: "Find where the first mile actually breaks." }).waitFor();
  await offlineContext.setOffline(false);
  await offlineContext.close();

  process.stdout.write("E2E mobile flow, adaptive server, guided boredom recovery, correction and export retraction, persisted retry recovery, deletion, offline shell, and 320px to 1280px layout passed.\n");
} finally {
  await browser.close();
}
