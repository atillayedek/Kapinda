import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Gift, LogOut, MapPin, Monitor, User, Copy } from "lucide-react";
import { toast } from "sonner";
import { phoneSchema } from "@kapinda/shared-validation";
import { PrivatePage } from "@/components/seo/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errorMessages";
import { enablePush, pushEnabledLocally, pushSupported } from "@/lib/fcm";
import { formatDateTime } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { EmptyState, ErrorState, FieldError, Skeleton } from "@/components/ui/misc";
import { AddressList } from "./addresses";

const infoSchema = z.object({ fullName: z.string().trim().min(2, "Ad soyad zorunludur.").max(120), phone: phoneSchema });

function InfoTab() {
  const { profile, refreshProfile, user } = useAuth();
  const { register, handleSubmit, formState } = useForm<z.infer<typeof infoSchema>>({
    resolver: zodResolver(infoSchema),
    values: { fullName: profile?.full_name ?? "", phone: profile?.phone ?? "" },
  });
  const onSubmit = handleSubmit(async (v) => {
    const { error } = await supabase.from("profiles").update({ full_name: v.fullName, phone: v.phone }).eq("id", user!.id);
    if (error) toast.error(errorMessage(toAppError(error)));
    else {
      toast.success("Bilgileriniz güncellendi.");
      refreshProfile();
    }
  });
  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4" noValidate>
      <div>
        <Label>E-posta</Label>
        <Input value={profile?.email ?? ""} disabled className="mt-1.5" />
      </div>
      <div>
        <Label htmlFor="fullName">Ad soyad</Label>
        <Input id="fullName" className="mt-1.5" {...register("fullName")} />
        <FieldError message={formState.errors.fullName?.message} />
      </div>
      <div>
        <Label htmlFor="phone">Telefon</Label>
        <Input id="phone" type="tel" className="mt-1.5" {...register("phone")} />
        <FieldError message={formState.errors.phone?.message} />
      </div>
      <Button type="submit" disabled={formState.isSubmitting}>Kaydet</Button>
    </form>
  );
}

