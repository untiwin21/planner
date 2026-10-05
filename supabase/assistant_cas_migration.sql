-- Large daily histories exceed URL limits when used as a REST equality filter.
-- Send both JSON snapshots in the RPC body; compare and update atomically.
create or replace function public.planner_compare_and_swap_day(
  p_user_id uuid, p_day_id text, p_expected jsonb, p_next jsonb
) returns table(id text)
language sql security invoker set search_path = '' as $$
  update public.day_entries as d set meta = p_next
  where d.user_id = p_user_id and d.id = p_day_id
    and d.meta = p_expected and auth.role() = 'service_role'
  returning d.id;
$$;
revoke all on function public.planner_compare_and_swap_day(uuid,text,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.planner_compare_and_swap_day(uuid,text,jsonb,jsonb) to service_role;
