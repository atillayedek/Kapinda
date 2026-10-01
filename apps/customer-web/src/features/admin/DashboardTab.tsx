import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { rpc } from "@/lib/supabase";
import { formatTry } from "@/lib/utils";
import { PageHeader, QueryState, RangeFilter, StatTile, rangeFor, type RangeKey } from "./shared";

interface Stats {
  orders_in_range: number; active_orders: number; delivered: number; cancelled: number; active_vendors: number; open_vendors: number;
  active_couriers: number; product_gmv: number; delivery_revenue: number; delivery_refunds: number; platform_commission: number; open_incidents: number; open_support: number;
}

export default function DashboardTab() {
  const [range, setRange] = useState<RangeKey>("today");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const r = rangeFor(range, custom);
  const q = useQuery({ queryKey: ["admin", "dashboard", r], refetchInterval: 60_000, queryFn: () => rpc<Stats>("admin_dashboard_stats", { p_from: r.from, p_to: r.to }) });
  const s = q.data;
  return (
    <div>
      <PageHeader title="Dashboard" description="Yalnız gerçek veritabanı verileri." actions={<RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />} />
      <QueryState q={q}>
        {s && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Sipariş (aralık)" value={s.orders_in_range} />
              <StatTile label="Aktif sipariş" value={s.active_orders} tone="primary" />
              <StatTile label="Teslim edilen" value={s.delivered} />
              <StatTile label="İptal / ret" value={s.cancelled} tone={s.cancelled > 0 ? "danger" : undefined} />
              <StatTile label="Aktif işletme" value={s.active_vendors} hint={`${s.open_vendors} şu an açık`} />
              <StatTile label="Çevrimiçi kurye" value={s.active_couriers} />
              <StatTile label="Açık acil durum" value={s.open_incidents} tone={s.open_incidents > 0 ? "danger" : undefined} />
              <StatTile label="Açık destek" value={s.open_support} />
            </div>
            <div>
              <h2 className="mb-2 font-bold">Finans (ayrı kalemler)</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                <StatTile label="Ürün GMV" value={formatTry(s.product_gmv)} hint="İşletmelere ait ürün satış bedeli (kapıda tahsil)" />
                <StatTile label="Teslimat geliri" value={formatTry(s.delivery_revenue)} hint={`iyzico ile tahsil · iade: ${formatTry(s.delivery_refunds)}`} tone="accent" />
                <StatTile label="Platform komisyonu" value={formatTry(s.platform_commission)} hint="20 TL × teslim edilen uygun kalem" tone="primary" />
              </div>
            </div>
          </div>
        )}
      </QueryState>
    </div>
  );
}