function NotificationsTab() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [pushOn, setPushOn] = useState(pushEnabledLocally());
  const prefs = useQuery({
    queryKey: ["prefs", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notification_preferences").select("order_updates_push, order_updates_email, marketing_push, marketing_email").eq("user_id", user!.id).maybeSingle();
      if (error) throw toAppError(error);
      return data ?? { order_updates_push: true, order_updates_email: true, marketing_push: false, marketing_email: false };
    },
  });
  const update = useMutation({
    mutationFn: async (patch: Record<string, boolean>) => {
      if ("marketing_email" in patch) {
        await rpc("set_my_newsletter", { p_subscribed: patch.marketing_email });
        return;
      }
      const { error } = await supabase.from("notification_preferences").upsert({ user_id: user!.id, ...prefs.data, ...patch });
      if (error) throw toAppError(error);
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["prefs"] }),
    onError: (e) => toast.error(errorMessage(e)),
  });
  const notifications = useQuery({
    queryKey: ["notifications", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("notifications").select("id, type, title, body, data, read_at, created_at").order("created_at", { ascending: false }).limit(30);
      if (error) throw toAppError(error);
      return data ?? [];
    },
  });

  const rows: Array<[keyof NonNullable<typeof prefs.data>, string]> = [
    ["order_updates_push", "Sipariş durumları için anlık bildirim"],
    ["order_updates_email", "Sipariş durumları için e-posta"],
    ["marketing_push", "Kampanya ve duyuru bildirimleri"],
    ["marketing_email", "Bülten ve kampanya e-postaları"],
  ];

  return (
    <div className="space-y-6">
      <div className="rounded-xl border bg-card p-4">
        <p className="font-semibold">Bu cihazda anlık bildirimler</p>
        {pushSupported() ? (
          <Button
            className="mt-3"
            variant={pushOn ? "outline" : "default"}
            disabled={pushOn}
            onClick={async () => {
              try {
                const r = await enablePush("customer");
                if (r === "enabled") {
                  setPushOn(true);
                  toast.success("Bildirimler etkinleştirildi.");
                } else if (r === "denied") toast.error("Bildirim izni verilmedi. Tarayıcı ayarlarından izin verebilirsiniz.");
                else toast.error("Bu tarayıcı anlık bildirimleri desteklemiyor.");
              } catch (e) {
                toast.error(errorMessage(e));
              }
            }}
          >
            <Bell aria-hidden /> {pushOn ? "Etkin" : "Bildirimleri aç"}
          </Button>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">Bu tarayıcıda anlık bildirimler kullanılamıyor.</p>
        )}
      </div>
      {prefs.isLoading ? <Skeleton className="h-40" /> : (
        <div className="divide-y rounded-xl border bg-card">
          {rows.map(([k, label]) => (
            <label key={k} className="flex items-center justify-between gap-4 p-4 text-sm">
              {label}
              <Switch checked={prefs.data?.[k] === true} onCheckedChange={(c) => update.mutate({ [k]: c })} />
            </label>
          ))}
        </div>
      )}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">Son bildirimler</h3>
          <Button variant="ghost" size="sm" onClick={async () => { await rpc("mark_notifications_read", { p_ids: null }); void notifications.refetch(); }}>Tümünü okundu say</Button>
        </div>
        {notifications.data?.length === 0 && <EmptyState icon={Bell} title="Henüz bildirim bulunmuyor." />}
        <ul className="mt-2 space-y-2">
          {notifications.data?.map((n) => (
            <li key={n.id} className={`rounded-lg border p-3 text-sm ${n.read_at ? "bg-card" : "border-primary/40 bg-primary/5"}`}>
              <p className="font-semibold">{n.title}</p>
              <p>{n.body}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(n.created_at)}</p>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function LoyaltyTab() {
  const summary = useQuery({
    queryKey: ["loyalty"],
    queryFn: () => rpc<{ referral_code: string; delivered_orders: number; order_milestone: number; referral_milestone: number; referrals_total: number; referrals_qualified: number; available_rewards: number }>("my_loyalty_summary"),
  });
  if (summary.isLoading) return <Skeleton className="h-40" />;
  if (summary.error) return <ErrorState message={errorMessage(summary.error)} />;
  const s = summary.data!;
  const toNext = s.order_milestone - ((s.delivered_orders % s.order_milestone) + 1);
  const link = `${env.siteUrl}/kayit?ref=${s.referral_code}`;
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-accent p-5 text-accent-foreground">
        <p className="text-sm">Kullanılabilir ücretsiz teslimat</p>
        <p className="text-4xl font-extrabold">{s.available_rewards}</p>
        <p className="mt-2 text-sm">
          {toNext <= 0 ? "Bir sonraki siparişinizde teslimat ücretsiz!" : `${toNext} sipariş daha tamamlayın, ${s.order_milestone}. siparişinizde teslimat ücretsiz.`}
        </p>
      </div>
      <div className="rounded-xl border bg-card p-5">
        <p className="font-bold">Arkadaşlarını davet et</p>
        <p className="text-sm text-muted-foreground">
          Davet ettiğin {s.referral_milestone} arkadaşın ilk siparişini tamamladığında ücretsiz teslimat kazanırsın. Doğrulanan davet: {s.referrals_qualified} / {s.referrals_total}
        </p>
        <div className="mt-3 flex gap-2">
          <Input readOnly value={s.referral_code} className="font-mono" aria-label="Davet kodu" />
          <Button variant="outline" onClick={async () => { await navigator.clipboard.writeText(link); toast.success("Davet bağlantısı kopyalandı."); }}><Copy aria-hidden /> Bağlantı</Button>
        </div>
      </div>
    </div>
  );
}

function SessionsTab() {
  const { signOut, session } = useAuth();
  const sessions = useQuery({ queryKey: ["sessions"], queryFn: () => rpc<Array<{ id: string; created_at: string; updated_at: string; user_agent: string | null; ip: string | null }>>("my_sessions") });
  const currentSessionId = (() => {
    try {
      return JSON.parse(atob(session!.access_token.split(".")[1]!)).session_id as string;
    } catch {
      return null;
    }
  })();
  return (
    <div className="space-y-3">
      {sessions.isLoading && <Skeleton className="h-24" />}
      {sessions.data?.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-3 rounded-xl border bg-card p-4 text-sm">
          <div>
            <p className="font-semibold">{s.user_agent?.slice(0, 80) ?? "Bilinmeyen cihaz"} {s.id === currentSessionId && <span className="text-primary">(bu cihaz)</span>}</p>
            <p className="text-muted-foreground">Son etkinlik: {formatDateTime(s.updated_at)}{s.ip ? ` · ${s.ip}` : ""}</p>
          </div>
          {s.id !== currentSessionId && (
            <Button variant="outline" size="sm" onClick={async () => { await rpc("revoke_session", { p_session_id: s.id }); void sessions.refetch(); toast.success("Oturum sonlandırıldı."); }}>Sonlandır</Button>
          )}
        </div>
      ))}
      <Button variant="outline" onClick={async () => { await supabase.auth.signOut({ scope: "others" }); void sessions.refetch(); toast.success("Diğer tüm oturumlar kapatıldı."); }}>Diğer tüm cihazlardan çıkış yap</Button>
      <Button variant="destructive" onClick={() => void signOut()}><LogOut aria-hidden /> Çıkış yap</Button>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <div className="container max-w-3xl py-8">
      <PrivatePage title="Profil" />
      <h1 className="text-3xl font-extrabold">Hesabım</h1>
      <Tabs defaultValue="info" className="mt-6">
        <TabsList className="w-full justify-start">
          <TabsTrigger value="info"><User className="mr-1 h-4 w-4" aria-hidden />Bilgiler</TabsTrigger>
          <TabsTrigger value="addresses"><MapPin className="mr-1 h-4 w-4" aria-hidden />Adresler</TabsTrigger>
          <TabsTrigger value="notifications"><Bell className="mr-1 h-4 w-4" aria-hidden />Bildirimler</TabsTrigger>
          <TabsTrigger value="loyalty"><Gift className="mr-1 h-4 w-4" aria-hidden />Davet & Sadakat</TabsTrigger>
          <TabsTrigger value="sessions"><Monitor className="mr-1 h-4 w-4" aria-hidden />Oturumlar</TabsTrigger>
        </TabsList>
        <TabsContent value="info" className="mt-6"><InfoTab /></TabsContent>
        <TabsContent value="addresses" className="mt-6"><AddressList /></TabsContent>
        <TabsContent value="notifications" className="mt-6"><NotificationsTab /></TabsContent>
        <TabsContent value="loyalty" className="mt-6"><LoyaltyTab /></TabsContent>
        <TabsContent value="sessions" className="mt-6"><SessionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
