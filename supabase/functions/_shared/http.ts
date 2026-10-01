import { corsHeaders } from "./cors.ts";

export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status = 400,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
  }
}

export function json(req: Request, body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders(req), ...extra },
  });
}

/** PostgREST/RPC hatasını uygulama koduna çevirir. İç ayrıntılar istemciye gönderilmez. */
export function fromDbError(error: { message?: string; code?: string; hint?: string } | null): AppError {
  const message = error?.message ?? "";
  if (/^KPD_[A-Z_]+$/.test(message)) {
    const status = error?.code === "42501" ? 403 : error?.code === "P0002" ? 404 : 400;
    return new AppError(message, status, error?.hint ? { hint: error.hint } : undefined);
  }
  return new AppError("KPD_INTERNAL", 500);
}

export function errorResponse(req: Request, err: unknown): Response {
  if (err instanceof AppError) {
    return json(req, { error: { code: err.code, ...(err.details ?? {}) } }, err.status);
  }
  console.error("unhandled", err instanceof Error ? err.message : String(err));
  return json(req, { error: { code: "KPD_INTERNAL" } }, 500);
}

export async function readJson<T>(req: Request, maxBytes = 16_384): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new AppError("KPD_PAYLOAD_TOO_LARGE", 413);
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new AppError("KPD_INVALID_INPUT", 400);
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) throw new AppError("KPD_INVALID_INPUT", 400, { field });
  return value.toLowerCase();
}
