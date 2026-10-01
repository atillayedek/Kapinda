// Destek sohbeti — yalnız konuşmanın katılımcıları okuyabilir (RLS); Realtime kanalı konuşmaya özeldir.
import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { SupportStatusLabels } from "@kapinda/shared-contracts";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { useRealtimeTable } from "@/hooks/useRealtime";
import { cn, formatDateTime } from "@/lib/utils";
import type { SupportConversation, SupportMessage } from "@/types/db";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/misc";

export function SupportChat({ conversation, viewer }: { conversation: SupportConversation; viewer: "customer" | "admin" }) {
  const qc = useQueryClient();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const messages = useQuery({
    queryKey: ["support-messages", conversation.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("support_messages").select("*").eq("conversation_id", conversation.id).order("created_at");
      if (error) throw toAppError(error);
      return (data ?? []) as SupportMessage[];
    },
  });
  const refresh = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["support-messages", conversation.id] });
    void qc.invalidateQueries({ queryKey: ["support-conversations"] });
  }, [qc, conversation.id]);
  useRealtimeTable({ channel: `support:${conversation.id}`, table: "support_messages", filter: `conversation_id=eq.${conversation.id}`, event: "INSERT", onChange: refresh });
  useEffect(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), [messages.data?.length]);

  const send = async () => {
    if (!body.trim()) return;
    setBusy(true);
    try {
      await rpc("send_support_message", { p_conversation_id: conversation.id, p_body: body.trim() });
      setBody("");
      refresh();
    } catch (e) {
      toast.error(errorMessage(e));
      void supabase.rpc("log_client_event", { p_source: viewer === "admin" ? "admin_web" : "customer_web", p_type: "support_failure", p_severity: "warning", p_message: "Destek mesajı gönderilemedi", p_context: {} });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-[70vh] flex-col rounded-xl border bg-card">
      <div className="flex items-center justify-between gap-2 border-b p-3">
        <div>
          <p className="font-semibold">{conversation.subject}</p>
          <p className="text-xs text-muted-foreground">{formatDateTime(conversation.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={conversation.status === "resolved" ? "success" : "default"}>{SupportStatusLabels[conversation.status]}</Badge>
          {conversation.status !== "resolved" && (
            <Button size="sm" variant="outline" onClick={async () => { await rpc("set_support_status", { p_conversation_id: conversation.id, p_status: "resolved" }); refresh(); }}>Çözüldü</Button>
          )}
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto p-3">
        {messages.isLoading && <Skeleton className="h-20" />}
        {messages.data?.map((m) => {
          const mine = m.sender_role === viewer;
          return (
            <div key={m.id} className={cn("max-w-[80%] rounded-xl px-3 py-2 text-sm", mine ? "ml-auto bg-primary text-primary-foreground" : "bg-muted")}>
              <p className="whitespace-pre-wrap break-words">{m.body}</p>
              <p className={cn("mt-1 text-[10px]", mine ? "text-primary-foreground/70" : "text-muted-foreground")}>{m.sender_role === "admin" ? "Destek" : "Müşteri"} · {formatDateTime(m.created_at)}</p>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); void send(); }}>
        <Textarea rows={2} maxLength={4000} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Mesajınızı yazın" className="min-h-0" aria-label="Mesaj" />
        <Button type="submit" size="icon" disabled={busy || !body.trim()} aria-label="Gönder"><Send /></Button>
      </form>
    </div>
  );
}
