import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2.45.4";
import { requireEnv } from "./env.ts";
import { AppError } from "./http.ts";

let admin: SupabaseClient | null = null;

/** service_role istemcisi — yalnız Edge Function içinde, asla istemci paketinde değil. */
export function adminClient(): SupabaseClient {
  if (!admin) {
    admin = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return admin;
}

export async function requireUser(req: Request): Promise<User> {
  const auth = req.headers.get("Authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) throw new AppError("KPD_AUTH_REQUIRED", 401);
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new AppError("KPD_AUTH_REQUIRED", 401);
  return data.user;
}

export async function hasRole(userId: string, role: "admin" | "courier" | "vendor" | "customer"): Promise<boolean> {
  const { data, error } = await adminClient().rpc("has_role", { _user_id: userId, _role: role });
  if (error) throw new AppError("KPD_INTERNAL", 500);
  return data === true;
}

export async function rateLimit(key: string, max: number, windowSeconds: number): Promise<void> {
  const { data, error } = await adminClient().rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw new AppError("KPD_INTERNAL", 500);
  if (data !== true) throw new AppError("KPD_RATE_LIMITED", 429);
}

export async function logEvent(
  type: string,
  severity: "info" | "warning" | "error" | "critical",
  message: string,
  context: Record<string, unknown> = {},
): Promise<void> {
  // Gözlemlenebilirlik kaydı ana akışı asla bozmaz.
  try {
    await adminClient().rpc("_log_event", {
      p_source: "edge_function",
      p_type: type,
      p_severity: severity,
      p_message: message.slice(0, 1000),
      p_context: context,
    });
  } catch (_) {
    console.error("log_event_failed", type);
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}
