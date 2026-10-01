// Bülten aboneliği (açık onayla). Aynı adres tekrar abone olursa durum güncellenir.
import { handlePreflight } from "../_shared/cors.ts";
import { AppError, errorResponse, json, readJson } from "../_shared/http.ts";
import { adminClient, clientIp, rateLimit } from "../_shared/supabase.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError("KPD_METHOD_NOT_ALLOWED", 405);
    await rateLimit(`newsletter:${clientIp(req)}`, 5, 3600);
    const body = await readJson<{ email?: unknown; consent?: unknown }>(req);
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) {
      throw new AppError("KPD_INVALID_INPUT", 400, { field: "email" });
    }
    if (body.consent !== true) throw new AppError("KPD_CONSENT_REQUIRED", 400);
    const db = adminClient();
    await db.from("email_subscriptions").upsert(
      { email, topic: "newsletter", status: "subscribed", subscribed_at: new Date().toISOString(), unsubscribed_at: null },
      { onConflict: "email,topic" },
    );
    await db.from("email_suppressions").delete().eq("email", email).eq("reason", "unsubscribe");
    return json(req, { ok: true });
  } catch (err) {
    return errorResponse(req, err);
  }
});
