import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Bike, CheckCircle2, Store } from "lucide-react";
import { toast } from "sonner";
import { ApplicationStatusLabels } from "@kapinda/shared-contracts";
import { courierApplicationSchema, vendorApplicationSchema, type CourierApplicationInput, type VendorApplicationInput } from "@kapinda/shared-validation";
import { SEOHead } from "@/components/seo/SEOHead";
import { breadcrumbLd } from "@/components/seo/structuredData";
import { useAuth } from "@/hooks/useAuth";
import { supabase, toAppError } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { formatDateTime } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, FieldError, Skeleton } from "@/components/ui/misc";
import { BUSINESS_TYPES, useServiceArea } from "@/features/vendors/queries";

function useMyApplication(kind: "vendor" | "courier") {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["my-application", kind, user?.id],
    enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await supabase.from(`${kind}_applications`).select("id, status, created_at, review_note").eq("applicant_user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (error) throw toAppError(error);
      return data as { id: string; status: "pending" | "approved" | "rejected"; created_at: string; review_note: string | null } | null;
    },
  });
}

function LoginRequired({ next }: { next: string }) {
  return (
    <EmptyState title="Başvuru için giriş yapın" description="Başvurunuzu takip edebilmeniz için bir hesap gereklidir." action={<Button asChild><Link to={`/giris?next=${next}`}>Giriş yap / Kayıt ol</Link></Button>} />
  );
}

function ExistingApplication({ app }: { app: { status: "pending" | "approved" | "rejected"; created_at: string; review_note: string | null } }) {
  return (
    <div className="rounded-xl border bg-card p-5">
      <p className="flex items-center gap-2 font-bold"><CheckCircle2 className="h-5 w-5 text-primary" aria-hidden /> Başvurunuz: {ApplicationStatusLabels[app.status]}</p>
      <p className="text-sm text-muted-foreground">Başvuru tarihi: {formatDateTime(app.created_at)}</p>
      {app.review_note && <p className="mt-2 text-sm">Not: {app.review_note}</p>}
    </div>
  );
}

