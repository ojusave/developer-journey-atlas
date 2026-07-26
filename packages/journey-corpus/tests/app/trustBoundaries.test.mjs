import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  resolvePlatformIdentity,
  sourceCanSupportClaims,
  validateSourceAuthority,
} from "../../dist/core/sourceAuthority.js";
import { validateJourneyGraph } from "../../dist/core/journeyGraph.js";
import { LocalDataStore } from "../../dist/adapters/localData.js";
import { getPlatformEvidence, getPlatformJourney } from "../../dist/api/journey.js";
import { getPlatformCurve } from "../../dist/api/curve.js";
import { getPlatform, listPlatforms } from "../../dist/api/platforms.js";
import { config } from "../../dist/config.js";
import { getVerifyStatus, startVerify } from "../../dist/api/verify.js";
import { FakeWorkflowRunner } from "../../dist/adapters/fakes.js";
import { filterOfficialDiscoveryResults } from "../../dist/adapters/youSearch.js";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const identityRegistry = JSON.parse(await readFile(path.join(projectRoot, "trust/platform-identities.json"), "utf8"));
const identities = identityRegistry.identities;
const renderGraph = JSON.parse(await readFile(path.join(projectRoot, "trust/journey-graphs/render.json"), "utf8"));

function fakeReq({ params = {}, body = {}, query = {}, authorization = "", ip = "127.0.0.1" } = {}) {
  return {
    params,
    body,
    query,
    ip,
    get(name) {
      return name.toLowerCase() === "authorization" ? authorization : undefined;
    },
  };
}

function fakeRes() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader() {},
  };
}

test("platform identity resolution stops ambiguous Apollo before source discovery", () => {
  const result = resolvePlatformIdentity("Apollo", identities);
  assert.equal(result.outcome, "identity_ambiguous");
  assert.equal(result.candidates.length, 3);
});

test("every LLM API catalog provider has a resolvable trusted identity", async () => {
  const launchPlan = JSON.parse(
    await readFile(path.join(projectRoot, "trust/launch-cohort-candidates.json"), "utf8"),
  );
  const llmCohortIds = new Set([
    "llm-api-first-response",
    "managed-llm-inference-first-response",
    "cloud-llm-platform-first-response",
  ]);
  const catalogSlugs = launchPlan.cohorts
    .filter((cohort) => llmCohortIds.has(cohort.id))
    .flatMap((cohort) => cohort.participant_slugs);
  const identitySlugs = new Set(identities.map((identity) => identity.slug));
  assert.deepEqual(
    catalogSlugs.filter((slug) => !identitySlugs.has(slug)),
    [],
    "A catalog provider without a trusted identity cannot be researched.",
  );
  assert.equal(new Set(catalogSlugs).size, 25);
  const atlas = JSON.parse(
    await readFile(path.join(projectRoot, "selected-path-heuristic.json"), "utf8"),
  );
  const rowBySlug = new Map(atlas.rows.map((row) => [row.slug, row]));
  for (const slug of catalogSlugs) {
    const name = rowBySlug.get(slug)?.name;
    const resolution = resolvePlatformIdentity(name, identities);
    assert.equal(resolution.outcome, "resolved", `${name} must resolve from the catalog label.`);
    assert.equal(resolution.identity.slug, slug);
  }
});

test("source authority rejects third-party tutorials and unrelated repositories", () => {
  const renderIdentity = identities.find((identity) => identity.slug === "render");
  assert.equal(validateSourceAuthority("https://render.com/docs", renderIdentity).accepted, true);
  assert.equal(validateSourceAuthority("https://datacamp.com/tutorial/render", renderIdentity).accepted, false);
  assert.equal(validateSourceAuthority("https://github.com/unrelated/render-guide", renderIdentity).accepted, false);
  assert.equal(validateSourceAuthority("https://github.com/render-examples/flask-hello-world", renderIdentity).accepted, true);
  assert.equal(validateSourceAuthority("http://render.com/docs", renderIdentity).accepted, false);
});

test("OpenRouter discovery keeps its quickstart and excludes DataCamp", () => {
  const identity = identities.find((item) => item.slug === "openrouter");
  assert.deepEqual(
    filterOfficialDiscoveryResults([
      { title: "OpenRouter Quickstart", url: "https://openrouter.ai/docs/quickstart" },
      { title: "DataCamp tutorial", url: "https://www.datacamp.com/tutorial/openrouter" },
    ], identity),
    [{ title: "OpenRouter Quickstart", url: "https://openrouter.ai/docs/quickstart" }],
  );
});

