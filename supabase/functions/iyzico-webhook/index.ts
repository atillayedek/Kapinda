// iyzico webhook: imza (X-IYZ-SIGNATURE-V3) doğrulanır, olay idempotent kaydedilir, ödeme sunucu-sunucu sorgulanarak sonuçlandırılır.
import { requireEnv } from "../_shared/env.ts";
import { sha256Hex } from "../_shared/crypto.ts";
import { adminClient, logEvent } from "../_shared/supabase.ts";
import { verifyWebhookSignature, type WebhookPayload } from "../_shared/iyzico.ts";
import { finalizePayment } from "../_shared/payment-finalize.ts";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response(null, { status: 405 });
  const raw = await req.text();
  if (raw.length > 16_384) return new Response(null, { status: 413 });
  let payload: WebhookPayload;
  try {
    payload = JSON.parse(raw);
  } catch {
    return new Response(null, { status: 400 });
  }
  const cfg = { apiKey: requireEnv("IYZICO_API_KEY"), secretKey: requireEnv("IYZICO_SECRET_KEY"), baseUrl: requireEnv("IYZICO_BASE_URL") };
  const signatureValid = await verifyWebhookSignature(cfg, payload, req.headers.get("x-iyz-signature-v3"));
  const db = adminClient();
  const { data: pay } = payload.paymentConversationId
    ? await db.from("payments").select("id").eq("conversation_id", payload.paymentConversationId).maybeSingle()
    : { data: null };

  const eventKey = await sha256Hex(
    `${payload.iyziEventType}|${payload.iyziPaymentId}|${payload.paymentConversationId}|${payload.status}|${payload.iyziEventTime}`,
  );
  const { error: insErr } = await db.from("payment_events").insert({
    payment_id: pay?.id ?? null,
    provider_event_key: eventKey,
    event_type: String(payload.iyziEventType ?? "unknown").slice(0, 60),
    signature_valid: signatureValid,
    payload: { ...payload, merchantId: undefined },
  });
  if (insErr && insErr.code === "23505") return new Response(null, { status: 200 }); // tekrar gelen olay
  if (!signatureValid) {
    await logEvent("payment_failure", "critical", "iyzico webhook imzası geçersiz", { conversation_id: payload.paymentConversationId });
    return new Response(null, { status: 401 });
  }
  if (!pay) return new Response(null, { status: 200 });
  const { result } = await finalizePayment(cfg, pay.id);
  return new Response(JSON.stringify({ result }), { status: 200, headers: { "Content-Type": "application/json" } });
});
