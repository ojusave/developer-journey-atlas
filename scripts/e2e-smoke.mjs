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

async function continueWith(page, buttonName, heading) {
  await page.getByRole("button", { name: buttonName }).click();
  await page.getByRole("heading", { name: heading }).waitFor();
}

async function fillJourney(page) {
  await page.locator("#name").fill("Sam");
  await page.locator("#company").fill("Example team");
  await page.locator("#platform").fill("Example API");
  await page.locator("#participant-role").selectOption({ label: "Developer relations" });
  await page.screenshot({ path: "test-results/e2e-mobile-platform.png", fullPage: true });
  await continueWith(page, "Describe the developer", "What is the developer trying to do?");

  await page.locator("#developer").fill("Backend engineers");
  await page.locator("#developer-job").fill("Use meeting events to update an employee activity record in an internal service");
  await page.locator("#meaningful-action").fill("subscribe a test account to meeting-start events and trigger one event");
  await page.locator("#verification-signal").fill("the expected event reaches their endpoint and matches the meeting they started");
  await page.screenshot({ path: "test-results/e2e-mobile-developer-endpoint.png", fullPage: true });
  await continueWith(page, "See the journey", "Does this look like the journey?");
}

const browser = await chromium.launch({ headless: true, executablePath });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, acceptDownloads: true });
  const page = await context.newPage();
  let apiRequests = 0;
  await page.route("**/api/**", async (route) => {
    apiRequests += 1;
    await route.abort();
  });
  await page.goto(baseUrl, { waitUntil: "networkidle" });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: "networkidle" });

  await assertAccessible(page, "Welcome screen");
  assert(await page.getByText(/Saved in this browser/).isVisible(), "Browser-local privacy promise is missing");
  assert(await page.getByRole("radio", { name: /Adaptive help/ }).count() === 0, "The welcome screen still asks users to choose an implementation mode");
  assert(await page.getByText("Access", { exact: true }).count() === 0, "The welcome screen still shows non-interactive stage chips");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/e2e-mobile-welcome.png", fullPage: true });
  await page.getByRole("button", { name: "Start mapping" }).click();

  await fillJourney(page);
  assert(await page.getByText(/Try: subscribe a test account/).isVisible(), "The journey did not adapt the execution step to the participant's endpoint");
  assert(await page.getByText(/Confirm: the expected event reaches their endpoint/).isVisible(), "The journey did not adapt the verification step");
  assert(await page.locator(".journey-editor > li").count() === 8, "The default map does not contain the eight reviewed stages");
  assert(await page.getByText("Research stage", { exact: true }).count() === 0, "An internal research-stage control is visible to the participant");
  await assertAccessible(page, "Journey map");
  await page.screenshot({ path: "test-results/e2e-mobile-map.png", fullPage: true });
  await continueWith(page, "This journey is right", "What is the first step you cannot confirm?");

  await page.getByRole("button", { name: /Get the permissions or approval they need/ }).click();
  await page.locator("#break-evidence-type").selectOption({ label: "Product or platform data shows it" });
  await page.locator("#break-evidence").fill("Account creation is recorded, but no credential creation follows");
  assert(await page.getByText("First step not confirmed", { exact: true }).isVisible(), "The selected drop-off is not reflected back");
  await page.screenshot({ path: "test-results/e2e-mobile-dropoff.png", fullPage: true });
  await continueWith(page, "Look at this step", "What was the earliest access or authority gate you actually observed?");

  await page.getByText("Credit card, pricing, sales, procurement, contract, or legal review", { exact: true }).click();
  await page.getByRole("button", { name: "Add a working explanation" }).click();
  await page.locator("#issue-statement").fill("The evaluation path appears to require a commercial commitment before credentials are available");
  assert(await page.getByText(/Record the exact commitment/).isVisible(), "The selected research route did not produce a distinguishing observation");
  await page.screenshot({ path: "test-results/e2e-mobile-reason.png", fullPage: true });
  await continueWith(page, "See the result", "Here is where the journey becomes unclear.");

  assert(await page.getByText("The evaluation path appears to require a commercial commitment before credentials are available", { exact: true }).isVisible(), "The participant's conclusion is missing");
  assert(await page.getByText("Unresolved", { exact: true }).isVisible(), "The annotated map does not show the unresolved transition");
  assert(await page.getByText("No change may be the right result.").isVisible(), "The valid non-intervention result is missing");
  assert(await page.getByText("A credit card is required before evaluation.", { exact: true }).isVisible(), "The selected research reasons are not visible in the result");
  await assertAccessible(page, "Journey result");

  const markdownDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Markdown" }).click();
  const downloadedMarkdown = await markdownDownload;
  assert(downloadedMarkdown.suggestedFilename().endsWith(".md"), "Markdown export did not start");
  const markdownPath = await downloadedMarkdown.path();
  assert(markdownPath, "Markdown export had no readable path");
  const markdown = await readFile(markdownPath, "utf8");
  assert(markdown.includes("## Journey"), "Markdown export omitted the journey map");
  assert(markdown.includes("Earliest unresolved point"), "Markdown export omitted the break placement");
  assert(markdown.includes("Participant role: Developer relations"), "Markdown export omitted the participant role used to label the workshop artifact");

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export portable JSON" }).click();
  assert((await jsonDownload).suggestedFilename().endsWith(".json"), "JSON export did not start");

  const layout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(layout.scrollWidth === layout.clientWidth, `Mobile result overflows by ${layout.scrollWidth - layout.clientWidth}px`);
  await page.screenshot({ path: "test-results/e2e-mobile-summary.png", fullPage: true });
  assert(apiRequests === 0, "The map-first path made an unexpected adaptive API request");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Resume saved map" }).click();
  await page.getByRole("heading", { name: "Here is where the journey becomes unclear." }).waitFor();
  await page.getByRole("button", { name: "Edit the journey" }).click();
  const setupEditor = page.locator(".journey-editor details").filter({ hasText: "Set up their project" });
  await setupEditor.locator("summary").click();
  await setupEditor.locator("input").fill("Install the supported SDK in a test service");
  await continueWith(page, "This journey is right", "What is the first step you cannot confirm?");
  await continueWith(page, "Look at this step", "What was the earliest access or authority gate you actually observed?");
  await page.getByText("Credit card, pricing, sales, procurement, contract, or legal review", { exact: true }).click();
  await page.getByRole("button", { name: "Add a working explanation" }).click();
  await page.locator("#issue-statement").fill("The commercial gate still appears to be the earliest unresolved transition");
  await continueWith(page, "See the result", "Here is where the journey becomes unclear.");
  assert(await page.getByText("Install the supported SDK in a test service", { exact: true }).isVisible(), "A corrected journey step was not carried into the result");
  assert(await page.getByText("The evaluation path appears to require a commercial commitment before credentials are available", { exact: true }).count() === 0, "An earlier conclusion survived correction without confirmation");

  await page.getByRole("button", { name: "Edit the journey" }).click();
  await continueWith(page, "This journey is right", "What is the first step you cannot confirm?");
  await page.locator(".selected-answer").getByRole("button", { name: "Change", exact: true }).click();
  await page.getByRole("button", { name: "We do not know", exact: true }).click();
  await page.locator("#break-evidence-type").selectOption({ label: "We do not have stage-level evidence" });
  await continueWith(page, "Look at this step", "What is the smallest next observation?");
  await page.getByText("We cannot obtain better evidence yet", { exact: true }).click();
  assert(await page.getByText("Your next evidence step", { exact: true }).isVisible(), "A future evidence action was mislabeled as a past observation");
  assert(await page.getByRole("button", { name: "Add a working explanation" }).count() === 0, "The unknown-boundary route invited a causal explanation before locating the stop");
  await continueWith(page, "See the result", "You need better evidence to locate the drop-off.");
  assert(await page.getByRole("heading", { name: "You need better evidence to locate the drop-off." }).isVisible(), "An unknown stopping point was presented as a cause instead of an evidence gap");
  assert(await page.getByText("We need better evidence before naming the issue.", { exact: true }).isVisible(), "The evidence-gap conclusion was not preserved");
  assert(await page.getByText("No reason supported yet", { exact: true }).isVisible(), "The evidence-gap result still shows unsupported reasons");

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Delete and start over" }).click();
  await page.getByRole("heading", { name: "Where are developers getting stuck?" }).waitFor();
  assert(await page.evaluate(() => localStorage.length === 0), "Deleting the map left browser state behind");
  assert(await page.getByRole("button", { name: "Resume saved map" }).count() === 0, "Deleted map can still be resumed");

  await page.getByRole("button", { name: "Start mapping" }).click();
  await fillJourney(page);
  await continueWith(page, "This journey is right", "What is the first step you cannot confirm?");
  await page.getByRole("button", { name: "They reached first success", exact: true }).click();
  assert(await page.locator("#break-evidence-type option", { hasText: "This is a team assumption or anecdote" }).count() === 0, "The completed route accepts an assumption as evidence of success");
  assert(await page.locator("#break-evidence-type option", { hasText: "We do not have stage-level evidence" }).count() === 0, "The completed route accepts missing evidence as evidence of success");
  await page.locator("#break-evidence-type").selectOption({ label: "I observed a real attempt" });
  await page.locator("#break-evidence").fill("The developer completed every mapped step and verified the expected event");
  await continueWith(page, "Look at this step", "This journey does not show a drop-off.");
  await page.screenshot({ path: "test-results/e2e-mobile-completed-summary.png", fullPage: true });
  assert(await page.getByText("You marked every required step as completed.", { exact: true }).isVisible(), "The completed path does not explain why no drop-off was found");
  assert(await page.getByRole("button", { name: "Change where the journey stops" }).isVisible(), "The completed path has no correction action");
  assert(await page.getByRole("button", { name: "Map a different developer" }).isVisible(), "The completed path has no next-journey action");
  await context.close();

  for (const width of [320, 375, 430, 768, 1280]) {
    const layoutContext = await browser.newContext({ viewport: { width, height: width < 600 ? 760 : 900 }, isMobile: width < 600 });
    const layoutPage = await layoutContext.newPage();
    await layoutPage.goto(baseUrl, { waitUntil: "networkidle" });
    const viewportLayout = await layoutPage.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
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
  await offlinePage.getByRole("heading", { name: "Where are developers getting stuck?" }).waitFor();
  await offlineContext.setOffline(false);
  await offlineContext.close();

  process.stdout.write("Map-first mobile flow, early value, research routing, editing, export, resume, deletion, accessibility, offline shell, and 320px to 1280px layouts passed.\n");
} finally {
  await browser.close();
}
