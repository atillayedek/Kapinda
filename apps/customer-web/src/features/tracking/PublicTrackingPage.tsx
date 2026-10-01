// Kimlik doğrulaması olmadan, tahmin edilemez token ile asgari takip bilgisi (telefon/adres gösterilmez).
import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { OrderStatus } from "@kapinda/shared-contracts";
import { PrivatePage } from "@/components/seo/SEOHead";
import { rpc } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { formatTime } from "@/lib/utils";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { StatusBadge, CUSTOMER_STEPS, stepReached } from "@/features/orders/StatusBadge";
import { CourierMapTracker } from "@/features/maps/Maps";
import { cn } from "@/lib/utils";

interface PublicTracking {
  order_number: string;
  status: OrderStatus;
  vendor_name: string;
  courier_name: string | null;
  courier_location: { lat: number; lng: number; updated_at: string } | null;
  timeline: Record<string, string | null>;
}

export default function PublicTrackingPage() {
  const { token = "" } = useParams();
  const q = useQuery({
    queryKey: ["public-track", token],
    refetchInterval: (query) => (query.state.data && ["delivered", "cancelled", "rejected", "failed"].includes(query.state.data.status) ? false : 15_000),
    queryFn: () => rpc<PublicTracking | null>("public_track_order", { p_token: token }),
  });
  return (
    <div className="container max-w-xl space-y-4 py-8">
      <PrivatePage title="Sipariş takibi" />
      <h1 className="text-2xl font-extrabold">Sipariş takibi</h1>
      {q.isLoading && <Skeleton className="h-64" />}
      {q.error && <ErrorState message={errorMessage(q.error)} />}
      {q.isSuccess && !q.data && <EmptyState title="Takip bağlantısı geçersiz veya süresi dolmuş." />}
      {q.data && (
        <>
          <div className="rounded-xl border bg-card p-4">
            <p className="font-bold">{q.data.vendor_name}</p>
            <p className="text-sm text-muted-foreground">{q.data.order_number}</p>
            <div className="mt-2"><StatusBadge status={q.data.status} /></div>
            {q.data.courier_name && <p className="mt-2 text-sm">Kurye: {q.data.courier_name}</p>}
          </div>
          <ol className="space-y-2 rounded-xl border bg-card p-4">
            {CUSTOMER_STEPS.map((s) => (
              <li key={s.status} className={cn("flex justify-between text-sm", stepReached(q.data!.status, s.status) ? "font-semibold" : "text-muted-foreground")}>
                {s.label}
              </li>
            ))}
            {q.data.timeline.delivered_at && <li className="text-xs text-muted-foreground">Teslim: {formatTime(q.data.timeline.delivered_at)}</li>}
          </ol>
          {q.data.courier_location && (
            <CourierMapTracker vendor={null} destination={q.data.courier_location} courier={q.data.courier_location} etaMinutes={null} />
          )}
        </>
      )}
    </div>
  );
}
