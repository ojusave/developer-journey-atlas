import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { task } from "@renderinc/sdk/workflows";

import { SchemaRepairError } from "../adapters/openRouter.js";
import { OpenRouterAuditProposer } from "../adapters/openRouterAudit.js";
import { GitHubApiError, GitHubPrWriter } from "../adapters/githubPr.js";
import type { DocHit, ShortestPathAudit } from "../core/ports.js";
import { hashRecordJson, runVerifyAudit, type VerifyOutcome, type VerifyTaskInput } from "../core/runVerifyAudit.js";
import { getRepoWriter, getSearchProvider, getStore } from "./deps.js";
import { config } from "../config.js";

function parseVerifyInput(raw: unknown): VerifyTaskInput {
  if (!raw || typeof raw !== "object") throw new Error("verifyPlatformAudit requires { slug }");
  const slug = String((raw as { slug?: unknown }).slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("Invalid platform slug.");
  const checkOnly = Boolean((raw as { checkOnly?: unknown }).checkOnly);
  return { slug, checkOnly };
}

export const refreshAuditEvidence = task(
  {
    name: "refreshAuditEvidence",
    plan: "starter",
    timeoutSeconds: 90,
    retry: { maxRetries: 2, waitDurationMs: 2_000, backoffScaling: 2 },
  },
  async function refreshAuditEvidence(input: { platform: string }): Promise<DocHit[]> {
    return getSearchProvider().findOfficialDocs(input.platform);
  },
);

export const proposeAuditRevision = task(
  {
    name: "proposeAuditRevision",
    plan: "standard",
    timeoutSeconds: 300,
    retry: { maxRetries: 1, waitDurationMs: 5_000, backoffScaling: 2 },
  },
  async function proposeAuditRevision(input: {
    slug: string;
    sourceSha256: string;
    docs: DocHit[];
  }): Promise<{ status: "ok"; audit: ShortestPathAudit } | { status: "invalid_output"; message: string }> {
    const store = getStore();
    const record = store.getRecord(input.slug);
    if (!record) return { status: "invalid_output", message: "record missing" };
    if (!config.openRouterApiKey || !config.openRouterModel) {
      return { status: "invalid_output", message: "OPENROUTER_API_KEY/MODEL missing" };
    }
    const proposer = new OpenRouterAuditProposer(config.openRouterApiKey, config.openRouterModel);
    try {
      const audit = await proposer.proposeAudit({
        slug: input.slug,
        record,
        audit: store.getAudit(input.slug),
        docs: input.docs,
        sourceSha256: input.sourceSha256,
      });
      return { status: "ok", audit };
    } catch (err) {
      if (err instanceof SchemaRepairError) {
        return { status: "invalid_output", message: err.message };
      }
      throw err;
    }
  },
);

export const draftAuditContribution = task(
  {
    name: "draftAuditContribution",
    plan: "starter",
    timeoutSeconds: 120,
    retry: { maxRetries: 2, waitDurationMs: 3_000, backoffScaling: 2 },
  },
  async function draftAuditContribution(input: { audit: ShortestPathAudit }): Promise<
    { status: "opened"; url: string; reused: boolean } | { status: "skipped"; reason: string }
  > {
    const writer = getRepoWriter();
    if (!(writer instanceof GitHubPrWriter)) {
      return { status: "skipped", reason: "GITHUB_TOKEN not configured" };
    }
    try {
      const result = await writer.openDraftAuditPR(input.audit);
      return { status: "opened", url: result.url, reused: result.reused };
    } catch (err) {
      if (err instanceof GitHubApiError && !err.transient) {
        return { status: "skipped", reason: err.message };
      }
      throw err;
    }
  },
);

/**
 * Parent verification run: durable retries on search/model/GitHub; honest NHJ when ineligible.
 */
export const verifyPlatformAudit = task(
  {
    name: "verifyPlatformAudit",
    plan: "standard",
    timeoutSeconds: 900,
  },
  async function verifyPlatformAudit(rawInput: unknown): Promise<VerifyOutcome> {
    const input = parseVerifyInput(rawInput);
    const store = getStore();
    const recordPath = path.join(config.dataRoot, "records", `${input.slug}.json`);
    const sourceSha256 = existsSync(recordPath)
      ? hashRecordJson(readFileSync(recordPath, "utf8"))
      : null;

    return runVerifyAudit(
      input,
      {
        searchDocs: async ({ platform }) => refreshAuditEvidence({ platform }),
        proposeAudit: async ({ slug, docs, sourceSha256: sha }) =>
          proposeAuditRevision({ slug, sourceSha256: sha, docs }),
        draftAuditContribution: async ({ audit }) => draftAuditContribution({ audit }),
      },
      {
        getRecord: (slug) => store.getRecord(slug),
        getAudit: (slug) => store.getAudit(slug),
        sourceSha256: () => sourceSha256,
        platformName: (slug) => store.getRecord(slug)?.platform.name ?? store.getRow(slug)?.name ?? null,
      },
    );
  },
);

/**
 * Fan-out batch verification. Each slug is an independent durable subtask run.
 */
export const verifyAuditBatch = task(
  {
    name: "verifyAuditBatch",
    plan: "standard",
    timeoutSeconds: 1800,
  },
  async function verifyAuditBatch(rawInput: unknown): Promise<{
    total: number;
    outcomes: Array<{ slug: string; outcome: VerifyOutcome["outcome"]; auditStatus?: string }>;
  }> {
    if (!rawInput || typeof rawInput !== "object") throw new Error("verifyAuditBatch requires { slugs: string[] }");
    const slugs = Array.isArray((rawInput as { slugs?: unknown }).slugs)
      ? (rawInput as { slugs: unknown[] }).slugs.map((s) => String(s).trim().toLowerCase()).filter(Boolean)
      : [];
    if (slugs.length === 0) throw new Error("slugs must be a non-empty array");
    if (slugs.length > 40) throw new Error("Batch limited to 40 slugs per run");

    const checkOnly = Boolean((rawInput as { checkOnly?: unknown }).checkOnly);
    const settled = await Promise.all(
      slugs.map(async (slug) => {
        const outcome = await verifyPlatformAudit({ slug, checkOnly });
        return {
          slug,
          outcome: outcome.outcome,
          auditStatus: "auditStatus" in outcome ? outcome.auditStatus : undefined,
        };
      }),
    );
    return { total: settled.length, outcomes: settled };
  },
);
