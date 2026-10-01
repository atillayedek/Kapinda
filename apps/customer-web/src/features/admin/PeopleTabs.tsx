import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ApprovalStatusLabels, ApplicationStatusLabels, CourierAvailabilityLabels, IncidentTypeLabels, type ApprovalStatus, type IncidentType } from "@kapinda/shared-contracts";
import { formatTrPhone } from "@kapinda/shared-validation";
import { supabase, rpc } from "@/lib/supabase";
import { formatDateTime } from "@/lib/utils";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, Td, Th } from "@/components/ui/misc";
import { PinPicker } from "@/features/maps/Maps";
import { PageHeader, Pager, QueryState, ReasonDialog, useAdminSelect } from "./shared";
import { BUSINESS_TYPES } from "@/features/vendors/queries";

/* ---------------- Acil durumlar ---------------- */
interface Incident { id: string; incident_type: IncidentType; description: string | null; lat: number | null; lng: number | null; status: string; made_unavailable: boolean; created_at: string; order_id: string | null; couriers: { display_name: string; phone: string } | null }

export function IncidentsTab() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState("open");
  const q = useAdminSelect<Incident>(["incidents", filter], () => {
    let b = supabase.from("courier_incidents").select("*, couriers(display_name, phone)").order("created_at", { ascending: false }).limit(100);
    if (filter === "open") b = b.neq("status", "resolved");
    return b;
  });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["admin", "incidents"] }), [qc]);
  useRealtimeTable({ channel: "admin-incidents", table: "courier_incidents", onChange: refresh });
  const [target, setTarget] = useState<{ id: string; status: "acknowledged" | "resolved" } | null>(null);
  return (
    <div>
      <PageHeader title="Acil durumlar" description="Kurye acil durum bildirimleri (anlık)." actions={
        <NativeSelect className="w-40" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="open">Açık</option><option value="all">Tümü</option></NativeSelect>
      } />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <div className="space-y-3">
          {q.data?.rows.map((i) => (
            <div key={i.id} className={`rounded-xl border bg-card p-4 ${i.status === "open" && i.made_unavailable ? "border-destructive" : ""}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={i.made_unavailable ? "destructive" : "warning"}>{IncidentTypeLabels[i.incident_type]}</Badge>
                <Badge variant="muted">{i.status}</Badge>
                <span className="text-sm text-muted-foreground">{formatDateTime(i.created_at)}</span>
              </div>
              <p className="mt-2 font-semibold">{i.couriers?.display_name} · <a href={`tel:${i.couriers?.phone}`} className="text-primary">{formatTrPhone(i.couriers?.phone)}</a></p>
              {i.description && <p className="text-sm">{i.description}</p>}
              {i.lat !== null && <a className="text-sm text-primary" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${i.lat},${i.lng}`}>Konumu haritada aç</a>}
              {i.order_id && <a className="ml-3 text-sm text-primary" href={`/admin/siparisler?id=${i.order_id}`}>Aktif sipariş</a>}
              {i.status !== "resolved" && (
                <div className="mt-3 flex gap-2">
                  {i.status === "open" && <Button size="sm" variant="outline" onClick={() => setTarget({ id: i.id, status: "acknowledged" })}>Görüldü</Button>}
                  <Button size="sm" onClick={() => setTarget({ id: i.id, status: "resolved" })}>Çözüldü</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      </QueryState>
      <ReasonDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)} title={target?.status === "resolved" ? "Olayı çöz" : "Olayı görüldü işaretle"}
        onConfirm={async (note) => { await rpc("admin_update_incident", { p_incident_id: target!.id, p_status: target!.status, p_note: note }); toast.success("Güncellendi."); refresh(); }} />
    </div>
  );
}

/* ---------------- Kuryeler ---------------- */
interface CourierRow { id: string; display_name: string; phone: string; vehicle_type: string; vehicle_plate: string | null; status: ApprovalStatus; availability: string; max_active_orders: number; active_order_count: number; last_seen_at: string | null; last_location_at: string | null; rating_avg: number; rating_count: number }

export function CouriersTab() {
  const qc = useQueryClient();
  const q = useAdminSelect<CourierRow>(["couriers"], () => supabase.from("couriers").select("*").order("display_name"));
  const [edit, setEdit] = useState<CourierRow | null>(null);
  const [status, setStatus] = useState<ApprovalStatus>("active");
  const [max, setMax] = useState(1);
  return (
    <div>
      <PageHeader title="Kuryeler" description="Müsaitlik, kapasite ve durum yönetimi." />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Kurye</Th><Th>Durum</Th><Th>Müsaitlik</Th><Th>Yük</Th><Th>Son görülme</Th><Th>Puan</Th><Th /></tr></thead>
          <tbody>{q.data?.rows.map((c) => (
            <tr key={c.id}>
              <Td><p className="font-semibold">{c.display_name}</p><p className="text-xs text-muted-foreground">{formatTrPhone(c.phone)} · {c.vehicle_type} {c.vehicle_plate ?? ""}</p></Td>
              <Td><Badge variant={c.status === "active" ? "success" : "muted"}>{ApprovalStatusLabels[c.status]}</Badge></Td>
              <Td>{CourierAvailabilityLabels[c.availability as "offline"]}</Td>
              <Td>{c.active_order_count} / {c.max_active_orders}</Td>
              <Td>{formatDateTime(c.last_seen_at)}</Td>
              <Td>{c.rating_count > 0 ? `${Number(c.rating_avg).toFixed(1)} (${c.rating_count})` : "—"}</Td>
              <Td><Button size="sm" variant="outline" onClick={() => { setEdit(c); setStatus(c.status); setMax(c.max_active_orders); }}>Düzenle</Button></Td>
            </tr>
          ))}</tbody>
        </Table>
      </QueryState>
      <ReasonDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={`Kurye: ${edit?.display_name ?? ""}`}
        onConfirm={async (reason) => { await rpc("admin_set_courier", { p_courier_id: edit!.id, p_status: status, p_max_active_orders: max, p_reason: reason }); toast.success("Kurye güncellendi."); void qc.invalidateQueries({ queryKey: ["admin", "couriers"] }); }}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Durum</Label><NativeSelect className="mt-1.5" value={status} onChange={(e) => setStatus(e.target.value as ApprovalStatus)}>{(["active", "suspended"] as const).map((s) => <option key={s} value={s}>{ApprovalStatusLabels[s]}</option>)}</NativeSelect></div>
          <div><Label>Maks. aktif sipariş</Label><Input className="mt-1.5" type="number" min={1} max={10} value={max} onChange={(e) => setMax(Number(e.target.value))} /></div>
        </div>
      </ReasonDialog>
    </div>
  );
}

/* ---------------- Esnaflar ---------------- */
interface VendorRow { id: string; name: string; slug: string; business_type: string; phone: string; status: ApprovalStatus; is_open: boolean; rating_avg: number; rating_count: number; created_at: string }

export function VendorsTab() {
  const qc = useQueryClient();
  const q = useAdminSelect<VendorRow>(["vendors"], () => supabase.from("vendors").select("id, name, slug, business_type, phone, status, is_open, rating_avg, rating_count, created_at").is("deleted_at", null).order("name"));
  const [target, setTarget] = useState<{ v: VendorRow; status: ApprovalStatus } | null>(null);
  return (
    <div>
      <PageHeader title="Esnaflar" />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>İşletme</Th><Th>Tür</Th><Th>Durum</Th><Th>Açık</Th><Th>Puan</Th><Th /></tr></thead>
          <tbody>{q.data?.rows.map((v) => (
            <tr key={v.id}>
              <Td><a href={`/isletme/${v.slug}`} target="_blank" rel="noreferrer" className="font-semibold text-primary">{v.name}</a><p className="text-xs text-muted-foreground">{formatTrPhone(v.phone)}</p></Td>
              <Td>{BUSINESS_TYPES[v.business_type]}</Td>
              <Td><Badge variant={v.status === "active" ? "success" : "muted"}>{ApprovalStatusLabels[v.status]}</Badge></Td>
              <Td>{v.is_open ? "Evet" : "Hayır"}</Td>
              <Td>{v.rating_count > 0 ? `${Number(v.rating_avg).toFixed(1)} (${v.rating_count})` : "—"}</Td>
              <Td>{v.status === "active"
                ? <Button size="sm" variant="outline" onClick={() => setTarget({ v, status: "suspended" })}>Askıya al</Button>
                : <Button size="sm" onClick={() => setTarget({ v, status: "active" })}>Aktifleştir</Button>}</Td>
            </tr>
          ))}</tbody>
        </Table>
      </QueryState>
      <ReasonDialog open={target !== null} onOpenChange={(o) => !o && setTarget(null)} title={`${target?.v.name}: ${target ? ApprovalStatusLabels[target.status] : ""}`} destructive={target?.status === "suspended"}
        onConfirm={async (reason) => { await rpc("admin_set_vendor_status", { p_vendor_id: target!.v.id, p_status: target!.status, p_reason: reason }); toast.success("İşletme güncellendi."); void qc.invalidateQueries({ queryKey: ["admin", "vendors"] }); }} />
    </div>
  );
}

/* ---------------- Müşteriler ---------------- */
interface UserRow { id: string; full_name: string; email: string | null; phone: string | null; roles: string[]; is_blocked: boolean; created_at: string; delivered_orders: number }
const USIZE = 50;

export function CustomersTab() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const q = useQuery({ queryKey: ["admin", "users", search, page], queryFn: () => rpc<UserRow[]>("admin_list_users", { p_search: search || null, p_limit: USIZE, p_offset: page * USIZE }) });
  const [action, setAction] = useState<{ u: UserRow; kind: "block" | "unblock" | "grant_admin" | "revoke_admin" } | null>(null);
  return (
    <div>
      <PageHeader title="Müşteriler ve kullanıcılar" actions={<Input className="w-64" placeholder="Ad, e-posta veya telefon" value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} />} />
      <QueryState q={q} empty={q.data?.length === 0}>
        <Table>
          <thead><tr><Th>Kullanıcı</Th><Th>Roller</Th><Th>Teslim edilen</Th><Th>Kayıt</Th><Th>Durum</Th><Th /></tr></thead>
          <tbody>{q.data?.map((u) => (
            <tr key={u.id}>
              <Td><p className="font-semibold">{u.full_name || "—"}</p><p className="text-xs text-muted-foreground">{u.email} · {formatTrPhone(u.phone)}</p></Td>
              <Td>{u.roles.join(", ")}</Td><Td>{u.delivered_orders}</Td><Td>{formatDateTime(u.created_at)}</Td>
              <Td>{u.is_blocked ? <Badge variant="destructive">Engelli</Badge> : <Badge variant="success">Aktif</Badge>}</Td>
              <Td className="space-x-1 whitespace-nowrap">
                <Button size="sm" variant="outline" onClick={() => setAction({ u, kind: u.is_blocked ? "unblock" : "block" })}>{u.is_blocked ? "Engeli kaldır" : "Engelle"}</Button>
                <Button size="sm" variant="ghost" onClick={() => setAction({ u, kind: u.roles.includes("admin") ? "revoke_admin" : "grant_admin" })}>{u.roles.includes("admin") ? "Admin yetkisini al" : "Admin yap"}</Button>
              </Td>
            </tr>
          ))}</tbody>
        </Table>
        <div className="mt-4 flex justify-end gap-2">
          <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Önceki</Button>
          <Button size="sm" variant="outline" disabled={(q.data?.length ?? 0) < USIZE} onClick={() => setPage((p) => p + 1)}>Sonraki</Button>
        </div>
      </QueryState>
      <ReasonDialog open={action !== null} onOpenChange={(o) => !o && setAction(null)} destructive title={action ? `${action.u.full_name || action.u.email}: ${{ block: "Engelle", unblock: "Engeli kaldır", grant_admin: "Admin yetkisi ver", revoke_admin: "Admin yetkisini kaldır" }[action.kind]}` : ""}
        onConfirm={async (reason) => {
          const a = action!;
          if (a.kind === "block" || a.kind === "unblock") await rpc("admin_set_user_blocked", { p_user_id: a.u.id, p_blocked: a.kind === "block", p_reason: reason });
          else if (a.kind === "grant_admin") await rpc("admin_grant_role", { p_user_id: a.u.id, p_role: "admin", p_reason: reason });
          else await rpc("admin_revoke_role", { p_user_id: a.u.id, p_role: "admin", p_reason: reason });
          toast.success("İşlem tamamlandı.");
          void qc.invalidateQueries({ queryKey: ["admin", "users"] });
        }} />
    </div>
  );
}

