-- FAZ 9/11/13/14/16/17/18/39/40/67: Uçtan uca sipariş zinciri (veritabanı katmanı)
\ir _helpers.psql
begin;

do $$
declare
  v_customer uuid := tests.create_user('flow-cust@test.local');
  v_vendor_user uuid := tests.create_user('flow-vend@test.local');
  v_courier_user uuid := tests.create_user('flow-cour@test.local');
  v_admin uuid := tests.create_user('flow-admin@test.local');
  v_vendor uuid;
  v_courier uuid;
  v_p1 uuid;
  v_p2 uuid;
  v_restricted uuid;
  v_addr uuid;
  v_addr2 uuid;
  v_quote public.delivery_fees;
  v_res jsonb;
  v_order uuid;
  v_pay public.payments;
  v_conf jsonb;
  v_token uuid;
  v_settlement uuid;
  o public.orders;
begin
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  v_vendor := tests.create_vendor(v_vendor_user, 'Akış Market');
  v_courier := tests.create_courier(v_courier_user);
  v_p1 := tests.create_product(v_vendor, 100.00, 10);
  v_p2 := tests.create_product(v_vendor, 60.00, 10);
  v_restricted := tests.create_product(v_vendor, 300.00, 10, 'alkollu-icecek');
  v_addr := tests.create_address(v_customer);

  -- Fiyatlandırma (FAZ 11): 0–2 km 120, sonrası +10/km (yukarı yuvarlama), 15 km üstü reddedilir
  perform tests.assert_eq(public.compute_delivery_fee((select current_version_id from public.pricing_rules limit 1), 1.5), 120.00::numeric, '1.5 km → 120 TL');
  perform tests.assert_eq(public.compute_delivery_fee((select current_version_id from public.pricing_rules limit 1), 2.0), 120.00::numeric, '2.0 km → 120 TL');
  perform tests.assert_eq(public.compute_delivery_fee((select current_version_id from public.pricing_rules limit 1), 3.4), 140.00::numeric, '3.4 km → 140 TL');
  perform tests.assert_eq(public.compute_delivery_fee((select current_version_id from public.pricing_rules limit 1), 15.0), 250.00::numeric, '15 km → 250 TL');
  perform tests.assert_raises(format($q$select public.compute_delivery_fee(%L, 15.01)$q$, (select current_version_id from public.pricing_rules limit 1)), 'KPD_OUT_OF_RANGE', '15 km üstü reddedilir');

  -- Teklif: mesafe kuş uçuşundan kısa bildirilse bile kuş uçuşu kullanılır
  perform tests.as_service();
  v_quote := public.create_delivery_fee_quote(v_customer, v_vendor, v_addr, 0.1, 'google_maps');
  perform tests.assert_true(v_quote.distance_km >= public.haversine_km(41.41, 41.43, 41.42, 41.44)::numeric - 0.01, 'teklif mesafesi kuş uçuşundan az olamaz');
  perform tests.assert_eq(v_quote.pricing_snapshot ->> 'version', '1', 'teklif fiyat snapshotı içerir');
  v_quote := public.create_delivery_fee_quote(v_customer, v_vendor, v_addr, 3.4, 'google_maps');
  perform tests.assert_eq(v_quote.fee, 140.00::numeric, 'teklif ücreti sunucuda hesaplandı (140 TL)');

  -- Uzak adres hizmet bölgesi dışında
  perform tests.reset_role();
  v_addr2 := tests.create_address(v_customer, 41.18, 41.82);
  perform tests.as_service();
  perform tests.assert_raises(format($q$select public.create_delivery_fee_quote(%L, %L, %L, 30, 'google_maps')$q$,
    v_customer, v_vendor, v_addr2), 'KPD_ADDRESS_OUT_OF_AREA', 'bölge dışı adres reddedilir');
  perform tests.reset_role();

  -- Minimum sepet 250 TL (sunucu otoritesi)
  perform tests.as_user(v_customer);
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":2}]', 'cash')$q$, v_quote.id, v_p1),
    'KPD_MIN_BASKET', '200 TL sepet reddedilir (minimum 250)');
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'cash', null, true)$q$, v_quote.id, v_restricted),
    'KPD_PRODUCT_NOT_SELLABLE_ONLINE', 'alkol online satışa kapalı (18+ onayı olsa bile)');
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":100}]', 'cash')$q$, v_quote.id, v_p1),
    'KPD_INVALID_QUANTITY', 'geçersiz adet reddedilir');
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":11}]', 'cash')$q$, v_quote.id, v_p1),
    'KPD_OUT_OF_STOCK', 'stok yetersiz reddedilir');

  v_res := public.create_order(v_quote.id,
    format('[{"product_id":"%s","quantity":2,"substitution":"remove"},{"product_id":"%s","quantity":1,"substitution":"find_alternative"}]', v_p1, v_p2)::jsonb,
    'card_on_delivery', 'Zili çalmayın', false);
  v_order := (v_res ->> 'order_id')::uuid;
  perform tests.assert_eq(v_res ->> 'status', 'pending_payment', 'sipariş ödeme bekliyor');
  perform tests.assert_eq((v_res ->> 'product_subtotal')::numeric, 260.00::numeric, 'ürün toplamı sunucuda 260 TL');
  perform tests.assert_eq((v_res ->> 'delivery_fee_payable')::numeric, 140.00::numeric, 'online ödenecek yalnız teslimat 140 TL');
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":3}]', 'cash')$q$, v_quote.id, v_p1),
    'KPD_QUOTE_USED', 'teklif ikinci kez kullanılamaz');

  -- Müşteri sipariş tutarlarını/durumunu değiştiremez
  perform tests.assert_raises(format($q$update public.orders set delivery_fee_payable = 0 where id = %L$q$, v_order), '42501', 'müşteri teslimat ücretini değiştiremez');
  perform tests.assert_raises(format($q$update public.orders set status = 'delivered' where id = %L$q$, v_order), '42501', 'müşteri durumu değiştiremez');
  perform tests.assert_raises(format($q$insert into public.order_items (order_id, product_id, product_name, unit, unit_price, quantity, line_total, substitution_preference) values (%L, %L, 'x', 'adet', 1, 1, 1, 'remove')$q$, v_order, v_p1), '42501', 'müşteri kalem ekleyemez');

  -- Vendor ödeme öncesi siparişi göremez
  perform tests.as_user(v_vendor_user);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order), 0, 'vendor ödenmemiş siparişi görmez');

  -- Ödeme: yalnız teslimat ücreti; tutar uyuşmazlığı reddedilir; idempotent
  perform tests.as_service();
  v_pay := public.begin_delivery_payment(v_order, v_customer);
  perform tests.assert_eq(v_pay.amount, 140.00::numeric, 'iyzico tutarı yalnız teslimat ücreti (ürün tutarı dahil değil)');
  perform public.attach_payment_token(v_pay.id, 'tok_flow');
  v_conf := public.confirm_delivery_payment(v_pay.id, 'iyz_bad', 400.00, '{}'::jsonb);
  perform tests.assert_eq(v_conf ->> 'result', 'amount_mismatch', 'yanlış tutarla ödeme onaylanmaz');
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'pending_payment', 'tutar uyuşmazlığında sipariş ödenmiş sayılmaz');
  v_pay := public.begin_delivery_payment(v_order, v_customer);
  perform public.attach_payment_token(v_pay.id, 'tok_flow2');
  v_conf := public.confirm_delivery_payment(v_pay.id, 'iyz_ok', 140.00, '{}'::jsonb);
  perform tests.assert_eq(v_conf ->> 'result', 'confirmed', 'doğru tutarla ödeme onaylandı');
  v_conf := public.confirm_delivery_payment(v_pay.id, 'iyz_ok', 140.00, '{}'::jsonb);
  perform tests.assert_eq(v_conf ->> 'result', 'already_processed', 'ödeme onayı idempotent');
  perform tests.reset_role();
  select * into o from public.orders where id = v_order;
  perform tests.assert_eq(o.status::text, 'vendor_pending', 'ödeme sonrası vendor_pending');
  perform tests.assert_eq(o.payment_state::text, 'paid', 'teslimat ücreti ödendi');
  perform tests.assert_true(exists (select 1 from public.notifications where user_id = v_vendor_user and type = 'new_order'), 'vendor yeni sipariş bildirimi aldı');
  perform tests.assert_true(exists (select 1 from public.customer_address_book where vendor_id = v_vendor and phone = '+905320000003'), 'adres defterine normalize telefonla kaydedildi');

  -- Vendor akışı; vendor ücret/komisyon değiştiremez; geçersiz geçiş reddedilir
  perform tests.as_user(v_vendor_user);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order), 1, 'vendor ödenmiş siparişi görür');
  perform tests.assert_raises(format($q$update public.orders set delivery_fee = 0 where id = %L$q$, v_order), '42501', 'vendor teslimat ücretini değiştiremez');
  perform tests.assert_raises(format($q$update public.orders set commission_estimate = 0 where id = %L$q$, v_order), '42501', 'vendor komisyonu değiştiremez');
  perform tests.assert_raises(format($q$update public.orders set product_subtotal = 1 where id = %L$q$, v_order), '42501', 'vendor sipariş toplamını değiştiremez');
  perform tests.assert_raises(format($q$select public.vendor_update_order_status(%L, 'ready_for_pickup')$q$, v_order), 'KPD_INVALID_TRANSITION', 'vendor_pending → ready geçersiz');
  perform tests.assert_raises(format($q$select public.vendor_update_order_status(%L, 'delivered')$q$, v_order), 'KPD_INVALID_TRANSITION', 'vendor delivered yapamaz');
  perform public.vendor_update_order_status(v_order, 'vendor_accepted');
  perform public.vendor_update_order_status(v_order, 'preparing');

  -- Kurye hazırlık sırasında kabul eder; hazır olunca otomatik "kurye atandı"
  perform tests.as_user(v_courier_user);
  perform tests.assert_true(exists (select 1 from public.courier_available_orders() where order_id = v_order), 'sipariş havuzda');
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order), 0, 'kurye atanmadan sipariş detayını göremez');
  perform public.courier_accept_order(v_order);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order), 1, 'atanan kurye siparişi görür');
  perform tests.assert_raises(format($q$select public.courier_update_order_status(%L, 'picked_up')$q$, v_order), 'KPD_INVALID_TRANSITION', 'hazır olmadan teslim alınamaz');

  perform tests.as_user(v_vendor_user);
  perform public.vendor_update_order_status(v_order, 'ready_for_pickup');
  perform tests.reset_role();
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'courier_assigned', 'hazır + atanmış kurye → courier_assigned');

  perform tests.as_user(v_courier_user);
  perform public.courier_update_order_status(v_order, 'picked_up');
  perform tests.assert_true(public.courier_update_location(41.415, 41.435, 10, 90, 5), 'konum güncellendi');
  perform tests.assert_true(not public.courier_update_location(41.416, 41.436, 10, 90, 5), 'konum güncellemesi sunucuda kısıtlandı (throttle)');
  perform public.courier_update_order_status(v_order, 'on_the_way');
  perform tests.reset_role();

  -- Müşteri takibi
  perform tests.as_user(v_customer);
  perform tests.assert_true((public.get_order_tracking(v_order) -> 'courier_location' ->> 'lat') is not null, 'müşteri kurye konumunu görür');
  perform tests.assert_raises(format($q$select public.submit_rating(%L, 'vendor', 5, 'Harika')$q$, v_order), 'KPD_RATING_NOT_ALLOWED', 'teslim edilmeden puan verilemez');
  perform tests.reset_role();

  -- QR ile teslim
  v_token := tests.issue_qr(v_order, v_customer, 'nonce-flow');
  perform tests.as_service();
  v_conf := public.consume_delivery_qr(v_token, v_order, public.sha256_hex('nonce-flow'), v_courier_user, 41.42, 41.44, '{"model":"test"}');
  perform tests.assert_eq(v_conf ->> 'result', 'delivered', 'QR doğrulama teslimatı tamamladı');
  perform tests.reset_role();
  select * into o from public.orders where id = v_order;
  perform tests.assert_eq(o.status::text, 'delivered', 'sipariş delivered');
  perform tests.assert_true(o.delivered_at is not null and o.delivered_lat = 41.42 and o.delivered_device ->> 'model' = 'test', 'delivered_at, GPS, cihaz kaydedildi');
  perform tests.assert_true(exists (select 1 from public.order_status_history where order_id = v_order and new_status = 'delivered'
    and actor_role = 'qr_verification' and actor_id = v_courier_user), 'teslim geçmişi kurye aktörüyle yazıldı');
  perform tests.assert_true(exists (select 1 from public.admin_audit_logs where action = 'delivery_qr_verified' and resource_id = v_order::text and lat = 41.42), 'teslim audit kaydı GPS ile');
  perform tests.assert_eq((select count(*)::int from public.order_status_history where order_id = v_order), 10, 'tüm durum değişimleri geçmişte');
  perform tests.assert_eq((select active_order_count from public.couriers where id = v_courier), 0, 'kurye yükü sıfırlandı');

  -- Komisyon: 20 TL × uygun kalem (2 kalem) = 40 TL
  perform tests.assert_eq((select total_amount from public.platform_commissions where order_id = v_order), 40.00::numeric, 'komisyon 20 TL × 2 kalem = 40 TL');
  perform tests.assert_eq((select product_gmv from public.platform_commissions where order_id = v_order), 260.00::numeric, 'ürün GMV snapshot 260 TL');
  perform tests.assert_raises(format($q$update public.platform_commissions set total_amount = 0 where order_id = %L$q$, v_order), 'KPD_IMMUTABLE_RECORD', 'komisyon snapshotı değiştirilemez');

  -- Puanlama: tek seferlik, güncellenemez, aggregate güncellenir
  perform tests.as_user(v_customer);
  perform public.submit_rating(v_order, 'vendor', 4, 'Hızlı hazırlandı');
  perform public.submit_rating(v_order, 'courier', 5, null);
  perform tests.assert_raises(format($q$select public.submit_rating(%L, 'vendor', 1, null)$q$, v_order), 'KPD_ALREADY_RATED', 'aynı hedef için ikinci puan reddedilir');
  perform tests.assert_raises(format($q$select public.submit_rating(%L, 'vendor', 5, '%s')$q$, v_order, repeat('a', 501)), 'KPD_INVALID_INPUT', '500 karakter üstü yorum reddedilir');
  perform tests.assert_raises($q$update public.ratings set score = 1$q$, '42501', 'puan güncellenemez');
  perform tests.reset_role();
  perform tests.assert_eq((select rating_avg from public.vendors where id = v_vendor), 4.00::numeric, 'vendor puan ortalaması güncellendi');
  perform tests.assert_eq((select rating_count from public.couriers where id = v_courier), 1, 'kurye puan sayısı güncellendi');

  -- Mutabakat
  perform tests.as_user(v_admin);
  v_settlement := public.admin_generate_settlement(v_vendor, (now() at time zone 'Europe/Istanbul')::date, (now() at time zone 'Europe/Istanbul')::date);
  perform tests.assert_eq((select commission_total from public.vendor_settlements where id = v_settlement), 40.00::numeric, 'mutabakat komisyon toplamı 40 TL');
  perform tests.assert_raises(format($q$select public.admin_generate_settlement(%L, current_date, current_date)$q$, v_vendor), 'KPD_SETTLEMENT_EXISTS', 'aynı dönem ikinci kez oluşturulamaz');
  perform public.admin_add_settlement_adjustment(v_settlement, -5, 'Hatalı ürün iadesi düzeltmesi');
  perform tests.assert_eq((select payable_amount from public.vendor_settlements where id = v_settlement), 35.00::numeric, 'düzeltme sonrası ödenecek 35 TL');
  perform public.admin_set_settlement_status(v_settlement, 'approved', 'Vendor ile mutabık kalındı');
  perform tests.assert_raises(format($q$select public.admin_add_settlement_adjustment(%L, 10, 'onaydan sonra değişiklik denemesi')$q$, v_settlement), 'KPD_SETTLEMENT_LOCKED', 'onaylı mutabakat değiştirilemez');
  -- Fiyat kuralı değişse bile geçmiş sipariş değişmez
  perform public.admin_create_pricing_version((select id from public.pricing_rules limit 1), 150, 2, 15, 15, 'Akaryakıt artışı nedeniyle güncelleme');
  perform tests.reset_role();
  perform tests.assert_eq((select delivery_fee from public.orders where id = v_order), 140.00::numeric, 'fiyat kuralı değişimi geçmiş siparişi etkilemez');
  perform tests.assert_eq((select (pricing_snapshot ->> 'version')::int from public.orders where id = v_order), 1, 'sipariş eski fiyat versiyonunu saklar');

  -- Dashboard yalnız gerçek verilerden
  perform tests.as_user(v_admin);
  perform tests.assert_eq((public.admin_dashboard_stats(now() - interval '1 day', now() + interval '1 day') ->> 'platform_commission')::numeric, 40.00::numeric, 'dashboard komisyonu gerçek veriden');
  perform tests.assert_eq((public.admin_dashboard_stats(now() - interval '1 day', now() + interval '1 day') ->> 'delivery_revenue')::numeric, 140.00::numeric, 'dashboard teslimat geliri ayrı');
  perform tests.assert_eq((public.admin_dashboard_stats(now() - interval '1 day', now() + interval '1 day') ->> 'product_gmv')::numeric, 260.00::numeric, 'dashboard ürün GMV ayrı');
  perform tests.reset_role();
