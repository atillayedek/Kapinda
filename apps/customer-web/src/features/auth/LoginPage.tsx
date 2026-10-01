import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useState } from "react";
import { loginSchema, type LoginInput } from "@kapinda/shared-validation";
import { supabase } from "@/lib/supabase";
import { errorMessage } from "@/lib/errorMessages";
import { useAuth } from "@/hooks/useAuth";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, FieldError } from "@/components/ui/misc";

export function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function LoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const next = safeNext(params.get("next"));
  if (user) return <Navigate to={next} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword(values);
    if (err) setError(errorMessage(err));
    else navigate(next, { replace: true });
  });

  return (
    <AuthLayout title="Giriş yap" description="Siparişlerini takip etmek ve yeni sipariş vermek için giriş yap.">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="email">E-posta</Label>
          <Input id="email" type="email" autoComplete="email" className="mt-1.5" {...register("email")} />
          <FieldError message={formState.errors.email?.message} />
        </div>
        <div>
          <Label htmlFor="password">Şifre</Label>
          <Input id="password" type="password" autoComplete="current-password" className="mt-1.5" {...register("password")} />
          <FieldError message={formState.errors.password?.message} />
        </div>
        {error && <ErrorState message={error} />}
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? "Giriş yapılıyor…" : "Giriş yap"}
        </Button>
        <div className="flex justify-between text-sm">
          <Link to="/sifremi-unuttum" className="text-primary hover:underline">Şifremi unuttum</Link>
          <Link to={`/kayit${params.get("next") ? `?next=${encodeURIComponent(next)}` : ""}`} className="text-primary hover:underline">Hesap oluştur</Link>
        </div>
      </form>
    </AuthLayout>
  );
}
