import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PaymentStatusLabels, SettlementStatusLabels, type PaymentStatus, type SettlementStatus } from "@kapinda/shared-contracts";
import { supabase, rpc, invokeFunction } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { downloadCsv, formatDate, formatDateTime, formatTry } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, Td, Th } from "@/components/ui/misc";
import { PageHeader, Pager, QueryState, RangeFilter, ReasonDialog, StatTile, rangeFor, useAdminSelect, type RangeKey } from "./shared";

function useVendorsAndAreas() {
  return useQuery({
    queryKey: ["admin", "vendors-areas"],
    queryFn: async () => {
      const [v, a] = await Promise.all([supabase.from("vendors").select("id, name").order("name"), supabase.from("coverage_areas").select("id, name")]);
      return { vendors: v.data ?? [], areas: a.data ?? [] };
    },
  });
}

interface FinRow { day: string; vendor_id: string; vendor_name: string; coverage_area_id: string; delivered_orders: number; product_gmv: number; delivery_revenue: number; platform_commission: number }

export function FinanceTab() {
  const [range, setRange] = useState<RangeKey>("month");
  const [custom, setCustom] = useState({ from: "", to: "" });
  const [vendor, setVendor] = useState("");
  const [area, setArea] = useState("");
  const r = rangeFor(range, custom);
  const meta = useVendorsAndAreas();
  const q = useQuery({
    queryKey: ["admin", "finance", r, vendor, area],
    queryFn: () => rpc<FinRow[]>("admin_finance_report", { p_from: r.from, p_to: r.to, p_vendor_id: vendor || null, p_coverage_area_id: area || null }),
  });
  const totals = useMemo(() => (q.data ?? []).reduce((t, x) => ({ orders: t.orders + Number(x.delivered_orders), gmv: t.gmv + Number(x.product_gmv), delivery: t.delivery + Number(x.delivery_revenue), commission: t.commission + Number(x.platform_commission) }), { orders: 0, gmv: 0, delivery: 0, commission: 0 }), [q.data]);
  return (
    <div>
      <PageHeader title="Finans" description="Ürün GMV, teslimat geliri ve platform komisyonu ayrı raporlanır; tek bir “ciro” altında toplanmaz." actions={<>
        <RangeFilter value={range} onChange={setRange} custom={custom} onCustom={setCustom} />
        <NativeSelect className="w-48" value={vendor} onChange={(e) => setVendor(e.target.value)}><option value="">Tüm işletmeler</option>{meta.data?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect>
        <NativeSelect className="w-40" value={area} onChange={(e) => setArea(e.target.value)}><option value="">Tüm bölgeler</option>{meta.data?.areas.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</NativeSelect>
        <Button variant="outline" onClick={() => downloadCsv("finans.csv", (q.data ?? []).map((x) => ({ gun: x.day, isletme: x.vendor_name, teslim_edilen: x.delivered_orders, urun_gmv: x.product_gmv, teslimat_geliri: x.delivery_revenue, platform_komisyonu: x.platform_commission })))}>CSV</Button>
      </>} />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Teslim edilen sipariş" value={totals.orders} />
        <StatTile label="Ürün GMV (işletmelerin)" value={formatTry(totals.gmv)} />
        <StatTile label="Teslimat geliri (Kapında)" value={formatTry(totals.delivery)} tone="accent" />
        <StatTile label="Platform komisyonu" value={formatTry(totals.commission)} tone="primary" />
      </div>
      <QueryState q={q} empty={q.data?.length === 0}>
        <Table>
          <thead><tr><Th>Gün</Th><Th>İşletme</Th><Th>Sipariş</Th><Th>Ürün GMV</Th><Th>Teslimat geliri</Th><Th>Komisyon</Th></tr></thead>
          <tbody>{q.data?.map((x, i) => <tr key={i}><Td>{formatDate(x.day)}</Td><Td>{x.vendor_name}</Td><Td>{x.delivered_orders}</Td><Td>{formatTry(x.product_gmv)}</Td><Td>{formatTry(x.delivery_revenue)}</Td><Td>{formatTry(x.platform_commission)}</Td></tr>)}</tbody>
        </Table>
      </QueryState>
    </div>
  );
}

interface PayRow { id: string; order_id: string; amount: number; status: PaymentStatus; conversation_id: string; provider_payment_id: string | null; failure_reason: string | null; paid_at: string | null; refunded_at: string | null; created_at: string }

export function PaymentsTab() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(0);
  const q = useAdminSelect<PayRow>(["payments", status, page], () => {
    let b = supabase.from("payments").select("id, order_id, amount, status, conversation_id, provider_payment_id, failure_reason, paid_at, refunded_at, created_at", { count: "exact" }).order("created_at", { ascending: false }).range(page * 50, page * 50 + 49);
    if (status) b = b.eq("status", status);
    return b;
  });
  return (
    <div>
      <PageHeader title="Ödemeler" description="iyzico ile yalnız teslimat ücreti tahsil edilir." actions={<>
        <NativeSelect className="w-44" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Tüm durumlar</option>{Object.entries(PaymentStatusLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</NativeSelect>
        <Button variant="outline" onClick={async () => { try { const r = await invokeFunction<{ refunded: number; failed: number }>("process-refunds", {}); toast.success(`İade: ${r.refunded} başarılı, ${r.failed} başarısız`); void q.refetch(); } catch (e) { toast.error(errorMessage(e)); } }}>İade kuyruğunu işle</Button>
      </>} />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Tarih</Th><Th>Tutar</Th><Th>Durum</Th><Th>iyzico ödeme no</Th><Th>Sipariş</Th><Th>Hata</Th></tr></thead>
          <tbody>{q.data?.rows.map((p) => (
            <tr key={p.id}><Td>{formatDateTime(p.created_at)}</Td><Td>{formatTry(p.amount)}</Td>
              <Td><Badge variant={p.status === "succeeded" ? "success" : p.status === "failed" ? "destructive" : "warning"}>{PaymentStatusLabels[p.status]}</Badge></Td>
              <Td className="font-mono text-xs">{p.provider_payment_id ?? "—"}</Td><Td><a className="text-primary" href={`/admin/siparisler?id=${p.order_id}`}>Detay</a></Td><Td className="text-xs">{p.failure_reason ?? ""}</Td></tr>
          ))}</tbody>
        </Table>
        <Pager page={page} total={q.data?.count ?? 0} size={50} onPage={setPage} />
      </QueryState>
    </div>
  );
}

interface CommRow { id: string; order_id: string; eligible_item_count: number; unit_amount: number; basis: string; total_amount: number; product_gmv: number; delivered_at: string; settlement_id: string | null; vendors: { name: string } | null }

export function CommissionsTab() {
  const [page, setPage] = useState(0);
  const q = useAdminSelect<CommRow>(["commissions", page], () => supabase.from("platform_commissions").select("*, vendors(name)", { count: "exact" }).order("delivered_at", { ascending: false }).range(page * 50, page * 50 + 49));
  return (
    <div>
      <PageHeader title="Komisyonlar" description="Teslim edilen siparişlerde sunucuda hesaplanan değiştirilemez komisyon kayıtları." actions={
        <Button variant="outline" onClick={() => downloadCsv("komisyonlar.csv", (q.data?.rows ?? []).map((c) => ({ isletme: c.vendors?.name, siparis: c.order_id, kalem: c.eligible_item_count, birim: c.unit_amount, tutar: c.total_amount, gmv: c.product_gmv, teslim: c.delivered_at })))}>CSV</Button>
      } />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Teslim</Th><Th>İşletme</Th><Th>Uygun kalem</Th><Th>Birim</Th><Th>Komisyon</Th><Th>Ürün GMV</Th><Th>Mutabakat</Th></tr></thead>
          <tbody>{q.data?.rows.map((c) => <tr key={c.id}><Td>{formatDateTime(c.delivered_at)}</Td><Td>{c.vendors?.name}</Td><Td>{c.eligible_item_count} ({c.basis === "per_line" ? "kalem" : "adet"})</Td><Td>{formatTry(c.unit_amount)}</Td><Td className="font-semibold">{formatTry(c.total_amount)}</Td><Td>{formatTry(c.product_gmv)}</Td><Td>{c.settlement_id ? "Dahil" : "Bekliyor"}</Td></tr>)}</tbody>
        </Table>
        <Pager page={page} total={q.data?.count ?? 0} size={50} onPage={setPage} />
      </QueryState>
    </div>
  );
}

interface SetRow { id: string; vendor_id: string; period_start: string; period_end: string; order_count: number; product_gmv: number; commission_total: number; adjustment_total: number; payable_amount: number; status: SettlementStatus; generated_at: string; approved_at: string | null; vendors: { name: string } | null }

export function SettlementsTab() {
  const qc = useQueryClient();
  const meta = useVendorsAndAreas();
  const q = useAdminSelect<SetRow>(["settlements"], () => supabase.from("vendor_settlements").select("*, vendors(name)").order("generated_at", { ascending: false }).limit(200));
  const [gen, setGen] = useState({ vendor: "", from: "", to: "" });
  const [act, setAct] = useState<{ s: SetRow; kind: "approved" | "paid" | "cancelled" | "adjust" } | null>(null);
  const [amount, setAmount] = useState(0);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["admin", "settlements"] });
  return (
    <div>
      <PageHeader title="Mutabakat" description="Dönemsel işletme mutabakatı: işletmenin Kapında'ya ödeyeceği komisyon (+ düzeltmeler). Snapshot alınır; sonraki fiyat değişiklikleri etkilemez." />
      <div className="mb-6 flex flex-wrap items-end gap-2 rounded-xl border bg-card p-4">
        <div><Label>İşletme</Label><NativeSelect className="mt-1.5 w-56" value={gen.vendor} onChange={(e) => setGen({ ...gen, vendor: e.target.value })}><option value="">Seçin</option>{meta.data?.vendors.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}</NativeSelect></div>
        <div><Label>Başlangıç</Label><Input className="mt-1.5" type="date" value={gen.from} onChange={(e) => setGen({ ...gen, from: e.target.value })} /></div>
        <div><Label>Bitiş</Label><Input className="mt-1.5" type="date" value={gen.to} onChange={(e) => setGen({ ...gen, to: e.target.value })} /></div>
        <Button disabled={!gen.vendor || !gen.from || !gen.to} onClick={async () => { try { await rpc("admin_generate_settlement", { p_vendor_id: gen.vendor, p_period_start: gen.from, p_period_end: gen.to }); toast.success("Mutabakat oluşturuldu."); refresh(); } catch (e) { toast.error(errorMessage(e)); } }}>Mutabakat oluştur</Button>
      </div>
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>İşletme</Th><Th>Dönem</Th><Th>Sipariş</Th><Th>Ürün GMV</Th><Th>Komisyon</Th><Th>Düzeltme</Th><Th>Ödenecek</Th><Th>Durum</Th><Th /></tr></thead>
          <tbody>{q.data?.rows.map((s) => (
            <tr key={s.id}><Td>{s.vendors?.name}</Td><Td>{formatDate(s.period_start)} – {formatDate(s.period_end)}</Td><Td>{s.order_count}</Td><Td>{formatTry(s.product_gmv)}</Td><Td>{formatTry(s.commission_total)}</Td><Td>{formatTry(s.adjustment_total)}</Td><Td className="font-bold">{formatTry(s.payable_amount)}</Td>
              <Td><Badge variant={s.status === "paid" ? "success" : s.status === "cancelled" ? "muted" : "default"}>{SettlementStatusLabels[s.status]}</Badge></Td>
              <Td className="space-x-1 whitespace-nowrap">
                {s.status === "draft" && <><Button size="sm" variant="outline" onClick={() => setAct({ s, kind: "adjust" })}>Düzeltme</Button><Button size="sm" onClick={() => setAct({ s, kind: "approved" })}>Onayla</Button><Button size="sm" variant="ghost" onClick={() => setAct({ s, kind: "cancelled" })}>İptal</Button></>}
                {s.status === "approved" && <Button size="sm" onClick={() => setAct({ s, kind: "paid" })}>Ödendi</Button>}
              </Td></tr>
          ))}</tbody>
        </Table>
      </QueryState>
      <ReasonDialog open={act !== null} onOpenChange={(o) => !o && setAct(null)} title={act ? `${act.s.vendors?.name}: ${act.kind === "adjust" ? "Düzeltme ekle" : SettlementStatusLabels[act.kind]}` : ""}
        onConfirm={async (reason) => {
          if (act!.kind === "adjust") await rpc("admin_add_settlement_adjustment", { p_settlement_id: act!.s.id, p_amount: amount, p_reason: reason });
          else await rpc("admin_set_settlement_status", { p_settlement_id: act!.s.id, p_status: act!.kind, p_reason: reason });
          toast.success("Mutabakat güncellendi."); refresh();
        }}>
        {act?.kind === "adjust" && <div><Label>Tutar (TL, eksi değer indirim)</Label><Input className="mt-1.5" type="number" step="0.01" value={amount} onChange={(e) => setAmount(Number(e.target.value))} /></div>}
      </ReasonDialog>
    </div>
  );
}

interface RewardRow { id: string; user_id: string; source: string; status: string; created_at: string; used_at: string | null; order_id: string | null }
interface RefRow { id: string; referrer_id: string; referred_id: string; referral_code: string; has_ordered: boolean; qualified_at: string | null; created_at: string }

export function LoyaltyTab() {
  const q = useAdminSelect<RewardRow>(["rewards"], () => supabase.from("loyalty_rewards").select("*").order("created_at", { ascending: false }).limit(200));
  return (
    <div>
      <PageHeader title="Sadakat" description="Ücretsiz teslimat yalnız kullanıcının 5. siparişinde veya 5 doğrulanmış davette verilir (ayarlar sekmesinden değiştirilebilir). Ödüller sunucuda üretilir; tekrar ödül engellidir." />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Tarih</Th><Th>Kullanıcı</Th><Th>Kaynak</Th><Th>Durum</Th><Th>Kullanım</Th></tr></thead>
          <tbody>{q.data?.rows.map((r) => <tr key={r.id}><Td>{formatDateTime(r.created_at)}</Td><Td className="font-mono text-xs">{r.user_id.slice(0, 8)}</Td><Td>{r.source === "order_milestone" ? "N. sipariş" : "Davet"}</Td><Td>{r.status}</Td><Td>{formatDateTime(r.used_at)}</Td></tr>)}</tbody>
        </Table>
      </QueryState>
    </div>
  );
}

export function ReferralsTab() {
  const q = useAdminSelect<RefRow>(["referrals"], () => supabase.from("referrals").select("*").order("created_at", { ascending: false }).limit(200));
  return (
    <div>
      <PageHeader title="Referans" description="Davet doğrulaması (ilk teslim edilen sipariş) yalnız sunucu tarafında işaretlenir." />
      <QueryState q={q} empty={q.data?.rows.length === 0}>
        <Table>
          <thead><tr><Th>Tarih</Th><Th>Davet eden</Th><Th>Davet edilen</Th><Th>Kod</Th><Th>Doğrulandı</Th></tr></thead>
          <tbody>{q.data?.rows.map((r) => <tr key={r.id}><Td>{formatDateTime(r.created_at)}</Td><Td className="font-mono text-xs">{r.referrer_id.slice(0, 8)}</Td><Td className="font-mono text-xs">{r.referred_id.slice(0, 8)}</Td><Td>{r.referral_code}</Td><Td>{r.has_ordered ? formatDateTime(r.qualified_at) : "Hayır"}</Td></tr>)}</tbody>
        </Table>
      </QueryState>
    </div>
  );
}
