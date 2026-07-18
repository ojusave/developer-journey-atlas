import { DiagnosticCatalog } from "./catalog.js";
import { loadConfig, type RuntimeConfig } from "./config.js";
import { DirectTurnDispatcher, RenderWorkflowTurnDispatcher, type TurnDispatcher } from "./dispatcher.js";
import { EnvelopeCipher, safeLogger } from "./privacy.js";
import { TurnProcessor } from "./processor.js";
import { createReasoner } from "./reasoner.js";
import { DiagnosticService } from "./service.js";
import { InMemoryDiagnosticStore, type DiagnosticStore } from "./store.js";
import { PostgresDiagnosticStore } from "./postgres-store.js";
import { createDiagnosticTelemetry, type DiagnosticTelemetry } from "./telemetry.js";

export interface ScannerRuntime {
  config: RuntimeConfig;
  store: DiagnosticStore;
  service: DiagnosticService;
  telemetry: DiagnosticTelemetry;
}

export function createRuntime(config = loadConfig()): ScannerRuntime {
  const catalog = DiagnosticCatalog.fromDefaultPath();
  const store: DiagnosticStore = config.databaseUrl
    ? new PostgresDiagnosticStore(config.databaseUrl)
    : new InMemoryDiagnosticStore();
  const cipher = new EnvelopeCipher(config.envelopeKey);
  const reasoner = createReasoner(config);
  const telemetry = createDiagnosticTelemetry(config);
  const processor = new TurnProcessor(store, catalog, cipher, reasoner, safeLogger, telemetry);
  const dispatcher: TurnDispatcher = config.executionMode === "render_workflow"
    ? new RenderWorkflowTurnDispatcher(config, store)
    : new DirectTurnDispatcher(processor);
  const service = new DiagnosticService(config, store, catalog, cipher, dispatcher, processor, safeLogger);
  return { config, store, service, telemetry };
}
