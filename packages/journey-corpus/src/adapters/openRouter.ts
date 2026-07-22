import type { DocHit, LLMProvider, PlatformRecord } from "../core/ports.js";
import type { RecordValidator } from "../core/validate.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;

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

function docsBlock(docs: DocHit[]): string {
  return docs
    .map((d, i) => {
      const head = `[S${i + 1}] ${d.title}\nURL: ${d.url}`;
      return d.content ? `${head}\nCONTENT:\n${d.content}` : head;
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

/**
 * Reconstructs a schema-valid first-mile record from official-docs search hits
 * using an OpenRouter-hosted model. Grounds strictly on the supplied documents,
 * validates against record.schema.json, and does one repair pass on validation
 * errors. Throws if a valid record cannot be produced.
 */
export class OpenRouterProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    /** Optional. When empty, no model is sent and OpenRouter uses the account default. */
    private readonly model: string,
    private readonly validate: RecordValidator,
    private readonly schemaText: string,
    private readonly categories: string[] = [],
  ) {
    if (!apiKey) throw new Error("OpenRouterProvider requires an OPENROUTER_API_KEY.");
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

      const normalized = normalizeFrictionGateTypes(parsed);
      const { valid, errors } = this.validate(normalized);
      if (valid) return normalized as PlatformRecord;

      lastErrors = errors;
      if (attempt < MAX_ATTEMPTS) {
        messages.push({ role: "assistant", content: raw });
        messages.push({
          role: "user",
          content:
            "The JSON failed schema validation with these errors:\n" +
            errors.slice(0, 30).join("\n") +
            "\nReturn a corrected JSON object that satisfies the schema. Output only JSON.",
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
          // Omit `model` entirely when unset so OpenRouter falls back to the
          // account/payer default instead of a pinned, possibly stale model.
          ...(this.model ? { model: this.model } : {}),
          messages,
          temperature: 0.2,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      const body = (await res.json()) as ChatResponse;
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
      "- official_docs_only must be true. Every `sources[].url` must be an official domain and official_domain must be true.",
      "- Give each source an id S1, S2, ... and reference those ids in the *_source_ids arrays.",
      "- Measure documented developer onboarding: account creation through first success.",
      "- Prefer the vendor quickstart or hosted API/console path when one exists.",
      "- Include documented gates (email verify, payment, credits, domain, approval).",
      "- Prefer HTTP/cURL when documented; do not prefer local/no-account toolkit shortcuts over hosted onboarding.",
      "- Compact primary_path (roughly account → gates → credentials → execute → verify).",
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
