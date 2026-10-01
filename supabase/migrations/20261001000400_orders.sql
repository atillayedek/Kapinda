-- Adresler, teslimat ücret teklifleri, siparişler, durum makinesi tabloları, teslimat doğrulama

create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text check (label is null or char_length(label) <= 40),
  district_id uuid not null references public.districts(id),
  neighborhood text not null check (char_length(neighborhood) between 2 and 120),
  street text not null check (char_length(street) between 2 and 160),
  building text not null check (char_length(building) between 1 and 60),
  apartment text check (apartment is null or char_length(apartment) <= 80),
  floor text check (floor is null or char_length(floor) <= 10),
  door_number text check (door_number is null or char_length(door_number) <= 10),
  directions text check (directions is null or char_length(directions) <= 500),
  recipient_name text not null check (char_length(recipient_name) between 2 and 120),
  phone text not null,
  lat double precision not null check (lat between -90 and 90),
  lng double precision not null check (lng between -180 and 180),
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index addresses_user_idx on public.addresses (user_id) where deleted_at is null;
create unique index addresses_one_default on public.addresses (user_id) where is_default and deleted_at is null;
create trigger addresses_updated_at before update on public.addresses for each row execute function public.set_updated_at();
create trigger addresses_phone before insert or update of phone on public.addresses for each row execute function public.normalize_phone_column('phone');

-- İşletmeye ait adres defteri (telefon numarasıyla eşleşme)
create table public.customer_address_book (
  id uuid primary key default gen_random_uuid(),
  vendor_id uuid not null references public.vendors(id) on delete cascade,
  phone text not null,
  customer_name text check (customer_name is null or char_length(customer_name) <= 120),
  neighborhood text not null,
  street text not null,
  building text not null,
  apartment text,
  floor text,
  door_number text,
  directions text,
  lat double precision,
  lng double precision,
  fingerprint text not null,
  use_count int not null default 1,
  last_used_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vendor_id, phone, fingerprint)
);
create index customer_address_book_lookup_idx on public.customer_address_book (vendor_id, phone);
create trigger customer_address_book_updated_at before update on public.customer_address_book for each row execute function public.set_updated_at();
create trigger customer_address_book_phone before insert or update of phone on public.customer_address_book for each row execute function public.normalize_phone_column('phone');

