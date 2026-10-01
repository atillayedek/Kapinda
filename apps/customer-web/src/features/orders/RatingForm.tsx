import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { supabase, rpc, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

function Stars({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} yıldız`} onClick={() => onChange(n)}>
          <Star className={cn("h-7 w-7", n <= value ? "fill-accent text-accent" : "text-muted-foreground")} />
        </button>
      ))}
    </div>
  );
}

function TargetRating({ orderId, target, title, existing }: { orderId: string; target: "vendor" | "courier"; title: string; existing?: { score: number; comment: string | null } }) {
  const qc = useQueryClient();
  const [score, setScore] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  if (existing) {
    return (
      <div className="rounded-lg bg-muted/50 p-3 text-sm">
        <p className="font-semibold">{title}</p>
        <p>{"★".repeat(existing.score)}{"☆".repeat(5 - existing.score)} {existing.comment && `— ${existing.comment}`}</p>
      </div>
    );
  }
  return (
    <form
      className="space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (score < 1) return;
        setBusy(true);
        try {
          await rpc("submit_rating", { p_order_id: orderId, p_target: target, p_score: score, p_comment: comment.trim() || null });
          toast.success("Değerlendirmeniz için teşekkürler.");
          void qc.invalidateQueries({ queryKey: ["ratings", orderId] });
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <p className="font-semibold">{title}</p>
      <Stars value={score} onChange={setScore} label={title} />
      <Textarea maxLength={500} placeholder="Yorumunuz (isteğe bağlı, en fazla 500 karakter)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <Button type="submit" size="sm" disabled={score < 1 || busy}>Gönder</Button>
    </form>
  );
}

export function RatingForm({ orderId, hasCourier }: { orderId: string; hasCourier: boolean }) {
  const ratings = useQuery({
    queryKey: ["ratings", orderId],
    queryFn: async () => {
      const { data, error } = await supabase.from("ratings").select("target_type, score, comment").eq("order_id", orderId);
      if (error) throw toAppError(error);
      return data ?? [];
    },
  });
  const find = (t: string) => ratings.data?.find((r) => r.target_type === t);
  return (
    <div className="space-y-4 rounded-xl border bg-card p-4">
      <h2 className="text-lg font-bold">Siparişi değerlendir</h2>
      <TargetRating orderId={orderId} target="vendor" title="İşletme" existing={find("vendor")} />
      {hasCourier && <TargetRating orderId={orderId} target="courier" title="Kurye" existing={find("courier")} />}
    </div>
  );
}
