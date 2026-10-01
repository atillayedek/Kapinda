import { useCallback, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Share2, XCircle, CreditCard, Headphones } from "lucide-react";
import { toast } from "sonner";
import { ProductPaymentMethodLabels, SubstitutionPreferenceLabels, OrderStatusLabels } from "@kapinda/shared-contracts";
import { PrivatePage } from "@/components/seo/SEOHead";
import { supabase, rpc, toAppError, invokeFunction } from "@/lib/supabase";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errorMessages";
import { cn, formatDateTime, formatTime, formatTry } from "@/lib/utils";
import { useRealtimeTable } from "@/hooks/useRealtime";
import type { Order, OrderItem, OrderStatusHistory } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/input";
import { CUSTOMER_STEPS, StatusBadge, stepReached } from "./StatusBadge";
import { DeliveryQr } from "./DeliveryQr";
import { RatingForm } from "./RatingForm";
import { CourierMapTracker, estimateEtaMinutes } from "@/features/maps/Maps";

interface Tracking {
  status: string;
  vendor: { name: string; lat: number | null; lng: number | null };
  destination: { lat: number; lng: number };
  courier_name: string | null;
  courier_location: { lat: number; lng: number; heading: number | null; updated_at: string } | null;
}

const ACTIVE = ["courier_assigned", "picked_up", "on_the_way"];

