-- REVIEW ONLY / NOT APPLIED to a Supabase project. PostgreSQL >=15.
-- Run only on a disposable local DB until separately approved.
-- Repeatable for this exact schema; NOT a repair tool for unrelated/pre-existing mkt_* objects.
begin;
select pg_advisory_xact_lock(71261002);
create schema if not exists mkt_private;
revoke all on schema mkt_private from public, anon, authenticated;
grant usage on schema mkt_private to authenticated;

create table if not exists public.mkt_profiles (
 id uuid primary key references auth.users(id) on delete restrict,
 legacy_id text unique, username text not null check(length(username) between 1 and 100),
 full_name text not null default '', email text,
 role text not null check(role in ('ADMIN','TEAM_USER')),
 team text not null, is_active boolean not null default false,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','DELETED')),
 created_at timestamptz not null default now(), last_login timestamptz,
 updated_at timestamptz not null default now(), deleted_at timestamptz,
 check((role='ADMIN' and team='ALL') or (role='TEAM_USER' and team ~ '^B[1-7]$'))
);
create unique index if not exists mkt_profiles_username on public.mkt_profiles(lower(username));
create table if not exists public.mkt_customers (
 code text primary key check(length(code) between 1 and 80), name text not null check(length(name) between 1 and 300),
 team text not null check(team ~ '^B[1-7]$'), mde text not null,
 phone text, address text, province text, contact_person text,
 status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','DELETED')),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz,
 version bigint not null default 1 check(version>0), unique(code,team)
);
create table if not exists public.mkt_customer_conditions (
 id text primary key, customer_code text not null, team text not null,
 condition_quantity numeric(18,4) not null check(condition_quantity>=0 and condition_quantity<1e14),
 condition_uom text not null, condition_product_description text not null,
 price_per_unit numeric(18,2) check(price_per_unit>=0 and price_per_unit<1e16),
 updated_at timestamptz not null default now(), version bigint not null default 1,
 foreign key(customer_code,team) references public.mkt_customers(code,team) on update restrict on delete restrict
);
create table if not exists public.mkt_contracts (
 id text primary key, customer_code text not null, team text not null,
 legacy_customer_name text, commencing_on date not null, expiring_on date not null,
 cycle_number integer not null check(cycle_number>0), notes text,
 legacy_status text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 version bigint not null default 1,
 check(expiring_on>=commencing_on and expiring_on < (commencing_on + interval '100 years')::date),
 unique(customer_code,cycle_number), unique(id,customer_code,team),
 foreign key(customer_code,team) references public.mkt_customers(code,team) on update restrict on delete restrict
);
create table if not exists public.mkt_budgets (
 id text primary key, contract_id text not null, customer_code text not null, team text not null,
 annual_amount numeric(18,2) not null check(annual_amount>=0 and annual_amount<1e16),
 unallocated_used numeric(18,2) not null default 0 check(unallocated_used>=0 and unallocated_used<1e16),
 period_number integer not null check(period_number between 1 and 100), period_start date not null, period_end date not null,
 allow_exception boolean not null default false, exception_reason text,
 updated_at timestamptz not null default now(), version bigint not null default 1 check(version>0),
 check(period_end>=period_start),
 check(not allow_exception or length(trim(exception_reason))>0 and exception_reason is not null),
 unique(contract_id,period_number), unique(id,contract_id,customer_code,team),
 foreign key(contract_id,customer_code,team) references public.mkt_contracts(id,customer_code,team) on update restrict on delete restrict
);
create table if not exists public.mkt_transactions (
 id text primary key, budget_id text not null, contract_id text not null, customer_code text not null, team text not null,
 legacy_customer_name text, date date not null, category text not null check(length(trim(category)) between 1 and 120),
 description text not null, amount numeric(18,2) not null check(amount>0 and amount<1e16), invoice_ref text,
 created_by uuid references public.mkt_profiles(id), legacy_created_by text, created_at timestamptz not null default now(),
 status text not null default 'ACTIVE' check(status in ('ACTIVE','CANCELLED')),
 cancellation_reason text, cancelled_by uuid references public.mkt_profiles(id), legacy_cancelled_by text, cancelled_at timestamptz,
 check(status='ACTIVE' and cancelled_at is null and cancelled_by is null and cancellation_reason is null
   or status='CANCELLED' and length(trim(cancellation_reason))>0 and cancellation_reason is not null and cancelled_at is not null),
 foreign key(budget_id,contract_id,customer_code,team) references public.mkt_budgets(id,contract_id,customer_code,team) on update restrict on delete restrict
);
create table if not exists public.mkt_activity_logs (
 id text primary key, timestamp timestamptz not null default now(), actor_id uuid references public.mkt_profiles(id),
 legacy_user text, role text not null check(role in ('ADMIN','TEAM_USER')), team text not null check(team='ALL' or team ~ '^B[1-7]$'),
 action text not null, details text not null, operation_id uuid unique
);
create table if not exists public.mkt_settings (
 key text primary key, value jsonb not null, description text, updated_at timestamptz not null default now()
);
create table if not exists public.mkt_categories (
 id text primary key, name_lao text, name_english text not null, code text unique, description text
);
create table if not exists public.mkt_import_batches (
 id uuid primary key default gen_random_uuid(), source_checksum text not null, state text not null check(state in ('STAGED','VALIDATED','IMPORTED','REJECTED')),
 counts jsonb not null default '{}', actor_id uuid references public.mkt_profiles(id), created_at timestamptz not null default now()
);
create table if not exists public.mkt_deleted_customers (
 customer_code text primary key, team text not null check(team ~ '^B[1-7]$'), deleted_at timestamptz not null,
 deleted_by uuid references public.mkt_profiles(id), legacy_deleted_by text, operation_id text, backup_id text
);
create table if not exists public.mkt_legacy_archives (
 id text primary key, source_table text not null, import_batch_id uuid references public.mkt_import_batches(id),
 checksum text not null, redacted_payload jsonb not null, created_at timestamptz not null default now()
);
create table if not exists public.mkt_operation_receipts (
 operation_id uuid primary key, actor_id uuid not null references public.mkt_profiles(id),
 request jsonb not null, result jsonb not null, created_at timestamptz not null default now()
);
create index if not exists mkt_customers_team on public.mkt_customers(team);
create index if not exists mkt_conditions_parent on public.mkt_customer_conditions(customer_code,team);
create index if not exists mkt_contracts_parent on public.mkt_contracts(customer_code,team);
create index if not exists mkt_budgets_parent on public.mkt_budgets(contract_id,customer_code,team);
create index if not exists mkt_transactions_parent on public.mkt_transactions(budget_id,contract_id,customer_code,team);
create index if not exists mkt_transactions_team_date on public.mkt_transactions(team,date);
create index if not exists mkt_activity_team on public.mkt_activity_logs(team,timestamp);
create index if not exists mkt_receipts_actor on public.mkt_operation_receipts(actor_id);

