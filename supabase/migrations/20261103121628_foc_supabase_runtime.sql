create table mkt_private.runtime_meta(id boolean primary key default true check(id),revision bigint not null default 0,source_id text not null,copy_complete boolean not null default false,ready boolean not null default false,accept_writes boolean not null default false);
create table mkt_private.runtime_rows(table_name text not null,id uuid not null default gen_random_uuid(),position bigint not null,payload jsonb not null,formulas jsonb not null default '[]',primary key(table_name,id),unique(table_name,position));
create table mkt_private.auth_imports(legacy_id text primary key,internal_email text not null unique,password_hash text,hash_checksum text not null,profile jsonb not null,auth_id uuid references auth.users(id));
create table mkt_private.auth_links(auth_id uuid primary key references auth.users(id),legacy_id text not null unique,internal_email text not null unique);
create table mkt_private.login_limits(key text primary key,attempts integer not null,window_start timestamptz not null);
create table mkt_private.daily_backups(day date primary key,payload jsonb not null,created_at timestamptz not null default now());
alter table mkt_private.runtime_meta enable row level security;
alter table mkt_private.runtime_rows enable row level security;
alter table mkt_private.auth_imports enable row level security;
alter table mkt_private.auth_links enable row level security;
alter table mkt_private.login_limits enable row level security;
alter table mkt_private.daily_backups enable row level security;
grant usage on schema mkt_private to service_role;
grant all on all tables in schema mkt_private to service_role;
grant select,insert,update,delete on all tables in schema public to service_role;
grant usage on schema auth to service_role;
grant select(id,user_id),delete on auth.sessions to service_role;
grant select(id,is_anonymous) on auth.users to service_role;
revoke execute on function public.mkt_mutate(text,jsonb,uuid,bigint),public.mkt_batch(jsonb),mkt_private.mutate(text,jsonb,uuid,bigint) from authenticated;
create or replace function mkt_private.can_access(p_team text default null,p_admin boolean default false) returns boolean language sql stable security definer set search_path='' as $$
select auth.uid() is not null and exists(select 1 from public.mkt_profiles p join auth.users u on u.id=p.id where p.id=auth.uid() and p.is_active and p.status='ACTIVE' and not coalesce(u.is_anonymous,false) and (p.role='ADMIN' or (not p_admin and p_team=p.team)) and exists(select 1 from auth.sessions s where s.user_id=p.id and s.id::text=auth.jwt()->>'session_id'));
$$;
create policy mkt_shared_settings_read on public.mkt_settings for select to authenticated using(key=any(array['currencyCode','currencySymbol','currencyPosition','pricePerCrate','contractAlertDays','warningThresholdPercent','language','dashboardTheme']) and exists(select 1 from public.mkt_profiles p where p.id=auth.uid() and mkt_private.can_access(p.team,false)));
alter table public.mkt_customer_conditions drop constraint mkt_customer_conditions_customer_code_team_fkey;alter table public.mkt_customer_conditions add constraint mkt_customer_conditions_customer_code_team_fkey foreign key (customer_code,team) references public.mkt_customers(code,team) on update no action on delete no action deferrable initially deferred;
alter table public.mkt_contracts drop constraint mkt_contracts_customer_code_team_fkey;alter table public.mkt_contracts add constraint mkt_contracts_customer_code_team_fkey foreign key (customer_code,team) references public.mkt_customers(code,team) on update no action on delete no action deferrable initially deferred;
alter table public.mkt_budgets drop constraint mkt_budgets_contract_id_customer_code_team_fkey;alter table public.mkt_budgets add constraint mkt_budgets_contract_id_customer_code_team_fkey foreign key (contract_id,customer_code,team) references public.mkt_contracts(id,customer_code,team) on update no action on delete no action deferrable initially deferred;
alter table public.mkt_transactions drop constraint mkt_transactions_budget_id_contract_id_customer_code_team_fkey;alter table public.mkt_transactions add constraint mkt_transactions_budget_id_contract_id_customer_code_team_fkey foreign key (budget_id,contract_id,customer_code,team) references public.mkt_budgets(id,contract_id,customer_code,team) on update no action on delete no action deferrable initially deferred;
create or replace function public.mkt_edge_actor(p_uid uuid,p_sid uuid) returns jsonb language sql stable security invoker set search_path='' as $$select to_jsonb(p) from public.mkt_profiles p join auth.users u on u.id=p.id where p.id=p_uid and p.is_active and p.status='ACTIVE' and not coalesce(u.is_anonymous,false) and exists(select 1 from auth.sessions s where s.id=p_sid and s.user_id=p_uid);$$;
create or replace function public.mkt_edge_load(p_uid uuid,p_sid uuid,p_operations text[] default '{}') returns jsonb language sql stable security invoker set search_path='' as $$
with actor as(select public.mkt_edge_actor(p_uid,p_sid) a) select jsonb_build_object('actor',actor.a,'sourceId',m.source_id,'revision',m.revision,'acceptWrites',m.accept_writes,
'profiles',coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.mkt_profiles p where actor.a->>'role'='ADMIN' or p.id=p_uid),'[]'),
'customers',coalesce((select jsonb_agg(to_jsonb(x) order by code) from public.mkt_customers x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
'conditions',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.mkt_customer_conditions x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
'contracts',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.mkt_contracts x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
'budgets',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.mkt_budget_totals x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
 'transactions',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.mkt_transactions x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
'logs',coalesce((select jsonb_agg(to_jsonb(x) order by timestamp,id) from public.mkt_activity_logs x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team' and x.actor_id=p_uid),'[]'),
'settings',coalesce((select jsonb_agg(to_jsonb(x) order by key) from public.mkt_settings x where actor.a->>'role'='ADMIN' or key=any(array['currencyCode','currencySymbol','currencyPosition','pricePerCrate','contractAlertDays','warningThresholdPercent','language','dashboardTheme'])),'[]'),
'categories',coalesce((select jsonb_agg(to_jsonb(x) order by id) from public.mkt_categories x),'[]'),
'deletedCustomers',coalesce((select jsonb_agg(to_jsonb(x) order by customer_code) from public.mkt_deleted_customers x where actor.a->>'role'='ADMIN' or x.team=actor.a->>'team'),'[]'),
'runtime',coalesce((select jsonb_agg(jsonb_build_object('name',t.table_name,'rows',(select jsonb_agg(jsonb_build_object('id',r.id,'position',r.position,'values',case when r.position=1 then r.payload when r.table_name='APP_WRITES' and r.payload->>4='DONE' and not(coalesce(r.payload->>0,'')=any(p_operations)) then jsonb_path_query_array(r.payload,'$[0 to 6]') when r.table_name in('DATABASE_BACKUPS','BROWSER_RECOVERY','CHANGE_HISTORY') then jsonb_path_query_array(r.payload,'$[0 to 7]') else r.payload end,'formulas',r.formulas) order by r.position) from mkt_private.runtime_rows r where r.table_name=t.table_name))) from (select distinct table_name from mkt_private.runtime_rows) t),'[]')) from mkt_private.runtime_meta m cross join actor where m.id and actor.a is not null;
$$;
create or replace function public.mkt_edge_commit(p_uid uuid,p_sid uuid,p_revision bigint,p_action text,p_changes jsonb) returns bigint language plpgsql security invoker set search_path='' as $$
declare actor jsonb;rev bigint;entry jsonb;data jsonb;old_data jsonb;existing_team text;key text;
begin
actor=public.mkt_edge_actor(p_uid,p_sid);if actor is null then raise exception 'Session expired. Sign in again.' using errcode='42501';end if;
select revision into rev from mkt_private.runtime_meta where id and accept_writes for update;if rev is null then raise exception 'Migration is being activated. Try again shortly.';end if;if rev<>p_revision then raise exception using errcode='40001',message='Database changed. Retry the same operation.';end if;
if not exists(select 1 from mkt_private.daily_backups where day=(now() at time zone 'Asia/Bangkok')::date) then insert into mkt_private.daily_backups(day,payload) values((now() at time zone 'Asia/Bangkok')::date,jsonb_build_object('profiles',(select jsonb_agg(to_jsonb(x)) from public.mkt_profiles x),'customers',(select jsonb_agg(to_jsonb(x)) from public.mkt_customers x),'conditions',(select jsonb_agg(to_jsonb(x)) from public.mkt_customer_conditions x),'contracts',(select jsonb_agg(to_jsonb(x)) from public.mkt_contracts x),'budgets',(select jsonb_agg(to_jsonb(x)) from public.mkt_budgets x),'transactions',(select jsonb_agg(to_jsonb(x)) from public.mkt_transactions x),'settings',(select jsonb_agg(to_jsonb(x)) from public.mkt_settings x))) on conflict do nothing;end if;
for entry in select value from jsonb_array_elements(p_changes->'deletes') order by case value->>'table' when 'mkt_transactions' then 1 when 'mkt_budgets' then 2 when 'mkt_contracts' then 3 when 'mkt_customer_conditions' then 4 when 'mkt_customers' then 5 else 6 end loop
if entry->>'kind'='runtime' then delete from mkt_private.runtime_rows where table_name=entry->>'table' and id=(entry->>'id')::uuid;continue;end if;
case entry->>'table'
when 'mkt_profiles' then if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;delete from public.mkt_profiles where id::text=entry->>'id';
when 'mkt_customers' then select team into existing_team from public.mkt_customers where code=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_customers where code::text=entry->>'id';
when 'mkt_customer_conditions' then select team into existing_team from public.mkt_customer_conditions where id=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_customer_conditions where id::text=entry->>'id';
when 'mkt_contracts' then select team into existing_team from public.mkt_contracts where id=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_contracts where id::text=entry->>'id';
when 'mkt_budgets' then select team into existing_team from public.mkt_budgets where id=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_budgets where id::text=entry->>'id';
when 'mkt_transactions' then select team into existing_team from public.mkt_transactions where id=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_transactions where id::text=entry->>'id';
when 'mkt_activity_logs' then if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;delete from public.mkt_activity_logs where id::text=entry->>'id';
when 'mkt_settings' then if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;delete from public.mkt_settings where key::text=entry->>'id';
when 'mkt_categories' then if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;delete from public.mkt_categories where id::text=entry->>'id';
when 'mkt_deleted_customers' then select team into existing_team from public.mkt_deleted_customers where customer_code=entry->>'id';if actor->>'role'<>'ADMIN' and existing_team is distinct from actor->>'team' then raise exception 'Team denied';end if;delete from public.mkt_deleted_customers where customer_code::text=entry->>'id';
else raise exception 'Unsupported delete table';end case;end loop;
for entry in select value from jsonb_array_elements(p_changes->'upserts') order by case value->>'table' when 'mkt_profiles' then 0 when 'mkt_customers' then 1 when 'mkt_customer_conditions' then 2 when 'mkt_contracts' then 3 when 'mkt_budgets' then 4 when 'mkt_transactions' then 5 else 9 end loop
if entry->>'kind'='runtime' then if entry->>'table'='SESSIONS' then continue;end if;insert into mkt_private.runtime_rows(table_name,id,position,payload,formulas) values(entry->>'table',(entry->>'id')::uuid,(entry->>'position')::bigint,entry->'values',coalesce(entry->'formulas','[]')) on conflict(table_name,id) do update set position=excluded.position,payload=excluded.payload,formulas=excluded.formulas;continue;end if;
data=entry->'data';case entry->>'table'
when 'mkt_profiles' then
select to_jsonb(x) into old_data from public.mkt_profiles x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' and ((data->>'id')::uuid<>p_uid or data->>'role' is distinct from actor->>'role' or data->>'team' is distinct from actor->>'team' or data->>'is_active'<>'true' or data->>'status'<>'ACTIVE') then raise exception 'Profile permission denied';end if;if data->>'id'=p_uid::text and (data->>'is_active'<>'true' or actor->>'role'='ADMIN' and data->>'role'<>'ADMIN') then raise exception 'Cannot disable or demote current account';end if;
data='{"version":1,"full_name":"","is_active":false,"status":"ACTIVE"}'::jsonb||data;insert into public.mkt_profiles select (jsonb_populate_record(null::public.mkt_profiles,data)).* on conflict(id) do update set legacy_id=excluded.legacy_id,username=excluded.username,full_name=excluded.full_name,email=excluded.email,role=excluded.role,team=excluded.team,is_active=excluded.is_active,status=excluded.status,created_at=excluded.created_at,last_login=excluded.last_login,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at;
when 'mkt_customers' then
select to_jsonb(x) into old_data from public.mkt_customers x where code::text=data->>'code';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
data='{"version":1,"status":"ACTIVE"}'::jsonb||data;insert into public.mkt_customers select (jsonb_populate_record(null::public.mkt_customers,data)).* on conflict(code) do update set name=excluded.name,team=excluded.team,mde=excluded.mde,phone=excluded.phone,address=excluded.address,province=excluded.province,contact_person=excluded.contact_person,status=excluded.status,created_at=excluded.created_at,updated_at=excluded.updated_at,deleted_at=excluded.deleted_at,version=mkt_customers.version+1;
when 'mkt_customer_conditions' then
select to_jsonb(x) into old_data from public.mkt_customer_conditions x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
if actor->>'role'<>'ADMIN' and (old_data is null and p_action<>'ADD_CUSTOMER' or old_data is not null and exists(select 1 from unnest(array['condition_quantity','condition_uom','condition_product_description','price_per_unit']) k where old_data->k is distinct from data->k)) then raise exception 'Only Admin can change contract conditions';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_customer_conditions select (jsonb_populate_record(null::public.mkt_customer_conditions,data)).* on conflict(id) do update set customer_code=excluded.customer_code,team=excluded.team,condition_quantity=excluded.condition_quantity,condition_uom=excluded.condition_uom,condition_product_description=excluded.condition_product_description,price_per_unit=excluded.price_per_unit,updated_at=excluded.updated_at,version=mkt_customer_conditions.version+1;
when 'mkt_contracts' then
select to_jsonb(x) into old_data from public.mkt_contracts x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
if actor->>'role'<>'ADMIN' and (old_data is null and p_action<>'ADD_CUSTOMER' or old_data is not null and exists(select 1 from unnest(array['commencing_on','expiring_on','cycle_number']) k where old_data->k is distinct from data->k)) then raise exception 'Only Admin can renew contracts';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_contracts select (jsonb_populate_record(null::public.mkt_contracts,data)).* on conflict(id) do update set customer_code=excluded.customer_code,team=excluded.team,legacy_customer_name=excluded.legacy_customer_name,commencing_on=excluded.commencing_on,expiring_on=excluded.expiring_on,cycle_number=excluded.cycle_number,notes=excluded.notes,legacy_status=excluded.legacy_status,created_at=excluded.created_at,updated_at=excluded.updated_at,version=mkt_contracts.version+1;
when 'mkt_budgets' then
select to_jsonb(x) into old_data from public.mkt_budgets x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
if actor->>'role'<>'ADMIN' and (old_data is null and (p_action<>'ADD_CUSTOMER' or (data->>'annual_amount')::numeric is distinct from (select condition_quantity*price_per_unit from public.mkt_customer_conditions where customer_code=data->>'customer_code')) or old_data is not null and exists(select 1 from unnest(array['annual_amount','unallocated_used','allow_exception','exception_reason']) k where old_data->k is distinct from data->k)) then raise exception 'Only Admin can change annual allowance';end if;
data='{"version":1,"unallocated_used":0,"allow_exception":false}'::jsonb||data;insert into public.mkt_budgets select (jsonb_populate_record(null::public.mkt_budgets,data)).* on conflict(id) do update set contract_id=excluded.contract_id,customer_code=excluded.customer_code,team=excluded.team,annual_amount=excluded.annual_amount,unallocated_used=excluded.unallocated_used,period_number=excluded.period_number,period_start=excluded.period_start,period_end=excluded.period_end,allow_exception=excluded.allow_exception,exception_reason=excluded.exception_reason,updated_at=excluded.updated_at,version=mkt_budgets.version+1;
when 'mkt_transactions' then
select to_jsonb(x) into old_data from public.mkt_transactions x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_transactions select (jsonb_populate_record(null::public.mkt_transactions,data)).* on conflict(id) do update set budget_id=excluded.budget_id,contract_id=excluded.contract_id,customer_code=excluded.customer_code,team=excluded.team,legacy_customer_name=excluded.legacy_customer_name,date=excluded.date,category=excluded.category,description=excluded.description,amount=excluded.amount,invoice_ref=excluded.invoice_ref,created_by=excluded.created_by,legacy_created_by=excluded.legacy_created_by,created_at=excluded.created_at,status=excluded.status,cancellation_reason=excluded.cancellation_reason,cancelled_by=excluded.cancelled_by,legacy_cancelled_by=excluded.legacy_cancelled_by,cancelled_at=excluded.cancelled_at;
when 'mkt_activity_logs' then
select to_jsonb(x) into old_data from public.mkt_activity_logs x where id::text=data->>'id';
data='{"version":1}'::jsonb||data;insert into public.mkt_activity_logs select (jsonb_populate_record(null::public.mkt_activity_logs,data)).* on conflict(id) do update set timestamp=excluded.timestamp,actor_id=excluded.actor_id,legacy_user=excluded.legacy_user,role=excluded.role,team=excluded.team,action=excluded.action,details=excluded.details,operation_id=excluded.operation_id;
when 'mkt_settings' then
select to_jsonb(x) into old_data from public.mkt_settings x where key::text=data->>'key';
if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_settings select (jsonb_populate_record(null::public.mkt_settings,data)).* on conflict(key) do update set value=excluded.value,description=excluded.description,updated_at=excluded.updated_at;
when 'mkt_categories' then
select to_jsonb(x) into old_data from public.mkt_categories x where id::text=data->>'id';
if actor->>'role'<>'ADMIN' then raise exception 'Admin required';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_categories select (jsonb_populate_record(null::public.mkt_categories,data)).* on conflict(id) do update set name_lao=excluded.name_lao,name_english=excluded.name_english,code=excluded.code,description=excluded.description;
when 'mkt_deleted_customers' then
select to_jsonb(x) into old_data from public.mkt_deleted_customers x where customer_code::text=data->>'customer_code';
if actor->>'role'<>'ADMIN' and (data->>'team' is distinct from actor->>'team' or old_data is not null and old_data->>'team' is distinct from actor->>'team') then raise exception 'Team denied';end if;
data='{"version":1}'::jsonb||data;insert into public.mkt_deleted_customers select (jsonb_populate_record(null::public.mkt_deleted_customers,data)).* on conflict(customer_code) do update set team=excluded.team,deleted_at=excluded.deleted_at,deleted_by=excluded.deleted_by,legacy_deleted_by=excluded.legacy_deleted_by,operation_id=excluded.operation_id,backup_id=excluded.backup_id;
else raise exception 'Unsupported upsert table';end case;end loop;
update mkt_private.runtime_meta set revision=revision+1 where id returning revision into rev;return rev;end;$$;
-- Server-only native Auth bridge. No password hash or identity lookup is public.
create or replace function public.mkt_edge_bootstrap_queue() returns jsonb language sql stable security invoker set search_path='' as $$
select coalesce(jsonb_agg(to_jsonb(q)),'[]') from mkt_private.auth_imports q where q.auth_id is null and exists(select 1 from mkt_private.runtime_meta where id and copy_complete and not ready);
$$;
create or replace function public.mkt_edge_link_import(p_legacy_id text,p_auth_id uuid) returns void language plpgsql security invoker set search_path='' as $$
declare q mkt_private.auth_imports;data jsonb;
begin
select * into q from mkt_private.auth_imports where legacy_id=p_legacy_id for update;
if q.legacy_id is null then raise exception 'Unknown migration account';end if;
if q.auth_id is not null and q.auth_id<>p_auth_id then raise exception 'Account already linked';end if;
data=q.profile||jsonb_build_object('id',p_auth_id);
insert into public.mkt_profiles select (jsonb_populate_record(null::public.mkt_profiles,data)).* on conflict(id) do nothing;
insert into mkt_private.auth_links(auth_id,legacy_id,internal_email) values(p_auth_id,q.legacy_id,q.internal_email) on conflict(auth_id) do nothing;
update mkt_private.auth_imports set auth_id=p_auth_id,password_hash=null where legacy_id=p_legacy_id;
if not exists(select 1 from mkt_private.auth_imports where auth_id is null) then update mkt_private.runtime_meta set ready=true where id;end if;
end;$$;
create or replace function public.mkt_edge_health() returns jsonb language sql stable security invoker set search_path='' as $$
select jsonb_build_object('success',true,'provider','supabase','ready',coalesce((select ready from mkt_private.runtime_meta where id),false),'accounts',(select count(*) from public.mkt_profiles));
$$;
create or replace function public.mkt_edge_login(p_username text) returns text language plpgsql security invoker set search_path='' as $$
declare counter integer;mail text;k text=encode(extensions.digest(lower(trim(p_username)),'sha256'),'hex');
begin
insert into mkt_private.login_limits(key,attempts,window_start) values(k,1,now()) on conflict(key) do update set attempts=case when login_limits.window_start<now()-interval '10 minutes' then 1 else login_limits.attempts+1 end,window_start=case when login_limits.window_start<now()-interval '10 minutes' then now() else login_limits.window_start end returning attempts into counter;
if counter>10 then return null;end if;
select l.internal_email into mail from mkt_private.auth_links l join public.mkt_profiles p on p.id=l.auth_id where lower(p.username)=lower(trim(p_username)) and p.is_active and p.status='ACTIVE' and exists(select 1 from mkt_private.runtime_meta where id and ready and accept_writes);
return mail;
end;$$;
create or replace function public.mkt_edge_login_success(p_uid uuid,p_sid uuid) returns void language plpgsql security invoker set search_path='' as $$
declare a jsonb=public.mkt_edge_actor(p_uid,p_sid);
begin if a is null then raise exception 'Session expired';end if;delete from mkt_private.login_limits where key=encode(extensions.digest(lower(a->>'username'),'sha256'),'hex');end;$$;
create or replace function public.mkt_edge_account(p_uid uuid,p_sid uuid,p_legacy_id text) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare a jsonb=public.mkt_edge_actor(p_uid,p_sid);r jsonb;
begin if a is null then raise exception 'Session expired';end if;
select to_jsonb(l) into r from mkt_private.auth_links l where l.legacy_id=p_legacy_id and (a->>'role'='ADMIN' or l.auth_id=p_uid);return r;end;$$;
create or replace function public.mkt_edge_stage_account(p_uid uuid,p_sid uuid,p_auth_id uuid,p_legacy_id text,p_email text) returns void language plpgsql security invoker set search_path='' as $$
declare a jsonb=public.mkt_edge_actor(p_uid,p_sid);
begin if a is null or a->>'role'<>'ADMIN' then raise exception 'Admin required';end if;
insert into mkt_private.auth_links(auth_id,legacy_id,internal_email) values(p_auth_id,p_legacy_id,p_email) on conflict(auth_id) do nothing;end;$$;
create or replace function public.mkt_edge_revoke_sessions(p_uid uuid,p_sid uuid,p_target uuid,p_all boolean default true) returns void language plpgsql security invoker set search_path='' as $$
declare a jsonb=public.mkt_edge_actor(p_uid,p_sid);
begin if a is null or (p_uid<>p_target and a->>'role'<>'ADMIN') then raise exception 'Permission denied';end if;
delete from auth.sessions where user_id=p_target and (p_all or id=p_sid);end;$$;
-- PostgreSQL grants new functions to PUBLIC by default: explicitly close the bridge.
do $$declare f record;begin
for f in select p.oid::regprocedure signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname like 'mkt_edge_%' loop
execute format('revoke all on function %s from public,anon,authenticated',f.signature);
execute format('grant execute on function %s to service_role',f.signature);
end loop;end;$$;
revoke execute on function public.mkt_mutate(text,jsonb,uuid,bigint),public.mkt_batch(jsonb),mkt_private.mutate(text,jsonb,uuid,bigint) from public,anon,authenticated;
