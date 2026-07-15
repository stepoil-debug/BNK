create table if not exists security.intranet_identity_links (
  corporate_email text primary key,
  finance_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intranet_identity_links_email_normalized
    check (corporate_email = lower(trim(corporate_email)))
);

alter table security.intranet_identity_links enable row level security;
revoke all on table security.intranet_identity_links from public, anon, authenticated;
grant all on table security.intranet_identity_links to service_role;

create index if not exists intranet_identity_links_status_idx
  on security.intranet_identity_links (status);

comment on table security.intranet_identity_links is
  'Vincula o e-mail corporativo autenticado pela Intranet ao usuário separado do Supabase financeiro.';
