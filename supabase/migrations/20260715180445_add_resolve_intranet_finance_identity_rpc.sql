create or replace function public.resolve_intranet_finance_identity(p_corporate_email text)
returns jsonb
language sql
stable
security definer
set search_path = security, pg_temp
as $$
  select jsonb_build_object(
    'finance_user_id', finance_user_id,
    'status', status
  )
  from security.intranet_identity_links
  where corporate_email = lower(trim(p_corporate_email))
  limit 1;
$$;

revoke all on function public.resolve_intranet_finance_identity(text)
from public, anon, authenticated;
grant execute on function public.resolve_intranet_finance_identity(text)
to service_role;
