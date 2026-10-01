-- Sipariş motoru: durum makinesi, sipariş oluşturma, ödeme onayı, sadakat, komisyon, bildirim üretimi

-- ---------------------------------------------------------------------------
-- Koruma: sipariş satırında durum ve finansal alanlar yalnız sunucu fonksiyonlarıyla değişir
-- ---------------------------------------------------------------------------
create or replace function public.orders_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    if coalesce(current_setting('kapinda.status_change', true), '') <> new.id::text then
      raise exception 'KPD_FORBIDDEN' using errcode = '42501', hint = 'status';
    end if;
    if new.status = 'delivered' and coalesce(current_setting('kapinda.qr_verified_order', true), '') <> new.id::text then
      raise exception 'KPD_DELIVERY_REQUIRES_QR' using errcode = '42501';
    end if;
  end if;
  if (new.product_subtotal, new.delivery_fee, new.delivery_fee_payable, new.delivery_fee_waived, new.commission_estimate,
      new.item_count, new.customer_id, new.vendor_id, new.delivery_fee_id, new.pricing_snapshot, new.distance_km)
     is distinct from
     (old.product_subtotal, old.delivery_fee, old.delivery_fee_payable, old.delivery_fee_waived, old.commission_estimate,
      old.item_count, old.customer_id, old.vendor_id, old.delivery_fee_id, old.pricing_snapshot, old.distance_km)
     and coalesce(current_setting('kapinda.financial_change', true), '') <> new.id::text then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501', hint = 'financial';
  end if;
  if new.courier_id is distinct from old.courier_id
     and coalesce(current_setting('kapinda.assignment_change', true), '') <> new.id::text then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501', hint = 'courier';
  end if;
  return new;
end;
$$;
create trigger orders_guard before update on public.orders for each row execute function public.orders_guard();
create trigger orders_no_delete before delete on public.orders for each row execute function public.prevent_mutation();

create or replace function public.order_items_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('kapinda.financial_change', true), '') <> new.order_id::text then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger order_items_guard before update on public.order_items for each row execute function public.order_items_guard();

