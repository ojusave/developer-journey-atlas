import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";

const booleanString = z.enum(["true", "false"]).transform((value) => value === "true");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(10_000),
  DATABASE_URL: z.string().min(1).optional(),
  ALLOW_IN_MEMORY_STORE: booleanString.default(false),
  SESSION_ENVELOPE_KEY: z.string().min(32).optional(),
  SESSION_TTL_HOURS: z.coerce.number().int().min(1).max(168).default(24),
  TURN_ENVELOPE_TTL_SECONDS: z.coerce.number().int().min(60).max(86_400).default(3_600),
  REASONING_MODE: z.enum(["deterministic", "mastra"]).default("deterministic"),
  DIAGNOSTIC_MODEL: z.string().min(1).optional(),
  OPENROUTER_API_KEY: z.string().min(1).optional(),
  EXECUTION_MODE: z.enum(["direct", "render_workflow"]).default("direct"),
  RENDER_API_KEY: z.string().min(1).optional(),
  RENDER_WORKFLOW_TASK_SLUG: z.string().min(1).optional(),
  WORKFLOW_DISPATCH_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(10_000),
  INTERNAL_WORKFLOW_SECRET: z.string().min(32).optional(),
  APP_ORIGIN: z.string().url().optional(),
  TRUST_PROXY: booleanString.default(false),
  RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().min(10).max(3_600).default(60),
  SESSION_CREATE_LIMIT: z.coerce.number().int().min(1).max(10_000).default(300),
  SESSION_TURN_LIMIT: z.coerce.number().int().min(1).max(1_000).default(30),
  IP_TURN_LIMIT: z.coerce.number().int().min(1).max(100_000).default(1_200),
  ARIZE_TELEMETRY_ENABLED: booleanString.default(false),
  ARIZE_API_KEY: z.string().min(1).optional(),
  ARIZE_SPACE_ID: z.string().min(1).optional(),
  ARIZE_PROJECT_NAME: z.string().min(1).optional(),
  ARIZE_OTLP_ENDPOINT: z.string().url().default("https://otlp.arize.com/v1/traces"),
});

export interface RuntimeConfig {
  nodeEnv: "development" | "test" | "production";
  port: number;
  databaseUrl?: string;
  allowInMemoryStore: boolean;
  envelopeKey: Buffer;
  sessionTtlHours: number;
  turnEnvelopeTtlSeconds: number;
  reasoningMode: "deterministic" | "mastra";
  diagnosticModel?: string;
  executionMode: "direct" | "render_workflow";
  renderApiKey?: string;
  renderWorkflowTaskSlug?: string;
  workflowDispatchTimeoutMs: number;
  internalWorkflowSecret?: string;
  appOrigin?: string;
  trustProxy: boolean;
  rateLimitWindowSeconds: number;
  sessionCreateLimit: number;
  sessionTurnLimit: number;
  ipTurnLimit: number;
  arizeTelemetryEnabled: boolean;
  arizeApiKey?: string;
  arizeSpaceId?: string;
  arizeProjectName?: string;
  arizeOtlpEndpoint?: string;
}

export function loadConfig(environment: NodeJS.ProcessEnv = process.env): RuntimeConfig {
  const env = envSchema.parse(environment);
  if (!env.DATABASE_URL && !(env.ALLOW_IN_MEMORY_STORE && env.NODE_ENV !== "production")) {
    throw new Error("DATABASE_URL is required unless local in-memory storage is explicitly enabled");
  }
  if (env.REASONING_MODE === "mastra" && (!env.OPENROUTER_API_KEY || !env.DIAGNOSTIC_MODEL)) {
    throw new Error("Mastra reasoning requires OPENROUTER_API_KEY and a pinned DIAGNOSTIC_MODEL");
  }
  if (env.DIAGNOSTIC_MODEL && !/^openrouter\/[^/]+\/[^/]+$/.test(env.DIAGNOSTIC_MODEL)) {
    throw new Error("DIAGNOSTIC_MODEL must pin one concrete OpenRouter provider and model");
  }
  if (env.EXECUTION_MODE === "render_workflow" && (!env.RENDER_API_KEY || !env.RENDER_WORKFLOW_TASK_SLUG || !env.INTERNAL_WORKFLOW_SECRET)) {
    throw new Error("Render Workflow execution requires RENDER_API_KEY, RENDER_WORKFLOW_TASK_SLUG, and INTERNAL_WORKFLOW_SECRET");
  }
  if (env.ARIZE_TELEMETRY_ENABLED && (!env.ARIZE_API_KEY || !env.ARIZE_SPACE_ID || !env.ARIZE_PROJECT_NAME)) {
    throw new Error("Arize telemetry requires ARIZE_API_KEY, ARIZE_SPACE_ID, and ARIZE_PROJECT_NAME");
  }

  let envelopeKey: Buffer;
  if (env.SESSION_ENVELOPE_KEY) {
    envelopeKey = createHash("sha256").update(env.SESSION_ENVELOPE_KEY, "utf8").digest();
  } else if (env.NODE_ENV === "production" || env.DATABASE_URL) {
    throw new Error("SESSION_ENVELOPE_KEY is required for persistent or production storage");
  } else {
    envelopeKey = randomBytes(32);
  }
  return {
    nodeEnv: env.NODE_ENV,
    port: env.PORT,
    databaseUrl: env.DATABASE_URL,
    allowInMemoryStore: env.ALLOW_IN_MEMORY_STORE,
    envelopeKey,
    sessionTtlHours: env.SESSION_TTL_HOURS,
    turnEnvelopeTtlSeconds: env.TURN_ENVELOPE_TTL_SECONDS,
    reasoningMode: env.REASONING_MODE,
    diagnosticModel: env.DIAGNOSTIC_MODEL,
    executionMode: env.EXECUTION_MODE,
    renderApiKey: env.RENDER_API_KEY,
    renderWorkflowTaskSlug: env.RENDER_WORKFLOW_TASK_SLUG,
    workflowDispatchTimeoutMs: env.WORKFLOW_DISPATCH_TIMEOUT_MS,
    internalWorkflowSecret: env.INTERNAL_WORKFLOW_SECRET,
    appOrigin: env.APP_ORIGIN,
    trustProxy: env.TRUST_PROXY,
    rateLimitWindowSeconds: env.RATE_LIMIT_WINDOW_SECONDS,
    sessionCreateLimit: env.SESSION_CREATE_LIMIT,
    sessionTurnLimit: env.SESSION_TURN_LIMIT,
    ipTurnLimit: env.IP_TURN_LIMIT,
    arizeTelemetryEnabled: env.ARIZE_TELEMETRY_ENABLED,
    arizeApiKey: env.ARIZE_API_KEY,
    arizeSpaceId: env.ARIZE_SPACE_ID,
    arizeProjectName: env.ARIZE_PROJECT_NAME,
    arizeOtlpEndpoint: env.ARIZE_OTLP_ENDPOINT,
  };
}
