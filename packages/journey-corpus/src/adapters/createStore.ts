import { config } from "../config.js";
import { LocalDataStore } from "./localData.js";
import { PostgresDataStore } from "./postgresData.js";
import type { DataStore } from "../core/ports.js";

export type StoreMode = "local" | "postgres";

/** Resolve serving mode. Production on Render defaults to postgres when DATABASE_URL is set. */
export function resolveStoreMode(): StoreMode {
  const explicit = (process.env.DATA_STORE ?? "").trim().toLowerCase();
  if (explicit === "local" || explicit === "postgres") return explicit;
  if (process.env.DATABASE_URL) return "postgres";
  return "local";
}

/**
 * Composition helper: build the DataStore chosen by env.
 * Rollback: set DATA_STORE=local to force file-backed serving.
 */
export async function createDataStore(): Promise<{ store: DataStore; mode: StoreMode }> {
  const mode = resolveStoreMode();
  if (mode === "postgres") {
    if (!process.env.DATABASE_URL) {
      throw new Error("DATA_STORE=postgres requires DATABASE_URL.");
    }
    const store = await PostgresDataStore.create();
    return { store, mode };
  }
  return { store: new LocalDataStore(config.dataRoot), mode };
}
