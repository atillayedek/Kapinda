-- Ödemeler, komisyon, mutabakat, sadakat, referans, puanlama, destek, bildirim, e-posta, SEO, sağlık

-- ---------------------------------------------------------------------------
-- Ödemeler (yalnız TESLİMAT ÜCRETİ online tahsil edilir)
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  provider text not null default 'iyzico' check (provider in ('iyzico')),
  purpose text not null default 'delivery_fee' check (purpose = 'delivery_fee'),
  amount numeric(10,2) not null check (amount > 0),
  currency text not null default 'TRY' check (currency = 'TRY'),
  status public.payment_status not null default 'initiated',
  conversation_id text not null unique,
  idempotency_key text not null unique,
  provider_token text unique,
  provider_payment_id text unique,
  provider_response jsonb,
  failure_reason text,
  paid_at timestamptz,
  refund_requested_at timestamptz,
  refunded_at timestamptz,
  provider_refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_order_idx on public.payments (order_id, created_at desc);
create unique index payments_one_succeeded_per_order on public.payments (order_id) where status = 'succeeded';
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

-- Webhook/callback olayları (idempotency)
create table public.payment_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments(id),
  provider_event_key text not null unique,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,
  received_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Platform komisyonu (satılan uygun kalem başına sabit tutar, sunucuda hesaplanır)
-- ---------------------------------------------------------------------------
create table public.platform_commissions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id),
  vendor_id uuid not null references public.vendors(id),
  coverage_area_id uuid not null references public.coverage_areas(id),
  eligible_item_count int not null check (eligible_item_count >= 0),
  unit_amount numeric(10,2) not null check (unit_amount >= 0),
  basis text not null check (basis in ('per_line', 'per_unit')),
  total_amount numeric(10,2) not null check (total_amount >= 0),
  product_gmv numeric(10,2) not null check (product_gmv >= 0),
  snapshot jsonb not null,
  settlement_id uuid,
  delivered_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index platform_commissions_vendor_idx on public.platform_commissions (vendor_id, delivered_at);
create trigger platform_commissions_immutable before update of order_id, vendor_id, eligible_item_count, unit_amount, basis, total_amount, product_gmv, snapshot, delivered_at
  on public.platform_commissions for each row execute function public.prevent_mutation();
create trigger platform_commissions_no_delete before delete on public.platform_commissions for each row execute function public.prevent_mutation();

create table public.vendor_settlements (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id),
  period_start date not null,
  period_end date not null,
  order_count int not null default 0,
  product_gmv numeric(12,2) not null default 0,
  commission_total numeric(12,2) not null default 0,
  adjustment_total numeric(12,2) not null default 0,
  payable_amount numeric(12,2) not null default 0,
  status public.settlement_status not null default 'draft',
  snapshot jsonb not null default '{}'::jsonb,
  note text,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  check (period_end >= period_start)
);
create unique index vendor_settlements_period_uidx on public.vendor_settlements (vendor_id, period_start, period_end) where status <> 'cancelled';
create trigger vendor_settlements_updated_at before update on public.vendor_settlements for each row execute function public.set_updated_at();
alter table public.platform_commissions add constraint platform_commissions_settlement_fk foreign key (settlement_id) references public.vendor_settlements(id);

