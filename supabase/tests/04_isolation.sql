-- FAZ 3/34/65/72: Çok kiracılı izolasyon. Realtime postgres_changes yalnız RLS SELECT politikası izin veren
-- abonelere satır gönderir; bu nedenle buradaki SELECT izolasyonu Realtime izolasyonunun temelidir.
-- Her senaryoda hem "doğru kullanıcı görüyor mu" hem "yetkisiz kullanıcı görüyor mu" kontrol edilir.
\ir _helpers.psql
begin;

do $$
declare
  v_ca uuid := tests.create_user('iso-ca@test.local');
  v_cb uuid := tests.create_user('iso-cb@test.local');
  v_va_user uuid := tests.create_user('iso-va@test.local');
  v_vb_user uuid := tests.create_user('iso-vb@test.local');
  v_ka_user uuid := tests.create_user('iso-ka@test.local');
  v_kb_user uuid := tests.create_user('iso-kb@test.local');
  v_va uuid;
  v_vb uuid;
  v_ka uuid;
  v_kb uuid;
  v_order_a uuid;
  v_order_b uuid;
  v_conv_a uuid;
  v_conv_b uuid;
  v_addr_a uuid;
begin
  v_va := tests.create_vendor(v_va_user, 'İzolasyon A');
  v_vb := tests.create_vendor(v_vb_user, 'İzolasyon B');
  v_ka := tests.create_courier(v_ka_user);
  v_kb := tests.create_courier(v_kb_user);
  v_addr_a := tests.create_address(v_ca);
  v_order_a := tests.place_order(v_ca, v_va, v_addr_a, format('[{"product_id":"%s","quantity":1}]', tests.create_product(v_va, 300))::jsonb);
  v_order_b := tests.place_order(v_cb, v_vb, tests.create_address(v_cb), format('[{"product_id":"%s","quantity":1}]', tests.create_product(v_vb, 300))::jsonb);
  perform tests.vendor_prepare(v_va_user, v_order_a);
  perform tests.vendor_prepare(v_vb_user, v_order_b);
  perform tests.as_user(v_ka_user); perform public.courier_accept_order(v_order_a);
  perform public.courier_update_order_status(v_order_a, 'picked_up');
  perform tests.as_user(v_kb_user); perform public.courier_accept_order(v_order_b);
  perform public.courier_update_order_status(v_order_b, 'picked_up');
  perform tests.as_user(v_ka_user); perform public.courier_update_location(41.41, 41.43);
  perform tests.as_user(v_kb_user); perform public.courier_update_location(41.42, 41.44);
  perform tests.as_user(v_ca); v_conv_a := public.create_support_conversation('Sipariş sorusu A', 'Merhaba, A');
  perform tests.as_user(v_cb); v_conv_b := public.create_support_conversation('Sipariş sorusu B', 'Merhaba, B');
  perform tests.reset_role();

  -- Müşteri A ↔ B
  perform tests.as_user(v_ca);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_a), 1, 'müşteri A kendi siparişini görür');
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_b), 0, 'müşteri A, B siparişini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_items where order_id = v_order_b), 0, 'müşteri A, B kalemlerini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_status_history where order_id = v_order_b), 0, 'müşteri A, B geçmişini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_live_locations where order_id = v_order_a), 1, 'müşteri A kendi canlı konumunu görür');
  perform tests.assert_eq((select count(*)::int from public.order_live_locations where order_id = v_order_b), 0, 'müşteri A, B kurye konumunu GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.support_messages m join public.support_conversations c on c.id = m.conversation_id where c.id = v_conv_b), 0, 'müşteri A, B destek mesajlarını GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.support_conversations where id = v_conv_a), 1, 'müşteri A kendi destek talebini görür');
  perform tests.assert_eq((select count(*)::int from public.addresses where user_id = v_cb), 0, 'müşteri A, B adreslerini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.notifications where user_id <> v_ca), 0, 'müşteri A başkasının bildirimlerini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.payments where order_id = v_order_b), 0, 'müşteri A, B ödemesini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.profiles where id = v_cb), 0, 'müşteri A, B profilini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.courier_locations), 0, 'müşteri ham kurye konum geçmişini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.couriers), 0, 'müşteri kurye kayıtlarını GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_transfers), 0, 'müşteri devir kayıtlarını GÖRMEZ');
  perform tests.assert_raises(format($q$select public.get_order_tracking(%L)$q$, v_order_b), 'KPD_NOT_FOUND', 'müşteri A, B takip verisini alamaz');
  perform tests.assert_raises(format($q$select public.send_support_message(%L, 'araya girme')$q$, v_conv_b), 'KPD_NOT_FOUND', 'müşteri A, B konuşmasına yazamaz');
  perform tests.assert_raises(format($q$select public.customer_cancel_order(%L)$q$, v_order_b), 'KPD_NOT_FOUND', 'müşteri A, B siparişini iptal edemez');
  update public.addresses set street = 'Ele geçirildi' where user_id = v_cb;
  update public.addresses set street = 'Kendi sokağım' where id = v_addr_a;
  perform tests.reset_role();
  perform tests.assert_eq((select count(*)::int from public.addresses where user_id = v_cb and street = 'Ele geçirildi'), 0, 'müşteri A, B adresini güncelleyemez');
  perform tests.assert_eq((select street from public.addresses where id = v_addr_a), 'Kendi sokağım', 'müşteri A kendi adresini güncelleyebilir');

  -- Vendor A ↔ B
  perform tests.as_user(v_va_user);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_a), 1, 'vendor A kendi siparişini görür');
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_b), 0, 'vendor A, B siparişini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_items where order_id = v_order_b), 0, 'vendor A, B kalemlerini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.customer_address_book where vendor_id = v_vb), 0, 'vendor A, B adres defterini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.customer_address_book where vendor_id = v_va), 1, 'vendor A kendi adres defterini görür');
  perform tests.assert_eq((select count(*)::int from public.order_live_locations), 0, 'vendor kurye canlı konumunu GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.addresses), 0, 'vendor müşteri adres kayıtlarını GÖRMEZ');
  perform tests.assert_raises(format($q$select public.vendor_update_order_status(%L, 'cancelled', 'başkasının siparişi')$q$, v_order_b), 'KPD_NOT_FOUND', 'vendor A, B siparişini değiştiremez');
  perform tests.assert_raises(format($q$select * from public.vendor_address_book_lookup(%L, '05320000003')$q$, v_vb), 'KPD_FORBIDDEN', 'vendor A, B adres defterini sorgulayamaz');
  perform tests.assert_true((select count(*) from public.vendor_address_book_lookup(v_va, '0532 000 00 03')) = 1, 'adres defteri farklı yazımlı telefonla bulunur');
  perform tests.assert_raises(format($q$insert into public.products (vendor_id, category_id, name, price, stock_quantity) values (%L, (select id from public.categories limit 1), 'Sızma', 10, 1)$q$, v_vb), '42501', 'vendor A, B adına ürün ekleyemez');
  perform tests.assert_raises(format($q$select public.vendor_sales_summary(%L, now() - interval '1 day', now())$q$, v_vb), 'KPD_FORBIDDEN', 'vendor A, B satış özetini alamaz');
  perform tests.assert_eq((select count(*)::int from public.platform_commissions where vendor_id = v_vb), 0, 'vendor A, B komisyonlarını GÖRMEZ');

  -- Kurye A ↔ B
  perform tests.as_user(v_ka_user);
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_a), 1, 'kurye A atanmış siparişini görür');
  perform tests.assert_eq((select count(*)::int from public.orders where id = v_order_b), 0, 'kurye A, B siparişini GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_live_locations where order_id = v_order_b), 0, 'kurye A, B konumunu GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.couriers where id = v_kb), 0, 'kurye A, B kurye kaydını GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.order_assignments where courier_id = v_kb), 0, 'kurye A, B atamalarını GÖRMEZ');
  perform tests.assert_eq((select count(*)::int from public.courier_incidents where courier_id = v_kb), 0, 'kurye A, B olaylarını GÖRMEZ');
  perform tests.assert_raises(format($q$select public.courier_update_order_status(%L, 'on_the_way')$q$, v_order_b), 'KPD_NOT_FOUND', 'kurye A, B siparişini ilerletemez');
  perform tests.assert_raises(format($q$select public.courier_release_order(%L, 'başkasının siparişini bırak')$q$, v_order_b), 'KPD_NOT_FOUND', 'kurye A, B siparişini bırakamaz');

  -- Rol yükseltme denemeleri (customer/vendor/courier → admin)
  perform tests.as_user(v_ca);
  perform tests.assert_raises($q$select public.admin_dashboard_stats(now() - interval '1 day', now())$q$, 'KPD_FORBIDDEN', 'customer admin dashboard alamaz');
  perform tests.assert_eq((select count(*)::int from public.admin_audit_logs), 0, 'customer audit log GÖRMEZ');
  perform tests.as_user(v_va_user);
  perform tests.assert_raises($q$select * from public.admin_live_operations()$q$, 'KPD_FORBIDDEN', 'vendor admin canlı operasyonu alamaz');
  perform tests.assert_raises($q$select public.admin_update_setting('komisyon.per_item_amount', '0', 'komisyonu sıfırlamak istiyorum')$q$, 'KPD_FORBIDDEN', 'vendor komisyon ayarını değiştiremez');
  perform tests.as_user(v_ka_user);
  perform tests.assert_raises(format($q$select public.admin_assign_courier(%L, %L, 'kendime sipariş atamak istiyorum', true)$q$, v_order_b, v_ka), 'KPD_FORBIDDEN', 'kurye admin atama yapamaz');
  perform tests.assert_raises($q$select * from public.admin_list_users()$q$, 'KPD_FORBIDDEN', 'kurye kullanıcı listesini alamaz');

  -- Public tracking token sızıntısı
  perform tests.as_user(v_ca);
  perform tests.as_anon();
  perform tests.assert_eq(public.public_track_order('tahmin-edilemez-olmayan-token-xxxx'), null::jsonb, 'geçersiz takip tokenı veri döndürmez');
  perform tests.reset_role();
