// Kayıt sırasında onay sürümü eşleşmediyse veya doküman güncellendiyse, devam etmeden önce güncel sürümler onaylatılır.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ErrorState, Skeleton } from "@/components/ui/misc";
import { rpc } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";
import { consentMap, useCurrentLegalDocuments } from "@/features/legal/useLegalDocuments";
import { AuthLayout } from "./AuthLayout";

export function ConsentGate() {
  const docs = useCurrentLegalDocuments();
  const { refreshProfile, signOut } = useAuth();
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const required = (docs.data ?? []).filter((d) => ["kvkk", "acik_riza", "kullanici_sozlesmesi"].includes(d.document_type));
  const all = required.length === 3 && required.every((d) => checked[d.document_type]);

  const accept = async () => {
    setBusy(true);
    setError(null);
    try {
      const ok = await rpc<boolean>("accept_legal_documents", { p_consents: consentMap(required) });
      if (!ok) throw new Error("KPD_CONSENT_REQUIRED");
      refreshProfile();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthLayout title="Sözleşmeleri onayla" description="Devam etmek için güncel yasal metinleri onaylamanız gerekiyor.">
      {docs.isLoading ? (
        <Skeleton className="h-40" />
      ) : (
        <div className="space-y-4">
          {required.map((d) => (
            <div key={d.document_type} className="flex items-start gap-3">
              <Checkbox id={d.document_type} checked={checked[d.document_type] === true} onCheckedChange={(c) => setChecked((p) => ({ ...p, [d.document_type]: c === true }))} />
              <Label htmlFor={d.document_type} className="font-normal leading-snug">
                <Link to={`/yasal/${d.document_type}`} target="_blank" className="font-semibold text-primary underline">{d.title}</Link> (sürüm {d.version}) metnini okudum ve kabul ediyorum.
              </Label>
            </div>
          ))}
          {error && <ErrorState message={error} />}
          <Button className="w-full" disabled={!all || busy} onClick={accept}>Onayla ve devam et</Button>
          <Button variant="ghost" className="w-full" onClick={() => void signOut()}>Çıkış yap</Button>
        </div>
      )}
    </AuthLayout>
  );
}
