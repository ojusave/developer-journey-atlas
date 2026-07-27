import type { DocHit, LLMProvider, PlatformRecord } from "../core/ports.js";
import type { RecordValidator } from "../core/validate.js";
import {
  draftBlockingJourneyFindings,
  validateJourneyGraph,
  type JourneyGraph,
} from "../core/journeyGraph.js";
import { findSupportingExcerpt, prepareDoc } from "../../lib/verify-core.mjs";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;
const MAX_PROMPT_DOCS = 8;
const MAX_PROMPT_CONTENT_CHARS = 8_000;

/**
 * Deterministic terminal failure: the model could not produce a schema-valid
 * record within the bounded repair policy. This is NOT transient, so callers
 * must treat it as a final outcome rather than retrying it.
 */
export class SchemaRepairError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SchemaRepairError";
  }
}

interface ChatChoice {
  message?: { content?: string };
}
interface ChatResponse {
  choices?: ChatChoice[];
  error?: { message?: string };
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

const ONBOARDING_SIGNAL =
  /\b(sign.?up|account|verify|verification|billing|payment|credit|api.?key|token|credential|quick.?start|curl|request|response|endpoint|model|console|dashboard)\b/i;

export function boundedPromptContent(content: string): string {
  if (content.length <= MAX_PROMPT_CONTENT_CHARS) return content;
  const opening = content.slice(0, 1_800);
  const segments = content
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-Z0-9])/)
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0 && ONBOARDING_SIGNAL.test(segment));
  const selected = [opening];
  let length = opening.length;
  for (const segment of segments) {
    if (opening.includes(segment)) continue;
    if (length + segment.length + 2 > MAX_PROMPT_CONTENT_CHARS) {
      const remaining = MAX_PROMPT_CONTENT_CHARS - length - 2;
      if (remaining > 0) selected.push(segment.slice(0, remaining));
      break;
    }
    selected.push(segment);
    length += segment.length + 2;
  }
  return selected.join("\n\n").slice(0, MAX_PROMPT_CONTENT_CHARS);
}

export function normalizeLiteralEvidenceLocators(record: Record<string, unknown>, docs: DocHit[]): void {
  if (!record.journey_graph || typeof record.journey_graph !== "object") return;
  const graph = record.journey_graph as Record<string, unknown>;
  const prepared = docs.map((doc) => prepareDoc(doc.content ?? ""));
  const normalizeEvidence = (evidence: unknown, claim: string): void => {
    if (!Array.isArray(evidence) || !claim.trim()) return;
    for (const item of evidence) {
      if (!item || typeof item !== "object") continue;
      const value = item as Record<string, unknown>;
      const authoredLocator = typeof value.locator === "string" ? value.locator.trim() : "";
      const queries = [...new Set([authoredLocator, claim].filter(Boolean))];
      const best = queries
        .flatMap((query, queryIndex) => prepared.map((doc, index) => ({
          index,
          queryIndex,
          support: doc.original
            ? findSupportingExcerpt(doc.original, doc.lower, doc.tokens, query)
            : null,
        })))
        .filter((candidate) => candidate.support?.supported && candidate.support.excerpt)
        .sort((a, b) =>
          a.queryIndex - b.queryIndex
          || (b.support?.coverage ?? 0) - (a.support?.coverage ?? 0))[0];
      if (!best?.support?.excerpt) continue;
      value.sourceId = `S${best.index + 1}`;
      value.locator = best.support.excerpt.replace(/…$/, "").trim();
    }
  };
  const asRecords = (value: unknown): Array<Record<string, unknown>> =>
    Array.isArray(value)
      ? value.filter((item): item is Record<string, unknown> =>
          Boolean(item && typeof item === "object"))
      : [];
  const text = (...values: unknown[]): string =>
    values.filter((value): value is string => typeof value === "string").join(" ");
  const nodes = asRecords(graph.nodes);
  const nodeById = new Map(
    nodes
      .filter((node) => typeof node.id === "string")
      .map((node) => [node.id as string, node]),
  );

  for (const prerequisite of asRecords(graph.prerequisites)) {
    normalizeEvidence(prerequisite.evidence, text(prerequisite.requirement));
  }
  for (const node of nodes) {
    const nodeClaim = text(node.action, node.successSignal);
    normalizeEvidence(node.evidence, nodeClaim);
    for (const field of asRecords(node.requiredFields)) {
      normalizeEvidence(field.evidence, text(field.label, node.action));
    }
    for (const option of asRecords(node.decisionOptions)) {
      normalizeEvidence(option.evidence, text(option.label, option.effect, node.action));
    }
    for (const failure of asRecords(node.failureModes)) {
      normalizeEvidence(failure.evidence, text(failure.condition, failure.recovery, node.action));
    }
  }
  for (const edge of asRecords(graph.edges)) {
    const from = typeof edge.from === "string" ? nodeById.get(edge.from) : undefined;
    const to = typeof edge.to === "string" ? nodeById.get(edge.to) : undefined;
    normalizeEvidence(edge.evidence, text(from?.action, to?.action, edge.condition));
  }
  for (const gate of asRecords(graph.externalGates)) {
    normalizeEvidence(gate.evidence, text(gate.description));
  }
  for (const candidate of asRecords(graph.candidateRoutes)) {
    normalizeEvidence(
      candidate.evidence,
      text(candidate.routeSummary, candidate.selectionBasis, candidate.effectOnFirstSuccess),
    );
  }
  if (graph.firstSuccessBoundary && typeof graph.firstSuccessBoundary === "object") {
    const boundary = graph.firstSuccessBoundary as Record<string, unknown>;
    const terminal = typeof boundary.nodeId === "string" ? nodeById.get(boundary.nodeId) : undefined;
    normalizeEvidence(boundary.evidence, text(terminal?.action, terminal?.successSignal));
  }
}

