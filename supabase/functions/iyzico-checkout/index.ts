// Teslimat ücreti ödemesini başlatır (iyzico Checkout Form). Tutar sipariş kaydından alınır.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { AppError, errorResponse, fromDbError, json, readJson, requireUuid } from "../_shared/http.ts";
import { adminClient, clientIp, logEvent, rateLimit, requireUser } from "../_shared/supabase.ts";
import { initializeCheckoutForm, type IyzicoConfig } from "../_shared/iyzico.ts";

function config(): IyzicoConfig {
  return { apiKey: requireEnv("IYZICO_API_KEY"), secretKey: requireEnv("IYZICO_SECRET_KEY"), baseUrl: requireEnv("IYZICO_BASE_URL") };
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError("KPD_METHOD_NOT_ALLOWED", 405);
    const user = await requireUser(req);
    await rateLimit(`pay_init:${user.id}`, 10, 300);
    const body = await readJson<{ order_id?: unknown }>(req);
    const orderId = requireUuid(body.order_id, "order_id");
    const db = adminClient();

    const { data: payment, error } = await db.rpc("begin_delivery_payment", { p_order_id: orderId, p_customer_id: user.id });
    if (error) throw fromDbError(error);

    const { data: order } = await db.from("orders")
      .select("order_number, customer_name, customer_phone, delivery_address, delivery_fee_payable")
      .eq("id", orderId).single();
    const { data: profile } = await db.from("profiles").select("full_name, email").eq("id", user.id).single();
    if (!order || !profile?.email) throw new AppError("KPD_INTERNAL", 500);
    if (Number(order.delivery_fee_payable) !== Number(payment.amount)) throw new AppError("KPD_PAYMENT_NOT_ALLOWED", 409);

    const nameParts = (profile.full_name || order.customer_name || "").trim().split(/\s+/);
    const surname = nameParts.length > 1 ? nameParts.pop()! : nameParts[0] ?? "";
    const name = nameParts.join(" ") || surname;
    // iyzico identityNumber alanı zorunludur. TCKN toplanmadığı için iyzico'nun belgelediği değer IYZICO_BUYER_IDENTITY_NUMBER
    // secret'ı ile verilir; tanımlı değilse ödeme başlatılmaz.
    const identityNumber = requireEnv("IYZICO_BUYER_IDENTITY_NUMBER");
    const addr = order.delivery_address as Record<string, string>;
    const addressLine = [addr.neighborhood, addr.street, addr.building].filter(Boolean).join(" ");
    const city = "Artvin";

    const result = await initializeCheckoutForm(config(), {
      conversationId: payment.conversation_id,
      basketId: order.order_number,
      amount: Number(payment.amount),
      callbackUrl: `${requireEnv("SUPABASE_URL")}/functions/v1/iyzico-callback?pid=${payment.id}`,
      buyer: {
        id: user.id,
        name,
        surname,
        gsmNumber: order.customer_phone,
        email: profile.email,
        identityNumber,
        registrationAddress: addressLine,
        ip: clientIp(req),
        city,
        country: "Turkey",
      },
      address: { contactName: order.customer_name, city, country: "Turkey", address: addressLine },
    });

    if (result.status !== "success" || !result.token) {
      await db.rpc("fail_delivery_payment", {
        p_payment_id: payment.id,
        p_reason: result.errorCode ?? "init_failed",
        p_provider_response: { errorCode: result.errorCode },
      });
      await logEvent("payment_failure", "error", "iyzico ödeme başlatılamadı", { order_id: orderId, errorCode: result.errorCode });
      throw new AppError("KPD_PAYMENT_PROVIDER_ERROR", 502);
    }
    const { error: tokErr } = await db.rpc("attach_payment_token", { p_payment_id: payment.id, p_token: result.token });
    if (tokErr) throw fromDbError(tokErr);

    return json(req, {
      payment_id: payment.id,
      amount: Number(payment.amount),
      payment_page_url: result.paymentPageUrl,
      checkout_form_content: result.checkoutFormContent,
      return_url: `${optionalEnv("PUBLIC_SITE_URL") ?? "https://kapinda.site"}/siparislerim/${orderId}`,
    });
  } catch (err) {
    return errorResponse(req, err);
  }
});
