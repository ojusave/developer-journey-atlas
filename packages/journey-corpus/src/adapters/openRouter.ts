import type { DocHit, LLMProvider, PlatformRecord } from "../core/ports.js";
import type { RecordValidator } from "../core/validate.js";

const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
const TIMEOUT_MS = 90_000;
const MAX_ATTEMPTS = 2;

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

/**
 * Reconstructs a schema-valid first-mile record from official-docs search hits
 * using an OpenRouter-hosted model. Grounds strictly on the supplied documents,
 * validates against record.schema.json, and does one repair pass on validation
 * errors. Throws if a valid record cannot be produced.
 */
export class OpenRouterProvider implements LLMProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string | undefined,
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

      const { valid, errors } = this.validate(parsed);
      if (valid) return parsed as PlatformRecord;

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

    throw new Error(`Model could not produce a schema-valid record: ${lastErrors.slice(0, 5).join("; ")}`);
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
      "- If the docs do not establish a single first-success milestone, set research_status to",
      "  'needs-human-judgment' and record the ambiguity in `uncertainties` rather than guessing.",
      "- Prefer structured, atomic steps. Do not overstate; unknown fields become uncertainties.",
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
