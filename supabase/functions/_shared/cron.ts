import { optionalEnv } from "./env.ts";
import { timingSafeEqual } from "./crypto.ts";
import { AppError } from "./http.ts";
import { hasRole, requireUser } from "./supabase.ts";

/** Zamanlanmış çağrı (x-cron-secret) veya admin kullanıcı. */
export async function requireCronOrAdmin(req: Request): Promise<"cron" | "admin"> {
  const secret = optionalEnv("CRON_SECRET");
  const provided = req.headers.get("x-cron-secret");
  if (secret && provided && timingSafeEqual(secret, provided)) return "cron";
  const user = await requireUser(req);
  if (!(await hasRole(user.id, "admin"))) throw new AppError("KPD_FORBIDDEN", 403);
  return "admin";
}
