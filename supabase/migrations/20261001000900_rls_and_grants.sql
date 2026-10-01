-- Row Level Security ve ayrıcalıklar
-- İlke: VARSAYILAN RED. Tüm tablolarda RLS açık; API rollerinden tüm ayrıcalıklar alınır,
-- yalnız gereken SELECT/INSERT/UPDATE (çoğu zaman kolon bazında) yeniden verilir.
-- Kritik yazımlar (durum, tutar, rol, onay, QR, komisyon, sadakat) yalnız SECURITY DEFINER RPC'lerle yapılır.

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t.tablename);
    execute format('revoke all on table public.%I from anon, authenticated', t.tablename);
  end loop;
end $$;

-- SECURITY DEFINER fonksiyonlar tablo sahibi (postgres) olarak çalışır; sahip RLS'e tabi değildir (FORCE kullanılmaz).
-- service_role BYPASSRLS'tir (yalnız Edge Function'lar, istemci paketine asla girmez).

revoke all on all sequences in schema public from anon, authenticated;

-- Fonksiyonlar: varsayılan olarak kimse çalıştıramaz; aşağıda açıkça izin verilir.
revoke execute on all functions in schema public from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;

-- RLS politikalarında kullanılan yardımcılar
grant execute on function
  public.has_role(uuid, public.app_role),
  public.is_admin(),
  public.is_vendor_member(uuid),
  public.current_courier_id(),
  public.can_view_order(uuid)
to anon, authenticated;

-- Herkese açık okumalar
grant execute on function
  public.normalize_tr_phone(text),
  public.public_track_order(text),
  public.vendor_is_open_now(uuid, timestamptz),
  public.coverage_area_is_open(uuid, timestamptz),
  public.log_client_event(text, text, text, text, jsonb)
to anon, authenticated;

-- Kimliği doğrulanmış kullanıcı RPC'leri (her fonksiyon kendi içinde rol/sahiplik doğrular)
grant execute on function
  public.accept_legal_documents(jsonb),
  public.my_sessions(),
  public.revoke_session(uuid),
  public.create_order(uuid, jsonb, public.product_payment_method, text, boolean),
  public.customer_cancel_order(uuid, text),
  public.rotate_tracking_token(uuid),
  public.get_order_tracking(uuid),
  public.submit_rating(uuid, text, int, text),
  public.create_support_conversation(text, text, uuid),
  public.send_support_message(uuid, text),
  public.set_support_status(uuid, public.support_status),
  public.register_device_token(text, public.device_app, public.device_platform, text, text),
  public.revoke_device_token(text),
  public.mark_notifications_read(uuid[]),
  public.vendor_update_order_status(uuid, public.order_status, text),
  public.vendor_mark_item_unavailable(uuid, uuid, int),
  public.vendor_address_book_lookup(uuid, text),
  public.vendor_sales_summary(uuid, timestamptz, timestamptz),
  public.courier_set_online(boolean),
  public.courier_available_orders(),
  public.courier_accept_order(uuid),
  public.courier_release_order(uuid, text),
  public.courier_update_order_status(uuid, public.order_status),
  public.courier_update_location(double precision, double precision, real, real, real),
  public.courier_report_incident(public.incident_type, text, double precision, double precision),
  public.courier_add_delivery_proof(uuid, text, text, int, double precision, double precision),
  public.courier_earnings_summary(timestamptz, timestamptz),
  public.admin_grant_role(uuid, public.app_role, text),
  public.admin_revoke_role(uuid, public.app_role, text),
  public.admin_set_user_blocked(uuid, boolean, text),
  public.admin_approve_vendor_application(uuid, uuid, double precision, double precision, text),
  public.admin_approve_courier_application(uuid, uuid, int, text, text),
  public.admin_reject_application(text, uuid, text),
  public.admin_set_vendor_status(uuid, public.approval_status, text),
  public.admin_set_courier(uuid, public.approval_status, int, text),
  public.admin_assign_courier(uuid, uuid, text, boolean),
  public.admin_return_to_pool(uuid, text),
  public.admin_override_status(uuid, public.order_status, text),
  public.admin_update_incident(uuid, text, text),
  public.admin_update_setting(text, jsonb, text),
  public.admin_create_pricing_version(uuid, numeric, numeric, numeric, numeric, text),
  public.admin_upsert_coverage_area(uuid, uuid, text, text, double precision, double precision, numeric, numeric, uuid, time, time, boolean, text),
  public.admin_generate_settlement(uuid, date, date),
  public.admin_add_settlement_adjustment(uuid, numeric, text),
  public.admin_set_settlement_status(uuid, public.settlement_status, text),
  public.admin_dashboard_stats(timestamptz, timestamptz),
  public.admin_finance_report(timestamptz, timestamptz, uuid, uuid),
  public.admin_live_operations(),
  public.admin_list_users(text, int, int),
  public.admin_broadcast_notification(public.device_app, text, text, text)
