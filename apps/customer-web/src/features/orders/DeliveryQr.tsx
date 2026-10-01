// Teslimat QR'ı: sunucuda HMAC ile imzalanır, kurye uygulaması okutur. Süresi dolmadan yenilenir.
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { QrCode, RefreshCw } from "lucide-react";
import { invokeFunction } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { ErrorState, Skeleton } from "@/components/ui/misc";

export function DeliveryQr({ orderId, courierId }: { orderId: string; courierId: string | null }) {
  const [img, setImg] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ["delivery-qr", orderId, courierId],
    enabled: Boolean(courierId),
    gcTime: 0,
    staleTime: 0,
    retry: 1,
    queryFn: () => invokeFunction<{ qr: string; expires_at: string }>("issue-delivery-qr", { order_id: orderId }),
  });

  useEffect(() => {
    if (!q.data) return;
    void QRCode.toDataURL(q.data.qr, { errorCorrectionLevel: "M", margin: 2, width: 320 }).then(setImg);
    const ms = new Date(q.data.expires_at).getTime() - Date.now() - 60_000;
    const t = setTimeout(() => void q.refetch(), Math.max(ms, 10_000));
    return () => clearTimeout(t);
  }, [q.data, q]);

  return (
    <div className="rounded-xl border bg-card p-4 text-center">
      <p className="flex items-center justify-center gap-2 font-bold"><QrCode className="h-5 w-5 text-primary" aria-hidden /> Teslimat QR kodunuz</p>
      <p className="mt-1 text-sm text-muted-foreground">Siparişinizi teslim alırken bu kodu yalnızca kuryeye okutun. Kodu başkalarıyla paylaşmayın.</p>
      <div className="mx-auto mt-4 w-64">
        {q.isLoading && <Skeleton className="h-64 w-64" />}
        {q.error && <ErrorState message={errorMessage(q.error)} />}
        {img && !q.isFetching && <img src={img} alt="Teslimat QR kodu" className="h-64 w-64" />}
      </div>
      <Button variant="ghost" size="sm" className="mt-2" onClick={() => void q.refetch()} disabled={q.isFetching}>
        <RefreshCw aria-hidden /> Kodu yenile
      </Button>
    </div>
  );
}
