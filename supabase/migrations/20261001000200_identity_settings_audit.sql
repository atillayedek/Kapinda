-- Kimlik, roller, onaylar, ayarlar, audit, rate limit, gözlemlenebilirlik

-- ---------------------------------------------------------------------------
-- Profiller
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '' check (char_length(full_name) <= 120),
  email text check (email is null or char_length(email) <= 254),
  phone text,
  avatar_path text check (avatar_path is null or char_length(avatar_path) <= 300),
  referral_code text not null unique check (referral_code ~ '^[A-Z0-9]{8}$'),
  consents_complete boolean not null default false,
  is_blocked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index profiles_phone_idx on public.profiles (phone) where phone is not null;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger profiles_phone before insert or update of phone on public.profiles for each row execute function public.normalize_phone_column('phone');

-- ---------------------------------------------------------------------------
-- Roller (bağımsız tablo)
-- ---------------------------------------------------------------------------
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  granted_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
create index user_roles_role_idx on public.user_roles (role);

-- SECURITY DEFINER: RLS politikaları içinden çağrıldığında user_roles RLS'ini tetiklemez (recursion yok).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role);
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null and public.has_role(auth.uid(), 'admin');
$$;

-- ---------------------------------------------------------------------------
-- Yasal dokümanlar ve kullanıcı onayları
-- ---------------------------------------------------------------------------
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null check (document_type in ('kvkk', 'acik_riza', 'kullanici_sozlesmesi', 'cerez_politikasi', 'mesafeli_satis')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}(\.[0-9]+)?$'),
  title text not null,
  content text not null,
  is_current boolean not null default false,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (document_type, version)
);
create unique index legal_documents_one_current on public.legal_documents (document_type) where is_current;

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_type text not null,
  document_version text not null,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text,
  unique (user_id, document_type, document_version),
  foreign key (document_type, document_version) references public.legal_documents (document_type, version)
);

create table public.required_consents (
  document_type text primary key
);
insert into public.required_consents (document_type) values ('kvkk'), ('acik_riza'), ('kullanici_sozlesmesi');

