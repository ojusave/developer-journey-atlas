import { readFileSync } from "node:fs";
// The record schema is JSON Schema draft 2020-12, so use ajv's 2020 build.
import AjvModule from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

// ajv/ajv-formats ship CommonJS; normalize the default export across interop.
const Ajv = ((AjvModule as unknown as { default?: unknown }).default ?? AjvModule) as new (
  opts?: Record<string, unknown>,
) => {
  compile: (schema: unknown) => ((data: unknown) => boolean) & {
    errors?: Array<{ instancePath?: string; message?: string }> | null;
  };
};
const addFormats = ((addFormatsModule as unknown as { default?: unknown }).default ??
  addFormatsModule) as (ajv: unknown) => void;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export type RecordValidator = (record: unknown) => ValidationResult;

/**
 * Compile the canonical record.schema.json into a validator. Errors are
 * flattened to short strings so they can be fed back to the LLM for a repair
 * pass and shown in logs without leaking internals.
 */
export function createRecordValidator(schemaPath: string): RecordValidator {
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  return (record: unknown): ValidationResult => {
    const valid = validate(record) === true;
    const errors = (validate.errors ?? []).map((e) =>
      `${e.instancePath || "(root)"} ${e.message ?? "invalid"}`.trim(),
    );
    return { valid, errors };
  };
}
