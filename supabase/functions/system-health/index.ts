// Sistem sağlığı: her servis ayrı değerlendirilir; isteğe bağlı servis sorunu platformu "down" göstermez.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv } from "../_shared/env.ts";
import { errorResponse, json } from "../_shared/http.ts";
import { requireCronOrAdmin } from "../_shared/cron.ts";
import { adminClient } from "../_shared/supabase.ts";
import { accessToken, parseServiceAccount } from "../_shared/fcm.ts";

type Status = "operational" | "degraded" | "unavailable";
interface Check {
  service: "supabase" | "edge_functions" | "storage" | "fcm" | "maps" | "iyzico" | "resend";
  status: Status;
  is_critical: boolean;
  latency_ms: number | null;
  message: string | null;
}

async function timed(
  fn: () => Promise<{ status: Status; message?: string }>,
): Promise<{ status: Status; message: string | null; latency: number }> {
  const start = performance.now();
  try {
    const r = await fn();
    return { status: r.status, message: r.message ?? null, latency: Math.round(performance.now() - start) };
  } catch (e) {
    return {
      status: "unavailable",
      message: e instanceof Error ? e.message.slice(0, 200) : "error",
      latency: Math.round(performance.now() - start),
    };
  }
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 5000): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: c.signal });
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    await requireCronOrAdmin(req);
    const db = adminClient();
    const checks: Check[] = [];
    const add = (service: Check["service"], is_critical: boolean, r: { status: Status; message: string | null; latency: number }) =>
      checks.push({ service, is_critical, status: r.status, message: r.message, latency_ms: r.latency });

    add(
      "supabase",
      true,
      await timed(async () => {
        const { error } = await db.from("settings").select("key").limit(1);
        return error ? { status: "unavailable", message: "db_query_failed" } : { status: "operational" };
      }),
    );
    add("edge_functions", true, { status: "operational", message: null, latency: 0 });
    add(
      "storage",
      false,
      await timed(async () => {
        const { error } = await db.storage.listBuckets();
        return error ? { status: "degraded", message: "storage_list_failed" } : { status: "operational" };
      }),
    );
    add(
      "fcm",
      false,
      await timed(async () => {
        const raw = optionalEnv("FCM_SERVICE_ACCOUNT_JSON");
        if (!raw) return { status: "unavailable", message: "not_configured" };
        await accessToken(parseServiceAccount(raw));
        return { status: "operational" };
      }),
    );
    add(
      "maps",
      false,
      await timed(async () => {
        const key = optionalEnv("GOOGLE_MAPS_SERVER_KEY");
        if (!key) return { status: "degraded", message: "not_configured_haversine_fallback" };
        const res = await fetchWithTimeout("https://routes.googleapis.com/directions/v2:computeRoutes", {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": "routes.distanceMeters" },
          body: JSON.stringify({
            origin: { location: { latLng: { latitude: 41.4086, longitude: 41.4283 } } },
            destination: { location: { latLng: { latitude: 41.4120, longitude: 41.4330 } } },
            travelMode: "DRIVE",
          }),
        });
        return res.ok ? { status: "operational" } : { status: "degraded", message: `http_${res.status}_haversine_fallback` };
      }),
    );
    add(
      "iyzico",
      true,
      await timed(async () => {
        const base = optionalEnv("IYZICO_BASE_URL");
        if (!base || !optionalEnv("IYZICO_API_KEY")) return { status: "unavailable", message: "not_configured" };
        const res = await fetchWithTimeout(`${base}/payment/test`);
        const body = await res.json().catch(() => ({})) as { status?: string };
        return body.status === "success" ? { status: "operational" } : { status: "unavailable", message: `http_${res.status}` };
      }),
    );
    add(
      "resend",
      false,
      await timed(async () => {
        const key = optionalEnv("RESEND_API_KEY");
        if (!key) return { status: "unavailable", message: "not_configured" };
        const res = await fetchWithTimeout("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } });
        return res.ok ? { status: "operational" } : { status: "degraded", message: `http_${res.status}` };
      }),
    );

    await db.from("system_health_checks").insert(checks.map((c) => ({ ...c, checked_at: new Date().toISOString() })));
    const criticalDown = checks.some((c) => c.is_critical && c.status === "unavailable");
    const anyIssue = checks.some((c) => c.status !== "operational");
    const overall: Status = criticalDown ? "unavailable" : anyIssue ? "degraded" : "operational";
    return json(req, { overall, checks, checked_at: new Date().toISOString() });
  } catch (err) {
    return errorResponse(req, err);
  }
});
