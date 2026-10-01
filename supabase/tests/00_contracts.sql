-- contracts.json ↔ PostgreSQL enum ve geçiş tablosu eşleşmesi; telefon normalizasyonu ortak test vektörleri
\ir _helpers.psql
\set contracts `cat "$KAPINDA_ROOT/packages/shared-contracts/contracts.json"`
\set vectors `cat "$KAPINDA_ROOT/packages/shared-validation/test/phone-vectors.json"`
begin;
create temp table c as select :'contracts'::jsonb as j;
create temp table v as select :'vectors'::jsonb as j;

do $$
declare
  r record;
  v_db text[];
  v_json text[];
begin
  for r in select key, value from jsonb_each((select j from c) -> 'enums') loop
    select array_agg(e.enumlabel::text order by e.enumlabel::text) into v_db
    from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = r.value ->> 'sql' and t.typnamespace = 'public'::regnamespace;
    select array_agg(k order by k) into v_json from jsonb_object_keys(r.value -> 'values') as x(k);
    perform tests.assert_eq(v_db, v_json, format('enum %s eşleşiyor', r.key));
  end loop;
end $$;

do $$
declare
  v_missing int;
  v_extra int;
begin
  select count(*) into v_missing from jsonb_array_elements((select j from c) -> 'orderTransitions') t
  where not exists (select 1 from public.order_status_transitions s
    where s.from_status::text = t ->> 0 and s.to_status::text = t ->> 1 and s.actor::text = t ->> 2);
  select count(*) - jsonb_array_length((select j from c) -> 'orderTransitions') into v_extra from public.order_status_transitions;
  perform tests.assert_eq(v_missing, 0, 'tüm contract geçişleri veritabanında var');
  perform tests.assert_eq(v_extra, 0, 'veritabanında contract dışı geçiş yok');
end $$;

do $$
declare
  r jsonb;
  n int := 0;
begin
  for r in select * from jsonb_array_elements((select j from v) -> 'valid') loop
    perform tests.assert_eq(public.normalize_tr_phone(r ->> 0), r ->> 1, 'telefon ' || (r ->> 0));
    n := n + 1;
  end loop;
  for r in select * from jsonb_array_elements((select j from v) -> 'invalid') loop
    perform tests.assert_eq(public.normalize_tr_phone(r #>> '{}'), null::text, 'geçersiz telefon "' || (r #>> '{}') || '"');
  end loop;
end $$;

-- Tüm phone kolonları canonical formatta saklanır
do $$
declare
  v_uid uuid := tests.create_user('phone@test.local');
begin
  perform tests.assert_eq((select phone from public.profiles where id = v_uid), '+905320000001', 'profil telefonu normalize edildi');
  perform tests.assert_raises(format($q$update public.profiles set phone = '12345' where id = %L$q$, v_uid), 'KPD_INVALID_PHONE', 'geçersiz telefon reddedilir');
end $$;
rollback;
