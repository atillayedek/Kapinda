// Kurye QR okuttuğunda: HMAC ve süre doğrulanır, ardından veritabanında atomik tüketim + delivered geçişi yapılır.
import { handlePreflight } from "../_shared/cors.ts";
import { requireEnv } from "../_shared/env.ts";
import { AppError, errorResponse, fromDbError, json, readJson } from "../_shared/http.ts";
import { adminClient, hasRole, logEvent, rateLimit, requireUser } from "../_shared/supabase.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { verifyQr } from "../_shared/qr.ts";

interface Body {
  qr?: unknown;
  lat?: unknown;
  lng?: unknown;
  device?: { model?: unknown; os?: unknown; app_version?: unknown; device_id?: unknown };
}

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : null);
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : null);

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError("KPD_METHOD_NOT_ALLOWED", 405);
    const user = await requireUser(req);
    if (!(await hasRole(user.id, "courier"))) throw new AppError("KPD_FORBIDDEN", 403);
    await rateLimit(`qr_verify:${user.id}`, 20, 60);
    const body = await readJson<Body>(req);
    const lat = num(body.lat, -90, 90);
    const lng = num(body.lng, -180, 180);
    if (typeof body.qr !== "string") throw new AppError("KPD_QR_INVALID", 400);

    const verified = await verifyQr(requireEnv("QR_HMAC_SECRET"), body.qr);
    if (!verified.ok) {
      await logEvent("qr_validation_failure", "warning", verified.code, { courier_user_id: user.id });
      throw new AppError(verified.code, 400);
    }
    const device = {
      model: str(body.device?.model, 80),
      os: str(body.device?.os, 40),
      app_version: str(body.device?.app_version, 20),
      device_id: str(body.device?.device_id, 80),
    };
    const { data, error } = await adminClient().rpc("consume_delivery_qr", {
      p_token_id: verified.claims.tokenId,
      p_order_id: verified.claims.orderId,
      p_nonce_hash: await sha256Hex(verified.claims.nonce),
      p_courier_user_id: user.id,
      p_lat: lat,
      p_lng: lng,
      p_device: device,
    });
    if (error) {
      await logEvent("qr_validation_failure", "warning", error.message ?? "db_error", { courier_user_id: user.id });
      throw fromDbError(error);
    }
    const result = data as { result: string; code?: string; order_id?: string; order_number?: string };
    if (result.result !== "delivered") throw new AppError(result.code ?? "KPD_QR_INVALID", 400);
    return json(req, { result: "delivered", order_id: result.order_id, order_number: result.order_number });
  } catch (err) {
    return errorResponse(req, err);
  }
});
