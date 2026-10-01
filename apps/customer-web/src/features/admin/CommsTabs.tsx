import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { SupportStatusLabels, type DeviceApp } from "@kapinda/shared-contracts";
import { supabase, rpc } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { enablePush, pushSupported } from "@/lib/fcm";
import { formatDateTime, cn } from "@/lib/utils";
import { useRealtimeTable } from "@/hooks/useRealtime";
import type { SupportConversation } from "@/types/db";
import { SupportChat } from "@/features/support/SupportChat";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Table, Td, Th } from "@/components/ui/misc";
import { PageHeader, QueryState, ReasonDialog, StatTile, useAdminSelect } from "./shared";

export function SupportTab() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("open");
  const [selected, setSelected] = useState<string | null>(null);
  const q = useAdminSelect<SupportConversation>(["support-conversations", status], () => {
    let b = supabase.from("support_conversations").select("*").order("last_message_at", { ascending: false }).limit(100);
    if (status !== "all") b = b.eq("status", status);
    return b;
  });
  const refresh = useCallback(() => void qc.invalidateQueries({ queryKey: ["admin", "support-conversations"] }), [qc]);
  useRealtimeTable({ channel: "admin-support", table: "support_conversations", onChange: refresh });
  const current = q.data?.rows.find((c) => c.id === selected);
  return (
    <div>
      <PageHeader title="Destek" actions={<NativeSelect className="w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
        <option value="open">Açık</option><option value="waiting">Yanıt bekleniyor</option><option value="resolved">Çözüldü</option><option value="all">Tümü</option></NativeSelect>} />
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <QueryState q={q} empty={q.data?.rows.length === 0}>
          <div className="space-y-2">
            {q.data?.rows.map((c) => (
              <button key={c.id} onClick={() => setSelected(c.id)} className={cn("w-full rounded-xl border bg-card p-3 text-left text-sm", selected === c.id && "border-primary")}>
                <p className="font-semibold">{c.subject}</p>
                <p className="text-xs text-muted-foreground">{SupportStatusLabels[c.status]} · {formatDateTime(c.last_message_at)}</p>
              </button>
            ))}
          </div>
        </QueryState>
        <div>{current ? <SupportChat conversation={current} viewer="admin" /> : <EmptyState title="Bir konuşma seçin." />}</div>
      </div>
    </div>
  );
}

export function NotificationsTab() {
  const stats = useQuery({ queryKey: ["admin", "notif-stats"], queryFn: () => rpc<{ by_status: Record<string, number>; by_app: Record<string, number>; active_devices: Record<string, number> }>("admin_notification_stats", { p_hours: 24 }) });
  const [app, setApp] = useState<DeviceApp>("customer");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [open, setOpen] = useState(false);
  return (
    <div>
      <PageHeader title="Bildirimler" description="FCM push gönderim durumu (son 24 saat) ve duyuru gönderimi." actions={pushSupported() ? (
        <Button variant="outline" onClick={async () => { try { const r = await enablePush("admin"); toast[r === "enabled" ? "success" : "error"](r === "enabled" ? "Bu cihaza acil durum bildirimleri gelecek." : "Bildirim izni alınamadı."); } catch (e) { toast.error(errorMessage(e)); } }}>Bu cihazda admin bildirimlerini aç</Button>
      ) : undefined} />
      <QueryState q={stats}>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {["sent", "pending", "processing", "failed", "skipped"].map((k) => <StatTile key={k} label={{ sent: "Gönderildi", pending: "Bekliyor", processing: "İşleniyor", failed: "Başarısız", skipped: "Atlandı" }[k]!} value={stats.data?.by_status[k] ?? 0} tone={k === "failed" && (stats.data?.by_status[k] ?? 0) > 0 ? "danger" : undefined} />)}
        </div>
        <p className="mt-3 text-sm text-muted-foreground">Aktif cihazlar: {Object.entries(stats.data?.active_devices ?? {}).map(([k, v]) => `${k}: ${v}`).join(" · ") || "yok"}</p>
      </QueryState>
      <div className="mt-6 space-y-3 rounded-xl border bg-card p-4">
        <p className="font-bold">Duyuru gönder</p>
        <p className="text-xs text-muted-foreground">Müşterilere yalnız kampanya bildirimlerine izin verenlere gönderilir.</p>
        <NativeSelect className="w-48" value={app} onChange={(e) => setApp(e.target.value as DeviceApp)}><option value="customer">Müşteriler</option><option value="courier">Kuryeler</option><option value="vendor">İşletmeler</option><option value="admin">Yöneticiler</option></NativeSelect>
        <Input placeholder="Başlık" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        <Textarea placeholder="Mesaj" maxLength={500} value={body} onChange={(e) => setBody(e.target.value)} />
        <Button disabled={title.length < 3 || body.length < 3} onClick={() => setOpen(true)}>Gönder</Button>
      </div>
      <ReasonDialog open={open} onOpenChange={setOpen} title="Duyuru gönderilsin mi?" onConfirm={async (reason) => {
        const n = await rpc<number>("admin_broadcast_notification", { p_app: app, p_title: title, p_body: body, p_reason: reason });
        toast.success(`${n} kullanıcıya gönderim kuyruğa alındı.`); setTitle(""); setBody("");
      }} />
    </div>
  );
}

interface OutboxRow { id: string; to_email: string; category: string; template: string; status: string; attempts: number; error: string | null; created_at: string; sent_at: string | null }
interface SubRow { id: string; email: string; topic: string; status: string; subscribed_at: string }
interface SupRow { id: string; email: string; reason: string; scope: string; created_at: string }

