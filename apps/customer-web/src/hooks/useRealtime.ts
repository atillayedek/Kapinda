// Realtime aboneliği: kanal kaynağa özgüdür, yetkilendirme sunucuda RLS ile yapılır; bileşen kapanınca kanal temizlenir.
import { useEffect } from "react";
import { supabase } from "@/lib/supabase";

export function useRealtimeTable(opts: {
  channel: string;
  table: string;
  filter?: string;
  enabled?: boolean;
  event?: "INSERT" | "UPDATE" | "*";
  onChange: (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => void;
}) {
  const { channel, table, filter, enabled = true, event = "*", onChange } = opts;
  useEffect(() => {
    if (!enabled) return;
    const ch = supabase
      .channel(channel)
      .on(
        "postgres_changes" as never,
        { event, schema: "public", table, ...(filter ? { filter } : {}) },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown>; eventType: string }) => onChange(payload),
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          void supabase.rpc("log_client_event", {
            p_source: "customer_web",
            p_type: "realtime_failure",
            p_severity: "warning",
            p_message: `Realtime ${status}`,
            p_context: { table },
          });
        }
      });
    return () => {
      void supabase.removeChannel(ch);
    };
    // onChange bilinçli olarak bağımlılık dışı: çağıran taraf stabil callback verir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, table, filter, enabled, event]);
}
