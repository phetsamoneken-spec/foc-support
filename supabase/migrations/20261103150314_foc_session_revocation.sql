-- Auth owns its session table and may reset table grants during upgrades.
-- Keep application revocation state private and use native Auth logout as well.
create table mkt_private.session_epochs(user_id uuid primary key references auth.users(id) on delete cascade,valid_after timestamptz not null);
create table mkt_private.revoked_sessions(session_id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,revoked_at timestamptz not null default now());
create index revoked_sessions_user on mkt_private.revoked_sessions(user_id);
alter table mkt_private.session_epochs enable row level security;
alter table mkt_private.revoked_sessions enable row level security;
grant all on mkt_private.session_epochs,mkt_private.revoked_sessions to service_role;
grant select(created_at) on auth.sessions to service_role;
revoke delete on auth.sessions from service_role;
create function mkt_private.session_valid(p_uid uuid,p_sid uuid) returns boolean language sql stable security invoker set search_path='' as $$
select exists(select 1 from auth.sessions s where s.user_id=p_uid and s.id=p_sid and not exists(select 1 from mkt_private.revoked_sessions r where r.session_id=p_sid) and not exists(select 1 from mkt_private.session_epochs e where e.user_id=p_uid and s.created_at<=e.valid_after));
$$;
revoke all on function mkt_private.session_valid(uuid,uuid) from public,anon,authenticated;
grant execute on function mkt_private.session_valid(uuid,uuid) to service_role;
create or replace function public.mkt_edge_actor(p_uid uuid,p_sid uuid) returns jsonb language sql stable security invoker set search_path='' as $$select to_jsonb(p) from public.mkt_profiles p join auth.users u on u.id=p.id where p.id=p_uid and p.is_active and p.status='ACTIVE' and not coalesce(u.is_anonymous,false) and mkt_private.session_valid(p_uid,p_sid);$$;
create or replace function mkt_private.can_access(p_team text default null,p_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.mkt_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.is_active and p.status='ACTIVE' and not coalesce(u.is_anonymous,false) and (p.role='ADMIN' or (not p_admin and p_team=p.team)) and mkt_private.session_valid(p.id,nullif(auth.jwt()->>'session_id','')::uuid));
$$;
create or replace function public.mkt_edge_revoke_sessions(p_uid uuid,p_sid uuid,p_target uuid,p_all boolean default true) returns void language plpgsql security invoker set search_path='' as $$
declare a jsonb=public.mkt_edge_actor(p_uid,p_sid);
begin if a is null or (p_uid<>p_target and a->>'role'<>'ADMIN') then raise exception 'Permission denied';end if;
if p_all then
 insert into mkt_private.session_epochs(user_id,valid_after) values(p_target,clock_timestamp()) on conflict(user_id) do update set valid_after=excluded.valid_after;
 insert into mkt_private.revoked_sessions(session_id,user_id) select id,user_id from auth.sessions where user_id=p_target on conflict(session_id) do nothing;
else insert into mkt_private.revoked_sessions(session_id,user_id) values(p_sid,p_target) on conflict(session_id) do nothing;end if;
end;$$;
