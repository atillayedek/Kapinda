// Bekleyen bildirimleri FCM ile cihazlara gönderir. FCM hatası sipariş işlemini etkilemez; sonuç kaydedilir.
// Geçersiz (UNREGISTERED) tokenlar iptal edilir.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv } from "../_shared/env.ts";
import { errorResponse, json } from "../_shared/http.ts";
import { requireCronOrAdmin } from "../_shared/cron.ts";
import { adminClient, logEvent } from "../_shared/supabase.ts";
import { parseServiceAccount, sendToToken } from "../_shared/fcm.ts";

const ORDER_TYPES = new Set([
  "order_received",
  "order_accepted",
  "order_preparing",
  "courier_assigned",
  "order_picked_up",
  "order_on_the_way",
  "order_delivered",
  "order_cancelled",
  "order_item_changed",
  "courier_changed",
]);

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    await requireCronOrAdmin(req);
    const db = adminClient();
    const { data: enabled } = await db.from("settings").select("value").eq("key", "bildirim.push_enabled").maybeSingle();
    const raw = optionalEnv("FCM_SERVICE_ACCOUNT_JSON");

    // Gönderilecekleri sahiplen (eşzamanlı çalışmada çift gönderimi önler)
    const { data: batch } = await db.from("notifications")
      .update({ push_status: "processing" })
      .eq("push_status", "pending")
      .lt("push_attempts", 3)
      .order("created_at", { ascending: true })
      .limit(100)
      .select("id, user_id, app, type, title, body, data, push_attempts");
    if (!batch?.length) return json(req, { sent: 0 });

    if (enabled?.value === false || !raw) {
      await db.from("notifications").update({ push_status: "skipped", push_error: raw ? "push_disabled" : "fcm_not_configured" })
        .in("id", batch.map((n) => n.id));
      return json(req, { sent: 0, skipped: batch.length });
    }
    const sa = parseServiceAccount(raw);
    const site = optionalEnv("PUBLIC_SITE_URL") ?? "https://kapinda.site";
    let sent = 0;
    let failed = 0;

    for (const n of batch) {
      if (n.app === "customer" && ORDER_TYPES.has(n.type)) {
        const { data: pref } = await db.from("notification_preferences").select("order_updates_push").eq("user_id", n.user_id)
          .maybeSingle();
        if (pref && pref.order_updates_push === false) {
          await db.from("notifications").update({ push_status: "skipped", push_error: "user_preference" }).eq("id", n.id);
          continue;
        }
      }
      const { data: tokens } = await db.from("device_tokens").select("id, token").eq("user_id", n.user_id).eq("app", n.app).is(
        "revoked_at",
        null,
      );
      if (!tokens?.length) {
        await db.from("notifications").update({ push_status: "skipped", push_error: "no_device" }).eq("id", n.id);
        continue;
      }
      const data: Record<string, string> = { type: n.type, notification_id: n.id };
      for (const [k, v] of Object.entries((n.data ?? {}) as Record<string, unknown>)) data[k] = String(v);
      const link = n.app === "customer" && data.order_id ? `${site}/siparislerim/${data.order_id}` : undefined;
      let anyOk = false;
      let lastError = "";
      for (const t of tokens) {
        try {
          const r = await sendToToken(sa, t.token, { title: n.title, body: n.body, data, link });
          if (r.ok) anyOk = true;
          else {
            lastError = r.error;
            if (r.unregistered) {
              await db.from("device_tokens").update({ revoked_at: new Date().toISOString(), revoke_reason: "fcm_unregistered" }).eq(
                "id",
                t.id,
              );
            }
          }
        } catch (e) {
          lastError = e instanceof Error ? e.message : "fcm_error";
        }
      }
      if (anyOk) sent++;
      else failed++;
      await db.from("notifications").update({
        push_status: anyOk ? "sent" : n.push_attempts + 1 >= 3 ? "failed" : "pending",
        push_attempts: n.push_attempts + 1,
        push_error: anyOk ? null : lastError.slice(0, 200),
      }).eq("id", n.id);
    }
    if (failed > 0) await logEvent("fcm_failure", "warning", `${failed} bildirim gönderilemedi`, {});
    return json(req, { sent, failed });
  } catch (err) {
    return errorResponse(req, err);
  }
});
