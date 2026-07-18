import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, "..");
const sourcePath = resolve(appRoot, "research/first-mile-blocker-universe.md");
const outputPath = resolve(appRoot, "src/generated/catalog.json");
const source = await readFile(sourcePath, "utf8");

const journeys = [
  ["J01", "Evaluator", "Decide whether the platform can solve the job"],
  ["J02", "Learner", "Build enough understanding to act safely"],
  ["J03", "Adopter", "Make the core capability work once"],
  ["J04", "Integrator", "Connect the capability to an existing system"],
  ["J05", "Shipper", "Make it work in a production-like environment"],
  ["J06", "Operator", "Observe, recover, and maintain it"],
  ["J07", "Contributor", "Change the project and get the change accepted"],
  ["J08", "Partner", "Publish an integration, extension, template, or marketplace offering"],
];

const stageDefinitions = [
  ["S00", "Problem definition", "The first-mile endpoint and population are defined"],
  ["S01", "Before an attempt", "The developer has not begun a platform attempt"],
  ["S02", "Discovery and evaluation", "The developer is finding and judging a starting path"],
  ["S03", "Access and authority", "Accounts, commercial gates, permissions, and organizational approval"],
  ["S04", "Learning and setup", "The developer is forming a model and preparing an environment"],
  ["S05", "Implementation", "The developer is configuring, building, or integrating"],
  ["S06", "Verification and recovery", "The developer is checking a result or recovering from failure"],
  ["S07", "Representative use", "The developer is adapting the first result to the real job"],
  ["S08", "Cross-cutting context", "Human, team, risk, support, agent, access, or measurement conditions"],
];

const familyStages = {
  U00: ["S00"], U01: ["S01"], U02: ["S02"], U03: ["S02"],
  U04: ["S03"], U05: ["S03"], U06: ["S03"], U07: ["S03"],
  U08: ["S02", "S04", "S05", "S06"], U09: ["S02", "S04", "S05"],
  U10: ["S04"], U11: ["S04", "S05"], U12: ["S04", "S05"],
  U13: ["S05"], U14: ["S05"], U15: ["S05"], U16: ["S04", "S05"],
  U17: ["S06"], U18: ["S06"], U19: ["S03", "S08"], U20: ["S03", "S08"],
  U21: ["S03", "S08"], U22: ["S07"], U23: ["S08"], U24: ["S06", "S08"],
  U25: ["S01", "S08"], U26: ["S02", "S03", "S04", "S05", "S06", "S08"],
  U27: ["S00", "S01", "S02", "S03", "S04", "S05", "S06", "S07", "S08"],
};

const nodes = [];
const edges = [];
const seen = new Set();

function addNode(node) {
  if (seen.has(node.id)) throw new Error(`Duplicate catalog node: ${node.id}`);
  seen.add(node.id);
  nodes.push(node);
}

for (const [id, label, description] of journeys) {
  addNode({ id, kind: "journey", label, description, catalogMaturity: "reviewed" });
}
for (const [id, label, description] of stageDefinitions) {
  addNode({ id, kind: "stage", label, description, catalogMaturity: "reviewed" });
}

const lines = source.split(/\r?\n/);
let inPlatformDeltas = false;
for (let index = 0; index < lines.length; index += 1) {
  const line = lines[index];
  if (line === "## Platform-specific blocker deltas") inPlatformDeltas = true;

  const heading = line.match(/^### ([UP]\d{2})\. (.+)$/);
  if (heading) {
    const [, id, label] = heading;
    if (id.startsWith("P") && !inPlatformDeltas) continue;
    addNode({
      id,
      kind: id.startsWith("U") ? "universal_family" : "platform_archetype",
      label,
      description: null,
      catalogMaturity: "reviewed",
      sourceLine: index + 1,
    });
    continue;
  }

  const reason = line.match(/^- ((?:U|P)\d{2}\.\d{2,3}) (.+)$/);
  if (!reason) continue;
  const [, id, label] = reason;
  const parentId = id.slice(0, 3);
  addNode({
    id,
    kind: "reason",
    label,
    description: null,
    parentId,
    scope: id.startsWith("U") ? "universal" : "platform_delta",
    catalogMaturity: "inventory",
    diagnosticEligibility: "not_diagnosis_eligible",
    sourceLine: index + 1,
  });
  edges.push({ from: id, to: parentId, type: "member_of", provenance: "source_structure", reviewState: "verified" });
}

const families = nodes.filter((node) => node.kind === "universal_family");
const archetypes = nodes.filter((node) => node.kind === "platform_archetype");
const reasons = nodes.filter((node) => node.kind === "reason");

for (const family of families) {
  const stages = familyStages[family.id];
  if (!stages) throw new Error(`Missing reviewed stage routing for ${family.id}`);
  for (const stageId of stages) {
    edges.push({ from: family.id, to: stageId, type: "applies_to_stage", provenance: "reviewed_family_route", reviewState: "reviewed" });
  }
  for (const archetype of archetypes) {
    edges.push({ from: family.id, to: archetype.id, type: "applies_to_platform", provenance: "universal_inheritance", reviewState: "verified" });
  }
}

for (const node of reasons) {
  if (!seen.has(node.parentId)) throw new Error(`Missing parent ${node.parentId} for ${node.id}`);
}

const counts = {
  universalFamilies: families.length,
  platformArchetypes: archetypes.length,
  universalReasons: reasons.filter((node) => node.scope === "universal").length,
  platformReasons: reasons.filter((node) => node.scope === "platform_delta").length,
  reasons: reasons.length,
  nodes: nodes.length,
  edges: edges.length,
};

const expected = { universalFamilies: 28, platformArchetypes: 16, universalReasons: 466, platformReasons: 324, reasons: 790 };
for (const [key, value] of Object.entries(expected)) {
  if (counts[key] !== value) throw new Error(`Catalog count mismatch for ${key}: ${counts[key]} !== ${value}`);
}

const sourceHash = createHash("sha256").update(source).digest("hex");
let existingGeneratedAt;
try {
  const existing = JSON.parse(await readFile(outputPath, "utf8"));
  if (existing.sourceHash === sourceHash && typeof existing.generatedAt === "string") {
    existingGeneratedAt = existing.generatedAt;
  }
} catch {
  // A missing or invalid generated file is replaced below.
}
const output = {
  schemaVersion: 1,
  catalogVersion: `source-${sourceHash.slice(0, 12)}`,
  source: "research/first-mile-blocker-universe.md",
  sourceHash,
  generatedAt: existingGeneratedAt ?? new Date().toISOString(),
  counts,
  nodes,
  edges,
};

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ outputPath, counts, sourceHash }, null, 2));
