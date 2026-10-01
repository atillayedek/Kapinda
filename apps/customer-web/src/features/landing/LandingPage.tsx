import { Link } from "react-router-dom";
import { ArrowRight, Bike, Clock, MapPin, QrCode, ShieldCheck, Store, Wallet, Mail, Phone, Instagram } from "lucide-react";
import { SEOHead } from "@/components/seo/SEOHead";
import { faqLd, localBusinessLd, organizationLd, websiteLd } from "@/components/seo/structuredData";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, Skeleton } from "@/components/ui/misc";
import { errorMessage } from "@/lib/errorMessages";
import { VendorCard } from "@/features/vendors/VendorCard";
import { sellableCategories, useCategories, useServiceArea, useVendors } from "@/features/vendors/queries";
import { BRAND } from "@/lib/env";
import { formatTry } from "@/lib/utils";
import { FAQ } from "./faq";

const STEPS = [
  { icon: Store, title: "İşletmeni seç", text: "Hopa'daki market ve esnaflar arasından birini seç." },
  { icon: Wallet, title: "Sepetini oluştur", text: "Ürünleri ekle; teslimat ücretini online, ürün bedelini kapıda öde." },
  { icon: Bike, title: "Kapında getirsin", text: "Siparişin hazırlanınca kuryemiz yola çıkar, canlı takip et." },
  { icon: QrCode, title: "QR ile teslim al", text: "Teslimatta QR kodunu okut, siparişin güvenle tamamlansın." },
];

const ADVANTAGES = [
  { icon: MapPin, title: "Yerel esnaf", text: "Mahallendeki işletmeleri destekle." },
  { icon: Wallet, title: "Şeffaf ücret", text: "Teslimat ücreti mesafeye göre, sipariş öncesi net." },
  { icon: ShieldCheck, title: "Güvenli teslimat", text: "QR doğrulaması ile yalnızca sana teslim." },
  { icon: Clock, title: "Her gün açık", text: BRAND.hoursLabel },
];

