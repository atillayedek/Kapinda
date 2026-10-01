// Bölgedeki açık işletmelerde ürün arama; sonuçtan ilgili işletme vitrinine gidilir (karışık sepet yok).
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";
import { Input } from "@/components/ui/input";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { supabase, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { formatTry } from "@/lib/utils";

interface Hit { id: string; name: string; price: number; unit: string; vendors: { name: string; slug: string } | null; categories: { is_online_sale_allowed: boolean } | null }

export default function SearchPage() {
  const [term, setTerm] = useState("");
  const q = term.trim().replace(/[%_,()]/g, "");
  const results = useQuery({
    queryKey: ["search", q],
    enabled: q.length >= 2,
    queryFn: async () => {
      const [vendors, products] = await Promise.all([
        supabase.from("vendors").select("id, name, slug").eq("status", "active").ilike("name", `%${q}%`).limit(10),
        supabase.from("products").select("id, name, price, unit, vendors!inner(name, slug, status), categories(is_online_sale_allowed)").eq("is_active", true).is("deleted_at", null).eq("vendors.status", "active").ilike("name", `%${q}%`).limit(40),
      ]);
      if (vendors.error || products.error) throw toAppError(vendors.error ?? products.error);
      return {
        vendors: vendors.data ?? [],
        products: ((products.data ?? []) as unknown as Hit[]).filter((p) => p.categories?.is_online_sale_allowed !== false),
      };
    },
  });
  return (
    <div className="container max-w-3xl py-8">
      <SEOHead title="Ara" description="Hopa'daki işletmelerde ürün ve işletme arayın." path="/ara" />
      <h1 className="text-3xl font-extrabold">Ara</h1>
      <div className="relative mt-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input autoFocus className="h-12 pl-9" placeholder="Ürün veya işletme ara (en az 2 harf)" value={term} onChange={(e) => setTerm(e.target.value)} aria-label="Ara" />
      </div>
      <div className="mt-6 space-y-6">
        {q.length < 2 && <EmptyState icon={Search} title="Ne aramak istersiniz?" description="Örneğin ekmek, süt veya işletme adı." />}
        {results.isLoading && <Skeleton className="h-40" />}
        {results.error && <ErrorState message={errorMessage(results.error)} />}
        {results.data && results.data.vendors.length === 0 && results.data.products.length === 0 && <EmptyState title="Sonuç bulunamadı." />}
        {results.data && results.data.vendors.length > 0 && (
          <div>
            <h2 className="mb-2 font-bold">İşletmeler</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {results.data.vendors.map((v) => <li key={v.id}><Link to={`/isletme/${v.slug}`} className="block p-3 hover:bg-muted">{v.name}</Link></li>)}
            </ul>
          </div>
        )}
        {results.data && results.data.products.length > 0 && (
          <div>
            <h2 className="mb-2 font-bold">Ürünler</h2>
            <ul className="divide-y rounded-xl border bg-card">
              {results.data.products.map((p) => (
                <li key={p.id}>
                  <Link to={`/isletme/${p.vendors?.slug}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted">
                    <span><span className="font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.vendors?.name}</span></span>
                    <span className="font-semibold text-primary">{formatTry(p.price)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
