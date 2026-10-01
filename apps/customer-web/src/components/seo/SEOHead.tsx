import { Helmet } from "react-helmet-async";
import { env } from "@/lib/env";

interface SEOHeadProps {
  title: string;
  description: string;
  path: string;
  /** Özel sayfalar (admin, sepet, checkout, profil, siparişler, takip) noindex olmalıdır. */
  noindex?: boolean;
  image?: string;
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export function SEOHead({ title, description, path, noindex = false, image, jsonLd }: SEOHeadProps) {
  const url = `${env.siteUrl}${path === "/" ? "/" : path}`;
  const fullTitle = title.includes("Kapında") ? title : `${title} | Kapında`;
  const img = image ?? `${env.siteUrl}/icons/icon-512.png`;
  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={description} />
      <link rel="canonical" href={url} />
      <meta name="robots" content={noindex ? "noindex, nofollow" : "index, follow"} />
      <meta property="og:type" content="website" />
      <meta property="og:locale" content="tr_TR" />
      <meta property="og:site_name" content="Kapında" />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={img} />
      {jsonLd && <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>}
    </Helmet>
  );
}

export function PrivatePage({ title }: { title: string }) {
  return (
    <Helmet>
      <title>{`${title} | Kapında`}</title>
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
  );
}
