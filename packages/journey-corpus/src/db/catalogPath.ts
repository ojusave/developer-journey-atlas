import { existsSync } from "node:fs";
import path from "node:path";

/** Resolve blocker catalog JSON from env or known monorepo / package paths. */
export function resolveCatalogPath(dataRoot: string): string {
  if (process.env.CATALOG_PATH && existsSync(process.env.CATALOG_PATH)) {
    return process.env.CATALOG_PATH;
  }
  const candidates = [
    path.join(dataRoot, "blocker-catalog.json"),
    path.join(dataRoot, "public", "data", "blocker-catalog.json"),
    path.join(dataRoot, "../../src/generated/catalog.json"),
    path.join(dataRoot, "../../../src/generated/catalog.json"),
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "Blocker catalog not found. Run repo-root `npm run catalog:build`, copy into blocker-catalog.json, or set CATALOG_PATH.",
  );
}
