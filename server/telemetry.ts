import { createHash } from "node:crypto";
import {
  SpanStatusCode,
  type Attributes,
  type Span,
  type Tracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-proto";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import {
  OpenInferenceSpanKind,
  SEMRESATTRS_PROJECT_NAME,
  SemanticConventions,
} from "@arizeai/openinference-semantic-conventions";
import type { RuntimeConfig } from "./config.js";

export interface DiagnosticTurnTelemetryContext {
  sessionId: string;
  revision: number;
  objectiveId: string;
  reasoningMode: "deterministic" | "mastra";
}

export interface DiagnosticTurnTelemetryResult {
  validationWarningCount: number;
  candidateCount: number;
  terminalState: string | null;
  latencyMs: number;
}

export interface DiagnosticTurnSpan {
  complete(result: DiagnosticTurnTelemetryResult): void;
}

export interface DiagnosticTelemetry {
  traceTurn<T>(
    context: DiagnosticTurnTelemetryContext,
    operation: (span: DiagnosticTurnSpan) => Promise<T>,
  ): Promise<T>;
  shutdown(): Promise<void>;
}

function pseudonymize(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 16);
}

function initialAttributes(context: DiagnosticTurnTelemetryContext): Attributes {
  return {
    [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind.CHAIN,
    "scanner.session_pseudonym": pseudonymize(context.sessionId),
    "scanner.revision": context.revision,
    "scanner.objective_id": context.objectiveId,
    "scanner.reasoning_mode": context.reasoningMode,
  };
}

class NoopDiagnosticTelemetry implements DiagnosticTelemetry {
  async traceTurn<T>(
    _context: DiagnosticTurnTelemetryContext,
    operation: (span: DiagnosticTurnSpan) => Promise<T>,
  ): Promise<T> {
    return operation({ complete: () => undefined });
  }

  async shutdown(): Promise<void> {}
}

class ArizeDiagnosticTelemetry implements DiagnosticTelemetry {
  constructor(
    private readonly tracer: Tracer,
    private readonly provider: NodeTracerProvider,
  ) {}

  async traceTurn<T>(
    context: DiagnosticTurnTelemetryContext,
    operation: (span: DiagnosticTurnSpan) => Promise<T>,
  ): Promise<T> {
    const span = this.tracer.startSpan("diagnostic.turn", { attributes: initialAttributes(context) });
    try {
      const value = await operation({
        complete: (result) => setResultAttributes(span, result),
      });
      span.setStatus({ code: SpanStatusCode.OK });
      return value;
    } catch (error) {
      span.setAttribute("scanner.error", true);
      span.setAttribute("scanner.error_type", error instanceof Error ? error.constructor.name : "UnknownError");
      span.setStatus({ code: SpanStatusCode.ERROR });
      throw error;
    } finally {
      span.end();
    }
  }

  async shutdown(): Promise<void> {
    await this.provider.shutdown();
  }
}

function setResultAttributes(span: Span, result: DiagnosticTurnTelemetryResult): void {
  span.setAttributes({
    "scanner.validation_warning_count": result.validationWarningCount,
    "scanner.candidate_count": result.candidateCount,
    "scanner.terminal_state": result.terminalState ?? "active",
    "scanner.latency_ms": result.latencyMs,
  });
}

export function createDiagnosticTelemetry(config: RuntimeConfig): DiagnosticTelemetry {
  if (!config.arizeTelemetryEnabled) return new NoopDiagnosticTelemetry();
  if (!config.arizeApiKey || !config.arizeSpaceId || !config.arizeProjectName || !config.arizeOtlpEndpoint) {
    throw new Error("Arize telemetry is enabled but its required configuration is incomplete");
  }

  const exporter = new OTLPTraceExporter({
    url: config.arizeOtlpEndpoint,
    headers: {
      "arize-api-key": config.arizeApiKey,
      "arize-space-id": config.arizeSpaceId,
    },
  });
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: "first-mile-scanner",
      [ATTR_SERVICE_VERSION]: "0.1.0",
      [SEMRESATTRS_PROJECT_NAME]: config.arizeProjectName,
      "deployment.environment.name": config.nodeEnv,
    }),
    spanProcessors: [new BatchSpanProcessor(exporter)],
  });
  provider.register();
  return new ArizeDiagnosticTelemetry(provider.getTracer("first-mile-scanner"), provider);
}
