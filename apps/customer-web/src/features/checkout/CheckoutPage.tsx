import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Info } from "lucide-react";
import { toast } from "sonner";
import { ProductPaymentMethodLabels, type ProductPaymentMethod } from "@kapinda/shared-contracts";
import { PrivatePage } from "@/components/seo/SEOHead";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useOnline";
import { AddressList } from "@/features/profile/addresses";
import { useMinBasket } from "@/features/cart/CartPage";
import { invokeFunction, rpc, supabase, AppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { formatTry } from "@/lib/utils";
import type { Address, DeliveryQuote } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ErrorState, Skeleton } from "@/components/ui/misc";

interface CreateOrderResult {
  order_id: string;
  order_number: string;
  status: string;
  product_subtotal: number;
  delivery_fee: number;
  delivery_fee_payable: number;
  payment_required: boolean;
  tracking_token: string;
}

export default function CheckoutPage() {
  const cart = useCart();
  const { user } = useAuth();
  const online = useOnline();
  const navigate = useNavigate();
  const { minBasket, vendor } = useMinBasket(cart.vendorSlug);
  const [address, setAddress] = useState<Address | null>(null);
  const [method, setMethod] = useState<ProductPaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [ageOk, setAgeOk] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restricted = useQuery({
    queryKey: ["cart-restricted", cart.lines.map((l) => l.productId).join(",")],
    enabled: cart.lines.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, is_age_restricted").in("id", cart.lines.map((l) => l.productId));
      return (data ?? []).some((p) => p.is_age_restricted);
    },
  });

  const quote = useQuery({
    queryKey: ["quote", vendor?.id, address?.id],
    enabled: Boolean(vendor?.id && address?.id) && online,
    retry: false,
    staleTime: 5 * 60_000,
    queryFn: () => invokeFunction<DeliveryQuote>("calculate-delivery-fee", { vendor_id: vendor!.id, address_id: address!.id }),
  });

  // Teklif süresi dolmadan önce yenilenir
  useEffect(() => {
    if (!quote.data) return;
    const ms = new Date(quote.data.expires_at).getTime() - Date.now() - 30_000;
    const t = setTimeout(() => void quote.refetch(), Math.max(ms, 5_000));
    return () => clearTimeout(t);
  }, [quote]);

  const missing = Math.max(0, minBasket - cart.subtotal);
  const canSubmit = useMemo(
    () => online && !submitting && quote.data && address && missing === 0 && (!restricted.data || ageOk),
    [online, submitting, quote.data, address, missing, restricted.data, ageOk],
  );

  const placeOrder = useCallback(async () => {
    if (!quote.data || !address) return;
    if (!navigator.onLine) {
      setError("İnternet bağlantısı yok. Sipariş oluşturmak için bağlantı gereklidir.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await rpc<CreateOrderResult>("create_order", {
        p_delivery_fee_id: quote.data.quote_id,
        p_items: cart.lines.map((l) => ({ product_id: l.productId, quantity: l.quantity, substitution: l.substitution })),
        p_product_payment_method: method,
        p_customer_note: note.trim() || null,
        p_age_confirmed: ageOk,
      });
      cart.clear();
      if (res.payment_required) {
        const pay = await invokeFunction<{ payment_page_url: string }>("iyzico-checkout", { order_id: res.order_id });
        if (!pay.payment_page_url?.startsWith("https://")) throw new AppError("KPD_PAYMENT_PROVIDER_ERROR");
        window.location.assign(pay.payment_page_url);
        return;
      }
      toast.success("Siparişiniz alındı. Bu siparişte teslimat ücretsiz!");
      navigate(`/siparislerim/${res.order_id}`, { replace: true });
    } catch (e) {
      if (e instanceof AppError && ["KPD_QUOTE_EXPIRED", "KPD_QUOTE_USED"].includes(e.code)) void quote.refetch();
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }, [quote, address, cart, method, note, ageOk, navigate]);

  if (cart.lines.length === 0 && !submitting) return <Navigate to="/sepet" replace />;

  return (
    <div className="container max-w-2xl py-8">
      <PrivatePage title="Siparişi tamamla" />
      <h1 className="text-3xl font-extrabold">Siparişi tamamla</h1>
      <p className="mt-1 text-sm text-muted-foreground">{cart.vendorName} · {cart.itemCount} ürün</p>

      <section className="mt-6 space-y-3">
        <h2 className="text-lg font-bold">1. Teslimat adresi</h2>
        <AddressList selectable selectedId={address?.id} onSelect={setAddress} />
      </section>

      <section className="mt-8 space-y-3">
        <h2 className="text-lg font-bold">2. Ürün bedeli ödeme yöntemi (kapıda)</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {(["cash", "card_on_delivery"] as const).map((m) => (
            <label key={m} className={`flex cursor-pointer items-center gap-3 rounded-xl border bg-card p-4 ${method === m ? "border-primary ring-2 ring-primary/30" : ""}`}>
              <input type="radio" name="method" className="accent-[hsl(var(--primary))]" checked={method === m} onChange={() => setMethod(m)} />
              {ProductPaymentMethodLabels[m]}
            </label>
          ))}
        </div>
        <Label htmlFor="note">Sipariş notu (isteğe bağlı)</Label>
        <Textarea id="note" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Örn. zile basmayın" />
      </section>

      <section className="mt-8 space-y-3 rounded-xl border bg-card p-4">
        <h2 className="text-lg font-bold">3. Özet</h2>
        <div className="flex justify-between text-sm"><span>Ürünler (kapıda ödenecek)</span><span className="font-semibold">{formatTry(cart.subtotal)}</span></div>
        {!address && <p className="text-sm text-muted-foreground">Teslimat ücreti için adres seçin.</p>}
        {address && quote.isLoading && <Skeleton className="h-6" />}
        {quote.error && <ErrorState message={errorMessage(quote.error)} onRetry={() => quote.refetch()} />}
        {quote.data && (
          <>
            <div className="flex justify-between text-sm">
              <span>Teslimat ücreti (online ödenecek) · {quote.data.distance_km.toLocaleString("tr-TR")} km</span>
              <span className="font-semibold">{formatTry(quote.data.fee)}</span>
            </div>
            {quote.data.is_estimated && (
              <p className="flex items-start gap-2 rounded-lg bg-warning/15 p-2 text-xs">
                <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Harita servisine şu an ulaşılamadığı için mesafe tahmini (kuş uçuşu) olarak hesaplandı.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Sadakat ödülünüz varsa teslimat ücreti sipariş oluşturulurken otomatik olarak sıfırlanır.</p>
            <div className="border-t pt-3 text-sm">
              <div className="flex justify-between"><span>Şimdi online ödenecek</span><strong>{formatTry(quote.data.fee)}</strong></div>
              <div className="flex justify-between"><span>Teslimatta kapıda ödenecek</span><strong>{formatTry(cart.subtotal)}</strong></div>
            </div>
          </>
        )}
        {missing > 0 && <p className="text-sm font-medium text-destructive">Sepet alt limitine ulaşmak için {formatTry(missing)} daha ekleyin.</p>}
        {restricted.data && (
          <div className="flex items-start gap-2 rounded-lg bg-destructive/5 p-3">
            <Checkbox id="age" checked={ageOk} onCheckedChange={(c) => setAgeOk(c === true)} />
            <Label htmlFor="age" className="text-sm font-normal">Sepetimde yaş sınırlı ürün olduğunu biliyorum ve 18 yaşından büyüğüm. Teslimatta kimlik gösterilmesi istenebilir.</Label>
          </div>
        )}
        {!online && <p className="flex items-center gap-2 text-sm text-destructive"><AlertTriangle className="h-4 w-4" aria-hidden /> İnternet bağlantısı yok. Sipariş oluşturulamaz.</p>}
        {error && <ErrorState message={error} />}
        <Button size="lg" className="w-full" disabled={!canSubmit} onClick={placeOrder}>
          {submitting ? "İşleniyor…" : quote.data ? `Siparişi onayla ve ${formatTry(quote.data.fee)} öde` : "Siparişi onayla"}
        </Button>
        <p className="text-xs text-muted-foreground">
          Ödeme iyzico güvenli ödeme sayfasında yapılır. Onaylayarak <Link to="/yasal/kullanici_sozlesmesi" className="underline">Kullanıcı Sözleşmesi</Link>'ni kabul etmiş olursunuz. Hesap: {user?.email}
        </p>
      </section>
    </div>
  );
}