test("GoHighLevel discovery keeps official developer and help pages but excludes SupplyGem", () => {
  const identity = identities.find((item) => item.slug === "gohighlevel");
  assert.deepEqual(
    filterOfficialDiscoveryResults([
      { title: "HighLevel API", url: "https://developers.gohighlevel.com/docs/" },
      { title: "HighLevel help", url: "https://help.gohighlevel.com/support/home" },
      { title: "SupplyGem guide", url: "https://supplygem.com/gohighlevel-api/" },
    ], identity),
    [
      { title: "HighLevel API", url: "https://developers.gohighlevel.com/docs/" },
      { title: "HighLevel help", url: "https://help.gohighlevel.com/support/home" },
    ],
  );
});

test("an allowlisted URL without retrieved content cannot support a claim", () => {
  const renderIdentity = identities.find((identity) => identity.slug === "render");
  const authority = validateSourceAuthority("https://render.com/docs", renderIdentity);
  assert.equal(sourceCanSupportClaims(authority, {
    canonicalUrl: "https://render.com/docs",
    redirectChain: [],
    httpStatus: 200,
    contentType: "text/html",
    retrievedAt: "2026-07-25T00:00:00Z",
    contentPresent: false,
    contentHash: null,
    contentTruncated: false,
    retrievedContentChars: 0,
    visibleTitle: "Docs",
    discoveredLinks: [],
  }), false);
});

test("Render graph is complete and keeps fields, waits, outcomes, and terminal distinct", () => {
  assert.deepEqual(validateJourneyGraph(renderGraph, "render"), []);
  const selected = new Set(renderGraph.selectedRoute.nodeIds);
  const route = renderGraph.nodes.filter((node) => selected.has(node.id));
  assert.equal(route.length, 16);
  assert.equal(route.flatMap((node) => node.requiredFields).length, 11);
  assert.equal(renderGraph.prerequisites.length, 3);
  assert.equal(renderGraph.externalGates.length, 5);
  assert.equal(renderGraph.candidateRoutes.length, 3);
  assert.equal(renderGraph.candidateRoutes.filter((route) => route.status === "selected").length, 1);
  assert.equal(renderGraph.candidateRoutes.filter((route) => route.status === "considered").length, 2);
  assert.equal(renderGraph.firstSuccessBoundary.outcomeClass, "meaningful_result");
  assert.ok(route.some((node) => node.kind === "passive_wait"));
  assert.ok(route.some((node) => node.kind === "platform_outcome"));
  assert.equal(route.at(-1).kind, "terminal_outcome");
});

test("journey graph platform identity must match the record being published", () => {
  const graph = structuredClone(renderGraph);
  graph.platformSlug = "stripe";
  assert.ok(
    validateJourneyGraph(graph, "render")
      .some((finding) => finding.code === "platform_slug_mismatch"),
  );
});

test("duplicate OVHcloud-style route fails with the duplicated node reference", () => {
  const graph = structuredClone(renderGraph);
  const duplicateId = graph.selectedRoute.nodeIds[0];
  graph.platformSlug = "ovhcloud";
  graph.selectedRoute.nodeIds.splice(5, 0, duplicateId);
  const findings = validateJourneyGraph(graph);
  assert.ok(findings.some((finding) => finding.code === "duplicate_node" && finding.nodeId === duplicateId));
});

test("missing field inventory and compound action fail publication reconstruction", () => {
  const graph = structuredClone(renderGraph);
  const form = graph.nodes.find((node) => node.id === "complete-service-form");
  form.requiredFields = [];
  form.action = "Open the form and enter the required settings";
  const findings = validateJourneyGraph(graph);
  assert.ok(findings.some((finding) => finding.code === "missing_field_inventory" && finding.nodeId === form.id));
  assert.ok(findings.some((finding) => finding.code === "compound_action" && finding.nodeId === form.id));
});

test("an action plus its observable success check stays one interaction", () => {
  const graph = structuredClone(renderGraph);
  const action = graph.nodes.find((node) => node.id === graph.selectedRoute.nodeIds.at(-2));
  action.action = "Run the script and verify the response is printed";
  const findings = validateJourneyGraph(graph);
  assert.ok(!findings.some((finding) => finding.code === "compound_action" && finding.nodeId === action.id));
});