export default function OrderDetailPage() {
  const { id = "" } = useParams();
  const [params] = useSearchParams();
  const qc = useQueryClient();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState("");

  const order = useQuery({
    queryKey: ["order", id],
    queryFn: async () => {
      const [o, items, hist] = await Promise.all([
        supabase.from("orders").select("*, vendors(name, slug, logo_path)").eq("id", id).maybeSingle(),
        supabase.from("order_items").select("*").eq("order_id", id).order("created_at"),
        supabase.from("order_status_history").select("id, order_id, previous_status, new_status, actor_role, reason, created_at").eq("order_id", id).order("created_at"),
      ]);
      if (o.error || items.error || hist.error) throw toAppError(o.error ?? items.error ?? hist.error);
      return { order: o.data as Order | null, items: (items.data ?? []) as OrderItem[], history: (hist.data ?? []) as OrderStatusHistory[] };
    },
  });
  const o = order.data?.order;
  const isActive = o ? ACTIVE.includes(o.status) : false;

  const tracking = useQuery({
    queryKey: ["tracking", id],
    enabled: Boolean(o) && isActive,
    queryFn: () => rpc<Tracking>("get_order_tracking", { p_order_id: id }),
  });

  const refreshOrder = useCallback(() => void qc.invalidateQueries({ queryKey: ["order", id] }), [qc, id]);
  const refreshTracking = useCallback(() => void qc.invalidateQueries({ queryKey: ["tracking", id] }), [qc, id]);
  useRealtimeTable({ channel: `order:${id}`, table: "orders", filter: `id=eq.${id}`, event: "UPDATE", enabled: Boolean(o), onChange: refreshOrder });
  useRealtimeTable({ channel: `order-live:${id}`, table: "order_live_locations", filter: `order_id=eq.${id}`, enabled: isActive, onChange: refreshTracking });

  const proofs = useQuery({
    queryKey: ["proofs", id],
    enabled: o?.status === "delivered",
    queryFn: async () => {
      const { data } = await supabase.from("delivery_proofs").select("storage_path").eq("order_id", id);
      const urls = await Promise.all(
        (data ?? []).map(async (p) => (await supabase.storage.from("delivery-proofs").createSignedUrl(p.storage_path, 300)).data?.signedUrl),
      );
      return urls.filter(Boolean) as string[];
    },
  });

  const eta = useMemo(() => {
    const c = tracking.data?.courier_location;
    return c && o?.status === "on_the_way" ? estimateEtaMinutes(c, tracking.data!.destination) : null;
  }, [tracking.data, o?.status]);

  if (order.isLoading) return <div className="container max-w-2xl py-8"><Skeleton className="h-96" /></div>;
  if (order.error) return <div className="container max-w-2xl py-8"><ErrorState message={errorMessage(order.error)} onRetry={() => order.refetch()} /></div>;
  if (!o) return <div className="container max-w-2xl py-8"><EmptyState title="Sipariş bulunamadı." /></div>;

  const terminalBad = ["cancelled", "rejected", "failed"].includes(o.status);
  const canCancel = ["pending_payment", "vendor_pending"].includes(o.status);
  const paymentState = params.get("odeme");

  const share = async () => {
    try {
      const token = await rpc<string>("rotate_tracking_token", { p_order_id: o.id });
      const url = `${env.siteUrl}/siparis-takip/${token}`;
      if (navigator.share) await navigator.share({ title: "Kapında sipariş takibi", url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Takip bağlantısı kopyalandı. Önceki bağlantılar geçersiz oldu.");
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error(errorMessage(e));
    }
  };

  const cancel = async () => {
    try {
      await rpc("customer_cancel_order", { p_order_id: o.id, p_reason: reason.trim() || null });
      toast.success("Siparişiniz iptal edildi.");
      setCancelOpen(false);
      refreshOrder();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const retryPayment = async () => {
    try {
      const pay = await invokeFunction<{ payment_page_url: string }>("iyzico-checkout", { order_id: o.id });
      if (pay.payment_page_url?.startsWith("https://")) window.location.assign(pay.payment_page_url);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const reachedAt = (s: string) => order.data?.history.find((h) => h.new_status === s)?.created_at;

  return (
    <div className="container max-w-2xl space-y-6 py-8">
      <PrivatePage title={`Sipariş ${o.order_number}`} />
      <div>
        <Link to="/siparislerim" className="text-sm text-primary">← Siparişlerim</Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-extrabold">{o.vendors?.name}</h1>
          <StatusBadge status={o.status} />
        </div>
        <p className="text-sm text-muted-foreground">{o.order_number} · {formatDateTime(o.created_at)}</p>
      </div>

      {paymentState === "basarisiz" && o.status === "pending_payment" && <ErrorState message="Ödeme tamamlanamadı. Tekrar deneyebilirsiniz." />}
      {paymentState === "basarili" && o.status !== "pending_payment" && <p className="rounded-lg bg-success/10 p-3 text-sm text-success">Teslimat ücreti ödemeniz alındı.</p>}

      {o.status === "pending_payment" && (
        <div className="rounded-xl border border-warning bg-warning/10 p-4">
          <p className="font-semibold">Teslimat ücreti ödemesi bekleniyor ({formatTry(o.delivery_fee_payable)})</p>
          <p className="text-sm text-muted-foreground">Ödeme tamamlanmazsa sipariş 30 dakika içinde otomatik iptal edilir.</p>
          <Button className="mt-3" onClick={retryPayment}><CreditCard aria-hidden /> Ödemeyi tamamla</Button>
        </div>
      )}

      {terminalBad ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive"><XCircle className="h-5 w-5" aria-hidden /> {OrderStatusLabels[o.status]}</p>
          {o.cancel_reason && <p className="mt-1">Açıklama: {o.cancel_reason}</p>}
          {["refund_pending", "refunded"].includes(o.payment_state) && <p className="mt-1">Teslimat ücreti iadesi: {o.payment_state === "refunded" ? "tamamlandı" : "işleme alındı"}.</p>}
        </div>
      ) : o.status !== "pending_payment" && (
        <ol className="space-y-3 rounded-xl border bg-card p-4" aria-label="Sipariş durumu">
          {CUSTOMER_STEPS.map((s) => {
            const done = stepReached(o.status, s.status);
            const at = reachedAt(s.status);
            return (
              <li key={s.status} className="flex items-center gap-3">
                <span className={cn("grid h-7 w-7 place-items-center rounded-full border-2", done ? "border-primary bg-primary text-primary-foreground" : "border-muted")}>
                  {done && <Check className="h-4 w-4" aria-hidden />}
                </span>
                <span className={cn("flex-1 text-sm", done ? "font-semibold" : "text-muted-foreground")}>{s.label}</span>
                {at && <span className="text-xs text-muted-foreground">{formatTime(at)}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {isActive && (
        <>
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Canlı takip {tracking.data?.courier_name && <span className="text-sm font-normal text-muted-foreground">· Kurye: {tracking.data.courier_name}</span>}</h2>
            {tracking.isLoading ? <Skeleton className="h-72" /> : tracking.data && (
              <CourierMapTracker
                vendor={tracking.data.vendor.lat !== null && tracking.data.vendor.lng !== null ? { lat: tracking.data.vendor.lat, lng: tracking.data.vendor.lng } : null}
                destination={tracking.data.destination}
                courier={tracking.data.courier_location ? { lat: tracking.data.courier_location.lat, lng: tracking.data.courier_location.lng, updatedAt: tracking.data.courier_location.updated_at } : null}
                etaMinutes={eta}
              />
            )}
          </section>
          <DeliveryQr orderId={o.id} courierId={o.courier_id} />
        </>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-lg font-bold">Ürünler</h2>
        <ul className="mt-3 divide-y text-sm">
          {order.data?.items.map((it) => (
            <li key={it.id} className="flex justify-between gap-3 py-2">
              <div>
                <p className={cn(it.fulfillment === "removed" && "line-through text-muted-foreground")}>{it.quantity} × {it.product_name}</p>
                {it.fulfillment === "substituted" && <Badge variant="accent">Alternatifle değiştirildi</Badge>}
                {it.fulfillment === "removed" && <Badge variant="muted">Stokta yoktu, çıkarıldı</Badge>}
                {it.fulfillment === "pending" && <p className="text-xs text-muted-foreground">Stokta yoksa: {SubstitutionPreferenceLabels[it.substitution_preference]}</p>}
              </div>
              <span>{formatTry(it.line_total)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <div className="flex justify-between"><span>Ürün toplamı ({ProductPaymentMethodLabels[o.product_payment_method]})</span><strong>{formatTry(o.product_subtotal)}</strong></div>
          <div className="flex justify-between">
            <span>Teslimat ücreti (online) · {Number(o.distance_km).toLocaleString("tr-TR")} km{o.distance_source === "haversine_estimate" ? " (tahmini)" : ""}</span>
            <strong>{o.delivery_fee_waived ? <><s className="mr-1 font-normal text-muted-foreground">{formatTry(o.delivery_fee)}</s>Ücretsiz</> : formatTry(o.delivery_fee_payable)}</strong>
          </div>
        </div>
        {o.customer_note && <p className="mt-3 text-sm text-muted-foreground">Not: {o.customer_note}</p>}
      </section>

      {o.status === "delivered" && <RatingForm orderId={o.id} hasCourier={Boolean(o.courier_id)} />}
      {proofs.data && proofs.data.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-bold">Teslimat fotoğrafı</h2>
          <div className="mt-2 flex gap-2">{proofs.data.map((u) => <img key={u} src={u} alt="Teslimat kanıtı" className="h-32 rounded-lg object-cover" />)}</div>
        </section>
      )}

      <div className="flex flex-wrap gap-2">
        {!terminalBad && o.status !== "delivered" && o.status !== "pending_payment" && <Button variant="outline" onClick={share}><Share2 aria-hidden /> Takip bağlantısı paylaş</Button>}
        {canCancel && <Button variant="destructive" onClick={() => setCancelOpen(true)}><XCircle aria-hidden /> Siparişi iptal et</Button>}
        <Button variant="ghost" asChild><Link to={`/destek?siparis=${o.id}`}><Headphones aria-hidden /> Destek al</Link></Button>
      </div>

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sipariş iptal edilsin mi?</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Ödenen teslimat ücreti iade edilecektir.</p>
          <Textarea placeholder="İptal nedeni (isteğe bağlı)" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setCancelOpen(false)}>Vazgeç</Button>
            <Button variant="destructive" onClick={cancel}>İptal et</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
