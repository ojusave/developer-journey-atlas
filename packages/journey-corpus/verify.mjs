// Verify each record's documented steps against the official docs they cite.
//
//   npm run verify                                 verify every record
//   npm run verify -- --only stripe,render,vercel  verify a subset
//   npm run verify -- --refresh                    ignore the fetch cache
//
// Per step: resolve source_ids to the record's sources, require the cited URLs
// to be on the platform's own documentation domain, fetch the live docs (cached
// by URL), and require a LITERAL supporting excerpt for the step's action and
// success_signal. A verdict rests on quoted document text, never on agreement.
//
// A record is "verified" only when every required step is supported. Otherwise
// it is "needs_human" with the failing steps listed. Platforms in headline.json
// are capped at "needs_human": headline claims get human sign-off, not tool
// self-certification.
//
// Outputs are written to verify/<slug>.json and verify-summary.md, both dated.
// Cached fetches keep reruns cheap and deterministic (same inputs, same result).

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import {
  hostOf, registrableDomain, sameSite, prepareDoc, findSupportingExcerpt,
} from "./lib/verify-core.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const VERIFY_DIR = path.join(ROOT, "verify");
const CACHE_DIR = path.join(VERIFY_DIR, ".cache");
const GENERATED_AT = new Date().toISOString();
const FETCH_TIMEOUT_MS = 20000;

function parseArgs(argv) {
  const args = { only: null, refresh: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--refresh") args.refresh = true;
    else if (a === "--only") args.only = String(argv[++i] ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    else if (a.startsWith("--only=")) args.only = a.slice("--only=".length).split(",").map((s) => s.trim()).filter(Boolean);
  }
  return args;
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function loadHeadline() {
  const raw = readJson(path.join(ROOT, "headline.json"), []);
  const list = Array.isArray(raw) ? raw : Array.isArray(raw.slugs) ? raw.slugs : [];
  return new Set(list.map((s) => String(s).trim().toLowerCase()));
}

// ---- Fetch + cache --------------------------------------------------------

async function fetchDoc(url, refresh) {
  const key = crypto.createHash("sha256").update(url).digest("hex");
  const cacheFile = path.join(CACHE_DIR, `${key}.json`);
  if (!refresh && fs.existsSync(cacheFile)) {
    const cached = readJson(cacheFile, null);
    if (cached && cached.ok) return { ...cached, fromCache: true };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "developer-journey-atlas-verifier/1.0 (+https://github.com/ojusave/developer-journey-atlas)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
      },
    });
    const body = await res.text();
    const record = {
      url,
      ok: res.ok,
      status: res.status,
      contentType: res.headers.get("content-type") || "",
      fetched_at: new Date().toISOString(),
      text: htmlIfHtml(body, res.headers.get("content-type") || ""),
    };
    if (res.ok) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(cacheFile, `${JSON.stringify(record)}\n`);
    }
    return { ...record, fromCache: false };
  } catch (err) {
    return { url, ok: false, status: 0, error: err.name === "AbortError" ? "timeout" : String(err.message || err), fetched_at: new Date().toISOString(), text: "", fromCache: false };
  } finally {
    clearTimeout(timer);
  }
}

function htmlIfHtml(body, contentType) {
  // Keep the raw body; prepareDoc() strips HTML. For non-HTML (json/plain) the
  // text is used as-is, which is fine for literal matching.
  return body;
}

// ---- Per-record verification ----------------------------------------------

async function verifyRecord(record, headlineSet, refresh, docCache) {
  const slug = record.platform?.slug ?? "unknown";
  const platformName = record.platform?.name ?? slug;
  const startUrl = record.entry_point?.starting_url || record.sources?.[0]?.url || "";
  const platformDomain = registrableDomain(hostOf(startUrl) || "");
  const sourcesById = new Map((record.sources || []).map((s) => [s.id, s]));

  // Fetch every cited source once (deduplicated by URL across steps).
  const sourceReports = [];
  for (const s of record.sources || []) {
    if (!docCache.has(s.url)) docCache.set(s.url, await fetchDoc(s.url, refresh));
    const doc = docCache.get(s.url);
    const onDomain = sameSite(s.url, startUrl);
    sourceReports.push({
      id: s.id,
      url: s.url,
      official_domain: s.official_domain === true,
      on_platform_domain: onDomain,
      reachable: Boolean(doc.ok),
      status: doc.status,
      fetched_at: doc.fetched_at,
    });
  }

  const preparedByUrl = new Map();
  const prepared = (url) => {
    if (!preparedByUrl.has(url)) {
      const doc = docCache.get(url);
      preparedByUrl.set(url, doc && doc.ok ? prepareDoc(doc.text) : null);
    }
    return preparedByUrl.get(url);
  };

  const steps = [];
  for (const step of record.primary_path || []) {
    steps.push(evaluateStep(step, sourcesById, docCache, prepared, startUrl));
  }

  const requiredSteps = steps.filter((s) => s.required);
  const failingRequired = requiredSteps.filter((s) => s.status !== "supported").map((s) => s.step_number);
  const supportedRequired = requiredSteps.length - failingRequired.length;

  const isHeadline = headlineSet.has(slug);
  const notes = [];
  let verdict;
  if (isHeadline) {
    verdict = "needs_human";
    notes.push("Headline platform: capped at needs_human. Named-on-a-slide claims require human sign-off, not tool self-certification.");
    if (failingRequired.length) notes.push(`Additionally, ${failingRequired.length} required step(s) are not backed by a quoted official-doc excerpt.`);
  } else if (failingRequired.length === 0 && requiredSteps.length > 0) {
    verdict = "verified";
  } else {
    verdict = "needs_human";
    if (requiredSteps.length === 0) notes.push("No required steps found in primary_path.");
    else notes.push(`${failingRequired.length} required step(s) are not backed by a quoted official-doc excerpt.`);
  }

  return {
    slug,
    platform: platformName,
    category: record.category ?? null,
    generated_at: GENERATED_AT,
    as_of_note: "Verified against official docs as fetched on the dates below. Docs change.",
    headline: isHeadline,
    verdict,
    platform_domain: platformDomain,
    required_step_count: requiredSteps.length,
    supported_required_step_count: supportedRequired,
    failing_steps: failingRequired,
    notes,
    sources: sourceReports,
    steps,
  };
}

