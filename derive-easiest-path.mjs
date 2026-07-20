// Derives the "easiest path to first success" dataset for all roster platforms.
//
// For each platform it selects ONE easiest documented route to first success and
// scores it three ways: steps, a weighted friction score, and an estimated time.
//
// Sources:
//   records/*.json    canonical first-mile records (used for 136 platforms whose
//                     docs already expose a usable route).
//   research/*.json   live-docs re-research for the 69 platforms whose canonical
//                     record had no usable path (blocked signup, or orientation-only).
//
// Output: easiest-path.json
//
// The estimated time is a transparent heuristic, NOT a measured or vendor-stated
// time. It exists to compare platforms on one scale. See MODEL below.
//
// Run: node derive-easiest-path.mjs

import fs from "node:fs";

// ---- MODEL ---------------------------------------------------------------
// Base minutes per step by phase.
const BASE_MIN = { arrive: 0.5, access: 2, authenticate: 1.5, configure: 1, execute: 1, verify: 1, other: 1 };
// Extra minutes + friction points per friction flag on a step.
const FLAG = {
  account: { min: 3, pts: 3 },
  payment: { min: 1, pts: 3 },
  install: { min: 2, pts: 2 },
  verify: { min: 2, pts: 2 },
  credential: { min: 1, pts: 1 },
  wait: { min: 2, pts: 1 },
  permission: { min: 1, pts: 1 },
};

// Keyword detection for records/*.json steps (which are free text, not pre-flagged).
const SIGNALS = [
  { key: "account", re: /\b(sign up|signup|register|registration|create (a |an )?(free )?account|create.*tenant)\b/i },
  { key: "verify", re: /\b(verif|confirm your email|confirmation email|email verification|activate)\b/i },
  { key: "payment", re: /\b(payment|billing|credit card|add a card|enter card|subscription|upgrade to)\b/i },
  { key: "install", re: /\b(install|download|npm (i|install)|pip install|brew install|apt|docker pull|clone the|git clone|homebrew)\b/i },
  { key: "credential", re: /\b(api key|access token|bearer token|secret key|client secret|credential|generate.*key)\b/i },
  { key: "wait", re: /\b(wait|provision|build and deploy|deploying|deploy (your|the)|spin up|initializ|until.*(live|ready|active))\b/i },
  { key: "permission", re: /\b(authorize|authorization|grant|permission|oauth|consent)\b/i },
];

function flagsFromRecordStep(step) {
  const text = [step.action, ...(step.details || [])].join(" ");
  const flags = new Set();
  for (const s of SIGNALS) if (s.re.test(text)) flags.add(s.key);
  if ((step.phase || "").toLowerCase() === "execute" && (step.actor || "").toLowerCase() === "platform") flags.add("wait");
  return [...flags];
}

function score(steps, flagsOf) {
  let minutes = 0, friction = 0;
  for (const st of steps) {
    minutes += BASE_MIN[(st.phase || "other").toLowerCase()] ?? BASE_MIN.other;
    for (const f of flagsOf(st)) if (FLAG[f]) { minutes += FLAG[f].min; friction += FLAG[f].pts; }
  }
  return { steps: steps.length, friction, minutes: Math.round(minutes) };
}

function firstSuccessType(surface, outcome) {
  const t = `${surface} ${outcome}`.toLowerCase();
  if (/\b(deploy|deployed|live|onrender|instance|server|vm|linode|provision.*(app|instance))\b/.test(t)) return "deploy / host";
  if (/\b(api (call|request|response)|access token|bearer|endpoint|curl|sdk .*request|prints|returns.*response)\b/.test(t)) return "first API/SDK call";
  if (/\b(database|cluster|bucket|table|query|sql|dataset|collection|index)\b/.test(t)) return "database / data";
  if (/\b(sign(ed)? in|login|authenticat|user is|registered user|auth)\b/.test(t)) return "auth / login";
  if (/\b(dashboard|console|monitor|trace|metric|incident|alert)\b/.test(t)) return "dashboard / telemetry";
  if (/\b(message|sms|email|call|video|stream|transcri|speech|payment|checkout|transaction|charge)\b/.test(t)) return "message / media / payment";
  if (/\b(app runs|runs locally|hello world|preview|first app|scaffold)\b/.test(t)) return "local app runs";
  return "other";
}