-- Teslimat ücreti teklifleri (yalnız Edge Function üretir; sipariş bunlardan birine bağlanır)
create table public.delivery_fees (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  vendor_id uuid not null references public.vendors(id),
  address_id uuid not null references public.addresses(id),
  coverage_area_id uuid not null references public.coverage_areas(id),
  pricing_rule_version_id uuid not null references public.pricing_rule_versions(id),
  distance_km numeric(6,2) not null check (distance_km >= 0),
  distance_source text not null check (distance_source in ('google_maps', 'haversine_estimate')),
  fee numeric(10,2) not null check (fee >= 0),
  pricing_snapshot jsonb not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  order_id uuid,
  created_at timestamptz not null default now()
);
create index delivery_fees_customer_idx on public.delivery_fees (customer_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Siparişler
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  customer_id uuid not null references auth.users(id),
  vendor_id uuid not null references public.vendors(id),
  coverage_area_id uuid not null references public.coverage_areas(id),
  address_id uuid references public.addresses(id),
  delivery_fee_id uuid not null unique references public.delivery_fees(id),
  status public.order_status not null default 'pending_payment',
  courier_id uuid references public.couriers(id),
  customer_name text not null,
  customer_phone text not null,
  delivery_address jsonb not null,
  delivery_lat double precision not null,
  delivery_lng double precision not null,
  product_subtotal numeric(10,2) not null check (product_subtotal >= 0),
  delivery_fee numeric(10,2) not null check (delivery_fee >= 0),
  delivery_fee_payable numeric(10,2) not null check (delivery_fee_payable >= 0 and delivery_fee_payable <= delivery_fee),
  delivery_fee_waived boolean not null default false,
  loyalty_reward_id uuid,
  commission_estimate numeric(10,2) not null default 0 check (commission_estimate >= 0),
  item_count int not null check (item_count > 0),
  distance_km numeric(6,2) not null,
  distance_source text not null,
  pricing_snapshot jsonb not null,
  payment_state public.order_payment_state not null default 'pending',
  product_payment_method public.product_payment_method not null,
  customer_note text check (customer_note is null or char_length(customer_note) <= 500),
  age_confirmed_at timestamptz,
  tracking_token_hash text unique,
  tracking_token_expires_at timestamptz,
  cancel_reason text,
  vendor_visible_at timestamptz,
  payment_confirmed_at timestamptz,
  accepted_at timestamptz,
  preparing_at timestamptz,
  ready_at timestamptz,
  courier_assigned_at timestamptz,
  picked_up_at timestamptz,
  on_the_way_at timestamptz,
  delivered_at timestamptz,
  delivered_lat double precision,
  delivered_lng double precision,
  delivered_device jsonb,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (delivery_fee_waived = (delivery_fee_payable = 0 and delivery_fee > 0) or delivery_fee = 0)
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_vendor_status_idx on public.orders (vendor_id, status, created_at desc);
create index orders_courier_status_idx on public.orders (courier_id, status) where courier_id is not null;
create index orders_status_created_idx on public.orders (status, created_at desc);
create index orders_area_created_idx on public.orders (coverage_area_id, created_at desc);
create index orders_pool_idx on public.orders (coverage_area_id, status) where courier_id is null;
create trigger orders_updated_at before update on public.orders for each row execute function public.set_updated_at();

alter table public.delivery_fees add constraint delivery_fees_order_fk foreign key (order_id) references public.orders(id);
alter table public.courier_locations add constraint courier_locations_order_fk foreign key (order_id) references public.orders(id);
alter table public.courier_incidents add constraint courier_incidents_order_fk foreign key (order_id) references public.orders(id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid not null references public.products(id),
  product_name text not null,
  barcode text,
  unit text not null,
  unit_price numeric(10,2) not null check (unit_price > 0),
  quantity int not null check (quantity between 1 and 99),
  line_total numeric(10,2) not null check (line_total >= 0),
  is_age_restricted boolean not null default false,
  substitution_preference public.substitution_preference not null,
  fulfillment public.item_fulfillment not null default 'pending',
  substituted_from jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);
create trigger order_items_updated_at before update on public.order_items for each row execute function public.set_updated_at();

-- İzinli geçiş tablosu (contracts.json → orderTransitions ile aynı)
create table public.order_status_transitions (
  from_status public.order_status not null,
  to_status public.order_status not null,
  actor public.transition_actor not null,
  primary key (from_status, to_status, actor),
  check (to_status <> 'delivered' or actor = 'qr_verification')
);

insert into public.order_status_transitions (from_status, to_status, actor) values
  ('pending_payment', 'payment_confirmed', 'system'),
  ('pending_payment', 'failed', 'system'),
  ('pending_payment', 'cancelled', 'customer'),
  ('pending_payment', 'cancelled', 'system'),
  ('payment_confirmed', 'vendor_pending', 'system'),
  ('vendor_pending', 'vendor_accepted', 'vendor'),
  ('vendor_pending', 'rejected', 'vendor'),
  ('vendor_pending', 'cancelled', 'customer'),
  ('vendor_pending', 'cancelled', 'admin'),
  ('vendor_pending', 'cancelled', 'system'),
  ('vendor_accepted', 'preparing', 'vendor'),
  ('vendor_accepted', 'cancelled', 'vendor'),
  ('vendor_accepted', 'cancelled', 'admin'),
  ('preparing', 'ready_for_pickup', 'vendor'),
  ('preparing', 'cancelled', 'vendor'),
  ('preparing', 'cancelled', 'admin'),
  ('ready_for_pickup', 'courier_assigned', 'courier'),
  ('ready_for_pickup', 'courier_assigned', 'admin'),
  ('ready_for_pickup', 'courier_assigned', 'system'),
  ('ready_for_pickup', 'cancelled', 'admin'),
  ('courier_assigned', 'picked_up', 'courier'),
  ('courier_assigned', 'ready_for_pickup', 'courier'),
  ('courier_assigned', 'ready_for_pickup', 'admin'),
  ('courier_assigned', 'ready_for_pickup', 'system'),
  ('courier_assigned', 'cancelled', 'admin'),
  ('picked_up', 'on_the_way', 'courier'),
  ('picked_up', 'failed', 'admin'),
  ('on_the_way', 'delivered', 'qr_verification'),
  ('on_the_way', 'failed', 'admin');

create trigger order_status_transitions_immutable before update or delete on public.order_status_transitions
  for each row execute function public.prevent_mutation();

create table public.order_status_history (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders(id),
  previous_status public.order_status,
  new_status public.order_status not null,
  actor_id uuid,
  actor_role public.transition_actor not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index order_status_history_order_idx on public.order_status_history (order_id, created_at);
create trigger order_status_history_no_update before update on public.order_status_history for each row execute function public.prevent_mutation();
create trigger order_status_history_no_delete before delete on public.order_status_history for each row execute function public.prevent_mutation();
create trigger order_status_history_no_truncate before truncate on public.order_status_history for each statement execute function public.prevent_mutation();

create table public.order_assignments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  courier_id uuid not null references public.couriers(id),
  assigned_by uuid references auth.users(id),
  assignment_type text not null check (assignment_type in ('self_accept', 'admin_assign', 'transfer')),
  status text not null default 'active' check (status in ('active', 'released', 'transferred', 'completed', 'cancelled')),
  capacity_override boolean not null default false,
  assigned_at timestamptz not null default now(),
  ended_at timestamptz,
  end_reason text
);
create unique index order_assignments_one_active on public.order_assignments (order_id) where status = 'active';
create index order_assignments_courier_idx on public.order_assignments (courier_id, status);

create table public.order_transfers (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  from_courier_id uuid references public.couriers(id),
  to_courier_id uuid references public.couriers(id),
  transfer_type text not null check (transfer_type in ('reassign', 'return_to_pool', 'courier_release')),
  transferred_by uuid references auth.users(id),
  reason text not null check (char_length(reason) between 3 and 1000),
  capacity_override boolean not null default false,
  created_at timestamptz not null default now()
);
create index order_transfers_order_idx on public.order_transfers (order_id, created_at);

-- Müşterinin canlı takip ekranı için yalnız aktif teslimatta güncellenen konum (Realtime yayını bu tablodadır)
create table public.order_live_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  courier_id uuid references public.couriers(id),
  lat double precision,
  lng double precision,
  heading real,
  updated_at timestamptz not null default now()
);

-- QR teslimat doğrulama tokenları — ham token/nonce saklanmaz, yalnız nonce hash'i
create table public.qr_tokens (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  courier_id uuid not null references public.couriers(id),
  nonce_hash text not null check (nonce_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_courier_id uuid references public.couriers(id),
  revoked_at timestamptz,
  revoke_reason text,
  created_at timestamptz not null default now()
);
create index qr_tokens_order_idx on public.qr_tokens (order_id, created_at desc);
create unique index qr_tokens_one_consumed_per_order on public.qr_tokens (order_id) where consumed_at is not null;

create table public.delivery_proofs (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id),
  courier_id uuid not null references public.couriers(id),
  storage_path text not null unique,
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 5242880),
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index delivery_proofs_order_idx on public.delivery_proofs (order_id);
