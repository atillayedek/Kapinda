# Güvenlik incelemesi (FAZ 72)

Her madde için uygulanan kontrol ve onu doğrulayan otomatik test. SQL testleri `scripts/db-test.sh` ile gerçek
PostgreSQL 16 üzerinde, Supabase rolleri (`anon`, `authenticated`, `service_role`) ve JWT claim'leri taklit edilerek çalışır.

| # | Saldırı | Kontrol | Test |
|---|---|---|---|
| 1 | Müşteri → başka müşteri verisi | RLS `customer_id = auth.uid()` | `04_isolation.sql` (sipariş, kalem, geçmiş, adres, ödeme, destek, bildirim, profil, canlı konum) |
| 2 | İşletme → başka işletme | `is_vendor_member()` + `vendor_visible_at` | `04_isolation.sql` (sipariş, adres defteri, ürün ekleme, satış, komisyon) |
| 3 | Kurye → başka kurye | `current_courier_id()` | `04_isolation.sql` |
| 4–6 | Müşteri/işletme/kurye → admin | `_require_admin()`, rol yalnız RPC, kolon yetkileri | `01_rbac_invariants.sql`, `04_isolation.sql` |
| 7 | Teslimat ücreti manipülasyonu | Teklif yalnız service_role; ücret DB'de; `orders_guard` | `02_order_flow.sql`, `01` (teklif RPC kapalı) |
| 8 | Komisyon manipülasyonu | Teslimde sunucu hesaplar; snapshot değiştirilemez | `02_order_flow.sql` |
| 9 | Ödeme tutarı manipülasyonu | Tutar siparişten; onayda tutar/conversation/imza kontrolü | `02_order_flow.sql`, Deno `iyzico_test.ts` |
| 10 | Sadakat manipülasyonu | Ödül/referans yalnız sunucu; benzersiz `source_ref`; `referrals_guard` | `05_loyalty_admin.sql` |
| 11 | `delivered` manipülasyonu | Yalnız `qr_verification` aktörü + QR bayrağı; admin override reddi | `03_qr_security.sql` |
| 12 | QR tekrar kullanımı | `consumed_at IS NULL` koşullu atomik UPDATE, tek tüketim indeksi | `03_qr_security.sql` |
| 13 | QR yarış durumu | Satır kilidi; iki bağlantılı gerçek eşzamanlılık testi | `concurrency/run.sh` |
| 14 | Public tracking sızıntısı | 192-bit token (hash saklanır), asgari alan, maskeli kurye adı, yenilemede eski token geçersiz | `04_isolation.sql` |
| 15 | Realtime çapraz kullanıcı sızıntısı | Yayında yalnız RLS korumalı tablolar; ham konum/devir/ödeme yayınlanmaz | `04_isolation.sql` (Realtime'ın uyguladığı SELECT politikaları) |
| 16 | Storage açığı | `delivery-proofs` private; yol bazlı yükleme/okuma politikaları; tip/boyut sınırı | `06_storage_devices.sql` |
| 17 | Gizli değer sızıntısı | `.gitignore`, `.env.example` yalnız ad, `scripts/secret-scan.mjs` CI'da | `pnpm secrets:scan` |

## İnceleme sırasında bulunup düzeltilen sorunlar
1. **PUBLIC EXECUTE varsayılanı** — şema bazlı `ALTER DEFAULT PRIVILEGES` PUBLIC'in küresel varsayılanını kaldırmıyordu;
   sonradan oluşturulan `_invoke_edge_function` istemciye açıktı. Küresel varsayılan kaldırıldı, açık REVOKE eklendi;
   `01_rbac_invariants.sql` artık tüm fonksiyonların ayrıcalık listesini doğruluyor.
2. **Mükerrer ödeme** — iki sekmede ödeme yapılırsa ikinci başarılı tahsilat benzersiz indeks hatasına düşüyor, para iadesiz
   kalıyordu. İkinci tahsilat artık otomatik `refund_pending` + admin bildirimi (`07_security_regressions.sql`).
3. **Alternatif ürün suistimali** — işletme stok yok gerekçesiyle çok pahalı ürün koyabiliyordu; alternatif kalem tutarı
   orijinalin %25 fazlasıyla sınırlandı (`07_security_regressions.sql`).
4. **JSON-LD `</script>` enjeksiyonu** — başvurudan gelen işletme adı yapılandırılmış veride kaçışsızdı; `safeJsonLd` ile
   `<`, `>`, `&` kaçırılıyor (`SEOHead.test.ts`).
5. **Saatten bağımlı testler** — gerçek "çalışma saati dışında sipariş yok" kuralı gece testleri bozuyordu; testler
   saatten bağımsız yapıldı ve saat dışı reddi ayrıca test edildi.

## Bilinen sınırlamalar / kabul edilen riskler
* Bir saldırgan kurbanın FCM token'ını ele geçirirse kendi hesabına bağlayıp kurbanın bildirimlerini kesebilir (token gizlidir;
  etkisi bildirimle sınırlı).
* Kurye, teslim ettiği siparişlerin müşteri iletişim bilgilerini geçmişte görmeye devam eder (operasyonel itiraz/destek için).
* Tablo sahibi (`postgres`) tetikleyicileri kaldırabilir; audit değişmezliği veritabanı sahibi yetkisinin korunmasına bağlıdır.
* iyzico imza alan sıralaması belgelere göre uygulanmıştır; gerçek sandbox ile **DOĞRULANMADI**.
