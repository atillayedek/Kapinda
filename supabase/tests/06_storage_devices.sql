-- FAZ 20/33: Teslimat kanıtı storage politikaları ve FCM cihaz token yaşam döngüsü
\ir _helpers.psql
begin;

do $$
declare
  v_c uuid := tests.create_user('st-c@test.local');
  v_other uuid := tests.create_user('st-other@test.local');
  v_vu uuid := tests.create_user('st-v@test.local');
  v_ku uuid := tests.create_user('st-k@test.local');
  v_k2u uuid := tests.create_user('st-k2@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Storage Market');
  v_k uuid := tests.create_courier(v_ku);
  v_k2 uuid := tests.create_courier(v_k2u);
  v_order uuid;
  v_path text;
begin
  perform tests.assert_true(not (select public from storage.buckets where id = 'delivery-proofs'), 'teslimat kanıtı bucketı private');
  v_order := tests.place_order(v_c, v_v, tests.create_address(v_c), format('[{"product_id":"%s","quantity":1}]', tests.create_product(v_v, 300))::jsonb);
  perform tests.vendor_prepare(v_vu, v_order);
  perform tests.as_user(v_ku);
  perform public.courier_accept_order(v_order);
  perform public.courier_update_order_status(v_order, 'picked_up');
  v_path := format('%s/%s/kanit.jpg', v_order, v_k);
  insert into storage.objects (bucket_id, name, owner) values ('delivery-proofs', v_path, v_ku);
  perform public.courier_add_delivery_proof(v_order, v_path, 'image/jpeg', 200000, 41.4, 41.4);
  perform tests.assert_raises(format($q$select public.courier_add_delivery_proof(%L, %L, 'application/pdf', 100)$q$, v_order, format('%s/%s/b.pdf', v_order, v_k)), '23514', 'izin verilmeyen dosya tipi reddedilir');
  perform tests.assert_raises(format($q$select public.courier_add_delivery_proof(%L, %L, 'image/jpeg', 6000000)$q$, v_order, format('%s/%s/c.jpg', v_order, v_k)), '23514', '5 MB üstü dosya reddedilir');
  perform tests.assert_raises(format($q$select public.courier_add_delivery_proof(%L, %L, 'image/jpeg', 100)$q$, v_order, 'baska/yol/d.jpg'), 'KPD_INVALID_STORAGE_PATH', 'sipariş dışı yol reddedilir');

  perform tests.as_user(v_k2u);
  perform tests.assert_raises(format($q$insert into storage.objects (bucket_id, name) values ('delivery-proofs', '%s/%s/x.jpg')$q$, v_order, v_k2), '42501', 'atanmamış kurye kanıt yükleyemez');
  perform tests.assert_eq((select count(*)::int from storage.objects where bucket_id = 'delivery-proofs'), 0, 'atanmamış kurye kanıtı göremez');
  perform tests.as_user(v_other);
  perform tests.assert_eq((select count(*)::int from storage.objects where bucket_id = 'delivery-proofs'), 0, 'başka müşteri kanıtı göremez');
  perform tests.as_anon();
  perform tests.assert_eq((select count(*)::int from storage.objects where bucket_id = 'delivery-proofs'), 0, 'anonim kanıtı göremez');
  perform tests.as_user(v_c);
  perform tests.assert_eq((select count(*)::int from storage.objects where bucket_id = 'delivery-proofs'), 1, 'siparişin müşterisi kanıtı görür (signed URL)');
  perform tests.as_user(v_vu);
  perform tests.assert_raises(format($q$insert into storage.objects (bucket_id, name) values ('product-images', '%s/p/x.jpg')$q$, gen_random_uuid()), '42501', 'vendor başka işletme klasörüne ürün görseli yükleyemez');
  insert into storage.objects (bucket_id, name) values ('product-images', format('%s/p/x.jpg', v_v));
  perform tests.assert_true(true, 'vendor kendi klasörüne ürün görseli yükler');
  perform tests.reset_role();
end $$;

do $$
declare
  v_a uuid := tests.create_user('dev-a@test.local');
  v_b uuid := tests.create_user('dev-b@test.local');
  v_tok text := 'fcm-token-' || repeat('x', 40);
begin
  perform tests.as_user(v_a);
  perform tests.assert_raises(format($q$select public.register_device_token(%L, 'admin', 'web')$q$, v_tok), 'KPD_FORBIDDEN', 'admin olmayan admin cihazı kaydedemez');
  perform tests.assert_raises(format($q$select public.register_device_token(%L, 'courier', 'android')$q$, v_tok), 'KPD_FORBIDDEN', 'kurye olmayan kurye cihazı kaydedemez');
  perform public.register_device_token(v_tok, 'customer', 'web', 'device-1', 'Chrome');
  perform tests.assert_eq((select count(*)::int from public.device_tokens where user_id = v_a and revoked_at is null), 1, 'cihaz tokenı kaydedildi');
  perform public.register_device_token(v_tok || 'yeni', 'customer', 'web', 'device-1', 'Chrome');
  perform tests.assert_eq((select count(*)::int from public.device_tokens where user_id = v_a and revoked_at is null), 1, 'aynı cihazın eski tokenı iptal edildi');
  perform public.revoke_device_token(v_tok || 'yeni');
  perform tests.assert_eq((select count(*)::int from public.device_tokens where user_id = v_a and revoked_at is null), 0, 'çıkışta token iptal edildi');
  perform tests.as_user(v_b);
  perform public.register_device_token(v_tok, 'customer', 'web', 'device-9', 'Firefox');
  perform tests.as_user(v_a);
  perform tests.assert_eq((select count(*)::int from public.device_tokens), 1, 'kullanıcı yalnız kendi tokenlarını görür (devredilen token görünmez)');
  perform tests.reset_role();
  perform tests.assert_eq((select user_id from public.device_tokens where token = v_tok), v_b, 'cihaz başka hesaba geçince token yeni kullanıcıya bağlandı');
end $$;
rollback;