end $$;

-- Public tracking: minimum bilgi, başka sipariş yok, telefon/adres yok
do $$
declare
  v_c uuid := tests.create_user('track-c@test.local');
  v_vu uuid := tests.create_user('track-v@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Takip Market');
  v_order uuid;
  v_token text;
  v_pub jsonb;
begin
  v_order := tests.place_order(v_c, v_v, tests.create_address(v_c), format('[{"product_id":"%s","quantity":1}]', tests.create_product(v_v, 300))::jsonb);
  perform tests.as_user(v_c);
  v_token := public.rotate_tracking_token(v_order);
  perform tests.as_anon();
  v_pub := public.public_track_order(v_token);
  perform tests.assert_eq(v_pub ->> 'status', 'vendor_pending', 'public tracking durumu döndürür');
  perform tests.assert_true(v_pub::text not like '%+90%' and v_pub::text not like '%Cumhuriyet%' and not (v_pub ? 'customer_phone')
    and not (v_pub ? 'delivery_address') and not (v_pub ? 'customer_id'), 'public tracking telefon/adres/kimlik içermez');
  perform tests.reset_role();
  perform tests.as_user(v_c);
  perform public.rotate_tracking_token(v_order);
  perform tests.as_anon();
  perform tests.assert_eq(public.public_track_order(v_token), null::jsonb, 'yenilenen token sonrası eski bağlantı geçersiz');
  perform tests.reset_role();
end $$;
rollback;
