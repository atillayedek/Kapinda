-- Referans/yapılandırma verisi. Bu bir DEMO VERİSİ DEĞİLDİR: gerçek il/ilçe kayıtları, başlangıç hizmet bölgesi (Hopa),
-- iş kurallarının başlangıç değerleri, kategori taksonomisi ve yasal doküman sürümleri.
-- Kullanıcı, işletme, kurye, ürün, sipariş veya ödeme kaydı OLUŞTURULMAZ.

-- İl / ilçe
insert into public.provinces (id, name, slug, plate_code, is_active) values
  ('7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Artvin', 'artvin', 8, true);

insert into public.districts (id, province_id, name, slug, postal_code, is_active) values
  ('7a1c3f1e-08a0-4c1b-9d55-000000008600', '7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Hopa', 'hopa', '08600', true),
  ('7a1c3f1e-08a0-4c1b-9d55-000000008200', '7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Arhavi', 'arhavi', '08200', false),
  ('7a1c3f1e-08a0-4c1b-9d55-000000008400', '7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Borçka', 'borcka', '08400', false),
  ('7a1c3f1e-08a0-4c1b-9d55-000000008000', '7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Artvin Merkez', 'artvin-merkez', '08000', false),
  ('7a1c3f1e-08a0-4c1b-9d55-000000008800', '7a1c3f1e-08a0-4c1b-9d55-000000000008', 'Kemalpaşa', 'kemalpasa', '08850', false);

-- Fiyatlandırma kuralı v1: 0–2 km 120 TL, sonrası her km +10 TL, en fazla 15 km
insert into public.pricing_rules (id, name, description) values
  ('7a1c3f1e-08a0-4c1b-9d55-0000000a0001', 'Standart Teslimat', 'Başlangıç teslimat ücreti kuralı');
insert into public.pricing_rule_versions (id, pricing_rule_id, version, base_fee, base_distance_km, per_km_fee, max_distance_km, change_reason) values
  ('7a1c3f1e-08a0-4c1b-9d55-0000000b0001', '7a1c3f1e-08a0-4c1b-9d55-0000000a0001', 1, 120.00, 2.00, 10.00, 15.00, 'Başlangıç kuralı');
update public.pricing_rules set current_version_id = '7a1c3f1e-08a0-4c1b-9d55-0000000b0001' where id = '7a1c3f1e-08a0-4c1b-9d55-0000000a0001';

-- Başlangıç hizmet bölgesi: Hopa merkez (41.4086, 41.4283), her gün 09:00–23:00, minimum sepet 250 TL
insert into public.coverage_areas (id, district_id, name, slug, center_lat, center_lng, max_radius_km, min_basket_amount,
  pricing_rule_id, opens_at, closes_at, is_active) values
  ('7a1c3f1e-08a0-4c1b-9d55-0000000c0001', '7a1c3f1e-08a0-4c1b-9d55-000000008600', 'Hopa', 'hopa', 41.4086, 41.4283,
   15.00, 250.00, '7a1c3f1e-08a0-4c1b-9d55-0000000a0001', '09:00', '23:00', true);