function evaluateStep(step, sourcesById, docCache, prepared, startUrl) {
  const base = {
    step_number: step.step_number,
    required: step.required !== false,
    phase: step.phase ?? null,
    action: step.action,
    success_signal: step.success_signal || null,
    source_ids: step.source_ids || [],
    status: "unsupported",
    notes: [],
    evidence: [],
  };

  if (!base.source_ids.length) {
    base.status = "no_sources";
    base.notes.push("Step cites zero sources. An unsupported claim.");
    return base;
  }

  // Resolve sources and apply the domain gate before any fetch matters.
  const cited = [];
  for (const id of base.source_ids) {
    const src = sourcesById.get(id);
    if (!src) {
      base.status = "unsupported";
      base.notes.push(`Cited source ${id} is not present in the record's sources array.`);
      return base;
    }
    cited.push(src);
  }
  for (const src of cited) {
    if (src.official_domain !== true) {
      base.status = "non_official_domain";
      base.notes.push(`Cited source ${src.id} is not marked official_domain. ${src.url}`);
      return base;
    }
    if (!sameSite(src.url, startUrl)) {
      base.status = "non_official_domain";
      base.notes.push(`Cited source ${src.id} (${src.url}) is not on the platform's own documentation domain (${registrableDomain(hostOf(startUrl) || "")}).`);
      return base;
    }
  }

  const reachable = cited.filter((src) => docCache.get(src.url)?.ok);
  if (reachable.length === 0) {
    base.status = "source_unreachable";
    base.notes.push("None of the cited official-domain sources could be fetched. Not guessed.");
    return base;
  }

  // Require literal support for action, and for success_signal when present.
  const fields = [["action", step.action]];
  if (step.success_signal && step.success_signal.trim()) fields.push(["success_signal", step.success_signal]);

  const fieldResults = {};
  for (const [field, text] of fields) {
    let best = null;
    for (const src of reachable) {
      const doc = prepared(src.url);
      if (!doc) continue;
      const match = findSupportingExcerpt(doc.original, doc.lower, doc.tokens, text);
      if (!best || match.coverage > best.match.coverage) best = { src, match };
    }
    fieldResults[field] = best;
    if (best) {
      base.evidence.push({
        field,
        supported: best.match.supported,
        source_id: best.src.id,
        url: best.src.url,
        fetched_at: docCache.get(best.src.url)?.fetched_at ?? null,
        coverage: best.match.coverage,
        threshold_terms: best.match.threshold ?? null,
        matched_tokens: best.match.matchedTokens,
        missing_tokens: best.match.missingTokens,
        excerpt: best.match.excerpt,
      });
    }
  }

  const actionOk = fieldResults.action?.match.supported === true;
  const signalReq = fields.some(([f]) => f === "success_signal");
  const signalOk = !signalReq || fieldResults.success_signal?.match.supported === true;

  if (actionOk && signalOk) {
    base.status = "supported";
  } else {
    base.status = "unsupported";
    if (!actionOk) base.notes.push("No literal official-doc excerpt supports the step's action.");
    if (signalReq && !signalOk) base.notes.push("No literal official-doc excerpt supports the step's success_signal.");
  }
  return base;
}

// ---- Summary + output -----------------------------------------------------