function docsBlock(docs: DocHit[]): string {
  return docs
    .slice(0, MAX_PROMPT_DOCS)
    .map((d, i) => {
      const head = `[S${i + 1}] ${d.title}\nURL: ${d.url}`;
      return d.content ? `${head}\nCONTENT:\n${boundedPromptContent(d.content)}` : head;
    })
    .join("\n\n---\n\n");
}

const FRICTION_GATE_TYPES = new Set([
  "account",
  "verification",
  "billing",
  "approval",
  "permission",
  "installation",
  "configuration",
  "credential",
  "choice",
  "wait",
  "environment",
  "policy",
  "access",
  "dns",
  "domain",
  "download",
  "form",
  "hardware",
  "knowledge",
  "legal",
  "limit",
  "payment",
  "rate-limit",
  "terms",
  "other",
]);

const FRICTION_GATE_ALIASES: Record<string, string> = {
  "external gate": "other",
  external: "other",
  signup: "account",
  "sign up": "account",
  "sign-up": "account",
  registration: "account",
  "email verification": "verification",
  "2fa": "verification",
  mfa: "verification",
  captcha: "verification",
  phone: "verification",
  sms: "verification",
  "credit card": "billing",
  card: "payment",
  oauth: "credential",
  "api key": "credential",
  "api-key": "credential",
  auth: "credential",
  authentication: "credential",
  sso: "access",
  invite: "approval",
  "manual review": "approval",
};

const PREREQUISITE_TYPES = new Set([
  "account",
  "access",
  "plan",
  "billing",
  "hardware",
  "software",
  "identity",
  "permission",
  "region",
  "approval",
  "configuration",
  "credential",
  "domain",
  "environment",
  "legal",
  "network",
  "verification",
  "other",
]);

const SOURCE_TYPES = new Set([
  "documentation",
  "tutorial",
  "quickstart",
  "installation",
  "troubleshooting",
  "api-reference",
  "official-repository",
  "official-example-repository",
  "help-center",
  "policy",
  "pricing",
  "account-setup",
  "release-note",
]);

function inferredSourceType(url: string): string {
  const value = url.toLowerCase();
  if (/quick.?start|get(?:ting)?.?started/.test(value)) return "quickstart";
  if (/pricing|billing/.test(value)) return "pricing";
  if (/api.?reference|\/reference/.test(value)) return "api-reference";
  if (/help|support/.test(value)) return "help-center";
  return "documentation";
}

