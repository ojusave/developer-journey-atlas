// @vitest-environment node
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createScannerServer } from "./http.js";
import { DeterministicReasoner, type ReasoningInput, type TurnProposal, type TurnReasoner } from "./reasoner.js";
import { silentLogger, createTestService, testConfig } from "./test-runtime.js";

describe("scanner HTTP boundary", () => {
  const resources: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(resources.splice(0).map((close) => close()));
  });

  async function start(config = testConfig, reasoner?: TurnReasoner) {
    const runtime = createTestService({ config, reasoner });
    const server = createScannerServer(runtime.service, runtime.store, runtime.config, silentLogger);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    resources.push(() => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
    const port = (server.address() as AddressInfo).port;
    return { baseUrl: `http://127.0.0.1:${port}`, ...runtime };
  }

  it("keeps name and company out of the server session contract", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { platformArchetypeIds: [] }, name: "Sam", company: "Example" }),
    });
    expect(response.status).toBe(400);
    expect((await response.json() as { error: { code: string } }).error.code).toBe("invalid_request");
  });

  it("requires the opaque session credential", async () => {
    const { baseUrl } = await start();
    const createdResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { platformArchetypeIds: [] } }),
    });
    const created = await createdResponse.json() as { session: { id: string }; sessionToken: string };

    const unauthenticated = await fetch(`${baseUrl}/api/sessions/${created.session.id}`);
    expect(unauthenticated.status).toBe(401);
    const authenticated = await fetch(`${baseUrl}/api/sessions/${created.session.id}`, {
      headers: { Authorization: `Bearer ${created.sessionToken}` },
    });
    expect(authenticated.status).toBe(200);
  });

  it("rate-limits anonymous session creation and returns retry guidance", async () => {
    const { baseUrl } = await start({ ...testConfig, sessionCreateLimit: 1 });
    const request = () => fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { platformArchetypeIds: [] } }),
    });

    expect((await request()).status).toBe(201);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBeTruthy();
    expect((await limited.json() as { error: { code: string } }).error.code).toBe("rate_limited");
  });

  it("serves the service worker with revalidation instead of an immutable cache", async () => {
    const { baseUrl } = await start();
    const response = await fetch(`${baseUrl}/sw.js`);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
  });

  it("returns only an opaque retry turn ID when processing fails", async () => {
    class FailOnceReasoner implements TurnReasoner {
      readonly mode = "deterministic" as const;
      private calls = 0;
      private readonly fallback = new DeterministicReasoner();

      async propose(input: ReasoningInput): Promise<TurnProposal> {
        this.calls += 1;
        if (this.calls === 1) throw new Error("sensitive internal failure text");
        return this.fallback.propose(input);
      }
    }

    const { baseUrl } = await start(testConfig, new FailOnceReasoner());
    const createdResponse = await fetch(`${baseUrl}/api/sessions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ context: { platformArchetypeIds: [] } }),
    });
    const created = await createdResponse.json() as { session: { id: string }; sessionToken: string };
    const failedResponse = await fetch(`${baseUrl}/api/sessions/${created.session.id}/turns`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${created.sessionToken}`,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        expectedRevision: 0,
        objectiveId: "D1",
        answer: { kind: "text", text: "Developers do not begin an integration." },
      }),
    });
    expect(failedResponse.status).toBe(503);
    const failed = await failedResponse.json() as {
      error: { code: string; message: string; details?: { turnId?: string } };
    };
    expect(failed.error.code).toBe("turn_retryable");
    expect(failed.error.details?.turnId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(failed)).not.toContain("sensitive internal failure text");

    const retryResponse = await fetch(
      `${baseUrl}/api/sessions/${created.session.id}/turns/${failed.error.details?.turnId}/retry`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${created.sessionToken}` },
      },
    );
    expect(retryResponse.status).toBe(200);
    expect((await retryResponse.json() as { turn: { status: string } }).turn.status).toBe("completed");
  });
});
