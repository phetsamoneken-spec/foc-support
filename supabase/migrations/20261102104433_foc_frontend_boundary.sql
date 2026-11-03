begin;
-- One statement snapshot: all child rows, derived totals and profile share one MVCC snapshot.
-- Invoker functions retain caller RLS. No service-role access in the client.
create or replace function public.mkt_snapshot()
returns jsonb language sql stable security invoker set search_path = '' as $$
 select jsonb_build_object(
  'profile',(select to_jsonb(p) from public.mkt_profiles p where id=auth.uid()),
  'users',coalesce((select jsonb_agg(to_jsonb(p) order by id) from public.mkt_profiles p),'[]'::jsonb),
  'customers',coalesce((select jsonb_agg(to_jsonb(c) order by code) from public.mkt_customers c),'[]'::jsonb),
  'conditions',coalesce((select jsonb_agg(to_jsonb(c) order by id) from public.mkt_customer_conditions c),'[]'::jsonb),
  'contracts',coalesce((select jsonb_agg(to_jsonb(c) order by id) from public.mkt_contracts c),'[]'::jsonb),
  'budgets',coalesce((select jsonb_agg(to_jsonb(b)||jsonb_build_object('annual_amount',b.annual_amount::text,'unallocated_used',b.unallocated_used::text,'total_used',b.total_used::text,'remaining_amount',b.remaining_amount::text) order by id) from public.mkt_budget_totals b),'[]'::jsonb),
  'transactions',coalesce((select jsonb_agg(to_jsonb(t)||jsonb_build_object('amount',t.amount::text) order by id) from public.mkt_transactions t),'[]'::jsonb),
  'logs',coalesce((select jsonb_agg(to_jsonb(l) order by timestamp desc,id) from (select * from public.mkt_activity_logs order by timestamp desc,id limit 150) l),'[]'::jsonb)
 )
$$;
revoke all on function public.mkt_snapshot() from public,anon,authenticated;
grant execute on function public.mkt_snapshot() to authenticated;

-- Bundles existing checked operations in one transaction, e.g. customer + condition
-- + contract + first budget. A late failure rolls back every operation and receipt.
-- Retries retain the exact individual operation IDs, expected versions and payloads.
create or replace function public.mkt_batch(p_operations jsonb)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare item jsonb; result jsonb='[]'::jsonb;
begin
 if jsonb_typeof(p_operations)<>'array' or p_operations is null then raise exception 'Expected operation array' using errcode='22023'; end if;
 if jsonb_array_length(p_operations) not between 1 and 16 or octet_length(p_operations::text)>262144 then raise exception 'Invalid batch size' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(p_operations) loop
  if jsonb_typeof(item)<>'object' or exists(select 1 from jsonb_object_keys(item) k where k not in ('p_kind','p_data','p_operation','p_expected')) then raise exception 'Invalid batch operation' using errcode='22023'; end if;
  result=result||jsonb_build_array(public.mkt_mutate(item->>'p_kind',item->'p_data',(item->>'p_operation')::uuid,(item->>'p_expected')::bigint));
 end loop;
 return result;
end $$;
revoke all on function public.mkt_batch(jsonb) from public,anon,authenticated;
grant execute on function public.mkt_batch(jsonb) to authenticated;
notify pgrst,'reload schema';
commit;

