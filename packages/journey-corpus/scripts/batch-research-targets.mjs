#!/usr/bin/env node
/**
 * Start live research Workflow runs for expansion targets and poll until done.
 * Saves completed records under drafts/<slug>.json for ingest-research-draft.mjs.
 *
 * Usage:
 *   node scripts/batch-research-targets.mjs --wave 1 --limit 10
 *   node scripts/batch-research-targets.mjs --slugs sendgrid,mailgun,postmark
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targetPath = path.join(projectRoot, "docs/expansion/target-300.json");
const rosterPath = path.join(projectRoot, "roster.json");
const draftsDir = path.join(projectRoot, "docs/expansion/drafts");
const baseUrl = process.env.ATLAS_BASE_URL || "https://developer-journey-atlas.onrender.com";
const pollMs = Number(process.env.RESEARCH_POLL_MS || 5000);
const maxPolls = Number(process.env.RESEARCH_MAX_POLLS || 120);

function parseArgs(argv) {
  const out = { wave: 1, limit: 10, slugs: null, concurrency: 5 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--wave") out.wave = Number(argv[++i]);
    else if (arg === "--limit") out.limit = Number(argv[++i]);
    else if (arg === "--slugs") out.slugs = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "--concurrency") out.concurrency = Number(argv[++i]);
  }
  return out;
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function startResearch(name) {
  const res = await fetch(`${baseUrl}/api/research`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ platform: name }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error?.message || `start failed (${res.status})`);
  }
  if (body.data?.known) return { known: true, slug: body.data.slug };
  return { known: false, runId: body.data.runId, slug: body.data.slug };
}

async function pollRun(runId) {
  for (let i = 0; i < maxPolls; i += 1) {
    await sleep(pollMs);
    const res = await fetch(`${baseUrl}/api/research/${encodeURIComponent(runId)}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error?.message || `status failed (${res.status})`);
    const phase = body.data?.phase;
    if (phase === "completed") return body.data.result;
    if (phase === "failed") throw new Error(body.data?.message || "research failed");
    process.stdout.write(`  ${runId} ${phase || "?"} (${i + 1}/${maxPolls})\n`);
  }
  throw new Error(`timed out waiting for ${runId}`);
}

async function mapPool(items, concurrency, worker) {
  const results = [];
  let index = 0;
  async function run() {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await worker(items[current], current);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => run()));
  return results;
}

const args = parseArgs(process.argv.slice(2));
const targets = JSON.parse(await readFile(targetPath, "utf8"));
const roster = new Set(JSON.parse(await readFile(rosterPath, "utf8")).map((row) => row.slug));
await mkdir(draftsDir, { recursive: true });

let selected = targets.platforms.filter((row) => !roster.has(row.slug));
if (args.slugs) {
  const want = new Set(args.slugs);
  selected = targets.platforms.filter((row) => want.has(row.slug));
} else {
  const start = (args.wave - 1) * args.limit;
  selected = selected.slice(start, start + args.limit);
}

console.log(`researching ${selected.length} platforms against ${baseUrl} (concurrency ${args.concurrency})`);

const summary = await mapPool(selected, args.concurrency, async (platform) => {
  console.log(`start ${platform.name}`);
  try {
    const started = await startResearch(platform.name);
    if (started.known) {
      console.log(`known ${platform.name} -> ${started.slug}`);
      return { slug: platform.slug, status: "known" };
    }
    const result = await pollRun(started.runId);
    if (result.outcome !== "completed" || !result.record) {
      console.log(`incomplete ${platform.name}: ${result.outcome}`);
      return { slug: platform.slug, status: result.outcome || "incomplete", runId: started.runId };
    }
    const out = path.join(draftsDir, `${result.record.platform.slug}.json`);
    await writeFile(out, `${JSON.stringify(result.record, null, 2)}\n`);
    console.log(`saved ${out}`);
    return { slug: result.record.platform.slug, status: "completed", runId: started.runId, file: out };
  } catch (err) {
    console.log(`error ${platform.name}: ${err.message}`);
    return { slug: platform.slug, status: "error", error: err.message };
  }
});

await writeFile(
  path.join(draftsDir, `wave-${args.wave}-summary.json`),
  `${JSON.stringify({ generated_at: new Date().toISOString(), results: summary }, null, 2)}\n`,
);
console.log(JSON.stringify(summary, null, 2));
