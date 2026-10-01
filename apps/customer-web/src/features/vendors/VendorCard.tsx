import { Link } from "react-router-dom";
import { Star, Store } from "lucide-react";
import type { Vendor } from "@/types/db";
import { storagePublicUrl } from "@/lib/supabase";
import { Badge } from "@/components/ui/badge";
import { BUSINESS_TYPES } from "./queries";

export function VendorCard({ vendor }: { vendor: Vendor }) {
  const logo = storagePublicUrl("vendor-assets", vendor.logo_path);
  const cover = storagePublicUrl("vendor-assets", vendor.cover_path);
  return (
    <Link to={`/isletme/${vendor.slug}`} className="group overflow-hidden rounded-xl border bg-card shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative h-28 bg-secondary">
        {cover && <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />}
        <div className="absolute -bottom-6 left-4 grid h-14 w-14 place-items-center overflow-hidden rounded-xl border-2 border-card bg-card">
          {logo ? <img src={logo} alt="" loading="lazy" className="h-full w-full object-cover" /> : <Store className="h-7 w-7 text-primary" aria-hidden />}
        </div>
      </div>
      <div className="space-y-1 p-4 pt-8">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-bold group-hover:text-primary">{vendor.name}</h3>
          <Badge variant={vendor.is_open ? "success" : "muted"}>{vendor.is_open ? "Açık" : "Kapalı"}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{BUSINESS_TYPES[vendor.business_type] ?? vendor.business_type}</p>
        {vendor.rating_count > 0 && (
          <p className="flex items-center gap-1 text-sm">
            <Star className="h-4 w-4 fill-accent text-accent" aria-hidden />
            {Number(vendor.rating_avg).toFixed(1)} <span className="text-muted-foreground">({vendor.rating_count} değerlendirme)</span>
          </p>
        )}
      </div>
    </Link>
  );
}
