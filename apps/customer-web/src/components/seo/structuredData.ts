// Gerçek bilgilere dayanan yapılandırılmış veri. Sahte puan/yorum şeması üretilmez.
import { BRAND, env } from "@/lib/env";

export function organizationLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: BRAND.name,
    url: env.siteUrl,
    logo: `${env.siteUrl}/icons/icon-512.png`,
    email: BRAND.supportEmail,
    telephone: BRAND.supportPhone.replace(/\s/g, ""),
    sameAs: [BRAND.instagramUrl],
  };
}

export function websiteLd() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: BRAND.name, url: env.siteUrl, inLanguage: "tr-TR" };
}

export function localBusinessLd() {
  return {
    "@context": "https://schema.org",
    "@type": ["LocalBusiness", "OnlineStore"],
    name: BRAND.name,
    url: env.siteUrl,
    image: `${env.siteUrl}/icons/icon-512.png`,
    email: BRAND.supportEmail,
    telephone: BRAND.supportPhone.replace(/\s/g, ""),
    address: { "@type": "PostalAddress", addressLocality: BRAND.city, addressRegion: BRAND.province, postalCode: BRAND.postalCode, addressCountry: "TR" },
    geo: { "@type": "GeoCoordinates", latitude: BRAND.center.lat, longitude: BRAND.center.lng },
    areaServed: { "@type": "City", name: BRAND.city },
    openingHoursSpecification: [
      {
        "@type": "OpeningHoursSpecification",
        dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
        opens: "09:00",
        closes: "23:00",
      },
    ],
  };
}

export function groceryStoreLd(v: { name: string; slug: string; address_text: string; lat: number | null; lng: number | null; business_type: string }) {
  return {
    "@context": "https://schema.org",
    "@type": v.business_type === "market" ? "GroceryStore" : "Store",
    name: v.name,
    url: `${env.siteUrl}/isletme/${v.slug}`,
    address: { "@type": "PostalAddress", streetAddress: v.address_text, addressLocality: BRAND.city, addressRegion: BRAND.province, addressCountry: "TR" },
    ...(v.lat !== null && v.lng !== null ? { geo: { "@type": "GeoCoordinates", latitude: v.lat, longitude: v.lng } } : {}),
  };
}

export function breadcrumbLd(items: Array<{ name: string; path: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: `${env.siteUrl}${it.path}` })),
  };
}

export function faqLd(items: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.a } })),
  };
}
