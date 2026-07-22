// Shared measurement library for the DevRelCon First-Mile dataset.
//
// This is the single source of truth for turning a raw record into normalized,
// analysis-safe measurements. Both build-ds-quality.mjs and build-selected-path.mjs
// import from here so counts never diverge.
//
// Design rules:
//   - Prefer structured fields (actor, phase, interface, required, friction_gates.type)
//     over free-text regex. Regex is a fallback and every match records its evidence.
//   - Never collapse raw transitions, developer actions, platform events, waits,
//     documentation navigation, and decisions into one number.
//   - Every heuristic detector returns {field, step_number, excerpt, rule, detector_version}
//     so a reader can see why a flag fired.
//
// See MEASUREMENT-CONTRACT.txt for the definitions these functions implement.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

export const MEASUREMENT_CONTRACT_VERSION = "1.0";
export const DS_QUALITY_SCHEMA_VERSION = "1.0";
export const DETECTOR_VERSION = "1.0";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Actors that represent the developer doing intentional work.
const DEVELOPER_ACTORS = new Set(["developer", "administrator"]);
// Actors that represent the platform/system responding automatically.
const PLATFORM_ACTORS = new Set(["platform", "system", "external-system"]);

const LOCAL_INTERFACES = new Set(["cli", "code", "ide", "desktop-app", "device", "hardware"]);
const HOSTED_INTERFACES = new Set(["console", "web-console", "web-ui", "browser", "api"]);

// ---- Detector rule tables -------------------------------------------------

// Contradiction detector. Applied ONLY to a complete record's selected-route
// success fields. Not applied to selection_basis or uncertainties, where honest
// platform-wide ambiguity is allowed to live.
export const CONTRADICTION_RULES = [
  { rule: "not-established", re: /\bnot established\b/i },
  { rule: "no-single-milestone", re: /\bno single[^.]*\bmilestone\b/i },
  { rule: "no-scoped-milestone", re: /\bno\s+\S*(?:-wide|-level)\b[^.]*\bmilestone\b/i },
  { rule: "no-cross-scope-success", re: /\bno\s+(?:platform-wide|cross-product|cross-platform|cross-scenario)[^.]*\b(?:milestone|first[- ]?success|completion signal)\b/i },
  { rule: "cannot-be-reconstructed", re: /\bcannot be (?:reconstructed|established)\b/i },
  { rule: "human-selection-required", re: /\bhuman selection[^.]*required\b/i },
  { rule: "human-judgment", re: /\bhuman[- ]judg?ment\b/i },
  { rule: "needs-human-judgment-literal", re: /needs-human-judgment/i },
  { rule: "unresolved", re: /\bunresolved\b/i },
  { rule: "no-complete-route", re: /\bno complete first[- ]?user\b/i },
  { rule: "required-before-first-success", re: /\brequired before a documented first[- ]?success\b/i },
  { rule: "does-not-establish-complete", re: /\bdo(?:es)? not establish the complete\b/i },
  { rule: "no-single-completion-signal", re: /\bno single[^.]*\b(?:completion signal|first[- ]?success)\b/i },
  // Targeted: docs "do not establish/select which route|path|milestone". This
  // catches an uncommitted multi-route record without flagging honest precision
  // like "the page does not document a post-click toast" on a named terminal.
  { rule: "route-not-established", re: /\bdo(?:es)? not (?:specify|establish|document|reconstruct|select)\b[^.]*\b(?:route|path|milestone|first[- ]?success|platform-level|platform-wide)\b/i },
  { rule: "route-selector-unresolved", re: /\broute selector must be resolved\b/i },
];

const OPAQUE_SIGNUP_RULES = [
  { rule: "opaque-literal", re: /\bopaque\b/i },
  { rule: "not-enumerated", re: /\b(do(?:es)? not|cannot) enumerate\b/i },
  { rule: "client-rendered-shell", re: /client-rendered|application shell/i },
  { rule: "undisclosed-fields", re: /\bundisclosed\b/i },
  { rule: "fields-not-published", re: /\b(do(?:es)? not|cannot) (?:publish|expose|list)[^.]*(form|field|registration|signup|sign-up|sign up)\b/i },
];

