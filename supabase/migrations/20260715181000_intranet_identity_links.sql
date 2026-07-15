-- Vínculo entre identidade corporativa da Intranet e usuário separado do BNK.

create table if not exists security.intranet_identity_links (
  corporate_email text primary key,
  finance_user_id uuid not null unique references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'blocked', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint intranet_identity_links_email_normalized check (corporate_email = lower(trim(corporate_email)))
);

alter table security.intranet_identity_links enable row level security;
revoke all on table security.intranet_identity_links from public, anon, authenticated;
grant all on table security.intranet_identity_links to service_role;

create index if not exists intranet_identity_links_status_idx
  on security.intranet_identity_links (status);

comment on table security.intranet_identity_links is
  'Vincula o e-mail corporativo autenticado pela Intranet ao usuário separado do Supabase financeiro.';

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
