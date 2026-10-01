# Dağıtım

> Bu repodaki hiçbir dosya gerçek gizli değer içermez. Tüm anahtarlar Supabase secrets, Supabase Vault veya
> GitHub Secrets'ta tutulur.

## 1. Supabase projesi
1. Auth ayarları: e-posta doğrulaması **açık**, Site URL `https://kapinda.site`, yönlendirmeler
   `https://kapinda.site/auth/callback`, `https://kapinda.site/sifre-yenile` (ve www). Şifre politikası: en az 10 karakter, harf + rakam.
2. Migration'lar: `supabase link --project-ref <ref>` → `supabase db push` (veya GitHub › Actions › Deploy Supabase).
3. Vault (cron → Edge Function):
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<rastgele uzun değer>', 'cron_secret');
   ```
4. Edge Function secret'ları (`supabase/functions/.env.example` listesindeki adlar):
   `supabase secrets set --env-file <yerel dosya>` — `CRON_SECRET` Vault'taki `cron_secret` ile aynı olmalı;
   `QR_HMAC_SECRET` en az 32 bayt rastgele.
5. Fonksiyonlar: `supabase functions deploy` (`config.toml` JWT doğrulama ayarlarını içerir).
6. İlk yönetici: `select public.bootstrap_first_admin('<e-posta>');`
7. iyzico panelinde webhook adresi: `https://<ref>.supabase.co/functions/v1/iyzico-webhook`.

## 2. Müşteri web (kapinda.site)
`apps/customer-web/vercel.json` güvenlik başlıklarını (CSP, HSTS, X-Frame-Options…), özel sayfalar için
`X-Robots-Tag: noindex` ve SPA kabuğunu tanımlar. Vercel'de proje kökü `apps/customer-web`; ortam değişkenleri
`apps/customer-web/.env.example`'daki `VITE_*` adları. Google Maps tarayıcı anahtarını `kapinda.site` referrer'ı ile kısıtlayın.

## 3. Android (kurye)
GitHub Secrets: `KAPINDA_SUPABASE_URL`, `KAPINDA_SUPABASE_ANON_KEY`, `KAPINDA_MAPS_ANDROID_KEY`,
`KAPINDA_FIREBASE_API_KEY`, `KAPINDA_FIREBASE_ANDROID_APP_ID`, `KAPINDA_FIREBASE_PROJECT_ID`, `KAPINDA_FIREBASE_SENDER_ID`,
imzalama: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`.
CI imzalı APK/AAB'yi artefakt olarak üretir; Play Console'a yükleme manueldir. Maps Android anahtarını paket adı
`site.kapinda.courier` + imza SHA-1 ile kısıtlayın.

## 4. Windows (işletme)
CI `vendor-windows-exe` artefaktında tek dosya `KapindaIsletme.exe` üretir. Dağıtırken EXE yanına `appsettings.json`
koyun (yalnız herkese açık Supabase URL ve anon anahtar). Kod imzalama sertifikası (SmartScreen için önerilir) bu repoda
yapılandırılmamıştır.

## 5. GitHub Secrets özeti
| Secret | Kullanım |
|---|---|
| `VITE_*` | Web build (herkese açık değerler) |
| `KAPINDA_*`, `ANDROID_*` | Android build/imzalama |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD` | `deploy-supabase.yml` |