-- ---------------------------------------------------------------------------
-- Bildirim yardımcıları
-- ---------------------------------------------------------------------------
create or replace function public._notify(p_user_id uuid, p_app public.device_app, p_type text, p_title text, p_body text, p_data jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_user_id is null then
    return;
  end if;
  insert into public.notifications (user_id, app, type, title, body, data)
  values (p_user_id, p_app, p_type, left(p_title, 120), left(p_body, 500), coalesce(p_data, '{}'::jsonb));
end;
$$;

create or replace function public._notify_vendor(p_vendor_id uuid, p_type text, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select user_id from public.vendor_members where vendor_id = p_vendor_id loop
    perform public._notify(r.user_id, 'vendor', p_type, p_title, p_body, p_data);
  end loop;
end;
$$;

create or replace function public._notify_admins(p_type text, p_title text, p_body text, p_data jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
begin
  for r in select user_id from public.user_roles where role = 'admin' loop
    perform public._notify(r.user_id, 'admin', p_type, p_title, p_body, p_data);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Stok ve ödül geri alma
-- ---------------------------------------------------------------------------
create or replace function public._restore_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.products p
  set stock_quantity = p.stock_quantity + x.qty
  from (
    select product_id, sum(quantity) as qty
    from public.order_items
    where order_id = p_order_id and fulfillment <> 'removed'
    group by product_id
  ) x
  where p.id = x.product_id and p.track_stock;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durum geçişi — TEK yol. İzinli geçiş tablosunu kontrol eder, geçmişe yazar.
-- ---------------------------------------------------------------------------
create or replace function public._order_transition(
  p_order_id uuid,
  p_to public.order_status,
  p_actor public.transition_actor,
  p_reason text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_from public.order_status;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  v_from := o.status;
  if not exists (
    select 1 from public.order_status_transitions
    where from_status = v_from and to_status = p_to and actor = p_actor
  ) then
    raise exception 'KPD_INVALID_TRANSITION' using errcode = 'P0001', hint = format('%s->%s', v_from, p_to);
  end if;

  perform set_config('kapinda.status_change', p_order_id::text, true);
  update public.orders set
    status = p_to,
    payment_confirmed_at = case when p_to = 'payment_confirmed' then now() else payment_confirmed_at end,
    vendor_visible_at = case when p_to = 'vendor_pending' then now() else vendor_visible_at end,
    accepted_at = case when p_to = 'vendor_accepted' then now() else accepted_at end,
    preparing_at = case when p_to = 'preparing' then now() else preparing_at end,
    ready_at = case when p_to = 'ready_for_pickup' and ready_at is null then now() else ready_at end,
    courier_assigned_at = case when p_to = 'courier_assigned' then now() else courier_assigned_at end,
    picked_up_at = case when p_to = 'picked_up' then now() else picked_up_at end,
    on_the_way_at = case when p_to = 'on_the_way' then now() else on_the_way_at end,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
    cancelled_at = case when p_to in ('cancelled', 'rejected', 'failed') then now() else cancelled_at end,
    cancel_reason = case when p_to in ('cancelled', 'rejected', 'failed') then coalesce(p_reason, cancel_reason) else cancel_reason end
  where id = p_order_id
  returning * into o;
  perform set_config('kapinda.status_change', '', true);

  insert into public.order_status_history (order_id, previous_status, new_status, actor_id, actor_role, reason, metadata)
  values (p_order_id, v_from, p_to, coalesce(auth.uid(), nullif(current_setting('kapinda.actor_id', true), '')::uuid),
    p_actor, p_reason, coalesce(p_metadata, '{}'::jsonb));

  if p_to in ('cancelled', 'rejected', 'failed') then
    perform public._finalize_unsuccessful_order(p_order_id, v_from);
  elsif p_to = 'delivered' then
    perform public._finalize_delivered_order(p_order_id);
  end if;

  perform public._emit_order_notifications(p_order_id, v_from, p_to);
  select * into o from public.orders where id = p_order_id;
  return o;
end;
$$;

-- İptal/red/başarısız: stok iadesi, ödül iadesi, kurye kapasitesi, ödeme iadesi işareti, QR iptali
create or replace function public._finalize_unsuccessful_order(p_order_id uuid, p_from public.order_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id;

  -- Kurye teslim almadıysa stok işletmeye geri döner
  if p_from not in ('picked_up', 'on_the_way') then
    perform public._restore_stock(p_order_id);
  end if;

  if o.loyalty_reward_id is not null then
    update public.loyalty_rewards set status = 'available', order_id = null
    where id = o.loyalty_reward_id and status = 'reserved';
  end if;

  if o.courier_id is not null then
    update public.order_assignments set status = 'cancelled', ended_at = now(), end_reason = 'order_' || o.status::text
    where order_id = p_order_id and status = 'active';
    perform public._refresh_courier_load(o.courier_id);
  end if;

  update public.qr_tokens set revoked_at = now(), revoke_reason = 'order_closed'
  where order_id = p_order_id and consumed_at is null and revoked_at is null;

  delete from public.order_live_locations where order_id = p_order_id;

  -- Teslimat gerçekleşmediyse tahsil edilmiş teslimat ücreti iade kuyruğuna alınır
  if o.payment_state = 'paid' then
    update public.payments set status = 'refund_pending', refund_requested_at = now()
    where order_id = p_order_id and status = 'succeeded';
    update public.orders set payment_state = 'refund_pending' where id = p_order_id;
  elsif o.payment_state = 'pending' then
    update public.payments set status = 'failed', failure_reason = coalesce(failure_reason, 'order_closed')
    where order_id = p_order_id and status in ('initiated', 'pending');
    if o.status = 'failed' then
      update public.orders set payment_state = 'failed' where id = p_order_id;
    end if;
  end if;
end;
$$;

-- Kurye aktif sipariş sayısı ve müsaitlik
create or replace function public._refresh_courier_load(p_courier_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  select count(*) into v_count from public.orders
  where courier_id = p_courier_id and status not in ('delivered', 'cancelled', 'rejected', 'failed');
  update public.couriers set
    active_order_count = v_count,
    availability = case
      when availability in ('offline', 'unavailable') then availability
      when v_count >= max_active_orders then 'busy'::public.courier_availability
      else 'available'::public.courier_availability
    end
  where id = p_courier_id;
end;
$$;

-- Teslim edildi: komisyon snapshot'ı, sadakat, referans, ödül kullanımı, kurye yükü
create or replace function public._finalize_delivered_order(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_unit numeric := public.setting_numeric('komisyon.per_item_amount', 20);
  v_basis text := coalesce(public.setting('komisyon.basis') #>> '{}', 'per_line');
  v_eligible int;
  v_gmv numeric;
  v_delivered_count int;
  v_milestone int := public.setting_numeric('sadakat.order_milestone', 5)::int;
  v_ref_milestone int := public.setting_numeric('sadakat.referral_milestone', 5)::int;
  v_ref public.referrals;
  v_qualified int;
begin
  select * into o from public.orders where id = p_order_id;

  select
    case when v_basis = 'per_unit' then coalesce(sum(quantity), 0) else count(*) end,
    coalesce(sum(line_total), 0)
  into v_eligible, v_gmv
  from public.order_items
  where order_id = p_order_id and fulfillment <> 'removed';

  perform set_config('kapinda.financial_change', p_order_id::text, true);
  update public.order_items set fulfillment = 'fulfilled'
  where order_id = p_order_id and fulfillment = 'pending';
  perform set_config('kapinda.financial_change', '', true);

  insert into public.platform_commissions (order_id, vendor_id, coverage_area_id, eligible_item_count, unit_amount, basis,
    total_amount, product_gmv, snapshot, delivered_at)
  values (p_order_id, o.vendor_id, o.coverage_area_id, v_eligible, v_unit, v_basis, v_eligible * v_unit, v_gmv,
    jsonb_build_object(
      'items', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'product_id', product_id, 'name', product_name,
                 'quantity', quantity, 'line_total', line_total, 'fulfillment', fulfillment)), '[]'::jsonb)
                from public.order_items where order_id = p_order_id),
      'unit_amount', v_unit, 'basis', v_basis, 'computed_at', now()),
    coalesce(o.delivered_at, now()))
  on conflict (order_id) do nothing;

  if o.loyalty_reward_id is not null then
    update public.loyalty_rewards set status = 'used', used_at = now() where id = o.loyalty_reward_id;
  end if;

  if o.courier_id is not null then
    update public.order_assignments set status = 'completed', ended_at = now(), end_reason = 'delivered'
    where order_id = p_order_id and status = 'active';
    perform public._refresh_courier_load(o.courier_id);
  end if;

  delete from public.order_live_locations where order_id = p_order_id;
  update public.orders set tracking_token_expires_at = now() + interval '24 hours'
  where id = p_order_id and tracking_token_hash is not null;

  if public.setting_bool('sadakat.enabled', true) then
    -- Bir sonraki sipariş kullanıcının N. siparişi olacaksa ücretsiz teslimat hakkı tanımlanır.
    select count(*) into v_delivered_count from public.orders where customer_id = o.customer_id and status = 'delivered';
    if v_milestone > 0 and (v_delivered_count + 1) % v_milestone = 0 then
      insert into public.loyalty_rewards (user_id, source, source_ref)
      values (o.customer_id, 'order_milestone', format('order_milestone:%s:%s', o.customer_id, v_delivered_count + 1))
      on conflict (source_ref) do nothing;
    end if;

    -- Referans: davet edilen kullanıcının ilk teslim edilen siparişi
    select * into v_ref from public.referrals where referred_id = o.customer_id and not has_ordered for update;
    if found then
      perform set_config('kapinda.referral_update', 'on', true);
      update public.referrals set has_ordered = true, qualified_order_id = p_order_id, qualified_at = now() where id = v_ref.id;
      perform set_config('kapinda.referral_update', '', true);
      select count(*) into v_qualified from public.referrals where referrer_id = v_ref.referrer_id and has_ordered;
      if v_ref_milestone > 0 and v_qualified % v_ref_milestone = 0 then
        insert into public.loyalty_rewards (user_id, source, source_ref)
        values (v_ref.referrer_id, 'referral_milestone', format('referral_milestone:%s:%s', v_ref.referrer_id, v_qualified / v_ref_milestone))
        on conflict (source_ref) do nothing;
        perform public._notify(v_ref.referrer_id, 'customer', 'loyalty_reward', 'Ücretsiz teslimat kazandınız',
          'Davet ettiğiniz arkadaşlarınız sayesinde bir sonraki siparişinizde teslimat ücretsiz.', '{}'::jsonb);
      end if;
    end if;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Durum değişimine göre bildirim/e-posta üretimi (FCM gönderimi Edge Function'dadır)
-- ---------------------------------------------------------------------------
create or replace function public._emit_order_notifications(p_order_id uuid, p_from public.order_status, p_to public.order_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_vendor_name text;
  v_courier_user uuid;
  v_data jsonb;
  v_email text;
begin
  select * into o from public.orders where id = p_order_id;
  select name into v_vendor_name from public.vendors where id = o.vendor_id;
  select user_id into v_courier_user from public.couriers where id = o.courier_id;
  v_data := jsonb_build_object('order_id', o.id, 'order_number', o.order_number, 'status', p_to);

  case p_to
    when 'vendor_pending' then
      perform public._notify(o.customer_id, 'customer', 'order_received', 'Siparişiniz alındı',
        format('%s siparişiniz %s işletmesine iletildi.', o.order_number, v_vendor_name), v_data);
      perform public._notify_vendor(o.vendor_id, 'new_order', 'Yeni sipariş',
        format('%s numaralı yeni sipariş (%s TL ürün).', o.order_number, o.product_subtotal), v_data);
      select email into v_email from public.profiles where id = o.customer_id;
      if v_email is not null and coalesce((select order_updates_email from public.notification_preferences where user_id = o.customer_id), true) then
        insert into public.email_outbox (to_email, user_id, category, template, data)
        values (v_email, o.customer_id, 'transactional', 'order_received', v_data || jsonb_build_object(
          'vendor_name', v_vendor_name, 'product_subtotal', o.product_subtotal, 'delivery_fee_payable', o.delivery_fee_payable));
      end if;
    when 'vendor_accepted' then
      perform public._notify(o.customer_id, 'customer', 'order_accepted', 'İşletme siparişinizi kabul etti',
        format('%s siparişiniz kabul edildi.', o.order_number), v_data);
    when 'preparing' then
      perform public._notify(o.customer_id, 'customer', 'order_preparing', 'Siparişiniz hazırlanıyor',
        format('%s siparişiniz hazırlanıyor.', o.order_number), v_data);
    when 'ready_for_pickup' then
      if v_courier_user is null then
        perform public._notify_couriers_of_pool(o.id);
      else
        perform public._notify(v_courier_user, 'courier', 'pickup_ready', 'Sipariş teslim almaya hazır',
          format('%s siparişi %s işletmesinde hazır.', o.order_number, v_vendor_name), v_data);
      end if;
    when 'courier_assigned' then
      perform public._notify(o.customer_id, 'customer', 'courier_assigned', 'Kurye atandı',
        format('%s siparişiniz için kurye atandı.', o.order_number), v_data);
      perform public._notify_vendor(o.vendor_id, 'courier_coming', 'Kurye geliyor',
        format('%s siparişi için kurye yola çıkıyor.', o.order_number), v_data);
    when 'picked_up' then
      perform public._notify(o.customer_id, 'customer', 'order_picked_up', 'Kurye siparişinizi aldı',
        format('%s siparişiniz kuryede.', o.order_number), v_data);
    when 'on_the_way' then
      perform public._notify(o.customer_id, 'customer', 'order_on_the_way', 'Siparişiniz yolda',
        format('%s siparişiniz yolda. Teslimatta QR kodunuzu kuryeye okutun.', o.order_number), v_data);
    when 'delivered' then
      perform public._notify(o.customer_id, 'customer', 'order_delivered', 'Siparişiniz teslim edildi',
        format('%s siparişiniz teslim edildi. Afiyet olsun!', o.order_number), v_data);
      select email into v_email from public.profiles where id = o.customer_id;
      if v_email is not null and coalesce((select order_updates_email from public.notification_preferences where user_id = o.customer_id), true) then
        insert into public.email_outbox (to_email, user_id, category, template, data)
        values (v_email, o.customer_id, 'transactional', 'order_delivered', v_data || jsonb_build_object('vendor_name', v_vendor_name));
      end if;
    when 'cancelled', 'rejected', 'failed' then
      if p_from <> 'pending_payment' then
        perform public._notify(o.customer_id, 'customer', 'order_cancelled',
          case p_to when 'rejected' then 'Sipariş işletme tarafından reddedildi' else 'Sipariş iptal edildi' end,
          format('%s siparişiniz %s. Ödenen teslimat ücreti iade edilecektir.', o.order_number,
            case p_to when 'rejected' then 'reddedildi' when 'failed' then 'tamamlanamadı' else 'iptal edildi' end), v_data);
        perform public._notify_vendor(o.vendor_id, 'order_cancelled', 'Sipariş iptal edildi',
          format('%s siparişi iptal edildi.', o.order_number), v_data);
        if v_courier_user is not null then
          perform public._notify(v_courier_user, 'courier', 'order_cancelled', 'Görev iptal edildi',
            format('%s siparişi iptal edildi.', o.order_number), v_data);
        end if;
      end if;
    else
      null;
  end case;
end;
$$;

create or replace function public._notify_couriers_of_pool(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  r record;
begin
  select * into o from public.orders where id = p_order_id;
  for r in
    select user_id from public.couriers
    where coverage_area_id = o.coverage_area_id and status = 'active' and availability = 'available'
  loop
    perform public._notify(r.user_id, 'courier', 'new_task', 'Yeni görev',
      format('%s siparişi havuzda, teslim almaya hazır.', o.order_number),
      jsonb_build_object('order_id', o.id, 'order_number', o.order_number));
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sipariş numarası
-- ---------------------------------------------------------------------------
create or replace function public._generate_order_number()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  v_alphabet constant text := '23456789ABCDEFGHJKMNPQRSTVWXYZ';
  v_code text;
  v_bytes bytea;
begin
  loop
    v_bytes := extensions.gen_random_bytes(5);
    v_code := '';
    for i in 0..4 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 30) + 1, 1);
    end loop;
    v_code := 'KPD-' || to_char(now() at time zone 'Europe/Istanbul', 'YYMMDD') || '-' || v_code;
    exit when not exists (select 1 from public.orders where order_number = v_code);
  end loop;
  return v_code;
end;
$$;

-- ---------------------------------------------------------------------------
-- Teslimat ücreti teklifi (yalnız service_role / Edge Function çağırır)
-- Mesafe Edge Function'dan gelir (Google Maps veya Haversine tahmini); ücret burada hesaplanır.
-- ---------------------------------------------------------------------------
create or replace function public.create_delivery_fee_quote(
  p_customer_id uuid,
  p_vendor_id uuid,
  p_address_id uuid,
  p_distance_km numeric,
  p_distance_source text
)
returns public.delivery_fees
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a public.addresses;
  v public.vendors;
  ca public.coverage_areas;
  pr public.pricing_rules;
  pv public.pricing_rule_versions;
  v_straight numeric;
  v_distance numeric;
  v_fee numeric;
  q public.delivery_fees;
begin
  select * into a from public.addresses where id = p_address_id and user_id = p_customer_id and deleted_at is null;
  if not found then
    raise exception 'KPD_ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v from public.vendors where id = p_vendor_id and status = 'active' and deleted_at is null;
  if not found then
    raise exception 'KPD_VENDOR_UNAVAILABLE' using errcode = 'P0001';
  end if;
  if v.lat is null or v.lng is null then
    raise exception 'KPD_VENDOR_LOCATION_MISSING' using errcode = 'P0001';
  end if;
  select * into ca from public.coverage_areas where id = v.coverage_area_id;
  if not ca.is_active then
    raise exception 'KPD_AREA_INACTIVE' using errcode = 'P0001';
  end if;
  if public.haversine_km(ca.center_lat, ca.center_lng, a.lat, a.lng) > ca.max_radius_km then
    raise exception 'KPD_ADDRESS_OUT_OF_AREA' using errcode = 'P0001', hint = ca.max_radius_km::text;
  end if;
  if p_distance_source not in ('google_maps', 'haversine_estimate') then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  v_straight := public.haversine_km(v.lat, v.lng, a.lat, a.lng);
  -- Sürüş mesafesi kuş uçuşundan kısa olamaz; tutarsız girdi düzeltilir (kullanıcı aleyhine değil, kurala uygun)
  v_distance := round(greatest(coalesce(p_distance_km, 0), v_straight)::numeric, 2);

  select * into pr from public.pricing_rules where id = ca.pricing_rule_id and is_active;
  if not found or pr.current_version_id is null then
    raise exception 'KPD_PRICING_NOT_FOUND' using errcode = 'P0001';
  end if;
  select * into pv from public.pricing_rule_versions where id = pr.current_version_id;
  v_fee := public.compute_delivery_fee(pv.id, v_distance);

  insert into public.delivery_fees (customer_id, vendor_id, address_id, coverage_area_id, pricing_rule_version_id,
    distance_km, distance_source, fee, pricing_snapshot, expires_at)
  values (p_customer_id, p_vendor_id, p_address_id, ca.id, pv.id, v_distance, p_distance_source, v_fee,
    jsonb_build_object(
      'pricing_rule_id', pr.id, 'pricing_rule_name', pr.name, 'version_id', pv.id, 'version', pv.version,
      'base_fee', pv.base_fee, 'base_distance_km', pv.base_distance_km, 'per_km_fee', pv.per_km_fee,
      'max_distance_km', pv.max_distance_km, 'km_rounding', pv.km_rounding,
      'distance_km', v_distance, 'distance_source', p_distance_source, 'straight_line_km', round(v_straight, 2),
      'fee', v_fee, 'computed_at', now()),
    now() + make_interval(mins => public.setting_numeric('teslimat.quote_ttl_minutes', 15)::int))
  returning * into q;
  return q;
end;
$$;

-- ---------------------------------------------------------------------------
-- Sipariş oluşturma (müşteri). Tüm tutarlar sunucuda hesaplanır.
-- p_items: [{"product_id": uuid, "quantity": int, "substitution": "remove"|"find_alternative"|"notify_and_cancel"}]
-- ---------------------------------------------------------------------------
create or replace function public.create_order(
  p_delivery_fee_id uuid,
  p_items jsonb,
  p_product_payment_method public.product_payment_method,
  p_customer_note text default null,
  p_age_confirmed boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid uuid := auth.uid();
  v_profile public.profiles;
  q public.delivery_fees;
  a public.addresses;
  v public.vendors;
  ca public.coverage_areas;
  v_item jsonb;
  p public.products;
  c public.categories;
  v_qty int;
  v_sub public.substitution_preference;
  v_subtotal numeric := 0;
  v_count int := 0;
  v_has_restricted boolean := false;
  v_min_basket numeric;
  v_reward public.loyalty_rewards;
  v_delivered_count int;
  v_milestone int := public.setting_numeric('sadakat.order_milestone', 5)::int;
  v_payable numeric;
  v_order public.orders;
  v_token text;
  v_unit numeric := public.setting_numeric('komisyon.per_item_amount', 20);
  v_basis text := coalesce(public.setting('komisyon.basis') #>> '{}', 'per_line');
  v_commission_units int := 0;
  v_seen uuid[] := '{}';
begin
  if v_uid is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not public.has_role(v_uid, 'customer') then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  select * into v_profile from public.profiles where id = v_uid for update;
  if not found or v_profile.is_blocked or v_profile.deleted_at is not null then
    raise exception 'KPD_ACCOUNT_BLOCKED' using errcode = '42501';
  end if;
  if not v_profile.consents_complete then
    raise exception 'KPD_CONSENT_REQUIRED' using errcode = 'P0001';
  end if;
  if not exists (select 1 from auth.users where id = v_uid and email_confirmed_at is not null) then
    raise exception 'KPD_EMAIL_NOT_VERIFIED' using errcode = 'P0001';
  end if;
  if not public.setting_bool('operasyon.platform_open', true) then
    raise exception 'KPD_PLATFORM_CLOSED' using errcode = 'P0001';
  end if;
  perform public._rate_limit('create_order:' || v_uid, 10, 3600);

  select * into q from public.delivery_fees where id = p_delivery_fee_id and customer_id = v_uid for update;
  if not found then
    raise exception 'KPD_QUOTE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if q.consumed_at is not null then
    raise exception 'KPD_QUOTE_USED' using errcode = 'P0001';
  end if;
  if q.expires_at < now() then
    raise exception 'KPD_QUOTE_EXPIRED' using errcode = 'P0001';
  end if;

  select * into a from public.addresses where id = q.address_id and user_id = v_uid and deleted_at is null;
  if not found then
    raise exception 'KPD_ADDRESS_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v from public.vendors where id = q.vendor_id;
  if not public.vendor_is_open_now(v.id) then
    raise exception 'KPD_VENDOR_CLOSED' using errcode = 'P0001';
  end if;
  select * into ca from public.coverage_areas where id = v.coverage_area_id;

  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'KPD_CART_EMPTY' using errcode = 'P0001';
  end if;

  -- Ürünleri doğrula ve kilitle
  for v_item in select * from jsonb_array_elements(p_items) loop
    begin
      v_qty := (v_item ->> 'quantity')::int;
      v_sub := coalesce(v_item ->> 'substitution', 'remove')::public.substitution_preference;
    exception when others then
      raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
    end;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'KPD_INVALID_QUANTITY' using errcode = '22023';
    end if;
    select * into p from public.products where id = (v_item ->> 'product_id')::uuid for update;
    if not found or p.vendor_id <> v.id or not p.is_active or p.deleted_at is not null then
      raise exception 'KPD_PRODUCT_UNAVAILABLE' using errcode = 'P0001', hint = coalesce(v_item ->> 'product_id', '');
    end if;
    if p.id = any(v_seen) then
      raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
    end if;
    v_seen := v_seen || p.id;
    select * into c from public.categories where id = p.category_id;
    if not c.is_active or not c.is_online_sale_allowed then
      raise exception 'KPD_PRODUCT_NOT_SELLABLE_ONLINE' using errcode = 'P0001', hint = p.id::text;
    end if;
    if p.is_age_restricted or c.is_age_restricted then
      -- Yaş kısıtlı ürünlerin uzaktan satışı mevzuat gereği yalnız uyumluluk ayarı açıkça etkinse ve onay verilirse mümkündür.
      if not public.setting_bool('uyumluluk.age_restricted_online_sales_enabled', false) then
        raise exception 'KPD_PRODUCT_NOT_SELLABLE_ONLINE' using errcode = 'P0001', hint = p.id::text;
      end if;
      if not coalesce(p_age_confirmed, false) then
        raise exception 'KPD_AGE_CONFIRMATION_REQUIRED' using errcode = 'P0001';
      end if;
      v_has_restricted := true;
    end if;
    if p.track_stock and p.stock_quantity < v_qty then
      raise exception 'KPD_OUT_OF_STOCK' using errcode = 'P0001', hint = p.id::text;
    end if;
    v_subtotal := v_subtotal + p.price * v_qty;
    v_count := v_count + v_qty;
    v_commission_units := v_commission_units + case when v_basis = 'per_unit' then v_qty else 1 end;
  end loop;

  v_min_basket := greatest(ca.min_basket_amount, 0);
  if v_subtotal < v_min_basket then
    raise exception 'KPD_MIN_BASKET' using errcode = 'P0001', hint = (v_min_basket - v_subtotal)::text;
  end if;

  -- Sadakat: N. sipariş ödülü (benzersiz source_ref ile tekrar engeli) ve mevcut ödülün rezervasyonu
  if public.setting_bool('sadakat.enabled', true) and v_milestone > 0 then
    select count(*) into v_delivered_count from public.orders where customer_id = v_uid and status = 'delivered';
    if (v_delivered_count + 1) % v_milestone = 0 then
      insert into public.loyalty_rewards (user_id, source, source_ref)
      values (v_uid, 'order_milestone', format('order_milestone:%s:%s', v_uid, v_delivered_count + 1))
      on conflict (source_ref) do nothing;
    end if;
  end if;
  select * into v_reward from public.loyalty_rewards
  where user_id = v_uid and status = 'available'
  order by created_at limit 1 for update skip locked;

  v_payable := case when v_reward.id is not null then 0 else q.fee end;
  v_token := public.random_token(24);

  insert into public.orders (order_number, customer_id, vendor_id, coverage_area_id, address_id, delivery_fee_id, status,
    customer_name, customer_phone, delivery_address, delivery_lat, delivery_lng,
    product_subtotal, delivery_fee, delivery_fee_payable, delivery_fee_waived, loyalty_reward_id, commission_estimate,
    item_count, distance_km, distance_source, pricing_snapshot, payment_state, product_payment_method, customer_note,
    age_confirmed_at, tracking_token_hash)
  values (public._generate_order_number(), v_uid, v.id, ca.id, a.id, q.id, 'pending_payment',
    a.recipient_name, a.phone,
    jsonb_build_object('neighborhood', a.neighborhood, 'street', a.street, 'building', a.building, 'apartment', a.apartment,
      'floor', a.floor, 'door_number', a.door_number, 'directions', a.directions,
      'district', (select d.name from public.districts d where d.id = a.district_id)),
    a.lat, a.lng,
    v_subtotal, q.fee, v_payable, (v_payable = 0 and q.fee > 0), v_reward.id, v_commission_units * v_unit,
    v_count, q.distance_km, q.distance_source, q.pricing_snapshot,
    case when v_payable = 0 then 'not_required'::public.order_payment_state else 'pending'::public.order_payment_state end,
    p_product_payment_method, nullif(btrim(left(p_customer_note, 500)), ''),
    case when v_has_restricted then now() else null end, public.sha256_hex(v_token))
  returning * into v_order;

  insert into public.order_items (order_id, product_id, product_name, barcode, unit, unit_price, quantity, line_total,
    is_age_restricted, substitution_preference)
  select v_order.id, p2.id, p2.name, p2.barcode, p2.unit, p2.price, (x ->> 'quantity')::int,
    p2.price * (x ->> 'quantity')::int, p2.is_age_restricted,
    coalesce(x ->> 'substitution', 'remove')::public.substitution_preference
  from jsonb_array_elements(p_items) x
  join public.products p2 on p2.id = (x ->> 'product_id')::uuid;

  update public.products p3 set stock_quantity = p3.stock_quantity - (x ->> 'quantity')::int
  from jsonb_array_elements(p_items) x
  where p3.id = (x ->> 'product_id')::uuid and p3.track_stock;

  update public.delivery_fees set consumed_at = now(), order_id = v_order.id where id = q.id;

  if v_reward.id is not null then
    update public.loyalty_rewards set status = 'reserved', order_id = v_order.id where id = v_reward.id;
  end if;

  insert into public.order_status_history (order_id, previous_status, new_status, actor_id, actor_role, reason)
  values (v_order.id, null, 'pending_payment', v_uid, 'customer', 'order_created');

  -- Teslimat ücreti ödenmeyecekse (sadakat ödülü) ödeme adımı atlanır
  if v_payable = 0 then
    perform public._order_transition(v_order.id, 'payment_confirmed', 'system', 'payment_not_required');
    perform public._order_transition(v_order.id, 'vendor_pending', 'system', null);
  end if;

  -- İşletme adres defteri: kolaylık özelliğidir, hatası siparişi geri almaz.
  begin
    perform public._save_address_book(v.id, a.phone, a.recipient_name, a.neighborhood, a.street, a.building, a.apartment,
      a.floor, a.door_number, a.directions, a.lat, a.lng);
  exception when others then
    perform public._log_event('database', 'address_book_failure', 'warning', 'Adres defteri kaydı başarısız',
      jsonb_build_object('order_id', v_order.id, 'sqlstate', sqlstate));
  end;

  select * into v_order from public.orders where id = v_order.id;
  return jsonb_build_object(
    'order_id', v_order.id,
    'order_number', v_order.order_number,
    'status', v_order.status,
    'product_subtotal', v_order.product_subtotal,
    'delivery_fee', v_order.delivery_fee,
    'delivery_fee_payable', v_order.delivery_fee_payable,
    'payment_required', v_order.delivery_fee_payable > 0,
    'tracking_token', v_token
  );
end;
$$;

-- Adres defteri kaydı (normalize telefon ile)
create or replace function public._save_address_book(
  p_vendor_id uuid, p_phone text, p_name text, p_neighborhood text, p_street text, p_building text, p_apartment text,
  p_floor text, p_door text, p_directions text, p_lat double precision, p_lng double precision
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalize_tr_phone(p_phone);
  v_fp text;
begin
  if v_phone is null then
    raise exception 'KPD_INVALID_PHONE' using errcode = '22023';
  end if;
  v_fp := public.sha256_hex(lower(concat_ws('|', btrim(p_neighborhood), btrim(p_street), btrim(p_building),
    btrim(coalesce(p_apartment, '')), btrim(coalesce(p_floor, '')), btrim(coalesce(p_door, '')))));
  insert into public.customer_address_book (vendor_id, phone, customer_name, neighborhood, street, building, apartment,
    floor, door_number, directions, lat, lng, fingerprint)
  values (p_vendor_id, v_phone, p_name, p_neighborhood, p_street, p_building, p_apartment, p_floor, p_door, p_directions,
    p_lat, p_lng, v_fp)
  on conflict (vendor_id, phone, fingerprint) do update
    set use_count = public.customer_address_book.use_count + 1,
        last_used_at = now(),
        customer_name = coalesce(excluded.customer_name, public.customer_address_book.customer_name),
        directions = coalesce(excluded.directions, public.customer_address_book.directions),
        lat = coalesce(excluded.lat, public.customer_address_book.lat),
        lng = coalesce(excluded.lng, public.customer_address_book.lng);
end;
$$;

-- ---------------------------------------------------------------------------
-- Ödeme (service_role — iyzico Edge Function'ları)
-- ---------------------------------------------------------------------------
create or replace function public.begin_delivery_payment(p_order_id uuid, p_customer_id uuid)
returns public.payments
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  pay public.payments;
begin
  select * into o from public.orders where id = p_order_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status <> 'pending_payment' or o.payment_state <> 'pending' then
    raise exception 'KPD_PAYMENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if o.delivery_fee_payable <= 0 then
    raise exception 'KPD_PAYMENT_NOT_REQUIRED' using errcode = 'P0001';
  end if;
  -- Önceki tamamlanmamış denemeler geçersiz kılınır
  update public.payments set status = 'failed', failure_reason = 'superseded'
  where order_id = p_order_id and status in ('initiated', 'pending');
  insert into public.payments (order_id, amount, conversation_id, idempotency_key, status)
  values (p_order_id, o.delivery_fee_payable, 'KPD' || replace(gen_random_uuid()::text, '-', ''),
    'pay:' || p_order_id || ':' || public.random_token(12), 'initiated')
  returning * into pay;
  return pay;
end;
$$;

create or replace function public.attach_payment_token(p_payment_id uuid, p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.payments set provider_token = p_token, status = 'pending'
  where id = p_payment_id and status = 'initiated';
  if not found then
    raise exception 'KPD_PAYMENT_NOT_ALLOWED' using errcode = 'P0001';
  end if;
end;
$$;

-- Idempotent ödeme onayı. Tutar sipariş üzerindeki teslimat ücretiyle birebir eşleşmelidir.
create or replace function public.confirm_delivery_payment(
  p_payment_id uuid,
  p_provider_payment_id text,
  p_paid_amount numeric,
  p_provider_response jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay public.payments;
  o public.orders;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if pay.status in ('succeeded', 'refund_pending', 'refunded') then
    return jsonb_build_object('result', 'already_processed', 'order_id', pay.order_id);
  end if;
  select * into o from public.orders where id = pay.order_id for update;

  if p_paid_amount is null or round(p_paid_amount, 2) <> pay.amount or pay.amount <> o.delivery_fee_payable then
    update public.payments set status = 'failed', failure_reason = 'amount_mismatch', provider_response = p_provider_response
    where id = pay.id;
    perform public._log_event('edge_function', 'payment_failure', 'critical', 'Ödeme tutarı uyuşmazlığı',
      jsonb_build_object('payment_id', pay.id, 'order_id', o.id));
    perform public._notify_admins('payment_issue', 'Ödeme tutarı uyuşmazlığı',
      format('%s siparişinde ödeme tutarı beklenenle eşleşmedi.', o.order_number), jsonb_build_object('order_id', o.id));
    return jsonb_build_object('result', 'amount_mismatch', 'order_id', o.id);
  end if;

  update public.payments set status = 'succeeded', provider_payment_id = p_provider_payment_id, paid_at = now(),
    provider_response = p_provider_response
  where id = pay.id;

  if o.status = 'pending_payment' then
    update public.orders set payment_state = 'paid' where id = o.id;
    perform public._order_transition(o.id, 'payment_confirmed', 'system', 'payment_succeeded',
      jsonb_build_object('payment_id', pay.id));
    perform public._order_transition(o.id, 'vendor_pending', 'system', null);
    return jsonb_build_object('result', 'confirmed', 'order_id', o.id);
  end if;

  -- Sipariş bu arada kapandıysa (ör. zaman aşımı) tahsilat iade kuyruğuna alınır
  update public.payments set status = 'refund_pending', refund_requested_at = now() where id = pay.id;
  update public.orders set payment_state = 'refund_pending' where id = o.id;
  perform public._notify_admins('payment_issue', 'Kapalı siparişe ödeme',
    format('%s siparişi kapandıktan sonra ödeme alındı; iade kuyruğuna eklendi.', o.order_number), jsonb_build_object('order_id', o.id));
  return jsonb_build_object('result', 'refund_queued', 'order_id', o.id);
end;
$$;

create or replace function public.fail_delivery_payment(p_payment_id uuid, p_reason text, p_provider_response jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found or pay.status not in ('initiated', 'pending') then
    return;
  end if;
  update public.payments set status = 'failed', failure_reason = left(p_reason, 300), provider_response = p_provider_response
  where id = pay.id;
  perform public._log_event('edge_function', 'payment_failure', 'warning', 'Teslimat ücreti ödemesi başarısız',
    jsonb_build_object('payment_id', pay.id, 'order_id', pay.order_id));
end;
$$;

create or replace function public.mark_payment_refunded(p_payment_id uuid, p_provider_refund_id text, p_provider_response jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  pay public.payments;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found or pay.status <> 'refund_pending' then
    return;
  end if;
  update public.payments set status = 'refunded', refunded_at = now(), provider_refund_id = p_provider_refund_id,
    provider_response = coalesce(provider_response, '{}'::jsonb) || jsonb_build_object('refund', p_provider_response)
  where id = pay.id;
  update public.orders set payment_state = 'refunded' where id = pay.order_id;
end;
$$;

-- Ödemesi tamamlanmayan siparişlerin zaman aşımı (cron)
create or replace function public.expire_pending_payments()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  v_count int := 0;
  v_timeout int := public.setting_numeric('odeme.pending_payment_timeout_minutes', 30)::int;
begin
  for r in
    select id from public.orders
    where status = 'pending_payment' and created_at < now() - make_interval(mins => v_timeout)
    for update skip locked
  loop
    perform public._order_transition(r.id, 'cancelled', 'system', 'payment_timeout');
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
