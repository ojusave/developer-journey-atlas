import { Render } from "@renderinc/sdk";
import type { RuntimeConfig } from "./config.js";
import type { WorkflowTurnInput } from "./domain.js";
import type { TurnProcessor } from "./processor.js";
import type { DiagnosticStore } from "./store.js";

export interface DispatchResult {
  mode: "direct" | "render_workflow";
  workflowRunId: string | null;
}

export interface TurnDispatcher {
  dispatch(input: WorkflowTurnInput): Promise<DispatchResult>;
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

  async dispatch(input: WorkflowTurnInput): Promise<DispatchResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.workflowDispatchTimeoutMs);
    timer.unref();
    let taskRun;
    try {
      taskRun = await this.client.workflows.startTask(this.taskSlug, [input], controller.signal);
    } finally {
      clearTimeout(timer);
    }
    await this.store.markWorkflowDispatched(input.turnId, taskRun.taskRunId);
    return { mode: "render_workflow", workflowRunId: taskRun.taskRunId };
  }
}
