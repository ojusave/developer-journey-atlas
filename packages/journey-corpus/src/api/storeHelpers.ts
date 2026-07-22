import type { DataStore, MetricRow } from "../core/ports.js";
import type { PostgresDataStore } from "../adapters/postgresData.js";

/** True when the store can hot-load and search across Render instances via Postgres. */
export function isPostgresStore(store: DataStore): store is PostgresDataStore {
  return (
    typeof (store as PostgresDataStore).ingestLive === "function" &&
    typeof (store as PostgresDataStore).getPrisma === "function" &&
    typeof (store as PostgresDataStore).ensurePlatformLoaded === "function"
  );
}

/**
 * Ensure a platform exists in this process snapshot. On Postgres, load from DB
 * if another instance persisted it first.
 */
export async function ensureRow(store: DataStore, slug: string): Promise<MetricRow | undefined> {
  const local = store.getRow(slug);
  if (local) return local;
  if (isPostgresStore(store)) {
    const loaded = await store.ensurePlatformLoaded(slug);
    if (loaded) return store.getRow(slug);
  }
  return undefined;
}
