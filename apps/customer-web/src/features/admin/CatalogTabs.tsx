import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { formatTry } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, Td, Th } from "@/components/ui/misc";
import { PageHeader, Pager, QueryState, ReasonDialog, useAdminSelect } from "./shared";

interface ProductRow { id: string; name: string; barcode: string | null; price: number; stock_quantity: number | null; track_stock: boolean; is_active: boolean; is_age_restricted: boolean; vendors: { name: string } | null; categories: { name: string } | null }
const SIZE = 50;

export function ProductsTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useAdminSelect<ProductRow>(["products", search, page], () => {
    let b = supabase.from("products").select("id, name, barcode, price, stock_quantity, track_stock, is_active, is_age_restricted, vendors(name), categories(name)", { count: "exact" })
      .is("deleted_at", null).order("created_at", { ascending: false }).range(page * SIZE, page * SIZE + SIZE - 1);
    if (search.trim()) b = /^\d{13}$/.test(search.trim()) ? b.eq("barcode", search.trim()) : b.ilike("name", `%${search.trim()}%`);
    return b;
  });
  const [target, setTarget] = useState<ProductRow | null>(null);
  return (
    <div>
      <PageHeader title="Ürünler" description="Tüm işletmelerin ürünleri. Ürün içeriği işletmeler tarafından yönetilir; admin yalnız yayından kaldırabilir." actions={<Input className="w-64" placeholder="Ürün adı veya barkod" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />} />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Ürün</Th><Th>İşletme</Th><Th>Kategori</Th><Th>Fiyat</Th><Th>Stok</Th><Th>Durum</Th><Th /></tr></thead>
          <tbody>{q.data?.rows.map((p) => (
            <tr key={p.id}>
              <Td><p className="font-semibold">{p.name} {p.is_age_restricted && <Badge variant="destructive">18+</Badge>}</p><p className="text-xs text-muted-foreground">{p.barcode ?? "barkodsuz"}</p></Td>
              <Td>{p.vendors?.name}</Td><Td>{p.categories?.name}</Td><Td>{formatTry(p.price)}</Td><Td>{p.track_stock ? p.stock_quantity : "takipsiz"}</Td>
              <Td>{p.is_active ? <Badge variant="success">Yayında</Badge> : <Badge variant="muted">Pasif</Badge>}</Td>
              <Td><Button size="sm" variant="outline" onClick={() => setTarget(p)}>{p.is_active ? "Yayından kaldır" : "Yayına al"}</Button></Td>
            </tr>
          ))}</tbody>
        </Table>
        <Pager page={page} total={q.data?.count ?? 0} size={SIZE} onPage={setPage} />
      </QueryState>
      <ReasonDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)} title={target?.name ?? ""} destructive={target?.is_active}
        onConfirm={async (reason) => { await rpc("admin_set_product_active", { p_product_id: target!.id, p_active: !target!.is_active, p_reason: reason }); toast.success("Ürün güncellendi."); void qc.invalidateQueries({ queryKey: ["admin", "products"] }); }} />
    </div>
  );
}

interface Cat { id: string; name: string; slug: string; icon: string | null; sort_order: number; is_age_restricted: boolean; is_online_sale_allowed: boolean; is_active: boolean }

export function CategoriesTab() {
  const qc = useQueryClient();
  const q = useAdminSelect<Cat>(["categories"], () => supabase.from("categories").select("*").order("sort_order"));
  const [edit, setEdit] = useState<Partial<Cat> | null>(null);
  const save = async () => {
    if (!edit?.name || !edit.slug) return;
    const row = { name: edit.name, slug: edit.slug, icon: edit.icon ?? null, sort_order: edit.sort_order ?? 0, is_age_restricted: edit.is_age_restricted ?? false, is_online_sale_allowed: edit.is_online_sale_allowed ?? true, is_active: edit.is_active ?? true };
    const { error } = edit.id ? await supabase.from("categories").update(row).eq("id", edit.id) : await supabase.from("categories").insert(row);
    if (error) toast.error(errorMessage(toAppError(error)));
    else { toast.success("Kategori kaydedildi."); setEdit(null); void qc.invalidateQueries({ queryKey: ["admin", "categories"] }); void qc.invalidateQueries({ queryKey: ["categories"] }); }
  };
  return (
    <div>
      <PageHeader title="Kategoriler" description="Yaş kısıtlı kategoriler ve online satış izni burada yönetilir (değişiklikler audit kaydına yazılır)." actions={<Button onClick={() => setEdit({ is_active: true, is_online_sale_allowed: true, sort_order: 0 })}>Yeni kategori</Button>} />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Sıra</Th><Th>Kategori</Th><Th>Yaş kısıtlı</Th><Th>Online satış</Th><Th>Aktif</Th><Th /></tr></thead>
          <tbody>{q.data?.rows.map((c) => (
            <tr key={c.id}><Td>{c.sort_order}</Td><Td><p className="font-semibold">{c.name}</p><p className="text-xs text-muted-foreground">/{c.slug}</p></Td>
              <Td>{c.is_age_restricted ? <Badge variant="destructive">18+</Badge> : "—"}</Td><Td>{c.is_online_sale_allowed ? "Açık" : <Badge variant="muted">Kapalı</Badge>}</Td><Td>{c.is_active ? "Evet" : "Hayır"}</Td>
              <Td><Button size="sm" variant="outline" onClick={() => setEdit(c)}>Düzenle</Button></Td></tr>
          ))}</tbody>
        </Table>
      </QueryState>
      <Dialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{edit?.id ? "Kategori düzenle" : "Yeni kategori"}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><Label>Ad</Label><Input className="mt-1.5" value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
            <div><Label>Slug</Label><Input className="mt-1.5" value={edit?.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
            <div><Label>Sıra</Label><Input className="mt-1.5" type="number" value={edit?.sort_order ?? 0} onChange={(e) => setEdit({ ...edit, sort_order: Number(e.target.value) })} /></div>
            <label className="flex items-center justify-between gap-2 text-sm">Yaş kısıtlı (18+)<Switch checked={edit?.is_age_restricted ?? false} onCheckedChange={(c) => setEdit({ ...edit, is_age_restricted: c })} /></label>
            <label className="flex items-center justify-between gap-2 text-sm">Online satışa açık<Switch checked={edit?.is_online_sale_allowed ?? true} onCheckedChange={(c) => setEdit({ ...edit, is_online_sale_allowed: c })} /></label>
            <label className="flex items-center justify-between gap-2 text-sm">Aktif<Switch checked={edit?.is_active ?? true} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} /></label>
          </div>
          <p className="text-xs text-muted-foreground">Mevzuat gereği uzaktan satışı yasak ürün kategorileri (alkol, tütün) online satışa açılmamalıdır.</p>
          <DialogFooter><Button onClick={save}>Kaydet</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
