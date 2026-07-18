import { DiagnosticCatalog } from "./catalog.js";
import type { RuntimeConfig } from "./config.js";
import { DirectTurnDispatcher, type TurnDispatcher } from "./dispatcher.js";
import { EnvelopeCipher, type SafeLogger } from "./privacy.js";
import { TurnProcessor } from "./processor.js";
import { DeterministicReasoner, type TurnReasoner } from "./reasoner.js";
import { DiagnosticService } from "./service.js";
import { InMemoryDiagnosticStore, type DiagnosticStore } from "./store.js";
import { createDiagnosticTelemetry, type DiagnosticTelemetry } from "./telemetry.js";

export const testConfig: RuntimeConfig = {
  nodeEnv: "test",
  port: 10_000,
  allowInMemoryStore: true,
  envelopeKey: Buffer.alloc(32, 7),
  sessionTtlHours: 24,
  turnEnvelopeTtlSeconds: 3_600,
  reasoningMode: "deterministic",
  executionMode: "direct",
  workflowDispatchTimeoutMs: 10_000,
  trustProxy: false,
  rateLimitWindowSeconds: 60,
  sessionCreateLimit: 300,
  sessionTurnLimit: 30,
  ipTurnLimit: 1_200,
  arizeTelemetryEnabled: false,
  arizeOtlpEndpoint: "https://otlp.arize.com/v1/traces",
};

export const silentLogger: SafeLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
};

export function createTestService(options: {
  store?: DiagnosticStore;
  reasoner?: TurnReasoner;
  dispatcher?: (processor: TurnProcessor, store: DiagnosticStore) => TurnDispatcher;
  config?: RuntimeConfig;
  telemetry?: DiagnosticTelemetry;
} = {}) {
  const config = options.config ?? testConfig;
  const store = options.store ?? new InMemoryDiagnosticStore();
  const catalog = DiagnosticCatalog.fromDefaultPath();
  const cipher = new EnvelopeCipher(config.envelopeKey);
  const reasoner = options.reasoner ?? new DeterministicReasoner();
  const telemetry = options.telemetry ?? createDiagnosticTelemetry(config);
  const processor = new TurnProcessor(store, catalog, cipher, reasoner, silentLogger, telemetry);
  const dispatcher = options.dispatcher?.(processor, store) ?? new DirectTurnDispatcher(processor);
  const service = new DiagnosticService(config, store, catalog, cipher, dispatcher, processor, silentLogger);
  return { service, store, catalog, cipher, processor, config };
}
