import { Prisma, PrismaClient } from "@prisma/client";

// When an uncertain claim is still stored beyond Render's key window, require
// operator verification instead of treating that saved attempt as a safe retry.
export class ResearchSubmissionExpired extends Error {
  constructor() { super("The original research submission needs manual verification."); }
}

export type ResearchClaimStatus = "claiming" | "pending" | "completed" | "failed";

export interface ResearchClaimRow {
  slug: string;
  runId: string;
  platform: string;
  status: ResearchClaimStatus;
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
  // A known run can still be alive after the local freshness window. Keep its
  // identity until polling confirms a terminal outcome instead of starting over.
  if (claim.status === "pending" && claim.runId) return claim;
  if (isFresh(claim, now)) return claim;
  return null;
}

/**
 * Atomically take ownership of researching a slug. Returns an existing active
 * claim when another developer already started the same platform.
 */
export async function beginResearchClaim(
  input: { slug: string; platform: string },
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
    if (stale?.status === "pending" && stale.runId) return { kind: "existing", claim: asClaim(stale) };
    if (stale && !isFresh(asClaim(stale), now) && stale.status !== "completed") {
      // Without a run id the previous POST may have succeeded. Retain both
      // the original input and start time, which identify that same submission.
      // Only a confirmed terminal failure gets a new attempt identity.
      const uncertain = !stale.runId;
      if (uncertain && now - stale.startedAt.getTime() >= 24 * 60 * 60_000) {
        throw new ResearchSubmissionExpired();
      }
      const updated = await prisma.researchClaim.updateMany({
        // Compare the old identity so concurrent requests cannot each replace it.
        where: { slug: input.slug, status: stale.status, startedAt: stale.startedAt, runId: stale.runId },
        data: {
          platform: uncertain ? stale.platform : input.platform,
          status: "claiming",
          runId: "",
          startedAt: uncertain ? stale.startedAt : new Date(Math.max(now, stale.startedAt.getTime() + 1)),
        },
      });
      const current = await prisma.researchClaim.findUniqueOrThrow({ where: { slug: input.slug } });
      return { kind: updated.count ? "acquired" : "existing", claim: asClaim(current) };
    }
    throw err;
  }
}

export async function attachResearchRunId(
  slug: string,
  runId: string,
  prisma: PrismaClient,
  startedAt: Date,
): Promise<void> {
  // A late response cannot replace a newer attempt or reopen completed research.
  await prisma.researchClaim.updateMany({
    where: { slug, startedAt, runId: "", status: { in: ["claiming", "failed"] } },
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

export async function completeResearchClaimByRunId(
  runId: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.researchClaim.updateMany({
    where: { runId },
    data: { status: "completed" },
  });
}

export async function failResearchClaim(
  slug: string,
  prisma: PrismaClient,
  startedAt?: Date,
): Promise<void> {
  await prisma.researchClaim.updateMany({
    // A lost response must not erase a run id saved by a concurrent recovery.
    where: { slug, runId: "", status: "claiming", ...(startedAt ? { startedAt } : {}) },
    data: { status: "failed" },
  });
}

export async function failResearchClaimByRunId(
  runId: string,
  prisma: PrismaClient,
): Promise<void> {
  await prisma.researchClaim.updateMany({
    where: { runId, status: { in: ["claiming", "pending"] } },
    data: { status: "failed" },
  });
}

/** Count research starts in a window across all service instances. */
export async function countRecentResearchStarts(
  prisma: PrismaClient,
  windowMs: number,
  options: { now?: number } = {},
): Promise<number> {
  const now = options.now ?? Date.now();
  return prisma.researchClaim.count({
    where: {
      startedAt: { gte: new Date(now - windowMs) },
    },
  });
}

export const COMPLETED_CLAIM_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;
export const STALE_ACTIVE_CLAIM_RETENTION_MS = 24 * 60 * 60 * 1_000;

/** Delete expired claims without retaining IP addresses or provider payloads. */
export async function cleanupResearchClaims(
  prisma: PrismaClient,
  now = Date.now(),
): Promise<{ deleted: number }> {
  const result = await prisma.researchClaim.deleteMany({
    where: {
      OR: [
        {
          status: { in: ["completed", "failed"] },
          updatedAt: { lt: new Date(now - COMPLETED_CLAIM_RETENTION_MS) },
        },
        {
          status: { in: ["claiming", "pending"] },
          updatedAt: { lt: new Date(now - STALE_ACTIVE_CLAIM_RETENTION_MS) },
        },
      ],
    },
  });
  return { deleted: result.count };
}
