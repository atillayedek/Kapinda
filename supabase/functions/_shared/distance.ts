// Mesafe: önce Google Routes API (gerçek sürüş mesafesi), hata/zaman aşımında Haversine tahmini.
export interface LatLng {
  lat: number;
  lng: number;
}

export interface DistanceResult {
  km: number;
  source: "google_maps" | "haversine_estimate";
  durationSeconds?: number;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371.0088;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export async function drivingDistance(
  origin: LatLng,
  destination: LatLng,
  apiKey: string | undefined,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 4000,
): Promise<DistanceResult & { fallbackReason?: string }> {
  const fallback = (reason: string) => ({
    km: Math.round(haversineKm(origin, destination) * 100) / 100,
    source: "haversine_estimate" as const,
    fallbackReason: reason,
  });
  if (!apiKey) return fallback("maps_key_missing");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.distanceMeters,routes.duration",
      },
      body: JSON.stringify({
        origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
        destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_UNAWARE",
        languageCode: "tr-TR",
        units: "METRIC",
      }),
    });
    if (!res.ok) return fallback(`maps_http_${res.status}`);
    const body = await res.json() as { routes?: Array<{ distanceMeters?: number; duration?: string }> };
    const meters = body.routes?.[0]?.distanceMeters;
    if (typeof meters !== "number" || !Number.isFinite(meters)) return fallback("maps_no_route");
    const duration = body.routes?.[0]?.duration;
    return {
      km: Math.round((meters / 1000) * 100) / 100,
      source: "google_maps",
      durationSeconds: duration ? Number.parseInt(duration, 10) : undefined,
    };
  } catch (e) {
    return fallback(e instanceof DOMException && e.name === "AbortError" ? "maps_timeout" : "maps_error");
  } finally {
    clearTimeout(timer);
  }
}
