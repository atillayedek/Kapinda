import { useState, type ReactNode } from "react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatTile({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: string; tone?: "primary" | "accent" | "danger" }) {
  const toneCls = tone === "accent" ? "border-accent/50" : tone === "danger" ? "border-destructive/40" : tone === "primary" ? "border-primary/40" : "";
  return (
    <div className={`rounded-xl border bg-card p-4 ${toneCls}`}>
      <p className="text-xs font-semibold uppercase text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-extrabold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Admin tablo sorgusu: veri RLS ile yalnız admin'e açılır (UI kontrolü güvenlik değildir). */
export function useAdminSelect<T>(key: QueryKey, build: () => PromiseLike<{ data: unknown; error: unknown; count?: number | null }>, enabled = true) {
  return useQuery({
    queryKey: ["admin", ...key],
    enabled,
    queryFn: async () => {
      const { data, error, count } = await build();
      if (error) throw toAppError(error as { message?: string; code?: string });
      return { rows: (data ?? []) as T[], count: count ?? 0 };
    },
  });
}

export function QueryState({ q, empty, children }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown }; empty?: boolean; children: ReactNode }) {
  if (q.isLoading) return <Skeleton className="h-40" />;
  if (q.error) return <ErrorState message={errorMessage(q.error)} onRetry={() => void q.refetch()} />;
  if (empty) return <EmptyState title="Kayıt bulunmuyor." />;
  return <>{children}</>;
}

export type RangeKey = "today" | "week" | "month" | "custom";

export function rangeFor(key: RangeKey, custom?: { from: string; to: string }): { from: string; to: string } {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (key === "week") start.setDate(start.getDate() - 6);
  if (key === "month") start.setDate(start.getDate() - 29);
  if (key === "custom" && custom?.from && custom.to) {
    const to = new Date(custom.to);
    to.setDate(to.getDate() + 1);
    return { from: new Date(custom.from).toISOString(), to: to.toISOString() };
  }
  const end = new Date(now);
  end.setDate(end.getDate() + 1);
  end.setHours(0, 0, 0, 0);
  return { from: start.toISOString(), to: end.toISOString() };
}

export function RangeFilter({ value, onChange, custom, onCustom }: { value: RangeKey; onChange: (k: RangeKey) => void; custom: { from: string; to: string }; onCustom: (c: { from: string; to: string }) => void }) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <NativeSelect className="w-40" value={value} onChange={(e) => onChange(e.target.value as RangeKey)} aria-label="Tarih aralığı">
        <option value="today">Bugün</option>
        <option value="week">Son 7 gün</option>
        <option value="month">Son 30 gün</option>
        <option value="custom">Özel tarih</option>
      </NativeSelect>
      {value === "custom" && (
        <>
          <Input type="date" className="w-40" value={custom.from} onChange={(e) => onCustom({ ...custom, from: e.target.value })} aria-label="Başlangıç" />
          <Input type="date" className="w-40" value={custom.to} onChange={(e) => onCustom({ ...custom, to: e.target.value })} aria-label="Bitiş" />
        </>
      )}
    </div>
  );
}

/** Gerekçe zorunlu kritik işlem onayı */
export function ReasonDialog({ open, onOpenChange, title, description, confirmLabel = "Onayla", destructive, onConfirm, children }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: (reason: string) => Promise<void>;
  children?: ReactNode;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setReason(""); onOpenChange(o); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        <div>
          <Label htmlFor="reason">Gerekçe (zorunlu, en az 10 karakter — audit kaydına yazılır)</Label>
          <Textarea id="reason" className="mt-1.5" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={1000} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Vazgeç</Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={reason.trim().length < 10 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm(reason.trim());
                setReason("");
                onOpenChange(false);
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function Pager({ page, total, size, onPage }: { page: number; total: number; size: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-end gap-3 text-sm">
      <Button variant="outline" size="sm" disabled={page === 0} onClick={() => onPage(page - 1)}>Önceki</Button>
      <span>{page + 1} / {pages} · {total} kayıt</span>
      <Button variant="outline" size="sm" disabled={page + 1 >= pages} onClick={() => onPage(page + 1)}>Sonraki</Button>
    </div>
  );
}

export { supabase };
