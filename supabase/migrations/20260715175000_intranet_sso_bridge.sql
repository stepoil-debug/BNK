-- Ponte SSO Intranet STEP -> Supabase BNK
-- Aplicada no projeto fowqidmmseynoneekrse em 15/07/2026.

create table if not exists security.intranet_sso_nonces (
  nonce_hash text primary key,
  session_hash text,
  email_hash text not null,
  issued_at timestamptz not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table security.intranet_sso_nonces enable row level security;
revoke all on table security.intranet_sso_nonces from public, anon, authenticated;
grant all on table security.intranet_sso_nonces to service_role;

create index if not exists intranet_sso_nonces_expires_at_idx
  on security.intranet_sso_nonces (expires_at);

comment on table security.intranet_sso_nonces is
  'Nonces de uso único para impedir replay na ponte SSO Intranet STEP -> BNK.';

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
