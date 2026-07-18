// @vitest-environment node
import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import type {
  DiagnosticTelemetry,
  DiagnosticTurnSpan,
  DiagnosticTurnTelemetryContext,
} from "./telemetry.js";
import { createTestService } from "./test-runtime.js";

class CapturingTelemetry implements DiagnosticTelemetry {
  contexts: DiagnosticTurnTelemetryContext[] = [];
  results: unknown[] = [];

  async traceTurn<T>(
    context: DiagnosticTurnTelemetryContext,
    operation: (span: DiagnosticTurnSpan) => Promise<T>,
  ): Promise<T> {
    this.contexts.push(context);
    return operation({ complete: (result) => this.results.push(result) });
  }

  async shutdown(): Promise<void> {}
}

describe("diagnostic telemetry boundary", () => {
  it("exports operational metadata without participant answers or generated text", async () => {
    const telemetry = new CapturingTelemetry();
    const { service } = createTestService({ telemetry });
    const created = await service.createSession({ platformArchetypeIds: ["P04"] });
    const sensitiveAnswer = "My private customer and internal launch plan";

    await service.submitTurn(created.session.id, created.sessionToken, randomUUID(), {
      expectedRevision: 0,
      objectiveId: "D1",
      answer: { kind: "text", text: sensitiveAnswer },
    });

    const exported = JSON.stringify({ contexts: telemetry.contexts, results: telemetry.results });
    expect(exported).not.toContain(sensitiveAnswer);
    expect(exported).not.toContain("captured that as an observation");
    expect(telemetry.contexts).toEqual([expect.objectContaining({
      objectiveId: "D1",
      reasoningMode: "deterministic",
      revision: 1,
    })]);
    expect(telemetry.results).toEqual([expect.objectContaining({
      validationWarningCount: expect.any(Number),
      latencyMs: expect.any(Number),
    })]);
  });
});
