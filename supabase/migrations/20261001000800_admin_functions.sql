-- Yönetici RPC'leri. Her kritik işlem gerekçe ister ve değiştirilemez audit kaydı üretir.

create or replace function public._require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create or replace function public._require_reason(p_reason text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
begin
  if p_reason is null or char_length(btrim(p_reason)) < 10 then
    raise exception 'KPD_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  return left(btrim(p_reason), 1000);
end;
$$;

create or replace function public._slugify(p_text text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    translate(lower(p_text), 'çğıöşüâîû', 'cgiosuaiu'),
    '[^a-z0-9]+', '-', 'g'));
$$;

-- İlk yönetici: yalnız veritabanı sahibi/service_role çalıştırabilir ve sistemde hiç yönetici yokken çalışır.
create or replace function public.bootstrap_first_admin(p_email text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid;
begin
  if exists (select 1 from public.user_roles where role = 'admin') then
    raise exception 'KPD_ADMIN_ALREADY_EXISTS' using errcode = 'P0001';
  end if;
  select id into v_uid from auth.users where lower(email) = lower(btrim(p_email)) and email_confirmed_at is not null;
  if v_uid is null then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.user_roles (user_id, role) values (v_uid, 'admin');
  perform set_config('kapinda.actor_id', v_uid::text, true);
  perform public._audit('bootstrap_first_admin', 'user_roles', v_uid::text, null, jsonb_build_object('role', 'admin'),
    'İlk yönetici veritabanı sahibi tarafından atandı.');
  return v_uid;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rol yönetimi
-- ---------------------------------------------------------------------------
create or replace function public.admin_grant_role(p_user_id uuid, p_role public.app_role, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
begin
  if p_role in ('vendor', 'courier') then
    -- İşletme/kurye rolleri yalnız başvuru onayıyla verilir (ilgili kayıt da oluşur)
    raise exception 'KPD_ROLE_VIA_APPLICATION' using errcode = 'P0001';
  end if;
  insert into public.user_roles (user_id, role, granted_by) values (p_user_id, p_role, v_admin)
  on conflict (user_id, role) do nothing;
  perform public._audit('grant_role', 'user_roles', p_user_id::text, null, jsonb_build_object('role', p_role), v_reason);
end;
$$;

create or replace function public.admin_revoke_role(p_user_id uuid, p_role public.app_role, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
begin
  if p_role = 'admin' and p_user_id = v_admin then
    raise exception 'KPD_CANNOT_REVOKE_SELF' using errcode = 'P0001';
  end if;
  if p_role = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1 then
    raise exception 'KPD_LAST_ADMIN' using errcode = 'P0001';
  end if;
  if p_role = 'customer' then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  delete from public.user_roles where user_id = p_user_id and role = p_role;
  if p_role = 'courier' then
    update public.couriers set status = 'suspended', availability = 'offline' where user_id = p_user_id;
  end if;
  perform public._audit('revoke_role', 'user_roles', p_user_id::text, jsonb_build_object('role', p_role), null, v_reason);
end;
$$;

create or replace function public.admin_set_user_blocked(p_user_id uuid, p_blocked boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
begin
  if p_user_id = v_admin then
    raise exception 'KPD_CANNOT_REVOKE_SELF' using errcode = 'P0001';
  end if;
  update public.profiles set is_blocked = p_blocked where id = p_user_id;
  perform public._audit(case when p_blocked then 'block_user' else 'unblock_user' end, 'profiles', p_user_id::text,
    null, jsonb_build_object('is_blocked', p_blocked), v_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Başvurular
-- ---------------------------------------------------------------------------
create or replace function public.admin_approve_vendor_application(p_application_id uuid, p_coverage_area_id uuid,
  p_lat double precision, p_lng double precision, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  app public.vendor_applications;
  v_vendor uuid;
  v_slug text;
begin
  select * into app from public.vendor_applications where id = p_application_id for update;
  if not found or app.status <> 'pending' then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'KPD_VENDOR_LOCATION_MISSING' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.coverage_areas where id = p_coverage_area_id and district_id = app.district_id) then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  v_slug := public._slugify(app.business_name);
  if v_slug = '' then
    v_slug := 'isletme';
  end if;
  if exists (select 1 from public.vendors where slug = v_slug) then
    v_slug := v_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  end if;
  insert into public.vendors (slug, name, business_type, phone, email, tax_number, address_text, lat, lng,
    coverage_area_id, status, is_open, approved_by, approved_at)
  values (v_slug, app.business_name, app.business_type, app.phone, app.email, app.tax_number, app.address,
    p_lat, p_lng, p_coverage_area_id, 'active', false, v_admin, now())
  returning id into v_vendor;
  insert into public.vendor_members (vendor_id, user_id, member_role) values (v_vendor, app.applicant_user_id, 'owner');
  insert into public.user_roles (user_id, role, granted_by) values (app.applicant_user_id, 'vendor', v_admin)
  on conflict (user_id, role) do nothing;
  update public.vendor_applications set status = 'approved', reviewed_by = v_admin, reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''), vendor_id = v_vendor
  where id = app.id;
  insert into public.email_outbox (to_email, user_id, category, template, data)
  values (app.email, app.applicant_user_id, 'transactional', 'vendor_application_result',
    jsonb_build_object('approved', true, 'business_name', app.business_name));
  perform public._notify(app.applicant_user_id, 'vendor', 'application_approved', 'Esnaf başvurunuz onaylandı',
    'Kapında İşletme uygulamasına giriş yapabilirsiniz.', jsonb_build_object('vendor_id', v_vendor));
  perform public._audit('approve_vendor_application', 'vendor_applications', app.id::text, to_jsonb(app),
    jsonb_build_object('vendor_id', v_vendor), coalesce(nullif(btrim(p_note), ''), 'Başvuru onaylandı'));
  return v_vendor;
end;
$$;

create or replace function public.admin_reject_application(p_kind text, p_application_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
  v_email text;
  v_user uuid;
begin
  if p_kind = 'vendor' then
    update public.vendor_applications set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = v_reason
    where id = p_application_id and status = 'pending'
    returning email, applicant_user_id into v_email, v_user;
  elsif p_kind = 'courier' then
    update public.courier_applications set status = 'rejected', reviewed_by = v_admin, reviewed_at = now(), review_note = v_reason
    where id = p_application_id and status = 'pending'
    returning email, applicant_user_id into v_email, v_user;
  else
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  if v_user is null then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.email_outbox (to_email, user_id, category, template, data)
  values (v_email, v_user, 'transactional', (p_kind || '_application_result'), jsonb_build_object('approved', false, 'reason', v_reason));
  perform public._audit('reject_' || p_kind || '_application', p_kind || '_applications', p_application_id::text, null,
    jsonb_build_object('status', 'rejected'), v_reason);
end;
$$;

create or replace function public.admin_approve_courier_application(p_application_id uuid, p_coverage_area_id uuid,
  p_max_active_orders int, p_vehicle_plate text, p_note text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  app public.courier_applications;
  v_courier uuid;
begin
  select * into app from public.courier_applications where id = p_application_id for update;
  if not found or app.status <> 'pending' then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.coverage_areas where id = p_coverage_area_id and district_id = app.district_id) then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  insert into public.couriers (user_id, display_name, phone, vehicle_type, vehicle_plate, coverage_area_id, status,
    max_active_orders, approved_by, approved_at)
  values (app.applicant_user_id, app.full_name, app.phone, app.vehicle_type, nullif(upper(btrim(p_vehicle_plate)), ''),
    p_coverage_area_id, 'active',
    coalesce(p_max_active_orders, public.setting_numeric('kurye.default_max_active_orders', 1)::int), v_admin, now())
  on conflict (user_id) do update set status = 'active', coverage_area_id = excluded.coverage_area_id,
    approved_by = v_admin, approved_at = now()
  returning id into v_courier;
  insert into public.user_roles (user_id, role, granted_by) values (app.applicant_user_id, 'courier', v_admin)
  on conflict (user_id, role) do nothing;
  update public.courier_applications set status = 'approved', reviewed_by = v_admin, reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''), courier_id = v_courier
  where id = app.id;
  insert into public.email_outbox (to_email, user_id, category, template, data)
  values (app.email, app.applicant_user_id, 'transactional', 'courier_application_result',
    jsonb_build_object('approved', true, 'full_name', app.full_name));
  perform public._audit('approve_courier_application', 'courier_applications', app.id::text, to_jsonb(app),
    jsonb_build_object('courier_id', v_courier), coalesce(nullif(btrim(p_note), ''), 'Başvuru onaylandı'));
  return v_courier;
end;
$$;

create or replace function public.admin_set_vendor_status(p_vendor_id uuid, p_status public.approval_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  v public.vendors;
begin
  perform public._require_admin();
  select * into v from public.vendors where id = p_vendor_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.vendors set status = p_status, is_open = case when p_status = 'active' then is_open else false end
  where id = p_vendor_id;
  perform public._audit('set_vendor_status', 'vendors', p_vendor_id::text, jsonb_build_object('status', v.status),
    jsonb_build_object('status', p_status), v_reason);
end;
$$;

create or replace function public.admin_set_courier(p_courier_id uuid, p_status public.approval_status, p_max_active_orders int, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  c public.couriers;
begin
  perform public._require_admin();
  select * into c from public.couriers where id = p_courier_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.couriers set
    status = coalesce(p_status, status),
    availability = case when coalesce(p_status, status) <> 'active' then 'offline'::public.courier_availability else availability end,
    max_active_orders = coalesce(p_max_active_orders, max_active_orders)
  where id = p_courier_id;
  perform public._refresh_courier_load(p_courier_id);
  perform public._audit('update_courier', 'couriers', p_courier_id::text,
    jsonb_build_object('status', c.status, 'max_active_orders', c.max_active_orders),
    jsonb_build_object('status', coalesce(p_status, c.status), 'max_active_orders', coalesce(p_max_active_orders, c.max_active_orders)),
    v_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Manuel müdahale: devret, havuza döndür, sınırlı durum düzeltme (delivered ASLA)
-- ---------------------------------------------------------------------------
create or replace function public.admin_assign_courier(p_order_id uuid, p_courier_id uuid, p_reason text, p_confirm_capacity_override boolean default false)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  o public.orders;
  c public.couriers;
  v_prev uuid;
  v_override boolean := false;
begin
  perform public._require_admin();
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status not in ('vendor_accepted', 'preparing', 'ready_for_pickup', 'courier_assigned', 'picked_up', 'on_the_way') then
    raise exception 'KPD_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  if o.courier_id = p_courier_id then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  select * into c from public.couriers where id = p_courier_id;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if c.active_order_count >= c.max_active_orders then
    if not coalesce(p_confirm_capacity_override, false) then
      raise exception 'KPD_COURIER_CAPACITY' using errcode = 'P0001', hint = c.max_active_orders::text;
    end if;
    v_override := true;
  end if;

  if o.courier_id is not null then
    v_prev := public._unassign_courier(o.id, 'transferred', v_reason);
  end if;
  insert into public.order_transfers (order_id, from_courier_id, to_courier_id, transfer_type, transferred_by, reason, capacity_override)
  values (o.id, v_prev, c.id, 'reassign', auth.uid(), v_reason, v_override);

  -- Durum korunur (yolda olan sipariş yeni kuryeyle yolda kalır); yalnız hazır siparişte "kurye atandı"ya geçilir
  o := public._assign_courier(o.id, c.id, case when v_prev is null then 'admin_assign' else 'transfer' end, v_override, 'admin');

  perform public._audit(case when v_prev is null then 'assign_courier' else 'transfer_order' end, 'orders', o.id::text,
    jsonb_build_object('courier_id', v_prev), jsonb_build_object('courier_id', c.id, 'capacity_override', v_override), v_reason);
  if v_override then
    perform public._audit('courier_capacity_override', 'couriers', c.id::text,
      jsonb_build_object('active_order_count', c.active_order_count, 'max_active_orders', c.max_active_orders),
      jsonb_build_object('order_id', o.id), v_reason);
  end if;
  if v_prev is not null then
    perform public._notify((select user_id from public.couriers where id = v_prev), 'courier', 'order_transferred',
      'Görev devredildi', format('%s siparişi başka kuryeye devredildi.', o.order_number), jsonb_build_object('order_id', o.id));
    perform public._notify(o.customer_id, 'customer', 'courier_changed', 'Kuryeniz değişti',
      format('%s siparişiniz yeni kuryeye devredildi. Teslimat QR kodunuz yenilenecek.', o.order_number), jsonb_build_object('order_id', o.id));
  end if;
  return o.status;
end;
$$;

create or replace function public.admin_return_to_pool(p_order_id uuid, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  o public.orders;
  v_prev uuid;
begin
  perform public._require_admin();
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.courier_id is null then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status in ('picked_up', 'on_the_way') then
    -- Ürünler kuryedeyken havuza döndürülemez; başka kuryeye devredilmelidir.
    raise exception 'KPD_RELEASE_AFTER_PICKUP' using errcode = 'P0001';
  end if;
  if o.status = 'courier_assigned' then
    perform public._order_transition(o.id, 'ready_for_pickup', 'admin', v_reason);
  end if;
  v_prev := public._unassign_courier(o.id, 'released', v_reason);
  insert into public.order_transfers (order_id, from_courier_id, to_courier_id, transfer_type, transferred_by, reason)
  values (o.id, v_prev, null, 'return_to_pool', auth.uid(), v_reason);
  perform public._audit('return_to_pool', 'orders', o.id::text, jsonb_build_object('courier_id', v_prev),
    jsonb_build_object('courier_id', null), v_reason);
  perform public._notify((select user_id from public.couriers where id = v_prev), 'courier', 'order_unassigned',
    'Görev geri alındı', format('%s siparişi havuza döndürüldü.', o.order_number), jsonb_build_object('order_id', o.id));
  perform public._notify_couriers_of_pool(o.id);
  select * into o from public.orders where id = o.id;
  return o.status;
end;
$$;

create or replace function public.admin_override_status(p_order_id uuid, p_to public.order_status, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  o public.orders;
  v_from public.order_status;
begin
  perform public._require_admin();
  if p_to = 'delivered' then
    -- Teslimat güven zinciri: delivered yalnız atanmış kuryenin QR doğrulamasıyla oluşur.
    raise exception 'KPD_DELIVERY_REQUIRES_QR' using errcode = '42501';
  end if;
  select status into v_from from public.orders where id = p_order_id;
  o := public._order_transition(p_order_id, p_to, 'admin', v_reason);
  perform public._audit('override_order_status', 'orders', p_order_id::text, jsonb_build_object('status', v_from),
    jsonb_build_object('status', p_to), v_reason);
  return o.status;
end;
$$;

create or replace function public.admin_update_incident(p_incident_id uuid, p_status text, p_note text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  i public.courier_incidents;
begin
  select * into i from public.courier_incidents where id = p_incident_id for update;
  if not found or p_status not in ('acknowledged', 'resolved') then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.courier_incidents set
    status = p_status,
    acknowledged_by = coalesce(acknowledged_by, v_admin),
    acknowledged_at = coalesce(acknowledged_at, now()),
    resolved_by = case when p_status = 'resolved' then v_admin else resolved_by end,
    resolved_at = case when p_status = 'resolved' then now() else resolved_at end,
    resolution_note = coalesce(nullif(btrim(p_note), ''), resolution_note)
  where id = i.id;
  -- Çözülen ciddi olay sonrası kurye yeniden çevrimiçi olabilir (otomatik çevrimiçi yapılmaz)
  if p_status = 'resolved' and i.made_unavailable then
    update public.couriers set availability = 'offline' where id = i.courier_id and availability = 'unavailable';
  end if;
  perform public._audit('update_incident', 'courier_incidents', i.id::text, jsonb_build_object('status', i.status),
    jsonb_build_object('status', p_status), nullif(btrim(p_note), ''));
end;
$$;

-- ---------------------------------------------------------------------------
-- Ayarlar ve fiyatlandırma
-- ---------------------------------------------------------------------------
create or replace function public.admin_update_setting(p_key text, p_value jsonb, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
  s public.settings;
begin
  select * into s from public.settings where key = p_key for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if (s.value_type = 'boolean' and jsonb_typeof(p_value) <> 'boolean')
     or (s.value_type = 'number' and jsonb_typeof(p_value) <> 'number')
     or (s.value_type = 'string' and jsonb_typeof(p_value) <> 'string')
     or (s.value_type = 'object' and jsonb_typeof(p_value) <> 'object') then
    raise exception 'KPD_INVALID_SETTING' using errcode = '22023';
  end if;
  if s.value_type = 'number' and ((s.min_value is not null and (p_value #>> '{}')::numeric < s.min_value)
     or (s.max_value is not null and (p_value #>> '{}')::numeric > s.max_value)) then
    raise exception 'KPD_INVALID_SETTING' using errcode = '22023', hint = format('%s-%s', s.min_value, s.max_value);
  end if;
  update public.settings set value = p_value, updated_by = v_admin, updated_at = now() where key = p_key;
  perform public._audit('update_setting', 'settings', p_key, s.value, p_value, v_reason);
end;
$$;

create or replace function public.admin_create_pricing_version(p_pricing_rule_id uuid, p_base_fee numeric, p_base_distance_km numeric,
  p_per_km_fee numeric, p_max_distance_km numeric, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
  pr public.pricing_rules;
  v_next int;
  v_id uuid;
begin
  select * into pr from public.pricing_rules where id = p_pricing_rule_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  select coalesce(max(version), 0) + 1 into v_next from public.pricing_rule_versions where pricing_rule_id = pr.id;
  insert into public.pricing_rule_versions (pricing_rule_id, version, base_fee, base_distance_km, per_km_fee, max_distance_km,
    created_by, change_reason)
  values (pr.id, v_next, p_base_fee, p_base_distance_km, p_per_km_fee, p_max_distance_km, v_admin, v_reason)
  returning id into v_id;
  update public.pricing_rules set current_version_id = v_id where id = pr.id;
  perform public._audit('create_pricing_version', 'pricing_rules', pr.id::text,
    jsonb_build_object('current_version_id', pr.current_version_id),
    jsonb_build_object('version_id', v_id, 'version', v_next, 'base_fee', p_base_fee, 'base_distance_km', p_base_distance_km,
      'per_km_fee', p_per_km_fee, 'max_distance_km', p_max_distance_km), v_reason);
  return v_id;
end;
$$;

create or replace function public.admin_upsert_coverage_area(p_id uuid, p_district_id uuid, p_name text, p_slug text,
  p_center_lat double precision, p_center_lng double precision, p_max_radius_km numeric, p_min_basket numeric,
  p_pricing_rule_id uuid, p_opens_at time, p_closes_at time, p_is_active boolean, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  v_old jsonb;
  v_id uuid;
begin
  perform public._require_admin();
  if p_id is null then
    insert into public.coverage_areas (district_id, name, slug, center_lat, center_lng, max_radius_km, min_basket_amount,
      pricing_rule_id, opens_at, closes_at, is_active)
    values (p_district_id, btrim(p_name), p_slug, p_center_lat, p_center_lng, p_max_radius_km, p_min_basket,
      p_pricing_rule_id, p_opens_at, p_closes_at, p_is_active)
    returning id into v_id;
  else
    select to_jsonb(ca) into v_old from public.coverage_areas ca where id = p_id for update;
    if v_old is null then
      raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
    end if;
    update public.coverage_areas set district_id = p_district_id, name = btrim(p_name), slug = p_slug,
      center_lat = p_center_lat, center_lng = p_center_lng, max_radius_km = p_max_radius_km, min_basket_amount = p_min_basket,
      pricing_rule_id = p_pricing_rule_id, opens_at = p_opens_at, closes_at = p_closes_at, is_active = p_is_active
    where id = p_id
    returning id into v_id;
  end if;
  if p_is_active then
    update public.districts set is_active = true where id = p_district_id;
    update public.provinces set is_active = true where id = (select province_id from public.districts where id = p_district_id);
  end if;
  perform public._audit(case when p_id is null then 'create_coverage_area' else 'update_coverage_area' end, 'coverage_areas',
    v_id::text, v_old, (select to_jsonb(ca) from public.coverage_areas ca where id = v_id), v_reason);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Mutabakat
-- ---------------------------------------------------------------------------
create or replace function public.admin_generate_settlement(p_vendor_id uuid, p_period_start date, p_period_end date)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_id uuid;
  v_tz text := 'Europe/Istanbul';
  v_from timestamptz := (p_period_start::timestamp at time zone v_tz);
  v_to timestamptz := ((p_period_end + 1)::timestamp at time zone v_tz);
  v_count int;
  v_gmv numeric;
  v_comm numeric;
begin
  if p_period_end < p_period_start then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  select count(*), coalesce(sum(product_gmv), 0), coalesce(sum(total_amount), 0)
  into v_count, v_gmv, v_comm
  from public.platform_commissions
  where vendor_id = p_vendor_id and settlement_id is null and delivered_at >= v_from and delivered_at < v_to;

  insert into public.vendor_settlements (vendor_id, period_start, period_end, order_count, product_gmv, commission_total,
    adjustment_total, payable_amount, status, snapshot, generated_by)
  values (p_vendor_id, p_period_start, p_period_end, v_count, v_gmv, v_comm, 0, v_comm, 'draft',
    jsonb_build_object('generated_at', now(), 'timezone', v_tz,
      'commissions', (select coalesce(jsonb_agg(jsonb_build_object('order_id', order_id, 'product_gmv', product_gmv,
        'eligible_item_count', eligible_item_count, 'unit_amount', unit_amount, 'total_amount', total_amount,
        'delivered_at', delivered_at) order by delivered_at), '[]'::jsonb)
        from public.platform_commissions
        where vendor_id = p_vendor_id and settlement_id is null and delivered_at >= v_from and delivered_at < v_to)),
    v_admin)
  returning id into v_id;

  update public.platform_commissions set settlement_id = v_id
  where vendor_id = p_vendor_id and settlement_id is null and delivered_at >= v_from and delivered_at < v_to;

  perform public._audit('generate_settlement', 'vendor_settlements', v_id::text, null,
    jsonb_build_object('vendor_id', p_vendor_id, 'period_start', p_period_start, 'period_end', p_period_end,
      'order_count', v_count, 'product_gmv', v_gmv, 'commission_total', v_comm), 'Mutabakat oluşturuldu');
  return v_id;
exception when unique_violation then
  raise exception 'KPD_SETTLEMENT_EXISTS' using errcode = '23505';
end;
$$;

create or replace function public.admin_add_settlement_adjustment(p_settlement_id uuid, p_amount numeric, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
  s public.vendor_settlements;
begin
  select * into s from public.vendor_settlements where id = p_settlement_id for update;
  if not found or s.status <> 'draft' then
    raise exception 'KPD_SETTLEMENT_LOCKED' using errcode = 'P0001';
  end if;
  insert into public.settlement_adjustments (settlement_id, amount, reason, created_by) values (s.id, p_amount, v_reason, v_admin);
  update public.vendor_settlements set adjustment_total = adjustment_total + p_amount,
    payable_amount = commission_total + adjustment_total + p_amount
  where id = s.id;
  perform public._audit('settlement_adjustment', 'vendor_settlements', s.id::text,
    jsonb_build_object('adjustment_total', s.adjustment_total), jsonb_build_object('added', p_amount), v_reason);
end;
$$;

create or replace function public.admin_set_settlement_status(p_settlement_id uuid, p_status public.settlement_status, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin uuid := public._require_admin();
  v_reason text := public._require_reason(p_reason);
  s public.vendor_settlements;
begin
  select * into s from public.vendor_settlements where id = p_settlement_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not ((s.status = 'draft' and p_status in ('approved', 'cancelled')) or (s.status = 'approved' and p_status = 'paid')) then
    raise exception 'KPD_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  update public.vendor_settlements set status = p_status,
    approved_by = case when p_status = 'approved' then v_admin else approved_by end,
    approved_at = case when p_status = 'approved' then now() else approved_at end,
    paid_at = case when p_status = 'paid' then now() else paid_at end
  where id = s.id;
  if p_status = 'cancelled' then
    update public.platform_commissions set settlement_id = null where settlement_id = s.id;
  end if;
  perform public._audit('set_settlement_status', 'vendor_settlements', s.id::text, jsonb_build_object('status', s.status),
    jsonb_build_object('status', p_status), v_reason);
end;
$$;

-- ---------------------------------------------------------------------------
-- Gösterge paneli ve finans raporları — yalnız gerçek veriler
-- ---------------------------------------------------------------------------
create or replace function public.admin_dashboard_stats(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'orders_in_range', (select count(*) from public.orders where created_at >= p_from and created_at < p_to and status <> 'pending_payment'),
    'active_orders', (select count(*) from public.orders where status in ('payment_confirmed', 'vendor_pending', 'vendor_accepted',
        'preparing', 'ready_for_pickup', 'courier_assigned', 'picked_up', 'on_the_way')),
    'delivered', (select count(*) from public.orders where delivered_at >= p_from and delivered_at < p_to and status = 'delivered'),
    'cancelled', (select count(*) from public.orders where cancelled_at >= p_from and cancelled_at < p_to and status in ('cancelled', 'rejected', 'failed')),
    'active_vendors', (select count(*) from public.vendors where status = 'active' and deleted_at is null),
    'open_vendors', (select count(*) from public.vendors where status = 'active' and is_open and deleted_at is null),
    'active_couriers', (select count(*) from public.couriers where status = 'active' and availability in ('available', 'busy')),
    'product_gmv', (select coalesce(sum(product_gmv), 0) from public.platform_commissions where delivered_at >= p_from and delivered_at < p_to),
    'delivery_revenue', (select coalesce(sum(amount), 0) from public.payments where status = 'succeeded' and paid_at >= p_from and paid_at < p_to),
    'delivery_refunds', (select coalesce(sum(amount), 0) from public.payments where status in ('refund_pending', 'refunded') and paid_at >= p_from and paid_at < p_to),
    'platform_commission', (select coalesce(sum(total_amount), 0) from public.platform_commissions where delivered_at >= p_from and delivered_at < p_to),
    'open_incidents', (select count(*) from public.courier_incidents where status <> 'resolved'),
    'open_support', (select count(*) from public.support_conversations where status = 'open')
  );
end;
$$;

create or replace function public.admin_finance_report(p_from timestamptz, p_to timestamptz, p_vendor_id uuid default null, p_coverage_area_id uuid default null)
returns table (
  day date, vendor_id uuid, vendor_name text, coverage_area_id uuid, delivered_orders bigint,
  product_gmv numeric, delivery_revenue numeric, platform_commission numeric
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select (o.delivered_at at time zone 'Europe/Istanbul')::date, o.vendor_id, v.name, o.coverage_area_id,
      count(*), coalesce(sum(pc.product_gmv), 0),
      coalesce(sum(case when o.payment_state = 'paid' then o.delivery_fee_payable else 0 end), 0),
      coalesce(sum(pc.total_amount), 0)
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    left join public.platform_commissions pc on pc.order_id = o.id
    where o.status = 'delivered' and o.delivered_at >= p_from and o.delivered_at < p_to
      and (p_vendor_id is null or o.vendor_id = p_vendor_id)
      and (p_coverage_area_id is null or o.coverage_area_id = p_coverage_area_id)
    group by 1, 2, 3, 4
    order by 1 desc, 3;
end;
$$;

-- Canlı operasyon: aktif siparişler + gecikme bayrağı
create or replace function public.admin_live_operations()
returns table (
  order_id uuid, order_number text, status public.order_status, vendor_name text, courier_name text, courier_id uuid,
  created_at timestamptz, minutes_in_status int, is_delayed boolean, delivery_lat double precision, delivery_lng double precision,
  courier_lat double precision, courier_lng double precision, vendor_lat double precision, vendor_lng double precision
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_delay int := public.setting_numeric('operasyon.delay_threshold_minutes', 20)::int;
begin
  perform public._require_admin();
  return query
    select o.id, o.order_number, o.status, v.name, c.display_name, c.id, o.created_at,
      (extract(epoch from (now() - coalesce(h.last_change, o.created_at))) / 60)::int,
      (now() - coalesce(h.last_change, o.created_at)) > make_interval(mins => v_delay),
      o.delivery_lat, o.delivery_lng, l.lat, l.lng, v.lat, v.lng
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    left join public.couriers c on c.id = o.courier_id
    left join public.order_live_locations l on l.order_id = o.id
    left join lateral (select max(created_at) as last_change from public.order_status_history where order_id = o.id) h on true
    where o.status not in ('delivered', 'cancelled', 'rejected', 'failed')
       or (o.status = 'delivered' and o.delivered_at > now() - interval '3 hours')
    order by o.created_at;
end;
$$;

create or replace function public.admin_list_users(p_search text default null, p_limit int default 50, p_offset int default 0)
returns table (id uuid, full_name text, email text, phone text, roles text[], is_blocked boolean, created_at timestamptz,
  delivered_orders bigint)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return query
    select p.id, p.full_name, p.email, p.phone,
      array(select ur.role::text from public.user_roles ur where ur.user_id = p.id order by ur.role),
      p.is_blocked, p.created_at,
      (select count(*) from public.orders o where o.customer_id = p.id and o.status = 'delivered')
    from public.profiles p
    where p.deleted_at is null and (p_search is null or p_search = ''
      or p.full_name ilike '%' || p_search || '%' or p.email ilike '%' || p_search || '%'
      or p.phone = public.normalize_tr_phone(p_search))
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0);
end;
$$;

-- Bildirim/duyuru: kullanıcılara uygulama içi + push
create or replace function public.admin_broadcast_notification(p_app public.device_app, p_title text, p_body text, p_reason text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  v_count int := 0;
  r record;
begin
  perform public._require_admin();
  if char_length(coalesce(p_title, '')) < 3 or char_length(coalesce(p_body, '')) < 3 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  for r in
    select distinct ur.user_id from public.user_roles ur
    left join public.notification_preferences np on np.user_id = ur.user_id
    where ur.role::text = case p_app when 'customer' then 'customer' when 'courier' then 'courier' when 'vendor' then 'vendor' else 'admin' end
      and (p_app <> 'customer' or coalesce(np.marketing_push, false))
  loop
    perform public._notify(r.user_id, p_app, 'announcement', p_title, p_body, '{}'::jsonb);
    v_count := v_count + 1;
  end loop;
  perform public._audit('broadcast_notification', 'notifications', null, null,
    jsonb_build_object('app', p_app, 'title', p_title, 'recipients', v_count), v_reason);
  return v_count;
end;
$$;