const STARTING_STATE_RULES = {
  code: [
    { rule: "existing-repo", re: /\bexisting (?:git ?hub |gitlab |bitbucket )?(?:repository|repo|codebase|code|project|application|app)\b/i },
    { rule: "source-already-exists", re: /\bsource (?:code )?already exists\b/i },
    { rule: "already-have-code", re: /\balready (?:have|has)[^.]*(repository|repo|codebase|application|app)\b/i },
    { rule: "bring-your-own-code", re: /\bbring your own (?:code|app|repository)\b/i },
  ],
  tenant: [
    { rule: "existing-tenant", re: /\bexisting (?:tenant|organization|org|workspace|project|instance)\b/i },
    { rule: "tenant-exists", re: /\btenant exists\b/i },
    { rule: "provisioned-tenant", re: /\bprovisioned tenant\b/i },
    { rule: "org-specific-tenant", re: /\borganization-(?:specific|provisioned)[^.]*tenant\b/i },
    { rule: "already-have-tenant", re: /\balready (?:have|has)[^.]*(tenant|organization|workspace)\b/i },
  ],
  data: [
    { rule: "already-ingested", re: /\balready ingested\b/i },
    { rule: "metrics-already-available", re: /\bmetrics are (?:already )?(?:ingested|available|visible)\b/i },
    { rule: "existing-data", re: /\bexisting (?:data|dataset|records|table|metrics|logs|traces|events)\b/i },
    { rule: "data-already-present", re: /\b(?:data|records|metrics|logs|traces) (?:is|are) already\b/i },
  ],
  infrastructure: [
    { rule: "existing-infra", re: /\bexisting (?:cluster|kubernetes|k8s|server|database|instance|vpc|network)\b/i },
    { rule: "running-infra", re: /\brunning (?:cluster|instance|database|server)\b/i },
    { rule: "already-have-infra", re: /\balready (?:have|has)[^.]*(cluster|instance|server|database)\b/i },
    { rule: "cluster-available", re: /\ba (?:cluster|kubernetes cluster) is (?:available|running)\b/i },
  ],
  account: [
    { rule: "existing-account", re: /\bexisting account\b/i },
    { rule: "already-have-account", re: /\balready (?:have|has)[^.]*account\b/i },
    { rule: "already-signed-in", re: /\b(?:logged in|signed in|already authenticated|authenticated (?:session|user))\b/i },
  ],
};

const SIGNUP_STEP_RE = /\b(?:sign ?up|create (?:a |an )?(?:free )?account|register\b|registration|create your[^.]*account)\b/i;

// Second-verb detector for potentially composite (non-atomic) steps.
const NON_ATOMIC_RE = /(?:,\s*|\s+and\s+|\s+then\s+|;\s*)(create|configure|run|open|select|enter|add|install|deploy|click|authorize|provide|set|choose|navigate|obtain|authenticate|scroll|locate|download|define|connect|generate|copy|paste|submit|verify|confirm|build)\b/i;

const LOCAL_TEXT_RE = /\blocalhost|docker|self-host|on-prem|local machine|your terminal|pipx|npm (?:i|install)|pip install|brew install|homebrew\b/i;
const PLAYGROUND_TEXT_RE = /\bplayground|sandbox|try it (?:out|now)|in-browser|no account (?:required|needed)|without (?:an )?account\b/i;
const HOSTED_TEXT_RE = /\bdashboard|console|cloud|hosted|web app|web ui\b/i;
const INSTALL_TEXT_RE = /\b(?:install|download|npm (?:i|install)|pip install|brew install|docker pull|git clone|clone the)\b/i;

// ---- Helpers --------------------------------------------------------------

function actorClass(actor) {
  const a = String(actor || "").toLowerCase();
  if (DEVELOPER_ACTORS.has(a)) return "developer";
  if (PLATFORM_ACTORS.has(a)) return "platform";
  return "other";
}

