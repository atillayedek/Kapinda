import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { RequireAdmin, RequireAuth } from "@/components/layout/Guards";
import { Spinner } from "@/components/ui/misc";
import LandingPage from "@/features/landing/LandingPage";
import { ContactPage, FaqPage, NotFoundPage } from "@/features/landing/StaticPages";
import VendorsPage from "@/features/vendors/VendorsPage";
import LegalPage from "@/features/legal/LegalPage";
import { CourierApplicationPage, VendorApplicationPage } from "@/features/applications/ApplicationPages";

const StorefrontPage = lazy(() => import("@/features/vendors/StorefrontPage"));
const SearchPage = lazy(() => import("@/features/search/SearchPage"));
const CartPage = lazy(() => import("@/features/cart/CartPage"));
const CheckoutPage = lazy(() => import("@/features/checkout/CheckoutPage"));
const MyOrdersPage = lazy(() => import("@/features/orders/MyOrdersPage"));
const OrderDetailPage = lazy(() => import("@/features/orders/OrderDetailPage"));
const PublicTrackingPage = lazy(() => import("@/features/tracking/PublicTrackingPage"));
const ProfilePage = lazy(() => import("@/features/profile/ProfilePage"));
const SupportPage = lazy(() => import("@/features/support/SupportPage"));
const LoginPage = lazy(() => import("@/features/auth/LoginPage"));
const RegisterPage = lazy(() => import("@/features/auth/RegisterPage"));
const ForgotPasswordPage = lazy(() => import("@/features/auth/PasswordPages").then((m) => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import("@/features/auth/PasswordPages").then((m) => ({ default: m.ResetPasswordPage })));
const AuthCallbackPage = lazy(() => import("@/features/auth/PasswordPages").then((m) => ({ default: m.AuthCallbackPage })));
const AdminApp = lazy(() => import("@/features/admin/AdminApp"));

const Loading = () => (
  <div className="grid min-h-[50vh] place-items-center">
    <Spinner />
  </div>
);

export function AppRoutes() {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/admin/*" element={<RequireAdmin><AdminApp /></RequireAdmin>} />
        <Route element={<AppShell />}>
          <Route index element={<LandingPage />} />
          <Route path="isletmeler" element={<VendorsPage />} />
          <Route path="isletme/:slug" element={<StorefrontPage />} />
          <Route path="ara" element={<SearchPage />} />
          <Route path="sss" element={<FaqPage />} />
          <Route path="iletisim" element={<ContactPage />} />
          <Route path="yasal/:type" element={<LegalPage />} />
          <Route path="esnaf-basvurusu" element={<VendorApplicationPage />} />
          <Route path="kurye-basvurusu" element={<CourierApplicationPage />} />
          <Route path="sepet" element={<CartPage />} />
          <Route path="checkout" element={<RequireAuth><CheckoutPage /></RequireAuth>} />
          <Route path="siparislerim" element={<RequireAuth><MyOrdersPage /></RequireAuth>} />
          <Route path="siparislerim/:id" element={<RequireAuth><OrderDetailPage /></RequireAuth>} />
          <Route path="siparis-takip/:token" element={<PublicTrackingPage />} />
          <Route path="profil" element={<RequireAuth><ProfilePage /></RequireAuth>} />
          <Route path="destek" element={<RequireAuth><SupportPage /></RequireAuth>} />
          <Route path="giris" element={<LoginPage />} />
          <Route path="kayit" element={<RegisterPage />} />
          <Route path="sifremi-unuttum" element={<ForgotPasswordPage />} />
          <Route path="sifre-yenile" element={<ResetPasswordPage />} />
          <Route path="auth/callback" element={<AuthCallbackPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}

/** Prerender edilen herkese açık sayfalar (sitemap ile aynı liste) */
export const PRERENDER_ROUTES = ["/", "/isletmeler", "/sss", "/iletisim", "/esnaf-basvurusu", "/kurye-basvurusu", "/yasal/kvkk", "/yasal/acik_riza", "/yasal/kullanici_sozlesmesi"];
