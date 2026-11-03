-- Only synthetic users created by this migration probe may be unlinked.
-- Original imported accounts, financial records, history and backups are preserved.
create or replace function public.mkt_edge_probe_cleanup() returns uuid[] language plpgsql security invoker set search_path='' as $$declare ids uuid[];begin
select probe_ids into ids from mkt_private.import_job where id and claimed_at is not null;if ids is null then return '{}';end if;
if exists(select 1 from unnest(ids) target join auth.users u on u.id=target where u.email!~'^probe-[a-f0-9]{24}@foc-support[.]invalid$') or exists(select 1 from public.mkt_profiles p where p.id=any(ids) and (p.legacy_id is distinct from 'VERIFY-'||p.id::text or p.username!~'^probe-[a-f0-9]{24}$')) or exists(select 1 from mkt_private.auth_imports q where q.auth_id=any(ids)) then raise exception 'Probe cleanup scope failed';end if;
if exists(select 1 from public.mkt_transactions t where t.created_by=any(ids) or t.cancelled_by=any(ids)) then raise exception 'Probe has financial references';end if;
update public.mkt_activity_logs set actor_id=null where actor_id=any(ids);
delete from mkt_private.auth_links where auth_id=any(ids) and legacy_id='VERIFY-'||auth_id::text;
delete from public.mkt_profiles where id=any(ids) and legacy_id='VERIFY-'||id::text;
return ids;end;$$;
