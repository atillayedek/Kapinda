-- FAZ 2/43/66: RBAC ve veritabanı invariant'ları
\ir _helpers.psql
begin;

do $$
declare
  v_customer uuid := tests.create_user('cust@test.local');
  v_vendor_user uuid := tests.create_user('vend@test.local');
  v_courier_user uuid := tests.create_user('cour@test.local');
  v_admin uuid := tests.create_user('admin@test.local');
  v_vendor uuid;
  v_courier uuid;
  v_app uuid;
begin
  insert into public.user_roles (user_id, role) values (v_admin, 'admin');
  v_vendor := tests.create_vendor(v_vendor_user, 'Invariant Market');
  v_courier := tests.create_courier(v_courier_user);

  -- Yeni kullanıcı yalnız customer rolüyle başlar, onaylar kaydedilir
  perform tests.assert_eq((select array_agg(role::text) from public.user_roles where user_id = v_customer), array['customer'], 'yeni kullanıcı yalnız customer');
  perform tests.assert_true((select consents_complete from public.profiles where id = v_customer), 'zorunlu onaylar kaydedildi');
  perform tests.assert_eq((select count(*)::int from public.user_consents where user_id = v_customer), 3, 'üç onay sürümüyle saklandı');

  -- Kullanıcı kendine rol veremez / rolünü değiştiremez
  perform tests.as_user(v_customer);
  perform tests.assert_raises(format($q$insert into public.user_roles (user_id, role) values (%L, 'admin')$q$, v_customer), '42501', 'customer kendine admin rolü ekleyemez');
  perform tests.assert_raises(format($q$update public.user_roles set role = 'admin' where user_id = %L$q$, v_customer), '42501', 'customer rolünü güncelleyemez');
  perform tests.assert_raises(format($q$delete from public.user_roles where user_id = %L$q$, v_customer), '42501', 'customer rol silemez');
  perform tests.assert_raises(format($q$select public.admin_grant_role(%L, 'admin', 'kendimi yükseltmek istiyorum')$q$, v_customer), 'KPD_FORBIDDEN', 'admin RPC customer için kapalı');
  perform tests.assert_raises($q$select public.bootstrap_first_admin('cust@test.local')$q$, '42501', 'bootstrap_first_admin istemciye kapalı');
  perform tests.assert_raises(format($q$update public.profiles set is_blocked = false, consents_complete = true where id = %L$q$, v_customer), '42501', 'profil korumalı kolonları güncellenemez');
  perform tests.assert_raises(format($q$update public.profiles set referral_code = 'AAAAAAAA' where id = %L$q$, v_customer), '42501', 'referans kodu değiştirilemez');

  -- Başvuru: yalnız kendi adına ve pending
  insert into public.vendor_applications (applicant_user_id, business_name, business_type, owner_name, tax_number, phone, email, district_id, address)
  values (v_customer, 'Başvuru Market', 'market', 'Başvuru Sahibi', '1234567890', '05321112233', 'basvuru@test.local',
    (select id from public.districts where slug = 'hopa'), 'Hopa merkez adresi')
  returning id into v_app;
  perform tests.assert_eq((select phone from public.vendor_applications where id = v_app), '+905321112233', 'başvuru telefonu normalize');
  perform tests.assert_raises(format($q$insert into public.vendor_applications (applicant_user_id, business_name, business_type, owner_name, tax_number, phone, email, district_id, address, status) values (%L,'X Market','market','Ad Soyad','1234567890','05321112233','x@test.local',%L,'adres satırı','approved')$q$,
    v_customer, (select id from public.districts where slug = 'hopa')), '42501', 'başvuru status ile oluşturulamaz');
  perform tests.assert_raises(format($q$update public.vendor_applications set status = 'approved' where id = %L$q$, v_app), '42501', 'vendor kendi başvurusunu onaylayamaz');
  perform tests.assert_raises(format($q$insert into public.courier_applications (applicant_user_id, full_name, phone, email, district_id, vehicle_type) values (%L,'Baskası Kisi','05321112233','b@test.local',%L,'yaya')$q$,
    v_vendor_user, (select id from public.districts where slug = 'hopa')), '42501', 'başkası adına başvuru yapılamaz');

  -- Vendor kendi durumunu/onayını değiştiremez
  perform tests.as_user(v_vendor_user);
  perform tests.assert_raises(format($q$update public.vendors set status = 'active', approved_at = now() where id = %L$q$, v_vendor), '42501', 'vendor approval self-update reddedilir');
  perform tests.assert_raises(format($q$update public.vendors set rating_avg = 5 where id = %L$q$, v_vendor), '42501', 'vendor puanını değiştiremez');
  update public.vendors set description = 'Taze ürünler' where id = v_vendor;
  perform tests.assert_eq((select description from public.vendors where id = v_vendor), 'Taze ürünler', 'vendor izinli kolonu güncelleyebilir');

  -- Courier kendi onayını/kapasitesini değiştiremez
  perform tests.as_user(v_courier_user);
  perform tests.assert_raises(format($q$update public.couriers set status = 'active' where id = %L$q$, v_courier), '42501', 'courier approval self-update reddedilir');
  perform tests.assert_raises(format($q$update public.couriers set max_active_orders = 10 where id = %L$q$, v_courier), '42501', 'courier kapasitesini değiştiremez');

  -- Admin rol işlemleri gerekçe ister ve audit üretir
  perform tests.as_user(v_admin);
  perform tests.assert_raises(format($q$select public.admin_grant_role(%L, 'admin', 'kısa')$q$, v_customer), 'KPD_REASON_REQUIRED', 'gerekçesiz admin işlemi reddedilir');
  perform tests.assert_raises(format($q$select public.admin_grant_role(%L, 'vendor', 'başvurusuz vendor rolü verilmez')$q$, v_customer), 'KPD_ROLE_VIA_APPLICATION', 'vendor rolü yalnız başvuru ile');
  perform tests.assert_raises(format($q$select public.admin_revoke_role(%L, 'admin', 'son admin kendini çıkaramaz')$q$, v_admin), 'KPD_CANNOT_REVOKE_SELF', 'admin kendi rolünü kaldıramaz');
  perform public.admin_approve_vendor_application(v_app, tests.hopa_area(), 41.41, 41.43, 'Belgeler kontrol edildi');
  perform tests.reset_role();
  perform tests.assert_true(public.has_role(v_customer, 'vendor'), 'başvuru onayı vendor rolü verdi');
  perform tests.assert_true(exists (select 1 from public.admin_audit_logs where action = 'approve_vendor_application' and actor_id = v_admin), 'onay audit kaydı');
