-- FAZ 72 güvenlik incelemesinde bulunan sorunların regresyon testleri
\ir _helpers.psql
begin;

-- Mükerrer ödeme: ikinci başarılı tahsilat iade kuyruğuna alınır, sipariş bozulmaz
do $$
declare
  v_c uuid := tests.create_user('dup-c@test.local');
  v_vu uuid := tests.create_user('dup-v@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Mükerrer Market');
  v_p uuid := tests.create_product(v_v, 300);
  v_quote public.delivery_fees;
  v_res jsonb;
  v_order uuid;
  p1 public.payments;
  p2 public.payments;
begin
  perform tests.as_service();
  v_quote := public.create_delivery_fee_quote(v_c, v_v, tests.create_address(v_c), 3, 'google_maps');
  perform tests.as_user(v_c);
  v_res := public.create_order(v_quote.id, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb, 'cash');
  v_order := (v_res ->> 'order_id')::uuid;
  perform tests.as_service();
  p1 := public.begin_delivery_payment(v_order, v_c);
  perform public.attach_payment_token(p1.id, 'tok-dup-1');
  p2 := public.begin_delivery_payment(v_order, v_c); -- p1 'superseded' olarak işaretlenir
  perform public.attach_payment_token(p2.id, 'tok-dup-2');
  perform tests.assert_eq((public.confirm_delivery_payment(p2.id, 'iyz-2', p2.amount, '{}') ->> 'result'), 'confirmed', 'ilk tamamlanan ödeme siparişi onaylar');
  -- Kullanıcı eski sekmedeki ödeme formunu da tamamladı
  perform tests.assert_eq((public.confirm_delivery_payment(p1.id, 'iyz-1', p1.amount, '{}') ->> 'result'), 'duplicate_refund_queued', 'mükerrer ödeme iade kuyruğuna alınır');
  perform tests.reset_role();
  perform tests.assert_eq((select status::text from public.payments where id = p1.id), 'refund_pending', 'mükerrer tahsilat refund_pending');
  perform tests.assert_eq((select status::text from public.orders where id = v_order), 'vendor_pending', 'sipariş tek ödemeyle işletmeye iletildi');
  perform tests.assert_eq((select count(*)::int from public.payments where order_id = v_order and status = 'succeeded'), 1, 'sipariş başına tek başarılı ödeme');
end $$;

-- Alternatif ürün suistimali: orijinalin %25 fazlasını aşan alternatif reddedilir
do $$
declare
  v_c uuid := tests.create_user('sub2-c@test.local');
  v_vu uuid := tests.create_user('sub2-v@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Pahalı Alternatif Market');
  v_a uuid := tests.create_product(v_v, 260, 5);
  v_exp uuid := tests.create_product(v_v, 900, 5);
  v_ok uuid := tests.create_product(v_v, 300, 5);
  v_order uuid;
  v_item uuid;
begin
  v_order := tests.place_order(v_c, v_v, tests.create_address(v_c), format('[{"product_id":"%s","quantity":1,"substitution":"find_alternative"}]', v_a)::jsonb);
  select id into v_item from public.order_items where order_id = v_order;
  perform tests.as_user(v_vu);
  perform public.vendor_update_order_status(v_order, 'vendor_accepted');
  perform tests.assert_raises(format($q$select public.vendor_mark_item_unavailable(%L, %L)$q$, v_item, v_exp), 'KPD_SUBSTITUTE_TOO_EXPENSIVE', 'çok pahalı alternatif reddedilir');
  perform public.vendor_mark_item_unavailable(v_item, v_ok);
  perform tests.reset_role();
  perform tests.assert_eq((select product_subtotal from public.orders where id = v_order), 300.00::numeric, 'makul alternatif kabul edildi');
end $$;

-- Çalışma saatleri dışında sipariş alınmaz (sunucu otoritesi)
do $$
declare
  v_c uuid := tests.create_user('hours-c@test.local');
  v_vu uuid := tests.create_user('hours-v@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Saat Market');
  v_p uuid := tests.create_product(v_v, 300);
  v_quote public.delivery_fees;
  v_now time := (now() at time zone 'Europe/Istanbul')::time;
begin
  -- Şu anı dışarıda bırakan 1 saatlik pencere
  update public.coverage_areas set opens_at = (v_now + interval '1 hour')::time, closes_at = (v_now + interval '2 hours')::time where slug = 'hopa';
  perform tests.as_service();
  v_quote := public.create_delivery_fee_quote(v_c, v_v, tests.create_address(v_c), 3, 'google_maps');
  perform tests.as_user(v_c);
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'cash')$q$, v_quote.id, v_p), 'KPD_VENDOR_CLOSED', 'hizmet saatleri dışında sipariş reddedilir');
  perform tests.reset_role();
  perform tests.open_all_day();
  update public.vendors set is_open = false where id = v_v;
  perform tests.as_user(v_c);
  perform tests.assert_raises(format($q$select public.create_order(%L, '[{"product_id":"%s","quantity":1}]', 'cash')$q$, v_quote.id, v_p), 'KPD_VENDOR_CLOSED', 'işletme kapalıyken sipariş reddedilir');
  perform tests.reset_role();
end $$;
rollback;