function excerpt(text, re, span = 90) {
  const m = String(text).match(re);
  if (!m) return String(text).slice(0, span);
  const start = Math.max(0, m.index - 20);
  return String(text).slice(start, m.index + m[0].length + span).trim();
}

function firstMatch(rules, text) {
  if (!text) return null;
  for (const { rule, re } of rules) {
    if (re.test(text)) return { rule, excerpt: excerpt(text, re) };
  }
  return null;
}

function stepText(step) {
  return [step.action, ...(step.details || []), step.input, step.output, step.success_signal, step.failure_or_wait]
    .filter(Boolean)
    .join(" ");
}

// ---- Transition classification --------------------------------------------

export function classifyTransitions(record) {
  const steps = Array.isArray(record.primary_path) ? record.primary_path : [];
  const gates = Array.isArray(record.friction_gates) ? record.friction_gates : [];

  let developer = 0;
  let platform = 0;
  let requiredDev = 0;
  let optionalDev = 0;
  let docNav = 0;

  for (const step of steps) {
    const cls = actorClass(step.actor);
    if (cls === "developer") {
      developer += 1;
      if (step.required === false) optionalDev += 1;
      else requiredDev += 1;
    } else if (cls === "platform") {
      platform += 1;
    }
    if (String(step.interface || "").toLowerCase() === "documentation") docNav += 1;
  }

  // Wait/async: any step in a wait phase, plus any step targeted by a wait gate.
  const waitSteps = new Set();
  for (const step of steps) {
    if (String(step.phase || "").toLowerCase() === "wait") waitSteps.add(step.step_number);
  }
  for (const gate of gates) {
    if (String(gate.type || "").toLowerCase() === "wait") waitSteps.add(gate.at_step);
  }

  // Decisions: steps targeted by a choice gate (structured signal).
  const decisionSteps = new Set();
  for (const gate of gates) {
    if (String(gate.type || "").toLowerCase() === "choice") decisionSteps.add(gate.at_step);
  }

  return {
    raw_transition_count: steps.length,
    developer_action_count: developer,
    required_developer_action_count: requiredDev,
    optional_developer_action_count: optionalDev,
    platform_event_count: platform,
    documentation_navigation_count: docNav,
    wait_or_async_count: waitSteps.size,
    decision_count: decisionSteps.size,
    gate_count: gates.length,
  };
}

// ---- Starting-state detection ---------------------------------------------

export function detectStartingState(record) {
  const assumed = record.entry_point?.assumed_prior_state || [];
  const prereqs = record.prerequisites || [];
  const steps = record.primary_path || [];
  const matches = [];

  const state = { account: "not-required", tenant: "not-required", code: "not-required", data: "not-required", infrastructure: "not-required" };

  const scan = (dimension) => {
    for (let i = 0; i < assumed.length; i += 1) {
      const hit = firstMatch(STARTING_STATE_RULES[dimension], assumed[i]);
      if (hit) {
        matches.push({ dimension, field: `entry_point.assumed_prior_state[${i}]`, step_number: null, excerpt: hit.excerpt, rule: hit.rule, detector_version: DETECTOR_VERSION });
        return true;
      }
    }
    for (let i = 0; i < prereqs.length; i += 1) {
      const hit = firstMatch(STARTING_STATE_RULES[dimension], prereqs[i].requirement);
      if (hit) {
        matches.push({ dimension, field: `prerequisites[${i}].requirement`, step_number: null, excerpt: hit.excerpt, rule: hit.rule, detector_version: DETECTOR_VERSION });
        return true;
      }
    }
    return false;
  };

  for (const dim of ["code", "tenant", "data", "infrastructure"]) {
    if (scan(dim)) state[dim] = "existing-assumed";
  }

  // Account: signup step present -> included; else existing assumption -> existing-assumed;
  // else if an account gate/prereq exists -> assumed-existing; else not-required.
  const signupStep = steps.find((s) => actorClass(s.actor) === "developer" && (String(s.phase || "").toLowerCase() === "account" || SIGNUP_STEP_RE.test(s.action || "")));
  if (signupStep) {
    state.account = "included-in-path";
    matches.push({ dimension: "account", field: `primary_path[${signupStep.step_number - 1}].action`, step_number: signupStep.step_number, excerpt: excerpt(signupStep.action, SIGNUP_STEP_RE), rule: "signup-step-present", detector_version: DETECTOR_VERSION });
  } else if (scan("account")) {
    state.account = "existing-assumed";
  } else {
    const accountGate = (record.friction_gates || []).some((g) => String(g.type || "").toLowerCase() === "account");
    const accountPrereq = prereqs.some((p) => ["account", "access", "identity"].includes(String(p.type || "").toLowerCase()) && p.required !== false);
    if (accountGate || accountPrereq) state.account = "assumed-existing";
  }

  return { state, matches };
}

