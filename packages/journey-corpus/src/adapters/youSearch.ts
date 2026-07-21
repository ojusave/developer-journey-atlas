import type { DocHit, SearchProvider } from "../core/ports.js";

const SEARCH_ENDPOINT = "https://ydc-index.io/v1/search";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_COUNT = 6;
const MAX_CONTENT_CHARS = 6_000;

interface YouWebResult {
  url?: string;
  title?: string;
  description?: string;
  snippets?: string[];
  contents?: { markdown?: string; html?: string };
}

interface YouSearchResponse {
  results?: { web?: YouWebResult[] };
}

/**
 * Finds official documentation pages for an unknown platform via the You.com
 * Web Search API, with livecrawled markdown attached for grounding. Non-critical
 * Phase 2 dependency: constructed only when RESEARCH_ENABLED is on. A hard
 * failure throws so the research pipeline can mark the attempt as errored rather
 * than fabricate results.
 */
export class YouSearchProvider implements SearchProvider {
  constructor(
    private readonly apiKey: string,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {
    if (!apiKey) throw new Error("YouSearchProvider requires a YDC_API_KEY.");
  }

  async findOfficialDocs(platform: string): Promise<DocHit[]> {
    const query = `${platform} official developer documentation quickstart getting started`;
    const params = new URLSearchParams({
      query,
      count: String(DEFAULT_COUNT),
      livecrawl: "web",
      livecrawl_formats: "markdown",
    });
    const url = `${SEARCH_ENDPOINT}?${params.toString()}`;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": this.apiKey },
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`You.com search failed: ${res.status} ${res.statusText}`);
      }
      const body = (await res.json()) as YouSearchResponse;
      const web = body.results?.web ?? [];
      return web
        .filter((r): r is YouWebResult & { url: string; title: string } =>
          Boolean(r.url && r.title),
        )
        .map((r) => {
          const content = r.contents?.markdown ?? r.snippets?.join("\n\n") ?? r.description;
          return {
            title: r.title,
            url: r.url,
            ...(content ? { content: content.slice(0, MAX_CONTENT_CHARS) } : {}),
          };
        });
    } finally {
      clearTimeout(timer);
    }
  }
}
