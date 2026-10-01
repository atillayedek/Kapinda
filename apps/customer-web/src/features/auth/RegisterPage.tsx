import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { MailCheck } from "lucide-react";
import { signupSchema, type SignupInput } from "@kapinda/shared-validation";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState, ErrorState, FieldError, Skeleton } from "@/components/ui/misc";
import { consentMap, useCurrentLegalDocuments } from "@/features/legal/useLegalDocuments";

export default function RegisterPage() {
  const [params] = useSearchParams();
  const { user } = useAuth();
  const docs = useCurrentLegalDocuments();
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const { register, control, handleSubmit, formState } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { referralCode: params.get("ref") ?? "" } as Partial<SignupInput>,
  });
  if (user) return <Navigate to="/" replace />;

  const onSubmit = handleSubmit(async (v) => {
    setError(null);
    const consents = consentMap(docs.data ?? []);
    if (Object.keys(consents).length < 3) {
      setError("Yasal metinler yüklenemedi. Lütfen sayfayı yenileyin.");
      return;
    }
    const { error: err } = await supabase.auth.signUp({
      email: v.email,
      password: v.password,
      options: {
        emailRedirectTo: `${env.siteUrl}/auth/callback`,
        data: { full_name: v.fullName, phone: v.phone, referral_code: v.referralCode || null, consents },
      },
    });
    if (err) setError(errorMessage(err));
    else setSentTo(v.email);
  });

  if (sentTo) {
    return (
      <AuthLayout title="E-postanı doğrula">
        <EmptyState icon={MailCheck} title="Doğrulama bağlantısı gönderildi" description={`${sentTo} adresine gönderdiğimiz bağlantıya tıklayarak hesabını etkinleştir.`} />
      </AuthLayout>
    );
  }

  const consentRow = (name: "acceptKvkk" | "acceptExplicitConsent" | "acceptTerms", docType: string, label: string) => (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div>
          <div className="flex items-start gap-3">
            <Checkbox id={name} checked={field.value === true} onCheckedChange={(c) => field.onChange(c === true)} />
            <Label htmlFor={name} className="text-sm font-normal leading-snug">
              <Link to={`/yasal/${docType}`} target="_blank" className="font-semibold text-primary underline">{label}</Link>
              {"'ni okudum ve kabul ediyorum."}
            </Label>
          </div>
          <FieldError message={formState.errors[name]?.message} />
        </div>
      )}
    />
  );

  return (
    <AuthLayout title="Hesap oluştur" description="Hopa'daki işletmelerden sipariş vermek için kaydol.">
      {docs.isLoading ? (
        <Skeleton className="h-96" />
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="fullName">Ad soyad</Label>
            <Input id="fullName" autoComplete="name" className="mt-1.5" {...register("fullName")} />
            <FieldError message={formState.errors.fullName?.message} />
          </div>
          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" autoComplete="email" className="mt-1.5" {...register("email")} />
            <FieldError message={formState.errors.email?.message} />
          </div>
          <div>
            <Label htmlFor="phone">Telefon</Label>
            <Input id="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="05XX XXX XX XX" className="mt-1.5" {...register("phone")} />
            <FieldError message={formState.errors.phone?.message} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="password">Şifre</Label>
              <Input id="password" type="password" autoComplete="new-password" className="mt-1.5" {...register("password")} />
              <FieldError message={formState.errors.password?.message} />
            </div>
            <div>
              <Label htmlFor="passwordConfirm">Şifre (tekrar)</Label>
              <Input id="passwordConfirm" type="password" autoComplete="new-password" className="mt-1.5" {...register("passwordConfirm")} />
              <FieldError message={formState.errors.passwordConfirm?.message} />
            </div>
          </div>
          <div>
            <Label htmlFor="referralCode">Davet kodu (isteğe bağlı)</Label>
            <Input id="referralCode" className="mt-1.5 uppercase" maxLength={8} {...register("referralCode")} />
          </div>
          <div className="space-y-3 rounded-lg bg-muted/60 p-3">
            {consentRow("acceptKvkk", "kvkk", "KVKK Aydınlatma Metni")}
            {consentRow("acceptExplicitConsent", "acik_riza", "Açık Rıza Metni")}
            {consentRow("acceptTerms", "kullanici_sozlesmesi", "Kullanıcı Sözleşmesi")}
          </div>
          {error && <ErrorState message={error} />}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? "Kaydediliyor…" : "Hesap oluştur"}
          </Button>
          <p className="text-center text-sm">
            Zaten hesabın var mı? <Link to="/giris" className="font-semibold text-primary">Giriş yap</Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}
