import { useQuery } from "@tanstack/react-query";
import { supabase, toAppError } from "@/lib/supabase";

export interface LegalDocument {
  document_type: string;
  version: string;
  title: string;
  content: string;
}

export function useCurrentLegalDocuments() {
  return useQuery({
    queryKey: ["legal-documents"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("legal_documents").select("document_type, version, title, content").eq("is_current", true);
      if (error) throw toAppError(error);
      return (data ?? []) as LegalDocument[];
    },
  });
}

/** Kayıt/onay sırasında gönderilecek {document_type: version} haritası */
export function consentMap(docs: LegalDocument[]): Record<string, string> {
  return Object.fromEntries(docs.filter((d) => ["kvkk", "acik_riza", "kullanici_sozlesmesi"].includes(d.document_type)).map((d) => [d.document_type, d.version]));
}
