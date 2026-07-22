import { createHash } from "node:crypto";
import type { PlatformRecord, ShortestPathAudit } from "../core/ports.js";

const INTERFACE_MAP: Record<string, string> = {
  browser: "browser",
  "web-ui": "web-ui",
  web: "web-ui",
  email: "email",
  cli: "cli",
  terminal: "cli",
  code: "code",
  ide: "ide",
  api: "api",
  sdk: "sdk",
  "external-system": "external-system",
  other: "other",
};

const KIND_MAP: Record<string, string> = {
  arrive: "account",
  account: "account",
  signup: "account",
  auth: "account",
  configure: "product-interaction",
  product: "product-interaction",
  implement: "implementation",
  implementation: "implementation",
  verify: "verification",
  verification: "verification",
  call: "implementation",
};

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function sha256(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

function mapInterface(value: unknown): string {
  const key = String(value || "other").toLowerCase();
  return INTERFACE_MAP[key] || "other";
}

function mapKind(step: { phase?: string; action?: string }): string {
  const phase = String(step.phase || "").toLowerCase();
  if (KIND_MAP[phase]) return KIND_MAP[phase];
  const action = String(step.action || "").toLowerCase();
  if (/sign\s*up|create.*account|register/.test(action)) return "account";
  if (/auth|oauth|login|token/.test(action)) return "account";
  if (/verify|confirm/.test(action)) return "verification";
  return "implementation";
}

function sourceIds(step: { source_ids?: string[] }, fallback: string[]): string[] {
  const ids = Array.isArray(step.source_ids) && step.source_ids.length ? step.source_ids : fallback;
  return [...new Set(ids)];
}

/**
 * Build a needs-human-judgment audit from a machine-drafted research record.
 * Counts stay null until an independent shortest-path audit verifies the route.
 */
export function buildNhjAuditFromRecord(record: PlatformRecord): ShortestPathAudit {
  const recordText = JSON.stringify(record);
  const slug = record.platform.slug;
  const name = record.platform.name;
  const category = record.category;
  const sources = (record.sources ?? []).map((source) => ({
    id: source.id,
    title: source.title,
    url: source.url,
    source_type: "official-documentation",
    accessed_at: record.researched_at || today(),
  }));
  if (sources.length === 0) {
    throw new Error(`${slug}: record has no sources`);
  }
  const fallbackIds = [sources[0].id];
  const dfs = record.documented_first_success || {};
  const pathSteps = (record.primary_path || []).filter((step) => step.required !== false);
  const requiredPath = pathSteps.map((step, index) => {
    const ids = sourceIds(step, fallbackIds);
    return {
      step_number: index + 1,
      kind: mapKind(step),
      interface: mapInterface(step.interface),
      action: step.action,
      required_fields: [
        {
          label: "Documented required input",
          field_type: "other" as const,
          evidence_state: "unverified" as const,
          source_ids: ids,
          notes: "Mapped from machine-drafted primary_path; field inventory not independently audited.",
        },
      ],
      observable_result: step.success_signal || "Documented step completion signal.",
      evidence_state: "unverified" as const,
      source_ids: ids,
    };
  });

  if (requiredPath.length === 0) {
    requiredPath.push({
      step_number: 1,
      kind: "account",
      interface: "web-ui",
      action: "Create or sign in to a developer account and reach the documented first-success surface.",
      required_fields: [
        {
          label: "Account credentials",
          field_type: "other" as const,
          evidence_state: "unverified" as const,
          source_ids: fallbackIds,
          notes: "Machine draft did not emit a primary_path; placeholder until human audit.",
        },
      ],
      observable_result: dfs.observable_completion_signal || "Documented first-success signal.",
      evidence_state: "unverified" as const,
      source_ids: fallbackIds,
    });
  }

  const surfaceName =
    typeof record.surface === "object" && record.surface?.name
      ? record.surface.name
      : "Machine-drafted official-docs route";

  return {
    schema_version: "1.0",
    platform: { name, slug, category },
    audit_status: "needs-human-judgment",
    audited_at: today(),
    source_record_sha256: sha256(recordText),
    starting_state: {
      boundary: "account creation",
      assumptions: [
        "The developer has a supported browser and can receive email when the selected route requires it.",
        "No platform account, tenant, credentials, or product resources exist yet.",
      ],
    },
    developer_goal:
      dfs.normalized_outcome ||
      "Reach the documented first developer success for this platform.",
    first_success: {
      outcome: dfs.normalized_outcome || dfs.official_milestone || "Documented first success",
      observable_signal: dfs.observable_completion_signal || "Documented first-success signal.",
      source_ids: fallbackIds,
    },
    route_selection: {
      surface: surfaceName,
      rule: "Measure documented developer onboarding: account creation through first success. Prefer the vendor quickstart or hosted API/console path when one exists. Include documented gates (email verify, payment, credits, domain, approval). Prefer HTTP/cURL when documented; do not prefer local/no-account toolkit shortcuts over hosted onboarding.",
      selected: null,
      candidates: [
        {
          name: surfaceName,
          status: "unresolved",
          reason: "Machine-drafted primary path only; not confirmed as the lexicographic shortest required route.",
        },
      ],
    },
    required_path: requiredPath,
    prerequisites: (record.prerequisites ?? []).map((p) => ({
      description: p.requirement,
      source_ids: fallbackIds,
    })),
    external_gates: (record.friction_gates ?? [])
      .filter((g) => (g.type || "").toLowerCase().includes("external") || (g.type || "") === "approval")
      .map((g) => ({ description: g.description || g.requirement || "", source_ids: fallbackIds })),
    unavoidable_waits: (record.friction_gates ?? [])
      .filter((g) => (g.type || "").toLowerCase().includes("wait"))
      .map((g) => ({ description: g.description || g.requirement || "", source_ids: fallbackIds })),
    platform_outcomes: [],
    excluded: [],
    sources,
    uncertainties: [
      ...(record.uncertainties ?? []).map((item) => ({
        question: item.question,
        impact: "May change required actions or first-success definition.",
        evidence_needed: "Independent shortest-path review of current official docs.",
      })),
      {
        question: `Has the machine-drafted ${name} route been independently shortest-path audited?`,
        impact: "Action counts and peer comparison must stay withheld until a human audit passes.",
        evidence_needed:
          "Complete a shortest-path audit against current official docs and mark verified only when evidence supports it.",
      },
    ],
    counts: null,
  };
}
