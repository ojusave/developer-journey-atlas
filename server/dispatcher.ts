// Build a bounded key from the saved turn and attempt, without exposing answer content.
import { createHash } from "node:crypto";
import { Render } from "@renderinc/sdk";
import type { RuntimeConfig } from "./config.js";
import type { WorkflowTurnInput } from "./domain.js";
import type { TurnProcessor } from "./processor.js";
import type { DiagnosticStore } from "./store.js";

export interface DispatchResult {
  mode: "direct" | "render_workflow";
  workflowRunId: string | null;
}

// A retry carries the last saved Render run so a lost reply can be recovered.
// This stays outside task input: the worker must receive the same saved answer.
export interface DispatchRecovery {
  workflowRunId: string | null;
}

export interface TurnDispatcher {
  dispatch(input: WorkflowTurnInput, recovery?: DispatchRecovery): Promise<DispatchResult>;
}

export class DirectTurnDispatcher implements TurnDispatcher {
  constructor(private readonly processor: TurnProcessor) {}

  async dispatch(input: WorkflowTurnInput): Promise<DispatchResult> {
    await this.processor.process(input);
    return { mode: "direct", workflowRunId: null };
  }
}

export class RenderWorkflowTurnDispatcher implements TurnDispatcher {
  private readonly client: Render;
  private readonly taskSlug: string;

  constructor(private readonly config: RuntimeConfig, private readonly store: DiagnosticStore) {
    if (!config.renderApiKey || !config.renderWorkflowTaskSlug) {
      throw new Error("Render Workflow dispatcher is missing required configuration");
    }
    this.client = new Render({ token: config.renderApiKey });
    this.taskSlug = config.renderWorkflowTaskSlug;
  }

  async dispatch(input: WorkflowTurnInput, recovery?: DispatchRecovery): Promise<DispatchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.workflowDispatchTimeoutMs);
    timer.unref();
    // Render remembers keys for 24 hours within one workflow version. Including
    // the task and saved turn keeps two different answers from sharing a key.
    // A confirmed failed run becomes the anchor for one deliberate new attempt.
    const start = async (previousRunId: string | null): Promise<string> => {
      const idempotencyKey = `atlas-turn-${createHash("sha256")
        .update(JSON.stringify([this.taskSlug, input, previousRunId]))
        .digest("hex")}`;
      const run = await this.client.workflows.startTask(this.taskSlug, [input], {
        idempotencyKey,
        signal: controller.signal,
      });
      await this.store.markWorkflowDispatched(input.turnId, run.taskRunId);
      return run.taskRunId;
    };

    try {
      // If the first reply was lost, the original key retrieves its accepted run.
      // Save that run before attempting any fresh work, so another lost reply
      // always retries the same next-attempt key instead of inventing a new one.
      let runId = recovery?.workflowRunId ?? await start(null);
      if (recovery) {
        const details = await this.readRunBeforeTimeout(runId, controller.signal);
        if (details.status === "failed" || details.status === "canceled") {
          runId = await start(runId);
        }
      }
      return { mode: "render_workflow", workflowRunId: runId };
    } finally {
      clearTimeout(timer);
    }
  }

  private async readRunBeforeTimeout(runId: string, signal: AbortSignal) {
    // The SDK's status read has no signal option. Bound how long this request
    // waits, and remove the listener whether the read or the timeout wins.
    let onAbort: () => void = () => undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      onAbort = () => reject(new Error("Workflow status lookup timed out"));
      if (signal.aborted) onAbort();
      else signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return await Promise.race([this.client.workflows.getTaskRun(runId), timeout]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }
}