/**
 * Keep the model responsible for claims and route structure, while rebuilding
 * the source inventory from the accepted retrieval set. This prevents a repair
 * response from dropping sources or adding schema noise to prerequisites.
 */
export function normalizeTrustedRecordFields(parsed: unknown, docs: DocHit[]): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const record = parsed as Record<string, unknown>;
  const authoredSources = Array.isArray(record.sources)
    ? record.sources.filter((source): source is Record<string, unknown> =>
        Boolean(source && typeof source === "object"))
    : [];
  record.sources = docs.map((doc, index) => {
    const authored = authoredSources.find((source) => source.url === doc.url);
    const sourceType = typeof authored?.source_type === "string"
      && SOURCE_TYPES.has(authored.source_type)
      ? authored.source_type
      : inferredSourceType(doc.url);
    const sections = Array.isArray(authored?.sections_used)
      ? authored.sections_used.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    const supported = Array.isArray(authored?.evidence_supported)
      ? authored.evidence_supported.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      : [];
    return {
      id: `S${index + 1}`,
      title: doc.title,
      url: doc.url,
      official_domain: true,
      source_type: sourceType,
      accessed_at: today(),
      last_updated_if_shown:
        typeof authored?.last_updated_if_shown === "string"
          ? authored.last_updated_if_shown
          : null,
      sections_used: sections.length ? sections : [doc.title],
      evidence_supported: supported.length
        ? supported
        : ["Documented onboarding route"],
    };
  });

  if (Array.isArray(record.prerequisites)) {
    record.prerequisites = record.prerequisites.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const value = item as Record<string, unknown>;
      if (typeof value.requirement !== "string" || !value.requirement.trim()) return [];
      const sourceIds = Array.isArray(value.source_ids)
        ? value.source_ids.filter((sourceId): sourceId is string => {
            if (typeof sourceId !== "string") return false;
            const match = sourceId.match(/^S([1-9][0-9]*)$/);
            return Boolean(match && Number(match[1]) <= docs.length);
          })
        : [];
      if (!sourceIds.length) return [];
      const type = typeof value.type === "string" && PREREQUISITE_TYPES.has(value.type)
        ? value.type
        : "other";
      return [{
        order: index + 1,
        type,
        requirement: value.requirement.trim(),
        required: value.required !== false,
        source_ids: [...new Set(sourceIds)],
      }];
    });
  }

  // The typed graph is the only route authority. Remove legacy model-authored
  // route copies so harmless extra fields in those copies cannot reject an
  // otherwise valid selected graph.
  record.primary_path = [];
  record.candidate_paths = [];
  record.candidate_path_gap = null;
  record.branches = [];

  if (record.journey_graph && typeof record.journey_graph === "object") {
    const graph = record.journey_graph as Record<string, unknown>;
    const selected = graph.selectedRoute && typeof graph.selectedRoute === "object"
      ? graph.selectedRoute as Record<string, unknown>
      : null;
    const boundary = graph.firstSuccessBoundary && typeof graph.firstSuccessBoundary === "object"
      ? graph.firstSuccessBoundary as Record<string, unknown>
      : null;
    const routeIds = Array.isArray(selected?.nodeIds)
      ? selected.nodeIds.filter((item): item is string => typeof item === "string")
      : [];
    const selectedId = typeof selected?.id === "string" ? selected.id : null;
    if (Array.isArray(graph.candidateRoutes) && selectedId) {
      graph.candidateRoutes = graph.candidateRoutes.filter((candidate) =>
        Boolean(
          candidate
          && typeof candidate === "object"
          && (candidate as Record<string, unknown>).id === selectedId
          && (candidate as Record<string, unknown>).status === "selected",
        ));
    }
    const terminalId = routeIds.at(-1);
    if (
      terminalId
      && boundary?.nodeId === terminalId
      && Array.isArray(graph.nodes)
    ) {
      const terminal = graph.nodes.find((node) =>
        Boolean(node && typeof node === "object" && (node as Record<string, unknown>).id === terminalId),
      ) as Record<string, unknown> | undefined;
      if (terminal) {
        terminal.kind = "terminal_outcome";
        if (
          (typeof terminal.successSignal !== "string" || !terminal.successSignal.trim())
          && typeof terminal.action === "string"
          && terminal.action.trim()
        ) {
          terminal.successSignal =
            terminal.action;
        }
      }
    }
    if (Array.isArray(graph.nodes)) {
      const nodes = graph.nodes.filter((node): node is Record<string, unknown> =>
        Boolean(node && typeof node === "object"));
      const nodeById = new Map(
        nodes
          .filter((node) => typeof node.id === "string")
          .map((node) => [node.id as string, node]),
      );
      const edges = Array.isArray(graph.edges)
        ? graph.edges.filter((edge): edge is Record<string, unknown> =>
            Boolean(edge && typeof edge === "object"))
        : [];
      for (let index = 0; index < routeIds.length - 1; index += 1) {
        const from = routeIds[index];
        const to = routeIds[index + 1];
        if (edges.some((edge) => edge.from === from && edge.to === to)) continue;
        const toEvidence = nodeById.get(to)?.evidence;
        const fromEvidence = nodeById.get(from)?.evidence;
        const evidence = Array.isArray(toEvidence) && toEvidence.length > 0
          ? structuredClone(toEvidence)
          : Array.isArray(fromEvidence)
            ? structuredClone(fromEvidence)
            : [];
        edges.push({ from, to, condition: null, evidence });
      }
      graph.edges = edges;
    }
  }
  normalizeLiteralEvidenceLocators(record, docs);
  return record;
}

