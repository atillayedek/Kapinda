// Pazarlama e-postalarından çıkış (tek tık / RFC 8058). Token HMAC ile doğrulanır.
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { adminClient } from "../_shared/supabase.ts";
import { verifyUnsubscribeToken } from "../_shared/unsubscribe.ts";

function page(message: string, status = 200): Response {
  const site = optionalEnv("PUBLIC_SITE_URL") ?? "https://kapinda.site";
  return new Response(
    `<!doctype html><html lang="tr"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Kapında</title></head><body style="font-family:Arial,sans-serif;max-width:480px;margin:48px auto;padding:0 16px;color:#1f2a24"><h1 style="color:#0f6b4f">Kapında</h1><p>${message}</p><p><a href="${site}">kapinda.site</a></p></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") ?? "";
  const id = await verifyUnsubscribeToken(requireEnv("EMAIL_UNSUBSCRIBE_SECRET"), token);
  if (!id) return page("Bağlantı geçersiz veya süresi dolmuş.", 400);
  if (req.method === "GET") {
    return page(
      `Pazarlama e-postalarından çıkmak için onaylayın.<form method="post"><button style="margin-top:12px;padding:10px 16px;background:#0f6b4f;color:#fff;border:0;border-radius:8px">Abonelikten çık</button></form>`,
    );
  }
  if (req.method !== "POST") return page("Geçersiz istek.", 405);
  const db = adminClient();
  const { data: sub } = await db.from("email_subscriptions")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", id).select("email").maybeSingle();
  if (sub?.email) {
    await db.from("email_suppressions").upsert({ email: sub.email.toLowerCase(), reason: "unsubscribe", scope: "marketing" }, {
      onConflict: "email",
    });
  }
  return page("Pazarlama e-postalarından çıkışınız tamamlandı. Sipariş bilgilendirmeleri gibi işlem e-postaları gönderilmeye devam eder.");
});
