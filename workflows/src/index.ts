import { task } from "@renderinc/sdk/workflows";

import {
  executeDiagnosticTurn,
  runtimeFromEnvironment,
  type DiagnosticTurnInput,
  type DiagnosticTurnResult,
} from "./diagnostic-turn.js";

export const diagnosticTurn = task(
  {
    name: "diagnosticTurn",
    plan: "starter",
    timeoutSeconds: 120,
    retry: {
      maxRetries: 2,
      waitDurationMs: 1_000,
      backoffScaling: 2,
    },
  },
  async function diagnosticTurn(input: DiagnosticTurnInput): Promise<DiagnosticTurnResult> {
    return executeDiagnosticTurn(input, runtimeFromEnvironment());
  },
);
