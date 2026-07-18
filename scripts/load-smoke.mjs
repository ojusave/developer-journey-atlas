import { randomUUID } from "node:crypto";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:10000";
const concurrency = Number(process.env.CONCURRENCY ?? 100);
if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 500) {
  throw new Error("CONCURRENCY must be an integer from 1 to 500");
}

async function request(path, init) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = response.status === 204 ? null : await response.json();
  if (!response.ok) throw new Error(`${response.status} ${body?.error?.code ?? "request_failed"}`);
  return body;
}

async function runSession(index) {
  const startedAt = performance.now();
  const created = await request("/api/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ context: { platformArchetypeIds: [index % 2 === 0 ? "P04" : "P05"] } }),
  });
  const authorization = `Bearer ${created.sessionToken}`;
  await request(`/api/sessions/${created.session.id}/turns`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authorization,
      "Idempotency-Key": randomUUID(),
    },
    body: JSON.stringify({
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: "Developers do not begin the representative path." },
    }),
  });
  await request(`/api/sessions/${created.session.id}`, {
    method: "DELETE",
    headers: { Authorization: authorization },
  });
  return performance.now() - startedAt;
}

const startedAt = performance.now();
const settled = await Promise.allSettled(Array.from({ length: concurrency }, (_, index) => runSession(index)));
const failures = settled.filter((result) => result.status === "rejected");
const durations = settled
  .filter((result) => result.status === "fulfilled")
  .map((result) => result.value)
  .sort((left, right) => left - right);

function percentile(values, percentileValue) {
  return values[Math.min(values.length - 1, Math.ceil(values.length * percentileValue) - 1)] ?? 0;
}

const report = {
  concurrency,
  completed: durations.length,
  failed: failures.length,
  wallTimeMs: Math.round(performance.now() - startedAt),
  p50SessionMs: Math.round(percentile(durations, 0.5)),
  p95SessionMs: Math.round(percentile(durations, 0.95)),
  maxSessionMs: Math.round(durations.at(-1) ?? 0),
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length > 0) process.exitCode = 1;
