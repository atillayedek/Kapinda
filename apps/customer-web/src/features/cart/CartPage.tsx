import { useEffect, useRef } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Minus, Plus, ShoppingBasket, Trash2, Package } from "lucide-react";
import { toast } from "sonner";
import { SubstitutionPreferenceLabels, SubstitutionPreferenceValues, type SubstitutionPreference } from "@kapinda/shared-contracts";
import { PrivatePage } from "@/components/seo/SEOHead";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { supabase, storagePublicUrl } from "@/lib/supabase";
import { formatTry } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { useServiceArea, useVendor } from "@/features/vendors/queries";

export function useMinBasket(vendorSlug: string | null) {
  const vendor = useVendor(vendorSlug ?? undefined);
  const areas = useServiceArea();
  const area = areas.data?.areas.find((a) => a.id === vendor.data?.coverage_area_id);
  return { minBasket: area ? Number(area.min_basket_amount) : 250, vendor: vendor.data };
}

export default function CartPage() {
  const cart = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { minBasket } = useMinBasket(cart.vendorSlug);
  const synced = useRef(false);

  // Sepet fiyat/stok bilgisi veritabanından tazelenir (gösterim amaçlı; sunucu siparişte yeniden hesaplar)
  useEffect(() => {
    if (synced.current || cart.lines.length === 0) return;
    synced.current = true;
    (async () => {
      const ids = cart.lines.map((l) => l.productId);
      const { data } = await supabase.from("products").select("id, price, is_active, deleted_at, track_stock, stock_quantity").in("id", ids);
      if (!data) return;
      const map = Object.fromEntries(
        data.map((p) => [p.id, { price: Number(p.price), available: p.is_active && !p.deleted_at && (!p.track_stock || (p.stock_quantity ?? 0) > 0), maxQuantity: p.track_stock ? p.stock_quantity : null }]),
      );
      for (const id of ids) if (!map[id]) map[id] = { price: 0, available: false, maxQuantity: null };
      const changed = cart.syncPrices(map);
      if (changed.length) toast.info(`Sepetiniz güncellendi: ${changed.join(", ")}`);
    })();
  }, [cart]);

  if (cart.lines.length === 0) {
    return (
      <div className="container max-w-2xl py-10">
        <PrivatePage title="Sepet" />
        <EmptyState icon={ShoppingBasket} title="Sepetiniz boş." description="Bir işletme seçerek alışverişe başlayın." action={<Button asChild><Link to="/isletmeler">İşletmeler</Link></Button>} />
      </div>
    );
  }

  const missing = Math.max(0, minBasket - cart.subtotal);
  return (
    <div className="container max-w-2xl py-8">
      <PrivatePage title="Sepet" />
      <h1 className="text-3xl font-extrabold">Sepet</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        <Link to={`/isletme/${cart.vendorSlug}`} className="font-semibold text-primary">{cart.vendorName}</Link> ürünleri
      </p>
      <ul className="mt-6 space-y-3">
        {cart.lines.map((l) => {
          const img = storagePublicUrl("product-images", l.imagePath);
          return (
            <li key={l.productId} className="rounded-xl border bg-card p-3">
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {img ? <img src={img} alt="" className="h-full w-full object-cover" /> : <Package className="m-auto mt-4 h-8 w-8 text-muted-foreground" aria-hidden />}
                </div>
                <div className="flex-1">
                  <p className="font-semibold">{l.name}</p>
                  <p className="text-sm text-muted-foreground">{formatTry(l.unitPrice)} / {l.unit}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Azalt" onClick={() => cart.setQuantity(l.productId, l.quantity - 1)}><Minus /></Button>
                    <span className="w-6 text-center font-semibold">{l.quantity}</span>
                    <Button size="icon" variant="outline" className="h-8 w-8" aria-label="Arttır" disabled={l.quantity >= (l.maxQuantity ?? 99)} onClick={() => cart.setQuantity(l.productId, l.quantity + 1)}><Plus /></Button>
                    <Button size="icon" variant="ghost" className="ml-auto h-8 w-8" aria-label="Kaldır" onClick={() => cart.remove(l.productId)}><Trash2 /></Button>
                  </div>
                </div>
                <p className="font-bold">{formatTry(l.unitPrice * l.quantity)}</p>
              </div>
              <label className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
                Stokta yoksa:
                <NativeSelect className="h-8 sm:w-56" value={l.substitution} onChange={(e) => cart.setSubstitution(l.productId, e.target.value as SubstitutionPreference)}>
                  {SubstitutionPreferenceValues.map((v) => <option key={v} value={v}>{SubstitutionPreferenceLabels[v]}</option>)}
                </NativeSelect>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="mt-6 space-y-3 rounded-xl border bg-card p-4">
        <div className="flex justify-between"><span>Ürün toplamı (kapıda ödenir)</span><strong>{formatTry(cart.subtotal)}</strong></div>
        <p className="text-xs text-muted-foreground">Teslimat ücreti adresinize göre bir sonraki adımda hesaplanır ve online ödenir.</p>
        {missing > 0 && (
          <div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-accent" style={{ width: `${Math.min(100, (cart.subtotal / minBasket) * 100)}%` }} />
            </div>
            <p className="mt-2 text-sm font-medium">Sepet alt limitine ulaşmak için {formatTry(missing)} daha ekleyin.</p>
          </div>
        )}
        <Button className="w-full" size="lg" disabled={missing > 0} onClick={() => navigate(user ? "/checkout" : "/giris?next=/checkout")}>
          Devam et
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => { if (confirm("Sepet temizlensin mi?")) cart.clear(); }}>Sepeti temizle</Button>
      </div>
    </div>
  );
}
