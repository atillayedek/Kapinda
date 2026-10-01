-- Müşteri, işletme, kurye RPC'leri; QR teslimat doğrulama; yeni kullanıcı tetikleyicisi

-- ---------------------------------------------------------------------------
-- Yeni kullanıcı: profil + customer rolü + onaylar + referans
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_ref_code text := upper(btrim(coalesce(v_meta ->> 'referral_code', '')));
  v_referrer uuid;
  v_phone text := public.normalize_tr_phone(v_meta ->> 'phone');
begin
  insert into public.profiles (id, full_name, email, phone, referral_code)
  values (new.id, left(coalesce(btrim(v_meta ->> 'full_name'), ''), 120), lower(new.email), v_phone,
    public._generate_referral_code());

  insert into public.user_roles (user_id, role) values (new.id, 'customer') on conflict do nothing;
  insert into public.notification_preferences (user_id) values (new.id) on conflict do nothing;

  perform public._record_consents(new.id, coalesce(v_meta -> 'consents', '{}'::jsonb));

  if v_ref_code ~ '^[A-Z0-9]{8}$' then
    select id into v_referrer from public.profiles where referral_code = v_ref_code and id <> new.id;
    if v_referrer is not null then
      insert into public.referrals (referrer_id, referred_id, referral_code) values (v_referrer, new.id, v_ref_code)
      on conflict (referred_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = lower(new.email) where id = new.id;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_email_changed after update of email on auth.users for each row execute function public.handle_user_email_change();

-- Güncel yasal dokümanları kabul et (kayıt sonrası eksik kalmışsa)
create or replace function public.accept_legal_documents(p_consents jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  return public._record_consents(auth.uid(), coalesce(p_consents, '{}'::jsonb));
end;
$$;

-- Oturum yönetimi
create or replace function public.my_sessions()
returns table (id uuid, created_at timestamptz, updated_at timestamptz, user_agent text, ip text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id, s.created_at, s.updated_at, s.user_agent, host(s.ip)
  from auth.sessions s where s.user_id = auth.uid()
  order by s.updated_at desc nulls last;
$$;

create or replace function public.revoke_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  delete from auth.sessions where id = p_session_id and user_id = auth.uid();
end;
$$;

-- ---------------------------------------------------------------------------
-- Adresler: tek varsayılan adres
-- ---------------------------------------------------------------------------
create or replace function public.addresses_single_default()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.is_default and new.deleted_at is null then
    update public.addresses set is_default = false
    where user_id = new.user_id and id <> new.id and is_default and deleted_at is null;
  end if;
  if new.deleted_at is not null then
    new.is_default := false;
  end if;
  return new;
end;
$$;
create trigger addresses_single_default before insert or update of is_default, deleted_at on public.addresses
  for each row execute function public.addresses_single_default();

-- ---------------------------------------------------------------------------
-- Ortak erişim yardımcıları
-- ---------------------------------------------------------------------------
create or replace function public.can_view_order(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.orders o
    where o.id = p_order_id and (
      o.customer_id = auth.uid()
      or public.is_admin()
      or (o.vendor_visible_at is not null and public.is_vendor_member(o.vendor_id))
      or (o.courier_id is not null and o.courier_id = public.current_courier_id())
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- Müşteri RPC'leri
-- ---------------------------------------------------------------------------
create or replace function public.customer_cancel_order(p_order_id uuid, p_reason text default null)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid() for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  o := public._order_transition(p_order_id, 'cancelled', 'customer', coalesce(nullif(btrim(left(p_reason, 500)), ''), 'customer_cancelled'));
  return o.status;
end;
$$;

-- Paylaşılabilir takip bağlantısı: her çağrıda yeni token üretilir, öncekiler geçersiz olur.
create or replace function public.rotate_tracking_token(p_order_id uuid)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := public.random_token(24);
begin
  update public.orders set tracking_token_hash = public.sha256_hex(v_token),
    tracking_token_expires_at = case when status = 'delivered' then now() + interval '24 hours' else null end
  where id = p_order_id and customer_id = auth.uid()
    and status not in ('cancelled', 'rejected', 'failed');
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  return v_token;
end;
$$;

create or replace function public._mask_name(p_name text)
returns text
language sql
immutable
set search_path = public, pg_temp
as $$
  select case
    when p_name is null or btrim(p_name) = '' then null
    when position(' ' in btrim(p_name)) = 0 then btrim(p_name)
    else split_part(btrim(p_name), ' ', 1) || ' ' || left(split_part(btrim(p_name), ' ', array_length(string_to_array(btrim(p_name), ' '), 1)), 1) || '.'
  end;
$$;

-- Kimlik doğrulaması olmadan, tahmin edilemez token ile asgari takip bilgisi
create or replace function public.public_track_order(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_vendor text;
  v_courier text;
  l public.order_live_locations;
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 100 then
    return null;
  end if;
  select * into o from public.orders where tracking_token_hash = public.sha256_hex(p_token);
  if not found or (o.tracking_token_expires_at is not null and o.tracking_token_expires_at < now()) then
    return null;
  end if;
  select name into v_vendor from public.vendors where id = o.vendor_id;
  select public._mask_name(display_name) into v_courier from public.couriers where id = o.courier_id;
  if o.status in ('picked_up', 'on_the_way') then
    select * into l from public.order_live_locations where order_id = o.id;
  end if;
  return jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'vendor_name', v_vendor,
    'courier_name', v_courier,
    'courier_location', case when l.lat is not null then jsonb_build_object('lat', l.lat, 'lng', l.lng, 'updated_at', l.updated_at) end,
    'timeline', jsonb_build_object('created_at', o.created_at, 'accepted_at', o.accepted_at, 'ready_at', o.ready_at,
      'picked_up_at', o.picked_up_at, 'on_the_way_at', o.on_the_way_at, 'delivered_at', o.delivered_at, 'cancelled_at', o.cancelled_at)
  );
end;
$$;

-- Müşterinin kendi siparişi için harita verisi
create or replace function public.get_order_tracking(p_order_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v public.vendors;
  v_courier text;
  l public.order_live_locations;
begin
  select * into o from public.orders where id = p_order_id and (customer_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into v from public.vendors where id = o.vendor_id;
  select public._mask_name(display_name) into v_courier from public.couriers where id = o.courier_id;
  if o.status in ('courier_assigned', 'picked_up', 'on_the_way') then
    select * into l from public.order_live_locations where order_id = o.id;
  end if;
  return jsonb_build_object(
    'status', o.status,
    'vendor', jsonb_build_object('name', v.name, 'lat', v.lat, 'lng', v.lng),
    'destination', jsonb_build_object('lat', o.delivery_lat, 'lng', o.delivery_lng),
    'courier_name', v_courier,
    'courier_location', case when l.lat is not null then jsonb_build_object('lat', l.lat, 'lng', l.lng, 'heading', l.heading, 'updated_at', l.updated_at) end,
    'distance_km', o.distance_km
  );
end;
$$;

create or replace function public.submit_rating(p_order_id uuid, p_target text, p_score int, p_comment text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_id uuid;
begin
  select * into o from public.orders where id = p_order_id and customer_id = auth.uid();
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status <> 'delivered' then
    raise exception 'KPD_RATING_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  if p_target not in ('vendor', 'courier') or p_score not between 1 and 5 or char_length(coalesce(p_comment, '')) > 500 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  if p_target = 'courier' and o.courier_id is null then
    raise exception 'KPD_RATING_NOT_ALLOWED' using errcode = 'P0001';
  end if;
  insert into public.ratings (order_id, rater_id, target_type, vendor_id, courier_id, score, comment)
  values (o.id, auth.uid(), p_target,
    case when p_target = 'vendor' then o.vendor_id end,
    case when p_target = 'courier' then o.courier_id end,
    p_score, nullif(btrim(p_comment), ''))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'KPD_ALREADY_RATED' using errcode = '23505';
end;
$$;

-- Destek
create or replace function public.create_support_conversation(p_subject text, p_body text, p_order_id uuid default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  perform public._rate_limit('support_new:' || auth.uid(), 5, 3600);
  if p_order_id is not null and not exists (select 1 from public.orders where id = p_order_id and customer_id = auth.uid()) then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  insert into public.support_conversations (customer_id, order_id, subject)
  values (auth.uid(), p_order_id, btrim(p_subject))
  returning id into v_id;
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (v_id, auth.uid(), 'customer', btrim(p_body));
  perform public._notify_admins('support_new', 'Yeni destek talebi', left(btrim(p_subject), 120), jsonb_build_object('conversation_id', v_id));
  return v_id;
end;
$$;

create or replace function public.send_support_message(p_conversation_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.support_conversations;
  v_role text;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  select * into c from public.support_conversations where id = p_conversation_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if c.customer_id = auth.uid() then
    v_role := 'customer';
  elsif public.is_admin() then
    v_role := 'admin';
  else
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  perform public._rate_limit('support_msg:' || auth.uid(), 30, 60);
  insert into public.support_messages (conversation_id, sender_id, sender_role, body)
  values (c.id, auth.uid(), v_role, btrim(p_body))
  returning id into v_id;
  update public.support_conversations set
    last_message_at = now(),
    status = case when v_role = 'admin' then 'waiting'::public.support_status else 'open'::public.support_status end,
    assigned_admin_id = case when v_role = 'admin' then coalesce(assigned_admin_id, auth.uid()) else assigned_admin_id end,
    resolved_at = null
  where id = c.id;
  if v_role = 'admin' then
    perform public._notify(c.customer_id, 'customer', 'support_reply', 'Destek ekibinden yanıt', left(btrim(p_body), 200),
      jsonb_build_object('conversation_id', c.id));
  elsif c.assigned_admin_id is not null then
    perform public._notify(c.assigned_admin_id, 'admin', 'support_message', 'Destek talebine yeni mesaj', left(btrim(p_body), 200),
      jsonb_build_object('conversation_id', c.id));
  end if;
  return v_id;
end;
$$;

create or replace function public.set_support_status(p_conversation_id uuid, p_status public.support_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.support_conversations set status = p_status,
    resolved_at = case when p_status = 'resolved' then now() else null end
  where id = p_conversation_id and (customer_id = auth.uid() or public.is_admin());
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

-- Bildirim cihazları (FCM token yaşam döngüsü)
create or replace function public.register_device_token(p_token text, p_app public.device_app, p_platform public.device_platform,
  p_device_id text default null, p_device_name text default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  if p_app = 'admin' and not public.is_admin() then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if p_app = 'courier' and public.current_courier_id() is null then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if p_app = 'vendor' and not public.has_role(auth.uid(), 'vendor') then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  perform public._rate_limit('device_token:' || auth.uid(), 20, 3600);
  -- Aynı cihazdaki eski tokenlar geçersiz kılınır
  if p_device_id is not null then
    update public.device_tokens set revoked_at = now(), revoke_reason = 'replaced'
    where user_id = auth.uid() and device_id = p_device_id and app = p_app and token <> p_token and revoked_at is null;
  end if;
  insert into public.device_tokens (user_id, token, app, platform, device_id, device_name)
  values (auth.uid(), p_token, p_app, p_platform, left(p_device_id, 200), left(p_device_name, 200))
  on conflict (token) do update set
    user_id = auth.uid(), app = excluded.app, platform = excluded.platform, device_id = excluded.device_id,
    device_name = excluded.device_name, last_seen_at = now(), revoked_at = null, revoke_reason = null
  returning id into v_id;
  return v_id;
end;
$$;

-- Çıkışta çağrılır
create or replace function public.revoke_device_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.device_tokens set revoked_at = now(), revoke_reason = 'logout'
  where token = p_token and user_id = auth.uid() and revoked_at is null;
end;
$$;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count int;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any(p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- İşletme RPC'leri
-- ---------------------------------------------------------------------------
create or replace function public.vendor_update_order_status(p_order_id uuid, p_to public.order_status, p_reason text default null)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.vendor_visible_at is null or not public.is_vendor_member(o.vendor_id) then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.vendors where id = o.vendor_id and status = 'active') then
    raise exception 'KPD_VENDOR_NOT_ACTIVE' using errcode = '42501';
  end if;
  if p_to in ('rejected', 'cancelled') and coalesce(btrim(p_reason), '') = '' then
    raise exception 'KPD_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  o := public._order_transition(p_order_id, p_to, 'vendor', nullif(btrim(left(p_reason, 500)), ''));
  -- Kurye hazırlık sırasında atanmışsa sipariş hazır olduğunda doğrudan "kurye atandı" olur
  if o.status = 'ready_for_pickup' and o.courier_id is not null then
    o := public._order_transition(p_order_id, 'courier_assigned', 'system', 'courier_preassigned');
  end if;
  return o.status;
end;
$$;

-- Stokta olmayan kalem: müşterinin önceden seçtiği tercih uygulanır
create or replace function public.vendor_mark_item_unavailable(p_item_id uuid, p_substitute_product_id uuid default null, p_substitute_quantity int default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  it public.order_items;
  o public.orders;
  sp public.products;
  c public.categories;
  v_qty int;
  v_subtotal numeric;
  v_remaining int;
  v_result text;
begin
  select * into it from public.order_items where id = p_item_id;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  select * into o from public.orders where id = it.order_id for update;
  if o.vendor_visible_at is null or not public.is_vendor_member(o.vendor_id) then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status not in ('vendor_pending', 'vendor_accepted', 'preparing') or it.fulfillment <> 'pending' then
    raise exception 'KPD_ITEM_UPDATE_NOT_ALLOWED' using errcode = 'P0001';
  end if;

  if it.substitution_preference = 'notify_and_cancel' then
    perform public._order_transition(o.id,
      case when o.status = 'vendor_pending' then 'rejected'::public.order_status else 'cancelled'::public.order_status end,
      'vendor', format('item_unavailable:%s', it.product_name), jsonb_build_object('item_id', it.id));
    return jsonb_build_object('result', 'order_cancelled');
  end if;

  perform set_config('kapinda.financial_change', o.id::text, true);
  if it.substitution_preference = 'find_alternative' and p_substitute_product_id is not null then
    select * into sp from public.products where id = p_substitute_product_id for update;
    if not found or sp.vendor_id <> o.vendor_id or not sp.is_active or sp.deleted_at is not null or sp.id = it.product_id then
      raise exception 'KPD_PRODUCT_UNAVAILABLE' using errcode = 'P0001';
    end if;
    select * into c from public.categories where id = sp.category_id;
    if not c.is_online_sale_allowed or (sp.is_age_restricted and o.age_confirmed_at is null) then
      raise exception 'KPD_PRODUCT_NOT_SELLABLE_ONLINE' using errcode = 'P0001';
    end if;
    v_qty := coalesce(p_substitute_quantity, it.quantity);
    if v_qty < 1 or v_qty > 99 then
      raise exception 'KPD_INVALID_QUANTITY' using errcode = '22023';
    end if;
    if sp.track_stock and sp.stock_quantity < v_qty then
      raise exception 'KPD_OUT_OF_STOCK' using errcode = 'P0001';
    end if;
    -- Müşteri koruması: alternatif kalem tutarı orijinal kalemin %25 fazlasını aşamaz
    if sp.price * v_qty > it.line_total * 1.25 then
      raise exception 'KPD_SUBSTITUTE_TOO_EXPENSIVE' using errcode = 'P0001';
    end if;
    -- Orijinal ürünün ayrılmış stoğu iade edilir (fiziksel olarak yok sayılır: stok 0'a çekilir)
    update public.products set stock_quantity = 0 where id = it.product_id and track_stock;
    update public.products set stock_quantity = stock_quantity - v_qty where id = sp.id and track_stock;
    update public.order_items set
      substituted_from = jsonb_build_object('product_id', it.product_id, 'name', it.product_name, 'unit_price', it.unit_price,
        'quantity', it.quantity, 'barcode', it.barcode),
      product_id = sp.id, product_name = sp.name, barcode = sp.barcode, unit = sp.unit, unit_price = sp.price,
      quantity = v_qty, line_total = sp.price * v_qty, is_age_restricted = sp.is_age_restricted,
      fulfillment = 'substituted'
    where id = it.id;
    v_result := 'substituted';
  else
    update public.products set stock_quantity = 0 where id = it.product_id and track_stock;
    update public.order_items set fulfillment = 'removed', line_total = 0 where id = it.id;
    v_result := 'removed';
  end if;

  select coalesce(sum(line_total), 0), count(*) filter (where fulfillment <> 'removed')
  into v_subtotal, v_remaining
  from public.order_items where order_id = o.id;
  update public.orders set product_subtotal = v_subtotal,
    item_count = greatest(1, (select coalesce(sum(quantity), 0) from public.order_items where order_id = o.id and fulfillment <> 'removed'))
  where id = o.id;
  perform set_config('kapinda.financial_change', '', true);

  insert into public.order_status_history (order_id, previous_status, new_status, actor_id, actor_role, reason, metadata)
  values (o.id, o.status, o.status, auth.uid(), 'vendor', 'item_' || v_result,
    jsonb_build_object('item_id', it.id, 'product_name', it.product_name, 'substitute_product_id', p_substitute_product_id));

  perform public._notify(o.customer_id, 'customer', 'order_item_changed',
    case when v_result = 'substituted' then 'Ürün alternatifle değiştirildi' else 'Ürün siparişten çıkarıldı' end,
    format('%s siparişinizdeki "%s" stokta olmadığı için %s.', o.order_number, it.product_name,
      case when v_result = 'substituted' then 'alternatif ürünle değiştirildi' else 'siparişten çıkarıldı' end),
    jsonb_build_object('order_id', o.id));

  if v_remaining = 0 then
    perform public._order_transition(o.id,
      case when o.status = 'vendor_pending' then 'rejected'::public.order_status else 'cancelled'::public.order_status end,
      'vendor', 'all_items_unavailable');
    return jsonb_build_object('result', 'order_cancelled');
  end if;
  return jsonb_build_object('result', v_result, 'product_subtotal', v_subtotal);
end;
$$;

-- Telefonla adres defteri araması (normalize edilmiş)
create or replace function public.vendor_address_book_lookup(p_vendor_id uuid, p_phone text)
returns setof public.customer_address_book
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_phone text := public.normalize_tr_phone(p_phone);
begin
  if not public.is_vendor_member(p_vendor_id) then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if v_phone is null then
    raise exception 'KPD_INVALID_PHONE' using errcode = '22023';
  end if;
  return query
    select * from public.customer_address_book
    where vendor_id = p_vendor_id and phone = v_phone
    order by last_used_at desc
    limit 20;
end;
$$;

create or replace function public.vendor_sales_summary(p_vendor_id uuid, p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if not (public.is_vendor_member(p_vendor_id) or public.is_admin()) then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'delivered_orders', count(*) filter (where o.status = 'delivered'),
      'cancelled_orders', count(*) filter (where o.status in ('cancelled', 'rejected', 'failed')),
      'active_orders', count(*) filter (where o.status not in ('delivered', 'cancelled', 'rejected', 'failed')),
      'product_gmv', coalesce(sum(pc.product_gmv), 0),
      'commission_total', coalesce(sum(pc.total_amount), 0)
    )
    from public.orders o
    left join public.platform_commissions pc on pc.order_id = o.id
    where o.vendor_id = p_vendor_id and o.vendor_visible_at is not null
      and o.created_at >= p_from and o.created_at < p_to
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Kurye RPC'leri
-- ---------------------------------------------------------------------------
create or replace function public._require_active_courier()
returns public.couriers
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers;
begin
  select * into c from public.couriers where id = public.current_courier_id();
  if not found then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if c.status <> 'active' then
    raise exception 'KPD_COURIER_NOT_ACTIVE' using errcode = '42501';
  end if;
  return c;
end;
$$;

create or replace function public.courier_set_online(p_online boolean)
returns public.courier_availability
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  v public.courier_availability;
begin
  if p_online and c.availability = 'unavailable' and exists (
    select 1 from public.courier_incidents where courier_id = c.id and made_unavailable and status <> 'resolved'
  ) then
    raise exception 'KPD_COURIER_INCIDENT_OPEN' using errcode = 'P0001';
  end if;
  update public.couriers set
    availability = case when p_online then
        case when active_order_count >= max_active_orders then 'busy'::public.courier_availability else 'available'::public.courier_availability end
      else 'offline'::public.courier_availability end,
    last_seen_at = now()
  where id = c.id
  returning availability into v;
  return v;
end;
$$;

-- Sipariş havuzu — asgari bilgi (müşteri telefonu ve tam adres yoktur)
create or replace function public.courier_available_orders()
returns table (
  order_id uuid, order_number text, status public.order_status, vendor_name text, vendor_address text,
  vendor_lat double precision, vendor_lng double precision, destination_neighborhood text,
  destination_lat double precision, destination_lng double precision, distance_km numeric, item_count int, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
begin
  if c.availability not in ('available', 'busy') then
    return;
  end if;
  return query
    select o.id, o.order_number, o.status, v.name, v.address_text, v.lat, v.lng,
      o.delivery_address ->> 'neighborhood',
      round(o.delivery_lat::numeric, 3)::double precision, round(o.delivery_lng::numeric, 3)::double precision,
      o.distance_km, o.item_count, o.created_at
    from public.orders o
    join public.vendors v on v.id = o.vendor_id
    where o.coverage_area_id = c.coverage_area_id and o.courier_id is null
      and o.status in ('vendor_accepted', 'preparing', 'ready_for_pickup')
    order by (o.status = 'ready_for_pickup') desc, o.created_at
    limit 50;
end;
$$;

create or replace function public._assign_courier(p_order_id uuid, p_courier_id uuid, p_type text, p_override boolean, p_actor public.transition_actor)
returns public.orders
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  c public.couriers;
begin
  select * into c from public.couriers where id = p_courier_id for update;
  if not found or c.status <> 'active' then
    raise exception 'KPD_COURIER_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.coverage_area_id <> c.coverage_area_id then
    raise exception 'KPD_COURIER_AREA_MISMATCH' using errcode = 'P0001';
  end if;
  if c.active_order_count >= c.max_active_orders and not p_override then
    raise exception 'KPD_COURIER_CAPACITY' using errcode = 'P0001', hint = c.max_active_orders::text;
  end if;

  perform set_config('kapinda.assignment_change', o.id::text, true);
  update public.orders set courier_id = c.id where id = o.id;
  perform set_config('kapinda.assignment_change', '', true);

  insert into public.order_assignments (order_id, courier_id, assigned_by, assignment_type, capacity_override)
  values (o.id, c.id, coalesce(auth.uid(), nullif(current_setting('kapinda.actor_id', true), '')::uuid), p_type, p_override);

  insert into public.order_live_locations (order_id, courier_id, lat, lng)
  values (o.id, c.id, null, null)
  on conflict (order_id) do update set courier_id = excluded.courier_id, lat = null, lng = null, updated_at = now();

  if o.status = 'ready_for_pickup' then
    o := public._order_transition(o.id, 'courier_assigned', p_actor, p_type);
  else
    perform public._notify_vendor(o.vendor_id, 'courier_coming', 'Kurye atandı',
      format('%s siparişi için kurye atandı.', o.order_number), jsonb_build_object('order_id', o.id));
  end if;
  perform public._notify(c.user_id, 'courier', 'assignment', 'Yeni görev atandı',
    format('%s siparişi size atandı.', o.order_number), jsonb_build_object('order_id', o.id));
  perform public._refresh_courier_load(c.id);
  select * into o from public.orders where id = o.id;
  return o;
end;
$$;

create or replace function public._unassign_courier(p_order_id uuid, p_end_status text, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  v_prev uuid;
begin
  select * into o from public.orders where id = p_order_id for update;
  v_prev := o.courier_id;
  if v_prev is null then
    return null;
  end if;
  update public.order_assignments set status = p_end_status, ended_at = now(), end_reason = left(p_reason, 500)
  where order_id = o.id and status = 'active';
  -- Eski kuryenin QR'ları kullanılamaz
  update public.qr_tokens set revoked_at = now(), revoke_reason = 'courier_changed'
  where order_id = o.id and consumed_at is null and revoked_at is null;
  perform set_config('kapinda.assignment_change', o.id::text, true);
  update public.orders set courier_id = null where id = o.id;
  perform set_config('kapinda.assignment_change', '', true);
  update public.order_live_locations set courier_id = null, lat = null, lng = null, updated_at = now() where order_id = o.id;
  perform public._refresh_courier_load(v_prev);
  return v_prev;
end;
$$;

create or replace function public.courier_accept_order(p_order_id uuid)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  o public.orders;
begin
  if c.availability not in ('available') then
    raise exception 'KPD_COURIER_OFFLINE' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.coverage_area_id <> c.coverage_area_id then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.courier_id is not null or o.status not in ('vendor_accepted', 'preparing', 'ready_for_pickup') then
    raise exception 'KPD_ORDER_ALREADY_TAKEN' using errcode = 'P0001';
  end if;
  o := public._assign_courier(o.id, c.id, 'self_accept', false, 'courier');
  return o.status;
end;
$$;

create or replace function public.courier_release_order(p_order_id uuid, p_reason text)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  o public.orders;
begin
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.courier_id is distinct from c.id then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status in ('picked_up', 'on_the_way') then
    raise exception 'KPD_RELEASE_AFTER_PICKUP' using errcode = 'P0001';
  end if;
  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'KPD_REASON_REQUIRED' using errcode = 'P0001';
  end if;
  insert into public.order_transfers (order_id, from_courier_id, to_courier_id, transfer_type, transferred_by, reason)
  values (o.id, c.id, null, 'courier_release', auth.uid(), btrim(p_reason));
  if o.status = 'courier_assigned' then
    perform public._order_transition(o.id, 'ready_for_pickup', 'courier', btrim(p_reason));
  end if;
  perform public._unassign_courier(o.id, 'released', btrim(p_reason));
  if o.status in ('courier_assigned', 'ready_for_pickup') then
    perform public._notify_couriers_of_pool(o.id);
  end if;
  select * into o from public.orders where id = o.id;
  return o.status;
end;
$$;

create or replace function public.courier_update_order_status(p_order_id uuid, p_to public.order_status)
returns public.order_status
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  o public.orders;
begin
  if p_to not in ('picked_up', 'on_the_way') then
    raise exception 'KPD_INVALID_TRANSITION' using errcode = 'P0001';
  end if;
  select * into o from public.orders where id = p_order_id for update;
  if not found or o.courier_id is distinct from c.id then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  o := public._order_transition(o.id, p_to, 'courier', null);
  return o.status;
end;
$$;

-- Konum: sunucu tarafında kısıtlanır (ayar: kurye.location_min_interval_seconds)
create or replace function public.courier_update_location(p_lat double precision, p_lng double precision,
  p_accuracy real default null, p_heading real default null, p_speed real default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  v_interval int := public.setting_numeric('kurye.location_min_interval_seconds', 5)::int;
  r record;
begin
  if p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  if c.last_location_at is not null and c.last_location_at > now() - make_interval(secs => v_interval) then
    return false;
  end if;
  update public.couriers set last_lat = p_lat, last_lng = p_lng, last_location_at = now(), last_seen_at = now() where id = c.id;
  for r in
    select id from public.orders
    where courier_id = c.id and status in ('courier_assigned', 'picked_up', 'on_the_way')
  loop
    insert into public.courier_locations (courier_id, order_id, lat, lng, accuracy_m, heading, speed_mps)
    values (c.id, r.id, p_lat, p_lng, p_accuracy, p_heading, p_speed);
    insert into public.order_live_locations (order_id, courier_id, lat, lng, heading, updated_at)
    values (r.id, c.id, p_lat, p_lng, p_heading, now())
    on conflict (order_id) do update set courier_id = excluded.courier_id, lat = excluded.lat, lng = excluded.lng,
      heading = excluded.heading, updated_at = now();
  end loop;
  return true;
end;
$$;

create or replace function public.courier_report_incident(p_type public.incident_type, p_description text default null,
  p_lat double precision default null, p_lng double precision default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  v_serious boolean := p_type in ('accident', 'vehicle_breakdown', 'out_of_fuel', 'health_issue', 'security_issue');
  v_order uuid;
  v_id uuid;
begin
  perform public._rate_limit('incident:' || c.id, 10, 3600);
  select id into v_order from public.orders
  where courier_id = c.id and status in ('courier_assigned', 'picked_up', 'on_the_way')
  order by courier_assigned_at nulls last limit 1;
  insert into public.courier_incidents (courier_id, order_id, incident_type, description, lat, lng, made_unavailable)
  values (c.id, v_order, p_type, nullif(btrim(left(p_description, 1000)), ''), p_lat, p_lng, v_serious)
  returning id into v_id;
  if v_serious then
    update public.couriers set availability = 'unavailable' where id = c.id;
  end if;
  perform public._notify_admins('emergency',
    case when v_serious then 'ACİL: Kurye acil durum bildirdi' else 'Kurye bildirimi' end,
    format('%s — %s', c.display_name, p_type), jsonb_build_object('incident_id', v_id, 'courier_id', c.id, 'order_id', v_order));
  return v_id;
end;
$$;

create or replace function public.courier_add_delivery_proof(p_order_id uuid, p_storage_path text, p_mime text, p_size int,
  p_lat double precision default null, p_lng double precision default null)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
  o public.orders;
  v_id uuid;
begin
  select * into o from public.orders where id = p_order_id;
  if not found or o.courier_id is distinct from c.id or o.status not in ('picked_up', 'on_the_way', 'delivered') then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if split_part(p_storage_path, '/', 1) <> o.id::text or split_part(p_storage_path, '/', 2) <> c.id::text then
    raise exception 'KPD_INVALID_STORAGE_PATH' using errcode = '22023';
  end if;
  insert into public.delivery_proofs (order_id, courier_id, storage_path, mime_type, size_bytes, lat, lng)
  values (o.id, c.id, p_storage_path, p_mime, p_size, p_lat, p_lng)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.courier_earnings_summary(p_from timestamptz, p_to timestamptz)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers := public._require_active_courier();
begin
  return (
    select jsonb_build_object(
      'delivered_count', count(*),
      'delivery_fee_total', coalesce(sum(delivery_fee), 0),
      'distance_km_total', coalesce(sum(distance_km), 0),
      'rating_avg', c.rating_avg,
      'rating_count', c.rating_count
    )
    from public.orders
    where courier_id = c.id and status = 'delivered' and delivered_at >= p_from and delivered_at < p_to
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- QR teslimat doğrulama (yalnız service_role — verify-delivery-qr Edge Function HMAC doğruladıktan sonra çağırır)
-- Atomik tüketim: tek UPDATE ... WHERE consumed_at IS NULL — eşzamanlı iki istekten yalnız biri başarılı olur.
-- ---------------------------------------------------------------------------
create or replace function public.issue_delivery_qr(p_order_id uuid, p_customer_id uuid, p_nonce_hash text, p_ttl_minutes int)
returns public.qr_tokens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  o public.orders;
  t public.qr_tokens;
begin
  select * into o from public.orders where id = p_order_id and customer_id = p_customer_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if o.status not in ('courier_assigned', 'picked_up', 'on_the_way') or o.courier_id is null then
    raise exception 'KPD_QR_NOT_AVAILABLE' using errcode = 'P0001';
  end if;
  perform public._rate_limit('qr_issue:' || o.id, 30, 3600);
  update public.qr_tokens set revoked_at = now(), revoke_reason = 'reissued'
  where order_id = o.id and consumed_at is null and revoked_at is null;
  insert into public.qr_tokens (order_id, courier_id, nonce_hash, expires_at)
  values (o.id, o.courier_id, p_nonce_hash, now() + make_interval(mins => greatest(1, least(p_ttl_minutes, 120))))
  returning * into t;
  return t;
end;
$$;

create or replace function public.consume_delivery_qr(
  p_token_id uuid,
  p_order_id uuid,
  p_nonce_hash text,
  p_courier_user_id uuid,
  p_lat double precision,
  p_lng double precision,
  p_device jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.couriers;
  t public.qr_tokens;
  o public.orders;
  v_reason text;
begin
  select * into c from public.couriers where user_id = p_courier_user_id and status = 'active';
  if not found or not public.has_role(p_courier_user_id, 'courier') then
    v_reason := 'KPD_FORBIDDEN';
  else
    update public.qr_tokens set consumed_at = now(), consumed_by_courier_id = c.id
    where id = p_token_id and order_id = p_order_id and nonce_hash = p_nonce_hash
      and consumed_at is null and revoked_at is null and expires_at > now() and courier_id = c.id
    returning * into t;
    if not found then
      select * into t from public.qr_tokens where id = p_token_id;
      v_reason := case
        when t.id is null or t.order_id <> p_order_id or t.nonce_hash <> p_nonce_hash then 'KPD_QR_INVALID'
        when t.consumed_at is not null then 'KPD_QR_ALREADY_USED'
        when t.revoked_at is not null then 'KPD_QR_REVOKED'
        when t.expires_at <= now() then 'KPD_QR_EXPIRED'
        when t.courier_id <> c.id then 'KPD_QR_WRONG_COURIER'
        else 'KPD_QR_INVALID' end;
    end if;
  end if;

  if v_reason is not null then
    -- Hiçbir şey değişmedi; hata kaydı kalıcı olsun diye exception yerine sonuç döndürülür.
    perform public._log_event('edge_function', 'qr_validation_failure', 'warning', v_reason,
      jsonb_build_object('token_id', p_token_id, 'order_id', p_order_id, 'courier_user_id', p_courier_user_id));
    return jsonb_build_object('result', 'rejected', 'code', v_reason);
  end if;

  select * into o from public.orders where id = t.order_id for update;
  if o.courier_id is distinct from c.id then
    v_reason := 'KPD_QR_WRONG_COURIER';
  elsif o.status not in ('picked_up', 'on_the_way') then
    v_reason := 'KPD_QR_ORDER_STATE';
  end if;
  if v_reason is not null then
    -- Token tüketimi geri alınır (exception tüm işlemi geri sarar)
    raise exception '%', v_reason using errcode = 'P0001';
  end if;

  perform set_config('kapinda.actor_id', p_courier_user_id::text, true);
  if o.status = 'picked_up' then
    perform public._order_transition(o.id, 'on_the_way', 'courier', 'auto_before_qr');
  end if;
  update public.orders set delivered_lat = p_lat, delivered_lng = p_lng, delivered_device = p_device where id = o.id;
  perform set_config('kapinda.qr_verified_order', o.id::text, true);
  perform public._order_transition(o.id, 'delivered', 'qr_verification', null,
    jsonb_build_object('qr_token_id', t.id, 'lat', p_lat, 'lng', p_lng, 'device', p_device, 'courier_id', c.id));
  perform set_config('kapinda.qr_verified_order', '', true);
  perform public._audit('delivery_qr_verified', 'orders', o.id::text, jsonb_build_object('status', o.status),
    jsonb_build_object('status', 'delivered', 'courier_id', c.id, 'qr_token_id', t.id), null, p_lat, p_lng, p_device);
  perform set_config('kapinda.actor_id', '', true);
  return jsonb_build_object('result', 'delivered', 'order_id', o.id, 'order_number', o.order_number);
end;
$$;
