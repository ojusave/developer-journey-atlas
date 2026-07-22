import path from "node:path";

/** Central, env-driven configuration with production-safe defaults. */
export const config = {
  port: Number(process.env.PORT ?? 3000),
  // Render runs the start command from the root directory, so cwd holds the data files.
  dataRoot: path.resolve(process.env.DATA_ROOT ?? process.cwd()),
  get publicDir(): string {
    return path.join(this.dataRoot, "public");
  },
  githubRepoUrl: "https://github.com/ojusave/developer-journey-atlas",
  // owner/repo slug; used by the PR writer. Overridable so the contribution
  // target is not a hard-coded constant.
  githubRepoSlug: process.env.GITHUB_REPO_SLUG ?? "ojusave/developer-journey-atlas",

  // --- Web service: starts and reads Workflow runs (server-side only) ---
  // Secret Render API key used by @renderinc/sdk. Never exposed to the browser.
  renderApiKey: process.env.RENDER_API_KEY ?? "",
  // Registered task slug, e.g. developer-journey-atlas-workflows/researchPlatform.
  workflowTaskSlug: process.env.RENDER_WORKFLOW_TASK_SLUG ?? "",

  // --- Workflow service: provider credentials for the research tasks ---
  // You.com Web Search API. YDC_API_KEY is You.com's canonical env var name.
  youApiKey: process.env.YDC_API_KEY ?? "",
  // OpenRouter LLM provider. No model is pinned in code, but OpenRouter has no
  // server-side default: OPENROUTER_MODEL must be set (e.g. openai/gpt-4.1-mini)
  // or reconstruction fails with "No models provided".
  openRouterApiKey: process.env.OPENROUTER_API_KEY ?? "",
  openRouterModel: process.env.OPENROUTER_MODEL ?? "",
  openRouterEmbeddingModel: process.env.OPENROUTER_EMBEDDING_MODEL ?? "openai/text-embedding-3-small",
  blockerLinkingEnabled: process.env.BLOCKER_LINKING_ENABLED !== "false",
  // Auto-PR token. Optional: without it, research still runs and the drafted
  // record is offered for manual submission.
  githubToken: process.env.GITHUB_TOKEN ?? "",
};

/** Whether the web service can start research runs (Workflow wiring present). */
export function researchAvailability(): { available: boolean; missing: string[] } {
  const missing: string[] = [];
  if (!config.renderApiKey) missing.push("RENDER_API_KEY");
  if (!config.workflowTaskSlug) missing.push("RENDER_WORKFLOW_TASK_SLUG");
  return { available: missing.length === 0, missing };
}

/** Canonical Render signup URL with fixed campaign UTMs; only utm_content varies. */
export function renderSignupUrl(content = "footer_link"): string {
  const params = new URLSearchParams({
    utm_source: "github",
    utm_medium: "referral",
    utm_campaign: "ojus_demos",
    utm_content: content,
  });
  return `https://dashboard.render.com/register?${params.toString()}`;
}
