import { useParams } from "react-router-dom";
import { SEOHead } from "@/components/seo/SEOHead";
import { useCurrentLegalDocuments } from "./useLegalDocuments";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/errorMessages";
import { formatDate } from "@/lib/utils";

const TITLES: Record<string, string> = {
  kvkk: "KVKK Aydınlatma Metni",
  acik_riza: "Açık Rıza Metni",
  kullanici_sozlesmesi: "Kullanıcı Sözleşmesi",
};

export default function LegalPage() {
  const { type = "" } = useParams();
  const { data, isLoading, error, refetch } = useCurrentLegalDocuments();
  const doc = data?.find((d) => d.document_type === type);
  return (
    <div className="container max-w-3xl py-10">
      <SEOHead title={TITLES[type] ?? "Yasal"} description={`Kapında ${TITLES[type] ?? "yasal metin"}.`} path={`/yasal/${type}`} />
      {isLoading && <Skeleton className="h-64" />}
      {error && <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />}
      {!isLoading && !error && !doc && <EmptyState title="Doküman bulunamadı." />}
      {doc && (
        <article className="space-y-4">
          <h1 className="text-3xl font-extrabold">{doc.title}</h1>
          <p className="text-sm text-muted-foreground">Sürüm: {doc.version} · {formatDate(doc.version.slice(0, 10))}</p>
          <div className="whitespace-pre-line leading-relaxed">{doc.content}</div>
        </article>
      )}
    </div>
  );
}