end $$;

-- İptal akışı: stok ve ödeme iadesi
do $$
declare
  v_customer uuid := tests.create_user('cancel-cust@test.local');
  v_vendor_user uuid := tests.create_user('cancel-vend@test.local');
  v_vendor uuid := tests.create_vendor(v_vendor_user, 'İptal Market');
  v_p uuid := tests.create_product(v_vendor, 130.00, 5);
  v_order uuid;
begin
  v_order := tests.place_order(v_customer, v_vendor, tests.create_address(v_customer), format('[{"product_id":"%s","quantity":2}]', v_p)::jsonb);
  perform tests.assert_eq((select stock_quantity from public.products where id = v_p), 3, 'sipariş stoktan düştü');
  perform tests.as_user(v_vendor_user);
  perform tests.assert_raises(format($q$select public.vendor_update_order_status(%L, 'rejected')$q$, v_order), 'KPD_REASON_REQUIRED', 'red gerekçe ister');
  perform public.vendor_update_order_status(v_order, 'rejected', 'Kapanış saati yaklaştı');
  perform tests.reset_role();
  perform tests.assert_eq((select stock_quantity from public.products where id = v_p), 5, 'red sonrası stok iade edildi');
  perform tests.assert_eq((select payment_state::text from public.orders where id = v_order), 'refund_pending', 'teslimat ücreti iade kuyruğunda');
  perform tests.assert_eq((select status::text from public.payments where order_id = v_order and status <> 'failed'), 'refund_pending', 'ödeme refund_pending');
  perform tests.as_user(v_customer);
  perform tests.assert_raises(format($q$select public.customer_cancel_order(%L)$q$, v_order), 'KPD_INVALID_TRANSITION', 'kapanmış sipariş tekrar iptal edilemez');
  perform tests.reset_role();