// ---- Load re-research keyed by slug --------------------------------------
const research = new Map();
if (fs.existsSync("research")) {
  for (const f of fs.readdirSync("research").filter((f) => f.endsWith(".json"))) {
    for (const o of JSON.parse(fs.readFileSync(`research/${f}`))) research.set(o.slug, o);
  }
}

// ---- Build rows ----------------------------------------------------------
const rows = [];
for (const f of fs.readdirSync("records").filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(fs.readFileSync(`records/${f}`));
  const slug = r.platform.slug;
  const boundary = r.documented_first_success?.boundary_evidence?.type || "none";
  const primaryLen = (r.primary_path || []).length;
  const primaryReaches = boundary !== "not-established-by-docs" && primaryLen > 0;
  const candidates = (r.candidate_paths || []).filter((c) => (c.steps || []).length);

  let chosen = null, routeName = null, source = "record";
  if (r.research_status === "complete") {
    chosen = score(r.primary_path, flagsFromRecordStep); routeName = "primary path";
  } else if (candidates.length) {
    let best = null;
    for (const c of candidates) {
      const s = score(c.steps, flagsFromRecordStep);
      if (!best || s.steps < best.s.steps) best = { s, name: c.name || "candidate" };
    }
    chosen = best.s; routeName = best.name;
  } else if (primaryReaches && primaryLen >= 5) {
    chosen = score(r.primary_path, flagsFromRecordStep); routeName = "primary path";
  }

  let firstSuccess = firstSuccessType(r.surface?.name || "", r.documented_first_success?.normalized_outcome || "");
  let outcome = (r.documented_first_success?.normalized_outcome || "").slice(0, 200);
  let confidence = "documented";

  // Fall back to re-research when the record exposes no usable path.
  if (!chosen && research.has(slug)) {
    const o = research.get(slug);
    if (o.steps && o.steps.length) {
      chosen = score(o.steps, (st) => st.flags || []);
      routeName = o.routeName || "re-researched route";
      firstSuccess = o.firstSuccessType || firstSuccess;
      outcome = (o.firstSuccessOutcome || "").slice(0, 200);
      confidence = o.confidence || "medium";
      source = "re-research";
    }
  }

  rows.push({
    name: r.platform.name,
    slug,
    category: r.category,
    original_status: r.research_status,
    first_success_type: firstSuccess,
    outcome,
    route: routeName,
    steps: chosen?.steps ?? null,
    friction_score: chosen?.friction ?? null,
    est_minutes: chosen?.minutes ?? null,
    source,
    confidence,
    needs_research: !chosen,
  });
}

rows.sort((a, b) => (a.est_minutes ?? 1e9) - (b.est_minutes ?? 1e9) || a.name.localeCompare(b.name));

const covered = rows.filter((r) => !r.needs_research);
const out = {
  generated_at: new Date().toISOString(),
  description: "Easiest documented route to first success per platform, scored by steps, friction, and estimated time.",
  model: {
    est_minutes: "sum of per-step base minutes by phase + per-flag extras; a heuristic estimate, not a vendor claim",
    base_minutes_by_phase: BASE_MIN,
    flag_weights: FLAG,
  },
  count: rows.length,
  covered: covered.length,
  needs_research: rows.length - covered.length,
  rows,
};
fs.writeFileSync("easiest-path.json", JSON.stringify(out, null, 2));
console.log(`rows ${rows.length} | covered ${covered.length} | needs_research ${rows.length - covered.length}`);
console.log("from records:", rows.filter((r) => r.source === "record").length, "| from re-research:", rows.filter((r) => r.source === "re-research").length);