export default function LandingPage() {
  const vendors = useVendors();
  const cats = useCategories();
  const area = useServiceArea();
  return (
    <>
      <SEOHead
        title="Kapında — Hopa'da ihtiyacın olanlar Kapında"
        description="Hopa'daki yerel market ve esnaflardan sipariş ver, Kapında sana getirsin. Her gün 09:00–23:00."
        path="/"
        jsonLd={[organizationLd(), websiteLd(), localBusinessLd(), faqLd(FAQ)]}
      />
      <section className="relative overflow-hidden bg-primary text-primary-foreground">
        <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/30 blur-3xl" aria-hidden />
        <div className="container relative grid gap-10 py-16 md:grid-cols-2 md:py-24">
          <div className="space-y-6">
            <p className="inline-flex items-center gap-2 rounded-full bg-primary-foreground/10 px-3 py-1 text-sm"><MapPin className="h-4 w-4" aria-hidden /> Hopa / Artvin</p>
            <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">Hopa'da ihtiyacın olanlar Kapında.</h1>
            <p className="max-w-md text-lg text-primary-foreground/85">Yerel market ve esnaflardan sipariş ver, Kapında sana getirsin.</p>
            <div className="flex flex-wrap gap-3">
              <Button asChild size="lg" variant="accent"><Link to="/isletmeler">Sipariş ver <ArrowRight aria-hidden /></Link></Button>
              <Button asChild size="lg" variant="outline" className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"><a href="#nasil-calisir">Nasıl çalışır?</a></Button>
            </div>
            <p className="text-sm text-primary-foreground/75">{BRAND.hoursLabel} · Minimum sepet 250 TL</p>
          </div>
          <div className="hidden items-center justify-center md:flex" aria-hidden>
            <div className="grid grid-cols-2 gap-4">
              {STEPS.map((s) => (
                <div key={s.title} className="rounded-2xl bg-primary-foreground/10 p-5 backdrop-blur">
                  <s.icon className="h-8 w-8 text-accent" />
                  <p className="mt-3 font-bold">{s.title}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="nasil-calisir" className="container py-16">
        <h2 className="text-3xl font-extrabold">Nasıl çalışır?</h2>
        <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-xl border bg-card p-5">
              <span className="text-sm font-bold text-accent-foreground/70">{i + 1}. adım</span>
              <s.icon className="mt-3 h-8 w-8 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="bg-card py-16">
        <div className="container">
          <div className="flex items-end justify-between gap-4">
            <h2 className="text-3xl font-extrabold">İşletmeler</h2>
            <Link to="/isletmeler" className="text-sm font-semibold text-primary">Tümünü gör</Link>
          </div>
          <div className="mt-8">
            {vendors.error ? (
              <ErrorState message={errorMessage(vendors.error)} onRetry={() => vendors.refetch()} />
            ) : vendors.isLoading || !vendors.data ? (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-52" />)}</div>
            ) : vendors.data.length === 0 ? (
              <EmptyState icon={Store} title="Henüz işletme bulunmuyor." description="İlk işletmelerimiz çok yakında burada. İşletmen varsa hemen başvur!" action={<Button asChild><Link to="/esnaf-basvurusu">Esnaf başvurusu</Link></Button>} />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{vendors.data.slice(0, 6).map((v) => <VendorCard key={v.id} vendor={v} />)}</div>
            )}
          </div>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-3xl font-extrabold">Kategoriler</h2>
        <div className="mt-8 flex flex-wrap gap-3">
          {cats.error ? (
            <ErrorState message={errorMessage(cats.error)} onRetry={() => cats.refetch()} />
          ) : cats.isLoading || !cats.data ? (
            <Skeleton className="h-10 w-full" />
          ) : (
            sellableCategories(cats.data).map((c) => (
              <span key={c.id} className="rounded-full border bg-card px-4 py-2 text-sm font-medium">{c.name}</span>
            ))
          )}
        </div>
      </section>

      <section className="bg-secondary py-16">
        <div className="container grid gap-8 md:grid-cols-2">
          <div>
            <h2 className="text-3xl font-extrabold">Teslimat bölgeleri</h2>
            <p className="mt-3 text-muted-foreground">Şu anda aşağıdaki bölgelerde hizmet veriyoruz. Yeni ilçeler yakında ekleniyor.</p>
            <ul className="mt-6 space-y-3">
              {area.error ? (
                <ErrorState message={errorMessage(area.error)} onRetry={() => area.refetch()} />
              ) : area.isLoading || !area.data ? (
                <Skeleton className="h-16" />
              ) : area.data.areas.length === 0 ? (
                <li className="text-sm text-muted-foreground">Henüz aktif teslimat bölgesi bulunmuyor.</li>
              ) : (
                area.data.areas.map((a) => (
                  <li key={a.id} className="rounded-xl bg-card p-4">
                    <p className="font-bold">{a.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.opens_at.slice(0, 5)}–{a.closes_at.slice(0, 5)} · {Number(a.max_radius_km)} km yarıçap · minimum sepet {formatTry(a.min_basket_amount)}
                    </p>
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="rounded-2xl bg-card p-6">
            <h3 className="text-xl font-bold">Teslimat ücreti</h3>
            <ul className="mt-4 space-y-2 text-sm">
              <li>0–2 km: <strong>120 TL</strong></li>
              <li>2 km sonrası: her km için <strong>+10 TL</strong></li>
              <li>En fazla teslimat mesafesi: <strong>15 km</strong></li>
            </ul>
            <p className="mt-4 text-xs text-muted-foreground">Kesin ücret, adresinize göre sipariş sırasında sunucuda hesaplanır. Ürün bedeli kapıda ödenir.</p>
          </div>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-3xl font-extrabold">Neden Kapında?</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {ADVANTAGES.map((a) => (
            <div key={a.title} className="rounded-xl border bg-card p-5">
              <a.icon className="h-8 w-8 text-primary" aria-hidden />
              <h3 className="mt-3 font-bold">{a.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{a.text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="container grid gap-4 pb-16 md:grid-cols-2">
        <div className="rounded-2xl bg-accent p-8 text-accent-foreground">
          <Store className="h-10 w-10" aria-hidden />
          <h2 className="mt-4 text-2xl font-extrabold">Esnaf başvurusu</h2>
          <p className="mt-2">Marketini, manavını ya da fırınını Kapında'ya taşı, Hopa'nın her yerine ulaş.</p>
          <Button asChild className="mt-6"><Link to="/esnaf-basvurusu">Başvur</Link></Button>
        </div>
        <div className="rounded-2xl bg-primary p-8 text-primary-foreground">
          <Bike className="h-10 w-10" aria-hidden />
          <h2 className="mt-4 text-2xl font-extrabold">Kurye başvurusu</h2>
          <p className="mt-2">Esnek saatlerle Hopa'da teslimat yap, kazanmaya başla.</p>
          <Button asChild variant="accent" className="mt-6"><Link to="/kurye-basvurusu">Başvur</Link></Button>
        </div>
      </section>

      <section className="bg-card py-16">
        <div className="container max-w-3xl">
          <h2 className="text-3xl font-extrabold">Sıkça sorulan sorular</h2>
          <div className="mt-8 divide-y rounded-xl border">
            {FAQ.slice(0, 6).map((f) => (
              <details key={f.q} className="group p-4">
                <summary className="cursor-pointer list-none font-semibold">{f.q}</summary>
                <p className="mt-2 text-sm text-muted-foreground">{f.a}</p>
              </details>
            ))}
          </div>
          <Link to="/sss" className="mt-4 inline-block text-sm font-semibold text-primary">Tüm sorular</Link>
        </div>
      </section>

      <section className="container py-16">
        <h2 className="text-3xl font-extrabold">İletişim</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          <a href={`mailto:${BRAND.supportEmail}`} className="flex items-center gap-3 rounded-xl border bg-card p-5"><Mail className="h-6 w-6 text-primary" aria-hidden />{BRAND.supportEmail}</a>
          <a href={BRAND.supportPhoneHref} className="flex items-center gap-3 rounded-xl border bg-card p-5"><Phone className="h-6 w-6 text-primary" aria-hidden />{BRAND.supportPhone}</a>
          <a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-xl border bg-card p-5"><Instagram className="h-6 w-6 text-primary" aria-hidden />@{BRAND.instagram}</a>
        </div>
      </section>
    </>
  );
}