-- Ayarlar
insert into public.settings (key, value, category, description, value_type, min_value, max_value, is_public) values
  ('operasyon.platform_open', 'true', 'operasyon', 'Platform yeni sipariş kabul ediyor mu?', 'boolean', null, null, true),
  ('operasyon.delay_threshold_minutes', '20', 'operasyon', 'Bir siparişin aynı durumda kalıp gecikmiş sayılacağı süre (dk)', 'number', 5, 180, false),
  ('teslimat.quote_ttl_minutes', '15', 'teslimat', 'Teslimat ücreti teklifinin geçerlilik süresi (dk)', 'number', 5, 60, false),
  ('odeme.pending_payment_timeout_minutes', '30', 'odeme', 'Ödenmeyen siparişin otomatik iptal süresi (dk)', 'number', 10, 120, false),
  ('minimum_sepet.default_amount', '250', 'minimum_sepet', 'Yeni hizmet bölgeleri için varsayılan minimum sepet tutarı (TL)', 'number', 0, 10000, true),
  ('komisyon.per_item_amount', '20', 'komisyon', 'Satılan uygun kalem başına platform komisyonu (TL)', 'number', 0, 1000, false),
  ('komisyon.basis', '"per_line"', 'komisyon', 'Komisyon tabanı: per_line (sipariş kalemi başına) veya per_unit (adet başına)', 'string', null, null, false),
  ('sadakat.enabled', 'true', 'sadakat', 'Sadakat programı aktif mi?', 'boolean', null, null, true),
  ('sadakat.order_milestone', '5', 'sadakat', 'Kaçıncı siparişte teslimat ücretsiz olur', 'number', 2, 50, true),
  ('sadakat.referral_milestone', '5', 'sadakat', 'Kaç doğrulanmış davette ücretsiz teslimat kazanılır', 'number', 1, 50, true),
  ('uyumluluk.age_restricted_online_sales_enabled', 'false', 'uyumluluk',
   'Yaş kısıtlı ürünlerin online siparişi. Yürürlükteki mevzuat (alkol/tütün uzaktan satış yasağı) nedeniyle kapalıdır; yalnız hukuki onay sonrası açılmalıdır.',
   'boolean', null, null, false),
  ('kurye.location_min_interval_seconds', '5', 'kurye', 'Kurye konum güncellemeleri arasındaki asgari süre (sn)', 'number', 2, 60, false),
  ('kurye.default_max_active_orders', '1', 'kurye', 'Yeni kurye için varsayılan eşzamanlı aktif sipariş sınırı', 'number', 1, 10, false),
  ('kurye.qr_ttl_minutes', '30', 'kurye', 'Teslimat QR kodunun geçerlilik süresi (dk)', 'number', 5, 120, false),
  ('destek.email', '"destek@kapinda.site"', 'destek', 'Destek e-posta adresi', 'string', null, null, true),
  ('destek.phone', '"+905318701189"', 'destek', 'Destek telefonu', 'string', null, null, true),
  ('destek.instagram', '"kapinda_hopa"', 'destek', 'Instagram hesabı', 'string', null, null, true),
  ('bildirim.push_enabled', 'true', 'bildirim', 'Push bildirim gönderimi aktif mi?', 'boolean', null, null, false),
  ('seo.check_interval_minutes', '60', 'seo', 'Otomatik SEO kontrol aralığı (5, 15, 60, 360)', 'number', 5, 360, false),
  ('calisma_saatleri.label', '"Her gün 09:00–23:00"', 'calisma_saatleri', 'Sitede gösterilen çalışma saatleri metni', 'string', null, null, true);

-- Kategori taksonomisi. Alkol ve tütün: yaş kısıtlı ve online satışa KAPALI.
insert into public.categories (name, slug, icon, sort_order, is_age_restricted, is_online_sale_allowed) values
  ('Meyve & Sebze', 'meyve-sebze', 'apple', 10, false, true),
  ('Et, Tavuk & Balık', 'et-tavuk-balik', 'beef', 20, false, true),
  ('Süt & Kahvaltılık', 'sut-kahvaltilik', 'milk', 30, false, true),
  ('Temel Gıda', 'temel-gida', 'wheat', 40, false, true),
  ('Fırın & Unlu Mamuller', 'firin', 'croissant', 50, false, true),
  ('Atıştırmalık', 'atistirmalik', 'cookie', 60, false, true),
  ('İçecek', 'icecek', 'cup-soda', 70, false, true),
  ('Dondurulmuş Gıda', 'dondurulmus', 'snowflake', 80, false, true),
  ('Kuruyemiş', 'kuruyemis', 'nut', 90, false, true),
  ('Temizlik', 'temizlik', 'spray-can', 100, false, true),
  ('Kişisel Bakım', 'kisisel-bakim', 'sparkles', 110, false, true),
  ('Bebek', 'bebek', 'baby', 120, false, true),
  ('Ev & Yaşam', 'ev-yasam', 'home', 130, false, true),
  ('Evcil Hayvan', 'evcil-hayvan', 'paw-print', 140, false, true),
  ('Alkollü İçecek', 'alkollu-icecek', 'wine', 900, true, false),
  ('Tütün Ürünleri', 'tutun-urunleri', 'cigarette', 910, true, false);

