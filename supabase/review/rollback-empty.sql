-- REVIEW ONLY. Empty-schema rollback only; populated databases require backed-up restore.
-- Never a cutover rollback. No CASCADE: unexpected dependencies fail safely.
begin;
do $$ declare t text; n bigint; begin
 foreach t in array array['mkt_profiles','mkt_customers','mkt_customer_conditions','mkt_contracts','mkt_budgets','mkt_transactions','mkt_activity_logs','mkt_settings','mkt_categories','mkt_import_batches','mkt_deleted_customers','mkt_legacy_archives','mkt_operation_receipts'] loop
 execute format('select count(*) from public.%I',t) into n;
 if n<>0 then raise exception 'Refuse populated rollback: %',t; end if;
 end loop;
end $$;
drop function public.mkt_mutate(text,jsonb,uuid,bigint);
drop function mkt_private.mutate(text,jsonb,uuid,bigint);
drop view public.mkt_budget_totals;
drop table public.mkt_operation_receipts;
drop table public.mkt_legacy_archives;
drop table public.mkt_import_batches;
drop table public.mkt_deleted_customers;
drop table public.mkt_activity_logs;
drop table public.mkt_transactions;
drop table public.mkt_budgets;
drop table public.mkt_contracts;
drop table public.mkt_customer_conditions;
drop table public.mkt_customers;
drop table public.mkt_settings;
drop table public.mkt_categories;
drop table public.mkt_profiles;
drop function mkt_private.validate_transaction_date();
drop function mkt_private.validate_period();
drop function mkt_private.period_bounds(date,date,integer);
drop function mkt_private.can_access(text,boolean);
drop schema mkt_private;
commit;