export function VendorApplicationPage() {
  const { user, profile } = useAuth();
  const app = useMyApplication("vendor");
  const areas = useServiceArea();
  const { register, handleSubmit, formState, reset } = useForm<VendorApplicationInput>({
    resolver: zodResolver(vendorApplicationSchema),
    values: { email: profile?.email ?? "", phone: profile?.phone ?? "", ownerName: profile?.full_name ?? "" } as VendorApplicationInput,
  });
  const onSubmit = handleSubmit(async (v) => {
    const { error } = await supabase.from("vendor_applications").insert({
      applicant_user_id: user!.id, business_name: v.businessName, business_type: v.businessType, owner_name: v.ownerName, tax_number: v.taxNumber,
      phone: v.phone, email: v.email, district_id: v.districtId, address: v.address, notes: v.notes || null,
    });
    if (error) toast.error(errorMessage(toAppError(error)));
    else {
      toast.success("Başvurunuz alındı.");
      reset();
      void app.refetch();
    }
  });
  return (
    <div className="container max-w-2xl py-10">
      <SEOHead title="Esnaf başvurusu" description="Hopa'daki marketinizi, manavınızı veya fırınınızı Kapında'ya ekleyin; online sipariş alın." path="/esnaf-basvurusu"
        jsonLd={breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "Esnaf başvurusu", path: "/esnaf-basvurusu" }])} />
      <Store className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="mt-3 text-3xl font-extrabold">Esnaf başvurusu</h1>
      <p className="mt-2 text-muted-foreground">Siparişleri Kapında İşletme (Windows) uygulamasından yönetin. Komisyon: satılan her ürün kalemi için 20 TL. Ürün bedelini kapıda siz tahsil edersiniz.</p>
      <div className="mt-8">
        {!user ? <LoginRequired next="/esnaf-basvurusu" /> : app.isLoading ? <Skeleton className="h-64" /> : app.data && app.data.status !== "rejected" ? <ExistingApplication app={app.data} /> : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {app.data?.status === "rejected" && <ExistingApplication app={app.data} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="businessName">İşletme adı</Label><Input id="businessName" className="mt-1.5" {...register("businessName")} /><FieldError message={formState.errors.businessName?.message} /></div>
              <div>
                <Label htmlFor="businessType">İşletme türü</Label>
                <NativeSelect id="businessType" className="mt-1.5" {...register("businessType")}>
                  <option value="">Seçin</option>
                  {Object.entries(BUSINESS_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </NativeSelect>
                <FieldError message={formState.errors.businessType?.message} />
              </div>
              <div><Label htmlFor="ownerName">Yetkili ad soyad</Label><Input id="ownerName" className="mt-1.5" {...register("ownerName")} /><FieldError message={formState.errors.ownerName?.message} /></div>
              <div><Label htmlFor="taxNumber">Vergi / TC kimlik no</Label><Input id="taxNumber" inputMode="numeric" className="mt-1.5" {...register("taxNumber")} /><FieldError message={formState.errors.taxNumber?.message} /></div>
              <div><Label htmlFor="phone">Telefon</Label><Input id="phone" type="tel" className="mt-1.5" {...register("phone")} /><FieldError message={formState.errors.phone?.message} /></div>
              <div><Label htmlFor="email">E-posta</Label><Input id="email" type="email" className="mt-1.5" {...register("email")} /><FieldError message={formState.errors.email?.message} /></div>
              <div>
                <Label htmlFor="districtId">İlçe</Label>
                <NativeSelect id="districtId" className="mt-1.5" {...register("districtId")}>
                  <option value="">Seçin</option>
                  {areas.data?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
                <FieldError message={formState.errors.districtId?.message} />
              </div>
            </div>
            <div><Label htmlFor="address">İşletme adresi</Label><Textarea id="address" className="mt-1.5" {...register("address")} /><FieldError message={formState.errors.address?.message} /></div>
            <div><Label htmlFor="notes">Not (isteğe bağlı)</Label><Textarea id="notes" className="mt-1.5" {...register("notes")} /></div>
            <Button type="submit" disabled={formState.isSubmitting}>Başvuruyu gönder</Button>
          </form>
        )}
      </div>
    </div>
  );
}

export function CourierApplicationPage() {
  const { user, profile } = useAuth();
  const app = useMyApplication("courier");
  const areas = useServiceArea();
  const { register, handleSubmit, formState, control, reset } = useForm<CourierApplicationInput>({
    resolver: zodResolver(courierApplicationSchema),
    values: { fullName: profile?.full_name ?? "", phone: profile?.phone ?? "", email: profile?.email ?? "", hasLicense: false } as CourierApplicationInput,
  });
  const onSubmit = handleSubmit(async (v) => {
    const { error } = await supabase.from("courier_applications").insert({
      applicant_user_id: user!.id, full_name: v.fullName, phone: v.phone, email: v.email, district_id: v.districtId, vehicle_type: v.vehicleType, has_license: v.hasLicense, notes: v.notes || null,
    });
    if (error) toast.error(errorMessage(toAppError(error)));
    else {
      toast.success("Başvurunuz alındı.");
      reset();
      void app.refetch();
    }
  });
  return (
    <div className="container max-w-2xl py-10">
      <SEOHead title="Kurye başvurusu" description="Hopa'da Kapında kuryesi olun, esnek saatlerle teslimat yapın." path="/kurye-basvurusu"
        jsonLd={breadcrumbLd([{ name: "Ana Sayfa", path: "/" }, { name: "Kurye başvurusu", path: "/kurye-basvurusu" }])} />
      <Bike className="h-10 w-10 text-primary" aria-hidden />
      <h1 className="mt-3 text-3xl font-extrabold">Kurye başvurusu</h1>
      <p className="mt-2 text-muted-foreground">Onaylanan kuryeler Kapında Kurye (Android) uygulamasıyla görev alır.</p>
      <div className="mt-8">
        {!user ? <LoginRequired next="/kurye-basvurusu" /> : app.isLoading ? <Skeleton className="h-64" /> : app.data && app.data.status !== "rejected" ? <ExistingApplication app={app.data} /> : (
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            {app.data?.status === "rejected" && <ExistingApplication app={app.data} />}
            <div className="grid gap-4 sm:grid-cols-2">
              <div><Label htmlFor="fullName">Ad soyad</Label><Input id="fullName" className="mt-1.5" {...register("fullName")} /><FieldError message={formState.errors.fullName?.message} /></div>
              <div><Label htmlFor="phone">Telefon</Label><Input id="phone" type="tel" className="mt-1.5" {...register("phone")} /><FieldError message={formState.errors.phone?.message} /></div>
              <div><Label htmlFor="email">E-posta</Label><Input id="email" type="email" className="mt-1.5" {...register("email")} /><FieldError message={formState.errors.email?.message} /></div>
              <div>
                <Label htmlFor="districtId">İlçe</Label>
                <NativeSelect id="districtId" className="mt-1.5" {...register("districtId")}>
                  <option value="">Seçin</option>
                  {areas.data?.districts.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </NativeSelect>
                <FieldError message={formState.errors.districtId?.message} />
              </div>
              <div>
                <Label htmlFor="vehicleType">Araç</Label>
                <NativeSelect id="vehicleType" className="mt-1.5" {...register("vehicleType")}>
                  <option value="">Seçin</option>
                  <option value="motosiklet">Motosiklet</option>
                  <option value="otomobil">Otomobil</option>
                  <option value="bisiklet">Bisiklet</option>
                  <option value="yaya">Yaya</option>
                </NativeSelect>
                <FieldError message={formState.errors.vehicleType?.message} />
              </div>
            </div>
            <Controller control={control} name="hasLicense" render={({ field }) => (
              <div className="flex items-center gap-2"><Checkbox id="hasLicense" checked={field.value} onCheckedChange={(c) => field.onChange(c === true)} /><Label htmlFor="hasLicense" className="font-normal">Geçerli sürücü belgem var</Label></div>
            )} />
            <div><Label htmlFor="notes">Not (isteğe bağlı)</Label><Textarea id="notes" className="mt-1.5" {...register("notes")} /></div>
            <Button type="submit" disabled={formState.isSubmitting}>Başvuruyu gönder</Button>
          </form>
        )}
      </div>
    </div>
  );
}