test("field inventory status cannot be omitted or contradict recorded fields", () => {
  const missing = structuredClone(renderGraph);
  delete missing.nodes.find((node) => node.id === "open-git-credentials").requiresFieldInventory;
  assert.ok(validateJourneyGraph(missing).some((finding) => finding.code === "field_inventory_status_missing"));

  const inconsistent = structuredClone(renderGraph);
  inconsistent.nodes.find((node) => node.id === "complete-service-form").requiresFieldInventory = false;
  assert.ok(validateJourneyGraph(inconsistent).some((finding) => finding.code === "field_inventory_inconsistent"));
});

test("near duplicates and concatenated branches fail selected-route validation", () => {
  const nearDuplicate = structuredClone(renderGraph);
  nearDuplicate.nodes.find((node) => node.id === "open-git-credentials").action =
    "Create a Render account with email and password now.";
  assert.ok(validateJourneyGraph(nearDuplicate).some((finding) => finding.code === "near_duplicate_action"));

  const concatenated = structuredClone(renderGraph);
  concatenated.nodes.find((node) => node.id === "open-service-url").branchId = "alternate-cli-route";
  assert.ok(validateJourneyGraph(concatenated).some((finding) => finding.code === "branch_concatenation"));
});

test("waits, platform outcomes, documentation navigation, and causal breaks fail deterministically", () => {
  const graph = structuredClone(renderGraph);
  graph.nodes.find((node) => node.id === "wait-for-deploy").actor = "developer";
  graph.nodes.find((node) => node.id === "service-live").actor = "developer";
  graph.nodes.find((node) => node.id === "open-new-service-menu").interface = "documentation";
  graph.nodes.find((node) => node.id === "select-repository").inputs.push("unavailable_secret");
  const codes = new Set(validateJourneyGraph(graph).map((finding) => finding.code));
  assert.ok(codes.has("wrong_actor_for_event"));
  assert.ok(codes.has("documentation_navigation_action"));
  assert.ok(codes.has("broken_causal_input"));
});

test("missing evidence locators and route edges fail graph selection", () => {
  const graph = structuredClone(renderGraph);
  graph.nodes.find((node) => node.id === "start-deploy").evidence[0].locator = "";
  graph.edges = graph.edges.filter((edge) => edge.to !== "first-success");
  const codes = new Set(validateJourneyGraph(graph).map((finding) => finding.code));
  assert.ok(codes.has("missing_evidence_locator"));
  assert.ok(codes.has("missing_route_edge"));
});

test("selected route must be declared and cannot stop at resource creation when docs continue", () => {
  const graph = structuredClone(renderGraph);
  graph.candidateRoutes[0].id = "different-route";
  graph.firstSuccessBoundary.outcomeClass = "resource_creation";
  graph.firstSuccessBoundary.officialRouteContinues = true;
  const codes = new Set(validateJourneyGraph(graph).map((finding) => finding.code));
  assert.ok(codes.has("route_not_declared"));
  assert.ok(codes.has("invalid_first_success_boundary"));
});

test("starting after account creation and unresolved claim-level uncertainty block publication", () => {
  const graph = structuredClone(renderGraph);
  graph.startingState.boundary = "existing_account";
  graph.uncertainties.push({
    targetType: "field",
    targetId: "complete-service-form:Region",
    description: "The required region choices are not established.",
    blocksPublication: true,
  });
  const codes = new Set(validateJourneyGraph(graph).map((finding) => finding.code));
  assert.ok(codes.has("invalid_starting_state"));
  assert.ok(codes.has("unresolved_uncertainty"));
});

