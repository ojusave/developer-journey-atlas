import { createScannerServer } from "./http.js";
import { safeLogger } from "./privacy.js";
import { createRuntime } from "./runtime.js";

const runtime = createRuntime();
const server = createScannerServer(runtime.service, runtime.store, runtime.config, safeLogger);

async function purgeExpiredData(): Promise<void> {
  try {
    const purged = await runtime.store.purgeExpired();
    if (purged.sessionsDeleted || purged.envelopesCleared) {
      safeLogger.info({
        event: "diagnostic_expired_data_purged",
        sessionsDeleted: purged.sessionsDeleted,
        envelopesCleared: purged.envelopesCleared,
      });
    }
  } catch {
    safeLogger.error({ event: "diagnostic_expiry_purge_failed", errorCode: "expiry_purge_failed" });
  }
}

const purgeTimer = setInterval(() => void purgeExpiredData(), 60_000);
purgeTimer.unref();
void purgeExpiredData();

server.listen(runtime.config.port, "0.0.0.0", () => {
  safeLogger.info({ event: "scanner_server_started", status: "ready", phase: runtime.config.executionMode });
});

async function shutdown(signal: string): Promise<void> {
  safeLogger.info({ event: "scanner_server_stopping", status: signal });
  clearInterval(purgeTimer);
  server.close(async () => {
    await Promise.all([runtime.store.close(), runtime.telemetry.shutdown()]);
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