-- Private lookup avoids recursive profile RLS; no JWT role/team/user_metadata trust.
create or replace function mkt_private.can_access(p_team text default null, p_admin boolean default false)
returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.mkt_profiles p join auth.users u on u.id=p.id
  where p.id=auth.uid() and p.is_active and p.status='ACTIVE' and not coalesce(u.is_anonymous,false)
    and (p.role='ADMIN' or (not p_admin and p_team=p.team)))
$$;
revoke all on function mkt_private.can_access(text,boolean) from public,anon,authenticated;
grant execute on function mkt_private.can_access(text,boolean) to authenticated;

-- API roles have SELECT only. EVERY business write goes through checked operations.
do $$ declare t text; begin
 foreach t in array array['mkt_profiles','mkt_customers','mkt_customer_conditions','mkt_contracts','mkt_budgets','mkt_transactions','mkt_activity_logs','mkt_settings','mkt_categories','mkt_import_batches','mkt_deleted_customers','mkt_legacy_archives','mkt_operation_receipts'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from public, anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 execute format('drop policy if exists mkt_read on public.%I',t);
 if t='mkt_profiles' then
 execute format('create policy mkt_read on public.%I for select to authenticated using (mkt_private.can_access(null,true) or (id=auth.uid() and mkt_private.can_access(team,false)))',t);
 elsif t in ('mkt_customers','mkt_customer_conditions','mkt_contracts','mkt_budgets','mkt_transactions','mkt_activity_logs') then
 execute format('create policy mkt_read on public.%I for select to authenticated using (mkt_private.can_access(team,false))',t);
 elsif t='mkt_categories' then
 execute format('create policy mkt_read on public.%I for select to authenticated using (mkt_private.can_access(null,true) or exists(select 1 from public.mkt_profiles p where p.id=auth.uid() and mkt_private.can_access(p.team,false)))',t);
 else
 execute format('create policy mkt_read on public.%I for select to authenticated using (mkt_private.can_access(null,true))',t);
 end if;
 end loop;
end $$;

-- Dates calculated independently from the original commencement, including Feb 29.
create or replace function mkt_private.period_bounds(p_start date,p_end date,p_number integer)
returns table(starts date,ends date) language sql immutable security invoker set search_path = '' as $$
 select (p_start+make_interval(years=>p_number-1))::date,
 least(p_end, (p_start+make_interval(years=>p_number))::date-1)
$$;
revoke all on function mkt_private.period_bounds(date,date,integer) from public,anon,authenticated;

-- Protect relationship/date invariants even for a privileged importer. No direct API writes.
create or replace function mkt_private.validate_period()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare c public.mkt_contracts; s date; e date;
begin
 select * into strict c from public.mkt_contracts where id=new.contract_id;
 select starts,ends into s,e from mkt_private.period_bounds(c.commencing_on,c.expiring_on,new.period_number);
 if new.period_start<>s or new.period_end<>e or s>c.expiring_on then raise exception 'Invalid contract period' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function mkt_private.validate_period() from public,anon,authenticated;
drop trigger if exists mkt_validate_period on public.mkt_budgets;
create trigger mkt_validate_period before insert or update on public.mkt_budgets for each row execute function mkt_private.validate_period();
create or replace function mkt_private.validate_transaction_date()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
 if not exists(select 1 from public.mkt_budgets b where b.id=new.budget_id and new.date between b.period_start and b.period_end) then
 raise exception 'Transaction outside annual period' using errcode='23514'; end if;
 return new;
end $$;
revoke all on function mkt_private.validate_transaction_date() from public,anon,authenticated;
drop trigger if exists mkt_validate_transaction_date on public.mkt_transactions;
create trigger mkt_validate_transaction_date before insert or update on public.mkt_transactions for each row execute function mkt_private.validate_transaction_date();

create or replace view public.mkt_budget_totals with (security_invoker=true) as
 with totals as (
 select b.*, b.unallocated_used+coalesce((select sum(t.amount) from public.mkt_transactions t where t.budget_id=b.id and t.status='ACTIVE'),0) as total_used
 from public.mkt_budgets b
 ), rates as (
 select totals.*, annual_amount-total_used as remaining_amount,
 case when annual_amount>0 then round(total_used/annual_amount*100,1) else 0 end as utilization_percentage from totals
 ) select rates.*, case when total_used>annual_amount then 'EXCEEDED' when utilization_percentage>=100 then 'CRITICAL_100'
 when utilization_percentage>=80 then 'WARNING_80' else 'NORMAL' end as status from rates;
revoke all on public.mkt_budget_totals from public,anon,authenticated;
grant select on public.mkt_budget_totals to authenticated;

-- One transaction: active-profile/session gate, operation lock, relationship locks,
-- optimistic version checks, business mutation, audit, receipt. No dynamic payload SQL.
create or replace function mkt_private.mutate(p_kind text,p_data jsonb,p_operation uuid,p_expected bigint default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
 actor public.mkt_profiles; receipt public.mkt_operation_receipts; c public.mkt_customers;
 ct public.mkt_contracts; b public.mkt_budgets; tx public.mkt_transactions;
 request jsonb; result jsonb; before_data jsonb; target text; scope text;
 s date; e date; used numeric; amount numeric; n integer; allowed text[];
begin
 if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
 select * into actor from public.mkt_profiles where id=auth.uid() for share;
 if not found or not actor.is_active or actor.status<>'ACTIVE' then raise exception 'Inactive profile' using errcode='42501'; end if;
 if not exists(select 1 from auth.users u where u.id=actor.id and not coalesce(u.is_anonymous,false))
 or not exists(select 1 from auth.sessions se where se.user_id=actor.id and se.id::text=auth.jwt()->>'session_id') then
 raise exception 'Session revoked or anonymous' using errcode='42501'; end if;
 if p_operation is null or p_data is null or jsonb_typeof(p_data)<>'object' then raise exception 'Invalid request'; end if;
 if octet_length(p_data::text)>16384 then raise exception 'Payload too large' using errcode='22023'; end if;
 allowed=case p_kind
 when 'CREATE_CUSTOMER' then array['code','name','team','phone','address','province','contact_person']
 when 'EDIT_CUSTOMER' then array['code','name','team','phone','address','province','contact_person']
 when 'DELETE_CUSTOMER' then array['code']
 when 'CREATE_CONTRACT' then array['id','customer_code','team','commencing_on','expiring_on','notes']
 when 'SAVE_CONDITION' then array['id','customer_code','team','condition_quantity','condition_uom','condition_product_description','price_per_unit']
 when 'SAVE_BUDGET' then array['id','customer_code','team','contract_id','period_number','annual_amount','allow_exception','exception_reason']
 when 'ADD_TRANSACTION' then array['id','budget_id','team','contract_id','customer_code','date','category','description','amount','invoice_ref']
 when 'CANCEL_TRANSACTION' then array['id','reason']
 else array[]::text[] end;
 if exists(select 1 from jsonb_object_keys(p_data) k where not k=any(allowed)) then raise exception 'Unknown or server-owned field' using errcode='42501'; end if;
 request=jsonb_build_object('kind',p_kind,'data',p_data,'expected',p_expected);
 perform pg_advisory_xact_lock(hashtextextended(p_operation::text,0));
 select * into receipt from public.mkt_operation_receipts where operation_id=p_operation;
 if found then
 if receipt.actor_id<>actor.id or receipt.request<>request then raise exception 'Operation ID reused' using errcode='22023'; end if;
 return receipt.result;
 end if;
 -- Reject altered client authorization/derived totals rather than silently accepting them.
 if p_data ?| array['role','created_by','total_used','remaining_amount','unallocated_used','utilization_percentage','cancelled_by'] then
 raise exception 'Server-owned field in payload' using errcode='42501'; end if;
 if p_kind in ('CREATE_CUSTOMER','EDIT_CUSTOMER','DELETE_CUSTOMER') then
 target=p_data->>'code';
 perform pg_advisory_xact_lock(hashtextextended('customer:'||coalesce(target,''),0));
 select * into c from public.mkt_customers where code=target for update;
 if p_kind='CREATE_CUSTOMER' then
 if c.code is not null or exists(select 1 from public.mkt_deleted_customers where customer_code=target) then raise exception 'Customer unavailable'; end if;
 scope=p_data->>'team';
 if not mkt_private.can_access(scope,false) then raise exception 'Team denied' using errcode='42501'; end if;
 insert into public.mkt_customers(code,name,team,mde,phone,address,province,contact_person)
 values(target,p_data->>'name',scope,'MDE-'||scope,p_data->>'phone',p_data->>'address',p_data->>'province',p_data->>'contact_person');
 else
 if c.code is null or not mkt_private.can_access(c.team,false) or c.status='DELETED' then raise exception 'Customer unavailable' using errcode='42501'; end if;
 scope=c.team; before_data=to_jsonb(c);
 if p_expected is distinct from c.version then raise exception 'Version conflict' using errcode='PT409'; end if;
 if p_data ? 'team' and (p_data->>'team') is distinct from scope then raise exception 'Team reassignment requires separate migration' using errcode='42501'; end if;
 if p_kind='EDIT_CUSTOMER' then
 update public.mkt_customers set name=coalesce(p_data->>'name',name),phone=coalesce(p_data->>'phone',phone),address=coalesce(p_data->>'address',address),province=coalesce(p_data->>'province',province),contact_person=coalesce(p_data->>'contact_person',contact_person),updated_at=now(),version=version+1 where code=target;
 else
 update public.mkt_customers set status='DELETED',deleted_at=now(),updated_at=now(),version=version+1 where code=target;
 insert into public.mkt_deleted_customers(customer_code,team,deleted_at,deleted_by,operation_id) values(target,scope,now(),actor.id,p_operation::text);
 end if;
 end if;
 elsif p_kind in ('CREATE_CONTRACT','SAVE_CONDITION','SAVE_BUDGET') then
 -- Parent lock serializes cycles and budget creation, including competing IDs.
 select * into c from public.mkt_customers where code=p_data->>'customer_code' for update;
 if not found or c.status='DELETED' or not mkt_private.can_access(c.team,false) then raise exception 'Customer unavailable' using errcode='42501'; end if;
 scope=c.team; target=p_data->>'id';
 if p_data ? 'team' and (p_data->>'team') is distinct from scope then raise exception 'Team mismatch' using errcode='42501'; end if;
 if p_kind='CREATE_CONTRACT' then
 if actor.role<>'ADMIN' then raise exception 'Admin required for contract renewal' using errcode='42501'; end if;
 s=(p_data->>'commencing_on')::date; e=(p_data->>'expiring_on')::date;
 if exists(select 1 from public.mkt_contracts where customer_code=c.code and s<=expiring_on and e>=commencing_on) then raise exception 'Overlapping contract'; end if;
 select coalesce(max(cycle_number),0)+1 into n from public.mkt_contracts where customer_code=c.code;
 insert into public.mkt_contracts(id,customer_code,team,commencing_on,expiring_on,cycle_number,notes) values(target,c.code,scope,s,e,n,p_data->>'notes');
 elsif p_kind='SAVE_CONDITION' then
 if actor.role<>'ADMIN' then raise exception 'Admin required for condition changes' using errcode='42501'; end if;
 if exists(select 1 from public.mkt_customer_conditions where id=target and customer_code<>c.code) then raise exception 'Condition unavailable' using errcode='42501'; end if;
 select to_jsonb(x) into before_data from public.mkt_customer_conditions x where id=target;
 if before_data is not null and p_expected is distinct from (before_data->>'version')::bigint then raise exception 'Version conflict' using errcode='PT409'; end if;
 insert into public.mkt_customer_conditions(id,customer_code,team,condition_quantity,condition_uom,condition_product_description,price_per_unit)
 values(target,c.code,scope,(p_data->>'condition_quantity')::numeric,p_data->>'condition_uom',p_data->>'condition_product_description',(p_data->>'price_per_unit')::numeric)
 on conflict(id) do update set condition_quantity=excluded.condition_quantity,condition_uom=excluded.condition_uom,condition_product_description=excluded.condition_product_description,price_per_unit=excluded.price_per_unit,updated_at=now(),version=mkt_customer_conditions.version+1;
 else
 select * into ct from public.mkt_contracts where id=p_data->>'contract_id' and customer_code=c.code and team=scope for update;
 if not found then raise exception 'Contract mismatch' using errcode='42501'; end if;
 n=(p_data->>'period_number')::integer;
 if n is null or n not between 1 and 100 then raise exception 'Invalid period'; end if;
 select starts,ends into s,e from mkt_private.period_bounds(ct.commencing_on,ct.expiring_on,n);
 select * into b from public.mkt_budgets where contract_id=ct.id and period_number=n for update;
 amount=(p_data->>'annual_amount')::numeric;
 if amount<>round(amount,2) then raise exception 'Money must have <=2 decimal places'; end if;
 if b.id is null then
 if p_expected is not null then raise exception 'Expected new budget' using errcode='PT409'; end if;
 insert into public.mkt_budgets(id,contract_id,customer_code,team,annual_amount,period_number,period_start,period_end)
 values(target,ct.id,c.code,scope,amount,n,s,e);
 else
 if target is distinct from b.id then raise exception 'Budget ID mismatch'; end if;
 if p_expected is distinct from b.version then raise exception 'Version conflict' using errcode='PT409'; end if;
 before_data=to_jsonb(b);
 update public.mkt_budgets set annual_amount=amount,version=version+1,updated_at=now() where id=b.id;
 end if;
 -- Exception approval is deliberately Admin-only and requires a reason.
 if p_data ? 'allow_exception' or p_data ? 'exception_reason' then
 if actor.role<>'ADMIN' then raise exception 'Admin exception approval required' using errcode='42501'; end if;
 update public.mkt_budgets set allow_exception=coalesce((p_data->>'allow_exception')::boolean,false),exception_reason=p_data->>'exception_reason' where id=target;
 end if;
 end if;
 elsif p_kind in ('ADD_TRANSACTION','CANCEL_TRANSACTION') then
 -- Resolve then lock in customer -> budget -> transaction order.
 if p_kind='CANCEL_TRANSACTION' then
 select * into tx from public.mkt_transactions where id=p_data->>'id';
 if not found then raise exception 'Transaction unavailable' using errcode='42501'; end if;
 select * into b from public.mkt_budgets where id=tx.budget_id;
 else
 select * into b from public.mkt_budgets where id=p_data->>'budget_id';
 end if;
 if b.id is null or not mkt_private.can_access(b.team,false) then raise exception 'Budget unavailable' using errcode='42501'; end if;
 select * into c from public.mkt_customers where code=b.customer_code for update;
 if c.status='DELETED' then raise exception 'Deleted customer'; end if;
 select * into b from public.mkt_budgets where id=b.id for update;
 scope=b.team; target=p_data->>'id';
 if p_expected is distinct from b.version then raise exception 'Version conflict' using errcode='PT409'; end if;
 if p_data ? 'team' and (p_data->>'team') is distinct from b.team
 or p_data ? 'contract_id' and (p_data->>'contract_id') is distinct from b.contract_id
 or p_data ? 'customer_code' and (p_data->>'customer_code') is distinct from b.customer_code then raise exception 'Relationship mismatch' using errcode='42501'; end if;
 if p_kind='ADD_TRANSACTION' then
 amount=(p_data->>'amount')::numeric;
 if amount<>round(amount,2) then raise exception 'Money must have <=2 decimal places'; end if;
 select b.unallocated_used+coalesce(sum(t.amount),0) into used from public.mkt_transactions t where t.budget_id=b.id and t.status='ACTIVE';
 if used+amount>b.annual_amount and not b.allow_exception then raise exception 'Annual budget exceeded'; end if;
 insert into public.mkt_transactions(id,budget_id,contract_id,customer_code,team,date,category,description,amount,invoice_ref,created_by)
 values(target,b.id,b.contract_id,b.customer_code,b.team,(p_data->>'date')::date,p_data->>'category',coalesce(p_data->>'description',''),amount,p_data->>'invoice_ref',actor.id);
 else
 select * into tx from public.mkt_transactions where id=target for update;
 if tx.status<>'ACTIVE' then raise exception 'Already cancelled'; end if;
 before_data=to_jsonb(tx);
 update public.mkt_transactions set status='CANCELLED',cancellation_reason=p_data->>'reason',cancelled_by=actor.id,cancelled_at=now() where id=target;
 end if;
 update public.mkt_budgets set version=version+1,updated_at=now() where id=b.id;
 else raise exception 'Unsupported operation' using errcode='22023';
 end if;
 result=jsonb_build_object('id',target,'kind',p_kind,'operation_id',p_operation);
 insert into public.mkt_activity_logs(id,actor_id,role,team,action,details,operation_id)
 values('LOG-'||p_operation,actor.id,actor.role,scope,p_kind,jsonb_build_object('entity_id',target,'before',before_data,'request',p_data)::text,p_operation);
 insert into public.mkt_operation_receipts(operation_id,actor_id,request,result) values(p_operation,actor.id,request,result);
 return result;
end $$;
revoke all on function mkt_private.mutate(text,jsonb,uuid,bigint) from public,anon,authenticated;
grant execute on function mkt_private.mutate(text,jsonb,uuid,bigint) to authenticated;
create or replace function public.mkt_mutate(p_kind text,p_data jsonb,p_operation uuid,p_expected bigint default null)
returns jsonb language sql security invoker set search_path = '' as $$
 select mkt_private.mutate(p_kind,p_data,p_operation,p_expected)
$$;
revoke all on function public.mkt_mutate(text,jsonb,uuid,bigint) from public,anon,authenticated;
grant execute on function public.mkt_mutate(text,jsonb,uuid,bigint) to authenticated;
commit;
