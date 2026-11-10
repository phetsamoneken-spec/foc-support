-- Private employee portraits only. Existing business tables, policies and APIs are unchanged.
-- Each active employee can manage their own image; active Admin can manage employees.
-- Existing can_access also verifies the live session and excludes disabled accounts.
begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-portraits', 'employee-portraits', false, 262144, array['image/jpeg']);

create policy employee_portraits_select on storage.objects for select to authenticated
using (
  bucket_id = 'employee-portraits'
  and exists (
    select 1 from public.mkt_profiles actor
    where actor.id = (select auth.uid())
      and mkt_private.can_access(actor.team, false)
      and exists (
        select 1 from public.mkt_profiles employee
        where name = employee.legacy_id || '/profile.jpg'
          and employee.status <> 'DELETED'
          and (actor.role = 'ADMIN' or actor.id = employee.id)
      )
  )
);

create policy employee_portraits_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'employee-portraits'
  and exists (
    select 1 from public.mkt_profiles actor
    where actor.id = (select auth.uid())
      and mkt_private.can_access(actor.team, false)
      and exists (
        select 1 from public.mkt_profiles employee
        where name = employee.legacy_id || '/profile.jpg'
          and employee.status <> 'DELETED'
          and (actor.role = 'ADMIN' or actor.id = employee.id)
      )
  )
);

create policy employee_portraits_update on storage.objects for update to authenticated
using (
  bucket_id = 'employee-portraits'
  and exists (
    select 1 from public.mkt_profiles actor
    where actor.id = (select auth.uid())
      and mkt_private.can_access(actor.team, false)
      and exists (
        select 1 from public.mkt_profiles employee
        where name = employee.legacy_id || '/profile.jpg'
          and employee.status <> 'DELETED'
          and (actor.role = 'ADMIN' or actor.id = employee.id)
      )
  )
)
with check (
  bucket_id = 'employee-portraits'
  and exists (
    select 1 from public.mkt_profiles actor
    where actor.id = (select auth.uid())
      and mkt_private.can_access(actor.team, false)
      and exists (
        select 1 from public.mkt_profiles employee
        where name = employee.legacy_id || '/profile.jpg'
          and employee.status <> 'DELETED'
          and (actor.role = 'ADMIN' or actor.id = employee.id)
      )
  )
);

create policy employee_portraits_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'employee-portraits'
  and exists (
    select 1 from public.mkt_profiles actor
    where actor.id = (select auth.uid())
      and mkt_private.can_access(actor.team, false)
      and exists (
        select 1 from public.mkt_profiles employee
        where name = employee.legacy_id || '/profile.jpg'
          and employee.status <> 'DELETED'
          and (actor.role = 'ADMIN' or actor.id = employee.id)
      )
  )
);

commit;
