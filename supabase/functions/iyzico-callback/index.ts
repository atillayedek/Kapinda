// iyzico Checkout Form dönüş adresi (tarayıcı yönlendirmesi). Gövdeye güvenilmez; sonuç sunucu-sunucu sorgulanır.
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { timingSafeEqual } from "../_shared/crypto.ts";
import { UUID_RE } from "../_shared/http.ts";
import { adminClient, logEvent } from "../_shared/supabase.ts";
import { finalizePayment } from "../_shared/payment-finalize.ts";

function redirect(path: string): Response {
  const site = optionalEnv("PUBLIC_SITE_URL") ?? "https://kapinda.site";
  return new Response(null, { status: 303, headers: { Location: `${site}${path}`, "Cache-Control": "no-store" } });
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return redirect("/siparislerim");
    const url = new URL(req.url);
    const paymentId = url.searchParams.get("pid") ?? "";
    if (!UUID_RE.test(paymentId)) return redirect("/siparislerim");
    const form = await req.formData().catch(() => null);
    const token = String(form?.get("token") ?? "");

    const db = adminClient();
    const { data: pay } = await db.from("payments").select("id, order_id, provider_token").eq("id", paymentId).maybeSingle();
    if (!pay?.provider_token || !token || !timingSafeEqual(pay.provider_token, token)) {
      await logEvent("payment_failure", "warning", "iyzico callback token eşleşmedi", { payment_id: paymentId });
      return redirect("/siparislerim");
    }
    const cfg = {
      apiKey: requireEnv("IYZICO_API_KEY"),
      secretKey: requireEnv("IYZICO_SECRET_KEY"),
      baseUrl: requireEnv("IYZICO_BASE_URL"),
    };
    const { orderId, result } = await finalizePayment(cfg, pay.id);
    const status = result === "confirmed" || result === "already_processed" ? "basarili" : result === "pending" ? "beklemede" : "basarisiz";
    return redirect(`/siparislerim/${orderId}?odeme=${status}`);
  } catch (_err) {
    await logEvent("payment_failure", "error", "iyzico callback işlenemedi", {});
    return redirect("/siparislerim?odeme=hata");
  }
});
