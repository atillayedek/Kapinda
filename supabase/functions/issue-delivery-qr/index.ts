// Müşteri için teslimat QR'ı üretir. Ham nonce yalnız QR içeriğindedir; veritabanına sha256(nonce) yazılır.
import { handlePreflight } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";
import { AppError, errorResponse, fromDbError, json, readJson, requireUuid } from "../_shared/http.ts";
import { adminClient, rateLimit, requireUser } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { newNonce, signQr } from "../_shared/qr.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError("KPD_METHOD_NOT_ALLOWED", 405);
    const user = await requireUser(req);
    await rateLimit(`qr_issue_user:${user.id}`, 30, 300);
    const { order_id } = await readJson<{ order_id?: unknown }>(req);
    const orderId = requireUuid(order_id, "order_id");
    const db = adminClient();
    const { data: ttlSetting } = await db.from("settings").select("value").eq("key", "kurye.qr_ttl_minutes").maybeSingle();
    const ttl = Math.min(120, Math.max(5, Number(ttlSetting?.value ?? 30)));
    const nonce = newNonce();
    const { data: token, error } = await db.rpc("issue_delivery_qr", {
      p_order_id: orderId,
      p_customer_id: user.id,
      p_nonce_hash: await sha256Hex(nonce),
      p_ttl_minutes: ttl,
    });
    if (error) throw fromDbError(error);
    const exp = Math.floor(new Date(token.expires_at).getTime() / 1000);
    const payload = await signQr(requireEnv("QR_HMAC_SECRET"), { tokenId: token.id, orderId, exp, nonce });
    return json(req, { qr: payload, expires_at: token.expires_at }, 200, { "Cache-Control": "no-store" });
  } catch (err) {
    return errorResponse(req, err);
  }
});