/* ---------------- Başvurular ---------------- */
interface VApp { id: string; business_name: string; business_type: string; owner_name: string; tax_number: string; phone: string; email: string; district_id: string; address: string; notes: string | null; status: string; created_at: string; districts: { name: string } | null }
interface CApp { id: string; full_name: string; phone: string; email: string; district_id: string; vehicle_type: string; has_license: boolean; notes: string | null; status: string; created_at: string; districts: { name: string } | null }

export function ApplicationsTab() {
  const qc = useQueryClient();
  const [kind, setKind] = useState<"vendor" | "courier">("vendor");
  const [status, setStatus] = useState("pending");
  const [page, setPage] = useState(0);
  const vq = useAdminSelect<VApp>(["apps", "vendor", status, page], () => supabase.from("vendor_applications").select("*, districts(name)", { count: "exact" }).eq("status", status).order("created_at").range(page * 20, page * 20 + 19), kind === "vendor");
  const cq = useAdminSelect<CApp>(["apps", "courier", status, page], () => supabase.from("courier_applications").select("*, districts(name)", { count: "exact" }).eq("status", status).order("created_at").range(page * 20, page * 20 + 19), kind === "courier");
  const areas = useQuery({ queryKey: ["admin", "areas-all"], queryFn: async () => (await supabase.from("coverage_areas").select("id, name, district_id")).data ?? [] });
  const [approveV, setApproveV] = useState<VApp | null>(null);
  const [approveC, setApproveC] = useState<CApp | null>(null);
  const [reject, setReject] = useState<{ kind: "vendor" | "courier"; id: string } | null>(null);
  const [areaId, setAreaId] = useState("");
  const [pin, setPin] = useState<{ lat: number; lng: number } | null>(null);
  const [plate, setPlate] = useState("");
  const [maxOrders, setMaxOrders] = useState(1);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "apps"] });
  const q = kind === "vendor" ? vq : cq;
  return (
    <div>
      <PageHeader title="Başvurular" actions={<>
        <NativeSelect className="w-40" value={kind} onChange={(e) => { setKind(e.target.value as "vendor"); setPage(0); }}><option value="vendor">Esnaf</option><option value="courier">Kurye</option></NativeSelect>
        <NativeSelect className="w-40" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}>{(["pending", "approved", "rejected"] as const).map((s) => <option key={s} value={s}>{ApplicationStatusLabels[s]}</option>)}</NativeSelect>
      </>} />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <div className="space-y-3">
          {kind === "vendor" && vq.data?.rows.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-bold">{a.business_name} <span className="font-normal text-muted-foreground">({BUSINESS_TYPES[a.business_type]})</span></p>
              <p>{a.owner_name} · {formatTrPhone(a.phone)} · {a.email} · VKN/TCKN {a.tax_number}</p>
              <p className="text-muted-foreground">{a.districts?.name} · {a.address}</p>
              {a.notes && <p className="mt-1">Not: {a.notes}</p>}
              <p className="text-xs text-muted-foreground">{formatDateTime(a.created_at)}</p>
              {a.status === "pending" && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setApproveV(a); setAreaId(areas.data?.find((x) => x.district_id === a.district_id)?.id ?? ""); setPin(null); }}>Onayla</Button><Button size="sm" variant="outline" onClick={() => setReject({ kind: "vendor", id: a.id })}>Reddet</Button></div>}
            </div>
          ))}
          {kind === "courier" && cq.data?.rows.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-4 text-sm">
              <p className="font-bold">{a.full_name}</p>
              <p>{formatTrPhone(a.phone)} · {a.email} · {a.vehicle_type} · ehliyet: {a.has_license ? "var" : "yok"}</p>
              <p className="text-muted-foreground">{a.districts?.name}</p>
              {a.notes && <p className="mt-1">Not: {a.notes}</p>}
              {a.status === "pending" && <div className="mt-2 flex gap-2"><Button size="sm" onClick={() => { setApproveC(a); setAreaId(areas.data?.find((x) => x.district_id === a.district_id)?.id ?? ""); }}>Onayla</Button><Button size="sm" variant="outline" onClick={() => setReject({ kind: "courier", id: a.id })}>Reddet</Button></div>}
            </div>
          ))}
        </div>
        <Pager page={page} total={q.data?.count ?? 0} size={20} onPage={setPage} />
      </QueryState>
      <ReasonDialog open={approveV !== null} onOpenChange={(o) => !o && setApproveV(null)} title={`Esnaf onayı: ${approveV?.business_name ?? ""}`} confirmLabel="Onayla"
        onConfirm={async (note) => {
          if (!pin) throw new Error("KPD_VENDOR_LOCATION_MISSING");
          await rpc("admin_approve_vendor_application", { p_application_id: approveV!.id, p_coverage_area_id: areaId, p_lat: pin.lat, p_lng: pin.lng, p_note: note });
          toast.success("Esnaf onaylandı."); refresh();
        }}>
        <Label>Hizmet bölgesi</Label>
        <NativeSelect value={areaId} onChange={(e) => setAreaId(e.target.value)}>{areas.data?.filter((x) => x.district_id === approveV?.district_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect>
        <Label>İşletme konumu (harita pini — teslimat mesafesi için zorunlu)</Label>
        <PinPicker value={pin} onChange={setPin} />
      </ReasonDialog>
      <ReasonDialog open={approveC !== null} onOpenChange={(o) => !o && setApproveC(null)} title={`Kurye onayı: ${approveC?.full_name ?? ""}`} confirmLabel="Onayla"
        onConfirm={async (note) => { await rpc("admin_approve_courier_application", { p_application_id: approveC!.id, p_coverage_area_id: areaId, p_max_active_orders: maxOrders, p_vehicle_plate: plate, p_note: note }); toast.success("Kurye onaylandı."); refresh(); }}>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Hizmet bölgesi</Label><NativeSelect className="mt-1.5" value={areaId} onChange={(e) => setAreaId(e.target.value)}>{areas.data?.filter((x) => x.district_id === approveC?.district_id).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</NativeSelect></div>
          <div><Label>Maks. aktif sipariş</Label><Input className="mt-1.5" type="number" min={1} max={10} value={maxOrders} onChange={(e) => setMaxOrders(Number(e.target.value))} /></div>
          <div className="col-span-2"><Label>Plaka (varsa)</Label><Input className="mt-1.5" value={plate} onChange={(e) => setPlate(e.target.value)} /></div>
        </div>
      </ReasonDialog>
      <ReasonDialog open={reject !== null} onOpenChange={(o) => !o && setReject(null)} title="Başvuruyu reddet" destructive
        onConfirm={async (reason) => { await rpc("admin_reject_application", { p_kind: reject!.kind, p_application_id: reject!.id, p_reason: reason }); toast.success("Başvuru reddedildi."); refresh(); }} />
    </div>
  );
}