end $$;

-- Ödeme zaman aşımı
do $$
declare
  v_customer uuid := tests.create_user('timeout-cust@test.local');
  v_vendor_user uuid := tests.create_user('timeout-vend@test.local');
  v_vendor uuid := tests.create_vendor(v_vendor_user, 'Zaman Market');
  v_p uuid := tests.create_product(v_vendor, 300.00, 5);
  v_order uuid;
begin
  v_order := tests.place_order(v_customer, v_vendor, tests.create_address(v_customer), format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb, false);
  update public.orders set created_at = now() - interval '2 hours' where id = v_order;
  perform tests.assert_true(public.expire_pending_payments() >= 1, 'zaman aşımı işi çalıştı');
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'cancelled', 'ödenmeyen sipariş iptal edildi');
  perform tests.assert_eq((select stock_quantity from public.products where id = v_p), 5, 'zaman aşımında stok iade edildi');
end $$;

-- Stokta olmayan ürün tercihleri (FAZ 22)
do $$
declare
  v_customer uuid := tests.create_user('sub-cust@test.local');
  v_vendor_user uuid := tests.create_user('sub-vend@test.local');
  v_vendor uuid := tests.create_vendor(v_vendor_user, 'Alternatif Market');
  v_a uuid := tests.create_product(v_vendor, 150.00, 5);
  v_b uuid := tests.create_product(v_vendor, 120.00, 5);
  v_alt uuid := tests.create_product(v_vendor, 155.00, 5);
  v_order uuid;
  v_item_a uuid;
  v_item_b uuid;
