import type { Response } from "express";

/** Consistent response envelope shared by every endpoint. */
export interface Envelope<T> {
  data: T | null;
  error: { code: string; message: string } | null;
  meta: Record<string, unknown>;
}

export function sendData<T>(res: Response, data: T, meta: Record<string, unknown> = {}): void {
  const body: Envelope<T> = { data, error: null, meta };
  res.json(body);
}

export function sendError(
  res: Response,
  status: number,
  code: string,
  message: string,
  meta: Record<string, unknown> = {},
): void {
  const body: Envelope<never> = { data: null, error: { code, message }, meta };
  res.status(status).json(body);
}
