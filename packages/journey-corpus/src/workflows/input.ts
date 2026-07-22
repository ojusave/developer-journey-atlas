import { slugify } from "../core/researchPipeline.js";
import type { ResearchTaskInput } from "./contract.js";

const PLATFORM_PATTERN = /^[\p{L}\p{N} .&+'()_/:\-]+$/u;
const MAX_PLATFORM_LENGTH = 100;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const INPUT_KEYS = ["platform", "slug"] as const;

export class InvalidResearchInput extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidResearchInput";
  }
}

/** Validate a raw user platform string. Returns the trimmed value or throws. */
export function normalizePlatform(raw: unknown): string {
  const platform = typeof raw === "string" ? raw.trim() : "";
  if (!platform) throw new InvalidResearchInput("Provide a platform name.");
  if (platform.length > MAX_PLATFORM_LENGTH || !PLATFORM_PATTERN.test(platform)) {
    throw new InvalidResearchInput("Use a platform name of 100 characters or fewer.");
  }
  return platform;
}

/** Build a validated task input from a raw user platform string. */
export function buildResearchInput(raw: unknown): ResearchTaskInput {
  const platform = normalizePlatform(raw);
  const slug = slugify(platform);
  if (!slug) throw new InvalidResearchInput("That platform name has no usable characters.");
  return { platform, slug };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Strictly parse task input received at the Workflow boundary. Rejects unexpected
 * fields, invalid platform names, and malformed slugs so a task never runs on
 * unvalidated or oversized input.
 */
export function parseResearchTaskInput(value: unknown): ResearchTaskInput {
  if (!isRecord(value)) throw new InvalidResearchInput("Research input must be an object.");

  const keys = Object.keys(value).sort();
  if (keys.length !== INPUT_KEYS.length || keys.some((key, index) => key !== INPUT_KEYS[index])) {
    throw new InvalidResearchInput("Research input contains unexpected fields.");
  }

  const platform = normalizePlatform(value.platform);
  if (typeof value.slug !== "string" || !SLUG_PATTERN.test(value.slug)) {
    throw new InvalidResearchInput("slug must be a normalized platform slug.");
  }
  return { platform, slug: value.slug };
}