-- ---------------------------------------------------------------------------
-- Ayarlar (kod değiştirmeden yönetilebilir iş parametreleri)
-- ---------------------------------------------------------------------------
create table public.settings (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  value jsonb not null,
  category text not null check (category in ('operasyon', 'teslimat', 'calisma_saatleri', 'minimum_sepet', 'fiyatlandirma', 'sadakat', 'destek', 'bildirim', 'seo', 'uyumluluk', 'kurye', 'komisyon', 'odeme')),
  description text not null,
  value_type text not null check (value_type in ('boolean', 'number', 'string', 'object')),
  min_value numeric,
  max_value numeric,
  is_public boolean not null default false,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

create or replace function public.setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select value from public.settings where key = p_key;
$$;

create or replace function public.setting_numeric(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::numeric from public.settings where key = p_key), p_default);
$$;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce((select (value #>> '{}')::boolean from public.settings where key = p_key), p_default);
$$;

-- ---------------------------------------------------------------------------
-- Değiştirilemez audit log
-- ---------------------------------------------------------------------------
create table public.admin_audit_logs (
  id bigint generated always as identity primary key,
  event_id uuid not null default gen_random_uuid() unique,
  actor_id uuid,
  actor_role text,
  action text not null,
  resource text not null,
  resource_id text,
  previous_value jsonb,
  new_value jsonb,
  reason text,
  ip inet,
  user_agent text,
  request_id text,
  lat double precision,
  lng double precision,
  device jsonb,
  created_at timestamptz not null default now()
);
create index admin_audit_logs_created_idx on public.admin_audit_logs (created_at desc);
create index admin_audit_logs_resource_idx on public.admin_audit_logs (resource, resource_id);
create index admin_audit_logs_actor_idx on public.admin_audit_logs (actor_id);

create or replace function public.prevent_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'KPD_IMMUTABLE_RECORD' using errcode = '42501', hint = tg_table_name;
end;
$$;

create trigger admin_audit_logs_no_update before update on public.admin_audit_logs for each row execute function public.prevent_mutation();
create trigger admin_audit_logs_no_delete before delete on public.admin_audit_logs for each row execute function public.prevent_mutation();
create trigger admin_audit_logs_no_truncate before truncate on public.admin_audit_logs for each statement execute function public.prevent_mutation();

create or replace function public.primary_role(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    (select role::text from public.user_roles where user_id = p_user_id
      order by case role when 'admin' then 1 when 'vendor' then 2 when 'courier' then 3 else 4 end limit 1),
    case when p_user_id is null then 'system' else 'customer' end
  );
$$;

-- İç kullanım: audit kaydı yaz.
create or replace function public._audit(
  p_action text,
  p_resource text,
  p_resource_id text,
  p_previous jsonb,
  p_new jsonb,
  p_reason text,
  p_lat double precision default null,
  p_lng double precision default null,
  p_device jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_event uuid;
  v_actor uuid := coalesce(auth.uid(), nullif(current_setting('kapinda.actor_id', true), '')::uuid);
begin
  insert into public.admin_audit_logs (actor_id, actor_role, action, resource, resource_id, previous_value, new_value,
    reason, ip, user_agent, request_id, lat, lng, device)
  values (v_actor, public.primary_role(v_actor), p_action, p_resource, p_resource_id, p_previous, p_new,
    p_reason, public.request_ip(), left(public.request_header('user-agent'), 500),
    coalesce(public.request_header('x-request-id'), public.request_header('sb-request-id'), public.request_header('cf-ray')),
    p_lat, p_lng, p_device)
  returning event_id into v_event;
  return v_event;
end;
$$;

-- Admin tarafından doğrudan yönetilen referans tablolar için satır değişiklik audit'i
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._audit(
    lower(tg_op),
    tg_table_name,
    coalesce((case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'id',
             (case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end) ->> 'key'),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    nullif(current_setting('kapinda.audit_reason', true), '')
  );
  return coalesce(new, old);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rate limiting (sabit pencere)
-- ---------------------------------------------------------------------------
create table public.rate_limit_buckets (
  bucket_key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (bucket_key, window_start)
);

create or replace function public._rate_limit(p_key text, p_max int, p_window_seconds int)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into public.rate_limit_buckets (bucket_key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (bucket_key, window_start) do update set hits = public.rate_limit_buckets.hits + 1
  returning hits into v_hits;
  if v_hits > p_max then
    raise exception 'KPD_RATE_LIMITED' using errcode = 'P0001', hint = p_window_seconds::text;
  end if;
end;
$$;

-- Edge Function'ların kullanması için (service_role)
create or replace function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._rate_limit(p_key, p_max, p_window_seconds);
  return true;
exception when others then
  if sqlerrm = 'KPD_RATE_LIMITED' then
    return false;
  end if;
  raise;
end;
$$;

-- ---------------------------------------------------------------------------
-- Gözlemlenebilirlik (hassas veri içermez)
-- ---------------------------------------------------------------------------
create table public.app_error_events (
  id bigint generated always as identity primary key,
  source text not null check (source in ('customer_web', 'admin_web', 'courier_android', 'vendor_windows', 'edge_function', 'database')),
  event_type text not null check (event_type in (
    'payment_failure', 'edge_function_failure', 'fcm_failure', 'order_transition_error', 'authorization_rejection',
    'realtime_failure', 'courier_tracking_failure', 'qr_validation_failure', 'support_failure', 'email_failure',
    'maps_failure', 'address_book_failure', 'client_error', 'storage_failure')),
  severity text not null default 'error' check (severity in ('info', 'warning', 'error', 'critical')),
  message text not null check (char_length(message) <= 1000),
  context jsonb not null default '{}'::jsonb,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index app_error_events_created_idx on public.app_error_events (created_at desc);
create index app_error_events_type_idx on public.app_error_events (event_type, created_at desc);

create or replace function public._log_event(p_source text, p_type text, p_severity text, p_message text, p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.app_error_events (source, event_type, severity, message, context, user_id)
  values (p_source, p_type, p_severity, left(p_message, 1000), coalesce(p_context, '{}'::jsonb) - 'phone' - 'email' - 'token' - 'password', auth.uid());
end;
$$;

-- İstemci hata raporu (rate limited, hassas alanlar ayıklanır)
create or replace function public.log_client_event(p_source text, p_type text, p_severity text, p_message text, p_context jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_source not in ('customer_web', 'admin_web', 'courier_android', 'vendor_windows') then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  perform public._rate_limit('client_event:' || coalesce(auth.uid()::text, coalesce(host(public.request_ip()), 'anon')), 30, 60);
  if jsonb_typeof(coalesce(p_context, '{}'::jsonb)) <> 'object' or length(coalesce(p_context, '{}'::jsonb)::text) > 4000 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  perform public._log_event(p_source, p_type, p_severity, p_message, p_context);
end;
$$;

-- ---------------------------------------------------------------------------
-- Yeni kullanıcı → profil + customer rolü + (varsa) onaylar ve referans
-- ---------------------------------------------------------------------------
create or replace function public._generate_referral_code()
returns text
language plpgsql
volatile
set search_path = public, extensions, pg_temp
as $$
declare
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_code text;
  v_bytes bytea;
begin
  loop
    v_bytes := extensions.gen_random_bytes(8);
    v_code := '';
    for i in 0..7 loop
      v_code := v_code || substr(v_alphabet, (get_byte(v_bytes, i) % 32) + 1, 1);
    end loop;
    exit when not exists (select 1 from public.profiles where referral_code = v_code);
  end loop;
  return v_code;
end;
$$;

create or replace function public._record_consents(p_user_id uuid, p_consents jsonb)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_doc record;
  v_version text;
  v_complete boolean := true;
begin
  for v_doc in
    select rc.document_type, ld.version
    from public.required_consents rc
    left join public.legal_documents ld on ld.document_type = rc.document_type and ld.is_current
  loop
    v_version := p_consents ->> v_doc.document_type;
    if v_doc.version is not null and v_version = v_doc.version then
      insert into public.user_consents (user_id, document_type, document_version, ip, user_agent)
      values (p_user_id, v_doc.document_type, v_version, public.request_ip(), left(public.request_header('user-agent'), 500))
      on conflict (user_id, document_type, document_version) do nothing;
    end if;
    if not exists (
      select 1 from public.user_consents uc
      where uc.user_id = p_user_id and uc.document_type = v_doc.document_type and uc.document_version = v_doc.version
    ) then
      v_complete := false;
    end if;
  end loop;
  update public.profiles set consents_complete = v_complete where id = p_user_id;
  return v_complete;
end;
$$;