create table public.settlement_adjustments (
  id uuid primary key default gen_random_uuid(),
  settlement_id uuid not null references public.vendor_settlements(id),
  amount numeric(12,2) not null check (amount <> 0),
  reason text not null check (char_length(reason) between 10 and 1000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
create trigger settlement_adjustments_immutable before update or delete on public.settlement_adjustments for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Sadakat ve referans
-- ---------------------------------------------------------------------------
create table public.loyalty_rewards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reward_type text not null default 'free_delivery' check (reward_type = 'free_delivery'),
  source text not null check (source in ('order_milestone', 'referral_milestone')),
  source_ref text not null unique,
  status text not null default 'available' check (status in ('available', 'reserved', 'used', 'revoked')),
  order_id uuid references public.orders(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  used_at timestamptz
);
create index loyalty_rewards_user_idx on public.loyalty_rewards (user_id, status);
create trigger loyalty_rewards_updated_at before update on public.loyalty_rewards for each row execute function public.set_updated_at();
alter table public.orders add constraint orders_loyalty_reward_fk foreign key (loyalty_reward_id) references public.loyalty_rewards(id);

create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references auth.users(id) on delete cascade,
  referred_id uuid not null unique references auth.users(id) on delete cascade,
  referral_code text not null,
  has_ordered boolean not null default false,
  qualified_order_id uuid references public.orders(id),
  qualified_at timestamptz,
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);
create index referrals_referrer_idx on public.referrals (referrer_id, has_ordered);

-- has_ordered yalnız sunucu fonksiyonu tarafından (bayrakla) değiştirilebilir
create or replace function public.referrals_guard()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(current_setting('kapinda.referral_update', true), '') <> 'on' then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if old.referrer_id <> new.referrer_id or old.referred_id <> new.referred_id or old.referral_code <> new.referral_code then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if old.has_ordered and not new.has_ordered then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger referrals_guard before update on public.referrals for each row execute function public.referrals_guard();
create trigger referrals_no_delete before delete on public.referrals for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Puanlama
-- ---------------------------------------------------------------------------
create table public.ratings (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  rater_id uuid not null references auth.users(id),
  target_type text not null check (target_type in ('vendor', 'courier')),
  vendor_id uuid references public.vendors(id),
  courier_id uuid references public.couriers(id),
  score smallint not null check (score between 1 and 5),
  comment text check (comment is null or char_length(comment) <= 500),
  created_at timestamptz not null default now(),
  unique (order_id, target_type),
  check ((target_type = 'vendor' and vendor_id is not null and courier_id is null)
      or (target_type = 'courier' and courier_id is not null and vendor_id is null))
);
create index ratings_vendor_idx on public.ratings (vendor_id, created_at desc) where vendor_id is not null;
create index ratings_courier_idx on public.ratings (courier_id, created_at desc) where courier_id is not null;
create trigger ratings_no_update before update on public.ratings for each row execute function public.prevent_mutation();
create trigger ratings_no_delete before delete on public.ratings for each row execute function public.prevent_mutation();

-- Aggregate, satır kilidiyle (UPDATE) transaction-safe güncellenir
create or replace function public.ratings_update_aggregate()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.target_type = 'vendor' then
    update public.vendors
    set rating_avg = round(((rating_avg * rating_count) + new.score) / (rating_count + 1), 2),
        rating_count = rating_count + 1
    where id = new.vendor_id;
  else
    update public.couriers
    set rating_avg = round(((rating_avg * rating_count) + new.score) / (rating_count + 1), 2),
        rating_count = rating_count + 1
    where id = new.courier_id;
  end if;
  return new;
end;
$$;
create trigger ratings_aggregate after insert on public.ratings for each row execute function public.ratings_update_aggregate();

-- ---------------------------------------------------------------------------
-- Destek
-- ---------------------------------------------------------------------------
create table public.support_conversations (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  order_id uuid references public.orders(id),
  subject text not null check (char_length(subject) between 3 and 160),
  status public.support_status not null default 'open',
  assigned_admin_id uuid references auth.users(id),
  last_message_at timestamptz not null default now(),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index support_conversations_customer_idx on public.support_conversations (customer_id, last_message_at desc);
create index support_conversations_status_idx on public.support_conversations (status, last_message_at desc);
create trigger support_conversations_updated_at before update on public.support_conversations for each row execute function public.set_updated_at();

create table public.support_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.support_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id),
  sender_role text not null check (sender_role in ('customer', 'admin')),
  body text not null check (char_length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index support_messages_conversation_idx on public.support_messages (conversation_id, created_at);
create trigger support_messages_no_update before update on public.support_messages for each row execute function public.prevent_mutation();

-- ---------------------------------------------------------------------------
-- Bildirimler ve cihazlar
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  app public.device_app not null,
  type text not null check (char_length(type) <= 60),
  title text not null check (char_length(title) <= 120),
  body text not null check (char_length(body) <= 500),
  data jsonb not null default '{}'::jsonb,
  push_status text not null default 'pending' check (push_status in ('pending', 'processing', 'sent', 'failed', 'skipped')),
  push_attempts int not null default 0,
  push_error text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_push_pending_idx on public.notifications (created_at) where push_status = 'pending';

create table public.device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null unique check (char_length(token) between 20 and 4096),
  app public.device_app not null,
  platform public.device_platform not null,
  device_id text check (device_id is null or char_length(device_id) <= 200),
  device_name text check (device_name is null or char_length(device_name) <= 200),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index device_tokens_user_idx on public.device_tokens (user_id, app) where revoked_at is null;

create table public.notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  order_updates_push boolean not null default true,
  order_updates_email boolean not null default true,
  marketing_push boolean not null default false,
  marketing_email boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger notification_preferences_updated_at before update on public.notification_preferences for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- E-posta
-- ---------------------------------------------------------------------------
create table public.email_subscriptions (
  id uuid primary key default gen_random_uuid(),
  email text not null check (char_length(email) <= 254),
  user_id uuid references auth.users(id) on delete set null,
  topic text not null check (topic in ('newsletter', 'announcements')),
  status text not null default 'subscribed' check (status in ('subscribed', 'unsubscribed')),
  subscribed_at timestamptz not null default now(),
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (email, topic)
);
create trigger email_subscriptions_updated_at before update on public.email_subscriptions for each row execute function public.set_updated_at();

create table public.email_suppressions (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  reason text not null check (reason in ('unsubscribe', 'bounce', 'complaint', 'manual')),
  scope text not null default 'marketing' check (scope in ('marketing', 'all')),
  created_at timestamptz not null default now()
);

create table public.email_outbox (
  id uuid primary key default gen_random_uuid(),
  to_email text not null,
  user_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('transactional', 'marketing')),
  template text not null check (template in (
    'order_received', 'order_delivered', 'order_cancelled', 'vendor_application_received', 'vendor_application_result',
    'courier_application_received', 'courier_application_result', 'support_reply', 'announcement', 'newsletter')),
  data jsonb not null default '{}'::jsonb,
  subscription_id uuid references public.email_subscriptions(id),
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed', 'suppressed')),
  attempts int not null default 0,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index email_outbox_pending_idx on public.email_outbox (created_at) where status = 'pending';

-- ---------------------------------------------------------------------------
-- SEO ve sistem sağlığı
-- ---------------------------------------------------------------------------
create table public.seo_checks (
  id uuid primary key default gen_random_uuid(),
  trigger_source text not null check (trigger_source in ('manual', 'scheduled')),
  robots_ok boolean,
  sitemap_ok boolean,
  url_count int,
  error_count int not null default 0,
  index_protection_ok boolean,
  search_engines jsonb not null default '{}'::jsonb,
  details jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);
create index seo_checks_started_idx on public.seo_checks (started_at desc);

create table public.seo_error_logs (
  id uuid primary key default gen_random_uuid(),
  check_id uuid references public.seo_checks(id),
  url text not null,
  error_code public.seo_error_code not null,
  message text not null,
  recommendation text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'ignored')),
  detected_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index seo_error_logs_status_idx on public.seo_error_logs (status, detected_at desc);
create unique index seo_error_logs_open_uidx on public.seo_error_logs (url, error_code) where status = 'open';

create table public.system_health_checks (
  id bigint generated always as identity primary key,
  service text not null check (service in ('supabase', 'edge_functions', 'storage', 'fcm', 'maps', 'iyzico', 'resend')),
  status public.health_status not null,
  is_critical boolean not null,
  latency_ms int,
  message text,
  checked_at timestamptz not null default now()
);
create index system_health_checks_service_idx on public.system_health_checks (service, checked_at desc);
