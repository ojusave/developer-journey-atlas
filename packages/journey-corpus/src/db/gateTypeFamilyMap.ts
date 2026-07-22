/**
 * Soft map from friction_gates[].type to universal blocker family IDs.
 * Families are hypotheses menus, not diagnosed causes.
 */
export const GATE_TYPE_FAMILY_MAP: Record<string, string> = {
  account: "U04",
  verification: "U04",
  credential: "U12",
  permission: "U07",
  access: "U07",
  approval: "U07",
  payment: "U06",
  billing: "U06",
  legal: "U06",
  terms: "U06",
  policy: "U06",
  dns: "U13",
  domain: "U13",
  network: "U13",
  wait: "U25",
  "rate-limit": "U20",
  limit: "U20",
  installation: "U11",
  download: "U11",
  software: "U11",
  configuration: "U12",
  environment: "U12",
  form: "U15",
  choice: "U15",
  hardware: "U10",
  knowledge: "U09",
  other: "U08",
};

/** Resolve a gate type to a family id, or null when unmapped. */
export function familyIdForGateType(type: string): string | null {
  const key = type.trim().toLowerCase();
  return GATE_TYPE_FAMILY_MAP[key] ?? null;
}