test("public handlers expose only the eligible graph route and no metric or blocker fields", async () => {
  const store = new LocalDataStore(projectRoot);

  const listRes = fakeRes();
  listPlatforms(store)(fakeReq(), listRes);
  assert.deepEqual(listRes.body.data.map((row) => row.slug), ["render"]);

  const journeyRes = fakeRes();
  await getPlatformJourney(store)(fakeReq({ params: { slug: "render" } }), journeyRes);
  assert.equal(journeyRes.body.data.steps.length, 16);
  assert.equal(
    journeyRes.body.data.steps.flatMap((step) => step.requiredFields).length,
    11,
  );
  assert.equal(journeyRes.body.data.prerequisites.length, 3);
  assert.equal(
    journeyRes.body.data.steps.flatMap((step) => step.frictionGates).length,
    5,
  );
  assert.match(journeyRes.body.data.routeScope.selectedPath, /Dashboard Web Service/i);
  assert.match(journeyRes.body.data.routeScope.bestFit, /server-side code/i);
  assert.match(journeyRes.body.data.routeScope.firstSuccess, /Live.*root content/i);
  assert.equal(journeyRes.body.data.routeScope.alternatives.length, 2);
  assert.equal("frictionGateCount" in journeyRes.body.data, false);
  const serialized = JSON.stringify(journeyRes.body);
  for (const forbidden of ["onboardingScore", "percentile", "peerMedian", "blockerHypotheses", "associations"]) {
    assert.equal(serialized.includes(forbidden), false);
  }

  const curveRes = fakeRes();
  await getPlatformCurve(store)(fakeReq({ params: { slug: "render" } }), curveRes);
  assert.equal(curveRes.body.data.available, false);
  assert.equal(curveRes.body.data.reason, "insufficient_qualified_peers");
  assert.equal(curveRes.body.data.qualifiedPeerCount, 0);
  assert.equal(curveRes.body.data.requiredPeerCount, 3);
  assert.equal("peers" in curveRes.body.data, false);
  assert.equal("dimensions" in curveRes.body.data, false);

  const evidenceRes = fakeRes();
  await getPlatformEvidence(store)(fakeReq({ params: { slug: "render" } }), evidenceRes);
  assert.equal(evidenceRes.statusCode, 200);
  assert.ok(evidenceRes.body.data.sources.length > 0);
  assert.equal(evidenceRes.body.data.evidenceClass, "documented_fact");
  for (const source of evidenceRes.body.data.sources) {
    assert.ok(source.title);
    assert.ok(source.officialDomain);
    assert.match(source.url, /^https:\/\//);
    assert.match(source.retrievedAt, /^\d{4}-\d{2}-\d{2}/);
    assert.ok(source.claimOrRouteElements.length > 0);
    assert.ok(source.locators.length > 0);
  }
  assert.doesNotMatch(
    JSON.stringify(evidenceRes.body),
    /audit_status|needs-human-judgment|provider_payload/,
  );

  const platformRes = fakeRes();
  await getPlatform(store)(fakeReq({ params: { slug: "render" } }), platformRes);
  assert.deepEqual(Object.keys(platformRes.body.data).sort(), [
    "category",
    "documentedRouteUrl",
    "name",
    "note",
    "organization",
    "outcome",
    "slug",
    "startingUrl",
  ]);

  const hiddenRes = fakeRes();
  await getPlatform(store)(fakeReq({ params: { slug: "stripe" } }), hiddenRes);
  assert.equal(hiddenRes.statusCode, 404);

  const hiddenEvidenceRes = fakeRes();
  await getPlatformEvidence(store)(fakeReq({ params: { slug: "stripe" } }), hiddenEvidenceRes);
  assert.equal(hiddenEvidenceRes.statusCode, 404);
});

test("verification start is disabled without a secret and rejects a wrong secret before workflow access", async () => {
  const store = new LocalDataStore(projectRoot);
  const runner = new FakeWorkflowRunner();
  const original = config.verifyAdminSecret;
  try {
    config.verifyAdminSecret = "";
    const disabled = fakeRes();
    await startVerify(store, runner)(fakeReq({ body: { slug: "render" } }), disabled);
    assert.equal(disabled.statusCode, 503);
    assert.equal(runner.namedStarts.length, 0);

    config.verifyAdminSecret = "correct-secret";
    const unauthorized = fakeRes();
    await startVerify(store, runner)(
      fakeReq({ body: { slug: "render" }, authorization: "Bearer wrong-secret" }),
      unauthorized,
    );
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(runner.namedStarts.length, 0);
  } finally {
    config.verifyAdminSecret = original;
  }
});

test("verification status requires the same server-side administrative secret", async () => {
  let statusCalls = 0;
  const runner = {
    status: async () => {
      statusCalls += 1;
      return { runId: "verify-run", phase: "completed", result: { outcome: "completed", audit: { private: true } } };
    },
  };
  const original = config.verifyAdminSecret;
  try {
    config.verifyAdminSecret = "correct-secret";
    const unauthorized = fakeRes();
    await getVerifyStatus(runner)(
      fakeReq({ params: { runId: "verify-run" }, authorization: "Bearer wrong-secret" }),
      unauthorized,
    );
    assert.equal(unauthorized.statusCode, 401);
    assert.equal(statusCalls, 0);
    assert.doesNotMatch(JSON.stringify(unauthorized.body), /private/);
  } finally {
    config.verifyAdminSecret = original;
  }
});
