-- FAZ 15/26/30/31/32/41: Sadakat, referans, kurye kapasitesi, acil durum, manuel müdahale, destek
\ir _helpers.psql
begin;

-- Kullanıcının 5. siparişi ücretsiz teslimat; tekrar engeli; iptal edilince hak geri döner
do $$
declare
  v_c uuid := tests.create_user('loy-c@test.local');
  v_vu uuid := tests.create_user('loy-v@test.local');
  v_ku uuid := tests.create_user('loy-k@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Sadakat Market');
  v_k uuid := tests.create_courier(v_ku, 5);
  v_p uuid := tests.create_product(v_v, 250, 100);
  v_addr uuid := tests.create_address(v_c);
  v_order uuid;
  v_tok uuid;
  i int;
  o public.orders;
begin
  for i in 1..4 loop
    v_order := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
    perform tests.assert_true((select delivery_fee_payable > 0 from public.orders where id = v_order), format('%s. sipariş teslimat ücretli', i));
    perform tests.vendor_prepare(v_vu, v_order);
    perform tests.as_user(v_ku);
    perform public.courier_accept_order(v_order);
    perform public.courier_update_order_status(v_order, 'picked_up');
    perform public.courier_update_order_status(v_order, 'on_the_way');
    perform tests.reset_role();
    v_tok := tests.issue_qr(v_order, v_c, 'loy-' || i);
    perform tests.as_service();
    perform public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('loy-' || i), v_ku, 41.4, 41.4, '{}');
    perform tests.reset_role();
  end loop;
  perform tests.assert_eq((select count(*)::int from public.loyalty_rewards where user_id = v_c and status = 'available'), 1, '4 teslimattan sonra 5. sipariş için ücretsiz teslimat hakkı');

  v_order := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  select * into o from public.orders where id = v_order;
  perform tests.assert_eq(o.delivery_fee_payable, 0::numeric, '5. siparişte teslimat ücretsiz');
  perform tests.assert_true(o.delivery_fee_waived and o.payment_state = 'not_required' and o.status = 'vendor_pending', 'ödeme adımı atlandı, sipariş işletmeye iletildi');

  -- Aynı anda ikinci sipariş: ödül tekrar kullanılamaz
  v_order := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb, false);
  perform tests.assert_true((select delivery_fee_payable > 0 from public.orders where id = v_order), 'ikinci eşzamanlı sipariş ücretsiz olmaz (tekrar ödül yok)');
  perform tests.assert_eq((select count(*)::int from public.loyalty_rewards where user_id = v_c), 1, 'tek ödül kaydı (duplicate engellendi)');

  -- Ücretsiz sipariş iptal edilirse hak geri döner
  perform tests.as_user(v_c);
  perform public.customer_cancel_order(o.id, 'Yanlış adres seçtim');
  perform tests.reset_role();
  perform tests.assert_eq((select status from public.loyalty_rewards where user_id = v_c), 'available', 'iptal sonrası ödül tekrar kullanılabilir');

  -- İstemci sadakat kayıtlarını değiştiremez
  perform tests.as_user(v_c);
  perform tests.assert_raises($q$insert into public.loyalty_rewards (user_id, source, source_ref) values (auth.uid(), 'order_milestone', 'sahte')$q$, '42501', 'müşteri ödül oluşturamaz');
  perform tests.assert_raises($q$update public.loyalty_rewards set status = 'available'$q$, '42501', 'müşteri ödül durumunu değiştiremez');
  perform tests.reset_role();
end $$;

-- 5 doğrulanmış referans → ücretsiz teslimat; has_ordered istemciye kapalı
do $$
declare
  v_ref uuid := tests.create_user('ref-owner@test.local');
  v_code text;
  v_vu uuid := tests.create_user('ref-v@test.local');
  v_ku uuid := tests.create_user('ref-k@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Referans Market');
  v_k uuid := tests.create_courier(v_ku, 5);
  v_p uuid := tests.create_product(v_v, 250, 100);
  v_friend uuid;
  v_order uuid;
  v_tok uuid;
  i int;
