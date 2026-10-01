import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Map, Marker } from "@vis.gl/react-google-maps";
import { OrderStatusLabels, type OrderStatus } from "@kapinda/shared-contracts";
import { rpc } from "@/lib/supabase";
import { BRAND } from "@/lib/env";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { mapsAvailable } from "@/features/maps/Maps";
import { Badge } from "@/components/ui/badge";
import { PageHeader, QueryState } from "./shared";
import { Link } from "react-router-dom";

interface LiveRow {
  order_id: string; order_number: string; status: OrderStatus; vendor_name: string; courier_name: string | null; courier_id: string | null; created_at: string;
  minutes_in_status: number; is_delayed: boolean; delivery_lat: number; delivery_lng: number; courier_lat: number | null; courier_lng: number | null;
}

const BUCKETS: Array<{ label: string; statuses: OrderStatus[] }> = [
  { label: "Ödeme bekliyor", statuses: ["pending_payment", "payment_confirmed"] },
  { label: "İşletme bekliyor", statuses: ["vendor_pending"] },
  { label: "Hazırlanıyor", statuses: ["vendor_accepted", "preparing"] },
  { label: "Teslim alma bekliyor", statuses: ["ready_for_pickup"] },
  { label: "Kurye bekliyor (atandı)", statuses: ["courier_assigned"] },
  { label: "Yolda", statuses: ["picked_up", "on_the_way"] },
  { label: "Teslim edildi (son 3 saat)", statuses: ["delivered"] },
];

export default function LiveOpsTab() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["admin", "live"], refetchInterval: 15_000, queryFn: () => rpc<LiveRow[]>("admin_live_operations") });
  const incidents = useQuery({ queryKey: ["admin", "open-incidents-count"], refetchInterval: 15_000, queryFn: async () => (await rpc<Record<string, number>>("admin_dashboard_stats", { p_from: new Date().toISOString(), p_to: new Date().toISOString() })).open_incidents });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["admin", "live"] }), [qc]);
  useRealtimeTable({ channel: "admin-live-orders", table: "orders", onChange: refresh });
  const rows = q.data ?? [];
  const delayed = rows.filter((r) => r.is_delayed && r.status !== "delivered");
  return (
    <div>
      <PageHeader title="Canlı operasyon" description="Aktif siparişler, gecikmeler ve kurye konumları (15 sn'de bir + anlık güncellenir)." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge variant={delayed.length ? "destructive" : "muted"}>Geciken: {delayed.length}</Badge>
        <Badge variant={incidents.data ? "destructive" : "muted"}>Acil durum: {incidents.data ?? 0}</Badge>
      </div>
      <QueryState q={q}>
        {mapsAvailable && (
          <div className="mb-6 h-80 overflow-hidden rounded-xl border">
            <Map defaultCenter={BRAND.center} defaultZoom={13} disableDefaultUI zoomControl>
              {rows.filter((r) => r.status !== "delivered").map((r) => (
                <Marker key={`d-${r.order_id}`} position={{ lat: r.delivery_lat, lng: r.delivery_lng }} title={`${r.order_number} varış`} />
              ))}
              {rows.filter((r) => r.courier_lat !== null && r.courier_lng !== null).map((r) => (
                <Marker key={`c-${r.order_id}`} position={{ lat: r.courier_lat!, lng: r.courier_lng! }} title={`Kurye ${r.courier_name ?? ""}`} label={{ text: "K", color: "white" }} />
              ))}
            </Map>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {BUCKETS.map((b) => {
            const items = rows.filter((r) => b.statuses.includes(r.status));
            return (
              <div key={b.label} className="rounded-xl border bg-card p-3">
                <p className="mb-2 flex items-center justify-between text-sm font-bold">{b.label}<Badge variant="muted">{items.length}</Badge></p>
                <ul className="space-y-2">
                  {items.length === 0 && <li className="text-xs text-muted-foreground">Sipariş yok</li>}
                  {items.map((r) => (
                    <li key={r.order_id}>
                      <Link to={`/admin/siparisler?id=${r.order_id}`} className={`block rounded-lg border p-2 text-xs hover:border-primary ${r.is_delayed && r.status !== "delivered" ? "border-destructive bg-destructive/5" : ""}`}>
                        <p className="font-semibold">{r.order_number} · {r.vendor_name}</p>
                        <p className="text-muted-foreground">{OrderStatusLabels[r.status]} · {r.minutes_in_status} dk{r.courier_name ? ` · ${r.courier_name}` : ""}</p>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </QueryState>
    </div>
  );
}
