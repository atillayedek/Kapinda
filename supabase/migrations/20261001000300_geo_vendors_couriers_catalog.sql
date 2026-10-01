-- Bölge hiyerarşisi, fiyatlandırma, işletmeler, kuryeler, katalog

-- ---------------------------------------------------------------------------
-- Bölge hiyerarşisi: il → ilçe → hizmet bölgesi (Hopa koda gömülü değildir)
-- ---------------------------------------------------------------------------
create table public.provinces (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  plate_code smallint unique check (plate_code between 1 and 81),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger provinces_updated_at before update on public.provinces for each row execute function public.set_updated_at();

create table public.districts (
  id uuid primary key default gen_random_uuid(),
  province_id uuid not null references public.provinces(id),
  name text not null,
  slug text not null check (slug ~ '^[a-z0-9-]+$'),
  postal_code text check (postal_code ~ '^[0-9]{5}$'),
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (province_id, slug)
);
create trigger districts_updated_at before update on public.districts for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Teslimat fiyatlandırma kuralları (versiyonlu, versiyonlar değiştirilemez)
-- ---------------------------------------------------------------------------
create table public.pricing_rules (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  description text,
  current_version_id uuid,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger pricing_rules_updated_at before update on public.pricing_rules for each row execute function public.set_updated_at();

create table public.pricing_rule_versions (
  id uuid primary key default gen_random_uuid(),
  pricing_rule_id uuid not null references public.pricing_rules(id),
  version int not null check (version > 0),
  base_fee numeric(10,2) not null check (base_fee >= 0),
  base_distance_km numeric(6,2) not null check (base_distance_km >= 0),
  per_km_fee numeric(10,2) not null check (per_km_fee >= 0),
  max_distance_km numeric(6,2) not null check (max_distance_km > 0 and max_distance_km <= 100),
  km_rounding text not null default 'ceil' check (km_rounding in ('ceil')),
  created_by uuid references auth.users(id),
  change_reason text,
  created_at timestamptz not null default now(),
  unique (pricing_rule_id, version)
);
create trigger pricing_rule_versions_immutable before update or delete on public.pricing_rule_versions
  for each row execute function public.prevent_mutation();

alter table public.pricing_rules
  add constraint pricing_rules_current_version_fk foreign key (current_version_id) references public.pricing_rule_versions(id);

-- Fiyat hesaplama — TEK otorite. 0..base_km → base_fee, sonrası her (yukarı yuvarlanmış) km için per_km_fee.
create or replace function public.compute_delivery_fee(p_version_id uuid, p_distance_km numeric)
returns numeric
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v public.pricing_rule_versions;
begin
  select * into v from public.pricing_rule_versions where id = p_version_id;
  if not found then
    raise exception 'KPD_PRICING_NOT_FOUND' using errcode = 'P0001';
  end if;
  if p_distance_km is null or p_distance_km < 0 then
    raise exception 'KPD_INVALID_INPUT' using errcode = '22023';
  end if;
  if p_distance_km > v.max_distance_km then
    raise exception 'KPD_OUT_OF_RANGE' using errcode = 'P0001', hint = v.max_distance_km::text;
  end if;
  if p_distance_km <= v.base_distance_km then
    return v.base_fee;
  end if;
  return v.base_fee + ceil(p_distance_km - v.base_distance_km) * v.per_km_fee;
end;
$$;

create table public.coverage_areas (
  id uuid primary key default gen_random_uuid(),
  district_id uuid not null references public.districts(id),
  name text not null,
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  center_lat double precision not null check (center_lat between -90 and 90),
  center_lng double precision not null check (center_lng between -180 and 180),
  max_radius_km numeric(6,2) not null check (max_radius_km > 0 and max_radius_km <= 100),
  min_basket_amount numeric(10,2) not null check (min_basket_amount >= 0),
  pricing_rule_id uuid not null references public.pricing_rules(id),
  opens_at time not null,
  closes_at time not null,
  timezone text not null default 'Europe/Istanbul',
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (opens_at <> closes_at)
);
create index coverage_areas_district_idx on public.coverage_areas (district_id);
create trigger coverage_areas_updated_at before update on public.coverage_areas for each row execute function public.set_updated_at();

create or replace function public.coverage_area_is_open(p_area_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  a public.coverage_areas;
  v_local time;
begin
  select * into a from public.coverage_areas where id = p_area_id;
  if not found or not a.is_active then
    return false;
  end if;
  v_local := (p_at at time zone a.timezone)::time;
  if a.opens_at < a.closes_at then
    return v_local >= a.opens_at and v_local < a.closes_at;
  end if;
  return v_local >= a.opens_at or v_local < a.closes_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- İşletmeler
-- ---------------------------------------------------------------------------
create table public.vendor_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  business_name text not null check (char_length(business_name) between 2 and 160),
  business_type text not null check (business_type in ('market', 'tekel', 'manav', 'kasap', 'firin', 'kuruyemis', 'sarkuteri', 'diger')),
  owner_name text not null check (char_length(owner_name) between 2 and 120),
  tax_number text not null check (tax_number ~ '^[0-9]{10,11}$'),
  phone text not null,
  email text not null check (char_length(email) <= 254),
  district_id uuid not null references public.districts(id),
  address text not null check (char_length(address) between 5 and 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  status public.application_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  vendor_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index vendor_applications_one_pending on public.vendor_applications (applicant_user_id) where status = 'pending';
create trigger vendor_applications_updated_at before update on public.vendor_applications for each row execute function public.set_updated_at();
create trigger vendor_applications_phone before insert or update of phone on public.vendor_applications for each row execute function public.normalize_phone_column('phone');

create table public.vendors (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  name text not null check (char_length(name) between 2 and 160),
  business_type text not null check (business_type in ('market', 'tekel', 'manav', 'kasap', 'firin', 'kuruyemis', 'sarkuteri', 'diger')),
  description text check (description is null or char_length(description) <= 1000),
  logo_path text,
  cover_path text,
  phone text not null,
  email text,
  tax_number text not null check (tax_number ~ '^[0-9]{10,11}$'),
  address_text text not null,
  lat double precision check (lat between -90 and 90),
  lng double precision check (lng between -180 and 180),
  coverage_area_id uuid not null references public.coverage_areas(id),
  status public.approval_status not null default 'pending',
  is_open boolean not null default false,
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count int not null default 0 check (rating_count >= 0),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index vendors_area_status_idx on public.vendors (coverage_area_id, status) where deleted_at is null;
create trigger vendors_updated_at before update on public.vendors for each row execute function public.set_updated_at();
create trigger vendors_phone before insert or update of phone on public.vendors for each row execute function public.normalize_phone_column('phone');

alter table public.vendor_applications add constraint vendor_applications_vendor_fk foreign key (vendor_id) references public.vendors(id);

create table public.vendor_members (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null default 'owner' check (member_role in ('owner', 'staff')),
  created_at timestamptz not null default now(),
  unique (vendor_id, user_id)
);
create index vendor_members_user_idx on public.vendor_members (user_id);

create table public.vendor_hours (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  weekday smallint not null check (weekday between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (vendor_id, weekday),
  check (is_closed or (opens_at is not null and closes_at is not null and opens_at <> closes_at))
);
create trigger vendor_hours_updated_at before update on public.vendor_hours for each row execute function public.set_updated_at();

-- Üyelik kontrolü (aktif vendor rolüyle birlikte)
create or replace function public.is_vendor_member(p_vendor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
    and public.has_role(auth.uid(), 'vendor')
    and exists (select 1 from public.vendor_members vm where vm.vendor_id = p_vendor_id and vm.user_id = auth.uid());
$$;

create or replace function public.vendor_is_open_now(p_vendor_id uuid, p_at timestamptz default now())
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v public.vendors;
  h public.vendor_hours;
  v_tz text;
  v_local timestamp;
begin
  select * into v from public.vendors where id = p_vendor_id;
  if not found or v.status <> 'active' or not v.is_open or v.deleted_at is not null then
    return false;
  end if;
  if not public.coverage_area_is_open(v.coverage_area_id, p_at) then
    return false;
  end if;
  select timezone into v_tz from public.coverage_areas where id = v.coverage_area_id;
  v_local := p_at at time zone v_tz;
  select * into h from public.vendor_hours where vendor_id = p_vendor_id and weekday = extract(dow from v_local)::smallint;
  if not found then
    return true; -- işletmeye özel saat tanımlı değilse bölge saatleri geçerlidir
  end if;
  if h.is_closed then
    return false;
  end if;
  if h.opens_at < h.closes_at then
    return v_local::time >= h.opens_at and v_local::time < h.closes_at;
  end if;
  return v_local::time >= h.opens_at or v_local::time < h.closes_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Kuryeler
-- ---------------------------------------------------------------------------
create table public.courier_applications (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  full_name text not null check (char_length(full_name) between 2 and 120),
  phone text not null,
  email text not null check (char_length(email) <= 254),
  district_id uuid not null references public.districts(id),
  vehicle_type text not null check (vehicle_type in ('motosiklet', 'bisiklet', 'otomobil', 'yaya')),
  has_license boolean not null default false,
  notes text check (notes is null or char_length(notes) <= 1000),
  status public.application_status not null default 'pending',
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  review_note text,
  courier_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index courier_applications_one_pending on public.courier_applications (applicant_user_id) where status = 'pending';
create trigger courier_applications_updated_at before update on public.courier_applications for each row execute function public.set_updated_at();
create trigger courier_applications_phone before insert or update of phone on public.courier_applications for each row execute function public.normalize_phone_column('phone');

create table public.couriers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  display_name text not null check (char_length(display_name) between 2 and 120),
  phone text not null,
  vehicle_type text not null check (vehicle_type in ('motosiklet', 'bisiklet', 'otomobil', 'yaya')),
  vehicle_plate text check (vehicle_plate is null or char_length(vehicle_plate) <= 16),
  coverage_area_id uuid not null references public.coverage_areas(id),
  status public.approval_status not null default 'pending',
  availability public.courier_availability not null default 'offline',
  max_active_orders int not null default 1 check (max_active_orders between 1 and 10),
  active_order_count int not null default 0 check (active_order_count >= 0),
  last_lat double precision,
  last_lng double precision,
  last_location_at timestamptz,
  last_seen_at timestamptz,
  rating_avg numeric(3,2) not null default 0 check (rating_avg between 0 and 5),
  rating_count int not null default 0 check (rating_count >= 0),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index couriers_area_availability_idx on public.couriers (coverage_area_id, availability) where status = 'active';
create trigger couriers_updated_at before update on public.couriers for each row execute function public.set_updated_at();
create trigger couriers_phone before insert or update of phone on public.couriers for each row execute function public.normalize_phone_column('phone');

alter table public.courier_applications add constraint courier_applications_courier_fk foreign key (courier_id) references public.couriers(id);

create or replace function public.current_courier_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select c.id from public.couriers c
  where c.user_id = auth.uid() and public.has_role(auth.uid(), 'courier');
$$;

create table public.courier_locations (
  id bigint generated always as identity primary key,
  courier_id uuid not null references public.couriers(id),
  order_id uuid,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  accuracy_m real check (accuracy_m is null or accuracy_m >= 0),
  heading real,
  speed_mps real,
  recorded_at timestamptz not null default now()
);
create index courier_locations_courier_time_idx on public.courier_locations (courier_id, recorded_at desc);
create index courier_locations_order_idx on public.courier_locations (order_id, recorded_at desc) where order_id is not null;

create table public.courier_incidents (
  id uuid primary key default gen_random_uuid(),
  courier_id uuid not null references public.couriers(id),
  order_id uuid,
  incident_type public.incident_type not null,
  description text check (description is null or char_length(description) <= 1000),
  lat double precision,
  lng double precision,
  made_unavailable boolean not null default false,
  status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
  acknowledged_by uuid references auth.users(id),
  acknowledged_at timestamptz,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index courier_incidents_status_idx on public.courier_incidents (status, created_at desc);
create trigger courier_incidents_updated_at before update on public.courier_incidents for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Katalog
-- ---------------------------------------------------------------------------
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories(id),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  icon text check (icon is null or char_length(icon) <= 40),
  sort_order int not null default 0,
  is_age_restricted boolean not null default false,
  is_online_sale_allowed boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger categories_updated_at before update on public.categories for each row execute function public.set_updated_at();
create trigger categories_audit after insert or update or delete on public.categories for each row execute function public.audit_row_change();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id),
  category_id uuid not null references public.categories(id),
  name text not null check (char_length(name) between 2 and 160),
  description text check (description is null or char_length(description) <= 2000),
  barcode text check (barcode is null or barcode ~ '^[0-9]{13}$'),
  price numeric(10,2) not null check (price > 0 and price <= 100000),
  unit text not null default 'adet' check (unit in ('adet', 'kg', 'lt', 'paket', 'demet')),
  track_stock boolean not null default true,
  stock_quantity int check (stock_quantity is null or stock_quantity >= 0),
  is_active boolean not null default true,
  is_age_restricted boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (not track_stock or stock_quantity is not null)
);
create unique index products_vendor_barcode_uidx on public.products (vendor_id, barcode) where barcode is not null and deleted_at is null;
create index products_vendor_category_idx on public.products (vendor_id, category_id) where deleted_at is null and is_active;
create index products_barcode_idx on public.products (barcode) where barcode is not null and deleted_at is null;
create index products_name_search_idx on public.products using gin (to_tsvector('simple', name));
create trigger products_updated_at before update on public.products for each row execute function public.set_updated_at();

-- EAN-13 kontrol hanesi doğrulaması
create or replace function public.is_valid_ean13(p_code text)
returns boolean
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  v_sum int := 0;
begin
  if p_code is null or p_code !~ '^[0-9]{13}$' then
    return false;
  end if;
  for i in 1..12 loop
    v_sum := v_sum + substr(p_code, i, 1)::int * (case when i % 2 = 1 then 1 else 3 end);
  end loop;
  return (10 - (v_sum % 10)) % 10 = substr(p_code, 13, 1)::int;
end;
$$;

alter table public.products add constraint products_barcode_ean13 check (barcode is null or public.is_valid_ean13(barcode));

-- Ürün yaş kısıtı kategoriden devralınır (kategori kısıtlıysa ürün de kısıtlıdır)
create or replace function public.products_enforce_category_flags()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  c public.categories;
begin
  select * into c from public.categories where id = new.category_id;
  if c.is_age_restricted then
    new.is_age_restricted := true;
  end if;
  return new;
end;
$$;
create trigger products_category_flags before insert or update of category_id, is_age_restricted on public.products
  for each row execute function public.products_enforce_category_flags();

create table public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  storage_path text not null check (char_length(storage_path) <= 300),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  unique (product_id, storage_path)
);
create index product_images_product_idx on public.product_images (product_id, sort_order);

create or replace function public.product_images_vendor_match()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not exists (select 1 from public.products where id = new.product_id and vendor_id = new.vendor_id) then
    raise exception 'KPD_FORBIDDEN' using errcode = '42501';
  end if;
  if split_part(new.storage_path, '/', 1) <> new.vendor_id::text then
    raise exception 'KPD_INVALID_STORAGE_PATH' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger product_images_vendor_match before insert or update on public.product_images
  for each row execute function public.product_images_vendor_match();