// ---- Requirements & environment -------------------------------------------

export function detectExecutionEnvironment(record) {
  const steps = record.primary_path || [];
  const surface = record.surface?.name || "";
  const allText = surface + " " + steps.map(stepText).join(" ");

  let localIf = 0;
  let hostedIf = 0;
  for (const step of steps) {
    const iface = String(step.interface || "").toLowerCase();
    if (LOCAL_INTERFACES.has(iface)) localIf += 1;
    if (HOSTED_INTERFACES.has(iface)) hostedIf += 1;
  }
  const localText = LOCAL_TEXT_RE.test(allText);
  const playgroundText = PLAYGROUND_TEXT_RE.test(allText);
  const hostedText = HOSTED_TEXT_RE.test(allText);

  // Interface signals are authoritative. Free text is only a fallback so that a
  // hosted dashboard route is not called "hybrid" merely because it mentions a
  // Docker runtime option.
  let env;
  if (localIf > 0 && hostedIf > 0) env = "hybrid";
  else if (localIf > 0) env = "local";
  else if (hostedIf > 0) env = "hosted";
  else if (localText && !hostedText) env = "local";
  else if (playgroundText) env = "playground";
  else env = "hosted";

  return {
    execution_environment: env,
    evidence: { local_interface_steps: localIf, hosted_interface_steps: hostedIf, local_text: localText, playground_text: playgroundText, hosted_text: hostedText },
  };
}

export function detectRequirements(record) {
  const prereqs = record.prerequisites || [];
  const gates = record.friction_gates || [];
  const steps = record.primary_path || [];

  const gateType = (t) => gates.some((g) => String(g.type || "").toLowerCase() === t);
  const prereqType = (types, requiredOnly = true) => prereqs.some((p) => types.includes(String(p.type || "").toLowerCase()) && (!requiredOnly || p.required !== false));

  const account_requirement = (gateType("account") || prereqType(["account", "access", "identity"])) ? "required" : "not-required";

  const paymentRequired = gateType("payment") || prereqType(["billing", "plan"]);
  const payment_requirement = paymentRequired ? "required" : "not-required";

  const installRequired = steps.some((s) => String(s.phase || "").toLowerCase() === "install") || gateType("installation") || gateType("download");
  const installation_requirement = installRequired ? "required" : "not-required";

  return { account_requirement, payment_requirement, installation_requirement };
}

export function detectOpaqueSignup(record) {
  const steps = record.primary_path || [];
  for (let i = 0; i < steps.length; i += 1) {
    const hit = firstMatch(OPAQUE_SIGNUP_RULES, stepText(steps[i]));
    if (hit) return { opaque: true, match: { field: `primary_path[${i}]`, step_number: steps[i].step_number, excerpt: hit.excerpt, rule: hit.rule, detector_version: DETECTOR_VERSION } };
  }
  const uncertainties = record.uncertainties || [];
  for (let i = 0; i < uncertainties.length; i += 1) {
    const text = [uncertainties[i].question, uncertainties[i].impact, uncertainties[i].reason_unresolved].filter(Boolean).join(" ");
    const hit = firstMatch(OPAQUE_SIGNUP_RULES, text);
    if (hit) return { opaque: true, match: { field: `uncertainties[${i}]`, step_number: null, excerpt: hit.excerpt, rule: hit.rule, detector_version: DETECTOR_VERSION } };
  }
  return { opaque: false, match: null };
}

