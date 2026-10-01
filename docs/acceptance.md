# Kabul durumu (FAZ 73)

Her madde için durum: **DOĞRULANDI** (bu repoda otomatik test veya build ile kanıtlandı) ya da **DOĞRULANMADI**
(gerçek credential / cihaz / canlı servis gerektirir; kod hazır ama uçtan uca çalıştırılmadı).

Doğrulama ortamı: PostgreSQL 16 + Supabase uyumluluk katmanı (`supabase/tests/shim`), Deno 2, Node 22, JDK 17 +
Android SDK 35, .NET 8 SDK (Linux, `EnableWindowsTargeting`). Canlı Supabase projesine, Vercel'e, iyzico'ya, FCM'e,
Resend'e veya Google Maps'e **hiçbir şey dağıtılmadı ve çağrı yapılmadı**.

## Sipariş ve para kuralları

| Madde | Durum | Kanıt |
|---|---|---|
| Minimum sepet 250 TL sunucuda zorunlu | DOĞRULANDI | `02_order_flow.sql` (KPD_MIN_BASKET) |
| Teslimat ücreti 0–2 km 120 TL, +10 TL/km, 15 km üstü red | DOĞRULANDI | `02_order_flow.sql`, Deno `distance` testleri |
| Fiyat kuralı sürümlü, siparişte snapshot | DOĞRULANDI | `01_rbac_invariants.sql`, `02_order_flow.sql` (değiştirilemez sürüm + sipariş snapshot) |
| iyzico'ya yalnız teslimat ücreti gönderilir | DOĞRULANDI (kod/test) · DOĞRULANMADI (canlı iyzico) | Deno `iyzico` testleri, `payment_begin` tutarı siparişten |
| Komisyon ürün başına 20 TL, sunucuda | DOĞRULANDI | `02_order_flow.sql`, `04_isolation.sql` (teslimde `platform_commissions`) |
| Ücretsiz teslimat yalnız 5. sipariş / 5 doğrulanmış davet | DOĞRULANDI | `05_loyalty_admin.sql` |
| Durum makinesi + geçmiş, izinsiz geçiş reddi | DOĞRULANDI | `00_contracts.sql`, `02_order_flow.sql` |
| Admin `delivered` zorlayamaz | DOĞRULANDI | `01_rbac_invariants.sql`, `03_qr_security.sql` |
| Çift ödeme → iade kuyruğu | DOĞRULANDI | `07_security_regressions.sql` |
| İkame ürün %25 üst sınırı | DOĞRULANDI | `07_security_regressions.sql` |
| Çalışma saatleri 09:00–23:00 (Europe/Istanbul) | DOĞRULANDI | `02_order_flow.sql` (saat dışı red testi) |

## QR teslimat

| Madde | Durum | Kanıt |
|---|---|---|
| HMAC-SHA256 imza, süre, tek kullanım, kuryeye bağlı | DOĞRULANDI | Deno `qr` testleri, `03_qr_security.sql` |
| Eşzamanlı iki tüketimde yalnız biri başarılı | DOĞRULANDI | `concurrency/run.sh` (3 senaryo) |
| Başarısız denemeler kaydedilir (rollback olmadan) | DOĞRULANDI | `03_qr_security.sql` |

## Yetki ve güvenlik

| Madde | Durum | Kanıt |
|---|---|---|
| RLS tüm tablolarda açık, varsayılan red | DOĞRULANDI | `01_rbac_invariants.sql` |
| anon/authenticated'da PUBLIC EXECUTE sızıntısı yok | DOĞRULANDI | `01_rbac_invariants.sql` invariant |
| Kullanıcı kendi rolünü/finans alanlarını değiştiremez | DOĞRULANDI | `01_rbac_invariants.sql`, `04_isolation.sql` |
| İşletme/kurye/müşteri veri izolasyonu | DOĞRULANDI | `04_isolation.sql`, `06_storage_devices.sql` |
| Değiştirilemez denetim kayıtları | DOĞRULANDI | `01_rbac_invariants.sql` |
| Repoda gizli değer yok | DOĞRULANDI | `scripts/secret-scan.mjs` (CI'da) |
| JSON-LD script enjeksiyonu engelli | DOĞRULANDI | web `SEOHead` testi |

## Uygulamalar

| Madde | Durum | Kanıt |
|---|---|---|
| Web lint/typecheck/test/build + prerender | DOĞRULANDI | `pnpm lint typecheck test build` |
| Özel rotalar noindex, robots GPTBot/CCBot engeli, site doğrulama meta | DOĞRULANDI | prerender çıktısı, Deno `seo` testi |
| Web tarayıcıda canlı Supabase ile uçtan uca | DOĞRULANMADI | canlı proje yok |
| Android lint (0 uyarı), unit test, debug/release APK, AAB | DOĞRULANDI | Gradle |
| Android cihazda konum, kamera/QR, FCM | DOĞRULANMADI | fiziksel cihaz yok |
| Windows Release build (0 uyarı), 12 xUnit, win-x64 tek dosya EXE | DOĞRULANDI | `dotnet build/test/publish` (Linux) |
| Windows EXE'nin Windows'ta çalıştırılması | DOĞRULANMADI | Windows makine yok |

## Dış servisler

| Servis | Durum |
|---|---|
| iyzico Checkout Form, callback imzası, iade | DOĞRULANMADI — sandbox/canlı anahtar yok |
| FCM HTTP v1 teslimatı | DOĞRULANMADI — servis hesabı yok |
| Google Maps JS / Android SDK / Routes API | DOĞRULANMADI — anahtar yok (Haversine yedeği test edildi) |
| Resend e-posta gönderimi | DOĞRULANMADI — API anahtarı ve doğrulanmış alan adı yok |
| Supabase Realtime sunucusu, Storage, Auth e-posta akışları | DOĞRULANMADI — canlı proje yok (RLS kuralları SQL'de test edildi) |
| pg_cron + pg_net + Vault zamanlanmış işler | DOĞRULANMADI — yerel PostgreSQL'de eklenti yok; migration atlama yolu test edildi |

## Canlıya almadan önce yapılması gerekenler

1. GitHub Secrets ve Supabase Function secret'larını `docs/deployment.md`'deki listeye göre tanımlayın.
2. `deploy-supabase.yml` ile migration ve fonksiyonları dağıtın; Vault'a `project_url` ve `cron_secret` ekleyin.
3. `bootstrap_first_admin` ile ilk yöneticiyi atayın.
4. iyzico sandbox'ta uçtan uca ödeme + iade deneyin; `IYZICO_BUYER_IDENTITY_NUMBER` secret'ını tanımlayın.
5. Yasal metinleri (KVKK, mesafeli satış, kullanım koşulları) bir hukukçuya inceletin.
6. Android release imzalama anahtarını ve Windows kod imzalama sertifikasını hazırlayın.
