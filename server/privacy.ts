import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { EncryptedEnvelope } from "./domain.js";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

export function stableJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function hashInput(value: unknown, secret: Buffer | string): string {
  const inputHashKey = createHmac("sha256", secret).update("first-mile-input-hash-v1").digest();
  return createHmac("sha256", inputHashKey).update(stableJson(value)).digest("hex");
}

export function createSessionCredential(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: sha256(token) };
}

export function tokenMatches(token: string, expectedHash: string): boolean {
  const actual = Buffer.from(sha256(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export class EnvelopeCipher {
  private readonly key: Buffer;
  private readonly keyVersion: string;

  constructor(key: Buffer, keyVersion = "v1") {
    if (key.byteLength !== 32) throw new Error("SESSION_ENVELOPE_KEY must decode to exactly 32 bytes");
    this.key = key;
    this.keyVersion = keyVersion;
  }

  encrypt(value: unknown): EncryptedEnvelope {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(stableJson(value), "utf8"), cipher.final()]);
    return {
      version: 1,
      keyVersion: this.keyVersion,
      iv: iv.toString("base64"),
      tag: cipher.getAuthTag().toString("base64"),
      ciphertext: ciphertext.toString("base64"),
    };
  }

  decrypt<T>(envelope: EncryptedEnvelope): T {
    if (envelope.version !== 1 || envelope.keyVersion !== this.keyVersion) {
      throw new Error("Unsupported encrypted envelope version");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(envelope.iv, "base64"));
    decipher.setAuthTag(Buffer.from(envelope.tag, "base64"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(envelope.ciphertext, "base64")),
      decipher.final(),
    ]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  }
}

export interface SafeLogFields {
  event: string;
  requestId?: string;
  sessionId?: string;
  turnId?: string;
  revision?: number;
  objectiveId?: string;
  phase?: string;
  status?: string;
  latencyMs?: number;
  model?: string;
  errorCode?: string;
  [key: string]: string | number | boolean | undefined;
}

export interface SafeLogger {
  info(fields: SafeLogFields): void;
  warn(fields: SafeLogFields): void;
  error(fields: SafeLogFields): void;
}

function write(level: "info" | "warn" | "error", fields: SafeLogFields): void {
  const line = JSON.stringify({ level, at: new Date().toISOString(), ...fields });
  if (level === "error") process.stderr.write(`${line}\n`);
  else process.stdout.write(`${line}\n`);
}

export const safeLogger: SafeLogger = {
  info: (fields) => write("info", fields),
  warn: (fields) => write("warn", fields),
  error: (fields) => write("error", fields),
};