// ---- Contradictions & non-atomic steps ------------------------------------

export function detectContradictions(record) {
  if (record.research_status !== "complete") return [];
  const success = record.documented_first_success || {};
  const fields = [
    ["surface.name", record.surface?.name],
    ["documented_first_success.official_milestone", success.official_milestone],
    ["documented_first_success.normalized_outcome", success.normalized_outcome],
    ["documented_first_success.observable_completion_signal", success.observable_completion_signal],
    ["documented_first_success.why_this_is_the_boundary", success.why_this_is_the_boundary],
  ];
  const matches = [];
  for (const [field, text] of fields) {
    if (typeof text !== "string") continue;
    for (const { rule, re } of CONTRADICTION_RULES) {
      if (re.test(text)) {
        matches.push({ field, step_number: null, excerpt: excerpt(text, re), rule, detector_version: DETECTOR_VERSION });
        break;
      }
    }
  }
  return matches;
}

export function detectNonAtomicSteps(record) {
  const steps = record.primary_path || [];
  const matches = [];
  for (let i = 0; i < steps.length; i += 1) {
    const action = steps[i].action || "";
    const m = action.match(NON_ATOMIC_RE);
    if (m) {
      matches.push({ field: `primary_path[${i}].action`, step_number: steps[i].step_number, excerpt: excerpt(action, NON_ATOMIC_RE), rule: "second-imperative-verb", detector_version: DETECTOR_VERSION });
    }
  }
  return matches;
}

// ---- First-success type (category-aware, security-safe) --------------------

export function firstSuccessType(record) {
  const cat = String(record.category || "").toLowerCase();
  const text = [record.surface?.name, record.documented_first_success?.normalized_outcome, record.documented_first_success?.observable_completion_signal]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  const isSecurity = /security/.test(cat) || /\b(scan|vulnerab|finding|sast|dast|secret detection|cve|command[- ]injection|misconfig)\b/.test(text);
  const isComms = /(communication|messaging|comms|voice|telephon)/.test(cat) || /\b(send (?:an? )?(?:sms|text|message|email)|deliver (?:a )?message|phone call|voice call|video call|make a call|place a call|outbound call|inbound call)\b/.test(text);

  if (/\b(deploy|deployed|live|onrender|provision(?:ed|s)? (?:an? )?(?:app|service|instance)|hosted (?:app|service)|service is live)\b/.test(text)) return "deploy / host";
  if (/\b(api (?:call|request|response)|http 200|returns? (?:a )?(?:200|response|json)|curl|sdk (?:call|request)|endpoint responds|first request|access token|bearer)\b/.test(text)) return "first API/SDK call";
  if (isSecurity) return "security scan / finding";
  if (/\b(dashboard|trace|span|telemetry|incident|alert|log line|observab|metric)\b/.test(text) || /observab/.test(cat)) return "dashboard / telemetry";
  if (/\b(database|cluster|bucket|table|collection|dataset|index|query returns|rows?)\b/.test(text)) return "database / data";
  if (isComms) return "message / media";
  if (/\b(payment|checkout|charge|transaction|invoice|refund|payout)\b/.test(text)) return "payment";
  if (/\b(stream|transcri|speech|text-to-speech|render (?:a )?video)\b/.test(text)) return "media";
  if (/\b(sign(?:ed)? in|log(?:ged)? in|authenticat|registered user|session (?:token|established))\b/.test(text)) return "auth / login";
  if (/\b(app runs|runs locally|hello world|preview|first app|scaffold)\b/.test(text)) return "local app runs";
  return "other";
}

// ---- Route selection method -----------------------------------------------

