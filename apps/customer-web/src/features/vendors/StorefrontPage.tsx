import { useCallback, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { MapPin, ScanBarcode, Search, Star, Store, Clock } from "lucide-react";
import { toast } from "sonner";
import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbLd, groceryStoreLd } from "@/components/seo/structuredData";
import { findProductByBarcode, sellableCategories, useCategories, useProducts, useServiceArea, useVendor, useVendorOpenNow, PAGE_SIZE, productImage, BUSINESS_TYPES } from "./queries";
import { ProductCard } from "./ProductCard";
import { BarcodeScanner } from "./BarcodeScanner";
import { useCart } from "@/hooks/useCart";
import type { Product } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/errorMessages";
import { storagePublicUrl } from "@/lib/supabase";
import { cn, formatTry } from "@/lib/utils";

export default function StorefrontPage() {
  const { slug } = useParams();
  const vendorQ = useVendor(slug);
  const vendor = vendorQ.data;
  const openQ = useVendorOpenNow(vendor?.id);
  const cats = useCategories();
  const area = useServiceArea();
  const cart = useCart();
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [scanOpen, setScanOpen] = useState(false);
  const [pending, setPending] = useState<Product | null>(null);
  const products = useProducts(vendor?.id, { categoryId, search, page });
  const minBasket = area.data?.areas.find((a) => a.id === vendor?.coverage_area_id)?.min_basket_amount;

  const addToCart = useCallback(
    (p: Product, replace = false) => {
      if (!vendor) return;
      const res = cart.add(
        { id: vendor.id, name: vendor.name, slug: vendor.slug },
        { productId: p.id, name: p.name, unitPrice: Number(p.price), unit: p.unit, imagePath: productImage(p), maxQuantity: p.track_stock ? p.stock_quantity : null },
        replace,
      );
      if (res === "conflict") setPending(p);
      else toast.success(`${p.name} sepete eklendi.`);
    },
    [cart, vendor],
  );

  const onBarcode = useCallback(
    async (code: string) => {
      setScanOpen(false);
      if (!vendor) return;
      try {
        const p = await findProductByBarcode(vendor.id, code);
        if (!p) toast.error("Bu barkoda ait ürün bulunamadı.");
        else addToCart(p);
      } catch (e) {
        toast.error(errorMessage(e));
      }
    },
    [vendor, addToCart],
  );

  if (vendorQ.isLoading) return <div className="container py-8"><Skeleton className="h-48" /></div>;
  if (vendorQ.error) return <div className="container py-8"><ErrorState message={errorMessage(vendorQ.error)} onRetry={() => vendorQ.refetch()} /></div>;
  if (!vendor) return <div className="container py-8"><EmptyState icon={Store} title="İşletme bulunamadı." action={<Button asChild><Link to="/isletmeler">İşletmelere dön</Link></Button>} /></div>;

  const openNow = openQ.data === true;
  const visibleCats = sellableCategories(cats.data);
  const cover = storagePublicUrl("vendor-assets", vendor.cover_path);
  const qtyOf = (id: string) => (cart.vendorId === vendor.id ? cart.lines.find((l) => l.productId === id)?.quantity ?? 0 : 0);
  const totalPages = Math.ceil((products.data?.total ?? 0) / PAGE_SIZE);

  return (
    <div>
      <SEOHead
        title={`${vendor.name} — Hopa online sipariş`}
        description={`${vendor.name} (${BUSINESS_TYPES[vendor.business_type] ?? "işletme"}) ürünlerini Kapında ile sipariş verin, kapınıza gelsin.`}
        path={`/isletme/${vendor.slug}`}
        image={cover ?? undefined}
        jsonLd={[groceryStoreLd(vendor), breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "İşletmeler", path: "/isletmeler" }, { name: vendor.name, path: `/isletme/${vendor.slug}` }])]}
      />
      <section className="border-b bg-card">
        <div className="container py-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="text-3xl font-extrabold">{vendor.name}</h1>
              <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground"><MapPin className="h-4 w-4" aria-hidden /> {vendor.address_text}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <Badge variant={openNow ? "success" : "muted"}><Clock className="mr-1 h-3 w-3" aria-hidden />{openNow ? "Şu an açık" : "Şu an kapalı"}</Badge>
                {vendor.rating_count > 0 && (
                  <span className="flex items-center gap-1"><Star className="h-4 w-4 fill-accent text-accent" aria-hidden /> {Number(vendor.rating_avg).toFixed(1)} ({vendor.rating_count})</span>
                )}
                {minBasket !== undefined && <span className="text-muted-foreground">Minimum sepet: {formatTry(minBasket)}</span>}
              </div>
            </div>
            <Button variant="outline" onClick={() => setScanOpen(true)}><ScanBarcode aria-hidden /> Barkodla ekle</Button>
          </div>
          {vendor.description && <p className="mt-3 max-w-2xl text-sm">{vendor.description}</p>}
          {!openNow && openQ.isSuccess && <p className="mt-3 rounded-lg bg-warning/15 p-3 text-sm">İşletme şu anda sipariş almıyor. Sepetinizi hazırlayabilir, işletme açıldığında sipariş verebilirsiniz.</p>}
        </div>
      </section>

      <div className="container py-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input className="pl-9" placeholder={`${vendor.name} içinde ara`} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} aria-label="Ürün ara" />
        </div>
        <div className="mt-4 flex gap-2 overflow-x-auto pb-2">
          <button onClick={() => { setCategoryId(undefined); setPage(0); }} className={cn("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm", !categoryId ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>Tümü</button>
          {visibleCats.map((c) => (
            <button key={c.id} onClick={() => { setCategoryId(c.id); setPage(0); }} className={cn("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm", categoryId === c.id ? "border-primary bg-primary text-primary-foreground" : "bg-card")}>
              {c.name}
            </button>
          ))}
        </div>
        <div className="mt-4">
          {products.isLoading && <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">{Array.from({ length: 10 }, (_, i) => <Skeleton key={i} className="h-64" />)}</div>}
          {products.error && <ErrorState message={errorMessage(products.error)} onRetry={() => products.refetch()} />}
          {products.data && products.data.items.length === 0 && <EmptyState title="Henüz ürün eklenmemiş." description={search ? "Aramanızla eşleşen ürün yok." : "Bu işletme ürünlerini ekledikçe burada görünecek."} />}
          {products.data && products.data.items.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {products.data.items.map((p) => (
                <ProductCard key={p.id} product={p} quantity={qtyOf(p.id)} onAdd={() => addToCart(p)} onChange={(q) => cart.setQuantity(p.id, q)} />
              ))}
            </div>
          )}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
              <span className="text-sm">{page + 1} / {totalPages}</span>
              <Button variant="outline" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
            </div>
          )}
        </div>
      </div>

      <Dialog open={scanOpen} onOpenChange={setScanOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Barkod okut</DialogTitle>
            <DialogDescription>Ürünün EAN-13 barkodunu kameraya gösterin.</DialogDescription>
          </DialogHeader>
          {scanOpen && <BarcodeScanner onDetected={onBarcode} />}
        </DialogContent>
      </Dialog>

      <Dialog open={pending !== null} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>İşletme değiştirilsin mi?</DialogTitle>
            <DialogDescription>
              Sepetinizde {cart.vendorName} ürünleri var. İşletme değiştirildiğinde mevcut sepetiniz temizlenecektir.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPending(null)}>Vazgeç</Button>
            <Button onClick={() => { if (pending) addToCart(pending, true); setPending(null); }}>Sepeti temizle ve ekle</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
