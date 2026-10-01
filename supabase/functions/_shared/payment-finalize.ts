import { adminClient, logEvent } from "./supabase.ts";
import { isSuccessfulRetrieve, type IyzicoConfig, retrieveCheckoutForm, sanitizeRetrieve, verifyRetrieveSignature } from "./iyzico.ts";

/**
 * Ödemeyi iyzico'dan sunucu-sunucu sorgulayarak sonuçlandırır (idempotent).
 * Callback veya webhook gövdesine güvenilmez; tek otorite iyzico retrieve yanıtı + imzası + tutar eşleşmesidir.
 */
export async function finalizePayment(cfg: IyzicoConfig, paymentId: string): Promise<{ orderId: string | null; result: string }> {
  const db = adminClient();
  const { data: pay } = await db.from("payments")
    .select("id, order_id, amount, status, conversation_id, provider_token, orders(order_number)")
    .eq("id", paymentId).maybeSingle();
  if (!pay || !pay.provider_token) return { orderId: pay?.order_id ?? null, result: "not_found" };
  if (["succeeded", "refund_pending", "refunded"].includes(pay.status)) return { orderId: pay.order_id, result: "already_processed" };

  const r = await retrieveCheckoutForm(cfg, pay.conversation_id, pay.provider_token);
  const sanitized = sanitizeRetrieve(r);
  // deno-lint-ignore no-explicit-any
  const orderNumber = (pay as any).orders?.order_number as string;
  const signatureOk = await verifyRetrieveSignature(cfg, r);
  if (!signatureOk) {
    await logEvent("payment_failure", "critical", "iyzico yanıt imzası doğrulanamadı", { payment_id: pay.id });
    return { orderId: pay.order_id, result: "signature_invalid" };
  }
  if (isSuccessfulRetrieve(r, { conversationId: pay.conversation_id, amount: Number(pay.amount), basketId: orderNumber })) {
    const { data, error } = await db.rpc("confirm_delivery_payment", {
      p_payment_id: pay.id,
      p_provider_payment_id: r.paymentId,
      p_paid_amount: r.paidPrice,
      p_provider_response: sanitized,
    });
    if (error) {
      await logEvent("payment_failure", "critical", "Ödeme onayı veritabanına yazılamadı", { payment_id: pay.id });
      return { orderId: pay.order_id, result: "db_error" };
    }
    return { orderId: pay.order_id, result: (data as { result: string }).result };
  }
  if (r.paymentStatus === "INIT_THREEDS" || r.paymentStatus === "PENDING") {
    return { orderId: pay.order_id, result: "pending" };
  }
  await db.rpc("fail_delivery_payment", {
    p_payment_id: pay.id,
    p_reason: r.errorCode ?? r.paymentStatus ?? "failed",
    p_provider_response: sanitized,
  });
  return { orderId: pay.order_id, result: "failed" };
}