export function routeSelectionMethod(record) {
  const basis = record.surface?.selection_basis || "";
  if (/workshop selection policy|selection policy \(20\d\d/i.test(basis)) return "policy-selected";
  if ((record.surface?.alternatives_considered || []).length === 0) return "single-documented-route";
  return "documented-default";
}

// ---- Comparability --------------------------------------------------------

export function comparability(record, ctx) {
  const reasons = [];
  const {
    transitions, startingState, opaque, env, requirements, contradictions,
    nonAtomic, boundaryType, reResearched,
  } = ctx;

  if (contradictions.length) reasons.push("contradictory selected-route success labels (see detector_matches)");

  const ss = startingState.state;
  if (ss.code === "existing-assumed") reasons.push("assumes existing code or repository");
  if (ss.tenant === "existing-assumed") reasons.push("assumes an existing tenant or organization");
  if (ss.data === "existing-assumed") reasons.push("assumes data is already present");
  if (ss.infrastructure === "existing-assumed") reasons.push("assumes existing infrastructure");
  if (ss.account === "existing-assumed" || ss.account === "assumed-existing") reasons.push("assumes an existing account rather than including signup");

  if (opaque) reasons.push("signup or access step is opaque (fields not documented)");
  if (transitions.documentation_navigation_count > 0) reasons.push("path includes documentation-navigation steps");
  if (transitions.platform_event_count > 0) reasons.push("raw path includes platform events, not only developer actions");
  if (boundaryType && boundaryType !== "explicitly-named") reasons.push(`boundary evidence is ${boundaryType}, not an explicitly named vendor milestone`);
  if (transitions.developer_action_count <= 4) reasons.push("very short path (<= 4 developer actions)");
  if (reResearched) reasons.push("re-researched compact step granularity differs from the canonical cohort");
  if (nonAtomic.length > 0) reasons.push(`contains ${nonAtomic.length} potentially composite step(s)`);
  if (env !== "hosted") reasons.push(`execution environment is ${env}, not hosted`);
  if (requirements.installation_requirement === "required") reasons.push("requires local installation");

  let status;
  if (contradictions.length) status = "not-comparable";
  else if (reasons.length) status = "conditional";
  else status = "comparable";

  return { status, reasons };
}

// ---- Re-researched cohort (provenance) ------------------------------------

let RE_RESEARCHED_CACHE = null;
export function reResearchedSlugs() {
  if (RE_RESEARCHED_CACHE) return RE_RESEARCHED_CACHE;
  const set = new Set();
  const dir = path.join(ROOT, "research");
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith(".json"))) {
      const arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const o of arr) if (o.slug) set.add(o.slug);
    }
  }
  RE_RESEARCHED_CACHE = set;
  return set;
}

// ---- Deterministic input hash ---------------------------------------------

export function inputHash() {
  const hash = crypto.createHash("sha256");
  const roster = fs.readFileSync(path.join(ROOT, "roster.json"), "utf8");
  hash.update("roster\0" + roster);
  const recordsDir = path.join(ROOT, "records");
  const files = fs.readdirSync(recordsDir).filter((n) => n.endsWith(".json")).sort();
  for (const f of files) hash.update("\0" + f + "\0" + fs.readFileSync(path.join(recordsDir, f), "utf8"));
  hash.update("\0contract\0" + MEASUREMENT_CONTRACT_VERSION);
  return hash.digest("hex");
}

// ---- Deterministic "as-of" date derived from source, not wall clock -------

export function sourceSnapshotDate() {
  const recordsDir = path.join(ROOT, "records");
  let max = "0000-00-00";
  for (const f of fs.readdirSync(recordsDir).filter((n) => n.endsWith(".json"))) {
    const r = JSON.parse(fs.readFileSync(path.join(recordsDir, f), "utf8"));
    if (typeof r.researched_at === "string" && r.researched_at > max) max = r.researched_at;
  }
  return max;
}

// ---- Effort score (single source of truth for the heuristic) --------------

// Effort weights operate on NORMALIZED counts, never on raw transitions.
// Platform events are excluded because they are automatic, not developer work.
export const WEIGHTS = {
  required_developer_action: 1,
  optional_developer_action: 0.5,
  documentation_navigation: 0.25,
  wait_or_async: 0.5,
};
// Per-friction-gate-type weights.
export const GATE_WEIGHTS = {
  account: 3, payment: 3, billing: 3, verification: 2, approval: 2,
  installation: 2, download: 1, credential: 1, permission: 1,
  wait: 1, choice: 1, configuration: 1, environment: 1, form: 1,
  policy: 1, access: 1, dns: 1, domain: 1, hardware: 1, knowledge: 1,
  legal: 1, limit: 1, "rate-limit": 1, terms: 1, other: 1,
};

