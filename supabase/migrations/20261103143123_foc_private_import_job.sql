-- Temporary owner-controlled import/probe channel. Removed after verified cutover.
create extension if not exists http with schema extensions;
do $$declare f record;begin for f in select p.oid::regprocedure signature from pg_proc p join pg_depend d on d.objid=p.oid and d.classid='pg_proc'::regclass join pg_extension e on e.oid=d.refobjid where e.extname='http' loop execute format('revoke execute on function %s from public,anon,authenticated',f.signature);end loop;end;$$;
create table mkt_private.import_job(id boolean primary key default true check(id),token text not null,expires_at timestamptz not null,claimed_at timestamptz,probe_ids uuid[] not null default '{}');
alter table mkt_private.import_job enable row level security;
grant all on mkt_private.import_job to service_role;
create function public.mkt_edge_claim_import(p_digest text) returns boolean language plpgsql security invoker set search_path='' as $$begin
update mkt_private.import_job set claimed_at=now() where id and claimed_at is null and expires_at>now() and encode(extensions.digest(token,'sha256'),'hex')=p_digest;return found;end;$$;
create function public.mkt_edge_probe_profile(p_uid uuid,p_name text,p_team text) returns void language plpgsql security invoker set search_path='' as $$begin
if not exists(select 1 from mkt_private.import_job where id and claimed_at is not null and expires_at>now()) or p_name!~'^probe-[a-f0-9]{24}$' or p_team not in('ALL','B1') then raise exception 'Probe job denied';end if;
insert into public.mkt_profiles(id,legacy_id,username,full_name,email,role,team,is_active,status) values(p_uid,'VERIFY-'||p_uid,p_name,'Migration verification',p_name||'@foc-support.invalid',case when p_team='ALL' then 'ADMIN' else 'TEAM_USER' end,p_team,true,'ACTIVE');
insert into mkt_private.auth_links(auth_id,legacy_id,internal_email) values(p_uid,'VERIFY-'||p_uid,p_name||'@foc-support.invalid');
update mkt_private.import_job set probe_ids=array_append(probe_ids,p_uid) where id;end;$$;
create function public.mkt_edge_probe_cleanup() returns uuid[] language plpgsql security invoker set search_path='' as $$declare ids uuid[];names text[];begin
select probe_ids into ids from mkt_private.import_job where id and claimed_at is not null;if ids is null then return '{}';end if;
select array_agg(username) into names from public.mkt_profiles where id=any(ids);
delete from public.mkt_activity_logs where actor_id=any(ids);
delete from mkt_private.runtime_rows where table_name='CHANGE_HISTORY' and payload->>2=any(names);
update mkt_private.daily_backups set payload=jsonb_set(payload,'{profiles}',coalesce((select jsonb_agg(p) from jsonb_array_elements(coalesce(payload->'profiles','[]')) p where not((p->>'id')::uuid=any(ids))),'[]'));
delete from mkt_private.auth_links where auth_id=any(ids);delete from public.mkt_profiles where id=any(ids);return ids;end;$$;
revoke all on function public.mkt_edge_claim_import(text),public.mkt_edge_probe_profile(uuid,text,text),public.mkt_edge_probe_cleanup() from public,anon,authenticated;
grant execute on function public.mkt_edge_claim_import(text),public.mkt_edge_probe_profile(uuid,text,text),public.mkt_edge_probe_cleanup() to service_role;