begin
  select referral_code into v_code from public.profiles where id = v_ref;
  for i in 1..5 loop
    v_friend := tests.create_user(format('friend%s@test.local', i), v_code);
    if i = 1 then
      perform tests.as_user(v_friend);
      perform tests.assert_raises($q$update public.referrals set has_ordered = true$q$, '42501', 'referral has_ordered istemciden değiştirilemez');
      perform tests.assert_raises($q$insert into public.referrals (referrer_id, referred_id, referral_code) values (auth.uid(), auth.uid(), 'X')$q$, '42501', 'referral istemciden oluşturulamaz');
      perform tests.reset_role();
      perform tests.as_service();
      perform tests.assert_raises($q$update public.referrals set has_ordered = true$q$, 'KPD_FORBIDDEN', 'service_role bile has_ordered doğrudan yazamaz (trigger)');
      perform tests.reset_role();
    end if;
    v_order := tests.place_order(v_friend, v_v, tests.create_address(v_friend), format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
    perform tests.vendor_prepare(v_vu, v_order);
    perform tests.as_user(v_ku);
    perform public.courier_accept_order(v_order);
    perform public.courier_update_order_status(v_order, 'picked_up');
    perform public.courier_update_order_status(v_order, 'on_the_way');
    perform tests.reset_role();
    v_tok := tests.issue_qr(v_order, v_friend, 'ref-' || i);
    perform tests.as_service();
    perform public.consume_delivery_qr(v_tok, v_order, public.sha256_hex('ref-' || i), v_ku, 41.4, 41.4, '{}');
    perform tests.reset_role();
    if i = 4 then
      perform tests.assert_eq((select count(*)::int from public.loyalty_rewards where user_id = v_ref), 0, '4 referansta ödül yok');
    end if;
  end loop;
  perform tests.assert_eq((select count(*)::int from public.referrals where referrer_id = v_ref and has_ordered), 5, '5 referans doğrulandı (sunucu tarafında)');
  perform tests.assert_eq((select count(*)::int from public.loyalty_rewards where user_id = v_ref and source = 'referral_milestone'), 1, '5 referans → 1 ücretsiz teslimat');
end $$;

-- Kurye kapasitesi, devir, havuza döndürme, acil durum
do $$
declare
  v_admin uuid := tests.create_user('ops-admin@test.local');
  v_c uuid := tests.create_user('ops-c@test.local');
  v_vu uuid := tests.create_user('ops-v@test.local');
  v_k1u uuid := tests.create_user('ops-k1@test.local');
  v_k2u uuid := tests.create_user('ops-k2@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Operasyon Market');
  v_k1 uuid := tests.create_courier(v_k1u, 1);
  v_k2 uuid := tests.create_courier(v_k2u, 1);
  v_p uuid := tests.create_product(v_v, 300, 100);
  v_addr uuid := tests.create_address(v_c);
  v_o1 uuid;
  v_o2 uuid;
  v_o3 uuid;
  v_inc uuid;
begin
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  v_o1 := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  v_o2 := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  v_o3 := tests.place_order(v_c, v_v, v_addr, format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  perform tests.vendor_prepare(v_vu, v_o1);
  perform tests.vendor_prepare(v_vu, v_o2);
  perform tests.vendor_prepare(v_vu, v_o3);

  -- Çevrimdışı kurye görev alamaz
  perform tests.as_user(v_k2u);
  perform public.courier_set_online(false);
  perform tests.assert_raises(format($q$select public.courier_accept_order(%L)$q$, v_o1), 'KPD_COURIER_OFFLINE', 'çevrimdışı kurye görev alamaz');
  perform tests.assert_eq((select count(*)::int from public.courier_available_orders()), 0, 'çevrimdışı kurye havuzu görmez');
  perform public.courier_set_online(true);

  -- Kapasite: max_active_orders = 1
  perform tests.as_user(v_k1u);
  perform public.courier_accept_order(v_o1);
  perform tests.assert_raises(format($q$select public.courier_accept_order(%L)$q$, v_o2), 'KPD_COURIER_OFFLINE', 'kapasitesi dolu (meşgul) kurye yeni görev alamaz');
  perform tests.reset_role();
  perform tests.assert_eq((select availability::text from public.couriers where id = v_k1), 'busy', 'kapasite dolunca kurye meşgul');

  perform tests.as_user(v_admin);
  perform tests.assert_raises(format($q$select public.admin_assign_courier(%L, %L, 'Yoğunluk nedeniyle ek görev', false)$q$, v_o2, v_k1), 'KPD_COURIER_CAPACITY', 'admin kapasite aşımı onaysız reddedilir');
  perform public.admin_assign_courier(v_o2, v_k1, 'Yoğunluk nedeniyle ek görev', true);
  perform tests.assert_true(exists (select 1 from public.admin_audit_logs where action = 'courier_capacity_override' and resource_id = v_k1::text), 'kapasite aşımı audit kaydı');
  perform tests.assert_raises(format($q$select public.admin_return_to_pool(%L, 'kısa')$q$, v_o2), 'KPD_REASON_REQUIRED', 'gerekçesiz müdahale reddedilir');
  perform public.admin_return_to_pool(v_o2, 'Kurye yoğun, havuza geri alınıyor');
  perform tests.reset_role();
  perform tests.assert_true((select courier_id is null and status = 'ready_for_pickup' from public.orders where id = v_o2), 'havuza döndürülen sipariş atamasız ve hazır');
  perform tests.assert_true(exists (select 1 from public.order_transfers where order_id = v_o2 and transfer_type = 'return_to_pool'), 'havuza dönüş kaydı');

  -- Teslim alınmış sipariş havuza döndürülemez, devredilebilir
  perform tests.as_user(v_k1u);
  perform public.courier_update_order_status(v_o1, 'picked_up');
  perform tests.assert_raises(format($q$select public.courier_release_order(%L, 'bırakıyorum')$q$, v_o1), 'KPD_RELEASE_AFTER_PICKUP', 'teslim alınan sipariş kuryece bırakılamaz');
  perform tests.as_user(v_admin);
  perform tests.assert_raises(format($q$select public.admin_return_to_pool(%L, 'teslim alınmış siparişi havuza alma')$q$, v_o1), 'KPD_RELEASE_AFTER_PICKUP', 'teslim alınan sipariş havuza döndürülemez');
  perform public.admin_assign_courier(v_o1, v_k2, 'Kurye 1 kaza bildirdi, devrediliyor', false);
  perform tests.reset_role();
  perform tests.assert_eq((select courier_id from public.orders where id = v_o1), v_k2, 'sipariş yeni kuryeye devredildi');
  perform tests.assert_eq((select status::text from public.orders where id = v_o1), 'picked_up', 'devirde durum korundu');

  -- Admin durum düzeltme: yalnız izinli geçişler
  perform tests.as_user(v_admin);
  perform tests.assert_raises(format($q$select public.admin_override_status(%L, 'preparing', 'hazırlığa geri al')$q$, v_o3), 'KPD_INVALID_TRANSITION', 'admin izinsiz geçiş yapamaz');
  perform public.admin_override_status(v_o3, 'cancelled', 'Müşteri telefonla iptal istedi, doğrulandı');
  perform tests.reset_role();
  perform tests.assert_true(exists (select 1 from public.admin_audit_logs where action = 'override_order_status' and resource_id = v_o3::text and reason like 'Müşteri%'), 'durum düzeltme gerekçeyle audit edildi');

  -- Acil durum: ciddi olay kuryeyi kullanılamaz yapar, admin bildirimi
  perform tests.as_user(v_k2u);
  v_inc := public.courier_report_incident('accident', 'Kavşakta hafif kaza', 41.41, 41.43);
  perform tests.reset_role();
  perform tests.assert_eq((select availability::text from public.couriers where id = v_k2), 'unavailable', 'kaza bildirimi kuryeyi kullanılamaz yaptı');
  perform tests.assert_true(exists (select 1 from public.courier_incidents where id = v_inc and order_id = v_o1 and lat = 41.41), 'olay aktif sipariş ve konumla kaydedildi');
  perform tests.assert_true(exists (select 1 from public.notifications where user_id = v_admin and type = 'emergency'), 'admin acil durum bildirimi aldı');
  perform tests.as_user(v_k2u);
  perform tests.assert_raises($q$select public.courier_set_online(true)$q$, 'KPD_COURIER_INCIDENT_OPEN', 'açık ciddi olayda kurye çevrimiçi olamaz');
  perform tests.reset_role();
  perform tests.as_user(v_k1u);
  perform public.courier_report_incident('road_blocked', 'Sahil yolu kapalı');
  perform tests.reset_role();
  perform tests.assert_true((select availability <> 'unavailable' from public.couriers where id = v_k1), 'yol kapalı bildirimi kuryeyi çevrimdışı yapmaz');
end $$;

-- Destek: konuşma durumu
do $$
declare
  v_admin uuid := tests.create_user('sup-admin@test.local');
  v_c uuid := tests.create_user('sup-c@test.local');
  v_conv uuid;
begin
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  perform tests.as_user(v_c);
  v_conv := public.create_support_conversation('Teslimat gecikti', 'Siparişim nerede?');
  perform tests.as_user(v_admin);
  perform public.send_support_message(v_conv, 'Kontrol ediyorum, kuryeniz yolda.');
  perform tests.assert_eq((select status::text from public.support_conversations where id = v_conv), 'waiting', 'admin yanıtı sonrası waiting');
  perform tests.as_user(v_c);
  perform public.send_support_message(v_conv, 'Teşekkürler');
  perform public.set_support_status(v_conv, 'resolved');
  perform tests.assert_eq((select status::text from public.support_conversations where id = v_conv), 'resolved', 'müşteri çözüldü işaretledi');
  perform tests.assert_raises($q$update public.support_messages set body = 'değişti'$q$, '42501', 'destek mesajları değiştirilemez');
  perform tests.reset_role();
end $$;
rollback;