begin
  v_order := tests.place_order(v_customer, v_vendor, tests.create_address(v_customer),
    format('[{"product_id":"%s","quantity":1,"substitution":"find_alternative"},{"product_id":"%s","quantity":1,"substitution":"remove"}]', v_a, v_b)::jsonb);
  select id into v_item_a from public.order_items where order_id = v_order and product_id = v_a;
  select id into v_item_b from public.order_items where order_id = v_order and product_id = v_b;
  perform tests.assert_eq((select substitution_preference::text from public.order_items where id = v_item_a), 'find_alternative', 'tercih kaleme snapshot olarak yazıldı');
  perform tests.as_user(v_vendor_user);
  perform public.vendor_update_order_status(v_order, 'vendor_accepted');
  perform public.vendor_mark_item_unavailable(v_item_a, v_alt, null);
  perform public.vendor_mark_item_unavailable(v_item_b, null, null);
  perform tests.reset_role();
  perform tests.assert_eq((select fulfillment::text from public.order_items where id = v_item_a), 'substituted', 'alternatifle değiştirildi');
  perform tests.assert_eq((select fulfillment::text from public.order_items where id = v_item_b), 'removed', 'doğrudan çıkarıldı');
  perform tests.assert_eq((select product_subtotal from public.orders where id = v_order), 155.00::numeric, 'ürün toplamı yeniden hesaplandı');
end $$;
rollback;