export function gateWeightSum(record) {
  let sum = 0;
  for (const gate of record.friction_gates || []) {
    sum += GATE_WEIGHTS[String(gate.type || "other").toLowerCase()] ?? 1;
  }
  return sum;
}

export function effortScore(t, record) {
  const score =
    WEIGHTS.required_developer_action * t.required_developer_action_count +
    WEIGHTS.optional_developer_action * t.optional_developer_action_count +
    WEIGHTS.documentation_navigation * t.documentation_navigation_count +
    WEIGHTS.wait_or_async * t.wait_or_async_count +
    gateWeightSum(record);
  return Math.round(score * 10) / 10;
}

/**
 * Turn one record into the selected-path-heuristic row shape. Single source of
 * truth shared by build-selected-path.mjs and the runtime research pipeline, so
 * a freshly-researched record is measured exactly like the committed dataset.
 */
export function selectedPathRow(record) {
  const a = analyzeRecord(record);
  const t = a.transitions;
  return {
    name: record.platform.name,
    slug: record.platform.slug,
    category: record.category,
    research_status: record.research_status,
    selected_surface: record.surface?.name || null,
    route_selection_method: a.route_selection_method,
    boundary_evidence_type: a.boundary_evidence_type,
    first_success_type: a.first_success_type,
    outcome: (record.documented_first_success?.normalized_outcome || "").slice(0, 240),
    raw_transition_count: t.raw_transition_count,
    developer_action_count: t.developer_action_count,
    required_developer_action_count: t.required_developer_action_count,
    optional_developer_action_count: t.optional_developer_action_count,
    platform_event_count: t.platform_event_count,
    documentation_navigation_count: t.documentation_navigation_count,
    wait_or_async_count: t.wait_or_async_count,
    gate_count: t.gate_count,
    heuristic_effort_score: effortScore(t, record),
    comparability_status: a.comparability_status,
  };
}

// ---- Full per-record analysis (used by both generators) -------------------

export function analyzeRecord(record) {
  const transitions = classifyTransitions(record);
  const startingState = detectStartingState(record);
  const env = detectExecutionEnvironment(record);
  const requirements = detectRequirements(record);
  const opaqueResult = detectOpaqueSignup(record);
  const contradictions = detectContradictions(record);
  const nonAtomic = detectNonAtomicSteps(record);
  const boundaryType = record.documented_first_success?.boundary_evidence?.type || null;
  const reResearched = reResearchedSlugs().has(record.platform?.slug);

  const detectorMatches = [
    ...startingState.matches.map((m) => ({ detector: "starting-state", ...m })),
    ...(opaqueResult.match ? [{ detector: "opaque-signup", ...opaqueResult.match }] : []),
    ...contradictions.map((m) => ({ detector: "contradictory-success-label", ...m })),
    ...nonAtomic.map((m) => ({ detector: "non-atomic-step", ...m })),
  ];

  const cmp = comparability(record, {
    transitions, startingState, opaque: opaqueResult.opaque, env: env.execution_environment,
    requirements, contradictions, nonAtomic, boundaryType, reResearched,
  });

  const existingAssets = [];
  for (const [k, v] of Object.entries(startingState.state)) {
    if (v === "existing-assumed" || v === "assumed-existing") existingAssets.push(k);
  }

  return {
    transitions,
    startingState: startingState.state,
    execution_environment: env.execution_environment,
    requirements,
    opaque_signup: opaqueResult.opaque,
    contradictory_success_labels: contradictions.length > 0,
    non_atomic_step_count: nonAtomic.length,
    boundary_evidence_type: boundaryType,
    route_selection_method: routeSelectionMethod(record),
    first_success_type: firstSuccessType(record),
    re_researched: reResearched,
    existing_asset_requirements: existingAssets,
    comparability_status: cmp.status,
    comparability_reasons: cmp.reasons,
    detector_matches: detectorMatches,
  };
}
