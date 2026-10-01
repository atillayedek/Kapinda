import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { emailSchema, passwordSchema } from "@kapinda/shared-validation";
import { supabase } from "@/lib/supabase";
import { env } from "@/lib/env";
import { errorMessage } from "@/lib/errorMessages";
import { AuthLayout } from "./AuthLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ErrorState, FieldError } from "@/components/ui/misc";
import { toast } from "sonner";

export function ForgotPasswordPage() {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: emailSchema })) });
  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${env.siteUrl}/sifre-yenile` });
    if (err) setError(errorMessage(err));
    else setDone(true);
  });
  return (
    <AuthLayout title="Şifremi unuttum" description="Kayıtlı e-posta adresine şifre yenileme bağlantısı göndereceğiz.">
      {done ? (
        <p className="text-sm">Bu e-posta adresiyle kayıtlı bir hesap varsa şifre yenileme bağlantısı gönderildi.</p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div>
            <Label htmlFor="email">E-posta</Label>
            <Input id="email" type="email" className="mt-1.5" {...register("email")} />
            <FieldError message={formState.errors.email?.message} />
          </div>
          {error && <ErrorState message={error} />}
          <Button type="submit" className="w-full" disabled={formState.isSubmitting}>Bağlantı gönder</Button>
        </form>
      )}
    </AuthLayout>
  );
}

const resetSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Şifreler eşleşmiyor." });

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<z.infer<typeof resetSchema>>({ resolver: zodResolver(resetSchema) });
  const onSubmit = handleSubmit(async ({ password }) => {
    setError(null);
    const { error: err } = await supabase.auth.updateUser({ password });
    if (err) setError(errorMessage(err));
    else {
      toast.success("Şifreniz güncellendi.");
      navigate("/", { replace: true });
    }
  });
  return (
    <AuthLayout title="Yeni şifre belirle">
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div>
          <Label htmlFor="password">Yeni şifre</Label>
          <Input id="password" type="password" autoComplete="new-password" className="mt-1.5" {...register("password")} />
          <FieldError message={formState.errors.password?.message} />
        </div>
        <div>
          <Label htmlFor="confirm">Yeni şifre (tekrar)</Label>
          <Input id="confirm" type="password" autoComplete="new-password" className="mt-1.5" {...register("confirm")} />
          <FieldError message={formState.errors.confirm?.message} />
        </div>
        {error && <ErrorState message={error} />}
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>Şifreyi güncelle</Button>
      </form>
    </AuthLayout>
  );
}

export function AuthCallbackPage() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const code = new URL(window.location.href).searchParams.get("code");
    const run = async () => {
      if (code) {
        const { error: err } = await supabase.auth.exchangeCodeForSession(code);
        if (err) {
          setError(errorMessage(err));
          return;
        }
      }
      toast.success("E-posta adresiniz doğrulandı.");
      navigate("/", { replace: true });
    };
    void run();
  }, [navigate]);
  return <AuthLayout title="Doğrulanıyor">{error ? <ErrorState message={error} /> : <p className="text-sm">Lütfen bekleyin…</p>}</AuthLayout>;
}
