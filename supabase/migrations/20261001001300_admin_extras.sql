-- Admin paneli için ek RPC'ler: ürün moderasyonu, bildirim istatistikleri, bülten kuyruğu, kategori yönetimi

create or replace function public.admin_set_product_active(p_product_id uuid, p_active boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  p public.products;
begin
  perform public._require_admin();
  select * into p from public.products where id = p_product_id for update;
  if not found then
    raise exception 'KPD_NOT_FOUND' using errcode = 'P0002';
  end if;
  update public.products set is_active = p_active where id = p.id;
  perform public._audit('set_product_active', 'products', p.id::text, jsonb_build_object('is_active', p.is_active),
    jsonb_build_object('is_active', p_active), v_reason);
end;
$$;

create or replace function public.admin_notification_stats(p_hours int default 24)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'by_status', (select coalesce(jsonb_object_agg(push_status, c), '{}'::jsonb) from (
      select push_status, count(*) c from public.notifications
      where created_at > now() - make_interval(hours => greatest(1, least(p_hours, 720))) group by push_status) s),
    'by_app', (select coalesce(jsonb_object_agg(app, c), '{}'::jsonb) from (
      select app, count(*) c from public.notifications
      where created_at > now() - make_interval(hours => greatest(1, least(p_hours, 720))) group by app) s),
    'active_devices', (select coalesce(jsonb_object_agg(app, c), '{}'::jsonb) from (
      select app, count(*) c from public.device_tokens where revoked_at is null group by app) s)
  );
end;
$$;

-- Bülten/duyuru e-postası kuyruğa alınır (yalnız aktif aboneler; bastırma listesi gönderimde ayrıca kontrol edilir)
create or replace function public.admin_queue_newsletter(p_topic text, p_subject text, p_body text, p_reason text)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
  v_count int;
begin
  perform public._require_admin();
  if p_topic not in ('newsletter', 'announcements') or char_length(coalesce(p_subject, '')) < 3
     or char_length(coalesce(p_body, '')) < 10 or char_length(p_body) > 20000 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  insert into public.email_outbox (to_email, user_id, category, template, data, subscription_id)
  select s.email, s.user_id, 'marketing', case when p_topic = 'newsletter' then 'newsletter' else 'announcement' end,
    jsonb_build_object('subject', btrim(p_subject), 'body', p_body), s.id
  from public.email_subscriptions s
  where s.topic = p_topic and s.status = 'subscribed'
    and not exists (select 1 from public.email_suppressions x where x.email = s.email);
  get diagnostics v_count = row_count;
  perform public._audit('queue_newsletter', 'email_outbox', null, null,
    jsonb_build_object('topic', p_topic, 'subject', p_subject, 'recipients', v_count), v_reason);
  return v_count;
end;
$$;

create or replace function public.admin_add_email_suppression(p_email text, p_scope text, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reason text := public._require_reason(p_reason);
begin
  perform public._require_admin();
  if p_scope not in ('marketing', 'all') then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  insert into public.email_suppressions (email, reason, scope) values (lower(btrim(p_email)), 'manual', p_scope)
  on conflict (email) do update set scope = excluded.scope, reason = 'manual';
  perform public._audit('add_email_suppression', 'email_suppressions', lower(btrim(p_email)), null,
    jsonb_build_object('scope', p_scope), v_reason);
end;
$$;

-- Kullanıcının kendi bülten aboneliği
create or replace function public.set_my_newsletter(p_subscribed boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'KPD_AUTH_REQUIRED' using errcode = '42501';
  end if;
  select email into v_email from public.profiles where id = auth.uid();
  insert into public.email_subscriptions (email, user_id, topic, status, unsubscribed_at)
  values (v_email, auth.uid(), 'newsletter', case when p_subscribed then 'subscribed' else 'unsubscribed' end,
    case when p_subscribed then null else now() end)
  on conflict (email, topic) do update set status = excluded.status, user_id = auth.uid(),
    unsubscribed_at = excluded.unsubscribed_at, subscribed_at = case when p_subscribed then now() else public.email_subscriptions.subscribed_at end;
  if p_subscribed then
    delete from public.email_suppressions where email = v_email and reason = 'unsubscribe';
  end if;
  update public.notification_preferences set marketing_email = p_subscribed where user_id = auth.uid();
end;
$$;

-- Müşterinin sadakat/referans özeti
create or replace function public.my_loyalty_summary()
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'referral_code', (select referral_code from public.profiles where id = auth.uid()),
    'delivered_orders', (select count(*) from public.orders where customer_id = auth.uid() and status = 'delivered'),
    'order_milestone', public.setting_numeric('sadakat.order_milestone', 5),
    'referral_milestone', public.setting_numeric('sadakat.referral_milestone', 5),
    'referrals_total', (select count(*) from public.referrals where referrer_id = auth.uid()),
    'referrals_qualified', (select count(*) from public.referrals where referrer_id = auth.uid() and has_ordered),
    'available_rewards', (select count(*) from public.loyalty_rewards where user_id = auth.uid() and status = 'available')
  );
$$;

-- Başvuru alındı e-postası
create or replace function public.applications_received_email()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.email_outbox (to_email, user_id, category, template, data)
  values (new.email, new.applicant_user_id, 'transactional',
    case when tg_table_name = 'vendor_applications' then 'vendor_application_received' else 'courier_application_received' end,
    '{}'::jsonb);
  perform public._notify_admins('application_new', 'Yeni başvuru',
    case when tg_table_name = 'vendor_applications' then 'Yeni esnaf başvurusu alındı.' else 'Yeni kurye başvurusu alındı.' end,
    jsonb_build_object('application_id', new.id, 'kind', tg_table_name));
  return new;
end;
$$;
create trigger vendor_applications_received after insert on public.vendor_applications for each row execute function public.applications_received_email();
create trigger courier_applications_received after insert on public.courier_applications for each row execute function public.applications_received_email();

revoke execute on function public.admin_set_product_active(uuid, boolean, text), public.admin_notification_stats(int),
  public.admin_queue_newsletter(text, text, text, text), public.admin_add_email_suppression(text, text, text),
  public.set_my_newsletter(boolean), public.my_loyalty_summary(), public.applications_received_email() from public, anon;
grant execute on function public.admin_set_product_active(uuid, boolean, text), public.admin_notification_stats(int),
  public.admin_queue_newsletter(text, text, text, text), public.admin_add_email_suppression(text, text, text),
  public.set_my_newsletter(boolean), public.my_loyalty_summary() to authenticated;
revoke execute on function public.applications_received_email() from authenticated;
