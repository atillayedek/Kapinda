import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { supabase, toAppError } from "@/lib/supabase";
import type { Category, CoverageArea, District, Product, Vendor } from "@/types/db";

const VENDOR_COLS = "id, slug, name, business_type, description, logo_path, cover_path, address_text, lat, lng, coverage_area_id, status, is_open, rating_avg, rating_count";

export const BUSINESS_TYPES: Record<string, string> = {
  market: "Market",
  tekel: "Tekel",
  manav: "Manav",
  kasap: "Kasap",
  firin: "Fırın",
  kuruyemis: "Kuruyemiş",
  sarkuteri: "Şarküteri",
  diger: "Diğer",
};

export function useVendors(businessType?: string) {
  return useQuery({
    queryKey: ["vendors", businessType ?? "all"],
    queryFn: async () => {
      let q = supabase.from("vendors").select(VENDOR_COLS).eq("status", "active").is("deleted_at", null).order("is_open", { ascending: false }).order("name");
      if (businessType) q = q.eq("business_type", businessType);
      const { data, error } = await q;
      if (error) throw toAppError(error);
      return (data ?? []) as Vendor[];
    },
  });
}

export function useVendor(slug: string | undefined) {
  return useQuery({
    queryKey: ["vendor", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase.from("vendors").select(VENDOR_COLS).eq("slug", slug!).maybeSingle();
      if (error) throw toAppError(error);
      return data as Vendor | null;
    },
  });
}

export function useVendorOpenNow(vendorId: string | undefined) {
  return useQuery({
    queryKey: ["vendor-open", vendorId],
    enabled: Boolean(vendorId),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("vendor_is_open_now", { p_vendor_id: vendorId! });
      if (error) throw toAppError(error);
      return data === true;
    },
  });
}

export function useCategories() {
  return useQuery({
    queryKey: ["categories"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("categories").select("id, parent_id, name, slug, icon, sort_order, is_age_restricted, is_online_sale_allowed, is_active").eq("is_active", true).order("sort_order");
      if (error) throw toAppError(error);
      return (data ?? []) as Category[];
    },
  });
}

/** Online satışa açık kategoriler (mevzuat gereği kapalı olanlar vitrinde gösterilmez) */
export function sellableCategories(cats: Category[] | undefined): Category[] {
  return (cats ?? []).filter((c) => c.is_online_sale_allowed);
}

export const PRODUCT_COLS =
  "id, vendor_id, category_id, name, description, barcode, price, unit, track_stock, stock_quantity, is_active, is_age_restricted, product_images(storage_path, sort_order), categories(name, slug, is_age_restricted, is_online_sale_allowed)";

export const PAGE_SIZE = 40;

export function useProducts(vendorId: string | undefined, opts: { categoryId?: string; search?: string; page: number }) {
  return useQuery({
    queryKey: ["products", vendorId, opts.categoryId ?? "all", opts.search ?? "", opts.page],
    enabled: Boolean(vendorId),
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let q = supabase
        .from("products")
        .select(PRODUCT_COLS, { count: "exact" })
        .eq("vendor_id", vendorId!)
        .eq("is_active", true)
        .is("deleted_at", null)
        .order("name")
        .range(opts.page * PAGE_SIZE, opts.page * PAGE_SIZE + PAGE_SIZE - 1);
      if (opts.categoryId) q = q.eq("category_id", opts.categoryId);
      if (opts.search && opts.search.trim().length >= 2) q = q.ilike("name", `%${opts.search.trim().replace(/[%_]/g, "")}%`);
      const { data, error, count } = await q;
      if (error) throw toAppError(error);
      const items = ((data ?? []) as unknown as Product[]).filter((p) => p.categories?.is_online_sale_allowed !== false);
      return { items, total: count ?? 0 };
    },
  });
}

export async function findProductByBarcode(vendorId: string, barcode: string): Promise<Product | null> {
  const { data, error } = await supabase
    .from("products")
    .select(PRODUCT_COLS)
    .eq("vendor_id", vendorId)
    .eq("barcode", barcode)
    .eq("is_active", true)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw toAppError(error);
  const p = data as unknown as Product | null;
  return p && p.categories?.is_online_sale_allowed !== false ? p : null;
}

export function useServiceArea() {
  return useQuery({
    queryKey: ["service-areas"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const [{ data: areas, error: e1 }, { data: districts, error: e2 }] = await Promise.all([
        supabase.from("coverage_areas").select("id, district_id, name, slug, center_lat, center_lng, max_radius_km, min_basket_amount, opens_at, closes_at, is_active").eq("is_active", true),
        supabase.from("districts").select("id, name, slug, postal_code, province_id, is_active").eq("is_active", true).order("name"),
      ]);
      if (e1 || e2) throw toAppError(e1 ?? e2);
      return { areas: (areas ?? []) as CoverageArea[], districts: (districts ?? []) as District[] };
    },
  });
}

export function productImage(p: Product): string | null {
  const img = [...(p.product_images ?? [])].sort((a, b) => a.sort_order - b.sort_order)[0];
  return img?.storage_path ?? null;
}
