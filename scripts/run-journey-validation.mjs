import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const result = spawnSync(
  "npm",
  ["--prefix", "packages/journey-corpus", "run", "validate"],
  { cwd: root, encoding: "utf8" },
);

if (result.status !== 0) {
  process.stdout.write(result.stdout ?? "");
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

console.log("Journey corpus validation passed: 205 canonical records, no validation errors.");