to authenticated;

-- Yalnız Edge Function'lar (service_role)
grant execute on function
  public.create_delivery_fee_quote(uuid, uuid, uuid, numeric, text),
  public.begin_delivery_payment(uuid, uuid),
  public.attach_payment_token(uuid, text),
  public.confirm_delivery_payment(uuid, text, numeric, jsonb),
  public.fail_delivery_payment(uuid, text, jsonb),
  public.mark_payment_refunded(uuid, text, jsonb),
  public.expire_pending_payments(),
  public.issue_delivery_qr(uuid, uuid, text, int),
  public.consume_delivery_qr(uuid, uuid, text, uuid, double precision, double precision, jsonb),
  public.check_rate_limit(text, int, int),
  public._log_event(text, text, text, text, jsonb),
  public.bootstrap_first_admin(text)
to service_role;

-- ---------------------------------------------------------------------------
-- Politikalar
-- ---------------------------------------------------------------------------

-- profiles
grant select on public.profiles to authenticated;
grant update (full_name, phone, avatar_path) on public.profiles to authenticated;
create policy profiles_select_own on public.profiles for select to authenticated using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- user_roles: yalnız okuma (kendi rolleri / admin hepsi). Yazma yalnız RPC.
grant select on public.user_roles to authenticated;
create policy user_roles_select on public.user_roles for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- legal_documents: herkese açık
grant select on public.legal_documents to anon, authenticated;
create policy legal_documents_public on public.legal_documents for select to anon, authenticated using (true);

grant select on public.required_consents to anon, authenticated;
create policy required_consents_public on public.required_consents for select to anon, authenticated using (true);

grant select on public.user_consents to authenticated;
create policy user_consents_select on public.user_consents for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- settings: herkese açık olanlar okunabilir; yazma yalnız admin RPC
grant select on public.settings to anon, authenticated;
create policy settings_public on public.settings for select to anon, authenticated using (is_public or public.is_admin());

-- audit: yalnız admin okur; kimse güncelleyemez/silemez (trigger)
grant select on public.admin_audit_logs to authenticated;
create policy audit_admin_select on public.admin_audit_logs for select to authenticated using (public.is_admin());

grant select on public.app_error_events to authenticated;
create policy app_error_events_admin on public.app_error_events for select to authenticated using (public.is_admin());

-- Bölge hiyerarşisi ve fiyatlandırma: aktif olanlar herkese açık
grant select on public.provinces, public.districts, public.coverage_areas, public.pricing_rules, public.pricing_rule_versions to anon, authenticated;
create policy provinces_public on public.provinces for select to anon, authenticated using (is_active or public.is_admin());
create policy districts_public on public.districts for select to anon, authenticated using (is_active or public.is_admin());
create policy coverage_areas_public on public.coverage_areas for select to anon, authenticated using (is_active or public.is_admin());
create policy pricing_rules_public on public.pricing_rules for select to anon, authenticated using (is_active or public.is_admin());
create policy pricing_rule_versions_public on public.pricing_rule_versions for select to anon, authenticated
  using (exists (select 1 from public.pricing_rules pr where pr.current_version_id = pricing_rule_versions.id and pr.is_active) or public.is_admin());