end $$;

-- Audit değiştirilemez (admin ve postgres dahil)
do $$
declare
  v_admin uuid := (select user_id from public.user_roles where role = 'admin' limit 1);
begin
  perform tests.assert_true((select count(*) from public.admin_audit_logs) > 0, 'audit kaydı mevcut');
  perform tests.as_user(v_admin);
  perform tests.assert_raises($q$update public.admin_audit_logs set reason = 'değiştirildi'$q$, '42501', 'admin audit UPDATE reddedilir');
  perform tests.assert_raises($q$delete from public.admin_audit_logs$q$, '42501', 'admin audit DELETE reddedilir');
  perform tests.as_service();
  perform tests.assert_raises($q$update public.admin_audit_logs set reason = 'x'$q$, 'KPD_IMMUTABLE_RECORD', 'service_role audit UPDATE reddedilir (trigger)');
  perform tests.assert_raises($q$delete from public.admin_audit_logs$q$, 'KPD_IMMUTABLE_RECORD', 'service_role audit DELETE reddedilir (trigger)');
  perform tests.reset_role();
  perform tests.assert_raises($q$update public.admin_audit_logs set reason = 'x'$q$, 'KPD_IMMUTABLE_RECORD', 'veritabanı sahibi bile audit UPDATE yapamaz');
  perform tests.assert_raises($q$delete from public.admin_audit_logs$q$, 'KPD_IMMUTABLE_RECORD', 'veritabanı sahibi bile audit DELETE yapamaz');
  perform tests.assert_raises($q$truncate public.admin_audit_logs$q$, 'KPD_IMMUTABLE_RECORD', 'audit TRUNCATE reddedilir');
end $$;

-- Fiyat versiyonları, geçiş tablosu değiştirilemez
do $$
begin
  perform tests.assert_raises($q$update public.pricing_rule_versions set base_fee = 1$q$, 'KPD_IMMUTABLE_RECORD', 'fiyat versiyonu değiştirilemez');
  perform tests.assert_raises($q$insert into public.order_status_transitions values ('on_the_way','delivered','admin')$q$, '23514', 'admin → delivered geçişi tabloya eklenemez');
  perform tests.assert_raises($q$delete from public.order_status_transitions$q$, 'KPD_IMMUTABLE_RECORD', 'geçiş tablosu silinemez');
end $$;

-- Anonim kullanıcı: yalnız herkese açık veriler
do $$
begin
  perform tests.as_anon();
  perform tests.assert_true((select count(*) from public.categories) > 0, 'anon kategorileri görür');
  perform tests.assert_raises($q$select count(*) from public.profiles$q$, '42501', 'anon profil tablosuna erişemez');
  perform tests.assert_raises($q$select count(*) from public.orders$q$, '42501', 'anon siparişlere erişemez');
  perform tests.assert_raises($q$select count(*) from public.admin_audit_logs$q$, '42501', 'anon audit okuyamaz');
  perform tests.assert_raises($q$select count(*) from public.qr_tokens$q$, '42501', 'anon qr_tokens okuyamaz');
  perform tests.assert_raises($q$select public.create_order(gen_random_uuid(), '[]', 'cash')$q$, '42501', 'anon sipariş RPC çağıramaz');
  perform tests.assert_eq((select count(*)::int from public.settings where not is_public), 0, 'anon gizli ayarları göremez');
  perform tests.reset_role();
end $$;

-- Authenticated: qr_tokens, payment_events, rate_limit_buckets tamamen kapalı
do $$
declare
  v_customer uuid := (select id from public.profiles where email = 'cust@test.local');
begin
  perform tests.as_user(v_customer);
  perform tests.assert_raises($q$select count(*) from public.qr_tokens$q$, '42501', 'kullanıcı qr_tokens okuyamaz');
  perform tests.assert_raises($q$select count(*) from public.rate_limit_buckets$q$, '42501', 'kullanıcı rate limit tablosuna erişemez');
  perform tests.assert_raises($q$select provider_response from public.payments$q$, '42501', 'ham sağlayıcı yanıtı kolonları kapalı');
  perform tests.assert_raises($q$select public.consume_delivery_qr(gen_random_uuid(), gen_random_uuid(), repeat('a',64), gen_random_uuid(), 0, 0, '{}')$q$, '42501', 'QR tüketimi istemciden çağrılamaz');
  perform tests.assert_raises($q$select public.confirm_delivery_payment(gen_random_uuid(), 'x', 1, '{}')$q$, '42501', 'ödeme onayı istemciden çağrılamaz');
  perform tests.assert_raises($q$select public.create_delivery_fee_quote(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1, 'google_maps')$q$, '42501', 'teslimat ücreti teklifi istemciden oluşturulamaz');
  perform tests.reset_role();
end $$;
rollback;