export function EmailTab() {
  const qc = useQueryClient();
  const [view, setView] = useState<"outbox" | "subs" | "sup">("outbox");
  const outbox = useAdminSelect<OutboxRow>(["email-outbox"], () => supabase.from("email_outbox").select("id, to_email, category, template, status, attempts, error, created_at, sent_at").order("created_at", { ascending: false }).limit(100), view === "outbox");
  const subs = useAdminSelect<SubRow>(["email-subs"], () => supabase.from("email_subscriptions").select("id, email, topic, status, subscribed_at").order("subscribed_at", { ascending: false }).limit(200), view === "subs");
  const sups = useAdminSelect<SupRow>(["email-sups"], () => supabase.from("email_suppressions").select("*").order("created_at", { ascending: false }).limit(200), view === "sup");
  const [compose, setCompose] = useState({ topic: "newsletter", subject: "", body: "" });
  const [sendOpen, setSendOpen] = useState(false);
  const [supEmail, setSupEmail] = useState("");
  const [supOpen, setSupOpen] = useState(false);
  return (
    <div>
      <PageHeader title="E-posta" description="İşlem e-postaları ile pazarlama e-postaları ayrıdır; pazarlama e-postaları abonelik ve bastırma listesine uyar." actions={
        <NativeSelect className="w-48" value={view} onChange={(e) => setView(e.target.value as "outbox")}><option value="outbox">Gönderim kuyruğu</option><option value="subs">Aboneler</option><option value="sup">Bastırma listesi</option></NativeSelect>} />
      <div className="mb-6 space-y-3 rounded-xl border bg-card p-4">
        <p className="font-bold">Bülten / duyuru e-postası</p>
        <NativeSelect className="w-48" value={compose.topic} onChange={(e) => setCompose({ ...compose, topic: e.target.value })}><option value="newsletter">Bülten</option><option value="announcements">Duyuru</option></NativeSelect>
        <Input placeholder="Konu" value={compose.subject} onChange={(e) => setCompose({ ...compose, subject: e.target.value })} />
        <Textarea rows={6} placeholder="İçerik (paragrafları boş satırla ayırın)" value={compose.body} onChange={(e) => setCompose({ ...compose, body: e.target.value })} />
        <Button disabled={compose.subject.length < 3 || compose.body.length < 10} onClick={() => setSendOpen(true)}>Kuyruğa al</Button>
      </div>
      {view === "outbox" && <QueryState q={outbox} empty={outbox.data?.rows.length === 0}>
        <Table><thead><tr><Th>Tarih</Th><Th>Alıcı</Th><Th>Tür</Th><Th>Şablon</Th><Th>Durum</Th><Th>Hata</Th></tr></thead>
          <tbody>{outbox.data?.rows.map((m) => <tr key={m.id}><Td>{formatDateTime(m.created_at)}</Td><Td>{m.to_email}</Td><Td>{m.category === "marketing" ? "Pazarlama" : "İşlem"}</Td><Td>{m.template}</Td><Td><Badge variant={m.status === "sent" ? "success" : m.status === "failed" ? "destructive" : "muted"}>{m.status}</Badge></Td><Td className="text-xs">{m.error ?? ""}</Td></tr>)}</tbody></Table>
      </QueryState>}
      {view === "subs" && <QueryState q={subs} empty={subs.data?.rows.length === 0}>
        <Table><thead><tr><Th>E-posta</Th><Th>Konu</Th><Th>Durum</Th><Th>Tarih</Th></tr></thead>
          <tbody>{subs.data?.rows.map((s) => <tr key={s.id}><Td>{s.email}</Td><Td>{s.topic}</Td><Td>{s.status}</Td><Td>{formatDateTime(s.subscribed_at)}</Td></tr>)}</tbody></Table>
      </QueryState>}
      {view === "sup" && <>
        <div className="mb-3 flex gap-2"><Input className="w-72" placeholder="E-posta" value={supEmail} onChange={(e) => setSupEmail(e.target.value)} /><Button variant="outline" disabled={!supEmail.includes("@")} onClick={() => setSupOpen(true)}>Bastırma listesine ekle</Button></div>
        <QueryState q={sups} empty={sups.data?.rows.length === 0}>
          <Table><thead><tr><Th>E-posta</Th><Th>Neden</Th><Th>Kapsam</Th><Th>Tarih</Th></tr></thead>
            <tbody>{sups.data?.rows.map((s) => <tr key={s.id}><Td>{s.email}</Td><Td>{s.reason}</Td><Td>{s.scope}</Td><Td>{formatDateTime(s.created_at)}</Td></tr>)}</tbody></Table>
        </QueryState>
      </>}
      <ReasonDialog open={sendOpen} onOpenChange={setSendOpen} title="E-posta gönderimi kuyruğa alınsın mı?" onConfirm={async (reason) => {
        const n = await rpc<number>("admin_queue_newsletter", { p_topic: compose.topic, p_subject: compose.subject, p_body: compose.body, p_reason: reason });
        toast.success(`${n} aboneye gönderim kuyruğa alındı.`); setCompose({ ...compose, subject: "", body: "" }); void qc.invalidateQueries({ queryKey: ["admin", "email-outbox"] });
      }} />
      <ReasonDialog open={supOpen} onOpenChange={setSupOpen} title={`${supEmail} bastırma listesine eklensin mi?`} onConfirm={async (reason) => {
        await rpc("admin_add_email_suppression", { p_email: supEmail, p_scope: "all", p_reason: reason }); toast.success("Eklendi."); setSupEmail(""); void qc.invalidateQueries({ queryKey: ["admin", "email-sups"] });
      }}>
        <Label className="text-xs text-muted-foreground">Kapsam: tüm e-postalar (işlem e-postaları dahil)</Label>
      </ReasonDialog>
    </div>
  );
}
