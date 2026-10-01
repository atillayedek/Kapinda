import { Minus, Plus, Package } from "lucide-react";
import type { Product } from "@/types/db";
import { storagePublicUrl } from "@/lib/supabase";
import { formatTry } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { productImage } from "./queries";

export function ProductCard({ product, quantity, onAdd, onChange, disabled }: {
  product: Product;
  quantity: number;
  onAdd: () => void;
  onChange: (q: number) => void;
  disabled?: boolean;
}) {
  const img = storagePublicUrl("product-images", productImage(product));
  const outOfStock = product.track_stock && (product.stock_quantity ?? 0) <= 0;
  const max = product.track_stock ? Math.min(product.stock_quantity ?? 0, 99) : 99;
  return (
    <article className="flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm">
      <div className="relative aspect-square bg-muted">
        {img ? (
          <img src={img} alt={product.name} loading="lazy" decoding="async" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full place-items-center text-muted-foreground"><Package className="h-10 w-10" aria-hidden /></div>
        )}
        {product.is_age_restricted && <Badge variant="destructive" className="absolute left-2 top-2">18+</Badge>}
        {outOfStock && <Badge variant="muted" className="absolute right-2 top-2">Tükendi</Badge>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h3 className="line-clamp-2 text-sm font-semibold">{product.name}</h3>
        {product.description && <p className="line-clamp-2 text-xs text-muted-foreground">{product.description}</p>}
        <p className="mt-auto pt-1 font-bold text-primary">
          {formatTry(product.price)} <span className="text-xs font-normal text-muted-foreground">/ {product.unit}</span>
        </p>
        {quantity > 0 ? (
          <div className="flex items-center justify-between rounded-lg border">
            <Button size="icon" variant="ghost" aria-label="Azalt" onClick={() => onChange(quantity - 1)}><Minus /></Button>
            <span className="font-semibold" aria-live="polite">{quantity}</span>
            <Button size="icon" variant="ghost" aria-label="Arttır" disabled={quantity >= max} onClick={() => onChange(quantity + 1)}><Plus /></Button>
          </div>
        ) : (
          <Button size="sm" onClick={onAdd} disabled={disabled || outOfStock}>
            <Plus aria-hidden /> Sepete ekle
          </Button>
        )}
      </div>
    </article>
  );
}
