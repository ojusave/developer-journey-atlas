import type { PlatformRecord, RepoWriter } from "../core/ports.js";

const API = "https://api.github.com";
const TIMEOUT_MS = 30_000;

/**
 * A GitHub API failure, tagged with whether it is worth retrying. Transient
 * failures (network, timeout, 429, 5xx) can be retried at the task boundary.
 * Permanent failures (401/403 permission, 404 repo, 422 validation) are final:
 * retrying them only wastes compute and never succeeds.
 */
export class GitHubApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly transient: boolean,
  ) {
    super(message);
    this.name = "GitHubApiError";
  }
}

function transientStatus(status: number): boolean {
  return status === 0 || status === 408 || status === 429 || status >= 500;
}

/**
 * Opens a human-gated draft PR adding a schema-valid record to the dataset repo.
 * Never auto-merges. Idempotent by design so Workflow retries and duplicate
 * submissions never open a second PR for the same platform: the branch name is
 * deterministic (`research/<slug>`), and an already-open PR from that branch is
 * reused instead of creating a new one.
 */
export class GitHubPrWriter implements RepoWriter {
  private readonly owner: string;

  constructor(
    private readonly token: string,
    private readonly repo: string,
    private readonly baseBranch = "main",
  ) {
    if (!token) throw new Error("GitHubPrWriter requires a GITHUB_TOKEN.");
    this.owner = repo.split("/")[0] ?? "";
  }

  async openDraftRecordPR(record: PlatformRecord): Promise<{ url: string; reused: boolean }> {
    const slug = record.platform.slug;
    const branch = `research/${slug}`;
    const path = `packages/journey-corpus/records/${slug}.json`;
    const content = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, "utf8").toString("base64");

    // 1. Reuse an already-open PR for this platform if one exists.
    const existing = await this.openPrForBranch(branch);
    if (existing) return { url: existing, reused: true };

    // 2. Ensure the deterministic branch points at the current base commit.
    const baseSha = await this.branchSha(this.baseBranch);
    await this.ensureBranch(branch, baseSha);

    // 3. Commit the single record file (overwriting any prior draft on the branch).
    const existingFileSha = await this.fileSha(path, branch);
    await this.putFile(path, branch, content, existingFileSha, `Add ${slug} journey record (machine-drafted)`);

    // 4. Re-check for a PR (guards against a race with a concurrent run), then open one.
    const raced = await this.openPrForBranch(branch);
    if (raced) return { url: raced, reused: true };
    return { url: await this.openPr(branch, slug, record), reused: false };
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
    } catch (err) {
      // Network error or abort: transient by definition.
      throw new GitHubApiError(err instanceof Error ? err.message : "network error", 0, true);
    } finally {
      clearTimeout(timer);
    }
  }

  private fail(action: string, status: number, message?: string): never {
    throw new GitHubApiError(`Could not ${action} (${status}): ${message ?? ""}`.trim(), status, transientStatus(status));
  }

  private async openPrForBranch(branch: string): Promise<string | undefined> {
    const head = `${this.owner}:${branch}`;
    const { status, json } = await this.request<Array<{ html_url?: string }>>(
      "GET",
      `/repos/${this.repo}/pulls?state=open&head=${encodeURIComponent(head)}`,
    );
    if (status !== 200) this.fail("list existing pull requests", status);
    return Array.isArray(json) && json[0]?.html_url ? json[0].html_url : undefined;
  }

  private async branchSha(branch: string): Promise<string> {
    const { status, json } = await this.request<{ object?: { sha?: string } }>(
      "GET",
      `/repos/${this.repo}/git/ref/heads/${branch}`,
    );
    const sha = json.object?.sha;
    if (status !== 200 || !sha) this.fail(`read base branch ${branch}`, status);
    return sha as string;
  }

  private async ensureBranch(branch: string, sha: string): Promise<void> {
    const { status, json } = await this.request<{ message?: string }>(
      "POST",
      `/repos/${this.repo}/git/refs`,
      { ref: `refs/heads/${branch}`, sha },
    );
    if (status === 201) return;
    if (status === 422) {
      // Branch already exists (from a prior run). Reset it to the base commit so
      // the draft is rebuilt cleanly.
      const reset = await this.request<{ message?: string }>(
        "PATCH",
        `/repos/${this.repo}/git/refs/heads/${branch}`,
        { sha, force: true },
      );
      if (reset.status !== 200) this.fail("reset research branch", reset.status, reset.json.message);
      return;
    }
    this.fail("create branch", status, json.message);
  }

  private async fileSha(path: string, branch: string): Promise<string | undefined> {
    const { status, json } = await this.request<{ sha?: string }>(
      "GET",
      `/repos/${this.repo}/contents/${path}?ref=${branch}`,
    );
    if (status === 200) return json.sha;
    if (status === 404) return undefined;
    this.fail("read existing record file", status);
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
    if (status !== 200 && status !== 201) this.fail("commit file", status, json.message);
  }

  private async openPr(branch: string, slug: string, record: PlatformRecord): Promise<string> {
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
    if (status !== 201 || !json.html_url) this.fail("open PR", status, json.message);
    return json.html_url as string;
  }
}
