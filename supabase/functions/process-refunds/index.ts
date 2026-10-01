// İade kuyruğu: teslimatı gerçekleşmeyen siparişlerin tahsil edilmiş teslimat ücreti iyzico üzerinden iade edilir.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { errorResponse, json } from "../_shared/http.ts";
import { requireCronOrAdmin } from "../_shared/cron.ts";
import { adminClient, clientIp, logEvent } from "../_shared/supabase.ts";
import { refundPayment } from "../_shared/iyzico.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    await requireCronOrAdmin(req);
    const cfg = {
      apiKey: requireEnv("IYZICO_API_KEY"),
      secretKey: requireEnv("IYZICO_SECRET_KEY"),
      baseUrl: requireEnv("IYZICO_BASE_URL"),
    };
    // iyzico istek IP alanı: sunucunun çıkış IP'si (IYZICO_REQUEST_IP) yoksa isteği yapanın IP'si.
    const requestIp = optionalEnv("IYZICO_REQUEST_IP") ?? clientIp(req);
    const db = adminClient();
    const { data: pending } = await db.from("payments")
      .select("id, amount, conversation_id, provider_payment_id")
      .eq("status", "refund_pending").not("provider_payment_id", "is", null)
      .order("refund_requested_at", { ascending: true }).limit(20);
    let refunded = 0;
    let failed = 0;
    for (const p of pending ?? []) {
      try {
        const r = await refundPayment(cfg, p.conversation_id, p.provider_payment_id!, Number(p.amount), requestIp);
        if (r.status === "success") {
          await db.rpc("mark_payment_refunded", {
            p_payment_id: p.id,
            p_provider_refund_id: String(r.paymentId ?? p.provider_payment_id),
            p_provider_response: { status: r.status },
          });
          refunded++;
        } else {
          failed++;
          await logEvent("payment_failure", "error", "iyzico iade başarısız", { payment_id: p.id, errorCode: r.errorCode });
        }
      } catch (_e) {
        failed++;
        await logEvent("payment_failure", "error", "iyzico iade isteği hata verdi", { payment_id: p.id });
      }
    }
    return json(req, { processed: pending?.length ?? 0, refunded, failed });
  } catch (err) {
    return errorResponse(req, err);
  }
});
