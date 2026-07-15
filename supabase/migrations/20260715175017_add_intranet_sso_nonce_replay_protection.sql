create schema if not exists security;

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
