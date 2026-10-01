import { useSearchParams } from "react-router-dom";
import { Store } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbLd } from "@/components/seo/structuredData";
import { BUSINESS_TYPES, useVendors } from "./queries";
import { VendorCard } from "./VendorCard";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/errorMessages";
import { cn } from "@/lib/utils";

export default function VendorsPage() {
  const [params, setParams] = useSearchParams();
  const type = params.get("tur") ?? undefined;
  const { data, isLoading, error, refetch } = useVendors(type);
  return (
    <div className="container py-8">
      <SEOHead
        title="Hopa'daki işletmeler"
        description="Hopa'daki market, manav, kasap ve fırınlardan online sipariş verin. Kapında kapınıza getirsin."
        path="/isletmeler"
        jsonLd={breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "İşletmeler", path: "/isletmeler" }])}
      />
      <h1 className="text-3xl font-extrabold">İşletmeler</h1>
      <p className="mt-1 text-muted-foreground">Sipariş vermek için bir işletme seçin.</p>
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2" role="tablist" aria-label="İşletme türü">
        {[["", "Tümü"], ...Object.entries(BUSINESS_TYPES)].map(([k, label]) => (
          <button
            key={k}
            role="tab"
            aria-selected={(type ?? "") === k}
            onClick={() => setParams(k ? { tur: k } : {})}
            className={cn("whitespace-nowrap rounded-full border px-4 py-1.5 text-sm", (type ?? "") === k ? "border-primary bg-primary text-primary-foreground" : "bg-card")}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="mt-6">
        {isLoading && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-52" />)}
          </div>
        )}
        {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />}
        {data && data.length === 0 && <EmptyState icon={Store} title="Henüz işletme bulunmuyor." description="Bölgenizdeki işletmeler katıldıkça burada listelenecek." />}
        {data && data.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.map((v) => <VendorCard key={v.id} vendor={v} />)}
          </div>
        )}
      </div>
    </div>
  );
}
