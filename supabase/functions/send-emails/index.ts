// E-posta kuyruğunu Resend ile gönderir. Pazarlama e-postaları bastırma listesine ve abonelik durumuna uyar,
// abonelikten çıkış bağlantısı ve List-Unsubscribe başlığı içerir. Hata ana işlemleri etkilemez.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv, requireEnv } from "../_shared/env.ts";
import { errorResponse, json } from "../_shared/http.ts";
import { requireCronOrAdmin } from "../_shared/cron.ts";
import { adminClient, logEvent } from "../_shared/supabase.ts";
import { sendEmail } from "../_shared/resend.ts";
import { renderEmail } from "../_shared/email-templates.ts";
import { unsubscribeToken } from "../_shared/unsubscribe.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    await requireCronOrAdmin(req);
    const db = adminClient();
    const apiKey = optionalEnv("RESEND_API_KEY");
    const { data: batch } = await db.from("email_outbox")
      .update({ status: "processing" })
      .eq("status", "pending").lt("attempts", 3)
      .order("created_at", { ascending: true }).limit(50)
      .select("id, to_email, category, template, data, subscription_id, attempts");
    if (!batch?.length) return json(req, { sent: 0 });
    if (!apiKey) {
      await db.from("email_outbox").update({ status: "pending", error: "resend_not_configured" }).in("id", batch.map((m) => m.id));
      return json(req, { sent: 0, deferred: batch.length });
    }
    const from = requireEnv("EMAIL_FROM");
    const fnBase = `${requireEnv("SUPABASE_URL")}/functions/v1/handle-email-unsubscribe`;
    let sent = 0;
    let failed = 0;
    for (const m of batch) {
      const email = String(m.to_email).toLowerCase();
      const { data: sup } = await db.from("email_suppressions").select("scope").eq("email", email).maybeSingle();
      if (sup && (sup.scope === "all" || m.category === "marketing")) {
        await db.from("email_outbox").update({ status: "suppressed" }).eq("id", m.id);
        continue;
      }
      let unsubscribeUrl: string | undefined;
      const headers: Record<string, string> = {};
      if (m.category === "marketing") {
        if (!m.subscription_id) {
          await db.from("email_outbox").update({ status: "suppressed", error: "no_subscription" }).eq("id", m.id);
          continue;
        }
        const { data: subRow } = await db.from("email_subscriptions").select("status").eq("id", m.subscription_id).maybeSingle();
        if (subRow?.status !== "subscribed") {
          await db.from("email_outbox").update({ status: "suppressed", error: "unsubscribed" }).eq("id", m.id);
          continue;
        }
        unsubscribeUrl = `${fnBase}?token=${
          encodeURIComponent(await unsubscribeToken(requireEnv("EMAIL_UNSUBSCRIBE_SECRET"), m.subscription_id))
        }`;
        headers["List-Unsubscribe"] = `<${unsubscribeUrl}>`;
        headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
      }
      try {
        const rendered = renderEmail(m.template, (m.data ?? {}) as Record<string, unknown>, unsubscribeUrl);
        const r = await sendEmail(
          apiKey,
          { from, to: email, subject: rendered.subject, html: rendered.html, text: rendered.text, headers },
          m.id,
        );
        if (r.ok) {
          sent++;
          await db.from("email_outbox").update({
            status: "sent",
            sent_at: new Date().toISOString(),
            provider_message_id: r.id,
            attempts: m.attempts + 1,
          }).eq("id", m.id);
        } else {
          failed++;
          await db.from("email_outbox").update({
            status: m.attempts + 1 >= 3 ? "failed" : "pending",
            error: r.error,
            attempts: m.attempts + 1,
          }).eq("id", m.id);
        }
      } catch (e) {
        failed++;
        await db.from("email_outbox").update({
          status: "failed",
          error: e instanceof Error ? e.message.slice(0, 200) : "render_error",
          attempts: m.attempts + 1,
        }).eq("id", m.id);
      }
    }
    if (failed) await logEvent("email_failure", "warning", `${failed} e-posta gönderilemedi`, {});
    return json(req, { sent, failed });
  } catch (err) {
    return errorResponse(req, err);
  }
});
