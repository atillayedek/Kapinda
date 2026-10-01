-- Realtime yayını ve Storage bucket/politikaları

-- Realtime (postgres_changes) abonelere satırı yalnız RLS SELECT politikası izin veriyorsa gönderir.
-- Yayına yalnız gerekli tablolar eklenir. order_transfers, courier_locations, qr_tokens, payments YAYINLANMAZ.
-- Konum yalnız order_live_locations üzerinden ve yalnız ilgili siparişin müşterisine/kuryesine/admin'e akar.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.orders,
      public.order_live_locations,
      public.support_messages,
      public.support_conversations,
      public.notifications,
      public.courier_incidents;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Storage
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('product-images', 'product-images', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('vendor-assets', 'vendor-assets', true, 3145728, array['image/jpeg', 'image/png', 'image/webp']),
  ('delivery-proofs', 'delivery-proofs', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ürün görselleri: yol = {vendor_id}/{product_id}/{dosya}
create policy "product images public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "product images vendor write" on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));
create policy "product images vendor update" on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and public.is_vendor_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'product-images' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));
create policy "product images vendor delete" on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));

-- İşletme logo/kapak: yol = {vendor_id}/{dosya}
create policy "vendor assets public read" on storage.objects for select to anon, authenticated
  using (bucket_id = 'vendor-assets');
create policy "vendor assets vendor write" on storage.objects for insert to authenticated
  with check (bucket_id = 'vendor-assets' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));
create policy "vendor assets vendor update" on storage.objects for update to authenticated
  using (bucket_id = 'vendor-assets' and public.is_vendor_member(((storage.foldername(name))[1])::uuid))
  with check (bucket_id = 'vendor-assets' and public.is_vendor_member(((storage.foldername(name))[1])::uuid));

-- Teslimat kanıtı (PRIVATE): yol = {order_id}/{courier_id}/{dosya}
-- Yükleme: yalnız siparişe atanmış aktif kurye. Okuma (signed URL üretimi): admin, siparişin müşterisi, yükleyen kurye.
create or replace function public.can_upload_delivery_proof(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_parts text[] := string_to_array(p_name, '/');
  v_order uuid;
  v_courier uuid;
begin
  if array_length(v_parts, 1) <> 3 then
    return false;
  end if;
  begin
    v_order := v_parts[1]::uuid;
    v_courier := v_parts[2]::uuid;
  exception when others then
    return false;
  end;
  return v_courier = public.current_courier_id()
    and exists (select 1 from public.orders o where o.id = v_order and o.courier_id = v_courier
                and o.status in ('picked_up', 'on_the_way', 'delivered'))
    and exists (select 1 from public.couriers c where c.id = v_courier and c.status = 'active');
end;
$$;

create or replace function public.can_read_delivery_proof(p_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_order uuid;
begin
  begin
    v_order := split_part(p_name, '/', 1)::uuid;
  exception when others then
    return false;
  end;
  return public.is_admin()
    or exists (select 1 from public.orders o where o.id = v_order and o.customer_id = auth.uid())
    or split_part(p_name, '/', 2) = coalesce(public.current_courier_id()::text, '-');
end;
$$;

revoke execute on function public.can_upload_delivery_proof(text), public.can_read_delivery_proof(text) from public, anon;
grant execute on function public.can_upload_delivery_proof(text), public.can_read_delivery_proof(text) to authenticated;

create policy "delivery proofs courier upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'delivery-proofs' and public.can_upload_delivery_proof(name));
create policy "delivery proofs read" on storage.objects for select to authenticated
  using (bucket_id = 'delivery-proofs' and public.can_read_delivery_proof(name));
