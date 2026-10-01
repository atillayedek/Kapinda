// Google Maps bileşenleri. Anahtar yoksa veya yüklenemezse sade yedek arayüz gösterilir; uygulama çökmez.
import { APIProvider, Map, Marker, useMap } from "@vis.gl/react-google-maps";
import { useEffect, useState, type ReactNode } from "react";
import { LocateFixed, MapPinOff } from "lucide-react";
import { env, BRAND } from "@/lib/env";
import { Button } from "@/components/ui/button";

export const mapsAvailable = Boolean(env.mapsKey);

export function MapsProvider({ children }: { children: ReactNode }) {
  if (!env.mapsKey || typeof window === "undefined") return <>{children}</>;
  return (
    <APIProvider apiKey={env.mapsKey} language="tr" region="TR">
      {children}
    </APIProvider>
  );
}

export interface LatLng {
  lat: number;
  lng: number;
}

function useGeolocate(onPick: (p: LatLng) => void) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const locate = () => {
    if (!("geolocation" in navigator)) {
      setError("Tarayıcınız konum desteği sunmuyor.");
      return;
    }
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        onPick({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        setBusy(false);
        setError("Konum alınamadı. Konum iznini kontrol edin.");
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  return { locate, busy, error };
}

function Recenter({ to }: { to: LatLng | null }) {
  const map = useMap();
  useEffect(() => {
    if (map && to) map.panTo(to);
  }, [map, to]);
  return null;
}

/** Adres için harita pini seçimi */
export function PinPicker({ value, onChange }: { value: LatLng | null; onChange: (p: LatLng) => void }) {
  const geo = useGeolocate(onChange);
  return (
    <div className="space-y-2">
      {mapsAvailable ? (
        <div className="h-64 overflow-hidden rounded-lg border">
          <Map
            defaultCenter={value ?? BRAND.center}
            defaultZoom={15}
            gestureHandling="greedy"
            disableDefaultUI
            zoomControl
            onClick={(e) => {
              const ll = e.detail.latLng;
              if (ll) onChange({ lat: ll.lat, lng: ll.lng });
            }}
          >
            {value && <Marker position={value} draggable onDragEnd={(e) => e.latLng && onChange({ lat: e.latLng.lat(), lng: e.latLng.lng() })} />}
            <Recenter to={value} />
          </Map>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
          <MapPinOff className="h-4 w-4" aria-hidden /> Harita şu anda kullanılamıyor. Konumunuzu cihazınızdan alabilirsiniz.
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" size="sm" onClick={geo.locate} disabled={geo.busy}>
          <LocateFixed aria-hidden /> {geo.busy ? "Konum alınıyor…" : "Konumumu kullan"}
        </Button>
        {value && <span className="text-xs text-muted-foreground">Seçilen konum: {value.lat.toFixed(5)}, {value.lng.toFixed(5)}</span>}
      </div>
      {geo.error && <p className="text-xs text-destructive">{geo.error}</p>}
      <p className="text-xs text-muted-foreground">Haritada binanızın girişine dokunarak pini konumlandırın.</p>
    </div>
  );
}

/** Canlı kurye takibi: işletme, varış noktası, kurye ve tahmini varış süresi */
export function CourierMapTracker({ vendor, destination, courier, etaMinutes }: {
  vendor: LatLng | null;
  destination: LatLng;
  courier: (LatLng & { updatedAt?: string }) | null;
  etaMinutes: number | null;
}) {
  if (!mapsAvailable) {
    return (
      <div className="rounded-lg border p-4 text-sm">
        <p className="font-semibold">Canlı konum</p>
        {courier ? (
          <p className="mt-1 text-muted-foreground">Kurye konumu güncellendi{courier.updatedAt ? ` (${new Date(courier.updatedAt).toLocaleTimeString("tr-TR")})` : ""}.{etaMinutes !== null && ` Tahmini varış: ~${etaMinutes} dk.`}</p>
        ) : (
          <p className="mt-1 text-muted-foreground">Kurye konumu, teslimat başladığında görünür.</p>
        )}
      </div>
    );
  }
  const points = [vendor, destination, courier].filter(Boolean) as LatLng[];
  return (
    <div className="space-y-2">
      <div className="h-72 overflow-hidden rounded-lg border">
        <Map defaultCenter={courier ?? destination} defaultZoom={14} gestureHandling="cooperative" disableDefaultUI zoomControl>
          {vendor && <Marker position={vendor} title="İşletme" label={{ text: "İ", color: "white" }} />}
          <Marker position={destination} title="Teslimat adresi" label={{ text: "A", color: "white" }} />
          {courier && <Marker position={courier} title="Kurye" label={{ text: "K", color: "white" }} />}
          <FitBounds points={points} />
          {courier && <Route from={courier} to={destination} />}
        </Map>
      </div>
      <p className="text-sm text-muted-foreground">{etaMinutes !== null ? `Tahmini varış: ~${etaMinutes} dk` : "Tahmini varış süresi kurye yola çıktığında hesaplanır."}</p>
    </div>
  );
}

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`).join("|");
  useEffect(() => {
    if (!map || points.length < 2 || typeof google === "undefined") return;
    const b = new google.maps.LatLngBounds();
    points.forEach((p) => b.extend(p));
    map.fitBounds(b, 48);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key]);
  return null;
}

function Route({ from, to }: { from: LatLng; to: LatLng }) {
  const map = useMap();
  useEffect(() => {
    if (!map || typeof google === "undefined") return;
    const line = new google.maps.Polyline({ path: [from, to], strokeColor: "#0f6b4f", strokeOpacity: 0.8, strokeWeight: 4, geodesic: true, map });
    return () => line.setMap(null);
  }, [map, from, to]);
  return null;
}

/** Kuş uçuşu mesafe + şehir içi ortalama hızla tahmini varış (dk) */
export function estimateEtaMinutes(from: LatLng, to: LatLng, speedKmh = 25): number {
  const R = 6371;
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const km = 2 * R * Math.asin(Math.sqrt(a)) * 1.3;
  return Math.max(1, Math.round((km / speedKmh) * 60));
}
