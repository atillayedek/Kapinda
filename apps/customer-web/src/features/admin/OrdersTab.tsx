import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { OrderStatusLabels, OrderStatusValues, OrderTransitions, ProductPaymentMethodLabels, type OrderStatus } from "@kapinda/shared-contracts";
import { formatTrPhone } from "@kapinda/shared-validation";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { formatDateTime, formatTry, downloadCsv } from "@/lib/utils";
import { StatusBadge } from "@/features/orders/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, Td, Th, Skeleton } from "@/components/ui/misc";
import { PageHeader, Pager, QueryState, ReasonDialog, useAdminSelect } from "./shared";

const SIZE = 25;
interface Row { id: string; order_number: string; status: OrderStatus; product_subtotal: number; delivery_fee_payable: number; created_at: string; customer_name: string; vendors: { name: string } | null; couriers: { display_name: string } | null }

export default function OrdersTab() {
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const openId = params.get("id");
  const q = useAdminSelect<Row>(["orders", status, search, page], () => {
    let b = supabase.from("orders").select("id, order_number, status, product_subtotal, delivery_fee_payable, created_at, customer_name, vendors(name), couriers(display_name)", { count: "exact" })
      .order("created_at", { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1);
    if (status) b = b.eq("status", status);
    if (search.trim()) b = b.ilike("order_number", `%${search.trim().toUpperCase()}%`);
    return b;
  });
  return (
    <div>
      <PageHeader title="Siparişler" actions={
        <Button variant="outline" onClick={() => downloadCsv("siparisler.csv", (q.data?.rows ?? []).map((r) => ({ siparis: r.order_number, durum: OrderStatusLabels[r.status], isletme: r.vendors?.name, urun: r.product_subtotal, teslimat: r.delivery_fee_payable, tarih: r.created_at })))}>CSV</Button>
      } />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="w-56" placeholder="Sipariş no" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />
        <NativeSelect className="w-56" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>
          <option value="">Tüm durumlar</option>
          {OrderStatusValues.map((s) => <option key={s} value={s}>{OrderStatusLabels[s]}</option>)}
        </NativeSelect>
      </div>
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Sipariş</Th><Th>Durum</Th><Th>İşletme</Th><Th>Müşteri</Th><Th>Kurye</Th><Th>Ürün</Th><Th>Teslimat</Th><Th>Tarih</Th></tr></thead>
          <tbody>
            {q.data?.rows.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setParams({ id: r.id })}>
                <Td className="font-semibold">{r.order_number}</Td><Td><StatusBadge status={r.status} /></Td><Td>{r.vendors?.name}</Td><Td>{r.customer_name}</Td>
                <Td>{r.couriers?.display_name ?? "—"}</Td><Td>{formatTry(r.product_subtotal)}</Td><Td>{formatTry(r.delivery_fee_payable)}</Td><Td>{formatDateTime(r.created_at)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
        <Pager page={page} total={q.data?.count ?? 0} size={SIZE} onPage={setPage} />
      </QueryState>
      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setParams({})}>
        <DialogContent side="right" className="w-full">
          {openId && <AdminOrderDetail orderId={openId} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function AdminOrderDetail({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const [dialog, setDialog] = useState<null | "assign" | "pool" | "status">(null);
  const [courierId, setCourierId] = useState("");
  const [override, setOverride] = useState(false);
  const [toStatus, setToStatus] = useState<OrderStatus | "">("");
  const d = useQuery({
    queryKey: ["admin", "order", orderId],
    queryFn: async () => {
      const [o, items, hist, pays, assigns, transfers, proofs] = await Promise.all([
        supabase.from("orders").select("*, vendors(name, phone), couriers(display_name, phone)").eq("id", orderId).single(),
        supabase.from("order_items").select("*").eq("order_id", orderId),
        supabase.from("order_status_history").select("*").eq("order_id", orderId).order("created_at"),
        supabase.from("payments").select("id, amount, status, paid_at, refunded_at, failure_reason, provider_payment_id, created_at").eq("order_id", orderId).order("created_at"),
        supabase.from("order_assignments").select("*, couriers(display_name)").eq("order_id", orderId).order("assigned_at"),
        supabase.from("order_transfers").select("*").eq("order_id", orderId).order("created_at"),
        supabase.from("delivery_proofs").select("storage_path, created_at").eq("order_id", orderId),
      ]);
      const err = o.error ?? items.error ?? hist.error ?? pays.error ?? assigns.error ?? transfers.error ?? proofs.error;
      if (err) throw toAppError(err);
      return { o: o.data, items: items.data ?? [], hist: hist.data ?? [], pays: pays.data ?? [], assigns: assigns.data ?? [], transfers: transfers.data ?? [], proofs: proofs.data ?? [] };
    },
  });
  const couriers = useQuery({
    queryKey: ["admin", "couriers-select"],
    enabled: dialog === "assign",
    queryFn: async () => {
      const { data, error } = await supabase.from("couriers").select("id, display_name, availability, active_order_count, max_active_orders").eq("status", "active").order("display_name");
      if (error) throw toAppError(error);
      return data ?? [];
    },
  });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin"] }); };
  if (d.isLoading) return <Skeleton className="h-96" />;
  if (!d.data) return null;
  const o = d.data.o;
  const allowedTargets = OrderTransitions.filter(([f, t, a]) => f === o.status && a === "admin" && t !== "delivered").map(([, t]) => t);
  const selectedCourier = couriers.data?.find((c) => c.id === courierId);
  const capacityFull = selectedCourier ? selectedCourier.active_order_count >= selectedCourier.max_active_orders : false;

  return (
    <div className="space-y-5 text-sm">
      <DialogHeader><DialogTitle>{o.order_number}</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2"><StatusBadge status={o.status} /><span className="text-muted-foreground">{formatDateTime(o.created_at)}</span></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border p-3"><p className="font-semibold">Müşteri</p><p>{o.customer_name}</p><p>{formatTrPhone(o.customer_phone)}</p>
          <p className="text-muted-foreground">{[o.delivery_address.neighborhood, o.delivery_address.street, o.delivery_address.building].filter(Boolean).join(", ")}</p></div>
        <div className="rounded-lg border p-3"><p className="font-semibold">İşletme / Kurye</p><p>{o.vendors?.name} · {formatTrPhone(o.vendors?.phone)}</p><p>Kurye: {o.couriers?.display_name ?? "atanmadı"}</p></div>
      </div>
      <div className="rounded-lg border p-3">
        <p className="font-semibold">Tutarlar (sunucu snapshot)</p>
        <p>Ürün ({ProductPaymentMethodLabels[o.product_payment_method as "cash"]}): {formatTry(o.product_subtotal)}</p>
        <p>Teslimat: {formatTry(o.delivery_fee)} · online ödenecek {formatTry(o.delivery_fee_payable)} · {o.payment_state}</p>
        <p>Mesafe: {o.distance_km} km ({o.distance_source}) · fiyat sürümü v{o.pricing_snapshot?.version}</p>
      </div>

      <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
        <p className="font-semibold">Manuel müdahale</p>
        <p className="text-xs text-muted-foreground">Her işlem gerekçe ister ve değiştirilemez audit kaydına yazılır. "Teslim edildi" durumu manuel atanamaz.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => setDialog("assign")} disabled={!["vendor_accepted", "preparing", "ready_for_pickup", "courier_assigned", "picked_up", "on_the_way"].includes(o.status)}>
            {o.courier_id ? "Başka kuryeye devret" : "Kurye ata"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("pool")} disabled={!o.courier_id || ["picked_up", "on_the_way"].includes(o.status)}>Havuza döndür</Button>
          <Button size="sm" variant="outline" onClick={() => setDialog("status")} disabled={allowedTargets.length === 0}>Durumu düzelt</Button>
        </div>
      </div>

      <div><p className="font-semibold">Ürünler</p>
        <ul className="mt-1 divide-y rounded-lg border">{d.data.items.map((i) => <li key={i.id} className="flex justify-between p-2"><span>{i.quantity} × {i.product_name} <span className="text-xs text-muted-foreground">({i.fulfillment})</span></span><span>{formatTry(i.line_total)}</span></li>)}</ul></div>
      <div><p className="font-semibold">Durum geçmişi</p>
        <ul className="mt-1 space-y-1">{d.data.hist.map((h) => <li key={h.id}>{formatDateTime(h.created_at)} — {h.previous_status ? `${OrderStatusLabels[h.previous_status as OrderStatus]} → ` : ""}{OrderStatusLabels[h.new_status as OrderStatus]} <span className="text-muted-foreground">({h.actor_role}{h.reason ? `: ${h.reason}` : ""})</span></li>)}</ul></div>
      <div><p className="font-semibold">Ödemeler</p>
        <ul className="mt-1 space-y-1">{d.data.pays.length === 0 ? <li className="text-muted-foreground">Ödeme kaydı yok</li> : d.data.pays.map((p) => <li key={p.id}>{formatDateTime(p.created_at)} · {formatTry(p.amount)} · {p.status}{p.failure_reason ? ` (${p.failure_reason})` : ""}</li>)}</ul></div>
      <div><p className="font-semibold">Atamalar / devirler</p>
        <ul className="mt-1 space-y-1">
          {d.data.assigns.map((a) => <li key={a.id}>{formatDateTime(a.assigned_at)} · {a.couriers?.display_name} · {a.assignment_type} · {a.status}{a.capacity_override ? " · kapasite aşımı" : ""}</li>)}
          {d.data.transfers.map((t) => <li key={t.id} className="text-muted-foreground">{formatDateTime(t.created_at)} · {t.transfer_type}: {t.reason}</li>)}
        </ul></div>
      {d.data.proofs.length > 0 && <ProofLinks paths={d.data.proofs.map((p) => p.storage_path)} />}

      <ReasonDialog open={dialog === "assign"} onOpenChange={(v) => !v && setDialog(null)} title={o.courier_id ? "Başka kuryeye devret" : "Kurye ata"}
        onConfirm={async (reason) => {
          await rpc("admin_assign_courier", { p_order_id: o.id, p_courier_id: courierId, p_reason: reason, p_confirm_capacity_override: override });
          toast.success("Kurye ataması yapıldı.");
          refresh();
        }}>
        <div className="space-y-2">
          <Label>Kurye</Label>
          <NativeSelect value={courierId} onChange={(e) => { setCourierId(e.target.value); setOverride(false); }}>
            <option value="">Seçin</option>
            {couriers.data?.filter((c) => c.id !== o.courier_id).map((c) => <option key={c.id} value={c.id}>{c.display_name} · {c.availability} · {c.active_order_count}/{c.max_active_orders}</option>)}
          </NativeSelect>
          {capacityFull && (
            <div className="flex items-start gap-2 rounded-lg bg-warning/15 p-2">
              <Checkbox id="override" checked={override} onCheckedChange={(c) => setOverride(c === true)} />
              <Label htmlFor="override" className="font-normal">Kuryenin aktif sipariş sınırı dolu. Sınırı aşmayı açıkça onaylıyorum (audit kaydına yazılır).</Label>
            </div>
          )}
        </div>
      </ReasonDialog>
      <ReasonDialog open={dialog === "pool"} onOpenChange={(v) => !v && setDialog(null)} title="Havuza döndür" description="Kurye ataması kaldırılır ve sipariş uygun kurye havuzuna döner." destructive
        onConfirm={async (reason) => { await rpc("admin_return_to_pool", { p_order_id: o.id, p_reason: reason }); toast.success("Sipariş havuza döndürüldü."); refresh(); }} />
      <ReasonDialog open={dialog === "status"} onOpenChange={(v) => !v && setDialog(null)} title="Durumu düzelt" description="Yalnız izin verilen sınırlı acil durum geçişleri." destructive
        onConfirm={async (reason) => { if (!toStatus) throw new Error("KPD_INVALID_INPUT"); await rpc("admin_override_status", { p_order_id: o.id, p_to: toStatus, p_reason: reason }); toast.success("Durum güncellendi."); refresh(); }}>
        <NativeSelect value={toStatus} onChange={(e) => setToStatus(e.target.value as OrderStatus)}>
          <option value="">Yeni durum seçin</option>
          {allowedTargets.map((t) => <option key={t} value={t}>{OrderStatusLabels[t]}</option>)}
        </NativeSelect>
      </ReasonDialog>
    </div>
  );
}

function ProofLinks({ paths }: { paths: string[] }) {
  const urls = useQuery({
    queryKey: ["admin", "proofs", paths],
    queryFn: async () => Promise.all(paths.map(async (p) => (await supabase.storage.from("delivery-proofs").createSignedUrl(p, 300)).data?.signedUrl)),
  });
  return (
    <div><p className="font-semibold">Teslimat kanıtı</p>
      <div className="mt-1 flex gap-2">{urls.data?.filter(Boolean).map((u) => <a key={u} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt="Teslimat kanıtı" className="h-24 rounded" /></a>)}</div>
    </div>
  );
}
