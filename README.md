# Kapında

Hopa'da ihtiyacın olanlar Kapında. Yerel market ve esnaflardan sipariş, kurye ile teslimat.

Tek bir Supabase backend üzerinde çalışan production ekosistemi:

```
Müşteri Web/PWA + Admin Paneli (React)      Kurye (Native Android, Kotlin)      İşletme (Native Windows, WPF .NET 8)
                 │                                    │                                      │
                 └────────────── Supabase Auth + PostgreSQL + RLS + Realtime + Storage + Edge Functions ──────────────┘
                                                      │
                                    FCM · iyzico · Google Maps · Resend
```

| Bölüm | Konum |
|---|---|
| [Mimari](docs/architecture.md) | Veri modeli, durum makinesi, para akışları, QR teslimat |
| [RLS matrisi](docs/rls-matrix.md) | Tablo bazında kim neyi okuyup yazabilir |
| [Dağıtım](docs/deployment.md) | Supabase, Edge Functions, web, Android, Windows, GitHub Secrets |
| [Güvenlik incelemesi](docs/security-review.md) | FAZ 72 kontrol listesi ve bulgular |
| [Kabul durumu](docs/acceptance.md) | FAZ 73 maddeleri: doğrulananlar / DOĞRULANMADI |

---

## Monorepo

```
apps/
  customer-web/        React + TS + Vite + Tailwind + shadcn/ui (müşteri, PWA, /admin paneli)
  courier-android/     Kotlin + Jetpack Compose + Hilt (kurye)
  vendor-windows/      .NET 8 + WPF + MVVM (işletme) — Core kütüphanesi + xUnit testleri
packages/
  shared-contracts/    contracts.json → TS / Kotlin / C# üretilen enum ve iş kuralları
  shared-validation/   Zod şemaları, Türkiye telefon normalizasyonu, EAN-13
supabase/
  migrations/          Sürüm kontrollü şema, RLS, RPC, tetikleyiciler, referans veri
  functions/           Deno Edge Functions (+ _shared modüller, tests/)
  tests/               SQL invariant / izolasyon / QR / eşzamanlılık testleri
scripts/               contracts üretici, DB test koşucusu, gizli değer taraması
docs/
```

**Ortak contract'lar.** Rol, sipariş durumu, izinli geçişler, ödeme durumu vb. tek kaynaktan
(`packages/shared-contracts/contracts.json`) üretilir: `pnpm contracts:generate`. CI `pnpm contracts:check` ile
üretilmiş dosyaların güncel olduğunu, `supabase/tests/00_contracts.sql` de PostgreSQL enum'ları ve geçiş tablosunun
bu dosyayla birebir aynı olduğunu doğrular.

**Telefon normalizasyonu.** Canonical biçim `+90XXXXXXXXXX`. Otorite `public.normalize_tr_phone()`'dur; tüm telefon
kolonlarında tetikleyiciyle uygulanır. TypeScript eşdeğeri (`shared-validation/src/phone.ts`) ve SQL aynı test vektörleriyle
(`phone-vectors.json`) test edilir. Android ve Windows uygulamaları telefonu ham gönderir; sunucu normalleştirir.

## Kurulum

Gereksinimler: Node 22 + pnpm 9, PostgreSQL 16 istemci araçları (testler için), Deno 2, JDK 17 + Android SDK 35,
.NET 8 SDK.

```bash
pnpm install
pnpm contracts:check
pnpm lint && pnpm typecheck && pnpm test
pnpm --filter @kapinda/customer-web dev          # http://localhost:5173
```

Ortam değişkenleri: her uygulamanın `.env.example` dosyasına bakın (`apps/customer-web/.env.example`,
`supabase/functions/.env.example`). Bu dosyalar **yalnız değişken adlarını** içerir.

## Supabase

### Veritabanı
`supabase/migrations` sırayla uygulanır (`supabase db push`). Öne çıkanlar:

* **RBAC**: `user_roles` ayrı tablo, `public.has_role(uuid, app_role)` SECURITY DEFINER (RLS özyinelemesi yok).
  Roller yalnız admin RPC'leri ve başvuru onayıyla verilir; kullanıcı kendi rolünü değiştiremez.
* **RLS**: tüm tablolarda açık, API rollerinden tüm ayrıcalıklar alınır, yalnız gereken SELECT/INSERT/UPDATE kolon bazında
  geri verilir. Kritik yazımlar (durum, tutar, onay, QR, komisyon, sadakat) yalnız RPC ile.
* **Durum makinesi**: `order_status_transitions` tablosu + `_order_transition()`; `orders_guard` tetikleyicisi doğrudan
  durum/tutar/kurye değişikliğini (service_role ve tablo sahibi dahil) reddeder. `delivered` yalnız QR doğrulamasıyla.
* **Değiştirilemez kayıtlar**: `admin_audit_logs`, `order_status_history`, `pricing_rule_versions`, `ratings`,
  `platform_commissions` — UPDATE/DELETE/TRUNCATE tetikleyiciyle engellidir.
* **Referans veri**: Artvin/Hopa, başlangıç hizmet bölgesi (09:00–23:00, 250 TL minimum, 15 km), fiyat kuralı v1,
  kategori taksonomisi, ayarlar ve yasal doküman sürümleri. **Kullanıcı, işletme, ürün, sipariş gibi demo veri yoktur.**

### İlk yönetici
Demo admin yoktur. Gerçek bir hesap web'den kayıt olup e-postasını doğruladıktan sonra, Supabase SQL Editor'de
(veritabanı sahibi olarak) bir kez çalıştırın — sistemde yönetici varsa fonksiyon reddeder:

```sql
select public.bootstrap_first_admin('yonetici@ornek.com');
```

