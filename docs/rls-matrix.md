# RLS ve ayrıcalık matrisi

İlke: **varsayılan red**. Tüm tablolarda RLS açık; `anon`/`authenticated`'dan tüm ayrıcalıklar alınır, aşağıdakiler geri verilir.
Fonksiyonlarda PUBLIC EXECUTE kaldırılmıştır; yalnız listelenen RPC'ler açıktır (`01_rbac_invariants.sql` bunu doğrular).
`C` = müşteri (kendi), `V` = işletme üyesi (kendi işletmesi), `K` = kurye (kendisi/atanmış), `A` = admin.

| Tablo | Okuma | Yazma (istemci) |
|---|---|---|
| profiles | C kendi, A | C: `full_name, phone, avatar_path` |
| user_roles | kendi, A | — (yalnız admin RPC / başvuru onayı) |
| legal_documents, required_consents | herkes | — |
| user_consents | kendi, A | — (kayıt tetikleyicisi / `accept_legal_documents`) |
| settings | herkes: `is_public`; A: tümü | — (`admin_update_setting`) |
| admin_audit_logs | A | — (UPDATE/DELETE/TRUNCATE tetikleyiciyle engelli) |
| provinces, districts, coverage_areas, pricing_* | herkes: aktif; A: tümü | A: il/ilçe; bölge/fiyat RPC ile |
| vendors | herkes: aktif; V; A | V: `description, phone, email, is_open, logo_path, cover_path` |
| vendor_members | kendi, A | — |
| vendor_hours | herkes | V |
| vendor_applications, courier_applications | kendi, A | kendi adına, yalnız içerik kolonları (durum yok) |
| couriers | K kendi, A | — (RPC) |
| courier_locations | A | — (RPC) |
| courier_incidents | K kendi, A | — (RPC) |
| categories | herkes: aktif | A |
| products, product_images | herkes: aktif ürün; V; A | V (kendi işletmesi; vendor_id kontrolü) |
| addresses | C kendi, A | C kendi (silme = `deleted_at`) |
| customer_address_book | V, A | V: `customer_name, directions, lat, lng` |
| delivery_fees | C kendi, A | — (yalnız Edge Function) |
| orders | C kendi; V ödeme sonrası; K atanmış; A | — (yalnız RPC; tetikleyici korumalı) |
| order_items, order_status_history | siparişi görebilen | — |
| order_assignments | K kendi, A | — |
| order_transfers | K ilgili, A | — |
| order_live_locations | C (aktif teslimatta), K atanmış, A | — (RPC) |
| qr_tokens | **kimse** | — (yalnız service_role) |
| delivery_proofs | C, K, A | — (RPC) |
| payments | C kendi (ham yanıt/token kolonları hariç), A | — |
| payment_events | A | — |
| platform_commissions | V, A | — |
| vendor_settlements, settlement_adjustments | V (taslak hariç), A | — (admin RPC) |
| loyalty_rewards, referrals | kendi, A | — |
| ratings | yazan, V/K hedef, A | — (`submit_rating`) |
| support_conversations, support_messages | katılımcı, A | — (RPC) |
| notifications | kendi | — (RPC: okundu) |
| device_tokens | kendi | — (RPC) |
| notification_preferences | kendi | kendi |
| email_* , seo_*, system_health_checks, app_error_events | A (abonelik: kendi) | A: SEO hata durumu |
| rate_limit_buckets | **kimse** | — |

Storage: `product-images`, `vendor-assets` herkese açık okuma, yazma yalnız `{vendor_id}/…` yolunda üye; `delivery-proofs`
**private**, yükleme yalnız `{order_id}/{courier_id}/…` yolunda atanmış aktif kurye, okuma (signed URL) admin/müşteri/kurye.
