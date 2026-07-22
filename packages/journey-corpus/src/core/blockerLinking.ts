/**
 * Cosine similarity for equal-length embedding vectors.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  return denom === 0 ? 0 : dot / denom;
}

export interface ReasonDoc {
  id: string;
  label: string;
  parentId?: string | null;
}

export interface RankedReason {
  id: string;
  label: string;
  similarity: number;
}

/** Rank reason embeddings against a query vector; return top-k. */
export function rankReasonsByEmbedding(
  query: number[],
  corpus: Array<ReasonDoc & { embedding: number[] }>,
  topK: number,
): RankedReason[] {
  return corpus
    .map((row) => ({
      id: row.id,
      label: row.label,
      similarity: cosineSimilarity(query, row.embedding),
    }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);
}

export interface ConfirmPick {
  reasonIds: string[];
  rationale?: string;
}

/**
 * Parse LLM JSON and keep only IDs that appear in the candidate allowlist.
 */
export function filterConfirmedReasonIds(
  parsed: unknown,
  allowedIds: Set<string>,
  max = 3,
): ConfirmPick {
  if (!parsed || typeof parsed !== "object") return { reasonIds: [] };
  const obj = parsed as Record<string, unknown>;
  const raw = Array.isArray(obj.reason_ids)
    ? obj.reason_ids
    : Array.isArray(obj.reasonIds)
      ? obj.reasonIds
      : [];
  const reasonIds = raw
    .filter((id): id is string => typeof id === "string")
    .map((id) => id.trim())
    .filter((id) => allowedIds.has(id))
    .slice(0, max);
  const rationale = typeof obj.rationale === "string" ? obj.rationale.slice(0, 500) : undefined;
  return { reasonIds, rationale };
}

/** Build the text blob embedded for a friction gate. */
export function gateEmbedText(input: {
  type: string;
  description: string;
  stepAction?: string | null;
  stepPhase?: string | null;
}): string {
  const parts = [
    `Friction type: ${input.type}`,
    `Description: ${input.description}`,
  ];
  if (input.stepAction) parts.push(`Step action: ${input.stepAction}`);
  if (input.stepPhase) parts.push(`Step phase: ${input.stepPhase}`);
  return parts.join("\n");
}

/** Build the text blob embedded for a catalog reason. */
export function reasonEmbedText(reason: ReasonDoc): string {
  return [`Reason id: ${reason.id}`, `Label: ${reason.label}`, reason.parentId ? `Family: ${reason.parentId}` : ""]
    .filter(Boolean)
    .join("\n");
}
