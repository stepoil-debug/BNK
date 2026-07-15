create or replace function public.finance_touch_access(p_finance_user_id uuid)
returns void
language sql
security definer
set search_path = security, public, pg_temp
as $$
  update security.finance_access_grants
  set last_access_at = now(), updated_at = now()
  where finance_user_id = p_finance_user_id;
$$;

revoke all on function public.finance_touch_access(uuid)
from public, anon, authenticated;
grant execute on function public.finance_touch_access(uuid)
to service_role;
