import type { DocHit, SearchProvider } from "../core/ports.js";
import {
  contentHash,
  validateSourceAuthority,
  type PlatformIdentity,
} from "../core/sourceAuthority.js";

const SEARCH_ENDPOINT = "https://ydc-index.io/v1/search";
const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_COUNT = 10;
const MAX_CONTENT_CHARS = 30_000;
const MAX_EVIDENCE_PAGES = 12;
const MAX_REDIRECTS = 5;

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

/** Deterministic discovery boundary. Search rank and provider labels never establish authority. */
export function filterOfficialDiscoveryResults(
  results: YouWebResult[],
  identity: PlatformIdentity,
): Array<{ title: string; url: string }> {
  return results
    .filter((result): result is YouWebResult & { url: string; title: string } =>
      Boolean(
        result.url &&
        result.title &&
        validateSourceAuthority(result.url, identity).accepted,
      ),
    )
    .map((result) => ({ title: result.title, url: result.url }));
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

  async findOfficialDocs(platform: string, identity: PlatformIdentity): Promise<DocHit[]> {
    const domains = [
      identity.officialRootDomain,
      ...identity.documentationDomains,
      ...identity.applicationDomains,
    ];
    const siteClause = [...new Set(domains)].map((domain) => `site:${domain}`).join(" OR ");
    const query = `${platform} developer documentation quickstart getting started (${siteClause})`;
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
      const accepted = filterOfficialDiscoveryResults(web, identity);

      const fetched: DocHit[] = [];
      const queued = [...accepted];
      const seen = new Set<string>();
      while (queued.length > 0 && fetched.length < MAX_EVIDENCE_PAGES) {
        const candidate = queued.shift();
        if (!candidate || seen.has(candidate.url)) continue;
        seen.add(candidate.url);
        const page = await this.fetchEvidencePage(candidate.url, candidate.title, identity);
        if (!page) continue;
        fetched.push(page);
        for (const link of page.metadata?.discoveredLinks ?? []) {
          if (
            !seen.has(link) &&
            validateSourceAuthority(link, identity).accepted &&
            /(?:quickstart|get(?:ting)?-started|first|setup|install|authentication|api-key|billing|deploy)/i.test(link)
          ) {
            queued.push({ title: link, url: link });
          }
        }
      }
      return fetched;
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchEvidencePage(
    initialUrl: string,
    fallbackTitle: string,
    identity: PlatformIdentity,
  ): Promise<DocHit | null> {
    const redirectChain: string[] = [];
    let current = initialUrl;
    let response: Response | null = null;
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      response = await fetch(current, {
        redirect: "manual",
        headers: { "User-Agent": "DeveloperJourneyAtlas/1.0 evidence-retrieval" },
      });
      if (response.status < 300 || response.status >= 400) break;
      const location = response.headers.get("location");
      if (!location) break;
      redirectChain.push(current);
      current = new URL(location, current).toString();
      if (!validateSourceAuthority(current, identity).accepted) return null;
    }
    if (!response) return null;
    const contentType = response.headers.get("content-type");
    const body = await response.text();
    const title =
      body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]
        ?.replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim() || fallbackTitle;
    const discoveredLinks = [...body.matchAll(/href=["']([^"'#]+)["']/gi)]
      .map((match) => {
        try {
          return new URL(match[1], current).toString();
        } catch {
          return null;
        }
      })
      .filter((url): url is string => Boolean(url && validateSourceAuthority(url, identity).accepted))
      .slice(0, 100);
    const text = body
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const boundedContent = text.slice(0, MAX_CONTENT_CHARS);
    const contentPresent =
      response.ok &&
      boundedContent.length >= 80 &&
      !/^please enable javascript\b/i.test(boundedContent);
    return {
      title,
      url: current,
      content: boundedContent,
      metadata: {
        canonicalUrl: current,
        redirectChain,
        httpStatus: response.status,
        contentType,
        retrievedAt: new Date().toISOString(),
        contentPresent,
        contentHash: contentPresent ? contentHash(boundedContent) : null,
        contentTruncated: text.length > MAX_CONTENT_CHARS,
        retrievedContentChars: boundedContent.length,
        visibleTitle: title || null,
        discoveredLinks,
      },
    };
  }
}
