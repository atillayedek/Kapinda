import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Headphones, Plus } from "lucide-react";
import { toast } from "sonner";
import { PrivatePage } from "@/components/seo/SEOHead";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";
import { formatDateTime, cn } from "@/lib/utils";
import type { SupportConversation } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState, Skeleton } from "@/components/ui/misc";
import { SupportChat } from "./SupportChat";
import { BRAND } from "@/lib/env";

export default function SupportPage() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  const orderId = params.get("siparis");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(Boolean(orderId));
  const [subject, setSubject] = useState(orderId ? "Siparişim hakkında" : "");
  const [body, setBody] = useState("");
  const list = useQuery({
    queryKey: ["support-conversations", user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_conversations").select("*").eq("customer_id", user!.id).order("last_message_at", { ascending: false });
      if (error) throw toAppError(error);
      return (data ?? []) as SupportConversation[];
    },
  });
  const current = list.data?.find((c) => c.id === selected);

  const create = async () => {
    try {
      const id = await rpc<string>("create_support_conversation", { p_subject: subject.trim(), p_body: body.trim(), p_order_id: orderId });
      setCreating(false);
      setSubject("");
      setBody("");
      await list.refetch();
      setSelected(id);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div className="container max-w-4xl py-8">
      <PrivatePage title="Destek" />
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Destek</h1>
        <Button onClick={() => setCreating(true)}><Plus aria-hidden /> Yeni talep</Button>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Acil durumlar için: <a href={BRAND.supportPhoneHref} className="text-primary">{BRAND.supportPhone}</a></p>
      <div className="mt-6 grid gap-4 md:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          {list.isLoading && <Skeleton className="h-24" />}
          {list.data?.length === 0 && !creating && <EmptyState icon={Headphones} title="Henüz destek talebiniz yok." />}
          {list.data?.map((c) => (
            <button key={c.id} onClick={() => { setSelected(c.id); setCreating(false); }} className={cn("w-full rounded-xl border bg-card p-3 text-left text-sm", selected === c.id && "border-primary")}>
              <p className="font-semibold">{c.subject}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(c.last_message_at)}</p>
            </button>
          ))}
        </div>
        <div>
          {creating ? (
            <form className="space-y-3 rounded-xl border bg-card p-4" onSubmit={(e) => { e.preventDefault(); void create(); }}>
              <div>
                <Label htmlFor="subject">Konu</Label>
                <Input id="subject" className="mt-1.5" minLength={3} maxLength={160} required value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="body">Mesaj</Label>
                <Textarea id="body" className="mt-1.5" rows={5} maxLength={4000} required value={body} onChange={(e) => setBody(e.target.value)} />
              </div>
              <Button type="submit" disabled={subject.trim().length < 3 || !body.trim()}>Gönder</Button>
            </form>
          ) : current ? (
            <SupportChat conversation={current} viewer="customer" />
          ) : (
            <EmptyState title="Bir konuşma seçin veya yeni talep oluşturun." />
          )}
        </div>
      </div>
    </div>
  );
}
