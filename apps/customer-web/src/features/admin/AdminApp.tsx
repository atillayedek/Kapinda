import { lazy, Suspense } from "react";
import { NavLink, Navigate, Route, Routes, Link } from "react-router-dom";
import { Activity, AlertTriangle, BarChart3, Bell, Bike, ClipboardList, CreditCard, FileSearch, Gift, Headphones, LayoutDashboard, Mail, MapPinned, Package, Percent, Receipt, Scale, Settings, ShieldCheck, Store, Tags, Users, UserPlus, Wallet, ArrowLeft } from "lucide-react";
import { PrivatePage } from "@/components/seo/SEOHead";
import { Spinner } from "@/components/ui/misc";
import { cn } from "@/lib/utils";

const DashboardTab = lazy(() => import("./DashboardTab"));
const LiveOpsTab = lazy(() => import("./LiveOpsTab"));
const OrdersTab = lazy(() => import("./OrdersTab"));
const People = () => import("./PeopleTabs");
const Catalog = () => import("./CatalogTabs");
const Finance = () => import("./FinanceTabs");
const Comms = () => import("./CommsTabs");
const System = () => import("./SystemTabs");
const IncidentsTab = lazy(() => People().then((m) => ({ default: m.IncidentsTab })));
const CouriersTab = lazy(() => People().then((m) => ({ default: m.CouriersTab })));
const VendorsTab = lazy(() => People().then((m) => ({ default: m.VendorsTab })));
const CustomersTab = lazy(() => People().then((m) => ({ default: m.CustomersTab })));
const ApplicationsTab = lazy(() => People().then((m) => ({ default: m.ApplicationsTab })));
const ProductsTab = lazy(() => Catalog().then((m) => ({ default: m.ProductsTab })));
const CategoriesTab = lazy(() => Catalog().then((m) => ({ default: m.CategoriesTab })));
const FinanceTab = lazy(() => Finance().then((m) => ({ default: m.FinanceTab })));
const PaymentsTab = lazy(() => Finance().then((m) => ({ default: m.PaymentsTab })));
const CommissionsTab = lazy(() => Finance().then((m) => ({ default: m.CommissionsTab })));
const SettlementsTab = lazy(() => Finance().then((m) => ({ default: m.SettlementsTab })));
const LoyaltyTab = lazy(() => Finance().then((m) => ({ default: m.LoyaltyTab })));
const ReferralsTab = lazy(() => Finance().then((m) => ({ default: m.ReferralsTab })));
const SupportTab = lazy(() => Comms().then((m) => ({ default: m.SupportTab })));
const NotificationsTab = lazy(() => Comms().then((m) => ({ default: m.NotificationsTab })));
const EmailTab = lazy(() => Comms().then((m) => ({ default: m.EmailTab })));
const CoverageTab = lazy(() => System().then((m) => ({ default: m.CoverageTab })));
const SeoTab = lazy(() => System().then((m) => ({ default: m.SeoTab })));
const AuditTab = lazy(() => System().then((m) => ({ default: m.AuditTab })));
const HealthTab = lazy(() => System().then((m) => ({ default: m.HealthTab })));
const SettingsTab = lazy(() => System().then((m) => ({ default: m.SettingsTab })));

const TABS = [
  { path: "dashboard", label: "Dashboard", icon: LayoutDashboard, el: <DashboardTab /> },
  { path: "canli-operasyon", label: "Canlı Operasyon", icon: Activity, el: <LiveOpsTab /> },
  { path: "siparisler", label: "Siparişler", icon: ClipboardList, el: <OrdersTab /> },
  { path: "acil-durumlar", label: "Acil Durumlar", icon: AlertTriangle, el: <IncidentsTab /> },
  { path: "kuryeler", label: "Kuryeler", icon: Bike, el: <CouriersTab /> },
  { path: "esnaflar", label: "Esnaflar", icon: Store, el: <VendorsTab /> },
  { path: "musteriler", label: "Müşteriler", icon: Users, el: <CustomersTab /> },
  { path: "urunler", label: "Ürünler", icon: Package, el: <ProductsTab /> },
  { path: "kategoriler", label: "Kategoriler", icon: Tags, el: <CategoriesTab /> },
  { path: "finans", label: "Finans", icon: BarChart3, el: <FinanceTab /> },
  { path: "odemeler", label: "Ödemeler", icon: CreditCard, el: <PaymentsTab /> },
  { path: "komisyonlar", label: "Komisyonlar", icon: Percent, el: <CommissionsTab /> },
  { path: "mutabakat", label: "Mutabakat", icon: Scale, el: <SettlementsTab /> },
  { path: "sadakat", label: "Sadakat", icon: Gift, el: <LoyaltyTab /> },
  { path: "referans", label: "Referans", icon: Wallet, el: <ReferralsTab /> },
  { path: "destek", label: "Destek", icon: Headphones, el: <SupportTab /> },
  { path: "bildirimler", label: "Bildirimler", icon: Bell, el: <NotificationsTab /> },
  { path: "email", label: "Email", icon: Mail, el: <EmailTab /> },
  { path: "basvurular", label: "Başvurular", icon: UserPlus, el: <ApplicationsTab /> },
  { path: "coverage", label: "Coverage", icon: MapPinned, el: <CoverageTab /> },
  { path: "seo", label: "SEO", icon: FileSearch, el: <SeoTab /> },
  { path: "audit", label: "Audit Logs", icon: Receipt, el: <AuditTab /> },
  { path: "sistem-sagligi", label: "Sistem Sağlığı", icon: ShieldCheck, el: <HealthTab /> },
  { path: "ayarlar", label: "Ayarlar", icon: Settings, el: <SettingsTab /> },
];

export default function AdminApp() {
  return (
    <div className="flex min-h-screen flex-col bg-background lg:flex-row">
      <PrivatePage title="Yönetim" />
      <aside className="border-b bg-card lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-4">
          <Link to="/" className="font-extrabold text-primary">Kapında Yönetim</Link>
          <Link to="/" className="text-xs text-muted-foreground lg:hidden"><ArrowLeft className="inline h-3 w-3" aria-hidden /> Site</Link>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-2 pb-2 lg:flex-col lg:overflow-visible" aria-label="Yönetim menüsü">
          {TABS.map((t) => (
            <NavLink key={t.path} to={`/admin/${t.path}`} className={({ isActive }) => cn("flex shrink-0 items-center gap-2 whitespace-nowrap rounded-lg px-3 py-2 text-sm", isActive ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
              <t.icon className="h-4 w-4" aria-hidden /> {t.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="min-w-0 flex-1 p-4 lg:p-8">
        <Suspense fallback={<div className="grid h-64 place-items-center"><Spinner /></div>}>
          <Routes>
            <Route index element={<Navigate to="dashboard" replace />} />
            {TABS.map((t) => <Route key={t.path} path={t.path} element={t.el} />)}
            <Route path="*" element={<Navigate to="dashboard" replace />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  );
}