/**
 * Coerce friction_gates[].type onto the schema enum before validation.
 * Models often invent near-synonyms; map those or fall back to "other".
 */
export function normalizeFrictionGateTypes(parsed: unknown): unknown {
  if (!parsed || typeof parsed !== "object") return parsed;
  const record = parsed as Record<string, unknown>;
  if (!Array.isArray(record.friction_gates)) return parsed;
  record.friction_gates = record.friction_gates.map((gate) => {
    if (!gate || typeof gate !== "object") return gate;
    const g = { ...(gate as Record<string, unknown>) };
    if (typeof g.type !== "string") return g;
    const key = g.type.trim().toLowerCase().replace(/_/g, " ");
    if (FRICTION_GATE_TYPES.has(key)) {
      g.type = key;
      return g;
    }
    g.type = FRICTION_GATE_ALIASES[key] ?? "other";
    return g;
  });
  return record;
}

function materializeRoute(
  parsed: unknown,
  draftMode: boolean,
): { value: unknown; errors: string[] } {
  if (!parsed || typeof parsed !== "object") return { value: parsed, errors: ["response is not an object"] };
  const record = parsed as Record<string, unknown>;
  const graph = record.journey_graph as JourneyGraph | undefined;
  if (!graph) return { value: parsed, errors: ["journey_graph is required"] };
  const platform = record.platform as { slug?: unknown } | undefined;
  const expectedPlatformSlug = typeof platform?.slug === "string" ? platform.slug : undefined;
  const validated = validateJourneyGraph(graph, expectedPlatformSlug);
  const findings = draftMode ? draftBlockingJourneyFindings(validated) : validated;
  if (findings.length > 0) {
    return {
      value: parsed,
      errors: findings.map((finding) => `${finding.code}: ${finding.message}`),
    };
  }
  const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
  const nodes = graph.selectedRoute.nodeIds
    .map((id) => nodeById.get(id))
    .filter((node): node is JourneyGraph["nodes"][number] => Boolean(node));
  record.primary_path = nodes.map((node, index) => ({
    step_number: index + 1,
    phase: node.phase,
    actor: node.actor,
    interface: node.interface,
    action: node.action,
    details: [],
    input: node.inputs.join("; "),
    output: node.outputs.join("; "),
    success_signal: node.successSignal,
    failure_or_wait: node.kind === "passive_wait" ? node.action : "",
    required: node.required,
    required_fields: node.requiredFields,
    source_ids: [...new Set(node.evidence.map((item) => item.sourceId))],
  }));
  record.official_docs_only = true;
  if (Array.isArray(record.sources)) {
    record.sources = record.sources.map((source) =>
      source && typeof source === "object"
        ? { ...(source as Record<string, unknown>), official_domain: true }
        : source,
    );
  }
  return { value: record, errors: [] };
}

