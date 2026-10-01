import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { HealthStatusLabels, SeoErrorCodeLabels, type HealthStatus, type SeoErrorCode } from "@kapinda/shared-contracts";
import { supabase, rpc, invokeFunction, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { downloadCsv, formatDateTime, formatTry } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Table, Td, Th } from "@/components/ui/misc";
import { PinPicker } from "@/features/maps/Maps";
import { PageHeader, Pager, QueryState, ReasonDialog, StatTile, useAdminSelect } from "./shared";

/* ---------------- Coverage + fiyatlandırma ---------------- */
interface Area { id: string; district_id: string; name: string; slug: string; center_lat: number; center_lng: number; max_radius_km: number; min_basket_amount: number; pricing_rule_id: string; opens_at: string; closes_at: string; is_active: boolean }
interface Rule { id: string; name: string; current_version_id: string | null; pricing_rule_versions: Array<{ id: string; version: number; base_fee: number; base_distance_km: number; per_km_fee: number; max_distance_km: number; created_at: string; change_reason: string | null }> }

export function CoverageTab() {
  const qc = useQueryClient();
  const data = useQuery({
    queryKey: ["admin", "coverage"],
    queryFn: async () => {
      const [p, d, a, r] = await Promise.all([
        supabase.from("provinces").select("id, name, is_active").order("name"),
        supabase.from("districts").select("id, name, province_id, postal_code, is_active").order("name"),
        supabase.from("coverage_areas").select("*").order("name"),
        supabase.from("pricing_rules").select("id, name, current_version_id, pricing_rule_versions(id, version, base_fee, base_distance_km, per_km_fee, max_distance_km, created_at, change_reason)"),
      ]);
      const err = p.error ?? d.error ?? a.error ?? r.error;
      if (err) throw toAppError(err);
      return { provinces: p.data ?? [], districts: d.data ?? [], areas: (a.data ?? []) as Area[], rules: (r.data ?? []) as Rule[] };
    },
  });
  const [edit, setEdit] = useState<Partial<Area> | null>(null);
  const [price, setPrice] = useState<{ ruleId: string; base_fee: number; base_distance_km: number; per_km_fee: number; max_distance_km: number } | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "coverage"] });
  return (
    <div>
      <PageHeader title="Coverage" description="İl → ilçe → hizmet bölgesi. Yeni ilçeler (Arhavi, Borçka, Artvin Merkez…) bölge tanımlanıp aktifleştirilerek açılır." actions={<Button onClick={() => setEdit({ is_active: false, opens_at: "09:00", closes_at: "23:00", max_radius_km: 15, min_basket_amount: 250 })}>Yeni bölge</Button>} />
      <QueryState q={data}>
        <h2 className="mb-2 font-bold">Hizmet bölgeleri</h2>
        <Table>
          <thead><tr><Th>Bölge</Th><Th>İlçe</Th><Th>Saatler</Th><Th>Yarıçap</Th><Th>Min. sepet</Th><Th>Durum</Th><Th /></tr></thead>
          <tbody>{data.data?.areas.map((a) => (
            <tr key={a.id}><Td className="font-semibold">{a.name}</Td><Td>{data.data?.districts.find((d) => d.id === a.district_id)?.name}</Td><Td>{a.opens_at.slice(0, 5)}–{a.closes_at.slice(0, 5)}</Td><Td>{a.max_radius_km} km</Td><Td>{formatTry(a.min_basket_amount)}</Td>
              <Td>{a.is_active ? <Badge variant="success">Aktif</Badge> : <Badge variant="muted">Pasif</Badge>}</Td><Td><Button size="sm" variant="outline" onClick={() => setEdit(a)}>Düzenle</Button></Td></tr>
          ))}</tbody>
        </Table>
        <h2 className="mb-2 mt-8 font-bold">Teslimat fiyatlandırması (versiyonlu)</h2>
        {data.data?.rules.map((r) => {
          const versions = [...r.pricing_rule_versions].sort((x, y) => y.version - x.version);
          const cur = versions.find((v) => v.id === r.current_version_id);
          return (
            <div key={r.id} className="mb-4 rounded-xl border bg-card p-4 text-sm">
              <div className="flex items-center justify-between"><p className="font-semibold">{r.name}</p>
                <Button size="sm" variant="outline" onClick={() => cur && setPrice({ ruleId: r.id, base_fee: Number(cur.base_fee), base_distance_km: Number(cur.base_distance_km), per_km_fee: Number(cur.per_km_fee), max_distance_km: Number(cur.max_distance_km) })}>Yeni sürüm</Button></div>
              <ul className="mt-2 space-y-1">{versions.map((v) => (
                <li key={v.id} className={v.id === r.current_version_id ? "font-semibold" : "text-muted-foreground"}>
                  v{v.version}: 0–{v.base_distance_km} km {formatTry(v.base_fee)}, sonrası +{formatTry(v.per_km_fee)}/km, en fazla {v.max_distance_km} km · {formatDateTime(v.created_at)}{v.id === r.current_version_id ? " (geçerli)" : ""}{v.change_reason ? ` — ${v.change_reason}` : ""}
                </li>
              ))}</ul>
            </div>
          );
        })}
      </QueryState>
      <ReasonDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit?.id ? "Bölgeyi düzenle" : "Yeni hizmet bölgesi"}
        onConfirm={async (reason) => {
          const e = edit!;
          await rpc("admin_upsert_coverage_area", { p_id: e.id ?? null, p_district_id: e.district_id, p_name: e.name, p_slug: e.slug, p_center_lat: e.center_lat, p_center_lng: e.center_lng,
            p_max_radius_km: e.max_radius_km, p_min_basket: e.min_basket_amount, p_pricing_rule_id: e.pricing_rule_id ?? data.data?.rules[0]?.id, p_opens_at: e.opens_at, p_closes_at: e.closes_at, p_is_active: e.is_active ?? false, p_reason: reason });
          toast.success("Bölge kaydedildi."); refresh();
        }}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><Label>İlçe</Label><NativeSelect className="mt-1" value={edit?.district_id ?? ""} onChange={(e) => setEdit({ ...edit, district_id: e.target.value })}><option value="">Seçin</option>{data.data?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</NativeSelect></div>
          <div><Label>Ad</Label><Input className="mt-1" value={edit?.name ?? ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div><Label>Slug</Label><Input className="mt-1" value={edit?.slug ?? ""} onChange={(e) => setEdit({ ...edit, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} /></div>
          <div><Label>Fiyat kuralı</Label><NativeSelect className="mt-1" value={edit?.pricing_rule_id ?? ""} onChange={(e) => setEdit({ ...edit, pricing_rule_id: e.target.value })}>{data.data?.rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</NativeSelect></div>
          <div><Label>Açılış</Label><Input className="mt-1" type="time" value={edit?.opens_at?.slice(0, 5) ?? ""} onChange={(e) => setEdit({ ...edit, opens_at: e.target.value })} /></div>
          <div><Label>Kapanış</Label><Input className="mt-1" type="time" value={edit?.closes_at?.slice(0, 5) ?? ""} onChange={(e) => setEdit({ ...edit, closes_at: e.target.value })} /></div>
          <div><Label>Maks. yarıçap (km)</Label><Input className="mt-1" type="number" value={edit?.max_radius_km ?? ""} onChange={(e) => setEdit({ ...edit, max_radius_km: Number(e.target.value) })} /></div>
          <div><Label>Minimum sepet (TL)</Label><Input className="mt-1" type="number" value={edit?.min_basket_amount ?? ""} onChange={(e) => setEdit({ ...edit, min_basket_amount: Number(e.target.value) })} /></div>
          <label className="col-span-2 flex items-center justify-between">Aktif<Switch checked={edit?.is_active ?? false} onCheckedChange={(c) => setEdit({ ...edit, is_active: c })} /></label>
          <div className="col-span-2"><Label>Bölge merkezi</Label><PinPicker value={edit?.center_lat !== undefined && edit?.center_lng !== undefined ? { lat: edit.center_lat, lng: edit.center_lng } : null} onChange={(p) => setEdit({ ...edit, center_lat: p.lat, center_lng: p.lng })} /></div>
        </div>
      </ReasonDialog>
      <ReasonDialog open={price !== null} onOpenChange={(o) => !o && setPrice(null)} title="Yeni fiyat sürümü" description="Geçmiş siparişler kendi fiyat snapshot'ını korur; yeni sürüm yalnız yeni tekliflere uygulanır."
        onConfirm={async (reason) => { await rpc("admin_create_pricing_version", { p_pricing_rule_id: price!.ruleId, p_base_fee: price!.base_fee, p_base_distance_km: price!.base_distance_km, p_per_km_fee: price!.per_km_fee, p_max_distance_km: price!.max_distance_km, p_reason: reason }); toast.success("Fiyat sürümü oluşturuldu."); refresh(); }}>
        {price && <div className="grid grid-cols-2 gap-3 text-sm">
          {([["base_fee", "Taban ücret (TL)"], ["base_distance_km", "Taban mesafe (km)"], ["per_km_fee", "Km başı ek (TL)"], ["max_distance_km", "Maks. mesafe (km)"]] as const).map(([k, l]) => (
            <div key={k}><Label>{l}</Label><Input className="mt-1" type="number" step="0.01" value={price[k]} onChange={(e) => setPrice({ ...price, [k]: Number(e.target.value) })} /></div>
          ))}
        </div>}
      </ReasonDialog>
    </div>
  );
}

/* ---------------- SEO ---------------- */
interface SeoCheck { id: string; trigger_source: string; robots_ok: boolean | null; sitemap_ok: boolean | null; url_count: number | null; error_count: number; index_protection_ok: boolean | null; search_engines: Record<string, string>; started_at: string; finished_at: string | null }
interface SeoErr { id: string; url: string; error_code: SeoErrorCode; message: string; recommendation: string; status: string; detected_at: string }

export function SeoTab() {
  const qc = useQueryClient();
  const checks = useAdminSelect<SeoCheck>(["seo-checks"], () => supabase.from("seo_checks").select("*").order("started_at", { ascending: false }).limit(20));
  const errors = useAdminSelect<SeoErr>(["seo-errors"], () => supabase.from("seo_error_logs").select("*").eq("status", "open").order("detected_at", { ascending: false }).limit(200));
  const interval = useQuery({ queryKey: ["admin", "seo-interval"], queryFn: async () => Number((await supabase.from("settings").select("value").eq("key", "seo.check_interval_minutes").single()).data?.value ?? 60) });
  const [running, setRunning] = useState(false);
  const [newInterval, setNewInterval] = useState<number | null>(null);
  const last = checks.data?.rows[0];
  const refresh = () => { void qc.invalidateQueries({ queryKey: ["admin", "seo-checks"] }); void qc.invalidateQueries({ queryKey: ["admin", "seo-errors"] }); };
  const engine = (v?: string) => (v === "verification_meta_present" ? "Doğrulama etiketi var" : v === "verification_meta_missing" ? "Doğrulama etiketi yok" : "Yapılandırılmadı");
  return (
    <div>
      <PageHeader title="SEO" description="Sonuçlar Supabase'e kaydedilir. İndeksleme durumu arama motoru API erişimi olmadan doğrulanamaz." actions={<>
        <NativeSelect className="w-40" value={interval.data ?? 60} onChange={(e) => setNewInterval(Number(e.target.value))} aria-label="Kontrol aralığı">
          <option value={5}>5 dk</option><option value={15}>15 dk</option><option value={60}>1 saat</option><option value={360}>6 saat</option>
        </NativeSelect>
        <Button disabled={running} onClick={async () => { setRunning(true); try { await invokeFunction("seo-check", { trigger: "manual" }); toast.success("SEO kontrolü tamamlandı."); refresh(); } catch (e) { toast.error(errorMessage(e)); } finally { setRunning(false); } }}>{running ? "Kontrol ediliyor…" : "Şimdi kontrol et"}</Button>
      </>} />
      <QueryState q={checks}>
        {last ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile label="robots.txt" value={last.robots_ok ? "Geçerli" : "Sorunlu"} tone={last.robots_ok ? undefined : "danger"} />
            <StatTile label="sitemap.xml" value={last.sitemap_ok ? "Geçerli" : "Sorunlu"} tone={last.sitemap_ok ? undefined : "danger"} hint={`${last.url_count ?? 0} URL`} />
            <StatTile label="Özel sayfa koruması" value={last.index_protection_ok ? "Korunuyor" : "Eksik"} tone={last.index_protection_ok ? undefined : "danger"} />
            <StatTile label="Hata" value={last.error_count} hint={`Son kontrol: ${formatDateTime(last.finished_at ?? last.started_at)}`} />
            <StatTile label="Google" value={engine(last.search_engines.google)} />
            <StatTile label="Bing" value={engine(last.search_engines.bing)} />
            <StatTile label="Yandex" value={engine(last.search_engines.yandex)} />
          </div>
        ) : <p className="text-sm text-muted-foreground">Henüz SEO kontrolü yapılmadı.</p>}
      </QueryState>
      <h2 className="mb-2 mt-8 font-bold">SEO hata merkezi</h2>
      <QueryState q={errors} empty={errors.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Kod</Th><Th>URL</Th><Th>Hata</Th><Th>Öneri</Th><Th>Tespit</Th><Th /></tr></thead>
          <tbody>{errors.data?.rows.map((e) => (
            <tr key={e.id}><Td><Badge variant="destructive">{e.error_code}</Badge><p className="text-xs text-muted-foreground">{SeoErrorCodeLabels[e.error_code]}</p></Td><Td className="max-w-xs break-all text-xs">{e.url}</Td><Td>{e.message}</Td><Td className="text-xs">{e.recommendation}</Td><Td>{formatDateTime(e.detected_at)}</Td>
              <Td><Button size="sm" variant="ghost" onClick={async () => { await supabase.from("seo_error_logs").update({ status: "ignored", resolved_at: new Date().toISOString() }).eq("id", e.id); refresh(); }}>Yoksay</Button></Td></tr>
          ))}</tbody>
        </Table>
      </QueryState>
      <ReasonDialog open={newInterval !== null} onOpenChange={(o) => !o && setNewInterval(null)} title={`SEO kontrol aralığı: ${newInterval} dk`}
        onConfirm={async (reason) => { await rpc("admin_update_setting", { p_key: "seo.check_interval_minutes", p_value: newInterval, p_reason: reason }); toast.success("Güncellendi."); void interval.refetch(); }} />
    </div>
  );
}

/* ---------------- Audit ---------------- */
interface Audit { id: number; event_id: string; actor_id: string | null; actor_role: string | null; action: string; resource: string; resource_id: string | null; previous_value: unknown; new_value: unknown; reason: string | null; ip: string | null; user_agent: string | null; request_id: string | null; lat: number | null; lng: number | null; device: unknown; created_at: string }

export function AuditTab() {
  const [page, setPage] = useState(0);
  const [action, setAction] = useState("");
  const q = useAdminSelect<Audit>(["audit", page, action], () => {
    let b = supabase.from("admin_audit_logs").select("*", { count: "exact" }).order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (action.trim()) b = b.ilike("action", `%${action.trim()}%`);
    return b;
  });
  return (
    <div>
      <PageHeader title="Audit logs" description="Değiştirilemez kayıt: veritabanı seviyesinde UPDATE/DELETE/TRUNCATE engellidir." actions={<>
        <Input className="w-56" placeholder="İşlem ara" value={action} onChange={(e) => { setAction(e.target.value); setPage(0); }} />
        <Button variant="outline" onClick={() => downloadCsv("audit.csv", (q.data?.rows ?? []).map((a) => ({ ...a, previous_value: a.previous_value, new_value: a.new_value })) as unknown as Record<string, unknown>[])}>CSV</Button>
      </>} />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Zaman</Th><Th>Aktör</Th><Th>İşlem</Th><Th>Kaynak</Th><Th>Gerekçe</Th><Th>Değişiklik</Th><Th>IP</Th></tr></thead>
          <tbody>{q.data?.rows.map((a) => (
            <tr key={a.id}><Td className="whitespace-nowrap">{formatDateTime(a.created_at)}</Td><Td className="text-xs">{a.actor_role}<br /><span className="font-mono">{a.actor_id?.slice(0, 8) ?? "sistem"}</span></Td><Td className="font-semibold">{a.action}</Td>
              <Td className="text-xs">{a.resource}<br /><span className="font-mono">{a.resource_id?.slice(0, 12)}</span></Td><Td className="max-w-xs text-xs">{a.reason}</Td>
              <Td><details className="text-xs"><summary className="cursor-pointer">göster</summary><pre className="max-w-md overflow-auto whitespace-pre-wrap">{JSON.stringify({ önce: a.previous_value, sonra: a.new_value }, null, 1)}</pre></details></Td><Td className="text-xs">{a.ip}</Td></tr>
          ))}</tbody>
        </Table>
        <Pager page={page} total={q.data?.count ?? 0} size={50} onPage={setPage} />
      </QueryState>
    </div>
  );
}

/* ---------------- Sistem sağlığı ---------------- */
interface HealthCheck { service: string; status: HealthStatus; is_critical: boolean; latency_ms: number | null; message: string | null }
const SERVICE_NAMES: Record<string, string> = { supabase: "Supabase veritabanı", edge_functions: "Edge Functions", storage: "Storage", fcm: "FCM (push)", maps: "Google Maps", iyzico: "iyzico (ödeme)", resend: "Resend (e-posta)" };

export function HealthTab() {
  const [result, setResult] = useState<{ overall: HealthStatus; checks: HealthCheck[]; checked_at: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const history = useAdminSelect<HealthCheck & { id: number; checked_at: string }>(["health-history"], () => supabase.from("system_health_checks").select("*").order("checked_at", { ascending: false }).limit(70));
  const events = useAdminSelect<{ id: number; source: string; event_type: string; severity: string; message: string; created_at: string }>(["error-events"], () => supabase.from("app_error_events").select("id, source, event_type, severity, message, created_at").order("created_at", { ascending: false }).limit(100));
  const latest = useMemo(() => {
    if (result) return result.checks;
    const seen = new Set<string>();
    return (history.data?.rows ?? []).filter((h) => (seen.has(h.service) ? false : (seen.add(h.service), true)));
  }, [result, history.data]);
  const variant = (s: HealthStatus) => (s === "operational" ? "success" : s === "degraded" ? "warning" : "destructive");
  return (
    <div>
      <PageHeader title="Sistem sağlığı" description="İsteğe bağlı bir servisteki sorun tüm platformu ‘erişilemiyor’ göstermez." actions={
        <Button disabled={busy} onClick={async () => { setBusy(true); try { setResult(await invokeFunction("system-health", {})); void history.refetch(); } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); } }}>{busy ? "Kontrol ediliyor…" : "Şimdi kontrol et"}</Button>} />
      {result && <p className="mb-4">Genel durum: <Badge variant={variant(result.overall)}>{HealthStatusLabels[result.overall]}</Badge></p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {latest.length === 0 && <p className="text-sm text-muted-foreground">Henüz sağlık kontrolü yapılmadı.</p>}
        {latest.map((c) => (
          <div key={c.service} className="rounded-xl border bg-card p-4">
            <p className="font-semibold">{SERVICE_NAMES[c.service] ?? c.service} {c.is_critical && <span className="text-xs text-muted-foreground">(kritik)</span>}</p>
            <Badge className="mt-2" variant={variant(c.status)}>{HealthStatusLabels[c.status]}</Badge>
            <p className="mt-1 text-xs text-muted-foreground">{c.latency_ms !== null ? `${c.latency_ms} ms` : ""} {c.message ?? ""}</p>
          </div>
        ))}
      </div>
      <h2 className="mb-2 mt-8 font-bold">Gözlemlenebilirlik olayları</h2>
      <QueryState q={events} empty={events.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Zaman</Th><Th>Kaynak</Th><Th>Tür</Th><Th>Önem</Th><Th>Mesaj</Th></tr></thead>
          <tbody>{events.data?.rows.map((e) => <tr key={e.id}><Td>{formatDateTime(e.created_at)}</Td><Td>{e.source}</Td><Td>{e.event_type}</Td><Td><Badge variant={e.severity === "critical" || e.severity === "error" ? "destructive" : "warning"}>{e.severity}</Badge></Td><Td className="text-xs">{e.message}</Td></tr>)}</tbody>
        </Table>
      </QueryState>
    </div>
  );
}

/* ---------------- Ayarlar ---------------- */
interface Setting { key: string; value: unknown; category: string; description: string; value_type: "boolean" | "number" | "string" | "object"; min_value: number | null; max_value: number | null; updated_at: string }
const CATEGORY_LABELS: Record<string, string> = { operasyon: "Operasyon", teslimat: "Teslimat", calisma_saatleri: "Çalışma saatleri", minimum_sepet: "Minimum sepet", fiyatlandirma: "Fiyatlandırma", sadakat: "Sadakat", destek: "Destek", bildirim: "Bildirim", seo: "SEO", uyumluluk: "Uyumluluk", kurye: "Kurye", komisyon: "Komisyon", odeme: "Ödeme" };

export function SettingsTab() {
  const qc = useQueryClient();
  const q = useAdminSelect<Setting>(["settings"], () => supabase.from("settings").select("*").order("category").order("key"));
  const [edit, setEdit] = useState<{ s: Setting; value: unknown } | null>(null);
  const grouped = useMemo(() => {
    const m = new Map<string, Setting[]>();
    for (const s of q.data?.rows ?? []) m.set(s.category, [...(m.get(s.category) ?? []), s]);
    return [...m.entries()];
  }, [q.data]);
  return (
    <div>
      <PageHeader title="Ayarlar" description="İş parametreleri kod değiştirmeden yönetilir. Güvenlik anahtarları burada YOKTUR (Supabase secrets'tadır). Pricing için Coverage sekmesini kullanın." />
      <QueryState q={q}>
        <div className="space-y-6">
          {grouped.map(([cat, items]) => (
            <div key={cat}>
              <h2 className="mb-2 font-bold">{CATEGORY_LABELS[cat] ?? cat}</h2>
              <div className="divide-y rounded-xl border bg-card">
                {items.map((s) => (
                  <div key={s.key} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div><p className="font-mono text-xs text-muted-foreground">{s.key}</p><p className="text-sm">{s.description}</p></div>
                    <div className="flex items-center gap-3"><span className="font-semibold">{JSON.stringify(s.value)}</span><Button size="sm" variant="outline" onClick={() => setEdit({ s, value: s.value })}>Değiştir</Button></div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </QueryState>
      <ReasonDialog open={edit !== null} onOpenChange={(o) => !o && setEdit(null)} title={edit?.s.key ?? ""} description={edit?.s.description}
        onConfirm={async (reason) => { await rpc("admin_update_setting", { p_key: edit!.s.key, p_value: edit!.value, p_reason: reason }); toast.success("Ayar güncellendi."); void qc.invalidateQueries({ queryKey: ["admin", "settings"] }); }}>
        {edit && (edit.s.value_type === "boolean" ? (
          <label className="flex items-center justify-between">Değer<Switch checked={edit.value === true} onCheckedChange={(c) => setEdit({ ...edit, value: c })} /></label>
        ) : edit.s.value_type === "number" ? (
          <div><Label>Değer {edit.s.min_value !== null && `(${edit.s.min_value}–${edit.s.max_value})`}</Label><Input className="mt-1" type="number" value={String(edit.value)} min={edit.s.min_value ?? undefined} max={edit.s.max_value ?? undefined} onChange={(e) => setEdit({ ...edit, value: Number(e.target.value) })} /></div>
        ) : (
          <div><Label>Değer</Label><Input className="mt-1" value={String(edit.value ?? "")} onChange={(e) => setEdit({ ...edit, value: e.target.value })} /></div>
        ))}
      </ReasonDialog>
    </div>
  );
}
