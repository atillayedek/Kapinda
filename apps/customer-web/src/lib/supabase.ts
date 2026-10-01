import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isConfigured } from "./env";

// Yapılandırma yoksa istemci oluşturulmaz; uygulama yapılandırma hatası ekranı gösterir.
export const supabase: SupabaseClient = createClient(
  env.supabaseUrl ?? "https://yapilandirilmamis.invalid",
  env.supabaseAnonKey ?? "yapilandirilmamis",
  {
    auth: {
      persistSession: typeof window !== "undefined",
      autoRefreshToken: typeof window !== "undefined" && isConfigured,
      detectSessionInUrl: typeof window !== "undefined",
      flowType: "pkce",
    },
    realtime: { params: { eventsPerSecond: 5 } },
  },
);

export function storagePublicUrl(bucket: "product-images" | "vendor-assets", path: string | null | undefined): string | null {
  if (!path) return null;
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/** Edge Function çağrısı; hata kodunu (KPD_*) korur. */
export async function invokeFunction<T>(name: string, body: unknown): Promise<T> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body: body as Record<string, unknown> });
  if (error) {
    let code = "KPD_INTERNAL";
    // FunctionsHttpError.context bir Response'tur
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const parsed = (await ctx.json()) as { error?: { code?: string } };
        code = parsed.error?.code ?? code;
      } catch {
        /* yanıt gövdesi JSON değil */
      }
    } else if (error.name === "FunctionsFetchError") {
      code = "KPD_NETWORK";
    }
    throw new AppError(code);
  }
  return data as T;
}

export class AppError extends Error {
  constructor(public readonly code: string, public readonly hint?: string) {
    super(code);
  }
}

/** Supabase/PostgREST hatasını AppError'a çevirir. */
export function toAppError(error: { message?: string; code?: string; hint?: string | null } | null | undefined): AppError {
  const msg = error?.message ?? "";
  if (/^KPD_[A-Z_]+$/.test(msg)) return new AppError(msg, error?.hint ?? undefined);
  if (error?.code === "23505") return new AppError("KPD_DUPLICATE");
  if (error?.code === "42501" || error?.code === "PGRST301") return new AppError("KPD_FORBIDDEN");
  if (error?.code === "23514" || error?.code === "22023" || error?.code === "22P02") return new AppError("KPD_INVALID_INPUT");
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return new AppError("KPD_NETWORK");
  return new AppError("KPD_INTERNAL");
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw toAppError(error);
  return data as T;
}
