import { Mail, Phone, Instagram, Clock, MapPin } from "lucide-react";
import { useState } from "react";
import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbLd, faqLd, localBusinessLd } from "@/components/seo/structuredData";
import { BRAND } from "@/lib/env";
import { FAQ } from "./faq";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { invokeFunction } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { toast } from "sonner";

export function FaqPage() {
  return (
    <div className="container max-w-3xl py-10">
      <SEOHead title="Sıkça sorulan sorular" description="Kapında ile sipariş, ödeme, teslimat ücreti ve QR teslimat hakkında sıkça sorulan sorular." path="/sss"
        jsonLd={[faqLd(FAQ), breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "SSS", path: "/sss" }])]} />
      <h1 className="text-3xl font-extrabold">Sıkça sorulan sorular</h1>
      <div className="mt-8 divide-y rounded-xl border bg-card">
        {FAQ.map((f) => (
          <details key={f.q} className="p-4">
            <summary className="cursor-pointer list-none font-semibold">{f.q}</summary>
            <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </div>
    </div>
  );
}

function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await invokeFunction("newsletter-subscribe", { email, consent });
          toast.success("Bülten aboneliğiniz alındı.");
          setEmail("");
        } catch (err) {
          toast.error(errorMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <Label htmlFor="nl-email">Kampanya ve duyurular için bültene katılın</Label>
      <div className="flex gap-2">
        <Input id="nl-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-posta adresiniz" />
        <Button type="submit" disabled={busy || !consent}>Abone ol</Button>
      </div>
      <div className="flex items-start gap-2">
        <Checkbox id="nl-consent" checked={consent} onCheckedChange={(c) => setConsent(c === true)} />
        <Label htmlFor="nl-consent" className="text-xs font-normal">Ticari elektronik ileti almayı kabul ediyorum. İstediğim zaman abonelikten çıkabilirim.</Label>
      </div>
    </form>
  );
}

export function ContactPage() {
  return (
    <div className="container max-w-3xl py-10">
      <SEOHead title="İletişim" description="Kapında destek: destek@kapinda.site, +90 531 870 1189. Hopa / Artvin, her gün 09:00–23:00." path="/iletisim"
        jsonLd={[localBusinessLd(), breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "İletişim", path: "/iletisim" }])]} />
      <h1 className="text-3xl font-extrabold">İletişim</h1>
      <ul className="mt-8 space-y-4">
        <li className="flex items-center gap-3"><Mail className="h-5 w-5 text-primary" aria-hidden /><a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></li>
        <li className="flex items-center gap-3"><Phone className="h-5 w-5 text-primary" aria-hidden /><a href={BRAND.supportPhoneHref}>{BRAND.supportPhone}</a></li>
        <li className="flex items-center gap-3"><Instagram className="h-5 w-5 text-primary" aria-hidden /><a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer">@{BRAND.instagram}</a></li>
        <li className="flex items-center gap-3"><Clock className="h-5 w-5 text-primary" aria-hidden />{BRAND.hoursLabel}</li>
        <li className="flex items-center gap-3"><MapPin className="h-5 w-5 text-primary" aria-hidden />{BRAND.city} / {BRAND.province} {BRAND.postalCode}</li>
      </ul>
      <div className="mt-10 rounded-xl border bg-card p-5"><NewsletterForm /></div>
    </div>
  );
}

export function NotFoundPage() {
  return (
    <div className="container py-20 text-center">
      <SEOHead title="Sayfa bulunamadı" description="Aradığınız sayfa bulunamadı." path="/404" noindex />
      <h1 className="text-4xl font-extrabold">Sayfa bulunamadı</h1>
      <p className="mt-2 text-muted-foreground">Aradığınız sayfa taşınmış veya kaldırılmış olabilir.</p>
      <Button asChild className="mt-6"><a href="/">Ana sayfaya dön</a></Button>
    </div>
  );
}
