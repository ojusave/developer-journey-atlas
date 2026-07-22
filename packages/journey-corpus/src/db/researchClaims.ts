import { Prisma, PrismaClient } from "@prisma/client";

export type ResearchClaimStatus = "claiming" | "pending" | "completed" | "failed";

export interface ResearchClaimRow {
  slug: string;
  runId: string;
  platform: string;
  status: ResearchClaimStatus;
  clientIp: string | null;
  startedAt: Date;
  updatedAt: Date;
}

const CLAIMING_STALE_MS = 60_000;
const PENDING_STALE_MS = 45 * 60_000;

function asClaim(row: {
  slug: string;
  runId: string;
  platform: string;
  status: string;
  clientIp: string | null;
  startedAt: Date;
  updatedAt: Date;
}): ResearchClaimRow {
  return {
    ...row,
    status: row.status as ResearchClaimStatus,
  };
}

function isFresh(claim: ResearchClaimRow, now: number): boolean {
  const age = now - claim.startedAt.getTime();
  if (claim.status === "claiming") return age < CLAIMING_STALE_MS;
  if (claim.status === "pending") return age < PENDING_STALE_MS && Boolean(claim.runId);
  return false;
}

/**
 * Look up a live research claim. Fresh claiming/pending claims are resumed by
 * concurrent clients instead of starting a second Workflow.
 */
export async function findActiveResearchClaim(
  slug: string,
  prisma: PrismaClient,
  now = Date.now(),
): Promise<ResearchClaimRow | null> {
  const row = await prisma.researchClaim.findUnique({ where: { slug } });
  if (!row) return null;
  const claim = asClaim(row);
  if (claim.status === "completed") return claim;
  if (isFresh(claim, now)) return claim;
  return null;
}

/**
 * Atomically take ownership of researching a slug. Returns an existing active
 * claim when another developer already started the same platform.
 */
export async function beginResearchClaim(
  input: { slug: string; platform: string; clientIp: string | null },
  prisma: PrismaClient,
  now = Date.now(),
): Promise<{ kind: "existing"; claim: ResearchClaimRow } | { kind: "acquired"; claim: ResearchClaimRow }> {
  const existing = await findActiveResearchClaim(input.slug, prisma, now);
  if (existing) {
    if (existing.status === "completed") return { kind: "existing", claim: existing };
    if (existing.status === "claiming" || existing.status === "pending") {
      return { kind: "existing", claim: existing };
    }
  }

  try {
    const created = await prisma.researchClaim.create({
      data: {
        slug: input.slug,
        platform: input.platform,
        status: "claiming",
        runId: "",
        clientIp: input.clientIp,
      },
    });
    return { kind: "acquired", claim: asClaim(created) };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const again = await findActiveResearchClaim(input.slug, prisma, now);
      if (again) return { kind: "existing", claim: again };
    }
    // Stale row may block create: overwrite only claiming/failed/stale pending.
    const stale = await prisma.researchClaim.findUnique({ where: { slug: input.slug } });
    if (stale && !isFresh(asClaim(stale), now) && stale.status !== "completed") {
      const updated = await prisma.researchClaim.update({
        where: { slug: input.slug },
        data: {
          platform: input.platform,
          status: "claiming",
          runId: "",
          clientIp: input.clientIp,
          startedAt: new Date(now),
        },
      });
      return { kind: "acquired", claim: asClaim(updated) };
    }
    throw err;
  }
}

export async function attachResearchRunId(
  slug: string,
  runId: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.researchClaim.update({
    where: { slug },
    data: { runId, status: "pending" },
  });
}

export async function completeResearchClaim(
  slug: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.researchClaim.updateMany({
    where: { slug },
    data: { status: "completed" },
  });
}

export async function failResearchClaim(
  slug: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.researchClaim.updateMany({
    where: { slug, status: { in: ["claiming", "pending"] } },
    data: { status: "failed" },
  });
}

/** Count research starts in a window (optionally scoped to one client IP). */
export async function countRecentResearchStarts(
  prisma: PrismaClient,
  windowMs: number,
  options: { clientIp?: string | null; now?: number } = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  return prisma.researchClaim.count({
    where: {
      startedAt: { gte: new Date(now - windowMs) },
      ...(options.clientIp ? { clientIp: options.clientIp } : {}),
    },
  });
}
