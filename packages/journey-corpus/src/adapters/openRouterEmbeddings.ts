const ENDPOINT = "https://openrouter.ai/api/v1/embeddings";
const TIMEOUT_MS = 60_000;

export interface EmbeddingProvider {
  /** Model id used for these embeddings (for cache keys). */
  readonly model: string;
  embed(texts: string[]): Promise<number[][]>;
}

interface EmbeddingsResponse {
  data?: Array<{ embedding?: number[]; index?: number }>;
  error?: { message?: string };
}

/**
 * OpenRouter embeddings adapter. Uses POST /api/v1/embeddings with batch input.
 * Docs checked 2026-07-22: https://openrouter.ai/docs/api-reference/embeddings
 */
export class OpenRouterEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;

  constructor(
    private readonly apiKey: string,
    model = process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small",
  ) {
    if (!apiKey) throw new Error("OpenRouterEmbeddingProvider requires OPENROUTER_API_KEY.");
    this.model = model;
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
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
          input: texts,
        }),
        signal: controller.signal,
      });
      const body = (await res.json()) as EmbeddingsResponse;
      if (!res.ok) {
        throw new Error(body.error?.message ?? `OpenRouter embeddings HTTP ${res.status}`);
      }
      const rows = [...(body.data ?? [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
      if (rows.length !== texts.length) {
        throw new Error(`Expected ${texts.length} embeddings, got ${rows.length}`);
      }
      return rows.map((row) => {
        if (!Array.isArray(row.embedding)) throw new Error("Missing embedding vector in response.");
        return row.embedding;
      });
    } finally {
      clearTimeout(timer);
    }
  }
}