/** Ignore any model-authored linear path and derive it from the publication-valid graph. */
export function materializeSelectedRoute(parsed: unknown): { value: unknown; errors: string[] } {
  return materializeRoute(parsed, false);
}

/** Derive a private draft route while leaving editorial granularity for review. */
export function materializeResearchDraftRoute(parsed: unknown): { value: unknown; errors: string[] } {
  return materializeRoute(parsed, true);
}

/**
 * Reconstructs a schema-valid first-mile record from official-docs search hits
 * using an OpenRouter-hosted model. Grounds strictly on the supplied documents,
 * validates against record.schema.json, and does one repair pass on validation
 * errors. Throws if a valid record cannot be produced.
 */
export class OpenRouterProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    /** Required because OpenRouter does not provide a server-side default model. */
    private readonly model: string,
    private readonly validate: RecordValidator,
    private readonly schemaText: string,
    private readonly categories: string[] = [],
  ) {
    if (!apiKey) throw new Error("OpenRouterProvider requires an OPENROUTER_API_KEY.");
    if (!model) throw new Error("OpenRouterProvider requires OPENROUTER_MODEL.");
  }

  async reconstructRecord(platform: string, docs: DocHit[]): Promise<PlatformRecord> {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: this.systemPrompt() },
      { role: "user", content: this.userPrompt(platform, docs) },
    ];

    let lastErrors: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const raw = await this.call(messages);
      let parsed: unknown;
      try {
        parsed = JSON.parse(stripFences(raw));
      } catch {
        lastErrors = ["response was not valid JSON"];
        messages.push({ role: "assistant", content: raw });
        messages.push({ role: "user", content: "That was not valid JSON. Return only the JSON object." });
        continue;
      }

      const trusted = normalizeTrustedRecordFields(parsed, docs);
      const normalized = normalizeFrictionGateTypes(trusted);
      const materialized = materializeResearchDraftRoute(normalized);
      const { valid, errors } = this.validate(materialized.value);
      const combinedErrors = [...materialized.errors, ...errors];
      if (valid && materialized.errors.length === 0) return materialized.value as PlatformRecord;

      lastErrors = combinedErrors;
      if (attempt < MAX_ATTEMPTS) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content:
            "The JSON failed schema validation with these errors:\n" +
            combinedErrors.slice(0, 30).join("\n") +
            "\nKeep every required root property, including sources and all required arrays. " +
            "Remove properties that the schema does not allow. Return only the corrected JSON object.",
        });
      }
    }

    throw new SchemaRepairError(
      `Model could not produce a schema-valid record: ${lastErrors.slice(0, 5).join("; ")}`,
    );
  }

  private async call(messages: Array<{ role: string; content: string }>): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://developer-journey-atlas.onrender.com",
          "X-Title": "Developer Journey Atlas",
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      const responseText = await res.text();
      let body: ChatResponse;
      try {
        body = JSON.parse(responseText) as ChatResponse;
      } catch {
        throw new Error(
          `OpenRouter error: unreadable ${res.status || "unknown"} response`,
        );
      }
      if (!res.ok || body.error) {
        throw new Error(`OpenRouter error: ${body.error?.message ?? res.statusText}`);
      }
      const content = body.choices?.[0]?.message?.content;
      if (!content) throw new Error("OpenRouter returned an empty response.");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  private systemPrompt(): string {
    return [
      "You reconstruct the documented first-mile onboarding journey of a developer platform,",
      "strictly from official documentation. You output a single JSON object that conforms",
      "exactly to the provided JSON Schema (additionalProperties are forbidden).",
      "",
      "Hard rules:",
      "- Use ONLY the supplied official-docs sources. Never invent steps, URLs, or claims.",
      "- Source authority is validated by the application. Do not decide whether a source is official.",
      "- Give each source an id S1, S2, ... and reference those ids in the *_source_ids arrays.",
      "- Always include the complete sources array, including during a repair response.",
      "- Measure documented developer onboarding: account creation through first success.",
      "- Prefer the vendor quickstart or hosted API/console path when one exists.",
      "- Include documented gates (email verify, payment, credits, domain, approval).",
      "- Prefer HTTP/cURL when documented; do not prefer local/no-account toolkit shortcuts over hosted onboarding.",
      "- Do not invent knowledge/skill prerequisites (e.g. 'know JavaScript'). Omit soft knowledge requirements.",
      "- Build `journey_graph` first. Represent alternate routes as branches and select exactly one route.",
      "- Model account creation, app creation, OAuth or API-key generation, permissions, scopes, redirect URIs, consent, SDK setup, request construction, execution, waits, and verification as separate atomic nodes when the docs separate them.",
      "- Declare every candidate route in `journey_graph.candidateRoutes` with a condition, route summary, and first-success effect. Exactly one has selected status and must exactly match selectedRoute; considered alternatives need a reasonNotSelected and exact branchAtNodeId.",
      "- Put evidence-backed preexisting requirements in `journey_graph.prerequisites` and declare the inputs each produces.",
      "- Put account, permission, approval, terms, payment, and other route gates in `journey_graph.externalGates` at the exact node they affect.",
      "- Set `primary_path` to an empty array. The application derives it from `journey_graph.selectedRoute` after validation.",
      "- One developer action is one intentional interaction. Keep form fields nested under their action.",
      "- Every node must set requiresFieldInventory. Set it true for any form or interaction with fields, and list every documented field.",
      "- For create-account, create-app, configure-OAuth, generate-credential, configure-scope, and make-request interactions, list every documented required field with its field type and evidence.",
      "- For decisions, use kind decision and include decisionOptions with label, selected, effect, and evidence for each documented option.",
      "- For documented validation errors, rejected states, or retry paths, add failureModes on the exact node with condition, recovery, and evidence.",
      "- Represent passive waits and automatic platform work as passive_wait or platform_outcome nodes.",
      "- Every prerequisite, node, field, edge, gate, candidate route, and first-success boundary requires a supplied source id and a specific section locator.",
      "- Locator text must name wording or a section that occurs in the supplied bounded source content.",
      "- Preserve causal continuity: every input must come from startingState.availableInputs or an earlier node output.",
      "- Record uncertainty at its exact target in journey_graph.uncertainties; a publication-blocking uncertainty must set blocksPublication true.",
      "- firstSuccessBoundary must point to the terminal node. Resource creation is not first success when the official route continues to a meaningful result.",
      "- If the docs do not establish a single first-success milestone, set research_status to",
      "  'needs-human-judgment' and record the ambiguity in `uncertainties` rather than guessing.",
      "- Prefer structured, atomic steps. Do not overstate; unknown fields become uncertainties.",
      "- friction_gates[].type must be one of: account, verification, billing, approval, permission, installation, configuration, credential, choice, wait, environment, policy, access, dns, domain, download, form, hardware, knowledge, legal, limit, payment, rate-limit, terms, other. Use other when unsure.",
      `- Set researched_at to ${today()} (YYYY-MM-DD).`,
      "- Output ONLY the JSON object, no prose, no markdown fences.",
      "",
      "JSON Schema:",
      this.schemaText,
    ].join("\n");
  }

  private userPrompt(platform: string, docs: DocHit[]): string {
    const categoryGuidance = this.categories.length
      ? [
          "",
          "For `category`, reuse the closest existing category from this list so the",
          "record is comparable to peers. Only invent a new category if none fit:",
          this.categories.map((c) => `- ${c}`).join("\n"),
        ].join("\n")
      : "";
    return [
      `Platform to research: ${platform}`,
      categoryGuidance,
      "",
      "Official documentation sources (use these, and only these, as evidence):",
      docsBlock(docs),
    ].join("\n");
  }
}