-- Admin il/ilçe yönetimi (doğrudan, audit tetikleyicili)
grant insert, update on public.provinces, public.districts to authenticated;
create policy provinces_admin_write on public.provinces for insert to authenticated with check (public.is_admin());
create policy provinces_admin_update on public.provinces for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy districts_admin_write on public.districts for insert to authenticated with check (public.is_admin());
create policy districts_admin_update on public.districts for update to authenticated using (public.is_admin()) with check (public.is_admin());
create trigger provinces_audit after insert or update on public.provinces for each row execute function public.audit_row_change();
create trigger districts_audit after insert or update on public.districts for each row execute function public.audit_row_change();

-- vendors
grant select on public.vendors to anon, authenticated;
grant update (description, phone, email, is_open, logo_path, cover_path) on public.vendors to authenticated;
create policy vendors_public on public.vendors for select to anon, authenticated
  using ((status = 'active' and deleted_at is null) or public.is_vendor_member(id) or public.is_admin());
create policy vendors_member_update on public.vendors for update to authenticated
  using (public.is_vendor_member(id) and status = 'active') with check (public.is_vendor_member(id) and status = 'active');

grant select on public.vendor_members to authenticated;
create policy vendor_members_select on public.vendor_members for select to authenticated using (user_id = auth.uid() or public.is_admin());

grant select on public.vendor_hours to anon, authenticated;
grant insert, update, delete on public.vendor_hours to authenticated;
create policy vendor_hours_public on public.vendor_hours for select to anon, authenticated using (true);
create policy vendor_hours_member_insert on public.vendor_hours for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy vendor_hours_member_update on public.vendor_hours for update to authenticated
  using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
create policy vendor_hours_member_delete on public.vendor_hours for delete to authenticated using (public.is_vendor_member(vendor_id));

-- Başvurular: kullanıcı yalnız kendi adına ve yalnız izinli kolonlarla oluşturur (status/review alanları istemciye kapalı)
grant select on public.vendor_applications, public.courier_applications to authenticated;
grant insert (applicant_user_id, business_name, business_type, owner_name, tax_number, phone, email, district_id, address, notes)
  on public.vendor_applications to authenticated;
grant insert (applicant_user_id, full_name, phone, email, district_id, vehicle_type, has_license, notes)
  on public.courier_applications to authenticated;
create policy vendor_applications_select on public.vendor_applications for select to authenticated
  using (applicant_user_id = auth.uid() or public.is_admin());
create policy vendor_applications_insert on public.vendor_applications for insert to authenticated
  with check (applicant_user_id = auth.uid() and status = 'pending' and reviewed_by is null and vendor_id is null);
create policy courier_applications_select on public.courier_applications for select to authenticated
  using (applicant_user_id = auth.uid() or public.is_admin());
create policy courier_applications_insert on public.courier_applications for insert to authenticated
  with check (applicant_user_id = auth.uid() and status = 'pending' and reviewed_by is null and courier_id is null);

-- couriers: kendi kaydı / admin. Yazma yalnız RPC.
grant select on public.couriers to authenticated;
create policy couriers_select on public.couriers for select to authenticated using (user_id = auth.uid() or public.is_admin());

-- courier_locations: yalnız admin okur (müşteri yalnız order_live_locations üzerinden kendi siparişini görür)
grant select on public.courier_locations to authenticated;
create policy courier_locations_admin on public.courier_locations for select to authenticated using (public.is_admin());

grant select on public.courier_incidents to authenticated;
create policy courier_incidents_select on public.courier_incidents for select to authenticated
  using (courier_id = public.current_courier_id() or public.is_admin());

-- Katalog
grant select on public.categories to anon, authenticated;
grant insert, update on public.categories to authenticated;
create policy categories_public on public.categories for select to anon, authenticated using (is_active or public.is_admin());
create policy categories_admin_insert on public.categories for insert to authenticated with check (public.is_admin());
create policy categories_admin_update on public.categories for update to authenticated using (public.is_admin()) with check (public.is_admin());

grant select on public.products to anon, authenticated;
grant insert (vendor_id, category_id, name, description, barcode, price, unit, track_stock, stock_quantity, is_active, is_age_restricted)
  on public.products to authenticated;
grant update (category_id, name, description, barcode, price, unit, track_stock, stock_quantity, is_active, is_age_restricted, deleted_at)
  on public.products to authenticated;