-- Yasal dokümanlar (sürüm 2026-10-01). Yayına almadan önce hukuk danışmanı tarafından gözden geçirilmelidir.
insert into public.legal_documents (document_type, version, title, is_current, content) values
('kvkk', '2026-10-01', 'KVKK Aydınlatma Metni', true,
$doc$Kapında ("Platform") olarak, 6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") kapsamında veri sorumlusu sıfatıyla kişisel verilerinizi aşağıda açıklanan çerçevede işlemekteyiz.

1. İşlenen kişisel veriler: Kimlik (ad, soyad), iletişim (e-posta, telefon), teslimat adresi ve konum bilgisi, sipariş ve işlem geçmişi, ödeme işlem kayıtları (kart bilgileriniz Platform tarafından saklanmaz; ödeme kuruluşu iyzico tarafından işlenir), cihaz ve oturum bilgileri, müşteri destek yazışmaları.

2. İşleme amaçları: Üyelik oluşturulması ve hesabın yönetimi; siparişin işletmeye iletilmesi, hazırlanması ve kurye ile teslim edilmesi; teslimat ücretinin tahsili ve iadesi; teslimatın QR kodu ile doğrulanması; sipariş durumunun bildirilmesi; müşteri destek taleplerinin yanıtlanması; yasal yükümlülüklerin yerine getirilmesi; dolandırıcılık ve kötüye kullanımın önlenmesi.

3. Hukuki sebepler: KVKK m.5/2-c (sözleşmenin kurulması ve ifası), m.5/2-ç (hukuki yükümlülük), m.5/2-f (meşru menfaat) ve açık rızanızın bulunduğu hâllerde m.5/1.

4. Aktarım: Siparişinizin ifası için gerekli olduğu ölçüde siparişi hazırlayan işletmeye ve teslim eden kuryeye (ad, telefon, teslimat adresi); ödeme hizmeti için iyzico'ya; altyapı hizmetleri için barındırma ve bildirim hizmet sağlayıcılarına; talep hâlinde yetkili kamu kurum ve kuruluşlarına aktarılabilir.

5. Saklama: Kişisel verileriniz ilgili mevzuatta öngörülen süreler ve işleme amacının gerektirdiği süre boyunca saklanır, sonrasında silinir, yok edilir veya anonim hâle getirilir.

6. Haklarınız: KVKK m.11 kapsamındaki haklarınıza ilişkin taleplerinizi destek@kapinda.site adresine iletebilirsiniz.$doc$),
('acik_riza', '2026-10-01', 'Açık Rıza Metni', true,
$doc$KVKK Aydınlatma Metni'ni okuduğumu ve anladığımı; siparişlerimin takibi amacıyla aktif teslimat süresince kurye konumunun tarafıma gösterilmesi ve teslimat adresimin konum bilgisinin işlenmesi, sipariş durum bildirimlerinin cihazıma anlık bildirim olarak gönderilmesi ve hizmetin sunulabilmesi için kullanılan yurt dışında bulunan altyapı hizmet sağlayıcılarına (barındırma, anlık bildirim, harita ve e-posta hizmetleri) kişisel verilerimin aktarılması konularında açık rıza verdiğimi kabul ederim. Açık rızamı dilediğim zaman destek@kapinda.site adresine başvurarak geri alabileceğimi biliyorum.$doc$),
('kullanici_sozlesmesi', '2026-10-01', 'Kullanıcı Sözleşmesi', true,
$doc$1. Taraflar ve konu: Bu sözleşme, Kapında platformunu kullanan kullanıcı ile Kapında arasında, platform üzerinden yerel işletmelerden sipariş verilmesi ve siparişin teslimatına ilişkin şartları düzenler.

2. Hizmetin niteliği: Kapında, kullanıcıların hizmet bölgesindeki işletmelerden ürün siparişi vermesine ve siparişin kurye ile teslim edilmesine aracılık eder. Ürünlerin satıcısı ilgili işletmedir.

3. Ödeme: Ürün bedeli teslimat sırasında işletme adına kapıda nakit veya kredi kartı/POS ile tahsil edilir. Teslimat ücreti sipariş sırasında iyzico altyapısı ile online olarak tahsil edilir. Teslimatı gerçekleşmeyen siparişlerde tahsil edilen teslimat ücreti iade edilir.

4. Minimum sepet ve teslimat ücreti: Sipariş verilebilmesi için hizmet bölgesinde geçerli minimum sepet tutarına ulaşılması gerekir. Teslimat ücreti, işletme ile teslimat adresi arasındaki mesafeye göre sipariş anında sunucu tarafından hesaplanır.

5. Teslimat doğrulama: Teslimat, uygulamada gösterilen QR kodun kurye tarafından okutulması ile tamamlanır. QR kodunuzu yalnızca siparişinizi teslim alırken kuryeye gösteriniz.

6. Stokta olmayan ürünler: Sipariş sırasında seçtiğiniz tercihe göre (alternatif ürün, siparişten çıkarma veya iptal) işlem yapılır.

7. Yaş sınırı: Mevzuat gereği uzaktan satışı yasak olan ürünler platform üzerinden satılmaz.

8. Kullanıcı yükümlülükleri: Kullanıcı, verdiği bilgilerin doğru olduğunu, hesabının güvenliğinden sorumlu olduğunu ve platformu hukuka aykırı amaçlarla kullanmayacağını kabul eder.

9. Değerlendirmeler: Yalnızca teslim edilmiş siparişler için işletme ve kurye değerlendirmesi yapılabilir; değerlendirmeler hakaret ve kişisel veri içeremez.

10. İletişim: destek@kapinda.site — +90 531 870 1189.$doc$);
