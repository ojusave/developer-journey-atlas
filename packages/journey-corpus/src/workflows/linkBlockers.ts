import { task } from "@renderinc/sdk/workflows";
import { PrismaClient } from "@prisma/client";
import { OpenRouterEmbeddingProvider } from "../adapters/openRouterEmbeddings.js";
import { OpenRouterLinkConfirmer } from "../adapters/openRouterLinkConfirm.js";
import { linkPlatformBlockers, type LinkPlatformResult } from "../core/runBlockerLinking.js";
import { config } from "../config.js";

function parseLinkInput(raw: unknown): { slug: string } {
  if (!raw || typeof raw !== "object") throw new Error("linkPlatformBlockers requires { slug }");
  const slug = String((raw as { slug?: unknown }).slug ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(slug)) throw new Error("Invalid platform slug.");
  return { slug };
}

/**
 * Durable linking task: retrieve-then-confirm friction gates → catalog reasons.
 * Hypotheses only; does not claim drop-off. Requires BLOCKER_LINKING_ENABLED.
 */
export const linkPlatformBlockersTask = task(
  {
    name: "linkPlatformBlockers",
    plan: "standard",
    timeoutSeconds: 600,
    retry: { maxRetries: 1, waitDurationMs: 5_000, backoffScaling: 2 },
  },
  async function linkPlatformBlockersHandler(rawInput: unknown): Promise<LinkPlatformResult> {
    if (process.env.BLOCKER_LINKING_ENABLED === "false") {
      throw new Error("BLOCKER_LINKING_ENABLED=false");
    }
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
    if (!config.openRouterApiKey) throw new Error("OPENROUTER_API_KEY required");

    const { slug } = parseLinkInput(rawInput);
    const prisma = new PrismaClient();
    const embedder = new OpenRouterEmbeddingProvider(
      config.openRouterApiKey,
      process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small",
    );
    const confirmer = config.openRouterModel
      ? new OpenRouterLinkConfirmer(config.openRouterApiKey, config.openRouterModel)
      : null;
    try {
      return await linkPlatformBlockers(prisma, embedder, confirmer, slug);
    } finally {
      await prisma.$disconnect();
    }
  },
);
