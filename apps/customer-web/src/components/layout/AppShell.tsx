import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Home, Search, ReceiptText, User, ShoppingBasket, WifiOff, Shield } from "lucide-react";
import { Logo } from "./Logo";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { useOnline } from "@/hooks/useOnline";
import { BRAND } from "@/lib/env";
import { Button } from "@/components/ui/button";
import { cn, formatTry } from "@/lib/utils";

function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div role="status" className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-warning px-4 py-2 text-sm font-semibold text-warning-foreground">
      <WifiOff className="h-4 w-4" aria-hidden /> İnternet bağlantısı yok. Sipariş vermek için bağlantı gereklidir.
    </div>
  );
}

function Header() {
  const { user, isAdmin } = useAuth();
  const cart = useCart();
  return (
    <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm font-medium md:flex" aria-label="Ana menü">
          <NavLink to="/isletmeler" className={({ isActive }) => cn("hover:text-primary", isActive && "text-primary")}>
            İşletmeler
          </NavLink>
          <NavLink to="/ara" className={({ isActive }) => cn("hover:text-primary", isActive && "text-primary")}>
            Ara
          </NavLink>
          {user && (
            <NavLink to="/siparislerim" className={({ isActive }) => cn("hover:text-primary", isActive && "text-primary")}>
              Siparişlerim
            </NavLink>
          )}
          <NavLink to="/sss" className={({ isActive }) => cn("hover:text-primary", isActive && "text-primary")}>
            SSS
          </NavLink>
          {isAdmin && (
            <NavLink to="/admin" className="flex items-center gap-1 text-primary">
              <Shield className="h-4 w-4" aria-hidden /> Yönetim
            </NavLink>
          )}
        </nav>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="relative">
            <Link to="/sepet" aria-label={`Sepet, ${cart.itemCount} ürün`}>
              <ShoppingBasket aria-hidden />
              <span className="hidden sm:inline">{cart.itemCount > 0 ? formatTry(cart.subtotal) : "Sepet"}</span>
              {cart.itemCount > 0 && (
                <span className="absolute -right-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-xs text-accent-foreground">
                  {cart.itemCount}
                </span>
              )}
            </Link>
          </Button>
          {user ? (
            <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
              <Link to="/profil">
                <User aria-hidden /> Hesabım
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm" className="hidden md:inline-flex">
              <Link to="/giris">Giriş yap</Link>
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t bg-card pb-24 md:pb-8">
      <div className="container grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted-foreground">Hopa'da ihtiyacın olanlar Kapında. Yerel market ve esnaflardan sipariş ver, Kapında sana getirsin.</p>
        </div>
        <div>
          <p className="mb-3 font-semibold">Kapında</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/isletmeler" className="hover:text-primary">İşletmeler</Link></li>
            <li><Link to="/sss" className="hover:text-primary">Sıkça Sorulan Sorular</Link></li>
            <li><Link to="/iletisim" className="hover:text-primary">İletişim</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">Bize katılın</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><Link to="/esnaf-basvurusu" className="hover:text-primary">Esnaf başvurusu</Link></li>
            <li><Link to="/kurye-basvurusu" className="hover:text-primary">Kurye başvurusu</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-semibold">İletişim</p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li><a href={`mailto:${BRAND.supportEmail}`} className="hover:text-primary">{BRAND.supportEmail}</a></li>
            <li><a href={BRAND.supportPhoneHref} className="hover:text-primary">{BRAND.supportPhone}</a></li>
            <li><a href={BRAND.instagramUrl} target="_blank" rel="noopener noreferrer" className="hover:text-primary">@{BRAND.instagram}</a></li>
            <li>{BRAND.hoursLabel}</li>
          </ul>
        </div>
      </div>
      <div className="container flex flex-col gap-2 border-t py-6 text-xs text-muted-foreground sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Kapında · {BRAND.city} / {BRAND.province} {BRAND.postalCode}</p>
        <p className="flex flex-wrap gap-3">
          <Link to="/yasal/kvkk" className="hover:text-primary">KVKK</Link>
          <Link to="/yasal/acik_riza" className="hover:text-primary">Açık Rıza</Link>
          <Link to="/yasal/kullanici_sozlesmesi" className="hover:text-primary">Kullanıcı Sözleşmesi</Link>
        </p>
      </div>
    </footer>
  );
}

function MobileBottomNav() {
  const cart = useCart();
  const { pathname } = useLocation();
  const items = [
    { to: "/", label: "Ana Sayfa", icon: Home, end: true },
    { to: "/ara", label: "Ara", icon: Search },
    { to: "/siparislerim", label: "Siparişler", icon: ReceiptText },
    { to: "/profil", label: "Profil", icon: User },
  ];
  return (
    <>
      {cart.itemCount > 0 && pathname !== "/sepet" && pathname !== "/checkout" && (
        <Link
          to="/sepet"
          className="fixed bottom-20 left-4 right-4 z-40 flex items-center justify-between rounded-xl bg-primary px-4 py-3 text-primary-foreground shadow-lg md:hidden"
        >
          <span className="flex items-center gap-2 font-semibold">
            <ShoppingBasket className="h-5 w-5" aria-hidden /> Sepet ({cart.itemCount})
          </span>
          <span className="font-bold">{formatTry(cart.subtotal)}</span>
        </Link>
      )}
      <nav className="pb-safe fixed bottom-0 left-0 right-0 z-40 grid grid-cols-4 border-t bg-background md:hidden" aria-label="Alt menü">
        {items.map((it) => (
          <NavLink
            key={it.to}
            to={it.to}
            end={it.end}
            className={({ isActive }) => cn("flex flex-col items-center gap-1 pt-2 text-xs", isActive ? "text-primary" : "text-muted-foreground")}
          >
            <it.icon className="h-5 w-5" aria-hidden />
            {it.label}
          </NavLink>
        ))}
      </nav>
    </>
  );
}

export function AppShell() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#icerik" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-card focus:p-2">
        İçeriğe geç
      </a>
      <OfflineBanner />
      <Header />
      <main id="icerik" className="flex-1">
        <Outlet />
      </main>
      <Footer />
      <MobileBottomNav />
    </div>
  );
}
