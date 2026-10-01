-- Kapında — temel tipler ve yardımcı fonksiyonlar
-- Enum değerleri packages/shared-contracts/contracts.json ile birebir aynıdır (supabase/tests/00_contracts.sql doğrular).

create extension if not exists pgcrypto with schema extensions;

create type public.app_role as enum ('admin', 'courier', 'vendor', 'customer');

create type public.order_status as enum (
  'pending_payment', 'payment_confirmed', 'vendor_pending', 'vendor_accepted', 'preparing',
  'ready_for_pickup', 'courier_assigned', 'picked_up', 'on_the_way', 'delivered',
  'cancelled', 'rejected', 'failed'
);

create type public.transition_actor as enum ('system', 'customer', 'vendor', 'courier', 'admin', 'qr_verification');
create type public.payment_status as enum ('initiated', 'pending', 'succeeded', 'failed', 'refund_pending', 'refunded');
create type public.order_payment_state as enum ('pending', 'paid', 'failed', 'not_required', 'refund_pending', 'refunded');
create type public.product_payment_method as enum ('cash', 'card_on_delivery');
create type public.substitution_preference as enum ('find_alternative', 'notify_and_cancel', 'remove');
create type public.item_fulfillment as enum ('pending', 'fulfilled', 'substituted', 'removed');
create type public.incident_type as enum (
  'accident', 'vehicle_breakdown', 'out_of_fuel', 'health_issue', 'security_issue', 'road_blocked', 'other'
);
create type public.courier_availability as enum ('offline', 'available', 'busy', 'unavailable');
create type public.approval_status as enum ('pending', 'active', 'suspended', 'rejected');
create type public.application_status as enum ('pending', 'approved', 'rejected');
create type public.support_status as enum ('open', 'waiting', 'resolved');
create type public.settlement_status as enum ('draft', 'approved', 'paid', 'cancelled');
create type public.device_app as enum ('customer', 'courier', 'vendor', 'admin');
create type public.device_platform as enum ('web', 'android', 'windows');
create type public.seo_error_code as enum (
  'SITEMAP_FETCH_FAILED', 'INVALID_XML', 'HTTP_ERROR', 'CANONICAL_MISMATCH',
  'ROBOTS_BLOCKED', 'NOINDEX_DETECTED', 'DUPLICATE_URL', 'MISSING_METADATA'
);
create type public.health_status as enum ('operational', 'degraded', 'unavailable');

-- updated_at otomatik güncelleme
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Türkiye telefon normalizasyonu — OTORİTE implementasyon.
-- Canonical: +90XXXXXXXXXX. packages/shared-validation/src/phone.ts aynı kuralları uygular
-- ve iki implementasyon packages/shared-validation/test/phone-vectors.json ile test edilir.
create or replace function public.normalize_tr_phone(p_input text)
returns text
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_trimmed text;
  v_has_plus boolean;
  v_digits text;
begin
  if p_input is null then
    return null;
  end if;
  v_trimmed := btrim(p_input);
  if v_trimmed = '' then
    return null;
  end if;
  if v_trimmed !~ '^[0-9[:space:]+().-]+$' then
    return null;
  end if;
  v_has_plus := left(v_trimmed, 1) = '+';
  v_digits := regexp_replace(v_trimmed, '[^0-9]', '', 'g');

  if v_has_plus then
    if left(v_digits, 2) <> '90' then
      return null;
    end if;
    v_digits := substr(v_digits, 3);
  elsif left(v_digits, 4) = '0090' then
    v_digits := substr(v_digits, 5);
  elsif length(v_digits) = 12 and left(v_digits, 2) = '90' then
    v_digits := substr(v_digits, 3);
  elsif length(v_digits) = 11 and left(v_digits, 1) = '0' then
    v_digits := substr(v_digits, 2);
  end if;

  if v_digits !~ '^[2-58][0-9]{9}$' then
    return null;
  end if;
  return '+90' || v_digits;
end;
$$;

-- Telefon kolonları için ortak trigger fonksiyonu: TG_ARGV[0] kolon adı.
-- Geçersiz numara hata verir; NULL serbesttir (kolon NOT NULL ise tablo kısıtı yakalar).
create or replace function public.normalize_phone_column()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_col text := tg_argv[0];
  v_raw text;
  v_norm text;
begin
  v_raw := to_jsonb(new) ->> v_col;
  if v_raw is null or btrim(v_raw) = '' then
    new := jsonb_populate_record(new, jsonb_build_object(v_col, null));
    return new;
  end if;
  v_norm := public.normalize_tr_phone(v_raw);
  if v_norm is null then
    raise exception 'KPD_INVALID_PHONE' using errcode = '22023', hint = v_col;
  end if;
  new := jsonb_populate_record(new, jsonb_build_object(v_col, v_norm));
  return new;
end;
$$;

-- Mesafe (km) — Haversine. Google Maps erişilemezse tahmini mesafe için kullanılır.
create or replace function public.haversine_km(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
set search_path = public, pg_temp
as $$
  select 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- URL-güvenli rastgele token
create or replace function public.random_token(p_bytes int default 24)
returns text
language sql
volatile
set search_path = public, extensions, pg_temp
as $$
  select translate(rtrim(encode(extensions.gen_random_bytes(p_bytes), 'base64'), '='), '+/', '-_');
$$;

create or replace function public.sha256_hex(p_input text)
returns text
language sql
immutable
set search_path = public, extensions, pg_temp
as $$
  select encode(extensions.digest(convert_to(p_input, 'UTF8'), 'sha256'), 'hex');
$$;

-- İstek meta verisi (PostgREST request.headers GUC)
create or replace function public.request_header(p_name text)
returns text
language sql
stable
set search_path = public, pg_temp
as $$
  select nullif(current_setting('request.headers', true), '')::json ->> lower(p_name);
$$;

create or replace function public.request_ip()
returns inet
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v text := coalesce(public.request_header('cf-connecting-ip'), split_part(public.request_header('x-forwarded-for'), ',', 1));
begin
  if v is null or btrim(v) = '' then
    return null;
  end if;
  return btrim(v)::inet;
exception when others then
  return null;
end;
$$;
