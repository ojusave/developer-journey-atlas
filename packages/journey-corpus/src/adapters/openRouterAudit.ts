import type { DocHit, PlatformRecord, ShortestPathAudit } from "../core/ports.js";
import { SchemaRepairError } from "./openRouter.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 120_000;
const MAX_ATTEMPTS = 2;

function stripFences(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  return (fenced ? fenced[1] : text).trim();
}

function docsBlock(docs: DocHit[]): string {
  return docs
    .map((d, i) => {
      const head = `[D${i + 1}] ${d.title}\nURL: ${d.url}`;
      return d.content ? `${head}\nCONTENT:\n${d.content.slice(0, 4000)}` : head;
    })
    .join("\n\n---\n\n");
}

/**
 * Proposes a shortest-path audit JSON from the frozen record + official docs.
 * Does not decide verified vs NHJ: the caller runs deterministic eligibility.
 */
export class OpenRouterAuditProposer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
  ) {
    if (!apiKey) throw new Error("OpenRouterAuditProposer requires OPENROUTER_API_KEY.");
    if (!model) throw new Error("OpenRouterAuditProposer requires OPENROUTER_MODEL.");
  }

  async proposeAudit(input: {
    slug: string;
    record: PlatformRecord;
    audit: ShortestPathAudit | undefined;
    docs: DocHit[];
    sourceSha256: string;
  }): Promise<ShortestPathAudit> {
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: this.systemPrompt() },
      { role: "user", content: this.userPrompt(input) },
    ];

    let lastError = "unknown";
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      const raw = await this.call(messages);
      try {
        const parsed = JSON.parse(stripFences(raw)) as ShortestPathAudit;
        if (!parsed?.required_path || !parsed?.platform) {
          lastError = "missing required_path or platform";
        } else {
          parsed.source_record_sha256 = input.sourceSha256;
          parsed.platform.slug = input.slug;
          return parsed;
        }
      } catch {
        lastError = "response was not valid JSON";
      }
      messages.push({ role: "assistant", content: raw });
      messages.push({
        role: "user",
        content: `Fix the audit JSON (${lastError}). Return only the JSON object.`,
      });
    }
    throw new SchemaRepairError(`Could not propose a usable audit: ${lastError}`);
  }

  private systemPrompt(): string {
    return [
      "You reconstruct a shortest-required-path audit for Developer Journey Atlas.",
      "Start at account creation. End at earliest meaningful documented first success.",
      "Prefer one complete self-service route. If peers are truly unresolved, keep selected null and list uncertainties.",
      "Do not invent drop-off, conversion, or completion time.",
      "Never rewrite facts that contradict the frozen source record without docs evidence.",
      "Return JSON only matching the shortest-path audit shape (schema_version 1.0).",
      "Set audit_status to needs-human-judgment unless every gate is clearly resolved; the server will recompute eligibility.",
      "counts may be null when unresolved.",
    ].join(" ");
  }

  private userPrompt(input: {
    slug: string;
    record: PlatformRecord;
    audit: ShortestPathAudit | undefined;
    docs: DocHit[];
    sourceSha256: string;
  }): string {
    return [
      `Slug: ${input.slug}`,
      `source_record_sha256: ${input.sourceSha256}`,
      "",
      "Frozen source record JSON:",
      JSON.stringify(input.record).slice(0, 60_000),
      "",
      "Existing audit JSON (may be incomplete):",
      input.audit ? JSON.stringify(input.audit).slice(0, 40_000) : "(none)",
      "",
      "Official docs hits:",
      docsBlock(input.docs).slice(0, 40_000),
    ].join("\n");
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
          temperature: 0.1,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });
      const body = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(body.error?.message ?? `OpenRouter HTTP ${res.status}`);
      return body.choices?.[0]?.message?.content ?? "";
    } finally {
      clearTimeout(timer);
    }
  }
}
