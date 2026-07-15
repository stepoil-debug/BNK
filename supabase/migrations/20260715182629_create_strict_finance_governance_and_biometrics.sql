-- Governança rígida do módulo financeiro e armazenamento biométrico isolado no BNK.

create schema if not exists security;
revoke all on schema security from public, anon, authenticated;
grant usage on schema security to service_role;

create table if not exists security.finance_governance (
  id smallint primary key default 1 check (id = 1),
  owner_corporate_email text not null,
  owner_intranet_user_id uuid,
  owner_finance_user_id uuid not null references auth.users(id) on delete restrict,
  master_corporate_email text,
  master_intranet_user_id uuid,
  master_finance_user_id uuid references auth.users(id) on delete set null,
  owner_assigned_at timestamptz not null default now(),
  master_assigned_at timestamptz,
  master_assigned_by uuid references auth.users(id) on delete set null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now(),
  constraint finance_governance_owner_email_normalized
    check (owner_corporate_email = lower(trim(owner_corporate_email))),
  constraint finance_governance_master_email_normalized
    check (master_corporate_email is null or master_corporate_email = lower(trim(master_corporate_email))),
  constraint finance_governance_distinct_users
    check (master_finance_user_id is null or master_finance_user_id <> owner_finance_user_id)
);

create table if not exists security.finance_access_grants (
  id uuid primary key default gen_random_uuid(),
  intranet_user_id uuid unique,
  corporate_email text not null unique,
  finance_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text,
  role text not null check (role in ('owner','master_admin','editor','viewer','auditor')),
  status text not null default 'pending_face'
    check (status in ('pending_face','active','blocked','revoked')),
  biometric_required boolean not null default true,
  granted_by_finance_user_id uuid references auth.users(id) on delete set null,
  grant_reason text,
  granted_at timestamptz not null default now(),
  activated_at timestamptz,
  blocked_at timestamptz,
  revoked_at timestamptz,
  expires_at timestamptz,
  last_access_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_access_email_normalized
    check (corporate_email = lower(trim(corporate_email)))
);

create unique index if not exists finance_access_single_owner_idx
  on security.finance_access_grants ((role))
  where role = 'owner' and status <> 'revoked';

create unique index if not exists finance_access_single_master_idx
  on security.finance_access_grants ((role))
  where role = 'master_admin' and status <> 'revoked';

create index if not exists finance_access_status_role_idx
  on security.finance_access_grants (status, role);

create table if not exists security.finance_biometric_enrollments (
  id uuid primary key default gen_random_uuid(),
  access_grant_id uuid not null unique
    references security.finance_access_grants(id) on delete cascade,
  finance_user_id uuid not null unique references auth.users(id) on delete cascade,
  intranet_user_id uuid,
  corporate_email text not null,
  status text not null default 'required'
    check (status in ('required','capturing','active','recapture_required','blocked','revoked')),
  consent_version text,
  consented_at timestamptz,
  model_provider text,
  model_version text,
  descriptor_ciphertext text,
  descriptor_iv text,
  descriptor_algorithm text,
  descriptor_dimensions integer,
  quality_score numeric,
  liveness_method text,
  enrolled_at timestamptz,
  last_verified_at timestamptz,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  locked_until timestamptz,
  revoked_at timestamptz,
  revoked_by_finance_user_id uuid references auth.users(id) on delete set null,
  revocation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_biometric_email_normalized
    check (corporate_email = lower(trim(corporate_email)))
);

create table if not exists security.finance_biometric_samples (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
    references security.finance_biometric_enrollments(id) on delete cascade,
  pose text not null check (pose in ('center','left','right','blink')),
  storage_path text not null unique,
  content_hash text not null,
  mime_type text not null check (mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 5242880),
  width integer,
  height integer,
  quality_score numeric,
  captured_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (enrollment_id, pose)
);

create table if not exists security.finance_biometric_sessions (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null
    references security.finance_biometric_enrollments(id) on delete cascade,
  finance_user_id uuid not null references auth.users(id) on delete cascade,
  purpose text not null check (purpose in ('enrollment','verification','recapture')),
  challenge jsonb not null default '{}'::jsonb,
  status text not null default 'created'
    check (status in ('created','started','approved','rejected','expired','error')),
  liveness_result text,
  face_match_result text,
  confidence_score numeric,
  distance_score numeric,
  provider_payload jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists finance_biometric_sessions_user_created_idx
  on security.finance_biometric_sessions (finance_user_id, created_at desc);

create table if not exists security.finance_access_audit (
  id uuid primary key default gen_random_uuid(),
  event_type text not null,
  actor_finance_user_id uuid,
  actor_intranet_user_id uuid,
  target_finance_user_id uuid,
  target_intranet_user_id uuid,
  target_corporate_email text,
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists finance_access_audit_created_idx
  on security.finance_access_audit (created_at desc);
create index if not exists finance_access_audit_target_idx
  on security.finance_access_audit (target_finance_user_id, created_at desc);

create or replace function security.block_finance_audit_mutation()
returns trigger
language plpgsql
set search_path = security, pg_temp
as $$
begin
  raise exception 'finance_access_audit is immutable';
end;
$$;

drop trigger if exists finance_access_audit_immutable on security.finance_access_audit;
create trigger finance_access_audit_immutable
before update or delete on security.finance_access_audit
for each row execute function security.block_finance_audit_mutation();

revoke all on all tables in schema security from public, anon, authenticated;
grant all on all tables in schema security to service_role;
revoke all on all sequences in schema security from public, anon, authenticated;
grant all on all sequences in schema security to service_role;

-- Proprietário inicial. O UUID principal da Intranet é vinculado no primeiro lançamento SSO.
insert into security.finance_access_grants (
  corporate_email,
  finance_user_id,
  full_name,
  role,
  status,
  biometric_required,
  granted_by_finance_user_id,
  grant_reason
)
select
  'douglas.tabella@step-og.com',
  p.id,
  p.full_name,
  'owner',
  'pending_face',
  true,
  p.id,
  'Proprietário inicial definido pelo titular do projeto'
from public.profiles p
where lower(p.email) = 'douglasnoticias@gmail.com'
on conflict (corporate_email) do update
set finance_user_id = excluded.finance_user_id,
    full_name = excluded.full_name,
    role = 'owner',
    status = case
      when security.finance_access_grants.status = 'active' then 'active'
      else 'pending_face'
    end,
    biometric_required = true,
    updated_at = now();

insert into security.finance_governance (
  id,
  owner_corporate_email,
  owner_finance_user_id
)
select 1, 'douglas.tabella@step-og.com', p.id
from public.profiles p
where lower(p.email) = 'douglasnoticias@gmail.com'
on conflict (id) do update
set owner_corporate_email = excluded.owner_corporate_email,
    owner_finance_user_id = excluded.owner_finance_user_id,
    updated_at = now(),
    revision = security.finance_governance.revision + 1;

insert into security.finance_biometric_enrollments (
  access_grant_id,
  finance_user_id,
  intranet_user_id,
  corporate_email,
  status
)
select id, finance_user_id, intranet_user_id, corporate_email, 'required'
from security.finance_access_grants
where role = 'owner'
on conflict (access_grant_id) do nothing;
