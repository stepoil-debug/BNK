create or replace function public.consume_intranet_sso_nonce(
  p_nonce_hash text,
  p_session_hash text,
  p_email_hash text,
  p_issued_at timestamptz,
  p_expires_at timestamptz
)
returns boolean
language plpgsql
security definer
set search_path = security, pg_temp
as $$
declare
  inserted_count integer;
begin
  delete from security.intranet_sso_nonces
  where expires_at < now() - interval '5 minutes';

  insert into security.intranet_sso_nonces (
    nonce_hash,
    session_hash,
    email_hash,
    issued_at,
    expires_at
  ) values (
    p_nonce_hash,
    nullif(p_session_hash, ''),
    p_email_hash,
    p_issued_at,
    p_expires_at
  )
  on conflict (nonce_hash) do nothing;

  get diagnostics inserted_count = row_count;
  return inserted_count = 1;
end;
$$;

revoke all on function public.consume_intranet_sso_nonce(text, text, text, timestamptz, timestamptz)
from public, anon, authenticated;
grant execute on function public.consume_intranet_sso_nonce(text, text, text, timestamptz, timestamptz)
to service_role;