create policy products_public on public.products for select to anon, authenticated
  using (
    (is_active and deleted_at is null and exists (select 1 from public.vendors v where v.id = vendor_id and v.status = 'active' and v.deleted_at is null))
    or public.is_vendor_member(vendor_id) or public.is_admin()
  );
create policy products_member_insert on public.products for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy products_member_update on public.products for update to authenticated
  using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));

grant select on public.product_images to anon, authenticated;
grant insert (product_id, vendor_id, storage_path, sort_order), delete on public.product_images to authenticated;
grant update (sort_order) on public.product_images to authenticated;
create policy product_images_public on public.product_images for select to anon, authenticated using (true);
create policy product_images_member_insert on public.product_images for insert to authenticated with check (public.is_vendor_member(vendor_id));
create policy product_images_member_update on public.product_images for update to authenticated
  using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));
create policy product_images_member_delete on public.product_images for delete to authenticated using (public.is_vendor_member(vendor_id));

-- Adresler: yalnız sahibi (silme = deleted_at)
grant select on public.addresses to authenticated;
grant insert (user_id, label, district_id, neighborhood, street, building, apartment, floor, door_number, directions,
  recipient_name, phone, lat, lng, is_default) on public.addresses to authenticated;
grant update (label, district_id, neighborhood, street, building, apartment, floor, door_number, directions,
  recipient_name, phone, lat, lng, is_default, deleted_at) on public.addresses to authenticated;
create policy addresses_select on public.addresses for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy addresses_insert on public.addresses for insert to authenticated with check (user_id = auth.uid());
create policy addresses_update on public.addresses for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- İşletme adres defteri
grant select on public.customer_address_book to authenticated;
grant update (customer_name, directions, lat, lng) on public.customer_address_book to authenticated;
create policy address_book_select on public.customer_address_book for select to authenticated
  using (public.is_vendor_member(vendor_id) or public.is_admin());
create policy address_book_update on public.customer_address_book for update to authenticated
  using (public.is_vendor_member(vendor_id)) with check (public.is_vendor_member(vendor_id));

-- Teslimat ücreti teklifleri: müşteri kendi tekliflerini okur; oluşturma yalnız service_role
grant select on public.delivery_fees to authenticated;
create policy delivery_fees_select on public.delivery_fees for select to authenticated using (customer_id = auth.uid() or public.is_admin());

-- Siparişler: yazma YOK (yalnız RPC). Okuma: müşteri kendi; işletme ödeme sonrası kendi; kurye atanmış; admin.
grant select on public.orders to authenticated;
create policy orders_select on public.orders for select to authenticated using (
  customer_id = auth.uid()
  or public.is_admin()
  or (vendor_visible_at is not null and public.is_vendor_member(vendor_id))
  or (courier_id is not null and courier_id = public.current_courier_id())
);

grant select on public.order_items, public.order_status_history to authenticated;
create policy order_items_select on public.order_items for select to authenticated using (public.can_view_order(order_id));
create policy order_status_history_select on public.order_status_history for select to authenticated using (public.can_view_order(order_id));

grant select on public.order_status_transitions to anon, authenticated;
create policy order_status_transitions_public on public.order_status_transitions for select to anon, authenticated using (true);

grant select on public.order_assignments, public.order_transfers to authenticated;
create policy order_assignments_select on public.order_assignments for select to authenticated
  using (courier_id = public.current_courier_id() or public.is_admin());
create policy order_transfers_select on public.order_transfers for select to authenticated
  using (public.is_admin() or from_courier_id = public.current_courier_id() or to_courier_id = public.current_courier_id());

-- Canlı konum: yalnız siparişin müşterisi, atanmış kurye ve admin
grant select on public.order_live_locations to authenticated;
create policy order_live_locations_select on public.order_live_locations for select to authenticated using (
  public.is_admin()
  or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid()
             and o.status in ('courier_assigned', 'picked_up', 'on_the_way'))
  or (courier_id is not null and courier_id = public.current_courier_id())
);

-- QR tokenları: istemciye hiç açılmaz (yalnız service_role)
-- (RLS açık, hiçbir politika yok, ayrıcalık yok)

