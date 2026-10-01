-- FAZ 18/19/64: QR teslimat güvenliği (veritabanı katmanı). HMAC imza doğrulaması Edge Function testlerindedir.
\ir _helpers.psql
begin;

do $$
declare
  v_customer uuid := tests.create_user('qr-cust@test.local');
  v_other_customer uuid := tests.create_user('qr-cust2@test.local');
  v_vendor_user uuid := tests.create_user('qr-vend@test.local');
  v_c1_user uuid := tests.create_user('qr-c1@test.local');
  v_c2_user uuid := tests.create_user('qr-c2@test.local');
  v_admin uuid := tests.create_user('qr-admin@test.local');
  v_vendor uuid;
  v_c1 uuid;
  v_c2 uuid;
  v_p uuid;
  v_order uuid;
  v_order2 uuid;
  v_tok uuid;
  v_tok2 uuid;
  v_res jsonb;
begin
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  v_vendor := tests.create_vendor(v_vendor_user, 'QR Market');
  v_c1 := tests.create_courier(v_c1_user, 2);
  v_c2 := tests.create_courier(v_c2_user, 2);
  v_p := tests.create_product(v_vendor, 260.00, 20);
  v_order := tests.place_order(v_customer, v_vendor, tests.create_address(v_customer), format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  v_order2 := tests.place_order(v_other_customer, v_vendor, tests.create_address(v_other_customer), format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  perform tests.vendor_prepare(v_vendor_user, v_order);
  perform tests.vendor_prepare(v_vendor_user, v_order2);

  -- QR, kurye atanmadan üretilemez
  perform tests.as_service();
  perform tests.assert_raises(format($q$select public.issue_delivery_qr(%L, %L, %L, 30)$q$, v_order, v_customer, public.sha256_hex('n0')), 'KPD_QR_NOT_AVAILABLE', 'kurye atanmadan QR üretilmez');
  perform tests.assert_raises(format($q$select public.issue_delivery_qr(%L, %L, %L, 30)$q$, v_order, v_other_customer, public.sha256_hex('n0')), 'KPD_NOT_FOUND', 'başka müşterinin siparişi için QR üretilmez');
  perform tests.reset_role();

  perform tests.as_user(v_c1_user);
  perform public.courier_accept_order(v_order);
  perform public.courier_accept_order(v_order2);
  perform public.courier_update_order_status(v_order, 'picked_up');
  perform public.courier_update_order_status(v_order, 'on_the_way');
  perform tests.reset_role();

  -- Süresi dolmuş QR
  v_tok := tests.issue_qr(v_order, v_customer, 'expired-nonce', 1);
  update public.qr_tokens set expires_at = now() - interval '1 second' where id = v_tok;
  perform tests.as_service();
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('expired-nonce'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_EXPIRED', 'süresi dolmuş QR reddedilir');
  perform tests.reset_role();

  -- Manipüle edilmiş nonce
  v_tok := tests.issue_qr(v_order, v_customer, 'real-nonce');
  perform tests.as_service();
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('forged-nonce'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_INVALID', 'manipüle edilmiş QR reddedilir');
  -- Yanlış sipariş
  v_res := public.consume_delivery_qr(v_tok, v_order2, public.sha256_hex('real-nonce'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_INVALID', 'başka siparişe bağlanan QR reddedilir');
  -- Yanlış kurye
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('real-nonce'), v_c2_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_WRONG_COURIER', 'atanmamış kurye QR kullanamaz');
  -- Kurye olmayan kullanıcı
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('real-nonce'), v_customer, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_FORBIDDEN', 'kurye olmayan kullanıcı QR kullanamaz');
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'on_the_way', 'başarısız denemeler durumu değiştirmedi');
  perform tests.assert_true(exists (select 1 from public.app_error_events where event_type = 'qr_validation_failure'), 'QR hataları gözlemlenebilirlik kaydına yazıldı');
  perform tests.reset_role();

  -- Yeniden üretimde eski QR iptal olur
  v_tok2 := tests.issue_qr(v_order, v_customer, 'second-nonce');
  perform tests.as_service();
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('real-nonce'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_REVOKED', 'yenilenen QR sonrası eski QR geçersiz');
  perform tests.reset_role();

  -- Devredilen siparişte eski kurye QR kullanamaz (FAZ 18)
  perform tests.as_user(v_admin);
  perform public.admin_assign_courier(v_order, v_c2, 'Kurye 1 aracı arızalandı, devrediliyor', false);
  perform tests.reset_role();
  perform tests.as_service();
  v_res := public.consume_delivery_qr(v_tok2, v_order, public.sha256_hex('second-nonce'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_REVOKED', 'devirden sonra eski kurye eski QR ile teslim edemez');
  v_res := public.consume_delivery_qr(v_tok2, v_order, public.sha256_hex('second-nonce'), v_c2_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_REVOKED', 'devirden önce üretilen QR yeni kurye için de geçersiz');
  perform tests.reset_role();
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'on_the_way', 'devirde durum korunur (yolda)');

  v_tok := tests.issue_qr(v_order, v_customer, 'after-transfer');
  perform tests.as_service();
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('after-transfer'), v_c1_user, 41.4, 41.4, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_WRONG_COURIER', 'eski kurye yeni QR ile de teslim edemez');
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('after-transfer'), v_c2_user, 41.41, 41.41, '{}');
  perform tests.assert_eq(v_res ->> 'result', 'delivered', 'yeni kurye yeni QR ile teslim eder');
  -- İkinci okutma
  v_res := public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('after-transfer'), v_c2_user, 41.41, 41.41, '{}');
  perform tests.assert_eq(v_res ->> 'code', 'KPD_QR_ALREADY_USED', 'ikinci okutma reddedilir (replay)');
  perform tests.reset_role();

  -- Admin bile delivered durumunu zorlayamaz (FAZ 19)
  perform tests.as_user(v_admin);
  perform tests.assert_raises(format($q$select public.admin_override_status(%L, 'delivered', 'müşteri teslim aldığını telefonda söyledi')$q$, v_order2), 'KPD_DELIVERY_REQUIRES_QR', 'admin delivered override reddedilir');
  perform tests.reset_role();
  perform tests.as_service();
  perform tests.assert_raises(format($q$update public.orders set status = 'delivered' where id = %L$q$, v_order2), 'KPD_FORBIDDEN', 'service_role doğrudan delivered yazamaz (trigger)');
  perform tests.reset_role();
  perform tests.assert_raises(format($q$update public.orders set status = 'delivered' where id = %L$q$, v_order2), 'KPD_FORBIDDEN', 'veritabanı sahibi bile doğrudan delivered yazamaz');
  perform tests.assert_raises(format($q$select public._order_transition(%L, 'delivered', 'courier')$q$, v_order2), 'KPD_INVALID_TRANSITION', 'courier aktörüyle delivered geçişi yok');
  perform tests.assert_raises(format($q$select public._order_transition(%L, 'delivered', 'admin')$q$, v_order2), 'KPD_INVALID_TRANSITION', 'admin aktörüyle delivered geçişi yok');

  -- QR tablosu ham nonce saklamaz (yalnız 64 hex hash)
  perform tests.assert_eq((select count(*)::int from public.qr_tokens where nonce_hash !~ '^[0-9a-f]{64}$'), 0, 'QR tablosunda yalnız hash saklanır');
end $$;
rollback;