### Edge Functions
| Fonksiyon | Görev |
|---|---|
| `calculate-delivery-fee` | Google Routes ile sürüş mesafesi (hata/zaman aşımında Haversine tahmini) → ücret DB'de hesaplanır, teklif kaydı |
| `iyzico-checkout` | Yalnız teslimat ücreti için Checkout Form başlatır (tutar siparişten) |
| `iyzico-callback` / `iyzico-webhook` | Sunucu-sunucu sorgu + imza + tutar eşleşmesi ile idempotent onay |
| `process-refunds` | Teslim edilmeyen siparişlerin teslimat ücreti iadesi |
| `issue-delivery-qr` / `verify-delivery-qr` | HMAC-SHA256 imzalı, süreli, tek kullanımlık, kuryeye bağlı QR |
| `dispatch-notifications` | FCM HTTP v1, geçersiz token temizliği, hata kaydı |
| `send-emails` / `handle-email-unsubscribe` / `newsletter-subscribe` | Resend, işlem/pazarlama ayrımı, abonelikten çıkış, bastırma listesi |
| `system-health` / `seo-check` | Servis sağlığı (kritik/isteğe bağlı ayrımı), SEO denetimi (Supabase'e kaydedilir) |

Zamanlanmış işler pg_cron + pg_net ile (`20261001001200_scheduled_jobs.sql`); Vault'ta `project_url` ve `cron_secret`
gerekir.

### Testler
```bash
PGHOST=localhost PGUSER=postgres bash scripts/db-test.sh      # geçici DB oluşturur, işi bitince siler
cd supabase/functions && deno test tests/ && deno check */index.ts
```
Testler production veritabanına bağlanmaz. Her test dosyası `BEGIN … ROLLBACK` içinde kendi geçici verisini oluşturur;
eşzamanlılık testi ayrı geçici veritabanında iki bağlantı kullanır ve veritabanı sonunda silinir.

## Entegrasyonlar

* **FCM** — yalnız bildirim altyapısı. Web: service worker'da arka plan mesajları; Android: `FirebaseMessagingService`;
  Firebase yapılandırması build-time değişkenlerden gelir (`google-services.json` repoya girmez). Windows işletme uygulaması
  masaüstü olduğu için yeni siparişleri **Supabase Realtime** ile alır (sesli uyarı + görev çubuğu).
* **Google Maps** — Web: JS API (referrer kısıtlı anahtar); Android: Maps SDK; sunucu: Routes API. Erişilemezse Haversine.
* **iyzico** — yalnız teslimat ücreti. Ürün bedeli kapıda nakit/POS ile işletmeye ödenir. Örnek: ürün 820 TL + teslimat
  140 TL → iyzico'ya **140 TL** gider.
* **Resend** — işlem e-postaları ve abonelikli pazarlama e-postaları ayrı; `List-Unsubscribe` başlığı.

## Uygulamalar

### Web (müşteri + admin)
`apps/customer-web` — `pnpm build` üretim derlemesi, herkese açık sayfaları SEO metadata'sıyla prerender eder,
`sitemap.xml` ve `app-shell.html` üretir. Özel sayfalar (`/admin`, `/sepet`, `/checkout`, `/profil`, `/siparislerim`,
`/siparis-takip`) `noindex`'tir, sitemap'te yoktur, `robots.txt` ile engellenir ve `vercel.json` ile `X-Robots-Tag`
başlığı alır. Admin paneli `/admin` altında, lazy-load edilir; tüm veriler RLS ve admin RPC'leriyle sunucuda korunur.

### Android (kurye)
`apps/courier-android` — `./gradlew lintDebug testDebugUnitTest assembleRelease bundleRelease`. Yapılandırma
`local.properties` veya ortam değişkenleri: `KAPINDA_SUPABASE_URL`, `KAPINDA_SUPABASE_ANON_KEY`, `KAPINDA_MAPS_ANDROID_KEY`,
`KAPINDA_FIREBASE_*`, imzalama için `KAPINDA_KEYSTORE_*`.

### Windows (işletme)
`apps/vendor-windows` — `dotnet build Kapinda.Vendor.sln -c Release`, `dotnet test tests/Kapinda.Vendor.Core.Tests`,
EXE: `dotnet publish src/Kapinda.Vendor.App -c Release -r win-x64 --self-contained -p:PublishSingleFile=true`.
Bağlantı bilgisi EXE yanındaki `appsettings.json` (yalnız herkese açık URL ve anon anahtar). Oturum DPAPI ile şifrelenir.

## GitHub Actions
* `ci.yml` — web (contracts, gizli değer taraması, lint, typecheck, test, build), Supabase (migration + SQL testleri,
  Deno lint/fmt/check/test), Android (lint, test, assemble, bundle), Windows (restore, build, test, publish EXE).
* `deploy-supabase.yml` — manuel; `DEPLOY` onayı ile `supabase db push` ve `functions deploy`.

## Sorun giderme
| Belirti | Çözüm |
|---|---|
| Web "Uygulama yapılandırması eksik" | `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` build sırasında tanımlı olmalı |
| Sipariş "İşletme şu anda kapalı" | Hizmet bölgesi saati (Europe/Istanbul), işletme `is_open` ve `vendor_hours` kontrol edin |
| Teslimat ücreti "tahmini" | `GOOGLE_MAPS_SERVER_KEY` eksik veya Routes API erişilemiyor (Haversine kullanıldı) |
| Push gelmiyor | FCM secret'ı, cihaz token kaydı (`device_tokens`), admin › Bildirimler istatistikleri |
| Cron çalışmıyor | Vault'ta `project_url`, `cron_secret`; Edge Function secret'ı `CRON_SECRET` aynı olmalı |
| Android build 429 | Maven Central hız sınırı; `settings.gradle.kts` Google aynasını kullanır, yeniden deneyin |
