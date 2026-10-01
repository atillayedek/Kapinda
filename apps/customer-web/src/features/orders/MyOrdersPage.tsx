import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { ReceiptText, ChevronRight } from "lucide-react";
import { PrivatePage } from "@/components/seo/SEOHead";
import { supabase, toAppError } from "@/lib/supabase";
import { useAuth } from "@/hooks/useAuth";
import { errorMessage } from "@/lib/errorMessages";
import { formatDateTime, formatTry } from "@/lib/utils";
import type { Order } from "@/types/db";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { StatusBadge } from "./StatusBadge";

const PAGE = 20;

export default function MyOrdersPage() {
  const { user } = useAuth();
  const [page, setPage] = useState(0);
  const q = useQuery({
    queryKey: ["my-orders", user?.id, page],
    enabled: Boolean(user),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from("orders")
        .select("id, order_number, status, product_subtotal, delivery_fee_payable, created_at, item_count, vendors(name, slug, logo_path)", { count: "exact" })
        .eq("customer_id", user!.id)
        .order("created_at", { ascending: false })
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw toAppError(error);
      return { items: (data ?? []) as unknown as Order[], total: count ?? 0 };
    },
  });
  return (
    <div className="container max-w-2xl py-8">
      <PrivatePage title="Siparişlerim" />
      <h1 className="text-3xl font-extrabold">Siparişlerim</h1>
      <div className="mt-6 space-y-3">
        {q.isLoading && <Skeleton className="h-24" />}
        {q.error && <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />}
        {q.data && q.data.items.length === 0 && <EmptyState icon={ReceiptText} title="Henüz sipariş bulunmuyor." action={<Button asChild><Link to="/isletmeler">Sipariş ver</Link></Button>} />}
        {q.data?.items.map((o) => (
          <Link key={o.id} to={`/siparislerim/${o.id}`} className="flex items-center gap-3 rounded-xl border bg-card p-4 hover:border-primary">
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-bold">{o.vendors?.name}</p>
                <StatusBadge status={o.status} />
              </div>
              <p className="text-sm text-muted-foreground">{o.order_number} · {formatDateTime(o.created_at)} · {o.item_count} ürün</p>
              <p className="text-sm">{formatTry(o.product_subtotal)} + teslimat {formatTry(o.delivery_fee_payable)}</p>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
          </Link>
        ))}
        {q.data && q.data.total > PAGE && (
          <div className="flex items-center justify-center gap-3">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
            <span className="text-sm">{page + 1} / {Math.ceil(q.data.total / PAGE)}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * PAGE >= q.data.total} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
          </div>
        )}
      </div>
    </div>
  );
}
