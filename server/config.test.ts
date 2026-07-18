// @vitest-environment node
import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

describe("runtime configuration gates", () => {
  it("rejects production without persistent storage", () => {
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow("DATABASE_URL is required");
  });

  it("requires a pinned model and provider key for Mastra reasoning", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      ALLOW_IN_MEMORY_STORE: "true",
      REASONING_MODE: "mastra",
      OPENROUTER_API_KEY: "test-only-key",
      DIAGNOSTIC_MODEL: "openrouter/auto",
    })).toThrow("must pin one concrete OpenRouter provider and model");
  });

  it("rejects a model from a provider other than OpenRouter", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      ALLOW_IN_MEMORY_STORE: "true",
      REASONING_MODE: "mastra",
      OPENROUTER_API_KEY: "test-only-key",
      DIAGNOSTIC_MODEL: "openai/gpt-5",
    })).toThrow("must pin one concrete OpenRouter provider and model");
  });

  it("derives a valid encryption key from a generated Render secret", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      ALLOW_IN_MEMORY_STORE: "true",
      SESSION_ENVELOPE_KEY: "a-render-generated-secret-that-is-long-enough",
    });
    expect(config.envelopeKey).toHaveLength(32);
    expect(config.workflowDispatchTimeoutMs).toBe(10_000);
  });

  it("rejects partially configured Arize telemetry", () => {
    expect(() => loadConfig({
      NODE_ENV: "test",
      ALLOW_IN_MEMORY_STORE: "true",
      ARIZE_TELEMETRY_ENABLED: "true",
      ARIZE_API_KEY: "test-only-key",
    })).toThrow("Arize telemetry requires");
  });
});
