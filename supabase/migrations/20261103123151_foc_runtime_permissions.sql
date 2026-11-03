-- Trigger helpers execute as the invoking server role.
grant execute on function mkt_private.period_bounds(date,date,integer) to service_role;
create index auth_imports_auth on mkt_private.auth_imports(auth_id);
create index mkt_activity_actor on public.mkt_activity_logs(actor_id);
create index mkt_deleted_actor on public.mkt_deleted_customers(deleted_by);
create index mkt_import_actor on public.mkt_import_batches(actor_id);
create index mkt_archives_batch on public.mkt_legacy_archives(import_batch_id);
create index mkt_transactions_creator on public.mkt_transactions(created_by);
create index mkt_transactions_canceller on public.mkt_transactions(cancelled_by);
alter policy mkt_read on public.mkt_profiles using (mkt_private.can_access(null,true) or (id=(select auth.uid()) and mkt_private.can_access(team,false)));
alter policy mkt_read on public.mkt_categories using (mkt_private.can_access(null,true) or exists(select 1 from public.mkt_profiles p where p.id=(select auth.uid()) and mkt_private.can_access(p.team,false)));
drop policy mkt_shared_settings_read on public.mkt_settings;
alter policy mkt_read on public.mkt_settings using(mkt_private.can_access(null,true) or key=any(array['currencyCode','currencySymbol','currencyPosition','pricePerCrate','contractAlertDays','warningThresholdPercent','language','dashboardTheme']) and exists(select 1 from public.mkt_profiles p where p.id=(select auth.uid()) and mkt_private.can_access(p.team,false)));