grant select on public.delivery_proofs to authenticated;
create policy delivery_proofs_select on public.delivery_proofs for select to authenticated using (
  public.is_admin() or courier_id = public.current_courier_id()
  or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

-- Ödemeler: müşteri kendi siparişinin ödeme durumunu görür; ham sağlayıcı yanıtı ve token kolonları istemciye kapalı
grant select (id, order_id, provider, purpose, amount, currency, status, paid_at, refunded_at, created_at, updated_at,
  conversation_id, provider_payment_id, failure_reason, refund_requested_at, provider_refund_id) on public.payments to authenticated;
create policy payments_select on public.payments for select to authenticated using (
  public.is_admin() or exists (select 1 from public.orders o where o.id = order_id and o.customer_id = auth.uid())
);

grant select on public.payment_events to authenticated;
create policy payment_events_admin on public.payment_events for select to authenticated using (public.is_admin());

grant select on public.platform_commissions to authenticated;
create policy platform_commissions_select on public.platform_commissions for select to authenticated
  using (public.is_admin() or public.is_vendor_member(vendor_id));

grant select on public.vendor_settlements, public.settlement_adjustments to authenticated;
create policy vendor_settlements_select on public.vendor_settlements for select to authenticated
  using (public.is_admin() or (public.is_vendor_member(vendor_id) and status <> 'draft'));
create policy settlement_adjustments_select on public.settlement_adjustments for select to authenticated using (
  public.is_admin() or exists (select 1 from public.vendor_settlements s where s.id = settlement_id
    and s.status <> 'draft' and public.is_vendor_member(s.vendor_id))
);

-- Sadakat ve referans: yalnız okuma
grant select on public.loyalty_rewards, public.referrals to authenticated;
create policy loyalty_rewards_select on public.loyalty_rewards for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy referrals_select on public.referrals for select to authenticated
  using (referrer_id = auth.uid() or referred_id = auth.uid() or public.is_admin());

-- Puanlar: yazma yalnız RPC
grant select on public.ratings to authenticated;
create policy ratings_select on public.ratings for select to authenticated using (
  rater_id = auth.uid() or public.is_admin()
  or (vendor_id is not null and public.is_vendor_member(vendor_id))
  or (courier_id is not null and courier_id = public.current_courier_id())
);

-- Destek: yalnız katılımcılar
grant select on public.support_conversations, public.support_messages to authenticated;
create policy support_conversations_select on public.support_conversations for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());
create policy support_messages_select on public.support_messages for select to authenticated using (
  exists (select 1 from public.support_conversations c where c.id = conversation_id and (c.customer_id = auth.uid() or public.is_admin()))
);

-- Bildirimler
grant select on public.notifications to authenticated;
create policy notifications_select on public.notifications for select to authenticated using (user_id = auth.uid());

grant select on public.device_tokens to authenticated;
create policy device_tokens_select on public.device_tokens for select to authenticated using (user_id = auth.uid());

grant select, insert, update on public.notification_preferences to authenticated;
create policy notification_preferences_select on public.notification_preferences for select to authenticated using (user_id = auth.uid());
create policy notification_preferences_insert on public.notification_preferences for insert to authenticated with check (user_id = auth.uid());
create policy notification_preferences_update on public.notification_preferences for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- E-posta: yalnız admin okur; kayıt/çıkış Edge Function ile
grant select on public.email_subscriptions, public.email_suppressions, public.email_outbox to authenticated;
create policy email_subscriptions_select on public.email_subscriptions for select to authenticated using (user_id = auth.uid() or public.is_admin());
create policy email_suppressions_admin on public.email_suppressions for select to authenticated using (public.is_admin());
create policy email_outbox_admin on public.email_outbox for select to authenticated using (public.is_admin());

-- SEO ve sağlık: admin
grant select on public.seo_checks, public.seo_error_logs, public.system_health_checks to authenticated;
grant update (status, resolved_at) on public.seo_error_logs to authenticated;
create policy seo_checks_admin on public.seo_checks for select to authenticated using (public.is_admin());
create policy seo_error_logs_admin on public.seo_error_logs for select to authenticated using (public.is_admin());
create policy seo_error_logs_admin_update on public.seo_error_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy system_health_admin on public.system_health_checks for select to authenticated using (public.is_admin());

-- rate_limit_buckets: istemciye kapalı (politika yok)
