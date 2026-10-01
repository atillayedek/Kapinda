# Mimari

## Bileşenler
| Bileşen | Teknoloji | Rol |
|---|---|---|
| Müşteri Web/PWA + Admin | React 18, TS, Vite, Tailwind, shadcn/ui, TanStack Query, RHF + Zod | Sipariş, takip, destek; `/admin` yönetim paneli |
| Kurye | Kotlin, Compose, Hilt, MVVM, OkHttp, CameraX + ML Kit, Maps SDK, FCM | Havuz, görev, konum, QR teslimat, acil durum |
| İşletme | .NET 8 WPF, MVVM (CommunityToolkit), HttpClient, ClientWebSocket | Sipariş yönetimi, ürün/stok/barkod, mutabakat |
| Backend | Supabase Auth, PostgreSQL + RLS, Realtime, Storage, Edge Functions (Deno), pg_cron | Tek otorite |

İstemciler yalnız **anon/publishable** anahtar ve kullanıcının JWT'siyle konuşur. `service_role` yalnız Edge Function'larda.

## Sipariş durum makinesi
İzinli geçişler `order_status_transitions` tablosundadır (contracts.json ile eşleşir):

```
pending_payment ─(system: ödeme)→ payment_confirmed ─(system)→ vendor_pending
vendor_pending ─(vendor)→ vendor_accepted ─(vendor)→ preparing ─(vendor)→ ready_for_pickup
ready_for_pickup ─(courier/admin/system)→ courier_assigned ─(courier)→ picked_up ─(courier)→ on_the_way
on_the_way ─(qr_verification)→ delivered
iptal/ret/başarısız: tablodaki aktör kurallarına göre (ör. vendor_pending → rejected yalnız vendor)
```

* Tek yol `_order_transition()`; her geçiş `order_status_history`'ye (değiştirilemez) yazılır: önceki/yeni durum,
  aktör, rol, gerekçe, zaman, metadata.
* `orders_guard` tetikleyicisi oturum değişkeni olmadan yapılan durum/tutar/kurye değişikliğini reddeder.
* `delivered` için ayrıca `kapinda.qr_verified_order` bayrağı gerekir; bu bayrağı yalnız `consume_delivery_qr` set eder.
  Admin `admin_override_status(..., 'delivered')` çağrısı ve doğrudan UPDATE reddedilir.
* Kurye hazırlık sırasında kabul edebilir; işletme "hazır" dediğinde sistem `courier_assigned`'a geçirir.

## Para akışları
| Akış | Tahsil | Hesaplayan |
|---|---|---|
| Ürün bedeli | Kapıda nakit / POS (işletme) | `create_order` — DB'deki güncel fiyatlarla |
| Teslimat ücreti | iyzico (Kapında) | `create_delivery_fee_quote` — sürüm kuralına göre, mesafe sunucuda ölçülür |
| Platform komisyonu | Mutabakatla işletmeden | Teslimde `_finalize_delivered_order`: 20 TL × uygun kalem (ayar: kalem/adet tabanı) |

* Fiyat kuralı sürümlüdür (`pricing_rule_versions` değiştirilemez); her teklif ve sipariş `pricing_snapshot` saklar.
* Ödeme onayı (`confirm_delivery_payment`) idempotenttir, tutarı sipariş üzerindeki `delivery_fee_payable` ile karşılaştırır;
  iyzico yanıt imzası ve webhook imzası doğrulanır; sipariş başına tek başarılı ödeme (mükerrer ödeme iade kuyruğuna).
* Teslim edilmeyen (iptal/ret/başarısız) siparişte ödenmiş teslimat ücreti `refund_pending` olur, `process-refunds` iade eder.
* Mutabakat (`vendor_settlements`) komisyon snapshot'larından üretilir; onaydan sonra değiştirilemez.

## Sadakat
* Ücretsiz teslimat yalnız: kullanıcının **5. siparişi** veya **5 doğrulanmış davet** (ayarlardan değiştirilebilir).
  "İlk sipariş ücretsiz" yoktur.
* Ödüller `loyalty_rewards`'ta benzersiz `source_ref` ile (tekrar engeli); sipariş iptalinde ödül geri döner.
* `referrals.has_ordered` yalnız sunucu fonksiyonu (oturum bayrağı) ile değişir; tetikleyici diğer her güncellemeyi reddeder.

## QR teslimat doğrulama
```
Müşteri ──issue-delivery-qr──▶ Edge: nonce = 32 rastgele bayt, QR = KPD1.tokenId.orderId.exp.nonce.HMAC
                                DB: qr_tokens(order, courier, sha256(nonce), expires_at)   ← ham nonce/imza saklanmaz
Kurye  ──verify-delivery-qr──▶ Edge: HMAC (sabit zamanlı) + süre kontrolü
                                DB: UPDATE qr_tokens SET consumed_at=now() WHERE id=… AND nonce_hash=… AND consumed_at IS NULL
                                    AND revoked_at IS NULL AND expires_at>now() AND courier_id=<JWT kuryesi>   (atomik)
                                    → siparişi kilitle, kurye eşleşmesi → delivered + GPS + cihaz + audit (tek işlem)
```
Devir/havuza dönüşte eski kuryenin tokenları iptal edilir; yeniden üretim öncekileri iptal eder. Eşzamanlı iki okutmada
satır kilidi nedeniyle yalnız biri başarılı olur (testle doğrulandı). Teslimat fotoğrafı opsiyonel kanıttır, QR'ın yerine
geçmez; private bucket, signed URL.

## Realtime
`supabase_realtime` yayınında yalnız: `orders`, `order_live_locations`, `support_messages`, `support_conversations`,
`notifications`, `courier_incidents`. postgres_changes satırı yalnız RLS SELECT politikası izin verdiği aboneye iletir.
`order_transfers`, `courier_locations` (ham konum geçmişi), `payments`, `qr_tokens` yayınlanmaz. Müşteri kurye konumunu yalnız
kendi siparişinin `order_live_locations` satırından, yalnız aktif teslimat süresince alır.

## Dış servis bozulma stratejisi
| Servis | Kritik | Bozulursa |
|---|---|---|
| Supabase DB | Evet | Platform çalışmaz |
| iyzico | Evet (ödeme) | Ödeme doğrulanmadan sipariş ödenmiş sayılmaz; sipariş 30 dk sonra zaman aşımıyla iptal |
| Google Maps | Hayır | Haversine tahmini; kullanıcıya "tahmini" olarak gösterilir |
| FCM | Hayır | Sipariş etkilenmez; bildirim `failed/skipped` kaydedilir, uygulama içi bildirim ve Realtime sürer |
| Resend | Hayır | E-posta kuyrukta yeniden denenir |
| Storage | Hayır | Opsiyonel teslimat fotoğrafı başarısız olsa da QR teslimat tamamlanır |

## Çoklu ilçe
`provinces → districts → coverage_areas`. Hopa koda gömülü değildir; Arhavi, Borçka, Artvin Merkez, Kemalpaşa ilçeleri pasif
olarak tanımlıdır, admin › Coverage'dan bölge tanımlanıp aktifleştirilerek açılır (saat, yarıçap, minimum sepet, fiyat kuralı).
