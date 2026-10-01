-- Eşzamanlılık testi kurulumu (geçici test veritabanında COMMIT edilir; veritabanı test sonunda silinir)
\ir ../_helpers.psql
set client_min_messages = warning;
create table tests.conc_ctx (key text primary key, value text);
do $$
declare
  v_c uuid := tests.create_user('conc-c@test.local');
  v_c2 uuid := tests.create_user('conc-c2@test.local');
  v_vu uuid := tests.create_user('conc-v@test.local');
  v_ku uuid := tests.create_user('conc-k@test.local');
  v_v uuid := tests.create_vendor(v_vu, 'Eşzamanlı Market');
  v_k uuid := tests.create_courier(v_ku);
  v_p uuid := tests.create_product(v_v, 300, 10);
  v_last uuid := tests.create_product(v_v, 300, 1);
  v_order uuid;
  v_tok uuid;
  q1 public.delivery_fees;
  q2 public.delivery_fees;
begin
  v_order := tests.place_order(v_c, v_v, tests.create_address(v_c), format('[{"product_id":"%s","quantity":1}]', v_p)::jsonb);
  perform tests.vendor_prepare(v_vu, v_order);
  perform tests.as_user(v_ku);
  perform public.courier_accept_order(v_order);
  perform public.courier_update_order_status(v_order, 'picked_up');
  perform public.courier_update_order_status(v_order, 'on_the_way');
  perform tests.reset_role();
  v_tok := tests.issue_qr(v_order, v_c, 'concurrent-nonce');
  perform tests.as_service();
  q1 := public.create_delivery_fee_quote(v_c, v_v, (select id from public.addresses where user_id = v_c limit 1), 3, 'google_maps');
  q2 := public.create_delivery_fee_quote(v_c2, v_v, tests.create_address(v_c2), 3, 'google_maps');
  perform tests.reset_role();
  insert into tests.conc_ctx values ('order', v_order), ('token', v_tok), ('courier_user', v_ku), ('hash', public.sha256_hex('concurrent-nonce')),
    ('c1', v_c), ('c2', v_c2), ('q1', q1.id), ('q2', q2.id), ('last', v_last);
end $$;
