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
  await page.locator("#participant-role").selectOption({ label: "Developer relations" });
  await continueWith(page, "Continue to the platform", /Which developer platform are we mapping/);

  await page.locator("#platform").fill("Example API");
  await page.locator("#primary-surface").selectOption({ label: "API or SDK" });
  await page.screenshot({ path: "test-results/e2e-mobile-platform.png", fullPage: true });
  await continueWith(page, "Define the developer", "Who is trying to do what, and what counts as success?");

  await page.locator("#developer").fill("Backend engineers who need meeting events to update an employee activity record in an internal service");
  await page.locator("#journey-type").selectOption({ label: "Connect it to an existing system" });
  await page.locator("#actor-type").selectOption({ label: "A person" });
  await page.locator("#meaningful-action").fill("subscribe a test account to meeting-start events and trigger one event");
  await page.locator("#verification-signal").fill("the expected event reaches their endpoint and matches the meeting they started");
  await page.screenshot({ path: "test-results/e2e-mobile-developer-endpoint.png", fullPage: true });
  await continueWith(page, "Build the journey", "Does this look like the journey?");
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
  assert(await page.getByText("Your map stays in this browser.").isVisible(), "Browser-local privacy promise is missing");
  assert(await page.getByRole("radio", { name: /Adaptive help/ }).count() === 0, "The welcome screen still asks users to choose an implementation mode");
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/e2e-mobile-welcome.png", fullPage: true });
  await page.getByRole("button", { name: "Map a journey" }).click();

  await fillJourney(page);
  assert(await page.getByText(/Execute: subscribe a test account/).isVisible(), "The journey did not adapt the execution step to the participant's endpoint");
  assert(await page.getByText(/Verify: the expected event reaches their endpoint/).isVisible(), "The journey did not adapt the verification step");
  assert(await page.locator(".journey-editor > li").count() === 8, "The default map does not contain the eight reviewed stages");
  await assertAccessible(page, "Journey map");
  await page.screenshot({ path: "test-results/e2e-mobile-map.png", fullPage: true });
  await continueWith(page, "Use this path", "Where does the journey stop being clear?");

  await page.getByRole("button", { name: /Sign up or sign in/ }).click();
  await page.getByRole("button", { name: "Gain the required access and authority", exact: true }).click();
  await page.getByRole("radio", { name: "Product or platform data shows it", exact: true }).check();
  await page.locator("#break-evidence").fill("Account creation is recorded, but no credential creation follows");
  assert(await page.getByText(/Last stage you can defend:/).isVisible(), "The map did not provide value before diagnosis");
  assert(await page.getByText(/Earliest unresolved transition:/).isVisible(), "The unresolved transition is not reflected back");
  await continueWith(page, "Explore this break", "What was the earliest access or authority gate you actually observed?");

  await page.getByText("Credit card, pricing, sales, procurement, contract, or legal review", { exact: true }).click();
  await page.locator("#issue-statement").fill("The evaluation path appears to require a commercial commitment before credentials are available");
  assert(await page.getByText(/Record the exact commitment/).isVisible(), "The selected research route did not produce a distinguishing observation");
  await continueWith(page, "See my journey map", "You found the transition to investigate.");

  assert(await page.getByText("The evaluation path appears to require a commercial commitment before credentials are available", { exact: true }).isVisible(), "The participant's conclusion is missing");
  assert(await page.getByText("Unresolved", { exact: true }).isVisible(), "The annotated map does not show the unresolved transition");
  assert(await page.getByText("No intervention justified remains a valid result.").isVisible(), "The valid non-intervention result is missing");
  assert(await page.getByText(/A selected stage is not a cause/).isVisible(), "The map does not preserve the stage-versus-cause boundary");
  await page.getByText("Inspect research relevant to this stage", { exact: true }).click();
  assert(await page.getByText("Webhook delivery, verification, ordering, retry, replay, or signature validation is not completed.", { exact: true }).isVisible(), "Platform-specific research is not reachable from the result");
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

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export portable JSON" }).click();
  assert((await jsonDownload).suggestedFilename().endsWith(".json"), "JSON export did not start");

  const layout = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }));
  assert(layout.scrollWidth === layout.clientWidth, `Mobile result overflows by ${layout.scrollWidth - layout.clientWidth}px`);
  await page.screenshot({ path: "test-results/e2e-mobile-summary.png", fullPage: true });
  assert(apiRequests === 0, "The map-first path made an unexpected adaptive API request");

  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Resume saved map" }).click();
  await page.getByRole("heading", { name: "You found the transition to investigate." }).waitFor();
  await page.getByRole("button", { name: "Edit the map" }).click();
  const setupEditor = page.locator(".journey-editor details").filter({ hasText: "Prepare the project or environment" });
  await setupEditor.locator("summary").click();
  await setupEditor.locator("input").fill("Install the supported SDK in a test service");
  await continueWith(page, "Use this path", "Where does the journey stop being clear?");
  await continueWith(page, "Explore this break", "What was the earliest access or authority gate you actually observed?");
  await page.getByText("Credit card, pricing, sales, procurement, contract, or legal review", { exact: true }).click();
  await page.locator("#issue-statement").fill("The commercial gate still appears to be the earliest unresolved transition");
  await continueWith(page, "See my journey map", "You found the transition to investigate.");
  assert(await page.getByText("Install the supported SDK in a test service", { exact: true }).isVisible(), "A corrected journey step was not carried into the result");
  assert(await page.getByText("The evaluation path appears to require a commercial commitment before credentials are available", { exact: true }).count() === 0, "An earlier conclusion survived correction without confirmation");

  await page.getByRole("button", { name: "Edit the map" }).click();
  await continueWith(page, "Use this path", "Where does the journey stop being clear?");
  await page.getByRole("button", { name: "We cannot locate it from our data", exact: true }).click();
  await page.getByRole("radio", { name: "We do not have stage-level evidence", exact: true }).check();
  await continueWith(page, "Explore this break", "What evidence would locate the earliest point where this journey stops?");
  await page.getByText("We cannot obtain better evidence yet", { exact: true }).click();
  await page.getByRole("button", { name: "We need more evidence before naming it" }).click();
  await continueWith(page, "See my journey map", "You found the transition to investigate.");
  assert(await page.getByText("Needs evidence", { exact: true }).isVisible(), "An unknown stopping point was presented as a cause instead of an evidence gap");
  assert(await page.getByText("We need better evidence before naming the issue.", { exact: true }).isVisible(), "The evidence-gap conclusion was not preserved");

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("button", { name: "Delete and start over" }).click();
  await page.getByRole("heading", { name: "Map the journey. Find the break." }).waitFor();
  assert(await page.evaluate(() => localStorage.length === 0), "Deleting the map left browser state behind");
  assert(await page.getByRole("button", { name: "Resume saved map" }).count() === 0, "Deleted map can still be resumed");
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
  await offlinePage.getByRole("heading", { name: "Map the journey. Find the break." }).waitFor();
  await offlineContext.setOffline(false);
  await offlineContext.close();

  process.stdout.write("Map-first mobile flow, early value, research routing, editing, export, resume, deletion, accessibility, offline shell, and 320px to 1280px layouts passed.\n");
} finally {
  await browser.close();
}
