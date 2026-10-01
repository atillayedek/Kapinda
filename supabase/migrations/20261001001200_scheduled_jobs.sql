-- Zamanlanmış işler (Supabase Cron = pg_cron + pg_net).
-- Edge Function çağrıları için Supabase Vault'ta iki gizli değer gerekir (repo'ya yazılmaz):
--   select vault.create_secret('https://<proje>.supabase.co', 'project_url');
--   select vault.create_secret('<CRON_SECRET>', 'cron_secret');
-- Edge Function'lar x-cron-secret başlığını CRON_SECRET ortam değişkeniyle karşılaştırır.
-- pg_cron/pg_net bulunmayan ortamlarda (yerel test) bu migration işleri atlar.

create or replace function public._invoke_edge_function(p_name text, p_body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (select 1 from pg_extension where extname = 'pg_net')
     or not exists (select 1 from pg_namespace where nspname = 'vault') then
    return;
  end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'project_url'$q$ into v_url;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret'$q$ into v_secret;
  if v_url is null or v_secret is null then
    perform public._log_event('database', 'edge_function_failure', 'error', 'Vault project_url/cron_secret tanımlı değil',
      jsonb_build_object('function', p_name));
    return;
  end if;
  execute 'select net.http_post(url := $1, headers := $2, body := $3, timeout_milliseconds := 10000)'
    using v_url || '/functions/v1/' || p_name,
          jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
          coalesce(p_body, '{}'::jsonb);
end;
$$;

revoke execute on function public._invoke_edge_function(text, jsonb) from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_cron;
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end $$;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('kapinda-expire-pending-payments', '*/5 * * * *', 'select public.expire_pending_payments()');
    perform cron.schedule('kapinda-dispatch-notifications', '* * * * *', $j$select public._invoke_edge_function('dispatch-notifications')$j$);
    perform cron.schedule('kapinda-send-emails', '* * * * *', $j$select public._invoke_edge_function('send-emails')$j$);
    perform cron.schedule('kapinda-process-refunds', '*/10 * * * *', $j$select public._invoke_edge_function('process-refunds')$j$);
    perform cron.schedule('kapinda-system-health', '*/5 * * * *', $j$select public._invoke_edge_function('system-health', '{"trigger":"scheduled"}')$j$);
    perform cron.schedule('kapinda-seo-check', '*/5 * * * *', $j$select public._invoke_edge_function('seo-check', '{"trigger":"scheduled"}')$j$);
    perform cron.schedule('kapinda-cleanup', '17 3 * * *', $j$
      delete from public.rate_limit_buckets where window_start < now() - interval '2 days';
      delete from public.courier_locations where recorded_at < now() - interval '90 days';
      update public.device_tokens set revoked_at = now(), revoke_reason = 'stale'
        where revoked_at is null and last_seen_at < now() - interval '120 days';
    $j$);
  end if;
end $$;
