// Teslimat ücreti teklifi. Ücret İSTEMCİDE belirlenmez: mesafe burada ölçülür, ücret veritabanında hesaplanır.
import { handlePreflight } from "../_shared/cors.ts";
import { optionalEnv } from "../_shared/env.ts";
import { AppError, errorResponse, fromDbError, json, readJson, requireUuid } from "../_shared/http.ts";
import { adminClient, logEvent, rateLimit, requireUser } from "../_shared/supabase.ts";
import { drivingDistance } from "../_shared/distance.ts";

Deno.serve(async (req) => {
  const pre = handlePreflight(req);
  if (pre) return pre;
  try {
    if (req.method !== "POST") throw new AppError("KPD_METHOD_NOT_ALLOWED", 405);
    const user = await requireUser(req);
    await rateLimit(`fee:${user.id}`, 30, 60);
    const body = await readJson<{ vendor_id?: unknown; address_id?: unknown }>(req);
    const vendorId = requireUuid(body.vendor_id, "vendor_id");
    const addressId = requireUuid(body.address_id, "address_id");
    const db = adminClient();

    const [{ data: vendor }, { data: address }] = await Promise.all([
      db.from("vendors").select("id, lat, lng, status, coverage_area_id").eq("id", vendorId).is("deleted_at", null).maybeSingle(),
      db.from("addresses").select("id, lat, lng").eq("id", addressId).eq("user_id", user.id).is("deleted_at", null).maybeSingle(),
    ]);
    if (!vendor || vendor.status !== "active") throw new AppError("KPD_VENDOR_UNAVAILABLE", 400);
    if (!address) throw new AppError("KPD_ADDRESS_NOT_FOUND", 404);
    if (vendor.lat == null || vendor.lng == null) throw new AppError("KPD_VENDOR_LOCATION_MISSING", 400);

    const distance = await drivingDistance(
      { lat: vendor.lat, lng: vendor.lng },
      { lat: address.lat, lng: address.lng },
      optionalEnv("GOOGLE_MAPS_SERVER_KEY"),
    );
    if (distance.source === "haversine_estimate" && distance.fallbackReason !== "maps_key_missing") {
      await logEvent("maps_failure", "warning", "Google Maps kullanılamadı, Haversine tahmini kullanıldı", {
        reason: distance.fallbackReason,
      });
    }

    const { data: quote, error } = await db.rpc("create_delivery_fee_quote", {
      p_customer_id: user.id,
      p_vendor_id: vendorId,
      p_address_id: addressId,
      p_distance_km: distance.km,
      p_distance_source: distance.source,
    });
    if (error) throw fromDbError(error);
    const { data: area } = await db.from("coverage_areas").select("min_basket_amount").eq("id", vendor.coverage_area_id).single();

    return json(req, {
      quote_id: quote.id,
      fee: Number(quote.fee),
      distance_km: Number(quote.distance_km),
      distance_source: quote.distance_source,
      is_estimated: quote.distance_source === "haversine_estimate",
      duration_seconds: distance.durationSeconds ?? null,
      expires_at: quote.expires_at,
      min_basket_amount: Number(area?.min_basket_amount ?? 0),
      pricing: {
        base_fee: quote.pricing_snapshot.base_fee,
        base_distance_km: quote.pricing_snapshot.base_distance_km,
        per_km_fee: quote.pricing_snapshot.per_km_fee,
        max_distance_km: quote.pricing_snapshot.max_distance_km,
      },
    });
  } catch (err) {
    return errorResponse(req, err);
  }
});
