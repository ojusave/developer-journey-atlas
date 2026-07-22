import { createHash } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import type { EmbeddingProvider } from "../adapters/openRouterEmbeddings.js";
import {
  filterConfirmedReasonIds,
  gateEmbedText,
  rankReasonsByEmbedding,
  reasonEmbedText,
  type ReasonDoc,
} from "./blockerLinking.js";

const LINK_SOURCE = "openrouter";
const TOP_K = 12;
const MAX_LINKS = 3;
const EMBED_BATCH = 64;

export interface LinkConfirmProvider {
  /**
   * Given gate text and ranked candidates, return JSON with reason_ids subset.
   * Implementations call a chat model; fakes return canned picks.
   */
  confirmLinks(input: {
    gateText: string;
    candidates: Array<{ id: string; label: string; similarity: number }>;
  }): Promise<unknown>;
}

export interface LinkPlatformResult {
  slug: string;
  gates: number;
  linksWritten: number;
  reasonsIndexed: number;
  embeddingModel: string;
}

function contentHash(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function asJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

/**
 * Ensure all catalog reasons have embeddings for the active model.
 * Returns the in-memory corpus used for retrieval.
 */
export async function ensureReasonEmbeddings(
  prisma: PrismaClient,
  embedder: EmbeddingProvider,
): Promise<Array<ReasonDoc & { embedding: number[] }>> {
  const reasons = await prisma.catalogNode.findMany({
    where: { kind: "reason" },
    select: { id: true, label: true, parentId: true },
  });
  if (reasons.length === 0) {
    throw new Error("No catalog reasons in Postgres. Run db:seed first.");
  }

  const existing = await prisma.catalogEmbedding.findMany({
    where: { model: embedder.model },
  });
  const byId = new Map(existing.map((row) => [row.reasonId, row]));

  const stale: ReasonDoc[] = [];
  for (const reason of reasons) {
    const text = reasonEmbedText(reason);
    const hash = contentHash(text);
    const row = byId.get(reason.id);
    if (!row || row.contentHash !== hash || row.model !== embedder.model) {
      stale.push(reason);
    }
  }

  for (let i = 0; i < stale.length; i += EMBED_BATCH) {
    const batch = stale.slice(i, i + EMBED_BATCH);
    const vectors = await embedder.embed(batch.map((reason) => reasonEmbedText(reason)));
    for (let j = 0; j < batch.length; j += 1) {
      const reason = batch[j];
      const text = reasonEmbedText(reason);
      await prisma.catalogEmbedding.upsert({
        where: { reasonId: reason.id },
        create: {
          reasonId: reason.id,
          model: embedder.model,
          contentHash: contentHash(text),
          embedding: asJson(vectors[j]),
        },
        update: {
          model: embedder.model,
          contentHash: contentHash(text),
          embedding: asJson(vectors[j]),
        },
      });
    }
  }

  const refreshed = await prisma.catalogEmbedding.findMany({
    where: { model: embedder.model },
  });
  const reasonById = new Map(reasons.map((r) => [r.id, r]));
  const corpus: Array<ReasonDoc & { embedding: number[] }> = [];
  for (const row of refreshed) {
    const reason = reasonById.get(row.reasonId);
    if (!reason) continue;
    corpus.push({
      ...reason,
      embedding: row.embedding as unknown as number[],
    });
  }
  return corpus;
}

/**
 * Link one platform's friction gates to catalog reasons via retrieve-then-confirm.
 */
export async function linkPlatformBlockers(
  prisma: PrismaClient,
  embedder: EmbeddingProvider,
  confirmer: LinkConfirmProvider | null,
  slug: string,
): Promise<LinkPlatformResult> {
  const corpus = await ensureReasonEmbeddings(prisma, embedder);
  const gates = await prisma.frictionGate.findMany({
    where: { platformSlug: slug },
    orderBy: [{ atStep: "asc" }, { type: "asc" }],
  });
  if (gates.length === 0) {
    return {
      slug,
      gates: 0,
      linksWritten: 0,
      reasonsIndexed: corpus.length,
      embeddingModel: embedder.model,
    };
  }

  const steps = await prisma.journeyStep.findMany({ where: { platformSlug: slug } });
  const stepByNumber = new Map(steps.map((step) => [step.stepNumber, step]));

  let linksWritten = 0;
  for (const gate of gates) {
    const step = gate.atStep != null ? stepByNumber.get(gate.atStep) : undefined;
    const text = gateEmbedText({
      type: gate.type,
      description: gate.description,
      stepAction: step?.action ?? null,
      stepPhase: step?.phase ?? null,
    });
    const [queryVec] = await embedder.embed([text]);
    const ranked = rankReasonsByEmbedding(queryVec, corpus, TOP_K);
    const allowed = new Set(ranked.map((row) => row.id));

    let picks = ranked.slice(0, MAX_LINKS).map((row) => row.id);
    let rationale: string | undefined;
    let confidence = "similarity";

    if (confirmer) {
      const raw = await confirmer.confirmLinks({ gateText: text, candidates: ranked });
      const filtered = filterConfirmedReasonIds(raw, allowed, MAX_LINKS);
      picks = filtered.reasonIds;
      rationale = filtered.rationale;
      confidence = picks.length ? "confirmed" : "confirmed-empty";
    }

    await prisma.gateBlockerLink.deleteMany({
      where: { frictionGateId: gate.id, linkSource: LINK_SOURCE },
    });

    for (const reasonId of picks) {
      const match = ranked.find((row) => row.id === reasonId);
      await prisma.gateBlockerLink.create({
        data: {
          frictionGateId: gate.id,
          blockerReasonId: reasonId,
          linkSource: LINK_SOURCE,
          confidence,
          model: confirmer ? `${embedder.model}+confirm` : embedder.model,
          similarity: match?.similarity ?? null,
          rationale: rationale ?? null,
        },
      });
      linksWritten += 1;
    }
  }

  return {
    slug,
    gates: gates.length,
    linksWritten,
    reasonsIndexed: corpus.length,
    embeddingModel: embedder.model,
  };
}