function writeSummary(results, args, headlineSet) {
  const recordCounts = { verified: 0, needs_human: 0 };
  const stepCounts = { supported: 0, unsupported: 0, source_unreachable: 0, non_official_domain: 0, no_sources: 0 };
  for (const r of results) {
    recordCounts[r.verdict] = (recordCounts[r.verdict] || 0) + 1;
    for (const s of r.steps) stepCounts[s.status] = (stepCounts[s.status] || 0) + 1;
  }

  const review = results.filter((r) => r.verdict !== "verified");
  const scope = args.only ? `subset: ${args.only.join(", ")}` : "all records";

  const lines = [];
  lines.push("# Verification summary");
  lines.push("");
  lines.push(`Generated at: ${GENERATED_AT}`);
  lines.push(`Scope: ${scope} (${results.length} record(s))`);
  lines.push("");
  lines.push("Each step is checked against the official docs it cites: the cited URL must be on the platform's own documentation domain, must be reachable, and must contain a literal excerpt supporting the step's action and success signal. Verdicts rest on quoted document text, not on model agreement. Docs change; this reflects the pages fetched on the dates in each `verify/<slug>.json`.");
  lines.push("");
  lines.push("## Record verdicts");
  lines.push("");
  lines.push(`- verified: ${recordCounts.verified}`);
  lines.push(`- needs_human: ${recordCounts.needs_human}`);
  lines.push("");
  lines.push("## Step verdicts");
  lines.push("");
  lines.push(`- supported: ${stepCounts.supported}`);
  lines.push(`- unsupported: ${stepCounts.unsupported}`);
  lines.push(`- source_unreachable: ${stepCounts.source_unreachable}`);
  lines.push(`- non_official_domain: ${stepCounts.non_official_domain}`);
  lines.push(`- no_sources: ${stepCounts.no_sources}`);
  lines.push("");
  lines.push("## Records a human must review");
  lines.push("");
  if (review.length === 0) {
    lines.push("None in this run.");
  } else {
    lines.push("| Platform | Slug | Headline | Required steps | Supported | Failing steps |");
    lines.push("| --- | --- | :---: | ---: | ---: | --- |");
    for (const r of review) {
      const failing = r.failing_steps.length ? r.failing_steps.join(", ") : "-";
      lines.push(`| ${r.platform} | ${r.slug} | ${r.headline ? "yes" : "no"} | ${r.required_step_count} | ${r.supported_required_step_count} | ${failing} |`);
    }
    lines.push("");
    lines.push("Headline platforms are listed here by policy even when their steps are supported: they are capped at needs_human until a human signs off.");
  }
  lines.push("");
  lines.push("## Method and limits");
  lines.push("");
  lines.push("- The verifier reads only the fetched HTML text. Docs rendered entirely client-side may yield fewer supported steps. That is reported, not guessed.");
  lines.push("- A field is supported when at least max(2, ceil(0.5 x key-term count)) of its key terms co-occur in one window of the fetched page.");
  lines.push("- \"supported\" means the step's key terms literally appear together in the cited doc, with the excerpt and matched terms recorded. That is evidence for a human to check, not proof of semantic agreement. This is why headline claims are still capped for human sign-off.");
  lines.push("- Fetches are cached by URL under `verify/.cache/` so reruns are deterministic. Use `--refresh` to refetch.");
  lines.push("");

  fs.writeFileSync(path.join(ROOT, "verify-summary.md"), `${lines.join("\n")}\n`);
  return { recordCounts, stepCounts, review };
}

// ---- Main -----------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const headlineSet = loadHeadline();
  const roster = readJson(path.join(ROOT, "roster.json"), []);

  let slugs = roster.map((e) => e.slug);
  if (args.only) {
    const wanted = new Set(args.only.map((s) => s.toLowerCase()));
    slugs = slugs.filter((s) => wanted.has(s.toLowerCase()));
    const missing = [...wanted].filter((w) => !roster.some((e) => e.slug.toLowerCase() === w));
    for (const m of missing) console.warn(`--only: no record for "${m}"`);
  }

  fs.mkdirSync(VERIFY_DIR, { recursive: true });
  const docCache = new Map();
  const results = [];

  for (const slug of slugs) {
    const file = path.join(ROOT, "records", `${slug}.json`);
    if (!fs.existsSync(file)) {
      console.warn(`skip: no record file for ${slug}`);
      continue;
    }
    const record = readJson(file, null);
    if (!record) {
      console.warn(`skip: could not parse ${slug}.json`);
      continue;
    }
    process.stdout.write(`verifying ${slug}… `);
    const result = await verifyRecord(record, headlineSet, args.refresh, docCache);
    fs.writeFileSync(path.join(VERIFY_DIR, `${slug}.json`), `${JSON.stringify(result, null, 2)}\n`);
    console.log(`${result.verdict} (${result.supported_required_step_count}/${result.required_step_count} required steps supported)`);
    results.push(result);
  }

  const { recordCounts, stepCounts, review } = writeSummary(results, args, headlineSet);

  console.log("\n=== Verification summary ===");
  console.log(`records: ${results.length} | verified: ${recordCounts.verified} | needs_human: ${recordCounts.needs_human}`);
  console.log(`steps: supported ${stepCounts.supported} | unsupported ${stepCounts.unsupported} | source_unreachable ${stepCounts.source_unreachable} | non_official_domain ${stepCounts.non_official_domain} | no_sources ${stepCounts.no_sources}`);
  console.log(`human review needed: ${review.length ? review.map((r) => r.slug).join(", ") : "none"}`);
  console.log("wrote verify/<slug>.json and verify-summary.md");
}

main().catch((err) => {
  console.error("verify failed:", err);
  process.exit(1);
});
