import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import { OpenRouterEmbeddingProvider } from "../adapters/openRouterEmbeddings.js";
import { OpenRouterLinkConfirmer } from "../adapters/openRouterLinkConfirm.js";
import { linkPlatformBlockers } from "../core/runBlockerLinking.js";
import { config } from "../config.js";

function parseArgs(argv: string[]): { slugs: string[]; similarityOnly: boolean } {
  const slugs: string[] = [];
  let similarityOnly = false;
  for (const arg of argv) {
    if (arg === "--similarity-only") similarityOnly = true;
    else if (arg.startsWith("--slug=")) slugs.push(arg.slice("--slug=".length));
    else if (arg === "--all") slugs.push("*");
  }
  return { slugs, similarityOnly };
}

async function main(): Promise<void> {
  if (process.env.BLOCKER_LINKING_ENABLED === "false") {
    throw new Error("BLOCKER_LINKING_ENABLED=false; refusing to run.");
  }
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required.");
  }
  if (!config.openRouterApiKey) {
    throw new Error("OPENROUTER_API_KEY is required.");
  }

  const { slugs, similarityOnly } = parseArgs(process.argv.slice(2));
  if (slugs.length === 0) {
    throw new Error("Pass --slug=resend and/or --all");
  }

  const prisma = new PrismaClient();
  const embedder = new OpenRouterEmbeddingProvider(
    config.openRouterApiKey,
    process.env.OPENROUTER_EMBEDDING_MODEL || "openai/text-embedding-3-small",
  );
  const confirmer =
    similarityOnly || !config.openRouterModel
      ? null
      : new OpenRouterLinkConfirmer(config.openRouterApiKey, config.openRouterModel);

  try {
    let targets = slugs;
    if (slugs.includes("*")) {
      const platforms = await prisma.platform.findMany({ select: { slug: true } });
      targets = platforms.map((p) => p.slug);
    }
    const results = [];
    for (const slug of targets) {
      const result = await linkPlatformBlockers(prisma, embedder, confirmer, slug);
      results.push(result);
      console.log(JSON.stringify(result));
    }
    console.log(JSON.stringify({ ok: true, platforms: results.length }));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
