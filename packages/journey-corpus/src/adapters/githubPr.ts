import type { PlatformRecord, RepoWriter } from "../core/ports.js";

const API = "https://api.github.com";
const TIMEOUT_MS = 30_000;

/**
 * Opens a human-gated draft PR adding a schema-valid record to the dataset repo.
 * Never auto-merges. Uses the GitHub REST API directly (no SDK): create a
 * branch, commit packages/journey-corpus/records/<slug>.json, then open a
 * draft pull request in the canonical monorepo.
 */
export class GitHubPrWriter implements RepoWriter {
  constructor(
    private readonly token: string,
    private readonly repo: string,
    private readonly baseBranch = "main",
  ) {
    if (!token) throw new Error("GitHubPrWriter requires a GITHUB_TOKEN.");
  }

  async openDraftRecordPR(record: PlatformRecord): Promise<{ url: string }> {
    const slug = record.platform.slug;
    const branch = `research/${slug}-${Date.now()}`;
    const path = `packages/journey-corpus/records/${slug}.json`;
    const content = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8").toString("base64");

    const baseSha = await this.branchSha(this.baseBranch);
    await this.createBranch(branch, baseSha);

    const existingSha = await this.fileSha(path, branch);
    await this.putFile(path, branch, content, existingSha, `Add ${slug} journey record (machine-drafted)`);

    return this.openPr(branch, slug, record);
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    };
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<{ status: number; json: T }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${API}${path}`, {
        method,
        headers: this.headers(),
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const json = (await res.json().catch(() => ({}))) as T;
      return { status: res.status, json };
    } finally {
      clearTimeout(timer);
    }
  }

  private async branchSha(branch: string): Promise<string> {
    const { status, json } = await this.request<{ object?: { sha?: string } }>(
      "GET",
      `/repos/${this.repo}/git/ref/heads/${branch}`,
    );
    const sha = json.object?.sha;
    if (status !== 200 || !sha) throw new Error(`Could not read base branch ${branch} (${status}).`);
    return sha;
  }

  private async createBranch(branch: string, sha: string): Promise<void> {
    const { status, json } = await this.request<{ message?: string }>(
      "POST",
      `/repos/${this.repo}/git/refs`,
      { ref: `refs/heads/${branch}`, sha },
    );
    if (status !== 201) throw new Error(`Could not create branch (${status}): ${json.message ?? ""}`);
  }

  private async fileSha(path: string, branch: string): Promise<string | undefined> {
    const { status, json } = await this.request<{ sha?: string }>(
      "GET",
      `/repos/${this.repo}/contents/${path}?ref=${branch}`,
    );
    return status === 200 ? json.sha : undefined;
  }

  private async putFile(
    path: string,
    branch: string,
    content: string,
    sha: string | undefined,
    message: string,
  ): Promise<void> {
    const { status, json } = await this.request<{ message?: string }>(
      "PUT",
      `/repos/${this.repo}/contents/${path}`,
      { message, content, branch, ...(sha ? { sha } : {}) },
    );
    if (status !== 200 && status !== 201) {
      throw new Error(`Could not commit file (${status}): ${json.message ?? ""}`);
    }
  }

  private async openPr(branch: string, slug: string, record: PlatformRecord): Promise<{ url: string }> {
    const body = [
      `Machine-drafted developer journey record for **${record.platform.name}** (\`${slug}\`).`,
      "",
      "Generated live by Developer Journey Atlas from official documentation via You.com search and an OpenRouter model.",
      "It passed source-record JSON Schema validation but is **unverified**: review every step, field detail, source, and boundary claim before merging.",
      "This PR does not create a verified shortest-path audit. Public counts, peer placement, and onboarding-load comparison remain withheld until `audits/<slug>.json` passes independent review.",
      "",
      `- Category: ${record.category}`,
      `- Research status: ${record.research_status}`,
      `- Sources: ${record.sources?.length ?? 0}`,
      `- Open uncertainties: ${record.uncertainties?.length ?? 0}`,
    ].join("\n");

    const { status, json } = await this.request<{ html_url?: string; message?: string }>(
      "POST",
      `/repos/${this.repo}/pulls`,
      {
        title: `Add journey record: ${record.platform.name}`,
        head: branch,
        base: this.baseBranch,
        body,
        draft: true,
      },
    );
    if (status !== 201 || !json.html_url) {
      throw new Error(`Could not open PR (${status}): ${json.message ?? ""}`);
    }
    return { url: json.html_url };
  }
}
